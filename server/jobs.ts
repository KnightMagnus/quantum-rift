export interface JobOperations {
  offers(this: JobCapabilities, stellarBody: StellarBody, playerData: PlayerData): Mission[];
  accept(this: JobCapabilities, session: Session, missionId: string): void;
  completeOnLanding(
    this: JobCapabilities,
    session: Session,
    stellarBody: StellarBody,
    remote?: Mission,
  ): void;
  completeRemoteQuest(this: JobCapabilities, session: Session, mission: Mission): boolean;
}
import type { Game } from './game.ts';
export type Session = import('./game.ts').Session;
export type PlayerData = import('./game.ts').PlayerData;
export type StellarBody = import('./game.ts').StellarBody;
export type Mission = import('./game.ts').Mission;
export type JobCapabilities = Pick<
  Game,
  | 'A'
  | 'db'
  | 'features'
  | 'holdUsed'
  | 'landed'
  | 'log'
  | 'offers'
  | 'send'
  | 'toast'
  | 'tut'
  | 'you'
>;
export type JobService = Pick<
  Game,
  'offers' | 'accept' | 'completeOnLanding' | 'completeRemoteQuest'
>;

import {
  signedXorshift32 as randomGenerator,
  fnv1a as hash,
} from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { storySystemVisible } from '../shared/story-world.ts';
import { bindOperations } from './feature-service.ts';
import {
  SYSTEMS,
  SYS as systemsById,
  STELLARS,
  COMMODITIES,
  TRAFFIC,
  MATERIALS,
  GRADES,
} from '../shared/galaxy.ts';
import { credits } from '../shared/rules.ts';
import { hullCombatPower } from '../shared/hostile.ts';
import { eventideOffers } from '../shared/eventide.ts';
import { clampStanding } from '../shared/reputation.ts';
import { applyTake, planTake } from '../shared/cargo-lots.ts';
import { destType } from './syndicate.ts';
import { freightOffers } from './freight-offers.ts';
import { grantRadio, radioTourOffer, advanceRadioTour } from './radio-discovery.ts';

/**
 * Ordinary job board, acceptance and landing-completion owner. Feature-specific
 * stories, team contracts, mining orders and progression retain their owners.
 * Live capabilities do not copy/save a second account state. Legacy operation
 * bodies remain unchecked; these types do not validate incoming wire data.

 */

/**
 * @param capabilities Live core functions/state, not Game.
 */
export function createJobService(capabilities: JobCapabilities): JobService {
  return bindOperations(JobOperations, capabilities);
}

const BOUNTY_NAMES = [
  'Vask',
  'Oru',
  'Sable',
  'Kettle',
  'Marrow',
  'Jask',
  'Thorne',
  'Cinder',
  'Wren',
  'Grail',
  'Hollis',
  'Vey',
  'Rook',
  'Ash',
  'Quill',
  'Drey',
];

const galaxyGraph = new GalaxyGraph(systemsById);

const JUMP_DISTANCES = Object.fromEntries(
  SYSTEMS.map((system) => [
    system.id,
    galaxyGraph.distances(system.id, { canEnter: (id) => storySystemVisible(undefined, id) }),
  ]),
);

// Encounter salvage is sold by its discoverer, never supplied as ordinary freight.
const FREIGHT_COMMODITIES = COMMODITIES.filter(
  (commodity) =>
    !['nhal_bone', 'nhal_ichor', 'nhal_eye', 'index_core', 'index_parts'].includes(commodity.id),
);

