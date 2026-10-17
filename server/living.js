import { clampStanding } from '../shared/reputation.js';
// Quantum Rift 2.4 "Living Galaxy": system states that come and go, a market that remembers what captains sold, and
// supply jobs that pay you to bring what a troubled system needs. Mixed into Game.
import { SYSTEMS, SYS, STELLARS, FACTIONS, COMMODITIES } from '../shared/galaxy.js';
import { STATES, STATE_SHARE, STATE_MIN, TRADE_IMPACT } from '../shared/living.js';
import { credits } from '../shared/rules.js';

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} v - Value to clamp.
 * @param {number} a - Minimum value.
 * @param {number} b - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Pick a random item from an array.
 * @template T
 * @param {T[]} a - Array of items.
 * @returns {T} Chosen item.
 */
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** @type {Record<string, (system: import('./game.js').SpaceSystem | Record<string, unknown>, state?: Record<string, unknown>) => string>} Headline generators for system events. */
const START_NEWS = {
  famine: (S) => `Famine grips ${S.name}: food prices have doubled and relief is needed.`,
  plague: (S) => `A fever spreads through ${S.name}. Medical supplies are urgently needed.`,
  boom: (S) => `${S.name} is booming: luxuries and equipment are selling high.`,
  war: (S, st) =>
    `War in ${S.name}: ${FACTIONS[st.enemy].name} ships are attacking the ${FACTIONS[S.faction].short}.`,
  pirates: (S) => `Raiders have the lanes in ${S.name}. Bounties there pay half again.`,
  festival: (S) => `A festival fills the spaceports of ${S.name}.`,
  rush: (S) => `A mining rush in ${S.name}: refineries are paying top price for ore.`,
  refugees: (S) => `Refugees are pouring into ${S.name}. Food, medicine and passage are scarce.`,
};

