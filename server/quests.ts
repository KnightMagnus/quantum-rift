import type { QuestChain, QuestReward } from '../shared/quests.ts';
import type { StellarBody } from '../shared/galaxy.ts';
import type { SavedQuests } from './save-contracts.ts';
export interface QuestOperations {
  questInit(this: QuestsCapabilities, playerData: PlayerData): SavedQuests;
  contactAt(
    this: QuestsCapabilities,
    p: {
      id: string;
      site?: boolean | Record<string, string>;
      svc: string;
      system: string;
      outlaw?: boolean;
    } | null,
  ): Record<string, string> | null;
  questsPayload(this: QuestsCapabilities, playerData: PlayerData): QuestChain;
  questOffers(
    this: QuestsCapabilities,
    p: { id: string; site?: boolean | Record<string, string>; svc: string; system: string } | null,
    playerData: PlayerData,
  ): Array<Mission>;
  contactStory(
    this: QuestsCapabilities,
    p: { system: string; id: string },
    playerData: PlayerData,
    C: Record<string, string>,
  ): { X: QuestChain; plan: Record<string, string> } | null;
  chainReward(this: QuestsCapabilities, X: { steps: Array<QuestStep> }, lvl: number): QuestReward;
  questRewardText(this: QuestsCapabilities, R: QuestReward): string;
  questPlan(
    this: QuestsCapabilities,
    p: { id: string; system: string },
    playerData: PlayerData,
    X: QuestChain,
    C: Record<string, string>,
    r: () => number,
  ): Record<string, string> | null;
  fill(this: QuestsCapabilities, t: string, P: Record<string, string>): string;
  questStart(
    this: QuestsCapabilities,
    session: Session,
    o: { side?: string; story?: string },
  ): void;
  questStepJob(
    this: QuestsCapabilities,
    playerData: PlayerData,
    quest: QuestRecord,
    i: number,
  ): Mission;
  questPush(this: QuestsCapabilities, session: Session, quest: QuestRecord, first?: boolean): void;
  questAdvance(this: QuestsCapabilities, session: Session, mission: Mission): void;
  questFinish(this: QuestsCapabilities, session: Session, quest: QuestRecord): void;
  questFail(this: QuestsCapabilities, session: Session, qid: string, why: string): void;
  questSweep(this: QuestsCapabilities, session: Session): void;
  barTalk(
    this: QuestsCapabilities,
    p: StellarBody,
    playerData: PlayerData,
  ): Record<string, string> | null;
  questSalvageIdle(this: QuestsCapabilities, session: Session): void;
  questLoot(this: QuestsCapabilities, session: Session, it: { salvage?: string }): boolean;
}
import type { QuestsCapabilities } from './features.ts';
import type { QuestRecord, QuestStep } from '../shared/quests.ts';
import type { Mission, PlayerData, Session } from './game.ts';

import { mulberry32 as rng, fnv1a } from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { grantRadio } from './radio-discovery.ts';
import { RADIO_STATIONS, SCIENTIST_STORY } from '../shared/radio-stations.ts';
import { clampStanding } from '../shared/reputation.ts';
// Quantum Rift: questlines. Contacts at spaceport bars offer multi-step jobs that tell a small story, and seven
// handcrafted side stories wait at particular worlds. Each step is an ordinary job tagged with `m.quest`; finishing it
// tells the next part of the story and posts the next step. Owned by game.features.quests.
import {
  SYS,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  TRAFFIC,
} from '../shared/galaxy.ts';
import { CHAINS, SIDE_STORIES, CONTACT_TITLES } from '../shared/quests.ts';
import { OFFICER_NAMES, RACE_ROLES, ROLES } from '../shared/hangar.ts';
import { SPECIALISTS } from '../shared/specialty.ts';
import { credits } from '../shared/rules.ts';
import { occupiedPassengerSeats } from '../shared/passengers.ts';

/** @import { QuestRecord, QuestStep } from '../shared/quests.ts' */
/** @import { Mission, PlayerData, Session } from './game.ts' */

/**
 * 32-bit FNV-1a string hash function.
 * @param {string | number} str - Input key to hash.
 * @returns {number} 32-bit unsigned integer hash.
 */
const hash = (str: string | number): number => fnv1a(String(str));

/**
 * Pick a random item from an array.
 * @template T
 * @param {() => number} r - Random generator function returning [0, 1).
 * @param {T[]} a - Array of items.
 * @returns {T} Selected element.
 */
const pick = <T>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];

/** @type {number} Maximum number of active quests permitted simultaneously. */
export const QUEST_MAX: number = 3; // quests in progress at once

/** @type {number} Cooldown in minutes before a bar contact offers a new story chain. */
export const CONTACT_COOL_MIN: number = 15; // a contact needs this long before offering the next story

/** @type {string[]} Standing tier labels by relationship level. */
export const STANDING: string[] = ['Stranger', 'Acquaintance', 'Trusted', 'Friend', 'Old Friend'];

