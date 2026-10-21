import { assertLots, addLots, commonLots } from '../shared/cargo-lots.js';
import { clampStanding } from '../shared/reputation.js';
// Quantum Rift: server feature operations: shuttles, officers, the research queue,
// refining crates up a grade, the drydock, and boarding disabled ships.
import {
  SYSTEMS,
  SYS,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  RESEARCH,
} from '../shared/galaxy.js';
import {
  SHUTTLES,
  SHUTTLE_JOBS,
  BAYS_BY_OPS,
  SHUTTLE_REPAIR,
  JOB_WINDOW_H,
  ROLES,
  RARITY,
  RACE_ROLES,
  OFFICER_NAMES,
  BRIDGE_SLOTS,
  ROSTER_MAX,
  XP_LEVEL,
  MAX_LEVEL,
  RESEARCH_QUEUE_MAX,
  REFINE_UP,
  CAPTURE_SELL,
} from '../shared/hangar.js';
import { HANGAR_BY_OPS } from '../shared/docks.js';
import {
  researchBonus,
  captainBonus,
  makeLoadout,
  loadoutValue,
  credits,
} from '../shared/rules.js';

/** @import { OfficerRecord } from '../shared/rules.js' */
/** @import { PlayerData, Session } from './game.js' */

/**
 * Clamp a numeric value between a lower and an upper bound.
 * @param {number} v - Value to clamp.
 * @param {number} a - Lower bound.
 * @param {number} b - Upper bound.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Create a seeded pseudo-random number generator function.
 * @param {number} seed - Initial random seed.
 * @returns {() => number} Generator returning floats in [0, 1).
 */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * 32-bit FNV-1a string hash function.
 * @param {string} str - Input string to hash.
 * @returns {number} 32-bit unsigned integer hash.
 */