export const LivingOperations = {
  /**
   * Initialize living world state containers in the database.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  livingInit() {
    const W = this.db.world;
    W.states = W.states || {};
    W.stateCool = W.stateCool || {};
    W.tradeImpact = W.tradeImpact || {};
  },
  /**
   * Get all non-arena systems with active trade ports.
   * @this {Record<string, unknown>}
   * @returns {string[]} List of system IDs.
   */
  marketSystems() {
    return (
      this._mkt ||
      (this._mkt = SYSTEMS.filter(
        (S) => !S.arena && S.stellars.some((p) => p.svc && p.svc.includes('T') && !p.site),
      ).map((S) => S.id))
    );
  },
  /**
   * Look up the currently active event state for a system.
   * @this {Record<string, unknown>}
   * @param {string} sysId - System ID.
   * @returns {Record<string, unknown> | null} System state object or null if none active.
   */
  stateOf(sysId) {
    const st = this.db.world.states && this.db.world.states[sysId];
    return st && st.until > Date.now() ? st : null;
  },
  // a war needs an enemy: a power hostile to the system's owner, preferably one next door
  /**
   * Select a hostile enemy faction for a system entering a war state.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').SpaceSystem} S - System metadata.
   * @returns {string | null} Hostile enemy faction key or null.
   */
  warEnemy(S) {
    const F = FACTIONS[S.faction];
    if (!F || F.region || F.pirate || S.faction === 'umbral') return null;
    const next = new Set(
      S.links
        .map((l) => SYS[l].faction)
        .filter(
          (f) => f !== S.faction && FACTIONS[f] && !FACTIONS[f].region && F.hostile.includes(f),
        ),
    );
    const pool = next.size
      ? [...next]
      : F.hostile.filter((f) => FACTIONS[f] && !FACTIONS[f].region && f !== 'umbral');
    return pool.length ? pick(pool) : null;
  },
  /**
   * Advance the living galaxy simulation tick, updating system states and generating news.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  livingTick() {
    this.livingInit();
    const W = this.db.world,
      now = Date.now();
    let changed = false;
    for (const [sys, st] of Object.entries(W.states))
      if (st.until <= now) {
        delete W.states[sys];
        W.stateCool[sys] = now + 20 * 60000;
        this.news(
          STATES[st.kind].end
            .replace('{sys}', SYS[sys].name)
            .replace('{fac}', FACTIONS[SYS[sys].faction].name),
        );
        changed = true;
      }
    const want = Math.round(this.marketSystems().length * STATE_SHARE);
    for (
      let tries = 0, lim = this._livingStarted ? 6 : want * 3;
      Object.keys(W.states).length < want && tries < lim;
      tries++
    ) {
      const sys = pick(this.marketSystems()),
        S = SYS[sys];
      if (W.states[sys] || (W.stateCool[sys] || 0) > now) continue;
      const kinds = Object.entries(STATES).filter(
        ([k]) =>
          !((k === 'war' || k === 'pirates') && S.stellars.some((x) => x.hub)) &&
          (k !== 'war' || this.warEnemy(S)) &&
          (k !== 'rush' || (S.fields || []).length) &&
          (k !== 'pirates' || !FACTIONS[S.faction].pirate),
      );
      let tot = kinds.reduce((a, [, X]) => a + X.weight, 0),
        roll = Math.random() * tot,
        kind = kinds[0][0];
      for (const [k, X] of kinds) {
        roll -= X.weight;
        if (roll <= 0) {
          kind = k;
          break;
        }
      }
      const X = STATES[kind],
        st = {
          kind,
          start: now,
          until: now + (STATE_MIN[0] + Math.random() * (STATE_MIN[1] - STATE_MIN[0])) * 60000,
          got: 0,
          need: X.need ? X.need.qty : 0,
        };
      if (kind === 'war') st.enemy = this.warEnemy(S);
      W.states[sys] = st;
      this.news(START_NEWS[kind](S, st));
      changed = true;
    }
    this._livingStarted = true;
    if (changed) {
      this.db.touch();
      this.worldKey = null;
    }
  },
  /**
   * Compile a summary payload of all active system states for client sync.
   * @this {Record<string, unknown>}
   * @returns {Record<string, unknown>} Active system states map.
   */
  statesPayload() {
    const out = {};
    for (const [sys, st] of Object.entries(this.db.world.states || {}))
      if (st.until > Date.now())
        out[sys] = {
          k: st.kind,
          got: st.got,
          need: st.need,
          until: st.until,
          enemy: st.enemy || null,
        };
    return out;
  },
  // ---- prices: the system's state and what captains have been selling or buying at this world
  /**
   * Calculate decayed trade impact factor on prices for a commodity at a stellar port.
   * @this {Record<string, unknown>}
   * @param {string} sid - Stellar port ID.
   * @param {string} cid - Commodity ID.
   * @returns {number} Fractional impact on price.
   */
  impact(sid, cid) {
    const T = (this.db.world.tradeImpact || {})[sid];
    const x = T && T[cid];
    if (!x) return 0;
    const v = x.v * Math.pow(0.5, (Date.now() - x.t) / (TRADE_IMPACT.halfLifeMin * 60000));
    if (Math.abs(v) < 0.004) {
      delete T[cid];
      return 0;
    }
    return v;
  },
  /**
   * Record trade volume and apply price impact for a commodity at a stellar port.
   * @this {Record<string, unknown>}
   * @param {string} sid - Stellar port ID.
   * @param {string} cid - Commodity ID.
   * @param {number} tons - Traded volume (positive for sales, negative for purchases).
   * @returns {void}
   */
  addImpact(sid, cid, tons) {
    // tons > 0: sold here (the price falls); < 0: bought here (the price rises)
    const W = this.db.world;
    W.tradeImpact = W.tradeImpact || {};
    const T = (W.tradeImpact[sid] = W.tradeImpact[sid] || {});
    T[cid] = {
      v: clamp(
        this.impact(sid, cid) + tons * TRADE_IMPACT.perTon,
        -TRADE_IMPACT.max,
        TRADE_IMPACT.max,
      ),
      t: Date.now(),
    };
  },
  /**
   * Calculate effective price multiplier from active system event and player trade impact.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').StellarBody} p - Stellar body object.
   * @param {string} cid - Commodity ID.
   * @returns {number} Price multiplier.
   */
  livingMult(p, cid) {
    const st = this.stateOf(p.system),
      sm = st ? STATES[st.kind].prices[cid] || 1 : 1;
    return sm * (1 - this.impact(p.id, cid));
  },
  // ---- captains ending states early
  /**
   * Contribute progress towards resolving an active troubled system event.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {string} sys - System ID.
   * @param {string} what - Progress category key (e.g. 'cid:food', 'kill:pirate').
   * @param {number} n - Amount of progress units.
   * @returns {void}
   */
  stateProgress(s, sys, what, n) {
    const st = this.stateOf(sys);
    if (!st || !st.need) return;
    const X = STATES[st.kind];
    const counts =
      (X.need.cid && what === 'cid:' + X.need.cid) ||
      (X.need.kills === 'pirate' && what === 'kill:pirate') ||
      (X.need.kills === 'enemy' && what === 'kill:' + st.enemy);
    if (!counts) return;
    s.data.stats.stateHelp = (s.data.stats.stateHelp || 0) + 1; // 2.5: the career step
    const before = st.got;
    st.got = Math.min(st.need, st.got + n);
    this.db.touch();
    if (st.got >= st.need) return this.resolveState(s, sys);
    if (Math.floor(before / (st.need / 4)) !== Math.floor(st.got / (st.need / 4)))
      this.toast(
        s,
        `${X.name} in ${SYS[sys].name}: ${st.got} / ${st.need} ${X.need.cid ? 't delivered' : 'destroyed'}.`,
      );
  },
  /**
   * Conclude an active system state early due to player contribution, distributing rewards.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session that triggered resolution.
   * @param {string} sys - System ID.
   * @returns {void}
   */
  resolveState(s, sys) {
    const W = this.db.world,
      st = W.states[sys],
      X = STATES[st.kind],
      S = SYS[sys],
      d = s.data;
    delete W.states[sys];
    W.stateCool[sys] = Date.now() + 30 * 60000;
    this.worldKey = null;
    const reward = 15000 + st.need * 120;
    d.credits += reward;
    d.stats.earned += reward;
    d.rep[S.faction] = clampStanding((d.rep[S.faction] || 0) + 6);
    this.news(
      `${X.end.replace('{sys}', S.name).replace('{fac}', FACTIONS[S.faction].name)} ${d.name} led the effort.`,
    );
    this.toast(
      s,
      `You ended the ${X.name.toLowerCase()} in ${S.name}! The ${FACTIONS[S.faction].short} pay you ${credits(reward)} credits (+6 standing).`,
    );
    this.log(d, `Ended the ${X.name.toLowerCase()} in ${S.name}.`);
    this.db.touch();
    this.you(s);
  },
  /**
   * Check killed NPC to progress pirate or war crisis states in the system.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session scoring the kill.
   * @param {import('./space.js').Entity} npc - Killed NPC entity.
   * @param {import('./space.js').Space} space - Space instance where the kill occurred.
   * @returns {void}
   */
  stateOnKill(s, npc, space) {
    const F = FACTIONS[npc.faction] || {};
    if (F.pirate || npc.faction === 'hollow') this.stateProgress(s, space.id, 'kill:pirate', 1);
    this.stateProgress(s, space.id, 'kill:' + npc.faction, 1);
  },
  // ---- the jobs a troubled system posts (merged into nearby job boards)
  /**
   * Generate emergency relief, patrol, or evacuation jobs for nearby troubled systems.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').StellarBody} p - Landed stellar body.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {() => number} r - Seeded RNG function.
   * @param {Array<[string, number]>} near - Array of [systemId, jumps] tuples.
   * @param {number} win - Time window seed.
   * @returns {Array<Record<string, unknown>>} Generated mission objects.
   */
  stateOffers(p, d, r, near, win) {
    const out = [],
      here = [[p.system, 0], ...near];
    for (const [sys, jumps] of here) {
      const st = this.stateOf(sys);
      if (!st) continue;
      const S = SYS[sys],
        X = STATES[st.kind];
      const ports = S.stellars.filter(
        (x) => x.id !== p.id && x.svc && x.svc.includes('T') && !x.site,
      );
      if (!ports.length) continue;
      const dest = ports[Math.floor(r() * ports.length)],
        id = `${p.id}-${win}-st-${sys}`;
      const supply = {
        famine: 'food',
        refugees: 'food',
        plague: 'medical',
        rush: 'ore',
        war: 'equipment',
        boom: 'luxury',
        festival: 'luxury',
      }[st.kind];
      if (supply) {
        const c = COMMODITIES.find((x) => x.id === supply),
          qty = 8 + Math.floor(r() * 18);
        out.push({
          id,
          type: 'supply',
          state: st.kind,
          cid: supply,
          qty,
          sys,
          dest: dest.id,
          reward: Math.round((c.base * qty * 1.6 + 3000 + jumps * 1200) * (X.need ? 1.25 : 1)),
          title: `${X.icon} ${X.name}: bring ${qty} t of ${c.name.toLowerCase()} to ${dest.name}`,
          text: `${X.desc} Buy ${qty} tons of ${c.name.toLowerCase()} wherever it is cheap and deliver it from your own hold to ${dest.name} in ${S.name} (${jumps ? jumps + ' jump' + (jumps > 1 ? 's' : '') : 'this system'}). Pays well above market.`,
        });
      }
      if (st.kind === 'pirates' || st.kind === 'war') {
        const need = 3 + Math.floor(r() * 3);
        out.push({
          id: id + 'p',
          type: 'patrol',
          state: st.kind,
          sys,
          need,
          got: 0,
          reward: Math.round((4000 + need * 2400 + S.danger * 1800) * 1.4),
          title:
            st.kind === 'war' ? `⚔ Hold the line in ${S.name}` : `☠ Clear the lanes of ${S.name}`,
          text:
            st.kind === 'war'
              ? `Destroy ${need} ${FACTIONS[st.enemy].name} warships in ${S.name}, then land anywhere to be paid.`
              : `Destroy ${need} raiders in ${S.name}, then land anywhere to be paid. Every kill helps break the scourge.`,
        });
      }
      if (X.passengers) {
        const other = near.filter(([s2]) => s2 !== sys)[
          Math.floor(r() * Math.max(1, near.length - 1))
        ];
        const to =
          other && SYS[other[0]].stellars.find((x) => x.svc && x.svc.includes('L') && !x.site);
        if (to) {
          const pax = 2 + (Math.floor(r() * 4) * X.passengers) / 2;
          out.push({
            id: id + 'x',
            type: 'passenger',
            state: st.kind,
            sys: other[0],
            dest: to.id,
            pax: Math.round(pax),
            reward: Math.round(2500 + other[1] * 1600 + pax * 1300),
            title: `${X.icon} Passage for ${Math.round(pax)} from ${S.name} to ${to.name}`,
            text: `${st.kind === 'refugees' ? 'Refugees' : 'Festival-goers'} need passage to ${to.name}. Each passenger needs a bunk.`,
          });
        }
      }
    }
    return out;
  },
  // a supply job completes when you land at its destination with the goods in your hold
  /**
   * Check whether player currently carries sufficient cargo to complete a supply relief mission.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {Record<string, unknown>} m - Mission object.
   * @returns {boolean} True if required goods are in cargo.
   */
  supplyReady(d, m) {
    return m.type === 'supply' && (d.cargo[m.cid] || 0) >= m.qty;
  },
};