/** @type {string[]} Pool of civilian and quest ship names. */
const SHIP_NAMES: string[] = [
  'Marigold',
  'Fair Exchange',
  'Iron Psalm',
  'Tessaly',
  'Quiet Harbour',
  'Penny Royal',
  'Lark Ascending',
  'Ninefold',
  'Brass Hope',
  'Westering',
  'Small Mercy',
  'Old Reliable',
];

/** @type {string[]} Pool of outlaw and antagonist villain names. */
const VILLAINS: string[] = [
  '"Grin" Haskell',
  'Vessa the Hook',
  'Captain Ashmore',
  'the Tallow Knight',
  'Corvin Blackwake',
  'Mother Ninegraves',
  'Sallow Jack',
  'the Widow Fenn',
];

/**
 * Retrieve landable spaceports in a star system.
 * @param {string} sys - System ID.
 * @returns {Array<{id: string, name: string, system: string}>} List of stellar port objects.
 */
const portsOf = (sys: string): Array<(typeof SYS)[string]['stellars'][number]> =>
  SYS[sys].stellars.filter((x) => x.svc!.includes('L') && !x.site);

/** @type {Record<string, Record<string, number>>} Jump distance cache by system ID. */
const JCACHE: Record<string, Record<string, number>> = {};

const galaxyGraph = new GalaxyGraph(SYS);

/** @param {string} from @returns {Record<string, number>} */
const jumpsFrom = (from: string): Record<string, number> =>
  JCACHE[from] || (JCACHE[from] = galaxyGraph.distances(from));

/**
 * Map faction identifier to playable/officer race key.
 * @param {string} fac - Faction identifier.
 * @returns {string} Corresponding race key.
 */
const raceOf = (fac: string): string => (RACE_ROLES[fac] ? fac : 'quantum');

// the most hold space and bunks any step of a story will ask for, so the job board can warn before you take it on
/**
 * Compute the maximum cargo hold and passenger bunks required across all steps of a quest chain.
 * @param {Array<QuestStep>} steps - Quest chain steps.
 * @returns {{hold: number, pax: number}} Peak required hold and passenger capacity.
 */
export const needsOf = (steps: Array<QuestStep>): { hold: number; pax: number } => ({
  hold: Math.max(
    0,
    ...steps.map((st) =>
      st.type === 'cargo'
        ? st.qty || 4
        : st.type === 'smuggle'
          ? st.qty || 3
          : st.type === 'supply'
            ? st.qty || 0
            : 0,
    ),
  ),
  pax: Math.max(0, ...steps.map((st) => (st.type === 'passenger' ? st.pax || 1 : 0))),
});

