export interface ArcPayload {
  fac: string;
  name: string;
  step: number;
  total: number;
  done: boolean;
  active:
    | ({ got: number; ready: boolean } & Pick<
        ArcStep,
        'title' | 'brief' | 'type' | 'sys' | 'dest' | 'back' | 'count'
      >)
    | null;
  next: Pick<ArcStep, 'title' | 'at' | 'minRep'> | null;
}
import type { SavedArc } from './save-contracts.ts';
import type { ArcStep } from '../shared/arcs.ts';
export type ArcOffer = ArcStep & { fac: string; locked?: string };
export interface ArcsOperations {
  arcsInit(this: ArcsCapabilities, playerData: PlayerData): Record<string, SavedArc>;
  arcState(this: ArcsCapabilities, playerData: PlayerData, factionId: string): SavedArc;
  arcOffer(
    this: ArcsCapabilities,
    playerData: PlayerData,
    stellarBody: { id: string },
    factionId: string,
  ): ArcOffer | null;
  arcOffersAt(
    this: ArcsCapabilities,
    playerData: PlayerData,
    stellarBody: { id: string },
  ): Array<ArcOffer>;
  arcsPayload(this: ArcsCapabilities, playerData: PlayerData): ArcPayload[];
  arcOnLand(this: ArcsCapabilities, session: Session, stellarBody: { id: string }): void;
  arcAccept(this: ArcsCapabilities, session: Session, factionId: string): void;
  arcComplete(this: ArcsCapabilities, session: Session, factionId: string): void;
  arcArrive(this: ArcsCapabilities, session: Session, space: Space): void;
  arcProgress(this: ArcsCapabilities, session: Session, entity: Entity): void;
  expeditionOffer(
    this: ArcsCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
  ): Mission | null;
  expeditionNext(this: ArcsCapabilities, session: Session, mission: Pick<Mission, 'exp'>): void;
}
import type { ArcsCapabilities } from './features.ts';
import type { Mission, PlayerData, Session, StellarBody } from './game.ts';
import type { Entity, Space } from './space.ts';

import { clampStanding } from '../shared/reputation.ts';
// faction story arcs (three missions per power, offered at its capital) and Farside expeditions (procedural
// survey -> derelict -> data-core chains beyond the Sol Gateway that hint at the region's purpose).
import { SYS as systemsById, SYSTEMS, STELLARS, FACTIONS, GRADES } from '../shared/galaxy.ts';
import { ARCS } from '../shared/arcs.ts';
import { EXPEDITION_LORE } from '../shared/expeditions.ts';
import { TRAITS } from '../shared/syndicate.ts';
import { credits } from '../shared/rules.ts';

/** @import { Mission, PlayerData, Session, StellarBody } from './game.ts' */
/** @import { Entity, Space } from './space.ts' */

