import { clampStanding } from '../shared/reputation.js';
// faction story arcs (three missions per power, offered at its capital) and Farside expeditions (procedural
// survey -> derelict -> data-core chains beyond the Sol Gateway that hint at the region's purpose).
import { SYS, SYSTEMS, STELLARS, FACTIONS, GRADES } from '../shared/galaxy.js';
import { ARCS } from '../shared/arcs.js';
import { EXPEDITION_LORE } from '../shared/expeditions.js';
import { TRAITS } from '../shared/syndicate.js';
import { credits } from '../shared/rules.js';

/** @import { Mission, PlayerData, Session, StellarBody } from './game.js' */
/** @import { Entity, Space } from './space.js' */

export const ArcsOperations = {
  /**
   * Initialize or retrieve the player's arc state dictionary.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, number | string | boolean>} Player arcs state dictionary.
   */
  arcsInit(playerData) {
    playerData.arcs = playerData.arcs || {};
    return playerData.arcs;
  },
  /**
   * Get or initialize the progress state for a specific faction arc.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} f - Faction key.
   * @returns {{step: number, active: Record<string, string | number> | null, done: boolean}} Arc progress state.
   */
  arcState(playerData, f) {
    const A = this.arcsInit(playerData);
    if (!Object.prototype.hasOwnProperty.call(ARCS, f))
      return { step: 0, active: null, done: true };
    return (A[f] = A[f] || { step: 0, active: null, done: false });
  }, // unknown arcs never touch the save
  // the arc step on offer at this world, if any
  /**
   * Evaluate the next arc mission step on offer at a stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{id: string}} p - Current stellar body.
   * @param {string} f - Faction key.
   * @returns {Record<string, string | number | boolean> | null} Arc step offer details, or null if unavailable.
   */
  arcOffer(playerData, p, f) {
    const X = ARCS[f],
      S = this.arcState(playerData, f),
      st = X && X.steps[S.step];
    if (!st || S.active || S.done || st.at !== p.id) return null;
    if ((playerData.rep[f] || 0) < st.minRep)
      return {
        ...st,
        fac: f,
        locked: `The ${FACTIONS[f].name} will ask more of you when your standing reaches ${st.minRep} (it is ${playerData.rep[f] || 0}).`,
      };
    return { ...st, fac: f };
  },
  /**
   * List all available arc mission offers at a stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{id: string}} p - Current stellar body.
   * @returns {Array<Mission>} List of arc mission offers.
   */
  arcOffersAt(playerData, p) {
    return Object.keys(ARCS)
      .map((f) => this.arcOffer(playerData, p, f))
      .filter(Boolean);
  },
  /**
   * Build the network payload representing arc progress for the client.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<Record<string, string | number | boolean>>} Arc states summary for client.
   */
  arcsPayload(playerData) {
    this.arcsInit(playerData);
    return Object.keys(ARCS).map((f) => {
      const X = ARCS[f],
        S = this.arcState(playerData, f),
        st = X.steps[S.step];
      return {
        fac: f,
        name: X.name,
        step: S.step,
        total: X.steps.length,
        done: S.done,
        active: S.active
          ? {
              ...S.active,
              title: X.steps[S.step].title,
              brief: X.steps[S.step].brief,
              type: X.steps[S.step].type,
              sys: X.steps[S.step].sys,
              dest: X.steps[S.step].dest,
              back: X.steps[S.step].back,
              count: X.steps[S.step].count,
            }
          : null,
        next: !S.done && !S.active && st ? { title: st.title, at: st.at, minRep: st.minRep } : null,
      };
    });
  },
  /**
   * Handle player landing event to check arc step completion or trigger offers.
   * @param {Session} session - Player session.
   * @param {{id: string}} p - Landed stellar body.
   * @returns {void}
   */
  arcOnLand(session, p) {
    const playerData = session.data;
    for (const f of Object.keys(ARCS)) {
      const S = this.arcState(playerData, f),
        a = S.active;
      if (!a) continue;
      const st = ARCS[f].steps[S.step];
      if ((st.type === 'carry' && p.id === st.dest) || (a.ready && p.id === st.back))
        this.arcComplete(session, f);
    }
    for (const mission of this.arcOffersAt(playerData, p))
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
   * @param {string} f - Faction key.
   * @returns {void}
   */
  arcAccept(session, f) {
    if (typeof f !== 'string' || !Object.prototype.hasOwnProperty.call(ARCS, f)) return;
    const playerData = session.data,
      p = STELLARS[playerData.stellar],
      o = p && this.arcOffer(playerData, p, f);
    if (!o || o.locked) return;
    const S = this.arcState(playerData, f);
    S.active = { got: 0, ready: false };
    this.log(playerData, `${ARCS[f].name}: ${o.title}. ${o.brief}`);
    this.toast(session, `Accepted: ${o.brief}`);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Complete the active step of a faction arc, awarding credits, reputation, and rewards.
   * @param {Session} session - Player session.
   * @param {string} f - Faction key.
   * @returns {void}
   */
  arcComplete(session, f) {
    const playerData = session.data,
      X = ARCS[f],
      S = this.arcState(playerData, f),
      st = X.steps[S.step];
    S.active = null;
    S.step++;
    playerData.credits += st.pay;
    playerData.stats.earned += st.pay;
    playerData.rep[f] = clampStanding((playerData.rep[f] || 0) + 6);
    const got = [`${credits(st.pay)} credits`, `+6 ${FACTIONS[f].short} standing`];
    if (S.step >= X.steps.length) {
      // the finale: a unique Epic officer and specialist blueprints
      S.done = true;
      playerData.bp = playerData.bp || {};
      playerData.bp[X.spec] = (playerData.bp[X.spec] || 0) + 10;
      got.push(`10 ${this.A.ships[X.spec].name} blueprints`);
      const traits = Object.keys(TRAITS),
        o = {
          id: 'arc-' + f,
          name: X.officer[0],
          race: f,
          role: X.officer[1],
          rarity: 3,
          lv: 5,
          xp: 0,
          rank: 1,
          traits: [
            traits[Math.abs([...f].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % traits.length],
          ],
        };
      playerData.officers = playerData.officers || [];
      if (!playerData.officers.some((x) => x.id === o.id)) {
        playerData.officers.push(o);
        got.push(`${o.name} joins your crew (Epic ${o.role}, Lieutenant)`);
      }
      this.log(playerData, `Completed ${X.name} for the ${FACTIONS[f].name}.`);
    }
    this.send(session, {
      t: 'story',
      arc: f,
      id: `${f}:${st.i}`,
      title: st.title,
      tag: `${FACTIONS[f].name.toUpperCase()} · ${X.name}`,
      text: st.done + `\n\nRewards: ${got.join(', ')}.`,
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
  arcArrive(session, space) {
    const playerData = session.data,
      entity = session.ent;
    for (const f of Object.keys(ARCS)) {
      const S = this.arcState(playerData, f),
        a = S.active;
      if (!a || a.ready) continue;
      const st = ARCS[f].steps[S.step];
      if (
        st.type === 'carry' ||
        st.sys !== playerData.sys ||
        [...space.ships.values()].some(
          (x) => x.arcOf && x.arcOf.sid === session.id && x.arcOf.fac === f,
        )
      )
        continue;
      const left = (st.count || 1) - a.got;
      for (let i = 0; i < left; i++) {
        const ang = Math.random() * 6.283,
          dist = st.type === 'board' ? 800 + i * 300 : 1400;
        const x = space.makeShip({
          hull: st.hull,
          faction: st.faction,
          x: Math.cos(ang) * dist,
          y: Math.sin(ang) * dist,
          ai: st.type === 'board' ? null : st.type === 'boss' ? 'guard' : 'raid',
          name: st.type === 'boss' ? st.bossName : null,
          bonus: st.type === 'boss' ? { shieldPct: 80, armorPct: 80, damagePct: 30 } : {},
        });
        x.arcOf = { sid: session.id, fac: f };
        x.life = 1e9;
        if (st.type === 'board') {
          x.disabled = true;
          x.armor = x.st.armor * 0.1;
          x.wreckT = 1e9;
          x.rescueOf = { id: 'arc', owner: session.id };
          x.name = 'Drifting ' + this.A.ships[st.hull].name;
        } else {
          x.target = entity;
          if (st.type === 'boss') {
            x.home = { x: x.x, y: x.y };
            x.noDisable = true;
          }
        }
      }
      this.toast(
        session,
        st.type === 'board'
          ? `${left} drifting ship${left > 1 ? 's' : ''} here: board each one and choose Rescue.`
          : st.type === 'boss'
            ? `${st.bossName} is in this system.`
            : `${left} target${left > 1 ? 's' : ''} in this system.`,
      );
    }
  },
  /**
   * Record combat or rescue progress for an encounter associated with an active arc.
   * @param {Session} session - Player session.
   * @param {Entity} x - Destroyed or rescued entity.
   * @returns {void}
   */
  arcProgress(session, x) {
    if (!x.arcOf || x.arcOf.sid !== session.id) return;
    const playerData = session.data,
      f = x.arcOf.fac,
      S = this.arcState(playerData, f),
      a = S.active;
    if (!a) return;
    const st = ARCS[f].steps[S.step];
    a.got++;
    x.arcOf = null;
    this.toast(
      session,
      st.progress + (st.count && a.got < st.count ? ` (${a.got}/${st.count})` : ''),
    );
    if (a.got >= (st.count || 1)) {
      a.ready = true;
      this.toast(session, `Return to ${STELLARS[st.back].name}.`);
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
  expeditionOffer(stellarBody, playerData) {
    if (!SYS[stellarBody.system].farside || !stellarBody.svc.includes('B')) return null;
    playerData.expd = playerData.expd || { n: 0 };
    if (playerData.missions.some((m) => m.exp)) return null;
    const n = playerData.expd.n,
      fs = SYSTEMS.filter((S) => S.farside && !!S.eventide === !!SYS[stellarBody.system].eventide),
      a = fs[(n * (SYS[stellarBody.system].eventide ? 1 : 3) + 1) % fs.length],
      b = fs[(n * 5 + 4) % fs.length];
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * 6.283 + n,
        r = 900 + 500 * ((n + i) % 3);
      pts.push([Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r)]);
    }
    return {
      id: `exp-${n}`,
      type: 'survey',
      exp: { n, stage: 1, b: b.id, home: stellarBody.id },
      title: `EXPEDITION ${n + 1}: Survey ${a.name}`,
      sys: a.id,
      points: pts,
      reward: 12000 + n * 6000,
      text: `The ${SYS[stellarBody.system].eventide ? 'Eventide research annex' : 'Farside Settlers’ survey office'} wants readings from ${a.name}: pass close to three marked points. Every survey out here turns up something.`,
    };
  },
  // a finished expedition stage becomes the next one
  /**
   * Advance a completed expedition stage to the next stage or final reward.
   * @param {Session} session - Player session.
   * @param {Mission} mission - Completed expedition mission.
   * @returns {void}
   */
  expeditionNext(session, mission) {
    const playerData = session.data,
      E = mission.exp;
    if (!E) return;
    if (E.stage === 1) {
      playerData.missions.push({
        id: `exp-${E.n}-2`,
        type: 'rescue',
        exp: { ...E, stage: 2 },
        title: `EXPEDITION ${E.n + 1}: The derelict in ${SYS[E.b].name}`,
        sys: E.b,
        hull: [735, 707, 704][E.n % 3],
        faction: 'farside',
        wreckName: `derelict of unknown make`,
        reward: 15000 + E.n * 7000,
        text: `Your survey picked up a derelict in ${SYS[E.b].name}, older than any hull on record. Board it and recover what you can.`,
        owner: session.id,
        taken: Date.now(),
      });
      this.toast(session, `Expedition: the survey found a derelict in ${SYS[E.b].name}.`);
    } else if (E.stage === 2) {
      if (playerData.stellar === E.home) {
        // already home: hand the core straight over
        const pay = 25000 + E.n * 9000;
        playerData.credits += pay;
        playerData.stats.earned += pay;
        this.toast(
          session,
          `You hand the data core to the survey office. +${credits(pay)} credits.`,
        );
        return this.expeditionNext(session, { exp: { ...E, stage: 3 } });
      }
      playerData.missions.push({
        id: `exp-${E.n}-3`,
        type: 'expret',
        exp: { ...E, stage: 3 },
        title: `EXPEDITION ${E.n + 1}: Bring the data core home`,
        sys: STELLARS[E.home].system,
        dest: E.home,
        reward: 25000 + E.n * 9000,
        text: `You recovered a data core from the derelict. Take it to ${STELLARS[E.home].name} for the survey office to read.`,
        owner: session.id,
        taken: Date.now(),
      });
      this.toast(session, `Expedition: data core recovered. Take it to ${STELLARS[E.home].name}.`);
    } else {
      playerData.expd = playerData.expd || { n: 0 };
      const lore = EXPEDITION_LORE[E.n % EXPEDITION_LORE.length];
      playerData.expd.n = E.n + 1;
      playerData.expd.lore = playerData.expd.lore || [];
      if (!playerData.expd.lore.includes(E.n % EXPEDITION_LORE.length))
        playerData.expd.lore.push(E.n % EXPEDITION_LORE.length);
      const g = Math.min(4, 1 + Math.floor(E.n / 2));
      playerData.mats.crystal[g]++;
      this.send(session, {
        t: 'story',
        id: `exp:${E.n}`,
        title: lore.title,
        tag: 'FARSIDE EXPEDITION',
        text: `${lore.text}\n\nRewards: a crystal ${GRADES[g]} crate, and the next expedition is on the board.`,
        done: true,
      });
      this.log(playerData, `Expedition ${E.n + 1} decoded: ${lore.title}.`);
    }
    this.db.touch();
    this.you(session);
  },
};