export const QuestOperations = {
  /**
   * Initialize quest tracking structures on player data.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, QuestRecord>} Initialized quests dictionary.
   */
  questInit(this: QuestsCapabilities, playerData: PlayerData) {
    const q = (playerData.quests = playerData.quests || {});
    q.active = q.active || {};
    q.done = q.done || [];
    q.contacts = q.contacts || {};
    q.sides = q.sides || {};
    return q;
  },
  // every bar has a contact; who they are depends only on the world
  /**
   * Determine the unique bar contact stationed at a stellar body.
   * @param {{id: string, site?: boolean | Record<string, string>, svc: string, system: string, outlaw?: boolean} | null} p - Stellar body.
   * @returns {Record<string, string> | null} Contact descriptor or null if no bar available.
   */
  contactAt(
    this: QuestsCapabilities,
    p: {
      id: string;
      site?: boolean | Record<string, string>;
      svc: string;
      system: string;
      outlaw?: boolean;
    } | null,
  ) {
    if (!p || p.site || !p.svc.includes('B')) return null;
    const r = rng(hash('contact:' + p.id)),
      S = SYS[p.system],
      F = FACTIONS[S.faction] || {};
    const kind =
      p.outlaw || F.pirate ? 'shady' : S.danger >= 3 || S.farside || F.region ? 'wild' : 'lawful';
    const race = raceOf(r() < 0.75 ? S.faction : pick(r, Object.keys(RACE_ROLES))),
      N = OFFICER_NAMES[race];
    return {
      id: 'c:' + p.id,
      at: p.id,
      kind,
      race,
      name: pick(r, N[0]) + ' ' + pick(r, N[1]),
      title: pick(r, CONTACT_TITLES[kind]),
    };
  },
  /**
   * Build network telemetry payload describing active quests, completed quests, and contact standings.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {QuestChain} Quests telemetry payload.
   */
  questsPayload(this: QuestsCapabilities, playerData: PlayerData) {
    const q = this.questInit(playerData);
    return {
      active: Object.values(q.active).map((a) => ({
        qid: a.qid,
        name: a.name,
        giver: a.giver,
        at: a.at,
        step: a.step,
        of: a.steps.length,
        side: !!a.side,
        ...(a.awaitingSeats ? { awaitingSeats: { ...a.awaitingSeats } } : {}),
      })),
      done: q.done.slice(-30),
      contacts: Object.fromEntries(
        Object.entries(q.contacts).map(([k, c]) => [k, { n: c.n || 0 }]),
      ),
    };
  },
  // ---- what a bar offers you: a side story that starts here, or this contact's next story
  /**
   * Generate available quest offerings at a stellar bar (side stories and procedural contact chains).
   * @param {{id: string, site?: boolean | Record<string, string>, svc: string, system: string} | null} p - Stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<Mission>} List of quest offers.
   */
  questOffers(
    this: QuestsCapabilities,
    p: { id: string; site?: boolean | Record<string, string>; svc: string; system: string } | null,
    playerData: PlayerData,
  ) {
    const q = this.questInit(playerData),
      out: Mission[] = [];
    if (!p || !p.svc.includes('B') || p.site) return out;
    const full = Object.keys(q.active).length >= QUEST_MAX;
    for (const X of SIDE_STORIES)
      if (X.at === p.id && !q.sides[X.id] && !q.active['s:' + X.id])
        out.push({
          id: 'q:s:' + X.id,
          type: 'quest',
          side: X.id,
          title: `★ ${X.name}`,
          giver: X.giver,
          sys: STELLARS[X.steps[0].sys!] ? STELLARS[X.steps[0].sys!].system : X.steps[0].sys!,
          steps: X.steps.length,
          reward: X.reward.credits,
          full,
          text: X.intro,
          rewardText: this.questRewardText(X.reward),
          needs: needsOf(X.steps),
        });
    const C = this.contactAt(p);
    if (!C) return out;
    const cs = q.contacts[C!.id] || {},
      busy = Object.values(q.active).some((a) => a.contact === C.id);
    if (busy || (cs.cool || 0) > Date.now()) return out;
    const cur = this.contactStory(p, playerData, C);
    if (!cur) return out;
    const { X, plan } = cur;
    const lvl = Math.min(STANDING.length - 1, cs.n || 0),
      reward = this.chainReward(X, lvl);
    out.push({
      id: 'q:c:' + C.id + ':' + X.id + ':' + (cs.n || 0),
      type: 'quest',
      story: X.id,
      title: `✦ ${X.name}`,
      giver: `${C.name}, ${C.title}`,
      standing: STANDING[lvl],
      sys: plan.A,
      steps: X.steps.length,
      reward: reward.credits,
      full,
      text: this.fill(X.intro, plan),
      rewardText: this.questRewardText(reward),
      needs: needsOf(X.steps),
    });
    return out;
  },
  // which story this contact has for you next, and where it happens (the same every time you ask, until you finish one)
  /**
   * Determine next story chain and plan locations offered by a specific contact.
   * @param {{system: string, id: string}} p - Stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {Record<string, string>} C - Bar contact descriptor.
   * @returns {{X: QuestChain, plan: Record<string, string>} | null} Selected chain and route plan, or null.
   */
  contactStory(
    this: QuestsCapabilities,
    p: { system: string; id: string },
    playerData: PlayerData,
    C: Record<string, string>,
  ) {
    const cs = this.questInit(playerData).contacts[C.id] || {},
      pool = CHAINS.filter((X) => X.kind === 'any' || X.kind === C.kind);
    const r = rng(hash(playerData.name + C.id + (cs.n || 0))),
      fresh = pool.filter((x) => !(cs.last || []).includes(x.id));
    const X = (fresh.length ? fresh : pool)[Math.floor(r() * (fresh.length || pool.length))],
      plan = this.questPlan(p, playerData, X, C, r);
    return plan ? { X, plan } : null;
  },
  /**
   * Calculate credit and item rewards for completing a quest chain at a given standing level.
   * @param {{steps: Array<QuestStep>}} X - Story chain template.
   * @param {number} lvl - Contact standing level (0-4).
   * @returns {QuestReward} Reward descriptor.
   */
  chainReward(this: QuestsCapabilities, X: { steps: Array<QuestStep> }, lvl: number): QuestReward {
    const n = X.steps.length;
    return {
      credits: Math.round((14000 + n * 7000) * (1 + 0.2 * lvl)),
      crate: [null, Math.min(4, 1 + Math.floor(lvl / 2) + (n >= 4 ? 1 : 0))],
      officer: lvl >= 2 && lvl % 2 === 0 ? 'any' : null,
      bp: lvl >= 3 ? 3 + lvl : 0,
    };
  },
  /**
   * Format a textual summary of quest rewards for UI presentation.
   * @param {QuestReward} R - Reward descriptor.
   * @returns {string} Comma-separated reward description text.
   */
  questRewardText(this: QuestsCapabilities, R: QuestReward) {
    const a = R.credits ? [`${credits(R.credits)} credits`] : [];
    if (R.radio)
      a.push(`radio station: ${RADIO_STATIONS.find((s) => s.id === R.radio)?.name || R.radio}`);
    if (R.crate) a.push(`a ${R.crate[0] || 'material'} ${GRADES[R.crate[1]]} crate`);
    if (R.officer) a.push('a new officer');
    if (R.bp) a.push(`${R.bp} specialist blueprints`);
    return a.join(', ');
  },
  // the places a generated story happens: A is close (1-2 jumps), B a little further and different from A
  /**
   * Select candidate stellar worlds, ships, and targets for a procedural quest chain.
   * @param {{id: string, system: string}} p - Starting stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {QuestChain} X - Quest chain template.
   * @param {Record<string, string>} C - Contact descriptor.
   * @param {() => number} r - Random generator function.
   * @returns {Record<string, string> | null} Spatial and narrative plan variables, or null.
   */
  questPlan(
    this: QuestsCapabilities,
    p: { id: string; system: string },
    playerData: PlayerData,
    X: QuestChain,
    C: Record<string, string>,
    r: () => number,
  ) {
    const all = Object.entries(jumpsFrom(p.system)).filter(
      ([s, n]) =>
        n >= 1 && n <= 4 && portsOf(s).length && SYS[s].faction !== 'umbral' && !SYS[s].arena,
    );
    const cap = Math.max(2, (SYS[p.system].danger || 0) + 1),
      calm = all.filter(([s]) => (SYS[s].danger || 0) <= cap); // stories stay about as dangerous as where they start
    const near = calm.filter(([, n]) => n <= 2).length ? calm : all;
    const A_ = near.filter(([, n]) => n <= 2),
      B_ = near.filter(([_s, n]) => n >= 2);
    if (!A_.length) return null;
    const A = pick(r, A_)[0],
      Bp = B_.filter(([s]) => s !== A),
      B = Bp.length ? pick(r, Bp)[0] : (near.find(([s]) => s !== A) || [A])[0];
    const X1 = pick(r, portsOf(A)),
      Y1 = pick(r, portsOf(B));
    return {
      W: p.id,
      Wsys: p.system,
      A,
      B,
      X: X1.id,
      Y: Y1.id,
      ship: pick(r, SHIP_NAMES),
      target: pick(r, VILLAINS),
      contact: C ? C.name : '',
    };
  },
  /**
   * Substitute template placeholders with concrete planetary and narrative variables.
   * @param {string} t - Template text with {placeholders}.
   * @param {Record<string, string>} P - Quest plan parameters.
   * @returns {string} Interpolated narrative text.
   */
  fill(this: QuestsCapabilities, t: string, P: Record<string, string>) {
    const nm = (id: string) => (STELLARS[id] ? STELLARS[id].name : id);
    return String(t).replace(/\{(\w+)\}/g, (m, k) =>
      k === 'W' || k === 'X' || k === 'Y'
        ? nm(P[k])
        : k === 'Wsys' || k === 'A' || k === 'B'
          ? SYS[P[k]]
            ? SYS[P[k]].name
            : ''
          : P[k] != null
            ? P[k]
            : m,
    );
  },
  // ---- accepting
  /**
   * Accept and start an active side story or procedural contact quest.
   * @param {Session} session - Player session.
   * @param {{side?: string, story?: string}} o - Quest offer descriptor.
   * @returns {void}
   */
  questStart(this: QuestsCapabilities, session: Session, o: { side?: string; story?: string }) {
    const playerData = session.data,
      q = this.questInit(playerData),
      p = STELLARS[playerData.stellar!];
    if (Object.keys(q.active).length >= QUEST_MAX)
      return this.toast(
        session,
        `You can follow at most ${QUEST_MAX} stories at once. Finish or abandon one first.`,
      );
    if (playerData.missions.length >= 6) return this.toast(session, 'You already have six jobs.');
    let Q: QuestRecord;
    if (o.side) {
      const X = SIDE_STORIES.find((x) => x.id === o.side);
      if (!X || X.at !== p?.id || q.sides[X.id] || q.active['s:' + X.id]) return;
      if (
        X.id === SCIENTIST_STORY &&
        this.stats(playerData)!.cargo - this.holdUsed(playerData) < needsOf(X.steps).hold
      )
        return this.toast(session, 'Free two tonnes of hold space for the repair kit first.');
      Q = {
        qid: 's:' + X.id,
        side: X.id,
        name: X.name,
        giver: X.giver,
        at: X.at,
        plan: { W: X.at, Wsys: STELLARS[X.at].system, contact: X.giver },
        steps: X.steps.map((st) => ({ ...st })),
        step: 0,
        started: Date.now(),
        tries: 0,
      };
    } else {
      const C = this.contactAt(p),
        cur = C && this.contactStory(p, playerData, C);
      if (!cur || cur.X.id !== o.story) return;
      const cs = q.contacts[C!.id] || {},
        X = cur.X,
        plan = cur.plan;
      Q = {
        qid: 'c:' + C.id.slice(2) + ':' + X.id,
        chain: X.id,
        contact: C.id,
        name: X.name,
        giver: `${C.name}, ${C.title}`,
        at: p.id,
        plan,
        steps: X.steps.map((st) => ({ ...st })),
        step: 0,
        started: Date.now(),
        tries: 0,
        lvl: Math.min(STANDING.length - 1, cs.n || 0),
      };
    }
    q.active[Q.qid] = Q;
    this.log(playerData, `Story begun: ${Q.name} (${Q.giver}).`);
    this.questPush(session, Q, true);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // turn a step into a concrete job
  /**
   * Instantiate a concrete mission job object for a given quest step.
   * @param {PlayerData} playerData - Saved player data.
   * @param {QuestRecord} quest - Active quest state.
   * @param {number} i - Step index.
   * @returns {Mission} Concrete mission specification.
   */
  questStepJob(
    this: QuestsCapabilities,
    playerData: PlayerData,
    quest: QuestRecord,
    i: number,
  ): Mission {
    const st = quest.steps[i],
      P = quest.plan,
      r = rng(hash(quest.qid + i + quest.started));
    const sys = st.sys || (st.where === 'W' ? P.Wsys : st.where === 'B' ? P.B : P.A);
    const port = st.sys
      ? portsOf(st.sys)[0].id
      : st.where === 'W'
        ? P.W
        : st.where === 'B'
          ? P.Y
          : P.X;
    const S = SYS[sys],
      jumps = 2,
      dz = S.danger || 1;
    const F = (t: string) => this.fill(t, { ...P, target: st.target || P.target });
    const m = {
      id: `${quest.qid}#${i}`,
      quest: { qid: quest.qid, step: i, of: quest.steps.length, name: quest.name },
      type: st.type,
      sys,
      title: F(st.title),
      text: F(st.brief),
      taken: Date.now(),
      owner: null,
    } as Mission;
    switch (st.type) {
      case 'cargo':
        Object.assign(m, {
          dest: st.dest || port,
          cid: st.cid || 'equipment',
          qty: st.qty || 4,
          reward: Math.round(1500 + jumps * 1200 + (st.qty || 4) * 90),
        });
        if (st.rush) {
          m.rush = st.rush;
          m.deadline = Date.now() + st.rush * 60000;
        }
        break;
      case 'smuggle':
        Object.assign(m, {
          dest: st.dest || port,
          qty: st.qty || 3,
          reward: Math.round(8000 + (st.qty || 3) * 600),
        });
        break;
      case 'passenger':
        Object.assign(m, {
          dest: st.dest || port,
          pax: st.pax || 1,
          reward: Math.round(2500 + (st.pax || 1) * 1200),
        });
        break;
      case 'supply':
        Object.assign(m, {
          dest: st.dest || port,
          cid: st.cid,
          qty: st.qty,
          reward: Math.round(
            (COMMODITIES.find((c) => c.id === st.cid) || { base: 100 }).base * st.qty! * 1.5 + 3000,
          ),
        });
        break;
      case 'survey': {
        const pts = S.stellars.slice(0, 3).map((x) => [x.x, x.y]);
        while (pts.length < 3) {
          const a = r() * 6.28,
            dd = 900 + r() * 1100;
          pts.push([Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd)]);
        }
        Object.assign(m, { points: pts, reward: Math.round(4000 + dz * 1200) });
        break;
      }
      case 'salvage': {
        const a = r() * 6.28,
          dd = 1200 + r() * 900;
        Object.assign(m, {
          point: [Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd)],
          reward: Math.round(4500 + dz * 1200),
        });
        break;
      }
      case 'rescue':
        Object.assign(m, {
          hull: pick(r, [704, 705, 707]),
          faction: 'spacer',
          wreckName: P.ship || pick(r, SHIP_NAMES),
          reward: Math.round(5000 + dz * 1500),
        });
        break;
      case 'bounty': {
        const fac = st.hostile || 'hollow',
          pool = TRAFFIC[fac].war
            .filter((h) => this.A.ships[h])
            .sort((a, b) => (this.A.ships[a].strength || 0) - (this.A.ships[b].strength || 0));
        const hull =
            pool[
              Math.min(pool.length - 1, Math.floor(pool.length * (0.25 + 0.15 * Math.min(4, dz))))
            ],
          nm = st.target || P.target;
        Object.assign(m, {
          hull,
          faction: fac,
          targetName: nm,
          reward: Math.round(5000 + (this.A.ships[hull].strength || 20) * 60),
        });
        break;
      }
      case 'assassinate': {
        const ff = st.hostile || 'hollow';
        Object.assign(m, {
          hull: ff === 'umbral' ? 763 : 717,
          guard: ff === 'umbral' ? 761 : 711,
          faction: ff,
          targetName: st.target || P.target,
          reward: Math.round(22000 + dz * 5000),
        });
        break;
      }
      case 'convoy': {
        const dest = pick(r, portsOf(sys));
        Object.assign(m, {
          dest: dest.id,
          hull: pick(r, [704, 706, 712]),
          faction: 'spacer',
          convoyName: quest.side === 'caravan' ? 'Clockwork' : pick(r, SHIP_NAMES),
          raiders: 2 + Math.min(2, dz >> 1),
          raiderHull: pick(r, [705, 708, 711]),
          reward: Math.round(6000 + dz * 2500),
        });
        m.text = `${m.text} She is bound for ${dest.name}.`;
        break;
      }
      case 'patrol':
        Object.assign(m, {
          need: st.need || 3,
          got: 0,
          reward: Math.round(3000 + (st.need || 3) * 2000 + dz * 1500),
        });
        break;
    }
    if (quest.side) m.reward = Math.round(m.reward * 1.25);
    return m;
  },
  /**
   * Push current step's job onto the player's active mission list.
   * @param {Session} session - Player session.
   * @param {QuestRecord} quest - Active quest state.
   * @param {boolean} [first] - True if first step initiation.
   * @returns {void}
   */
  questPush(this: QuestsCapabilities, session: Session, quest: QuestRecord, first?: boolean) {
    const playerData = session.data,
      mission = this.questStepJob(playerData, quest, quest.step);
    mission.owner = session.id;
    if (mission.type === 'passenger') {
      const waiting = quest.awaitingSeats,
        at = waiting?.at || playerData.stellar || playerData.lastStellar || quest.at,
        others = playerData.missions.filter((x) => x.id !== mission.id && !x.paid),
        free =
          (playerData.shipless ? 0 : this.stats(playerData)!.passengerSeats || 0) -
          occupiedPassengerSeats(others);
      if (waiting && (session.ent || playerData.stellar !== at)) return false;
      if (free < mission.pax! || others.length >= 6) {
        quest.awaitingSeats = { at, pax: mission.pax!, title: mission.title, text: mission.text };
        if (!waiting)
          this.toast(
            session,
            `${quest.name}: passengers are waiting at ${STELLARS[at]?.name || at}. Free ${mission.pax} passenger seats and a mission slot, then board here.`,
          );
        return false;
      }
      delete quest.awaitingSeats;
    }
    playerData.missions = playerData.missions.filter((x) => x.id !== mission.id);
    playerData.missions.push(mission);
    if (mission.type === 'cargo' || mission.type === 'smuggle') {
      const free = this.stats(playerData)!.cargo - this.holdUsed(playerData);
      if (free < 0)
        this.toast(
          session,
          `${quest.name}: this step needs ${mission.qty} t of hold space. Clear some room.`,
        );
    }
    if (!first)
      this.toast(
        session,
        `${quest.name}, step ${quest.step + 1} of ${quest.steps.length}: ${mission.title}.`,
      );
    return true;
  },
  // a step was paid (called from completeOnLanding)
  /**
   * Advance an active quest chain to its next step after completing the current step's job.
   * @param {Session} session - Player session.
   * @param {Mission} mission - Completed mission record.
   * @returns {void}
   */
  questAdvance(this: QuestsCapabilities, session: Session, mission: Mission) {
    const playerData = session.data,
      q = this.questInit(playerData),
      quest = q.active[mission.quest!.qid];
    if (!quest || quest.step !== mission.quest!.step) return;
    const st = quest.steps[quest.step],
      P = { ...quest.plan, target: st.target || quest.plan.target };
    quest.step++;
    quest.tries = 0;
    if (quest.step >= quest.steps.length) return this.questFinish(session, quest);
    const next = this.questStepJob(playerData, quest, quest.step);
    this.send(session, {
      t: 'story',
      tag: `${quest.side ? 'SIDE STORY' : 'QUEST'} · ${quest.name.toUpperCase()}`,
      title: mission.title,
      done: true,
      text: `${this.fill(st.beat || '', P)}\n\nNext (step ${quest.step + 1} of ${quest.steps.length}): ${next.title}. ${next.text}`,
    });
    this.questPush(session, quest, true);
    this.db.touch();
  },
  /**
   * Complete a quest chain, awarding credits, crates, blueprints, officers, and standing.
   * @param {Session} session - Player session.
   * @param {QuestRecord} quest - Completed quest structure.
   * @returns {void}
   */
  questFinish(this: QuestsCapabilities, session: Session, quest: QuestRecord) {
    const playerData = session.data,
      q = this.questInit(playerData);
    if (q.active[quest.qid] !== quest) return;
    delete q.active[quest.qid];
    let R, endText, X;
    if (quest.side) {
      X = SIDE_STORIES.find((x) => x.id === quest.side)!;
      R = X.reward;
      q.sides[quest.side] = Date.now();
      endText = X.end;
    } else {
      X = CHAINS.find((x) => x.id === quest.chain)!;
      R = this.chainReward(X, quest.lvl || 0);
      endText = this.fill(X.end, quest.plan);
      const cs = (q.contacts[quest.contact!] = q.contacts[quest.contact!] || {});
      cs.n = (cs.n || 0) + 1;
      cs.cool = Date.now() + CONTACT_COOL_MIN * 60000;
      cs.last = [quest.chain, ...(cs.last || [])].slice(0, 3);
    }
    const got = R.credits ? [`${credits(R.credits)} credits`] : [];
    if (R.radio && grantRadio(this, session, R.radio))
      got.push(`radio station: ${RADIO_STATIONS.find((s) => s.id === R.radio)!.name}`);
    playerData.credits += R.credits;
    playerData.stats.earned += R.credits;
    if (R.crate) {
      const mt = R.crate[0] || MATERIALS[Math.floor(Math.random() * MATERIALS.length)],
        g = R.crate[1];
      playerData.mats[mt][g] = (playerData.mats[mt][g] || 0) + 1;
      got.push(`a ${mt} ${GRADES[g]} crate`);
    }
    if (R.bp) {
      const sp = SPECIALISTS[Math.abs(hash(quest.qid)) % SPECIALISTS.length];
      playerData.bp = playerData.bp || {};
      playerData.bp[sp.id] = (playerData.bp[sp.id] || 0) + R.bp;
      got.push(`${R.bp} ${sp.name} blueprints`);
    }
    if (R.officer) {
      playerData.officers = playerData.officers || [];
      if (playerData.officers.length < 24) {
        const race =
            R.officer === 'any' ? raceOf(SYS[STELLARS[quest.at].system].faction) : R.officer,
          roles = RACE_ROLES[race] || ['engineer'],
          N = OFFICER_NAMES[race];
        const o = {
          id: this.uid(playerData),
          name:
            N[0][Math.floor(Math.random() * N[0].length)] +
            ' ' +
            N[1][Math.floor(Math.random() * N[1].length)],
          race,
          role: roles[Math.floor(Math.random() * roles.length)],
          rarity: 2,
          lv: 3,
          xp: 0,
        };
        playerData.officers.push(o);
        got.push(
          `${o.name} joins your crew (Rare ${ROLES[o.role] ? ROLES[o.role].name.toLowerCase() : o.role})`,
        );
      } else got.push('(no room on your roster for the officer who offered to join)');
    }
    const fac = SYS[STELLARS[quest.at].system].faction;
    if (FACTIONS[fac] && !FACTIONS[fac].pirate)
      playerData.rep[fac] = clampStanding((playerData.rep[fac] || 0) + (quest.side ? 8 : 4));
    q.done.push({
      id: quest.qid,
      name: quest.name,
      giver: quest.giver,
      side: !!quest.side,
      t: Date.now(),
    });
    this.log(playerData, `Story complete: ${quest.name}.`);
    this.send(session, {
      t: 'story',
      tag: `${quest.side ? 'SIDE STORY' : 'QUEST'} COMPLETE · ${quest.name.toUpperCase()}`,
      title: quest.name,
      done: true,
      text: `${endText}\n\nRewards: ${got.join(', ')}.`,
    });
    this.db.touch();
    this.you(session);
  },
  /**
   * Terminate and fail an active quest chain.
   * @param {Session} session - Player session.
   * @param {string} qid - Quest ID string.
   * @param {string} why - Explanation of failure.
   * @returns {void}
   */
  questFail(this: QuestsCapabilities, session: Session, qid: string, why: string) {
    const playerData = session.data,
      q = this.questInit(playerData),
      quest = q.active[qid];
    if (!quest) return;
    delete q.active[qid];
    playerData.missions = playerData.missions.filter((m) => !(m.quest && m.quest.qid === qid));
    if (quest.contact) {
      const cs = (q.contacts[quest.contact!] = q.contacts[quest.contact!] || {});
      cs.cool = Date.now() + CONTACT_COOL_MIN * 60000;
    }
    this.toast(
      session,
      `Story ended: ${quest.name} (${why}).${quest.side ? ' You can start it again where it began.' : ''}`,
    );
    this.log(playerData, `Story ended: ${quest.name} (${why}).`);
    this.db.touch();
  },
  // every two seconds: a step lost with your ship, a missed deadline or a destroyed convoy gets one more chance
  /**
   * Periodic check on active quest steps to allow second chance or mark failure.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  questSweep(this: QuestsCapabilities, session: Session) {
    const playerData = session.data,
      q = playerData.quests;
    if (!q || !q.active) return;
    for (const Q of Object.values(q.active)) {
      if (Q.awaitingSeats) {
        if (
          !session.ent &&
          playerData.stellar === Q.awaitingSeats.at &&
          this.questPush(session, Q, true)
        ) {
          this.toast(session, `${Q.name}: your waiting passengers have boarded.`);
          this.db.touch();
          this.you(session);
          this.landed(session);
        }
        // Waiting for a suitable ship is not a lost mission and consumes no retry.
        continue;
      }
      if (playerData.missions.some((m) => m.quest && m.quest.qid === Q.qid)) continue;
      if (Q.tries >= 1) {
        this.questFail(session, Q.qid, 'the job failed twice');
        this.you(session);
        continue;
      }
      Q.tries++;
      this.questPush(session, Q, true);
      this.toast(
        session,
        `${Q.name}: the step failed, but the story isn't over. Try again: ${Q.steps[Q.step] ? this.fill(Q.steps[Q.step].title, Q.plan) : ''}.`,
      );
      this.db.touch();
      this.you(session);
    }
  },
  // ---- the contact's talk at the bar: a greeting that knows you, and a rumour worth acting on
  /**
   * Retrieve dynamic conversation dialogue and trade/system rumors from a bar contact.
   * @param {{id: string, system: string}} p - Landed stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string> | null} Bar dialogue descriptor, or null.
   */
  barTalk(this: QuestsCapabilities, p: StellarBody, playerData: PlayerData) {
    const C = this.contactAt(p);
    if (!C) return null;
    const q = this.questInit(playerData),
      n = (q.contacts[C.id] || {}).n || 0,
      lvl = Math.min(STANDING.length - 1, n),
      win = Math.floor(Date.now() / 600000),
      r = rng(hash(C.id + win));
    const hello = [
      [
        `"Haven't seen you in here before, Captain."`,
        `"New face. Pull up a stool."`,
        `"Buy a drink and I might have work for you."`,
      ],
      [
        `"Back again? Good. I remember a reliable pilot."`,
        `"Captain ${playerData.name}. Your usual?"`,
      ],
      [`"There's my favourite captain. Sit, sit."`, `"I was hoping you'd come by."`],
      [
        `"${playerData.name}! The drinks are on me tonight."`,
        `"I tell everyone about you, you know."`,
      ],
      [`"Old friend. Whatever you need, it's yours."`],
    ][lvl];
    const rumors = [],
      near = Object.entries(jumpsFrom(p.system)).filter(([, j]) => j >= 1 && j <= 4);
    for (const [sys, j] of near) {
      const st = this.stateOf(sys);
      if (!st) continue;
      const S = SYS[sys];
      const want = {
        famine: 'food',
        refugees: 'food',
        plague: 'medical',
        rush: 'ore',
        war: 'equipment',
        boom: 'luxury',
        festival: 'luxury',
      }[st.kind];
      rumors.push(
        `"Word is ${S.name} has troubles: ${{ famine: 'a famine', plague: 'a fever', boom: 'a boom on', war: 'a war on', pirates: 'pirates thick as flies', festival: 'a festival on', rush: 'a mining rush', refugees: 'refugees everywhere' }[st.kind]}. ${j} jump${j > 1 ? 's' : ''} from here.${want ? ` A hold full of ${COMMODITIES.find((c) => c.id === want)!.name.toLowerCase()} would sell for a fortune.` : st.kind === 'pirates' ? ' The bounties there pay extra.' : ''}"`,
      );
    }
    const mk = this.market(p);
    let tip = null;
    if (mk) {
      const ports = near
        .filter(([, j]) => j <= 2)
        .flatMap(([sys]) =>
          portsOf(sys)
            .filter((x) => x.svc!.includes('T'))
            .map((x) => STELLARS[x.id]),
        );
      let best = null;
      for (const c of mk)
        for (const stellarBody of ports) {
          const om = this.market(stellarBody);
          const oc = om && om.find((x) => x.id === c.id);
          if (oc && oc.price! - c.price! > (best ? best.gain : c.price! * 0.15))
            best = { c, o: stellarBody, gain: oc.price! - c.price! };
        }
      if (best)
        tip = `"Smart money buys ${best.c.name.toLowerCase()} here and sells at ${best.o.name}. ${credits(best.gain)} a ton, last I heard."`;
    }
    const flavour = {
      lawful: [
        `"The Concord Watch has been busier than usual. Keep your papers in order."`,
        `"Insurance rates are up again. Fly careful."`,
      ],
      shady: [
        `"Patrols scan less in the outer lanes. Just saying."`,
        `"Everybody's selling something. The trick is knowing who's buying."`,
      ],
      wild: [
        `"Out here, the only law is fuel and nerve."`,
        `"Found a rock last week with shards in it the size of my fist. Gone now, of course."`,
      ],
    }[C.kind];
    const roll = r(),
      rumor =
        tip && roll < 0.4
          ? tip
          : rumors.length && roll < 0.85
            ? pick(r, rumors)
            : tip || pick(r, flavour!);
    return {
      name: C.name,
      title: C.title,
      race: C.race,
      standing: STANDING[lvl],
      hello: pick(r, hello),
      rumor,
    };
  },
  // ---- salvage steps: a crate appears at the marked point when you come close
  /**
   * Spawn a floating salvage container when player ship nears marked quest coordinates.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  questSalvageIdle(this: QuestsCapabilities, session: Session) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity) return;
    const sp = this.spaces[playerData.sys];
    if (!sp) return;
    for (const m of playerData.missions) {
      if (m.type !== 'salvage' || m.sys !== playerData.sys || m.done || !m.point) continue;
      if (Math.hypot(m.point[0] - entity.x, m.point[1] - entity.y) > 1500) continue;
      if (sp.loot.some((l) => !l.taken && l.it.salvage === m.id)) continue;
      sp.loot.push({
        id: sp.nextLootId(),
        x: m.point[0],
        y: m.point[1],
        vx: 0,
        vy: 0,
        it: { salvage: m.id, owner: session.id },
        t: sp.t + 600,
        kind: 5,
      });
      this.toast(session, 'Salvage on your scanner: fly over the marked crate to scoop it up.');
    }
  },
  /**
   * Handle collecting a quest salvage floating loot entity.
   * @param {Session} session - Player session.
   * @param {{salvage: string}} it - Collected loot cargo item.
   * @returns {boolean} True if matching salvage quest was completed.
   */
  questLoot(this: QuestsCapabilities, session: Session, it: { salvage?: string }) {
    const playerData = session.data,
      m = playerData.missions.find((x) => x.id === it.salvage && !x.done);
    if (!m) return false;
    m.done = true;
    this.toast(session, `Recovered: ${m.title}. Land anywhere to continue.`);
    this.db.touch();
    this.you(session);
    return true;
  },
};
