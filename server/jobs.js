import { signedXorshift32 as rng, fnv1a as hash } from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { bindOperations } from './feature-service.js';
import {
  SYSTEMS,
  SYS,
  STELLARS,
  COMMODITIES,
  TRAFFIC,
  MATERIALS,
  GRADES,
} from '../shared/galaxy.js';
import { credits } from '../shared/rules.js';
import { eventideOffers } from '../shared/eventide.js';
import { clampStanding } from '../shared/reputation.js';
import { applyTake, planTake } from '../shared/cargo-lots.js';
import { destType } from './syndicate.js';
import { freightOffers } from './freight-offers.js';
import { grantRadio, radioTourOffer, advanceRadioTour } from './radio-discovery.js';

/** @import { Game } from './game.js' */

/** @typedef {import('./game.js').Session} Session */
/** @typedef {import('./game.js').PlayerData} PlayerData */
/** @typedef {import('./game.js').StellarBody} StellarBody */
/** @typedef {import('./game.js').Mission} Mission */
/**
 * Ordinary job board, acceptance and landing-completion owner. Feature-specific
 * stories, team contracts, mining orders and progression retain their owners.
 * Live capabilities do not copy/save a second account state. Legacy operation
 * bodies remain unchecked; these types do not validate incoming wire data.
 * @typedef {Pick<Game,
 *   'A' |
 *   'db' |
 *   'features' |
 *   'holdUsed' |
 *   'landed' |
 *   'log' |
 *   'offers' |
 *   'send' |
 *   'toast' |
 *   'tut' |
 *   'you'>} JobCapabilities
 * @typedef {Pick<Game, 'offers' | 'accept' | 'completeOnLanding'>} JobService
 */

/**
 * @param {JobCapabilities} capabilities Live core functions/state, not Game.
 * @returns {JobService}
 */
