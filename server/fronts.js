import { clampStanding } from '../shared/reputation.js';
// Quantum Rift 0.6 "Fleets and Fronts" server feature operations: invasions,
// anomalies and server events, daily and weekly goals, faction stores, and the expanded job types.
// (2.6: fleets became the Armada, see server/coop.js; territory and Dreadnoughts were removed.)
import {
  SYSTEMS,
  SYS,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
} from '../shared/galaxy.js';
import {
  BOSSES,
  INVASION,
  ANOMALIES,
  GOAL_TYPES,
  GOAL_REWARD,
  STORE_ITEMS,
  STORE_MAT,
  SCAN,
  CHAIN_STEPS,
  anomaliesAt,
  eventAt,
  eventCalendar,
  dayKey,
  weekKey,
} from '../shared/fronts.js';
import { ROLES, RARITY, RACE_ROLES, OFFICER_NAMES, ROSTER_MAX } from '../shared/hangar.js';
import { captainBonus, shipStats, credits } from '../shared/rules.js';

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

export const FrontsOperations = {
  /**
   * Initialize invasion scheduling and state.
   * @returns {void}
   */
  frontsInit() {
    this.invasion = null;
    this.lastInvWin = Math.floor(Date.now() / (INVASION.everyMin * 60000));
    if (process.env.INVASION_NOW)
      setTimeout(
        () =>
          this.startInvasion(
            this.lastInvWin,
            SYS[process.env.INVASION_NOW] ? process.env.INVASION_NOW : undefined,
          ),
        500,
      ); // testing: start one at boot
  },
  // ------------------------------------------------------------------ modifiers from anomalies (per system) and the server event (global)
  /**
   * Get current active system anomalies, refreshing every 6-hour window.
   * @returns {Record<string, string>} Map of system IDs to anomaly keys.
   */
  anomalies() {
    const w = Math.floor(Date.now() / (6 * 3600000));
    if (this._anW !== w) {
      this._anW = w;
      this._an = anomaliesAt(SYSTEMS);
    }
    return this._an;
  },
  /**
   * Retrieve current active global server event.
   * @returns {import("../shared/fronts.js").WorldEvent | null} Current event object or null.
   */
  event() {
    return eventAt();
  },
  /**
   * Compute aggregated modifiers for a system combining local anomaly and server event.
   * @param {string} [sysId] - Optional system identifier.
   * @returns {Record<string, number>} Aggregated modifier multipliers and additive adjustments.
   */
  mods(sysId) {
    const m = {
      shieldRe: 1,
      radar: 1,
      raid: 1,
      beam: 1,
      jumpFuel: 1,
      mining: 1,
      bounty: 1,
      sell: 1,
      regrow: 1,
      xp: 1,
      rarity: 0,
      shuttleSpeed: 1,
      shuttleYield: 1,
      swarm: 1,
      swarmLoot: 1,
      eclipse: 1,
      chest: 1,
      armadaBounty: 1,
      riftore: 1,
    };
    const an = sysId && this.anomalies()[sysId],
      ev = this.event();
    for (const src of [an ? ANOMALIES[an].mods : null, ev ? ev.mods : null])
      if (src)
        for (const [k, v] of Object.entries(src)) m[k] = k === 'rarity' ? m[k] + v : m[k] * v;
    return m;
  },
  // everything that modifies a captain's ship: research + bridge crew + the Armada buff while a member shares the system (2.6)
  /**
   * Calculate cumulative ship bonuses from research, bridge crew, and co-op Armada proximity.
   * @param {import('./contracts.js').CargoPlayer | import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, number>} Cumulative stat bonuses.
   */
  bonus(d) {
    const b = captainBonus(d);
    if (this.armadaBonus) this.armadaBonus(d, b);
    return b;
  },
  /**
   * Calculate effective ship statistics with all bonuses applied.
   * @param {import('./contracts.js').CargoPlayer | import('./game.js').PlayerData} d - Saved player data.
   * @returns {import('../shared/rules.js').ComputedShipStats | null} Effective ship stats.
   */
  stats(d) {
    return d.ship ? shipStats(this.A, d.ship, this.bonus(d)) : null;
  },
  /**
   * Build world telemetry payload containing invasion, anomaly, event, and calendar information.
   * @returns {{t: string, invasion: Record<string, string | number> | null, anomalies: Record<string, string>, event: Record<string, string | number> | null, calendar: Array<Record<string, string | number>>, states: Record<string, string>}} World telemetry payload.
   */
  worldPayload() {
    const inv = this.invasion
      ? { sys: this.invasion.sys, name: this.invasion.boss.name, until: this.invasion.until }
      : null;
    return {
      t: 'world',
      invasion: inv,
      anomalies: this.anomalies(),
      event: this.event(),
      calendar: eventCalendar(),
      states: this.statesPayload ? this.statesPayload() : {},
    }; // 2.4: system states
  },
  /**
   * Broadcast updated world status telemetry to all connected sessions.
   * @returns {void}
   */
  pushWorld() {
    this.broadcast(this.worldPayload());
  },

  // ------------------------------------------------------------------ invasions
  /**
   * Periodic tick check to spawn new invasions or withdraw timed-out bosses.
   * @returns {void}
   */
  invasionTick() {
    const now = Date.now(),
      win = Math.floor(now / (INVASION.everyMin * 60000));
    const inv = this.invasion;
    if (inv && (now > inv.until || !inv.sp.ships.has(inv.ent.id))) {
      if (now > inv.until && inv.sp.ships.has(inv.ent.id)) {
        inv.sp.remove(inv.ent, 'jump');
        for (const x of [...inv.sp.ships.values()])
          if (x.owner === inv.ent.id) inv.sp.remove(x, 'jump');
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `The ${inv.boss.name} withdrew from ${SYS[inv.sys].name}.`,
        });
      }
      inv.sp.keep = false;
      this.invasion = null;
      this.pushWorld();
    }
    if (!this.invasion && win !== this.lastInvWin) {
      this.lastInvWin = win;
      this.startInvasion(win);
    }
  },
  /**
   * Spawn an invasion encounter with a world boss and minions in a target system.
   * @param {number} win - Time window index.
   * @param {string} [sysId] - Optional system ID to spawn in.
   * @returns {import("./space.js").Entity} Spawned boss entity.
   */
  startInvasion(win, sysId) {
    const r = rng(0xb055 + win * 31),
      pool = SYSTEMS.filter(
        (s) => s.danger >= 2 && s.faction !== 'quantum' && !s.farside && s.stellars.length,
      );
    const S = sysId ? SYS[sysId] : pick(r, pool),
      B = BOSSES[Math.floor(r() * BOSSES.length)];
    const sp = this.spaces[S.id];
    sp.keep = true;
    const k = (B.mult - 1) * 100,
      ang = r() * Math.PI * 2;
    const e = sp.makeShip({
      hull: B.hull,
      faction: B.faction,
      x: Math.cos(ang) * 1200,
      y: Math.sin(ang) * 1200,
      ai: 'guard',
      name: B.name,
      bonus: { shieldPct: k, armorPct: k, damagePct: 60 },
    });
    e.boss = B.id;
    e.life = 1e9;
    e.noDisable = true;
    e.home = { x: e.x, y: e.y };
    e.dmgBy = {};
    for (let i = 0; i < 4; i++) {
      const m = sp.makeShip({
        hull: B.minions[i % B.minions.length],
        faction: B.faction,
        x: e.x + (i - 1.5) * 120,
        y: e.y + 160,
        ai: 'escort',
        owner: e.id,
      });
      m.life = 1e9;
      m.bossMinion = true;
    }
    this.invasion = {
      boss: B,
      sys: S.id,
      sp,
      ent: e,
      until: Date.now() + INVASION.lastMin * 60000,
    };
    this.broadcast({
      t: 'notify',
      title: 'Invasion',
      body: `The ${B.name} has appeared in ${S.name}.`,
    });
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `INVASION: the ${B.name} has appeared in ${S.name} (${FACTIONS[S.faction].name}). Every captain who helps bring it down shares a ${credits(B.pool)} credit bounty.`,
    });
    this.pushWorld();
    return e;
  },
  /**
   * Track damage dealt by player ships to an invasion boss entity.
   * @param {import('./space.js').Entity} e - Boss ship entity.
   * @param {import('./space.js').Entity} by - Attacking entity.
   * @param {number} dmg - Damage dealt amount.
   * @returns {void}
   */
  onBossDamage(e, by, dmg) {
    if (!by || !by.player) return;
    const n = by.player.name;
    e.dmgBy[n] = (e.dmgBy[n] || 0) + dmg;
  },
  /**
   * Handle destruction of an invasion boss, distributing rewards to participating captains.
   * @param {import('./space.js').Entity} e - Destroyed boss entity.
   * @param {import('./space.js').Space} space - Space simulation instance where the boss died.
   * @returns {void}
   */
  onBossKilled(e, space) {
    const B = BOSSES.find((b) => b.id === e.boss),
      total = Object.values(e.dmgBy).reduce((a, b) => a + b, 0) || 1;
    const ranked = Object.entries(e.dmgBy).sort((a, b) => b[1] - a[1]);
    const names = [];
    ranked.forEach(([name, dmg], i) => {
      const share = dmg / total;
      if (share < INVASION.minShare) return;
      const p = this.db.get(name);
      if (!p) return;
      const cr = Math.round(B.pool * share),
        g = i === 0 ? 4 : i < 3 ? 3 : 2,
        mt = MATERIALS[i % 3];
      p.credits += cr;
      p.stats.earned += cr;
      p.mats[mt][g]++;
      p.tokens = p.tokens || {};
      p.tokens.any = (p.tokens.any || 0) + 5;
      this.log(
        p,
        `Helped destroy the ${B.name} (${Math.round(share * 100)}% of the damage): ${credits(cr)} credits, ${mt} ${GRADES[g]}, 5 Rift scrip.`,
      );
      names.push(`${name} ${Math.round(share * 100)}%`);
      this.refreshPlayer(name);
      for (const o of this.sessions.values())
        if (o.data === p)
          this.toast(
            o,
            `Invasion reward: ${credits(cr)} credits, a ${mt} ${GRADES[g]} crate and 5 Rift scrip.`,
          );
    });
    this.broadcast({
      t: 'chat',
      from: '',
      msg: `The ${B.name} is destroyed in ${SYS[space.id].name}! ${names.length ? 'Top guns: ' + names.slice(0, 5).join(', ') : ''}`,
    });
    for (const x of space.ships.values()) if (x.owner === e.id) x.ai = 'leave';
    if (this.invasion && this.invasion.ent === e) {
      space.keep = false;
      this.invasion = null;
    }
    this.db.touch();
    this.pushWorld();
  },

  // ------------------------------------------------------------------ goals
  /**
   * Retrieve or roll daily and weekly goals for player.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {{daily: Array<Record<string, string | number | boolean>>, weekly: Array<Record<string, string | number | boolean>>}} Player goals object containing daily and weekly lists.
   */
  goalsFor(d) {
    const day = dayKey(),
      week = weekKey();
    d.goals = d.goals || {};
    const make = (period, key) => {
      const r = rng(hash(d.name + period + key)),
        types = Object.keys(GOAL_TYPES).filter((t) => t !== 'shuttles' || d.station.ops >= 2),
        out = [];
      while (out.length < 3 && types.length) {
        const t = types.splice(Math.floor(r() * types.length), 1)[0],
          [lo, hi] = GOAL_TYPES[t][period];
        let n = lo + Math.floor(r() * (hi - lo + 1));
        if (t === 'trade') n = Math.round(n / 1000) * 1000;
        out.push({ type: t, n, got: 0, claimed: false });
      }
      return out;
    };
    if (d.goals.day !== day) {
      d.goals.day = day;
      d.goals.daily = make('daily', day);
    }
    if (d.goals.week !== week) {
      d.goals.week = week;
      d.goals.weekly = make('weekly', week);
    }
    return d.goals;
  },
  /**
   * Advance progress for a player goal category.
   * @param {import('./game.js').Session} s - Player session.
   * @param {string} type - Goal category key.
   * @param {number} [n=1] - Progress increment.
   * @returns {void}
   */
  goal(s, type, n = 1) {
    const d = s.data,
      G = this.goalsFor(d);
    for (const g of [...G.daily, ...G.weekly])
      if (g.type === type && g.got < g.n) {
        g.got = Math.min(g.n, g.got + n);
        if (g.got >= g.n)
          this.toast(s, `Goal complete: ${GOAL_TYPES[type].text(g.n)}. Claim it in the Goals tab.`);
      }
  },
  /**
   * Claim rewards for a completed daily or weekly goal.
   * @param {import('./game.js').Session} s - Player session.
   * @param {{period: 'daily' | 'weekly', i: number}} m - Claim goal payload.
   * @returns {void}
   */
  claimGoal(s, m) {
    const d = s.data,
      G = this.goalsFor(d),
      list = m.period === 'weekly' ? G.weekly : G.daily,
      g = list[m.i | 0];
    if (!g || g.claimed || g.got < g.n) return;
    const R = GOAL_REWARD[m.period === 'weekly' ? 'weekly' : 'daily'];
    g.claimed = true;
    d.credits += R.credits;
    d.tokens = d.tokens || {};
    d.tokens.any = (d.tokens.any || 0) + R.tokens;
    this.toast(s, `Goal reward: ${credits(R.credits)} credits and ${R.tokens} Rift scrip.`);
    if (m.period === 'weekly') {
      const mt = MATERIALS[Math.floor(Math.random() * 3)];
      d.mats[mt][2]++;
      this.toast(s, `Weekly goal bonus: a ${mt} III crate.`);
    } // 2.6: was a Hollow Directive
    if (list.every((x) => x.claimed)) {
      const mt = MATERIALS[Math.floor(Math.random() * 3)],
        gr = m.period === 'weekly' ? 3 : 1;
      d.mats[mt][gr]++;
      this.toast(
        s,
        `All ${m.period === 'weekly' ? 'weekly' : 'daily'} goals done: bonus ${mt} ${GRADES[gr]} crate.`,
      );
    }
    this.db.touch();
    this.you(s);
  },

  // ------------------------------------------------------------------ faction stores
  /**
   * Award faction reputation tokens to player data.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {string} fac - Faction identifier.
   * @param {number} n - Number of tokens to grant.
   * @returns {void}
   */
  token(d, fac, n) {
    if (!fac || FACTIONS[fac].region || fac === 'umbral') return;
    d.tokens = d.tokens || {};
    d.tokens[fac] = (d.tokens[fac] || 0) + n;
  },
  /**
   * Determine available faction store for a stellar body.
   * @param {{system: string, svc: string, site?: boolean | Record<string, string | number>} | null} p - Stellar body descriptor.
   * @returns {string | null} Faction identifier or null if no store available.
   */
  storeFor(p) {
    if (!p || p.site || !p.svc.includes('T')) return null;
    const fac = SYS[p.system].faction;
    return FACTIONS[fac].region || fac === 'umbral' ? null : fac;
  },
  /**
   * Purchase an item or contract from a faction store.
   * @param {import('./game.js').Session} s - Player session.
   * @param {{fac: string, id: string}} m - Purchase operation payload.
   * @returns {void}
   */
  storeBuy(s, m) {
    // 0.8: the faction stores are their own menu, open from any landing (standing still gates the stock)
    const d = s.data,
      p = STELLARS[d.stellar],
      F_ = FACTIONS[m.fac],
      fac = F_ && !F_.region && !F_.hidden && m.fac !== 'umbral' ? m.fac : this.storeFor(p);
    if (!fac || s.ent || !p)
      return this.toast(s, 'Faction stores deliver to you while you are landed.');
    const it = STORE_ITEMS.find((x) => x.id === m.id);
    if (!it) return;
    if ((d.rep[fac] || 0) < it.rep)
      return this.toast(s, `${FACTIONS[fac].short} standing ${it.rep} needed.`);
    d.tokens = d.tokens || {};
    const own = d.tokens[fac] || 0,
      scrip = d.tokens.any || 0;
    if (own + scrip < it.tokens)
      return this.toast(
        s,
        `You need ${it.tokens} ${FACTIONS[fac].short} tokens (Rift scrip makes up the difference).`,
      );
    if (d.credits < it.credits) return this.toast(s, 'Not enough credits.');
    if (it.give.officer && d.officers.length >= ROSTER_MAX)
      return this.toast(s, 'Your roster is full.');
    const useOwn = Math.min(own, it.tokens);
    d.tokens[fac] = own - useOwn;
    d.tokens.any = scrip - (it.tokens - useOwn);
    d.credits -= it.credits;
    const G_ = it.give;
    if (G_.crate) {
      const mt = STORE_MAT[fac] || 'alloy';
      d.mats[mt][G_.crate]++;
      this.toast(s, `Bought a ${mt} ${GRADES[G_.crate]} crate.`);
    }
    if (G_.officer) {
      const r = Math.random,
        role = pick(r, RACE_ROLES[fac] || Object.keys(ROLES)),
        N = OFFICER_NAMES[fac] || OFFICER_NAMES.quantum;
      const o = {
        id: this.uid(d),
        name: pick(r, N[0]) + ' ' + pick(r, N[1]),
        race: RACE_ROLES[fac] ? fac : 'quantum',
        role,
        rarity: G_.officer,
        lv: 1 + Math.floor(r() * 3),
        xp: 0,
      };
      d.officers.push(o);
      this.toast(
        s,
        `${RARITY[o.rarity].name} ${ROLES[role].name.toLowerCase()} ${o.name} signs on.`,
      );
      this.log(d, `Signed ${o.name} through a ${FACTIONS[fac].short} contract.`);
    }
    if (G_.xp) {
      this.officerXp(s, G_.xp);
      this.toast(s, 'Your bridge crew study the manuals.');
    }
    if (G_.rep) {
      d.rep[fac] = clampStanding((d.rep[fac] || 0) + G_.rep);
      this.toast(s, `${FACTIONS[fac].short} standing +${G_.rep}.`);
    }
    this.db.touch();
    this.you(s);
  },

  // ------------------------------------------------------------------ expanded jobs: convoy, smuggling, rescue, survey, assassination, chains
  // called when a captain arrives in a system (after spawnPlayer)
  /**
   * Spawn mission entities (convoys, wrecks, assassination targets) upon player arrival in system.
   * @param {import('./game.js').Session} s - Player session.
   * @param {import('./space.js').Space} sp - Current space system instance.
   * @returns {void}
   */
  missionArrive(s, sp) {
    const d = s.data,
      e = s.ent;
    if (!e) return;
    for (const m of d.missions) {
      if (m.sys !== d.sys || m.done) continue;
      if (m.type === 'convoy' && !m.spawned) {
        const dest = STELLARS[m.dest];
        if (!dest) continue;
        m.spawned = true;
        const c = sp.makeShip({
          hull: m.hull,
          faction: m.faction,
          x: e.x + 140,
          y: e.y + 60,
          a: e.a,
          ai: 'trade',
          name: m.convoyName,
        });
        c.dest = { ...dest };
        c.convoyOf = { id: m.id, owner: s.id };
        c.life = 1e9;
        c.noDisable = true;
        for (let i = 0; i < m.raiders; i++) {
          const ang = Math.random() * 6.28;
          const r = sp.makeShip({
            hull: m.raiderHull,
            faction: 'hollow',
            x: dest.x + Math.cos(ang) * 900,
            y: dest.y + Math.sin(ang) * 900,
            ai: 'raid',
          });
          r.target = c;
          r.life = 1e9;
        }
        this.toast(
          s,
          `Your convoy, the ${m.convoyName}, is with you. Get it safely to ${dest.name}.`,
        );
      }
      if (m.type === 'rescue' && !m.spawned) {
        m.spawned = true;
        const ang = Math.random() * 6.28;
        const w = sp.makeShip({
          hull: m.hull,
          faction: m.faction,
          x: m.eventide ? m.rescuePoint[0] : Math.cos(ang) * 1300,
          y: m.eventide ? m.rescuePoint[1] : Math.sin(ang) * 1300,
          name: m.wreckName,
        });
        w.disabled = true;
        w.armor = w.st.armor * 0.1;
        w.rescueOf = { id: m.id, owner: s.id };
        w.life = 1e9;
        w.wreckT = 1e9;
        this.toast(
          s,
          `Distress beacon: the ${m.wreckName} is drifting in this system. Board it and choose Rescue.`,
        );
      }
      if (m.type === 'assassinate' && !m.spawned) {
        m.spawned = true;
        const t = sp.spawnMissionTarget({ ...m, owner: s.id });
        for (let i = 0; i < 2; i++) {
          const g = sp.makeShip({
            hull: m.guard,
            faction: m.faction,
            x: t.x + (i ? 90 : -90),
            y: t.y + 80,
            ai: 'escort',
            owner: t.id,
          });
          g.life = 1e9;
        }
        this.toast(s, `${m.targetName} is here with bodyguards.`);
      }
      if (m.type === 'survey')
        this.toast(
          s,
          `Survey: pass within 450 km of ${m.points.length - (m.seen || []).length} marked points (shown on your radar).`,
        );
    }
  },
  /**
   * Complete escort mission when convoy ship successfully lands at destination.
   * @param {import('./space.js').Entity} e - Landed convoy entity.
   * @returns {void}
   */
  onConvoyLanded(e) {
    const s = this.sessions.get(e.convoyOf.owner);
    if (!s || !s.data) return;
    const m = s.data.missions.find((x) => x.id === e.convoyOf.id);
    if (!m) return;
    m.done = true;
    this.toast(s, `The ${m.convoyName} landed safely. Land anywhere to be paid.`);
    this.you(s);
  },
  /**
   * Fail escort mission when protected convoy ship is destroyed.
   * @param {import('./space.js').Entity} e - Destroyed convoy entity.
   * @returns {void}
   */
  onConvoyLost(e) {
    const s = this.sessions.get(e.convoyOf.owner);
    if (!s || !s.data) return;
    const m = s.data.missions.find((x) => x.id === e.convoyOf.id);
    if (!m) return;
    s.data.missions = s.data.missions.filter((x) => x !== m);
    this.toast(s, `The ${m.convoyName} was destroyed. Job failed.`);
    this.log(s.data, `Failed: ${m.title} (convoy destroyed).`);
    this.you(s);
  },
  // every two seconds for captains in space: survey points, smuggler scans
  /**
   * Periodic check in space for survey waypoint proximity and police smuggler cargo scans.
   * @param {import('./game.js').Session} s - Player session.
   * @returns {void}
   */
  missionIdle(s) {
    const d = s.data,
      e = s.ent;
    if (!e) return;
    const sp = this.spaces[d.sys],
      S = SYS[d.sys];
    for (const m of d.missions) {
      if (m.type === 'survey' && m.sys === d.sys && !m.done) {
        m.seen = m.seen || [];
        m.points.forEach((p, i) => {
          if (!m.seen.includes(i) && Math.hypot(p[0] - e.x, p[1] - e.y) < 450) {
            m.seen.push(i);
            this.toast(s, `Survey point ${m.seen.length}/${m.points.length} logged.`);
          }
        });
        if (m.seen.length >= m.points.length) {
          m.done = true;
          this.toast(s, 'Survey complete. Land anywhere to be paid.');
        }
        this.you(s);
      }
      if (
        m.type === 'smuggle' &&
        !m.done &&
        !FACTIONS[S.faction].region &&
        !FACTIONS[S.faction].pirate &&
        S.danger <= 2
      ) {
        const now = Date.now();
        if (now - (m.scanT || 0) < SCAN.cooldown * 1000) continue;
        const cop = [...sp.ships.values()].find(
          (x) =>
            x.ai === 'patrol' &&
            x.faction === S.faction &&
            Math.hypot(x.x - e.x, x.y - e.y) < SCAN.range,
        );
        if (!cop) continue;
        m.scanT = now;
        if (
          Math.random() <
          SCAN.chance *
            (1 - (this.bonus(d).lootPct || 0) / 300) *
            (1 - Math.min(80, this.bonus(d).scanPct || 0) / 100)
        ) {
          // 1.2: ghosts and fixers slip past scans
          const fine = Math.round(m.reward * SCAN.fine);
          d.credits = Math.max(0, d.credits - fine);
          d.rep[S.faction] = clampStanding((d.rep[S.faction] || 0) - 5);
          d.missions = d.missions.filter((x) => x !== m);
          this.toast(
            s,
            `A ${FACTIONS[S.faction].short} patrol scanned your hold and found the contraband. Fined ${credits(fine)} credits; cargo seized.`,
          );
          this.log(d, `Caught smuggling in ${S.name}.`);
          this.you(s);
          return;
        }
        this.toast(
          s,
          `A ${FACTIONS[S.faction].short} patrol scanned you and found nothing. Keep moving.`,
        );
      }
    }
  },
  // extra job offers for 0.6 (merged into the job board)
  /**
   * Generate expanded job offerings (convoys, smuggling, rescues, surveys, bounties, faction chains).
   * @param {{id: string, system: string}} p - Current stellar body.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {() => number} r - Random generator function.
   * @param {Array<[string, number]>} near - Nearby system IDs and jump distances.
   * @param {number} win - Time window index.
   * @returns {Array<import("./game.js").Mission>} List of generated mission offers.
   */
  moreOffers(p, d, r, near, win) {
    const out = [],
      fac = SYS[p.system].faction,
      lawful = !FACTIONS[fac].region && !FACTIONS[fac].pirate && fac !== 'umbral';
    const pickSys = () => near[Math.floor(r() * near.length)];
    for (let i = 0; i < 3 && near.length; i++) {
      const roll = r(),
        [sys, jumps] = pickSys(),
        S = SYS[sys],
        id = `${p.id}-${win}-x${i}`;
      const land = S.stellars.filter((x) => x.svc.includes('L') && !x.site);
      if (roll < 0.2 && land.length) {
        const dest = land[Math.floor(r() * land.length)],
          hull = pick(r, [704, 706, 712]),
          nm = pick(r, [
            'Patience',
            'Good Harvest',
            'Long Odds',
            'Slow Mercy',
            'Copper Kettle',
            'Tallyman',
          ]);
        out.push({
          id,
          type: 'convoy',
          title: `Escort the ${nm} to ${dest.name}`,
          sys,
          dest: dest.id,
          hull,
          faction: 'spacer',
          convoyName: nm,
          raiders: 2 + Math.min(2, S.danger >> 1),
          raiderHull: pick(r, [705, 708, 711]),
          reward: Math.round(6000 + jumps * 1500 + S.danger * 2500),
          text: `Meet the freighter ${nm} in ${S.name} and keep her alive until she lands at ${dest.name}. Hollow raiders are waiting.`,
        });
      } else if (roll < 0.38 && lawful) {
        const qty = 4 + Math.floor(r() * 8);
        const dest = land.length ? land[Math.floor(r() * land.length)] : null;
        if (!dest) continue;
        out.push({
          id,
          type: 'smuggle',
          title: `Smuggle ${qty} t of unmarked crates to ${dest.name}`,
          sys,
          dest: dest.id,
          qty,
          reward: Math.round(9000 + jumps * 3000 + qty * 500),
          text: `No questions asked. Carry ${qty} tons of sealed crates to ${dest.name} in ${S.name}. Patrols in lawful space may scan you: if they do, you are fined and the cargo is seized.`,
        });
      } else if (roll < 0.56) {
        const nm = pick(r, [
          'Wanderer',
          'Bright Promise',
          'Ninth Lantern',
          'Saltwind',
          'Kestrel Nine',
          'Meridian Star',
        ]);
        out.push({
          id,
          type: 'rescue',
          title: `Rescue the crew of the ${nm}`,
          sys,
          hull: pick(r, [704, 705, 707]),
          faction: lawful ? fac : 'spacer',
          wreckName: nm,
          reward: Math.round(4000 + jumps * 1200 + S.danger * 1500),
          text: `The ${nm} lost power in the ${S.name} system. Find her, board her and bring the crew home.`,
        });
      } else if (roll < 0.76) {
        const pts = S.stellars.slice(0, 3).map((x) => [x.x, x.y]);
        while (pts.length < 3) {
          const a = r() * 6.28,
            dd = 900 + r() * 1100;
          pts.push([Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd)]);
        }
        out.push({
          id,
          type: 'survey',
          title: `Survey the ${S.name} system`,
          sys,
          points: pts,
          reward: Math.round(3500 + jumps * 1300 + S.danger * 1200),
          text: `Fly a sensor sweep of ${S.name}: pass close to three marked points, then land anywhere to file the survey.`,
        });
      } else {
        const ff = S.danger >= 4 && !S.farside ? 'umbral' : 'hollow',
          nm = pick(r, [
            '"Grinning" Vask',
            'the Saltmarsh Butcher',
            'Captain Nine-Fingers',
            'Mother Rust',
            'the Pale Duke',
          ]);
        out.push({
          id,
          type: 'assassinate',
          title: `Wanted: ${nm}`,
          sys,
          hull: ff === 'umbral' ? 763 : 717,
          guard: ff === 'umbral' ? 761 : 711,
          faction: ff,
          targetName: nm,
          reward: Math.round(25000 + S.danger * 6000),
          text: `${nm} commands a raider capital in ${S.name}, guarded by two escorts. Destroy the flagship.`,
        });
      }
    }
    // faction chains: three steps, each pays more; the next step shows up on any board in that power's space
    if (lawful) {
      const step = (d.chains && d.chains[fac]) || 0;
      if (
        step < CHAIN_STEPS &&
        near.length &&
        !d.missions.some((m) => m.chain && m.chain.fac === fac)
      ) {
        const r2 = rng(hash(d.name + fac + step)),
          [sys, jumps] = near[Math.floor(r2() * near.length)],
          S = SYS[sys],
          F = FACTIONS[fac];
        const pts = S.stellars.slice(0, 2).map((x) => [x.x, x.y]);
        while (pts.length < 3) {
          const a = r2() * 6.28,
            dd = 800 + r2() * 1200;
          pts.push([Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd)]);
        }
        const titles = [
          `${F.short} Commission I: Quiet Eyes`,
          `${F.short} Commission II: The Long Watch`,
          `${F.short} Commission III: Seal of the ${F.short}`,
        ];
        out.unshift({
          id: `chain-${fac}-${step}`,
          type: 'survey',
          chain: { fac, step },
          title: titles[step],
          sys,
          points: pts,
          reward: Math.round((12000 + jumps * 2000) * (1 + step)),
          text: `Step ${step + 1} of ${CHAIN_STEPS} for the ${F.name}: run a quiet sensor sweep of ${S.name}. ${step === CHAIN_STEPS - 1 ? 'Finishing the commission earns their lasting favour.' : 'Do this well and they will have more work for you.'}`,
        });
      }
    }
    return out;
  },
  // job completion extras: tokens, chains, goals
  /**
   * Handle job completion rewards including tokens, faction commission chains, and goal advancement.
   * @param {import('./game.js').Session} s - Player session.
   * @param {import("./game.js").Mission} m - Completed mission record.
   * @param {{system: string}} p - Landed stellar body.
   * @returns {void}
   */
  jobDone(s, m, p) {
    const d = s.data,
      fac = SYS[p.system].faction,
      n = 1 + Math.min(2, Math.floor(m.reward / 12000));
    this.token(d, fac, n);
    this.goal(s, 'jobs');
    if (m.chain) {
      d.chains = d.chains || {};
      d.chains[m.chain.fac] = m.chain.step + 1;
      if (m.chain.step + 1 >= CHAIN_STEPS) {
        const F = FACTIONS[m.chain.fac];
        d.rep[m.chain.fac] = clampStanding((d.rep[m.chain.fac] || 0) + 12);
        this.token(d, m.chain.fac, 10);
        this.toast(s, `Commission complete: the ${F.name} honour you (+12 standing, 10 tokens).`);
        this.log(d, `Completed the ${F.short} Commission.`);
      } else
        this.toast(
          s,
          `Commission step ${m.chain.step + 1} done. The next step waits on any ${FACTIONS[m.chain.fac].short} job board.`,
        );
    }
  },
};