function hash(str) {
  let h = 2166136261;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a random element from an array using a random generator function.
 * @template T
 * @param {() => number} r - Random generator function returning [0, 1).
 * @param {T[]} a - Array of items to choose from.
 * @returns {T} Selected element.
 */
const pick = (r, a) => a[Math.floor(r() * a.length)];

/** @type {Record<string, Record<string, number>>} Cache of shortest jump distance maps by starting system ID. */
const DIST = {};

/**
 * Compute or retrieve cached shortest jump distances from a given system to all connected systems.
 * @param {string} from - Origin system ID.
 * @returns {Record<string, number>} Map of system IDs to jump count distance.
 */
function jumps(from) {
  if (DIST[from]) return DIST[from];
  const d = { [from]: 0 },
    q = [from];
  while (q.length) {
    const s = q.shift();
    for (const l of SYS[s].links)
      if (d[l] === undefined) {
        d[l] = d[s] + 1;
        q.push(l);
      }
  }
  return (DIST[from] = d);
}

/** @type {string[]} List of playable and NPC race identifiers. */
const RACES = Object.keys(RACE_ROLES);

export const HangarOperations = {
  // ------------------------------------------------------------------ save upgrades
  /**
   * Initialize hangar, officer, bridge, dock, and station queue data on player record.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {void}
   */
  hangarInit(playerData) {
    playerData.shuttles = playerData.shuttles || [];
    playerData.officers = playerData.officers || [];
    playerData.bridge = playerData.bridge || {};
    playerData.dock = playerData.dock || [];
    playerData.station.queue = playerData.station.queue || [];
    playerData.nextUid = playerData.nextUid || 1;
  },
  /**
   * Allocate a monotonically increasing unique identifier for player entities.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Newly allocated unique ID.
   */
  uid(playerData) {
    return (playerData.nextUid = (playerData.nextUid || 1) + 1) - 1;
  },
  /**
   * Calculate total shuttle bay capacity based on Station Tier and research bonuses.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Total available shuttle bays.
   */
  bays(playerData) {
    const b = researchBonus(playerData.station);
    return playerData.station.site ? BAYS_BY_OPS[playerData.station.ops] + (b.bays || 0) : 0;
  },
  /**
   * Calculate total stored-ship dock slots based on Station Tier and research bonuses.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Total stored-ship berths.
   */
  dockSlots(playerData) {
    const b = researchBonus(playerData.station);
    return playerData.station.site ? HANGAR_BY_OPS[playerData.station.ops] + (b.dockSlots || 0) : 0;
  }, // stored-ship berths

  // ------------------------------------------------------------------ officers
  // a bar on any inhabited world with a job board posts three officers of the local race each hour
  /**
   * Generate three candidate officers for hire at an inhabited world with a bar service.
   * @param {{id: string, svc: string, system: string, tech?: number, site?: boolean | Record<string, string | number>}} p - Current stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<OfficerRecord>} List of generated officer offers.
   */
  barOffers(p, playerData) {
    if (!p || !p.svc.includes('B') || p.site) return [];
    const fac = SYS[p.system].faction,
      hour = Math.floor(Date.now() / 3600000),
      r = rng(hash('bar' + p.id + hour)),
      out = [];
    for (let i = 0; i < 3; i++) {
      const race = RACE_ROLES[fac] ? fac : pick(r, RACES);
      const role = r() < 0.7 ? pick(r, RACE_ROLES[race]) : pick(r, Object.keys(ROLES));
      const rr = r() + (p.tech || 2) * 0.02 + (this.mods ? this.mods().rarity : 0),
        rarity = rr > 0.985 ? 3 : rr > 0.88 ? 2 : rr > 0.6 ? 1 : 0;
      const lv = 1 + Math.floor(r() * (2 + rarity));
      const N = OFFICER_NAMES[race],
        name = pick(r, N[0]) + ' ' + pick(r, N[1]);
      const id = `${p.id}-${hour}-${i}`;
      if (playerData && playerData.officers.some((officer) => officer.src === id)) continue;
      out.push({
        id,
        name,
        race,
        role,
        rarity,
        lv,
        xp: 0,
        cost: Math.round(RARITY[rarity].cost * (1 + (lv - 1) * 0.25)),
      });
    }
    return out;
  },
  /**
   * Handle officer operations including hiring from bars, assigning to bridge/shuttles, and dismissing.
   * @param {Session} session - Player session.
   * @param {{op: string, id?: string, oid?: number, slot?: string}} m - Officer action payload.
   * @returns {void}
   */
  officerOp(session, m) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar];
    switch (m.op) {
      case 'hire': {
        if (!p || session.ent) return;
        const officer = this.barOffers(p, playerData).find((x) => x.id === m.id);
        if (!officer) return;
        if (playerData.officers.length >= ROSTER_MAX)
          return this.toast(session, `Your roster is full (${ROSTER_MAX} officers).`);
        if (playerData.credits < officer.cost) return this.toast(session, 'Not enough credits.');
        playerData.credits -= officer.cost;
        playerData.officers.push({
          id: this.uid(playerData),
          src: officer.id,
          name: officer.name,
          race: officer.race,
          role: officer.role,
          rarity: officer.rarity,
          lv: officer.lv,
          xp: 0,
        });
        this.log(
          playerData,
          `Signed ${RARITY[officer.rarity].name.toLowerCase()} ${ROLES[officer.role].name.toLowerCase()} ${officer.name} (${FACTIONS[officer.race].short}).`,
        );
        this.toast(
          session,
          `${officer.name} joins your crew. Assign them to the bridge or a shuttle.`,
        );
        break;
      }
      case 'assign': {
        // slot: captain | bridge1 | bridge2 | '' (unassign)
        const officer = playerData.officers.find((x) => x.id === m.oid);
        if (!officer) return;
        if (playerData.shuttles.some((sh) => sh.crew === officer.id && sh.state === 'out'))
          return this.toast(session, `${officer.name} is out on a shuttle job.`);
        for (const k of BRIDGE_SLOTS)
          if (playerData.bridge[k] === officer.id) delete playerData.bridge[k];
        for (const sh of playerData.shuttles) if (sh.crew === officer.id) sh.crew = null;
        if (this.unwingOfficer) this.unwingOfficer(playerData, officer.id); // one post at a time
        if (BRIDGE_SLOTS.includes(m.slot)) playerData.bridge[m.slot] = officer.id;
        break;
      }
      case 'dismiss': {
        const officer = playerData.officers.find((x) => x.id === m.oid);
        if (!officer) return;
        if (playerData.shuttles.some((sh) => sh.crew === officer.id && sh.state === 'out'))
          return this.toast(session, `${officer.name} is out on a shuttle job.`);
        for (const k of BRIDGE_SLOTS)
          if (playerData.bridge[k] === officer.id) delete playerData.bridge[k];
        for (const sh of playerData.shuttles) if (sh.crew === officer.id) sh.crew = null;
        if (this.unwingOfficer) this.unwingOfficer(playerData, officer.id);
        playerData.officers = playerData.officers.filter((x) => x !== officer);
        this.log(playerData, `${officer.name} left your crew.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // experience for the bridge crew (kills, jumps, jobs) or one officer (shuttle runs)
  /**
   * Award experience points to all active bridge officers or a single designated officer.
   * @param {Session} session - Player session.
   * @param {number} amount - Base XP amount.
   * @param {OfficerRecord} [only] - Specific officer to award XP to (optional).
   * @returns {void}
   */
  officerXp(session, amount, only) {
    const playerData = session.data,
      b = this.bonus ? this.bonus(playerData) : researchBonus(playerData.station),
      k = (1 + (b.officerXp || 0) / 100) * (this.mods ? this.mods().xp : 1);
    const list = only
      ? [only]
      : BRIDGE_SLOTS.map((sl) =>
          playerData.officers.find((officer) => officer.id === playerData.bridge[sl]),
        ).filter(Boolean);
    for (const officer of list) {
      if (officer.lv >= MAX_LEVEL) continue;
      officer.xp += Math.round(amount * k);
      while (officer.lv < MAX_LEVEL && officer.xp >= XP_LEVEL(officer.lv)) {
        officer.xp -= XP_LEVEL(officer.lv);
        officer.lv++;
        this.toast(session, `${officer.name} reached level ${officer.lv}.`);
        this.log(playerData, `${officer.name} reached level ${officer.lv}.`);
      }
    }
  },

  // ------------------------------------------------------------------ shuttles
  /**
   * Generate available shuttle mission offerings from the player's personal station.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<{id: string, name: string, hull: number, reward: number, dest: string}>} List of active shuttle job offers.
   */
  shuttleBoard(playerData) {
    if (!playerData.station.site) return [];
    const home = STELLARS[playerData.station.site].system,
      win = Math.floor(Date.now() / (JOB_WINDOW_H * 3600000));
    const r = rng(hash('sh' + playerData.name + win)),
      J = jumps(home),
      out = [];
    const cand = Object.entries(J).filter(([sid, n]) => n >= 1 && n <= 7);
    const kinds = Object.keys(SHUTTLE_JOBS);
    for (let i = 0; i < 6 && cand.length; i++) {
      const kind = kinds[i % kinds.length === i ? i : Math.floor(r() * kinds.length)],
        J_ = SHUTTLE_JOBS[kind];
      const [sys, n] = pick(r, cand),
        S = SYS[sys],
        F = FACTIONS[S.faction];
      const id = `sj-${win}-${i}`;
      if (playerData.shuttles.some((sh) => sh.job && sh.job.id === id)) continue;
      const minutes = clamp(Math.round(10 + n * 28 + S.danger * 6 + r() * 20), 15, 480);
      const job = {
        id,
        kind,
        sys,
        jumps: n,
        danger: S.danger,
        minutes,
        title: `${pick(r, J_.verbs)} ${S.name}`,
      };
      job.reward = this.shuttleReward(job, r);
      out.push(job);
    }
    return out;
  },
  /**
   * Determine credit and item rewards for a generated shuttle job.
   * @param {{kind: string, jumps: number, danger: number, sys: string}} job - Shuttle job specification.
   * @param {() => number} r - Random generator function.
   * @returns {{credits: number, chart?: boolean, mats?: Array<[string, number, number]>, rep?: [string, number]}} Reward descriptor.
   */
  shuttleReward(job, r) {
    const n = job.jumps,
      dg = job.danger,
      rw = { credits: 0 };
    const g = clamp(Math.floor((dg + n) / 3), 0, 4);
    switch (job.kind) {
      case 'delivery':
        rw.credits = Math.round(2500 + n * 2600 * (1 + dg * 0.25));
        break;
      case 'survey':
        rw.credits = Math.round(1500 + n * 1500 * (1 + dg * 0.2));
        rw.chart = true;
        break;
      case 'salvage':
        rw.credits = Math.round(800 + n * 700);
        rw.mats = [[MATERIALS[Math.floor(r() * 3)], g, 1 + (dg >= 3 ? 1 : 0)]];
        break;
      case 'envoy':
        rw.credits = Math.round(1000 + n * 900);
        rw.rep = [SYS[job.sys].faction, 3 + Math.min(7, n)];
        break;
      case 'prospect':
        rw.mats = [[MATERIALS[Math.floor(r() * 3)], clamp(g + 1, 1, 4), 1]];
        rw.credits = Math.round(500 + n * 400);
        break;
    }
    if (rw.rep && FACTIONS[rw.rep[0]].region) {
      rw.credits += 4000;
      delete rw.rep;
    }
    return rw;
  },
  /**
   * Calculate probability of success for a shuttle mission.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{kind: string}} sh - Shuttle state.
   * @param {{kind: string, danger: number}} job - Shuttle job details.
   * @param {OfficerRecord | null} crew - Assigned officer, if any.
   * @returns {number} Success chance probability in [0.15, 0.97].
   */
  shuttleChance(playerData, sh, job, crew) {
    const b = researchBonus(playerData.station),
      J = SHUTTLE_JOBS[job.kind];
    let c =
      J.base - job.danger * 0.07 + (J.fit === sh.kind ? 0.15 : -0.05) + (b.shuttlePct || 0) / 100;
    if (crew) {
      const os =
        (crew.role === 'scout' ? 1 : 0.5) *
        (6 * RARITY[crew.rarity].mult * (1 + 0.1 * (crew.lv - 1)));
      c += os / 100 + 0.03;
    }
    return clamp(c, 0.15, 0.97);
  },
  /**
   * Handle shuttle construction, crew assignment, dispatch, return claiming, repair, and scrapping.
   * @param {Session} session - Player session.
   * @param {{op: string, kind?: string, sid?: number, oid?: number, job?: string}} m - Shuttle operation payload.
   * @returns {void}
   */
  shuttleOp(session, m) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar],
      S = playerData.station;
    const atHome = p && this.ownSite(playerData, p) && !session.ent;
    switch (m.op) {
      case 'build': {
        if (!atHome) return this.toast(session, 'Shuttles are built at your Personal Station.');
        const T = SHUTTLES[m.kind];
        if (!T) return;
        if (S.ops < T.ops) return this.toast(session, `The ${T.name} needs Station Tier ${T.ops}.`);
        if (playerData.shuttles.length >= this.bays(playerData))
          return this.toast(
            session,
            'Every hangar bay is full. Build Station Tiers or research bay extensions.',
          );
        if (playerData.credits < T.cost || !this.hasMats(playerData, T.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= T.cost;
        this.takeMats(playerData, T.mats);
        playerData.shuttles.push({
          id: this.uid(playerData),
          kind: m.kind,
          state: 'idle',
          crew: null,
          runs: 0,
        });
        this.log(playerData, `Built a ${T.name}.`);
        this.toast(session, `The ${T.name} is ready in its bay.`);
        break;
      }
      case 'crew': {
        const sh = playerData.shuttles.find((x) => x.id === m.sid);
        if (!sh || sh.state === 'out') return;
        const officer = m.oid ? playerData.officers.find((x) => x.id === m.oid) : null;
        if (officer) {
          if (playerData.shuttles.some((x) => x.crew === officer.id && x.state === 'out'))
            return this.toast(session, `${officer.name} is already out.`);
          for (const k of BRIDGE_SLOTS)
            if (playerData.bridge[k] === officer.id) delete playerData.bridge[k];
          for (const x of playerData.shuttles) if (x.crew === officer.id) x.crew = null;
        }
        sh.crew = officer ? officer.id : null;
        break;
      }
      case 'send': {
        // dispatching works from anywhere: the hangar crew launch on your order
        const sh = playerData.shuttles.find((x) => x.id === m.sid);
        if (!sh || sh.state !== 'idle') return this.toast(session, 'That shuttle is not ready.');
        const job = this.shuttleBoard(playerData).find((j) => j.id === m.job);
        if (!job) return this.toast(session, 'That job is no longer posted.');
        const b = researchBonus(playerData.station),
          T = SHUTTLES[sh.kind],
          crew = sh.crew ? playerData.officers.find((officer) => officer.id === sh.crew) : null;
        const chance = this.shuttleChance(playerData, sh, job, crew),
          roll = Math.random();
        const minutes = Math.max(
          5,
          Math.round(
            job.minutes /
              T.speed /
              (1 + (b.shuttleSpeed || 0) / 100) /
              (this.mods ? this.mods().shuttleSpeed : 1),
          ),
        );
        let outcome = roll < chance ? 'success' : 'fail';
        if (outcome === 'fail') {
          const risk = ((0.25 + job.danger * 0.1) / T.armor) * (1 - (b.shuttleSafe || 0) / 100);
          outcome =
            Math.random() < risk && job.danger >= 3
              ? 'lost'
              : Math.random() < 0.6
                ? 'damaged'
                : 'fail';
        }
        sh.state = 'out';
        sh.job = job;
        sh.ends = Date.now() + minutes * 60000;
        sh.outcome = outcome;
        sh.chance = chance;
        this.log(playerData, `${T.name} launched: ${job.title} (${minutes} min).`);
        this.toast(session, `${T.name} launched. Back in ${minutes} minutes.`);
        this.shuttleTraffic(playerData, sh, 'out');
        break;
      }
      case 'claim': {
        // collect every shuttle that has come back
        const now = Date.now();
        let n = 0;
        for (const sh of playerData.shuttles.filter((x) => x.state === 'out' && now >= x.ends)) {
          this.resolveShuttle(session, sh);
          n++;
        }
        if (!n) return this.toast(session, 'No shuttles have returned yet.');
        playerData.shuttles = playerData.shuttles.filter((x) => x.state !== 'gone');
        break;
      }
      case 'repair': {
        if (!atHome) return this.toast(session, 'Repairs happen at your Personal Station.');
        const sh = playerData.shuttles.find((x) => x.id === m.sid);
        if (!sh || sh.state !== 'damaged') return;
        const cost = Math.round(SHUTTLES[sh.kind].cost * SHUTTLE_REPAIR);
        if (playerData.credits < cost) return this.toast(session, 'Not enough credits.');
        playerData.credits -= cost;
        sh.state = 'idle';
        this.toast(session, `${SHUTTLES[sh.kind].name} repaired for ${credits(cost)} credits.`);
        break;
      }
      case 'scrap': {
        if (!atHome) return;
        const sh = playerData.shuttles.find((x) => x.id === m.sid);
        if (!sh || sh.state === 'out') return;
        const back = Math.round(SHUTTLES[sh.kind].cost * 0.3);
        playerData.credits += back;
        playerData.shuttles = playerData.shuttles.filter((x) => x !== sh);
        this.toast(session, `Scrapped for ${credits(back)} credits.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Resolve an accomplished or failed shuttle mission and grant rewards or report losses.
   * @param {Session} session - Player session.
   * @param {{id: string, name: string, hull: number, ret: number, reward: number, mat: string, qty: number, xp: number}} sh - Completed shuttle state.
   * @returns {void}
   */
  resolveShuttle(session, sh) {
    const playerData = session.data,
      T = SHUTTLES[sh.kind],
      job = sh.job,
      b = researchBonus(playerData.station),
      crew = sh.crew ? playerData.officers.find((officer) => officer.id === sh.crew) : null;
    const k = (1 + (b.shuttleYield || 0) / 100) * (this.mods ? this.mods().shuttleYield : 1);
    sh.runs++;
    if (sh.outcome === 'success') {
      const rw = job.reward,
        got = [];
      if (rw.credits) {
        const c = Math.round(rw.credits * k);
        playerData.credits += c;
        playerData.stats.earned += c;
        got.push(`${credits(c)} cr`);
      }
      if (rw.mats)
        for (const [mt, g, n] of rw.mats) {
          const q = n + (Math.random() < k - 1 ? 1 : 0);
          playerData.mats[mt][g] += q;
          got.push(`${q} ${mt} ${GRADES[g]}`);
        }
      if (rw.rep) {
        playerData.rep[rw.rep[0]] = clampStanding((playerData.rep[rw.rep[0]] || 0) + rw.rep[1]);
        got.push(`+${rw.rep[1]} ${FACTIONS[rw.rep[0]].short} standing`);
      }
      if (rw.chart && !playerData.explored.includes(job.sys)) {
        playerData.explored.push(job.sys);
        got.push(`charted ${SYS[job.sys].name}`);
      }
      if (Math.random() < 0.08 + job.danger * 0.02) {
        const mt = MATERIALS[Math.floor(Math.random() * 3)],
          g = clamp(Math.floor(job.danger / 2) + 1, 1, 4);
        playerData.mats[mt][g]++;
        got.push(`rare find: ${mt} ${GRADES[g]}`);
      }
      this.toast(session, `${T.name} back from "${job.title}": ${got.join(', ')}.`);
      if (this.notify) this.notify(session, 'Shuttle home', `${T.name}: ${got.join(', ')}`);
      this.log(playerData, `${T.name} succeeded: ${job.title}. ${got.join(', ')}.`);
      if (crew) this.officerXp(session, 30 + job.jumps * 12, crew);
      if (this.goal) this.goal(session, 'shuttles');
      sh.state = 'idle';
    } else if (sh.outcome === 'lost') {
      this.toast(
        session,
        `${T.name} was lost on "${job.title}".${crew ? ` ${crew.name} made it home in an escape pod.` : ''}`,
      );
      this.log(playerData, `${T.name} lost in ${SYS[job.sys].name}.`);
      sh.state = 'gone';
    } else {
      const dmg = sh.outcome === 'damaged';
      this.toast(
        session,
        `${T.name} came back empty-handed from "${job.title}"${dmg ? ' and needs repairs' : ''}.`,
      );
      this.log(playerData, `${T.name} failed: ${job.title}${dmg ? ' (damaged)' : ''}.`);
      if (crew) this.officerXp(session, 10, crew);
      sh.state = dmg ? 'damaged' : 'idle';
    }
    sh.job = null;
    sh.outcome = null;
    sh.ends = null;
    if (sh.state !== 'gone') this.shuttleTraffic(playerData, sh, 'in');
  },
  // shuttles visibly launch from (and return to) the Personal Station when its system is live
  /**
   * Spawn ambient space entity representing shuttle departure or arrival at personal station.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{kind: string}} sh - Shuttle state.
   * @param {'out' | 'in'} dir - Traffic direction ('out' or 'in').
   * @returns {void}
   */
  shuttleTraffic(playerData, sh, dir) {
    if (!playerData.station.site) return;
    const site = STELLARS[playerData.station.site],
      sp = this.live[site.system];
    if (!sp) return;
    const T = SHUTTLES[sh.kind],
      ang = Math.random() * Math.PI * 2;
    if (dir === 'out') {
      const e = sp.makeShip({
        hull: T.hull,
        faction: 'quantum',
        x: site.x + Math.sin(ang) * 40,
        y: site.y - Math.cos(ang) * 40,
        a: ang,
        vx: Math.sin(ang) * 60,
        vy: -Math.cos(ang) * 60,
        ai: 'leave',
        name: `${playerData.name}'s ${T.name}`,
      });
      e.civil = true;
    } else {
      const e = sp.makeShip({
        hull: T.hull,
        faction: 'quantum',
        x: site.x + Math.sin(ang) * 2400,
        y: site.y - Math.cos(ang) * 2400,
        a: ang + Math.PI,
        ai: 'trade',
        name: `${playerData.name}'s ${T.name}`,
      });
      e.dest = { ...site, r: site.r };
      e.civil = true;
      sp.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
    }
  },

  // ------------------------------------------------------------------ research queue (prerequisites are queued first)
  /**
   * Resolve prerequisite chain for a research project.
   * @param {{done: string[]}} S - Player station state.
   * @param {string} id - Research project ID.
   * @returns {string[]} Ordered list of research IDs needed.
   */
  researchChain(S, id) {
    const chain = [];
    let r = RESEARCH.find((x) => x.id === id);
    while (r && !S.done.includes(r.id)) {
      chain.unshift(r.id);
      r = r.needs ? RESEARCH.find((x) => x.id === r.needs) : null;
    }
    return chain;
  },
  /**
   * Queue a research project along with any unfulfilled prerequisites.
   * @param {Session} session - Player session.
   * @param {string} id - Research project ID.
   * @returns {void}
   */
  queueResearch(session, id) {
    const playerData = session.data,
      S = playerData.station;
    const chain = this.researchChain(S, id).filter(
      (x) => x !== (S.active && S.active.id) && !S.queue.includes(x),
    );
    if (!chain.length) return this.toast(session, 'Already researched or queued.');
    if (chain.some((x) => RESEARCH.find((r) => r.id === x).ops > S.ops))
      return this.toast(session, 'That needs a higher Station Tier.');
    if (S.queue.length + chain.length > RESEARCH_QUEUE_MAX)
      return this.toast(session, `The lab queue holds ${RESEARCH_QUEUE_MAX} projects.`);
    S.queue.push(...chain);
    this.toast(
      session,
      chain.length > 1
        ? `Queued ${chain.length} projects (prerequisites first).`
        : 'Research queued.',
    );
    this.startQueued(playerData);
  },
  // start the next queued project if the lab is free and the captain can pay for it (called on every station check)
  /**
   * Start the next research project in queue if station lab is idle and funds/materials allow.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {void}
   */
  startQueued(playerData) {
    const S = playerData.station;
    if (S.active || !S.queue.length) return;
    const r = RESEARCH.find((x) => x.id === S.queue[0]);
    if (!r) {
      S.queue.shift();
      return;
    }
    if (S.done.includes(r.id)) {
      S.queue.shift();
      return this.startQueued(playerData);
    }
    if (S.ops < r.ops || (r.needs && !S.done.includes(r.needs))) return;
    if (playerData.credits < r.cost || !this.hasMats(playerData, r.mats)) {
      S.waiting = true;
      return;
    }
    S.waiting = false;
    S.queue.shift();
    playerData.credits -= r.cost;
    this.takeMats(playerData, r.mats);
    S.active = {
      id: r.id,
      ends: Date.now() + r.minutes * 60000,
      from: S.activeDoneT && S.activeDoneT > Date.now() - 1000 ? S.activeDoneT : Date.now(),
    };
  },

  // ------------------------------------------------------------------ refining: three crates make one of the next grade
  /**
   * Refine multiple material crates of grade g into grade g+1.
   * @param {Session} session - Player session.
   * @param {string} mat - Material identifier ('alloy', 'crystal', 'isotope').
   * @param {number} g - Current grade level (0 to 3).
   * @param {number} n - Number of refining operations to execute.
   * @returns {void}
   */
  refineUp(session, mat, g, n) {
    const playerData = session.data;
    if (!MATERIALS.includes(mat) || !(g >= 0 && g < 4)) return;
    n = Math.max(
      1,
      Math.min(
        n | 0 || 1,
        Math.floor(playerData.mats[mat][g] / REFINE_UP.need),
        Math.floor(playerData.credits / REFINE_UP.cost[g]),
      ),
    );
    if (playerData.mats[mat][g] < REFINE_UP.need || playerData.credits < REFINE_UP.cost[g])
      return this.toast(
        session,
        `You need ${REFINE_UP.need} ${mat} ${GRADES[g]} crates and ${credits(REFINE_UP.cost[g])} credits per refine.`,
      );
    playerData.mats[mat][g] -= n * REFINE_UP.need;
    playerData.mats[mat][g + 1] += n;
    playerData.credits -= n * REFINE_UP.cost[g];
    this.toast(
      session,
      `Refined ${n * REFINE_UP.need} ${mat} ${GRADES[g]} into ${n} ${mat} ${GRADES[g + 1]}.`,
    );
  },

  // ------------------------------------------------------------------ drydock: stored ships keep their escorts and bridge crew (fleet presets)
  /**
   * Calculate scrap/resale value of a stored ship (half hull cost + half outfit costs).
   * @param {{ship: {hull: number, outfits?: Record<string, number>}}} st - Stored ship structure.
   * @returns {number} Credit value.
   */
  storedValue(st) {
    return loadoutValue(this.A, st.ship);
  },
  /**
   * Handle drydock operations including storing and selling stored ships.
   * @param {Session} session - Player session.
   * @param {{op: string, i?: number, uid?: number}} m - Drydock operation payload.
   * @returns {void}
   */
  dockOp(session, m) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar];
    if (!p || session.ent || !this.ownSite(playerData, p))
      return this.toast(session, 'The drydock is at your Personal Station.');
    switch (m.op) {
      case 'store': {
        // 2.1: kept for older clients: FLY THIS = make it the active dock's lead; no index = store the ship you fly
        const st = m.i === undefined || m.i === null || m.i < 0 ? null : playerData.dock[m.i | 0];
        if (m.i >= 0 && !st) return;
        if (!st && playerData.shipless)
          return this.toast(session, 'You have no active ship to store.');
        return this.docksOp(session, {
          op: 'assign',
          k: playerData.activeDock,
          slot: 'lead',
          uid: st ? st.ship.uid : null,
        });
      }
      case 'sell': {
        const st = m.uid
          ? playerData.dock.find((x) => x.ship.uid === m.uid)
          : playerData.dock[m.i | 0];
        if (!st) return;
        const v = this.storedValue(st);
        playerData.credits += v;
        playerData.dock = playerData.dock.filter((x) => x !== st);
        this.unassign(playerData, st.ship.uid);
        this.toast(
          session,
          `Sold the ${this.A.ships[st.ship.hull].name} for ${credits(v)} credits.`,
        );
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },

  // ------------------------------------------------------------------ boarding
  /**
   * Handle boarding interactions with disabled ships or downed Armada captains (plunder, capture, rescue).
   * @param {Session} session - Player session.
   * @param {{id: number, act: 'plunder' | 'capture' | 'rescue'}} m - Boarding action payload.
   * @returns {void}
   */
  board(session, m) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly') return;
    const sp = this.spaces[playerData.sys],
      t = sp.ships.get(m.id);
    if (t && t.player && t.rescueT && this.rescueBoard) return this.rescueBoard(session, t); // patch up a downed Armada captain
    if (!t || !t.disabled || t.player || t.boarded)
      return this.toast(session, 'Only disabled ships can be boarded.');
    const dist = Math.hypot(t.x - entity.x, t.y - entity.y),
      rel = Math.hypot(t.vx - entity.vx, t.vy - entity.vy);
    if (dist > Math.max(120, (t.st.size + entity.st.size) * 0.5))
      return this.toast(session, 'Move alongside to board.');
    if (rel > 90) return this.toast(session, 'Match speed to board.');
    const H = this.A.ships[t.hull],
      F = FACTIONS[t.faction],
      lawful = F && !F.pirate && t.faction !== 'umbral',
      b = captainBonus(playerData);
    const repHit = (n) => {
      if (lawful && !t.mission && (playerData.rep[t.faction] || 0) > -100) {
        playerData.rep[t.faction] = clampStanding((playerData.rep[t.faction] || 0) - n);
        return ` ${F.short} standing -${n}.`;
      }
      return '';
    };
    const done = () => {
      if (this.specOnBoard) this.specOnBoard(session);
      t.boarded = true;
      sp.remove(t, 'jump');
      this.tut(session, 'board');
      if (this.goal) this.goal(session, 'boarded');
      this.db.touch();
      this.you(session);
    };
    switch (m.act) {
      case 'plunder': {
        assertLots(playerData.cargo, playerData.cargoLots);
        const cr = Math.round(
          (t.strength || 10) *
            (20 + Math.random() * 40) *
            (1 + (b.lootPct || 0) / 100) *
            (this.flying && this.flying(playerData, 'corsair') ? 2 * this.power(playerData) : 1),
        );
        playerData.credits += cr;
        playerData.stats.earned += cr;
        const got = [`${credits(cr)} credits`];
        const st = this.stats(playerData),
          used = this.holdUsed(playerData),
          room = st.cargo - used;
        if (room > 0) {
          const c = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)],
            q = Math.min(room, 2 + Math.floor(Math.random() * 9));
          addLots(playerData.cargo, playerData.cargoLots, commonLots(c.id, q), Math.max(0, room));
          got.push(`${q} t ${c.name}`);
        }
        if (Math.random() < 0.3) {
          const mt = MATERIALS[Math.floor(Math.random() * 3)],
            g = clamp(Math.floor((t.strength || 10) / 400), 0, 3);
          playerData.mats[mt][g]++;
          got.push(`${mt} ${GRADES[g]}`);
        }
        this.toast(session, `Plundered the ${H.name}: ${got.join(', ')}.${repHit(8)}`);
        this.log(playerData, `Boarded and plundered a ${H.name} in ${SYS[playerData.sys].name}.`);
        this.officerXp(session, 15);
        if (this.synGain) this.synGain(session, 'plunder');
        return done();
      }
      case 'capture': {
        const crewN = BRIDGE_SLOTS.filter((k) => playerData.bridge[k]).length;
        if (!crewN)
          return this.toast(
            session,
            'You need at least one officer on the bridge to lead a prize crew.',
          );
        const own = this.A.ships[playerData.ship.hull].strength || 10;
        const chance = clamp(
          0.3 +
            crewN * 0.15 -
            (t.strength || 10) / Math.max(40, own * 3) +
            (this.flying && this.flying(playerData, 'corsair') ? 0.25 * this.power(playerData) : 0),
          0.08,
          0.95,
        );
        if (Math.random() > chance) {
          sp.events.push(['boom', Math.round(t.x), Math.round(t.y), t.st.size]);
          entity.armor = Math.max(1, entity.armor - entity.st.armor * 0.1);
          this.toast(
            session,
            `The ${H.name}'s crew scuttled her before your prize crew could take the bridge.${repHit(10)}`,
          );
          this.log(playerData, `A capture attempt on a ${H.name} failed: scuttled.`);
          return done();
        }
        const loadout = makeLoadout(this.A, t.hull, `Prize ${H.name.split(' ')[0]}`);
        if (playerData.dock.length < this.dockSlots(playerData)) {
          loadout.uid = this.shipUid(playerData);
          playerData.dock.push({ ship: loadout, bridge: {} });
          this.toast(
            session,
            `Captured the ${H.name}! A prize crew takes her to your drydock.${repHit(15)}`,
          );
        } else {
          const v = Math.round((H.cost || 0) * CAPTURE_SELL);
          playerData.credits += v;
          this.toast(
            session,
            `Captured the ${H.name}. With no free berth she was sold at the nearest yard for ${credits(v)} credits.${repHit(15)}`,
          );
        }
        this.log(playerData, `Captured a ${H.name} in ${SYS[playerData.sys].name}.`);
        this.officerXp(session, 40);
        if (this.synGain) this.synGain(session, 'capture');
        return done();
      }
      case 'rescue': {
        if (t.storyBoard && this.storyProgress) this.storyProgress(session, t);
        if (t.arcOf && this.arcProgress) this.arcProgress(session, t);
        if (t.rescueOf) {
          const mm = playerData.missions.find((x) => x.id === t.rescueOf.id);
          if (mm) {
            mm.done = true;
            this.toast(session, `The ${t.name}'s crew are safe aboard. Land anywhere to be paid.`);
          }
        }
        if (lawful) {
          playerData.rep[t.faction] = clampStanding((playerData.rep[t.faction] || 0) + 6);
          const cr = 500 + Math.round((t.strength || 10) * 5);
          playerData.credits += cr;
          this.toast(
            session,
            `Rescued the ${H.name}'s crew. ${F.short} standing +6, and a ${credits(cr)} credit reward.`,
          );
        } else {
          const cr = Math.round(
            ((t.strength || 10) * 25 + 500) * 0.8 * (1 + (b.lootPct || 0) / 100),
          );
          playerData.credits += cr;
          playerData.stats.earned += cr;
          playerData.rep.quantum = clampStanding(playerData.rep.quantum + 2);
          this.toast(
            session,
            `Arrested the ${H.name}'s crew for the Concord. Reward: ${credits(cr)} credits.`,
          );
          for (const mm of playerData.missions)
            if (mm.type === 'bounty' && t.mission && t.mission.id === mm.id) {
              mm.done = true;
              this.toast(session, 'Bounty complete: land anywhere to collect.');
            }
        }
        this.log(playerData, `Rescued the crew of a ${H.name}.`);
        this.officerXp(session, 20);
        return done();
      }
    }
  },
};