export function createJobService(capabilities) {
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

const galaxyGraph = new GalaxyGraph(SYS);

const JUMP_DISTANCES = Object.fromEntries(
  SYSTEMS.map((system) => [system.id, galaxyGraph.distances(system.id)]),
);

const JobOperations = {
  /**
   * Generates procedural job board mission offers for a stellar port.
   * @param {StellarBody} stellarBody Stellar port.
   * @param {PlayerData} playerData Player data.
   * @returns {Mission[]} Available job board missions.
   * @this {JobCapabilities}
   */
  offers(stellarBody, playerData) {
    if (!stellarBody.svc.includes('B')) return [];
    const offerWindow = Math.floor(Date.now() / 600000),
      random = rng(hash(stellarBody.id + offerWindow)),
      offers = [],
      originSystemId = stellarBody.system;
    const nearbySystems = Object.entries(JUMP_DISTANCES[originSystemId]).filter(
      ([systemId, jumpCount]) =>
        jumpCount >= 1 &&
        jumpCount <= 4 &&
        SYS[systemId].stellars.some((candidatePort) => candidatePort.svc.includes('L')) &&
        SYS[systemId].faction !== 'umbral',
    );
    const usedNames = new Set();
    for (let i = 0; i < 5 && nearbySystems.length; i++) {
      const roll = random(),
        [destinationSystemId, jumps] = nearbySystems[Math.floor(random() * nearbySystems.length)],
        destinationSystem = SYS[destinationSystemId];
      const offerId = `${stellarBody.id}-${offerWindow}-${i}`;
      if (roll < 0.65) {
        const landingPorts = destinationSystem.stellars.filter(
            (candidatePort) => candidatePort.svc.includes('L') && !candidatePort.site,
          ),
          destinationPort = landingPorts[Math.floor(random() * landingPorts.length)]; // never to an empty derelict hull
        if (!destinationPort) continue;
        const commodity = COMMODITIES[Math.floor(random() * COMMODITIES.length)],
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
          hull = TRAFFIC[factionId].war[Math.floor(random() * TRAFFIC[factionId].war.length)],
          hullDefinition = this.A.ships[hull];
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
          reward: Math.round(4000 + (hullDefinition.strength || 20) * 60),
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
        (sys) => {
          const landingPorts = SYS[sys].stellars.filter(
            (candidatePort) => candidatePort.svc.includes('L') && !candidatePort.site,
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
    if (rank >= 5 && nearbySystems.length) {
      const [sys] = nearbySystems[Math.floor(random() * nearbySystems.length)],
        destinationSystem = SYS[sys],
        eliteHullIds = [...TRAFFIC.umbral.war, ...TRAFFIC.hollow.war]
          .filter((hullId) => this.A.ships[hullId])
          .sort(
            (leftHullId, rightHullId) =>
              (this.A.ships[rightHullId].strength || 0) - (this.A.ships[leftHullId].strength || 0),
          );
      const hull = eliteHullIds[Math.floor(random() * Math.min(2, eliteHullIds.length))],
        hullDefinition = this.A.ships[hull],
        targetName =
          'the ' +
          ['Ashen Admiral', 'Red Widow', 'Quiet Knife', 'Last Lantern'][Math.floor(random() * 4)];
      offers.push({
        id: `${stellarBody.id}-${offerWindow}-elite`,
        type: 'bounty',
        elite: true,
        title: `ELITE CONTRACT: ${targetName}`,
        sys,
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
          !(offer.type === 'assassinate' && rank < 3),
      )
      .map((offer) => ({ ...offer, offerVersion: 1 }));
  },
  /**
   * Accepts a mission from the local stellar job board.
   * @param {Session} session Player session.
   * @param {string} missionId Mission ID to accept.
   * @this {JobCapabilities}
   * @returns {void}
   */
  accept(session, missionId) {
    const playerData = session.data,
      port = STELLARS[playerData.stellar];
    if (!port) return;
    if (playerData.missions.length >= 6) return this.toast(session, 'You already have six jobs.');
    const mission = this.offers(port, playerData).find((offer) => offer.id === missionId);
    if (!mission) return;
    if (mission.type === 'quest') return this.features.quests.questStart(session, mission); // 2.4
    if (mission.type === 'warband') return this.features.coop.warbandAccept(session, mission); // Armada contracts go to the whole Armada
    if (mission.type === 'cargo' || mission.type === 'smuggle') {
      const shipStats = this.features.shipStats.stats(playerData),
        usedHold = this.holdUsed(playerData);
      if (usedHold + mission.qty > shipStats.cargo)
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
  /**
   * Evaluates active missions upon landing, paying rewards and logging completions.
   * @param {Session} session Player session landing.
   * @param {StellarBody} stellarBody Landed stellar port.
   * @this {JobCapabilities}
   * @returns {void}
   */
  completeOnLanding(session, stellarBody) {
    const playerData = session.data;
    playerData.lastStellar = stellarBody.id;
    for (const mission of [...playerData.missions]) {
      if (mission.type === 'miningOrder' || mission.paid) continue;
      if (mission.radioTour && advanceRadioTour(this, session, mission, stellarBody)) continue;
      // a snapshot: follow-up jobs added on this landing wait for the next one
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
            planTake(playerData.cargo, playerData.cargoLots, mission.cid, mission.qty),
          );
          this.features.living.stateProgress(
            session,
            stellarBody.system,
            'cid:' + mission.cid,
            mission.qty,
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
        playerData.rep[SYS[stellarBody.system].faction] = clampStanding(
          (playerData.rep[SYS[stellarBody.system].faction] || 0) + 2,
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
        if (mission.quest) this.features.quests.questAdvance(session, mission); // the story goes on
      }
    }
    playerData.missions = playerData.missions.filter((mission) => !mission.paid);
    for (const mission of playerData.missions)
      if (mission.type === 'bounty' && !mission.done) mission.spawned = false; // the target returns if you left
  },
};
