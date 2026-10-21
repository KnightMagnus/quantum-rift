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

const NAMES = [
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
/**
 * Deterministic pseudo-random number generator (xorshift32) from seed.
 * @param {number} seed Initial numeric seed.
 * @returns {() => number} Generator returning float in [0, 1).
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
 * Computes 32-bit FNV-1a hash of a string.
 * @param {string} str Input string.
 * @returns {number} Unsigned 32-bit hash.
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
 * Computes shortest jump distances from a given system to all reachable systems via BFS.
 * @param {string} a Starting system ID.
 * @returns {Record<string, number>} Map of system IDs to jump counts.
 */
function jumpsFrom(a) {
  const d = { [a]: 0 },
    q = [a];
  while (q.length) {
    const s = q.shift();
    for (const l of SYS[s].links)
      if (d[l] === undefined) {
        d[l] = d[s] + 1;
        q.push(l);
      }
  }
  return d;
}
const JUMPS = Object.fromEntries(SYSTEMS.map((s) => [s.id, jumpsFrom(s.id)]));

const JobOperations = {
  /**
   * Generates procedural job board mission offers for a stellar port.
   * @param {StellarBody} p Stellar port.
   * @param {PlayerData} d Player data.
   * @returns {Mission[]} Available job board missions.
   * @this {JobCapabilities}
   */
  offers(p, d) {
    if (!p.svc.includes('B')) return [];
    const win = Math.floor(Date.now() / 600000),
      r = rng(hash(p.id + win)),
      out = [],
      here = p.system;
    const near = Object.entries(JUMPS[here]).filter(
      ([s, n]) =>
        n >= 1 &&
        n <= 4 &&
        SYS[s].stellars.some((x) => x.svc.includes('L')) &&
        SYS[s].faction !== 'umbral',
    );
    const usedNames = new Set();
    for (let i = 0; i < 5 && near.length; i++) {
      const roll = r(),
        [sys, jumps] = near[Math.floor(r() * near.length)],
        S = SYS[sys];
      const id = `${p.id}-${win}-${i}`;
      if (roll < 0.65) {
        const lands = S.stellars.filter((x) => x.svc.includes('L') && !x.site),
          dest = lands[Math.floor(r() * lands.length)]; // 1.0.3: never to an empty derelict hull
        if (!dest) continue;
        const c = COMMODITIES[Math.floor(r() * COMMODITIES.length)],
          qty = 5 + Math.floor(r() * 26);
        out.push({
          id,
          type: 'cargo',
          title: `Deliver ${qty} tons of ${c.name}`,
          sys,
          dest: dest.id,
          cid: c.id,
          qty,
          reward: Math.round((800 + jumps * 1100 + qty * 60) * 1.35), // 2.4: cargo runs pay better
          text: `The sender supplies the shipment. Carry ${qty} tons of ${c.name.toLowerCase()} to ${dest.name} in the ${S.name} system (${jumps} jump${jumps > 1 ? 's' : ''}). No commodity purchase needed.`,
        });
      } else if (roll < 0.8) {
        const fac = S.danger >= 3 || r() < 0.6 || S.farside ? 'hollow' : 'umbral',
          hull = TRAFFIC[fac].war[Math.floor(r() * TRAFFIC[fac].war.length)],
          H = this.A.ships[hull];
        let ni = Math.floor(r() * NAMES.length);
        while (usedNames.has(ni)) ni = (ni + 1) % NAMES.length;
        usedNames.add(ni);
        const nm = (fac === 'hollow' ? 'Hollow captain ' : 'Umbral hunter ') + NAMES[ni];
        out.push({
          id,
          type: 'bounty',
          title: `Bounty: ${nm}`,
          sys,
          hull,
          faction: fac,
          targetName: nm,
          reward: Math.round(4000 + (H.strength || 20) * 60),
          text: `${nm} has been raiding the lanes in a ${H.name}. Find and destroy them in the ${S.name} system.`,
        });
      } else {
        const need = 2 + Math.floor(r() * 3);
        out.push({
          id,
          type: 'patrol',
          title: `Patrol ${S.name}`,
          sys,
          need,
          got: 0,
          reward: Math.round(3000 + need * 1800 + S.danger * 1500),
          text: `Destroy ${need} pirate or hostile ships in the ${S.name} system, then land anywhere to be paid.`,
        });
      }
    }
    out.push(...eventideOffers(p, d, win));
    out.push(...this.features.fronts.moreOffers(p, d, r, near, win));
    out.push(...this.features.coop.coopOffers(p, d, r, near, win)); // 2.6: Armada contracts (online games)
    {
      const X = this.features.arcs.expeditionOffer(p, d);
      if (X) out.push(X);
    } // 1.2 Farside expeditions
    out.unshift(...this.features.living.stateOffers(p, d, r, near, win)); // 2.4: jobs posted by troubled systems nearby
    out.push(
      ...this.features.syndicate.extraOffers(p, d, r, near, win, (sys) => {
        const ls = SYS[sys].stellars.filter((x) => x.svc.includes('L') && !x.site);
        return ls.length ? ls[Math.floor(r() * ls.length)] : null;
      }),
    ); // 1.2
    // 1.1 combat rating: Wanted contracts need Competent; bounties pay more as your rank rises; Dangerous captains get elite contracts
    const rank = this.features.fleetcmd.rankOf(d).i;
    for (const o of out)
      if (o.type === 'bounty' || o.type === 'assassinate')
        o.reward = Math.round(o.reward * (1 + 0.06 * rank));
    if (rank >= 5 && near.length) {
      const [sys] = near[Math.floor(r() * near.length)],
        S = SYS[sys],
        pool = [...TRAFFIC.umbral.war, ...TRAFFIC.hollow.war]
          .filter((h) => this.A.ships[h])
          .sort((a, b) => (this.A.ships[b].strength || 0) - (this.A.ships[a].strength || 0));
      const hull = pool[Math.floor(r() * Math.min(2, pool.length))],
        H = this.A.ships[hull],
        nm =
          'the ' +
          ['Ashen Admiral', 'Red Widow', 'Quiet Knife', 'Last Lantern'][Math.floor(r() * 4)];
      out.push({
        id: `${p.id}-${win}-elite`,
        type: 'bounty',
        elite: true,
        title: `ELITE CONTRACT: ${nm}`,
        sys,
        hull,
        faction: TRAFFIC.umbral.war.includes(hull) ? 'umbral' : 'hollow',
        targetName: nm,
        reward: Math.round(45000 + (H.strength || 200) * 160),
        text: `Only captains rated Dangerous or better are offered this one. ${nm} flies a ${H.name} out of ${S.name}. The Concord wants it gone.`,
      });
    }
    out.push(...freightOffers(p, win));
    const radioTour = radioTourOffer(p, d);
    if (radioTour) out.unshift(radioTour);
    out.unshift(...this.features.quests.questOffers(p, d)); // 2.4: contacts and side stories lead the board
    return out
      .filter(
        (o) =>
          !d.missions.some((m) => m.id === o.id) &&
          !(destType(o) && o.dest === p.id) &&
          !(o.type === 'assassinate' && rank < 3),
      )
      .map((o) => ({ ...o, offerVersion: 1 }));
  },
  /**
   * Accepts a mission from the local stellar job board.
   * @param {Session} s Player session.
   * @param {string} id Mission ID to accept.
   * @this {JobCapabilities}
   * @returns {void}
   */
  accept(s, id) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p) return;
    if (d.missions.length >= 6) return this.toast(s, 'You already have six jobs.');
    const o = this.offers(p, d).find((x) => x.id === id);
    if (!o) return;
    if (o.type === 'quest') return this.features.quests.questStart(s, o); // 2.4
    if (o.type === 'warband') return this.features.coop.warbandAccept(s, o); // 2.6: Armada contracts go to the whole Armada
    if (o.type === 'cargo' || o.type === 'smuggle') {
      const st = this.features.shipStats.stats(d),
        used = this.holdUsed(d);
      if (used + o.qty > st.cargo) return this.toast(s, 'Not enough cargo space for that job.');
    }
    if (!this.features.syndicate.acceptCheck(s, o)) return;
    d.missions.push({
      ...o,
      owner: s.id,
      taken: Date.now(),
      ...(o.rush ? { deadline: Date.now() + o.rush * 60000 } : {}),
    });
    this.log(d, `Accepted: ${o.title}.`);
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  /**
   * Evaluates active missions upon landing, paying rewards and logging completions.
   * @param {Session} s Player session landing.
   * @param {StellarBody} p Landed stellar port.
   * @this {JobCapabilities}
   * @returns {void}
   */
  completeOnLanding(s, p) {
    const d = s.data;
    d.lastStellar = p.id;
    for (const m of [...d.missions]) {
      if (m.type === 'miningOrder' || m.paid) continue;
      if (m.radioTour && advanceRadioTour(this, s, m, p)) continue;
      // a snapshot: follow-up jobs added on this landing wait for the next one
      if (m.type === 'supply' && m.dest === p.id && !this.features.living.supplyReady(d, m)) {
        this.toast(s, `${m.title}: you need ${m.qty} t of ${m.cid} in your hold.`);
        continue;
      }
      if ((destType(m) && m.dest === p.id) || (!destType(m) && m.done)) {
        if (m.type === 'supply') {
          applyTake(d.cargo, d.cargoLots, planTake(d.cargo, d.cargoLots, m.cid, m.qty));
          this.features.living.stateProgress(s, p.system, 'cid:' + m.cid, m.qty);
        } // 2.4: your goods are unloaded
        if (m.type === 'smuggle')
          this.features.syndicate.synGain(s, m.syn ? 'contract' : 'smuggle');
        if (m.syn === 'hit') this.features.syndicate.synGain(s, 'hit'); // 1.2
        this.features.fronts.jobDone(s, m, p);
        if (m.exp) this.features.arcs.expeditionNext(s, m);
        this.features.frontier.mastery(s, 15);
        this.features.specialists.specOnJob(s, m);
        this.tut(s, 'job');
        if (
          (m.type === 'bounty' || m.type === 'assassinate') &&
          this.features.specialists.flying(d, 'vanguard')
        ) {
          const extra = Math.round(m.reward * 0.5 * this.features.specialists.power(d));
          d.credits += extra;
          this.toast(s, `Vanguard bonus: +${credits(extra)} credits.`);
        }
        d.credits += m.reward;
        d.stats.earned += m.reward;
        m.paid = true;
        if (m.radioTour) {
          grantRadio(this, s, 'super-idol');
          this.send(s, {
            t: 'story',
            tag: 'SPACEPOP TOUR COMPLETE',
            title: 'An album for the road',
            done: true,
            text: 'Lyra, Miri and Solenne hand you a digital copy of their album. "For our favourite captain. Keep us on the radio." Super-Idol Radio has been added to your console.',
          });
        }
        d.rep[SYS[p.system].faction] = clampStanding((d.rep[SYS[p.system].faction] || 0) + 2);
        if (Math.random() < 0.35) {
          const mt = MATERIALS[Math.floor(Math.random() * 3)],
            g = Math.min(4, Math.floor(m.reward / 9000));
          d.mats[mt][g]++;
          this.toast(s, `Bonus: a ${mt} crate (grade ${GRADES[g]}).`);
        }
        this.features.hangar.officerXp(s, 20);
        this.toast(s, `Job complete: ${m.title}. Paid ${credits(m.reward)} credits.`);
        this.log(d, `Completed: ${m.title} (+${credits(m.reward)}).`);
        if (m.quest) this.features.quests.questAdvance(s, m); // 2.4: the story goes on
      }
    }
    d.missions = d.missions.filter((m) => !m.paid);
    for (const m of d.missions) if (m.type === 'bounty' && !m.done) m.spawned = false; // the target returns if you left
  },
};