const JobOperations: JobOperations = {
  /**
   * Generates procedural job board mission offers for a stellar port.
   * @param stellarBody Stellar port.
   * @param playerData Player data.
   * @returns Available job board missions.
   */
  offers(this: JobCapabilities, stellarBody: StellarBody, playerData: PlayerData) {
    const flags = playerData.story?.flags;
    if (!stellarBody.svc.includes('B') || !storySystemVisible(flags, stellarBody.system)) return [];
    const offerWindow = Math.floor(Date.now() / 600000),
      random = randomGenerator(hash(stellarBody.id + offerWindow)),
      offers: Mission[] = [],
      originSystemId = stellarBody.system;
    const distances =
      flags?.main_ending === 'table' || flags?.founding_vigil
        ? galaxyGraph.distances(originSystemId, { canEnter: (id) => storySystemVisible(flags, id) })
        : JUMP_DISTANCES[originSystemId];
    const nearbySystems = Object.entries(distances).filter(
      ([systemId, jumpCount]) =>
        jumpCount >= 1 &&
        jumpCount <= 4 &&
        systemsById[systemId].stellars.some((candidatePort) => candidatePort.svc!.includes('L')) &&
        systemsById[systemId].faction !== 'umbral',
    );
    const usedNames = new Set();
    const captainPower = this.features.hostile.myPower(playerData);
    for (let index = 0; index < 5 && nearbySystems.length; index++) {
      const roll = random(),
        [destinationSystemId, jumps] = nearbySystems[Math.floor(random() * nearbySystems.length)],
        destinationSystem = systemsById[destinationSystemId];
      const offerId = `${stellarBody.id}-${offerWindow}-${index}`;
      if (roll < 0.65) {
        const landingPorts = destinationSystem.stellars.filter(
            (candidatePort) => candidatePort.svc!.includes('L') && !candidatePort.site,
          ),
          destinationPort = landingPorts[Math.floor(random() * landingPorts.length)]; // never to an empty derelict hull
        if (!destinationPort) continue;
        const commodity = FREIGHT_COMMODITIES[Math.floor(random() * FREIGHT_COMMODITIES.length)],
          cargoTonnes = 5 + Math.floor(random() * 26);
        offers.push({
          id: offerId,
          type: 'cargo',
          title: `Deliver ${cargoTonnes} tons of ${commodity.name}`,
          sys: destinationSystemId,
          dest: destinationPort.id,
          cid: commodity.id,
          qty: cargoTonnes,
          reward: Math.round((800 + jumps * 1100 + cargoTonnes * 60) * 1.35), // cargo runs pay better
          text: `The sender supplies the shipment. Carry ${cargoTonnes} tons of ${commodity.name.toLowerCase()} to ${destinationPort.name} in the ${destinationSystem.name} system (${jumps} jump${jumps > 1 ? 's' : ''}). No commodity purchase needed.`,
        });
      } else if (roll < 0.8) {
        const factionId =
            destinationSystem.danger >= 3 || random() < 0.6 || destinationSystem.farside
              ? 'hollow'
              : 'umbral',
          eligibleHulls = TRAFFIC[factionId].war.filter(
            (hullId) => hullCombatPower(this.A, hullId) <= captainPower * 0.75,
          ),
          hull = eligibleHulls[Math.floor(random() * eligibleHulls.length)],
          hullDefinition = this.A.ships[hull];
        if (!hullDefinition) continue;
        let nameIndex = Math.floor(random() * BOUNTY_NAMES.length);
        while (usedNames.has(nameIndex)) nameIndex = (nameIndex + 1) % BOUNTY_NAMES.length;
        usedNames.add(nameIndex);
        const targetName =
          (factionId === 'hollow' ? 'Hollow captain ' : 'Umbral hunter ') + BOUNTY_NAMES[nameIndex];
        offers.push({
          id: offerId,
          type: 'bounty',
          title: `Bounty: ${targetName}`,
          sys: destinationSystemId,
          hull,
          faction: factionId,
          targetName: targetName,
          reward: Math.round(
            Math.max(4000 + hullCombatPower(this.A, hull) * 80, (hullDefinition.cost || 0) * 0.025),
          ),
          text: `${targetName} has been raiding the lanes in a ${hullDefinition.name}. Find and destroy them in the ${destinationSystem.name} system.`,
        });
      } else {
        const requiredKills = 2 + Math.floor(random() * 3);
        offers.push({
          id: offerId,
          type: 'patrol',
          title: `Patrol ${destinationSystem.name}`,
          sys: destinationSystemId,
          need: requiredKills,
          got: 0,
          reward: Math.round(3000 + requiredKills * 1800 + destinationSystem.danger * 1500),
          text: `Destroy ${requiredKills} pirate or hostile ships in the ${destinationSystem.name} system, then land anywhere to be paid.`,
        });
      }
    }
    offers.push(...eventideOffers(stellarBody, playerData, offerWindow));
    offers.push(
      ...this.features.fronts.moreOffers(
        stellarBody,
        playerData,
        random,
        nearbySystems,
        offerWindow,
      ),
    );
    offers.push(
      ...this.features.coop.coopOffers(stellarBody, playerData, random, nearbySystems, offerWindow),
    ); // Armada contracts (online games)
    {
      const mission = this.features.arcs.expeditionOffer(stellarBody, playerData);
      if (mission) offers.push(mission);
    } // 1.2 Farside expeditions
    offers.unshift(
      ...this.features.living.stateOffers(
        stellarBody,
        playerData,
        random,
        nearbySystems,
        offerWindow,
      ),
    ); // jobs posted by troubled systems nearby
    offers.push(
      ...this.features.syndicate.extraOffers(
        stellarBody,
        playerData,
        random,
        nearbySystems,
        offerWindow,
        (starSystem) => {
          const landingPorts = systemsById[starSystem!].stellars.filter(
            (candidatePort) => candidatePort.svc!.includes('L') && !candidatePort.site,
          );
          return landingPorts.length
            ? landingPorts[Math.floor(random() * landingPorts.length)]
            : null;
        },
      ),
    ); // 1.2
    // 1.1 combat rating: Wanted contracts need Competent; bounties pay more as your rank rises; Dangerous captains get elite contracts
    const rank = this.features.fleetcmd.rankOf(playerData).i;
    for (const offer of offers)
      if (offer.type === 'bounty' || offer.type === 'assassinate')
        offer.reward = Math.round(offer.reward * (1 + 0.06 * rank));
    if (rank >= 5 && nearbySystems.length && stellarBody.id !== 'qstation') {
      const [starSystem] = nearbySystems[Math.floor(random() * nearbySystems.length)],
        destinationSystem = systemsById[starSystem],
        eliteHullIds = [...TRAFFIC.umbral.war, ...TRAFFIC.hollow.war]
          .filter(
            (hullId) =>
              this.A.ships[hullId] && hullCombatPower(this.A, hullId) <= captainPower * 1.25,
          )
          .sort(
            (leftHullId, rightHullId) =>
              (this.A.ships[rightHullId].strength || 0) - (this.A.ships[leftHullId].strength || 0),
          );
      const hull = eliteHullIds[Math.floor(random() * Math.min(2, eliteHullIds.length))],
        hullDefinition = this.A.ships[hull],
        targetName =
          'the ' +
          ['Ashen Admiral', 'Red Widow', 'Quiet Knife', 'Last Lantern'][Math.floor(random() * 4)];
      if (hullDefinition)
        offers.push({
          id: `${stellarBody.id}-${offerWindow}-elite`,
          type: 'bounty',
          elite: true,
          title: `ELITE CONTRACT: ${targetName}`,
          sys: starSystem,
          hull,
          faction: TRAFFIC.umbral.war.includes(hull) ? 'umbral' : 'hollow',
          targetName: targetName,
          reward: Math.round(45000 + (hullDefinition.strength || 200) * 160),
          text: `Only captains rated Dangerous or better are offered this one. ${targetName} flies a ${hullDefinition.name} out of ${destinationSystem.name}. The Concord wants it gone.`,
        });
    }
    offers.push(...freightOffers(stellarBody, offerWindow));
    const radioTour = radioTourOffer(stellarBody, playerData);
    if (radioTour) offers.unshift(radioTour);
    offers.unshift(...this.features.quests.questOffers(stellarBody, playerData)); // contacts and side stories lead the board
    return offers
      .filter(
        (offer) =>
          !playerData.missions.some((acceptedMission) => acceptedMission.id === offer.id) &&
          !(destType(offer) && offer.dest === stellarBody.id) &&
          !(offer.type === 'assassinate' && rank < 3) &&
          (!offer.sys || storySystemVisible(flags, offer.sys)) &&
          (!offer.dest ||
            !STELLARS[offer.dest] ||
            storySystemVisible(flags, STELLARS[offer.dest].system)),
      )
      .map((offer) => ({ ...offer, offerVersion: 1 }));
  },
  /**
   * Accepts a mission from the local stellar job board.
   * @param session Player session.
   * @param missionId Mission ID to accept.
   * *
   */
  accept(this: JobCapabilities, session: Session, missionId: string) {
    const playerData = session.data,
      port = STELLARS[playerData.stellar!];
    if (!port) return;
    if (playerData.missions.length >= 6) return this.toast(session, 'You already have six jobs.');
    const mission = this.offers(port, playerData).find((offer) => offer.id === missionId);
    if (!mission) {
      this.toast(
        session,
        'That offer has expired or is no longer available. The job board has been refreshed.',
      );
      this.landed(session);
      return;
    }
    if (mission.type === 'quest') return this.features.quests.questStart(session, mission); // 2.4
    if (mission.type === 'warband') return this.features.coop.warbandAccept(session, mission); // Armada contracts go to the whole Armada
    if (mission.type === 'cargo' || mission.type === 'smuggle') {
      const shipStats = this.features.shipStats!.stats(playerData),
        usedHold = this.holdUsed(playerData);
      if (usedHold + mission.qty! > shipStats!.cargo)
        return this.toast(session, 'Not enough cargo space for that job.');
    }
    if (!this.features.syndicate.acceptCheck(session, mission)) return;
    playerData.missions.push({
      ...mission,
      owner: session.id,
      taken: Date.now(),
      ...(mission.rush ? { deadline: Date.now() + mission.rush * 60000 } : {}),
    });
    this.log(playerData, `Accepted: ${mission.title}.`);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  completeRemoteQuest(this: JobCapabilities, session: Session, mission: Mission) {
    const data = session.data;
    const quest = mission.quest && data.quests?.active[mission.quest.qid];
    if (
      !quest ||
      !session.ent ||
      session.ent.dead ||
      !mission.done ||
      mission.paid ||
      !data.missions.includes(mission) ||
      quest.step !== mission.quest!.step ||
      mission.sys !== data.sys ||
      !remoteQuestStep(quest.side, quest.step, mission.type)
    )
      return false;
    const origin = STELLARS[quest.at];
    if (!origin) return false;
    JobOperations.completeOnLanding.call(this, session, origin, mission);
    this.db.touch();
    return !!mission.paid;
  },
  /**
   * Evaluates active missions upon landing, paying rewards and logging completions.
   * @param session Player session landing.
   * @param stellarBody Landed stellar port.
   * *
   */
  completeOnLanding(
    this: JobCapabilities,
    session: Session,
    stellarBody: StellarBody,
    remote?: Mission,
  ) {
    const playerData = session.data;
    if (!remote) playerData.lastStellar = stellarBody.id;
    const pending = remote ? [remote] : [...playerData.missions];
    const transitionLimit =
      pending.length +
      Object.values(playerData.quests?.active || {}).reduce(
        (remaining, quest) => remaining + Math.max(0, quest.steps.length - quest.step),
        0,
      );
    for (let index = 0; index < pending.length && index < transitionLimit; index++) {
      const mission = pending[index];
      if (mission.type === 'miningOrder' || mission.paid) continue;
      if (mission.type === 'passenger' && mission.pickup && !mission.boarded) {
        if (mission.pickup === stellarBody.id) {
          mission.boarded = true;
          this.toast(session, `${mission.title}: passengers boarded. Continue to the destination.`);
        }
        continue;
      }
      if (mission.radioTour && advanceRadioTour(this, session, mission, stellarBody)) continue;
      if (
        mission.type === 'supply' &&
        mission.dest === stellarBody.id &&
        !this.features.living.supplyReady(playerData, mission)
      ) {
        this.toast(
          session,
          `${mission.title}: you need ${mission.qty} t of ${mission.cid} in your hold.`,
        );
        continue;
      }
      if (
        (destType(mission) && mission.dest === stellarBody.id) ||
        (!destType(mission) && mission.done)
      ) {
        if (mission.type === 'supply') {
          applyTake(
            playerData.cargo,
            playerData.cargoLots,
            planTake(playerData.cargo, playerData.cargoLots, mission.cid!, mission.qty!),
          );
          this.features.living.stateProgress(
            session,
            stellarBody.system,
            'cid:' + mission.cid,
            mission.qty!,
          );
        } // your goods are unloaded
        if (mission.type === 'smuggle')
          this.features.syndicate.synGain(session, mission.syn ? 'contract' : 'smuggle');
        if (mission.syn === 'hit') this.features.syndicate.synGain(session, 'hit'); // 1.2
        this.features.fronts.jobDone(session, mission, stellarBody);
        if (mission.exp) this.features.arcs.expeditionNext(session, mission);
        this.features.frontier.mastery(session, 15);
        this.features.specialists.specOnJob(session, mission);
        this.tut(session, 'job');
        if (
          (mission.type === 'bounty' || mission.type === 'assassinate') &&
          this.features.specialists.flying(playerData, 'vanguard')
        ) {
          const vanguardBonus = Math.round(
            mission.reward * 0.5 * this.features.specialists.power(playerData),
          );
          playerData.credits += vanguardBonus;
          this.toast(session, `Vanguard bonus: +${credits(vanguardBonus)} credits.`);
        }
        playerData.credits += mission.reward;
        playerData.stats.earned += mission.reward;
        mission.paid = true;
        if (mission.radioTour) {
          grantRadio(this, session, 'super-idol');
          this.send(session, {
            t: 'story',
            tag: 'SPACEPOP TOUR COMPLETE',
            title: 'An album for the road',
            done: true,
            text: 'Lyra, Miri and Solenne hand you a digital copy of their album. "For our favourite captain. Keep us on the radio." Super-Idol Radio has been added to your console.',
          });
        }
        if (mission.syn !== 'hit')
          playerData.rep[systemsById[stellarBody.system].faction] = clampStanding(
            (playerData.rep[systemsById[stellarBody.system].faction] || 0) + 2,
          );
        if (Math.random() < 0.35) {
          const materialId = MATERIALS[Math.floor(Math.random() * 3)],
            gradeIndex = Math.min(4, Math.floor(mission.reward / 9000));
          playerData.mats[materialId][gradeIndex]++;
          this.toast(session, `Bonus: a ${materialId} crate (grade ${GRADES[gradeIndex]}).`);
        }
        this.features.hangar.officerXp(session, 20);
        this.toast(
          session,
          `Job complete: ${mission.title}. Paid ${credits(mission.reward)} credits.`,
        );
        this.log(playerData, `Completed: ${mission.title} (+${credits(mission.reward)}).`);
        if (mission.quest) {
          this.features.quests.questAdvance(session, mission);
          // Only continue deliveries in this quest at this port; other steps still need play.
          const followup = playerData.missions.find(
            (candidate) =>
              candidate.quest?.qid === mission.quest!.qid &&
              candidate.quest.step > mission.quest!.step &&
              !candidate.paid &&
              candidate.type !== 'passenger' &&
              destType(candidate) &&
              candidate.dest === stellarBody.id,
          );
          if (!remote && followup && !pending.includes(followup)) pending.push(followup);
        }
      }
    }
    playerData.missions = playerData.missions.filter((mission) => !mission.paid);
    for (const mission of playerData.missions)
      if (!remote && mission.type === 'bounty' && !mission.done) mission.spawned = false; // the target returns if you left
  },
};

/** Only authored observations and collections followed by a physical delivery settle in flight. */
export function remoteQuestStep(side: string | undefined, step: number, type: string): boolean {
  if (type === 'survey')
    return (
      (side === 'index-records' && step < 9) ||
      (['nhal-stirs', 'nhal-eye', 'rift-harness'].includes(side || '') && step === 0)
    );
  return (
    type === 'salvage' &&
    ((side === 'nhal-soundings' && step === 0) || (side === 'nhal-eye' && step === 1))
  );
}