export const ArcsOperations = {
  /**
   * Initialize or retrieve the player's arc state dictionary.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, SavedArc>} Player arcs state dictionary.
   */
  arcsInit(this: ArcsCapabilities, playerData: PlayerData) {
    playerData.arcs = playerData.arcs || {};
    return playerData.arcs;
  },
  /**
   * Get or initialize the progress state for a specific faction arc.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} factionId - Faction key.
   * @returns {SavedArc} Arc progress state.
   */
  arcState(this: ArcsCapabilities, playerData: PlayerData, factionId: string) {
    const arcsInit2 = this.arcsInit(playerData);
    if (!Object.prototype.hasOwnProperty.call(ARCS, factionId))
      return { step: 0, active: null, done: true };
    return (arcsInit2[factionId] = arcsInit2[factionId] || { step: 0, active: null, done: false });
  }, // unknown arcs never touch the save
  // the arc step on offer at this world, if any
  /**
   * Evaluate the next arc mission step on offer at a stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{id: string}} position - Current stellar body.
   * @param {string} factionId - Faction key.
   * @returns {ArcOffer | null} Arc step offer details, or null if unavailable.
   */
  arcOffer(
    this: ArcsCapabilities,
    playerData: PlayerData,
    stellarBody: { id: string },
    factionId: string,
  ) {
    const factionArc = ARCS[factionId],
      savedArc = this.arcState(playerData, factionId),
      arcStep = factionArc && factionArc.steps[savedArc.step];
    if (!arcStep || savedArc.active || savedArc.done || arcStep.at !== stellarBody.id) return null;
    if ((playerData.rep[factionId] || 0) < arcStep.minRep)
      return {
        ...arcStep,
        fac: factionId,
        locked: `The ${FACTIONS[factionId].name} will ask more of you when your standing reaches ${arcStep.minRep} (it is ${playerData.rep[factionId] || 0}).`,
      };
    return { ...arcStep, fac: factionId };
  },
  /**
   * List all available arc mission offers at a stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{id: string}} position - Current stellar body.
   * @returns {Array<Mission>} List of arc mission offers.
   */
  arcOffersAt(this: ArcsCapabilities, playerData: PlayerData, stellarBody: { id: string }) {
    return Object.keys(ARCS)
      .map((factionId) => this.arcOffer(playerData, stellarBody, factionId))
      .filter((offer): offer is ArcOffer => Boolean(offer));
  },
  /**
   * Build the network payload representing arc progress for the client.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {ArcPayload[]} Arc states summary for client.
   */
  arcsPayload(this: ArcsCapabilities, playerData: PlayerData) {
    this.arcsInit(playerData);
    return Object.keys(ARCS).map((factionId) => {
      const factionArc = ARCS[factionId],
        savedArc = this.arcState(playerData, factionId),
        arcStep = factionArc.steps[savedArc.step];
      return {
        fac: factionId,
        name: factionArc.name,
        step: savedArc.step,
        total: factionArc.steps.length,
        done: savedArc.done,
        active: savedArc.active
          ? {
              ...savedArc.active,
              title: factionArc.steps[savedArc.step].title,
              brief: factionArc.steps[savedArc.step].brief,
              type: factionArc.steps[savedArc.step].type,
              sys: factionArc.steps[savedArc.step].sys,
              dest: factionArc.steps[savedArc.step].dest,
              back: factionArc.steps[savedArc.step].back,
              count: factionArc.steps[savedArc.step].count,
            }
          : null,
        next:
          !savedArc.done && !savedArc.active && arcStep
            ? { title: arcStep.title, at: arcStep.at, minRep: arcStep.minRep }
            : null,
      };
    });
  },
  /**
   * Handle player landing event to check arc step completion or trigger offers.
   * @param {Session} session - Player session.
   * @param {{id: string}} position - Landed stellar body.
   * @returns {void}
   */
  arcOnLand(this: ArcsCapabilities, session: Session, stellarBody: { id: string }) {
    const playerData = session.data;
    for (const factionId of Object.keys(ARCS)) {
      const savedArc = this.arcState(playerData, factionId),
        active2 = savedArc.active;
      if (!active2) continue;
      const arcStep = ARCS[factionId].steps[savedArc.step];
      if (
        (arcStep.type === 'carry' && stellarBody.id === arcStep.dest) ||
        (active2.ready && stellarBody.id === arcStep.back)
      )
        this.arcComplete(session, factionId);
    }
    for (const mission of this.arcOffersAt(playerData, stellarBody))
      if (!mission.locked)
        this.send(session, {
          t: 'story',
          arc: mission.fac,
          id: `${mission.fac}:${mission.i}`,
          title: mission.title,
          tag: `${FACTIONS[mission.fac].name.toUpperCase()} · ${ARCS[mission.fac].name}`,
          text: mission.text,
          acc: 'Accept',
          ref: 'Not now',
        });
  },
  /**
   * Accept an active faction arc mission offer.
   * @param {Session} session - Player session.
   * @param {string} factionId - Faction key.
   * @returns {void}
   */
  arcAccept(this: ArcsCapabilities, session: Session, factionId: string) {
    if (typeof factionId !== 'string' || !Object.prototype.hasOwnProperty.call(ARCS, factionId))
      return;
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!],
      arcOffer2 = stellarBody && this.arcOffer(playerData, stellarBody, factionId);
    if (!arcOffer2 || arcOffer2.locked) return;
    const savedArc = this.arcState(playerData, factionId);
    savedArc.active = { got: 0, ready: false };
    this.log(playerData, `${ARCS[factionId].name}: ${arcOffer2.title}. ${arcOffer2.brief}`);
    this.toast(session, `Accepted: ${arcOffer2.brief}`);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Complete the active step of a faction arc, awarding credits, reputation, and rewards.
   * @param {Session} session - Player session.
   * @param {string} factionId - Faction key.
   * @returns {void}
   */
  arcComplete(this: ArcsCapabilities, session: Session, factionId: string) {
    const playerData = session.data,
      factionArc = ARCS[factionId],
      savedArc = this.arcState(playerData, factionId),
      arcStep = factionArc.steps[savedArc.step];
    savedArc.active = null;
    savedArc.step++;
    playerData.credits += arcStep.pay;
    playerData.stats.earned += arcStep.pay;
    playerData.rep[factionId] = clampStanding((playerData.rep[factionId] || 0) + 6);
    const received = [
      `${credits(arcStep.pay)} credits`,
      `+6 ${FACTIONS[factionId].short} standing`,
    ];
    if (savedArc.step >= factionArc.steps.length) {
      // the finale: a unique Epic officer and specialist blueprints
      savedArc.done = true;
      playerData.bp = playerData.bp || {};
      playerData.bp[factionArc.spec] = (playerData.bp[factionArc.spec] || 0) + 10;
      received.push(`10 ${this.A.ships[factionArc.spec].name} blueprints`);
      const traits = Object.keys(TRAITS),
        options = {
          id: 'arc-' + factionId,
          name: factionArc.officer[0],
          race: factionId,
          role: factionArc.officer[1],
          rarity: 3,
          lv: 5,
          xp: 0,
          rank: 1,
          traits: [
            traits[
              Math.abs(
                Array.from(factionId).reduce(
                  (firstValue, component) => firstValue * 31 + component.charCodeAt(0),
                  7,
                ),
              ) % traits.length
            ],
          ],
        };
      playerData.officers = playerData.officers || [];
      if (!playerData.officers.some((officerRecord) => officerRecord.id === options.id)) {
        playerData.officers.push(options);
        received.push(`${options.name} joins your crew (Epic ${options.role}, Lieutenant)`);
      }
      this.log(playerData, `Completed ${factionArc.name} for the ${FACTIONS[factionId].name}.`);
    }
    this.send(session, {
      t: 'story',
      arc: factionId,
      id: `${factionId}:${arcStep.i}`,
      title: arcStep.title,
      tag: `${FACTIONS[factionId].name.toUpperCase()} · ${factionArc.name}`,
      text: arcStep.done + `\n\nRewards: ${received.join(', ')}.`,
      done: true,
    });
    this.db.touch();
    this.you(session);
  },
  // arriving in an arc system spawns what the step needs
  /**
   * Spawn encounter ships or derelicts upon arriving in a system required by an active arc.
   * @param {Session} session - Player session.
   * @param {Space} space - Current space system instance.
   * @returns {void}
   */
  arcArrive(this: ArcsCapabilities, session: Session, space: Space) {
    const playerData = session.data,
      entity = session.ent;
    for (const factionId of Object.keys(ARCS)) {
      const savedArc = this.arcState(playerData, factionId),
        active2 = savedArc.active;
      if (!active2 || active2.ready) continue;
      const arcStep = ARCS[factionId].steps[savedArc.step];
      if (
        arcStep.type === 'carry' ||
        arcStep.sys !== playerData.sys ||
        [...space.ships.values()].some(
          (entity) =>
            entity.arcOf && entity.arcOf.sid === session.id && entity.arcOf.fac === factionId,
        )
      )
        continue;
      const left = (arcStep.count || 1) - active2.got;
      for (let index = 0; index < left; index++) {
        const angle = Math.random() * 6.283,
          distance = arcStep.type === 'board' ? 800 + index * 300 : 1400;
        const entity2 = space.makeShip({
          hull: arcStep.hull,
          faction: arcStep.faction,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          ai: arcStep.type === 'board' ? null : arcStep.type === 'boss' ? 'guard' : 'raid',
          name: arcStep.type === 'boss' ? arcStep.bossName : null,
          bonus: arcStep.type === 'boss' ? { shieldPct: 80, armorPct: 80, damagePct: 30 } : {},
        });
        entity2.arcOf = { sid: session.id, fac: factionId };
        entity2.life = 1e9;
        if (arcStep.type === 'board') {
          entity2.disabled = true;
          entity2.armor = entity2.st.armor * 0.1;
          entity2.wreckT = 1e9;
          entity2.rescueOf = { id: 'arc', owner: session.id };
          entity2.name = 'Drifting ' + this.A.ships[arcStep.hull!].name;
        } else {
          entity2.target = entity;
          if (arcStep.type === 'boss') {
            entity2.home = { x: entity2.x, y: entity2.y };
            entity2.noDisable = true;
          }
        }
      }
      this.toast(
        session,
        arcStep.type === 'board'
          ? `${left} drifting ship${left > 1 ? 's' : ''} here: board each one and choose Rescue.`
          : arcStep.type === 'boss'
            ? `${arcStep.bossName} is in this system.`
            : `${left} target${left > 1 ? 's' : ''} in this system.`,
      );
    }
  },
  /**
   * Record combat or rescue progress for an encounter associated with an active arc.
   * @param {Session} session - Player session.
   * @param {Entity} entity - Destroyed or rescued entity.
   * @returns {void}
   */
  arcProgress(this: ArcsCapabilities, session: Session, entity: Entity) {
    if (!entity.arcOf || entity.arcOf.sid !== session.id) return;
    const playerData = session.data,
      factionId = entity.arcOf.fac,
      savedArc = this.arcState(playerData, factionId),
      active2 = savedArc.active;
    if (!active2) return;
    const arcStep = ARCS[factionId].steps[savedArc.step];
    active2.got++;
    entity.arcOf = null;
    this.toast(
      session,
      arcStep.progress +
        (arcStep.count && active2.got < arcStep.count ? ` (${active2.got}/${arcStep.count})` : ''),
    );
    if (active2.got >= (arcStep.count || 1)) {
      active2.ready = true;
      this.toast(session, `Return to ${STELLARS[arcStep.back].name}.`);
    }
    this.db.touch();
    this.you(session);
  },

  // ------------------------------------------------------------------ Farside expeditions
  // Offered on Farside job boards: survey a system, board the derelict the survey finds, bring its data core back.
  /**
   * Generate a procedural Farside survey expedition mission if eligible.
   * @param {StellarBody} stellarBody - Current stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Mission | null} Expedition mission object or null if ineligible.
   */
  expeditionOffer(this: ArcsCapabilities, stellarBody: StellarBody, playerData: PlayerData) {
    if (!systemsById[stellarBody.system].farside || !stellarBody.svc.includes('B')) return null;
    playerData.expd = playerData.expd || { n: 0 };
    if (playerData.missions.some((mission) => mission.exp)) return null;
    const count = playerData.expd.n,
      starSystems = SYSTEMS.filter(
        (starSystem) =>
          starSystem.farside &&
          !!starSystem.eventide === !!systemsById[stellarBody.system].eventide,
      ),
      starSystem =
        starSystems[
          (count * (systemsById[stellarBody.system].eventide ? 1 : 3) + 1) % starSystems.length
        ],
      starSystem2 = starSystems[(count * 5 + 4) % starSystems.length];
    const points2: [number, number][] = [];
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * 6.283 + count,
        radius = 900 + 500 * ((count + index) % 3);
      points2.push([Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
    }
    return {
      id: `exp-${count}`,
      type: 'survey',
      exp: { n: count, stage: 1, b: starSystem2.id, home: stellarBody.id },
      title: `EXPEDITION ${count + 1}: Survey ${starSystem.name}`,
      sys: starSystem.id,
      points: points2,
      reward: 12000 + count * 6000,
      text: `The ${systemsById[stellarBody.system].eventide ? 'Eventide research annex' : 'Farside Settlers’ survey office'} wants readings from ${starSystem.name}: pass close to three marked points. Every survey out here turns up something.`,
    };
  },
  // a finished expedition stage becomes the next one
  /**
   * Advance a completed expedition stage to the next stage or final reward.
   * @param {Session} session - Player session.
   * @param {Mission} mission - Completed expedition mission.
   * @returns {void}
   */
  expeditionNext(this: ArcsCapabilities, session: Session, mission: Pick<Mission, 'exp'>) {
    const playerData = session.data,
      event = mission.exp;
    if (!event) return;
    if (event.stage === 1) {
      playerData.missions.push({
        id: `exp-${event.n}-2`,
        type: 'rescue',
        exp: { ...event, stage: 2 },
        title: `EXPEDITION ${event.n + 1}: The derelict in ${systemsById[event.b].name}`,
        sys: event.b,
        hull: [735, 707, 704][event.n % 3],
        faction: 'farside',
        wreckName: `derelict of unknown make`,
        reward: 15000 + event.n * 7000,
        text: `Your survey picked up a derelict in ${systemsById[event.b].name}, older than any hull on record. Board it and recover what you can.`,
        owner: session.id,
        taken: Date.now(),
      });
      this.toast(
        session,
        `Expedition: the survey found a derelict in ${systemsById[event.b].name}.`,
      );
    } else if (event.stage === 2) {
      if (playerData.stellar === event.home) {
        // already home: hand the core straight over
        const payment = 25000 + event.n * 9000;
        playerData.credits += payment;
        playerData.stats.earned += payment;
        this.toast(
          session,
          `You hand the data core to the survey office. +${credits(payment)} credits.`,
        );
        return this.expeditionNext(session, { exp: { ...event, stage: 3 } });
      }
      playerData.missions.push({
        id: `exp-${event.n}-3`,
        type: 'expret',
        exp: { ...event, stage: 3 },
        title: `EXPEDITION ${event.n + 1}: Bring the data core home`,
        sys: STELLARS[event.home].system,
        dest: event.home,
        reward: 25000 + event.n * 9000,
        text: `You recovered a data core from the derelict. Take it to ${STELLARS[event.home].name} for the survey office to read.`,
        owner: session.id,
        taken: Date.now(),
      });
      this.toast(
        session,
        `Expedition: data core recovered. Take it to ${STELLARS[event.home].name}.`,
      );
    } else {
      playerData.expd = playerData.expd || { n: 0 };
      const lore = EXPEDITION_LORE[event.n % EXPEDITION_LORE.length];
      playerData.expd.n = event.n + 1;
      playerData.expd.lore = playerData.expd.lore || [];
      if (!playerData.expd.lore.includes(event.n % EXPEDITION_LORE.length))
        playerData.expd.lore.push(event.n % EXPEDITION_LORE.length);
      const game = Math.min(4, 1 + Math.floor(event.n / 2));
      playerData.mats.crystal[game]++;
      this.send(session, {
        t: 'story',
        id: `exp:${event.n}`,
        title: lore.title,
        tag: 'FARSIDE EXPEDITION',
        text: `${lore.text}\n\nRewards: a crystal ${GRADES[game]} crate, and the next expedition is on the board.`,
        done: true,
      });
      this.log(playerData, `Expedition ${event.n + 1} decoded: ${lore.title}.`);
    }
    this.db.touch();
    this.you(session);
  },
};
