// Quantum Rift 0.7 "Frontier Life" server feature operations: planetary colonies, station defense raids, ship
// mastery, the arena, the player exchange, leaderboards, captain profiles and browser notifications.
import { SYS, STELLARS, FACTIONS, COMMODITIES, MATERIALS, GRADES } from '../shared/galaxy.js';
import {
  COLONY,
  COLONY_LEVELS,
  BUILDINGS,
  BUFF_CAP,
  DEFENSE,
  MASTERY,
  masteryTier,
  ARENA,
  arenaSystem,
  elo,
  EXCHANGE,
  BOARDS,
} from '../shared/frontier.js';
import { credits } from '../shared/rules.js';

/**
 * Clamp a numeric value between a lower and an upper bound.
 * @param {number} v - Value to clamp.
 * @param {number} a - Lower bound.
 * @param {number} b - Upper bound.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Look up commodity human-readable display name by commodity ID.
 * @param {string} id - Commodity identifier.
 * @returns {string} Commodity name.
 */
const comName = (id) => (COMMODITIES.find((c) => c.id === id) || { name: id }).name;

export const FrontierOperations = {
  /**
   * Initialize world colonies, player market orders, and arena/wave structures.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  frontierInit() {
    const W = this.db.world;
    W.colonies = W.colonies || {};
    W.orders = W.orders || [];
    W.nextOrder = W.nextOrder || 1;
    this.arenaQ = { '1v1': [], '2v2': [], '4v4': [] };
    this.matches = {};
    this.nextMatch = 1;
    this.waves = {};
  },
  // ------------------------------------------------------------------ bonuses: + ship mastery tier + colony buildings
  /**
   * Calculate aggregated bonuses from ship mastery, colony buildings, and survey ship perks.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, number>} Aggregated stat bonuses.
   */
  bonus(d) {
    const b = this.frontsBonus(d);
    const tier = masteryTier((d.mastery || {})[d.ship.hull] || 0);
    for (const [k, v] of Object.entries(MASTERY.bonus[tier] || {})) b[k] = (b[k] || 0) + v;
    for (const [k, v] of Object.entries(this.colonyBuffs(d))) b[k] = (b[k] || 0) + v;
    if (this.A.ships[d.ship.hull] && this.A.ships[d.ship.hull].role === 'survey')
      b.miningPct = (b.miningPct || 0) + 50; // survey ships mine better
    return b;
  },
  /**
   * Send a system notification message to a player session.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {string} title - Notification title text.
   * @param {string} body - Notification body text.
   * @returns {void}
   */
  notify(s, title, body) {
    if (s) this.send(s, { t: 'notify', title, body });
  },

  /**
   * Build world telemetry payload augmented with active colony ownership names.
   * @this {Record<string, unknown>}
   * @returns {Record<string, unknown>} World telemetry payload.
   */
  worldPayload() {
    const w = this.frontsWorldPayload(),
      col = {};
    for (const [id, c] of Object.entries(this.db.world.colonies || {})) {
      const o = this.db.players[c.owner];
      if (o) col[id] = o.name;
    }
    w.colonies = col;
    return w;
  },
  // ------------------------------------------------------------------ mastery
  /**
   * Increment ship mastery points and award tier level-ups and elite trim.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {number} amount - Mastery points to add.
   * @returns {void}
   */
  mastery(s, amount) {
    const d = s.data;
    d.mastery = d.mastery || {};
    const h = d.ship.hull,
      before = masteryTier(d.mastery[h] || 0);
    d.mastery[h] = Math.round(((d.mastery[h] || 0) + amount) * 10) / 10;
    const after = masteryTier(d.mastery[h]);
    if (after > before) {
      const H = this.A.ships[h];
      this.toast(
        s,
        `Mastery: your ${H.name} reached Tier ${after}.${after === 5 ? ' Her hull now carries a gold trim.' : ''}`,
      );
      this.log(d, `${H.name} reached mastery Tier ${after}.`);
      if (s.ent) s.ent.elite = after >= 5;
    }
  },

  // ------------------------------------------------------------------ colonies
  /**
   * Determine whether a stellar body is eligible for player colonization.
   * @this {Record<string, unknown>}
   * @param {{kind?: string, site?: boolean | Record<string, unknown>, svc?: string, system: string} | null} p - Stellar body.
   * @returns {boolean} True if colonizable.
   */
  colonizable(p) {
    return !!(
      p &&
      p.kind === 'planet' &&
      !p.site &&
      p.svc.includes('L') &&
      FACTIONS[SYS[p.system].faction].region
    );
  },
  /**
   * Retrieve all colonies owned by the player.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Array<[string, Record<string, unknown>]>} List of [stellarId, colony] pairs.
   */
  coloniesOf(d) {
    const k = this.db.key(d.name);
    return Object.entries(this.db.world.colonies).filter(([, c]) => c.owner === k);
  },
  /**
   * Compute maximum allowed colonies for player based on personal station Station Tier.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {number} Maximum colonies.
   */
  colonyMax(d) {
    return d.station.ops >= 5 ? COLONY.maxAtOps5 : COLONY.max;
  },
  /**
   * Aggregate active stat buffs produced by buildings across all player-owned colonies.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, number>} Aggregated colony buff map.
   */
  colonyBuffs(d) {
    const out = {};
    if (!this.db.world.colonies) return out;
    for (const [, c] of this.coloniesOf(d))
      for (const b of c.buildings) {
        const B = BUILDINGS[b];
        if (B && B.buff)
          for (const [k, v] of Object.entries(B.buff))
            out[k] = Math.min(BUFF_CAP[k] || 99, (out[k] || 0) + v);
      }
    return out;
  },
  /**
   * Accrue passive production (credits, commodities) in colony storage based on elapsed time.
   * @this {Record<string, unknown>}
   * @param {Record<string, unknown>} c - Colony data structure.
   * @returns {void}
   */
  accrue(c) {
    const now = Date.now(),
      h = (now - (c.t || now)) / 3600000,
      L = COLONY_LEVELS[c.lv];
    c.store = c.store || {};
    for (const b of c.buildings) {
      const B = BUILDINGS[b];
      if (!B || !B.produce) continue;
      for (const [k, v] of Object.entries(B.produce)) {
        const cap = v * L.mult * COLONY.storeHours;
        c.store[k] = Math.min(cap, (c.store[k] || 0) + v * L.mult * h);
      }
    }
    c.t = now;
  },
  /**
   * Build network telemetry payload describing colony status at a stellar body.
   * @this {Record<string, unknown>}
   * @param {{id: string} | null} p - Stellar body.
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, unknown> | null} Colony telemetry payload, or open descriptor, or null.
   */
  colonyPayload(p, d) {
    if (!p) return null;
    const c = this.db.world.colonies[p.id];
    if (!c) return this.colonizable(p) ? { open: true } : null;
    this.accrue(c);
    const o = this.db.players[c.owner];
    return {
      owner: o ? o.name : '?',
      own: o && o.name === d.name,
      lv: c.lv,
      buildings: c.buildings,
      store: Object.fromEntries(Object.entries(c.store).map(([k, v]) => [k, Math.floor(v)])),
      name: c.name,
    };
  },
  /**
   * Handle planetary colony operations (founding, building, demolishing, upgrading, collecting, abandoning).
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {{op: string, kind?: string, i?: number}} m - Colony action payload.
   * @returns {void}
   */
  colonyOp(s, m) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    const W = this.db.world,
      c = W.colonies[p.id],
      own = c && c.owner === this.db.key(d.name);
    switch (m.op) {
      case 'found': {
        if (!this.colonizable(p) || c) return this.toast(s, 'This world cannot be settled.');
        if (this.coloniesOf(d).length >= this.colonyMax(d))
          return this.toast(
            s,
            `You can run ${this.colonyMax(d)} colonies${d.station.ops < 5 ? ' (3 at Station Tier 5)' : ''}.`,
          );
        if (d.credits < COLONY.cost || !this.hasMats(d, COLONY.mats))
          return this.toast(s, 'You need the credits and materials listed.');
        d.credits -= COLONY.cost;
        this.takeMats(d, COLONY.mats);
        W.colonies[p.id] = {
          owner: this.db.key(d.name),
          lv: 1,
          buildings: [],
          store: {},
          t: Date.now(),
          name: `${p.name} Colony`,
        };
        this.log(d, `Founded a colony on ${p.name} (${SYS[p.system].name}).`);
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${d.name} settled ${p.name} in ${SYS[p.system].name}.`,
        });
        break;
      }
      case 'build': {
        if (!own) return;
        const B = BUILDINGS[m.kind];
        if (!B) return;
        if (c.buildings.length >= COLONY_LEVELS[c.lv].slots)
          return this.toast(s, 'Every building slot is used. Upgrade the colony for more.');
        if (B.buff && c.buildings.includes(m.kind))
          return this.toast(s, 'One of each buff building per colony.');
        if (d.credits < B.cost) return this.toast(s, 'Not enough credits.');
        this.accrue(c);
        d.credits -= B.cost;
        c.buildings.push(m.kind);
        this.toast(s, `${B.name} built.`);
        break;
      }
      case 'demolish': {
        if (!own) return;
        this.accrue(c);
        c.buildings.splice(m.i | 0, 1);
        break;
      }
      case 'upgrade': {
        if (!own) return;
        const L = COLONY_LEVELS[c.lv + 1];
        if (!L) return;
        if (d.credits < L.cost || !this.hasMats(d, L.mats))
          return this.toast(s, 'You need the credits and materials listed.');
        this.accrue(c);
        d.credits -= L.cost;
        this.takeMats(d, L.mats);
        c.lv++;
        this.toast(s, `Colony upgraded to level ${c.lv}.`);
        this.log(d, `${c.name} reached level ${c.lv}.`);
        break;
      }
      case 'collect': {
        if (!own) return;
        this.accrue(c);
        const st = this.stats(d);
        let room = st.cargo - Object.values(d.cargo).reduce((a, b) => a + b, 0);
        const got = [];
        if (c.store.credits >= 1) {
          const cr = Math.floor(c.store.credits);
          d.credits += cr;
          d.stats.earned += cr;
          c.store.credits -= cr;
          got.push(`${credits(cr)} cr`);
        }
        for (const [k, v] of Object.entries(c.store)) {
          if (k === 'credits') continue;
          const n = Math.min(Math.floor(v), room);
          if (n <= 0) continue;
          d.cargo[k] = (d.cargo[k] || 0) + n;
          c.store[k] -= n;
          room -= n;
          got.push(`${n} t ${comName(k)}`);
        }
        this.toast(
          s,
          got.length ? `Collected ${got.join(', ')}.` : 'Nothing to collect (or no cargo room).',
        );
        break;
      }
      case 'abandon': {
        if (!own) return;
        delete W.colonies[p.id];
        this.log(d, `Abandoned the colony on ${p.name}.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
    this.pushWorld();
  },

  // ------------------------------------------------------------------ station defense
  /**
   * Calculate personal station defense rating from turret level and Station Tier rating.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {number} Defense rating score.
   */
  defenseRating(d) {
    const S = d.station;
    return (
      DEFENSE.levels[S.defense || 0].rating +
      S.ops * DEFENSE.opsRating +
      (S.ops >= 5 ? DEFENSE.gridBonus : 0)
    );
  },
  /**
   * Upgrade personal station defense turrets by one level.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @returns {void}
   */
  defenseUpgrade(s) {
    const d = s.data,
      S = d.station,
      L = DEFENSE.levels[(S.defense || 0) + 1];
    if (!L) return this.toast(s, 'Station defenses are at their maximum.');
    if (d.credits < L.cost || !this.hasMats(d, L.mats))
      return this.toast(s, 'You need the credits and materials listed.');
    d.credits -= L.cost;
    this.takeMats(d, L.mats);
    S.defense = (S.defense || 0) + 1;
    this.toast(s, `Defense turrets upgraded to level ${S.defense}.`);
  },
  /**
   * Determine prospective NPC raid strength attacking player station in a time window.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {number} win - Time window index.
   * @returns {number} Raid strength score.
   */
  raidStrength(d, win) {
    const S = SYS[STELLARS[d.station.site].system];
    let h = 0;
    for (const c of d.name + win) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 150 + d.station.ops * 150 + (h % 300) + S.danger * 80;
  },
  /**
   * Check whether personal station is due for an incoming raid encounter.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @returns {void}
   */
  raidCheck(s) {
    const d = s.data,
      S = d.station;
    if (!S.site || S.ops < DEFENSE.minOps || this.waves[d.name]) return;
    const win = Math.floor(Date.now() / (DEFENSE.everyH * 3600000));
    if (S.raidWin === undefined) {
      S.raidWin = win;
      return;
    }
    if (S.raidWin >= win) return;
    S.raidWin = win;
    const strength = this.raidStrength(d, win),
      site = STELLARS[S.site];
    if (s.ent && d.sys === site.system) return this.startWave(s, strength);
    this.resolveRaid(s, strength, false);
  },
  /**
   * Spawn a live combat wave of hostile raiders targeting the player's personal station.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {number} strength - Calculated raid strength.
   * @returns {void}
   */
  startWave(s, strength) {
    const d = s.data,
      site = STELLARS[d.station.site],
      sp = this.spaces[site.system],
      n = clamp(Math.round(strength / 160), 2, 8),
      ids = new Set();
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2,
        fac = i % 3 === 2 && strength > 900 ? 'umbral' : 'hollow',
        pool = fac === 'umbral' ? [761, 762] : [705, 708, 711, 716];
      const e = sp.makeShip({
        hull: pool[i % pool.length],
        faction: fac,
        x: site.x + Math.cos(ang) * 1400,
        y: site.y + Math.sin(ang) * 1400,
        ai: 'raid',
        name: i === 0 ? 'Raid Leader' : null,
      });
      e.wave = d.name;
      e.life = 1e9;
      e.target = s.ent;
      ids.add(e.id);
      sp.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
    }
    this.waves[d.name] = {
      ids,
      until: Date.now() + DEFENSE.waveMin * 60000,
      strength,
      sys: site.system,
    };
    this.toast(s, `RAID: ${n} raiders are closing on your Personal Station. Drive them off!`);
    this.notify(s, 'Station under attack', `${n} raiders are attacking your Personal Station.`);
  },
  /**
   * Track destroyed raid wave entities and resolve victory if all raiders are eliminated.
   * @this {Record<string, unknown>}
   * @param {import('./space.js').Entity} e - Killed ship entity.
   * @returns {void}
   */
  onWaveKill(e) {
    const w = this.waves[e.wave];
    if (!w) return;
    w.ids.delete(e.id);
    if (!w.ids.size) {
      delete this.waves[e.wave];
      const s = this.sessionOf(e.wave);
      if (s) this.resolveRaid(s, w.strength, true);
    }
  },
  /**
   * Periodic check on active defense waves, cleaning up expired raids.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  waveTick() {
    for (const [name, w] of Object.entries(this.waves))
      if (Date.now() > w.until) {
        delete this.waves[name];
        const sp = this.live[w.sys];
        if (sp)
          for (const id of w.ids) {
            const e = sp.ships.get(id);
            if (e) sp.remove(e, 'jump');
          }
        const s = this.sessionOf(name);
        if (s) this.resolveRaid(s, w.strength * Math.max(0.3, w.ids.size / 4), false);
      }
  },
  /**
   * Resolve outcomes of a station raid, awarding salvage on defense or deducting crates on breach.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {number} strength - Raid strength rating.
   * @param {boolean} foughtOff - True if player actively destroyed the wave.
   * @returns {void}
   */
  resolveRaid(s, strength, foughtOff) {
    const d = s.data,
      rating = this.defenseRating(d),
      win = foughtOff || Math.random() < rating / (rating + strength);
    if (win) {
      const cr = Math.round(
        strength * (foughtOff ? 60 : 30) * (this.flying && this.flying(d, 'bulwark') ? 2 : 1),
      );
      d.credits += cr;
      d.stats.earned += cr;
      if (this.specOnRaid) this.specOnRaid(s, true);
      let extra = '';
      if (foughtOff || Math.random() < 0.4) {
        const mt = MATERIALS[Math.floor(Math.random() * 3)],
          g = clamp(Math.floor(strength / 500), 0, 3);
        d.mats[mt][g]++;
        extra = ` and a ${mt} ${GRADES[g]} crate`;
      }
      const msg = foughtOff
        ? `You drove off the raid on your station: ${credits(cr)} credits salvage${extra}.`
        : `Your station's turrets repelled a raid (defense ${rating} vs ${strength}): ${credits(cr)} credits salvage${extra}.`;
      this.toast(s, msg);
      this.log(d, msg);
      this.notify(s, 'Raid repelled', msg);
    } else {
      const lost = [];
      for (const m of MATERIALS)
        for (let g = 0; g < 2; g++) {
          const n = Math.floor(d.mats[m][g] * 0.2);
          if (n) {
            d.mats[m][g] -= n;
            lost.push(`${n} ${m} ${GRADES[g]}`);
          }
        }
      d.station.refUnits = 0;
      const msg = `Raiders broke through your station's defenses (defense ${rating} vs ${strength}) and looted the refinery${lost.length ? ' and ' + lost.join(', ') : ''}. Upgrade the turrets.`;
      this.toast(s, msg);
      this.log(d, msg);
      this.notify(s, 'Station raided', msg);
    }
    this.db.touch();
    this.you(s);
  },

  // ------------------------------------------------------------------ the arena
  /**
   * Handle arena queue join and leave operations.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {{op: 'queue' | 'leave', mode: '1v1' | '2v2' | '4v4'}} m - Arena action payload.
   * @returns {void}
   */
  arenaOp(s, m) {
    const d = s.data;
    if (m.op === 'queue') {
      if (s.ent || !d.stellar) return this.toast(s, 'Queue for the arena while docked.');
      if (!ARENA.modes[m.mode]) return;
      for (const q of Object.values(this.arenaQ)) {
        const i = q.indexOf(s.id);
        if (i >= 0) q.splice(i, 1);
      }
      this.arenaQ[m.mode].push(s.id);
      this.toast(
        s,
        `Queued for ${m.mode}. You will be pulled into the Crucible when a match is ready.`,
      );
      this.tryMatch(m.mode);
    } else if (m.op === 'leave') {
      for (const q of Object.values(this.arenaQ)) {
        const i = q.indexOf(s.id);
        if (i >= 0) q.splice(i, 1);
      }
      this.toast(s, 'Left the arena queue.');
    }
    this.you(s);
  },
  /**
   * Build arena status payload including queue size and rating.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @param {import('./game.js').Session} s - Player session.
   * @returns {Record<string, unknown>} Arena status descriptor.
   */
  arenaPayload(d, s) {
    d.arena = d.arena || { rating: ARENA.start, w: 0, l: 0 };
    const q = Object.entries(this.arenaQ).find(([, q]) => q.includes(s.id));
    return {
      ...d.arena,
      queued: q ? q[0] : null,
      sizes: Object.fromEntries(Object.entries(this.arenaQ).map(([k, v]) => [k, v.length])),
    };
  },
  /**
   * Attempt to construct an arena match from queued players for a given mode.
   * @this {Record<string, unknown>}
   * @param {'1v1' | '2v2' | '4v4'} mode - Arena combat mode.
   * @returns {Record<string, unknown> | null} Created match descriptor or null if not enough players.
   */
  tryMatch(mode) {
    const n = ARENA.modes[mode],
      q = this.arenaQ[mode];
    for (let i = q.length - 1; i >= 0; i--) {
      const o = this.sessions.get(q[i]);
      if (!o || o.ent || !o.data || !o.data.stellar) q.splice(i, 1);
    }
    if (q.length < n * 2) return null;
    const ids = q
      .splice(0, n * 2)
      .map((id) => this.sessions.get(id))
      .sort(
        (a, b) => ((b.data.arena || {}).rating || 1000) - ((a.data.arena || {}).rating || 1000),
      );
    const A = [],
      B = [];
    ids.forEach((o, i) => (i % 4 === 0 || i % 4 === 3 ? A : B).push(o)); // snake draft by rating
    const id = `arena-${this.nextMatch++}`;
    SYS[id] = arenaSystem(id);
    const sp = this.spaces[id];
    sp.keep = true;
    const match = (this.matches[id] = {
      id,
      mode,
      sp,
      teams: { A: A.map((o) => o.data.name), B: B.map((o) => o.data.name) },
      until: Date.now() + ARENA.matchMin * 60000,
      alive: new Set(),
    });
    for (const [team, list, side] of [
      ['A', A, -1],
      ['B', B, 1],
    ])
      list.forEach((o, i) => {
        const d = o.data;
        d.arenaReturn = d.stellar;
        d.stellar = null;
        d.sys = id;
        this.spawnPlayer(
          o,
          (side * ARENA.size) / 2,
          (i - (list.length - 1) / 2) * 160,
          side < 0 ? Math.PI / 2 : -Math.PI / 2,
          0,
        );
        for (const x of [...sp.ships.values()]) if (x.owner === o.ent.id) sp.remove(x); // no escorts in the Crucible
        o.ent.team = team;
        o.ent.arena = id;
        match.alive.add(d.name);
        this.send(o, { t: 'arena', id, team, teams: match.teams, until: match.until });
        this.toast(
          o,
          `ARENA ${mode}: you fight for team ${team === 'A' ? 'Azure' : 'Crimson'}. Last team flying wins.`,
        );
        this.notify(o, 'Arena match found', `${mode} in the Crucible. Good hunting.`);
      });
    return match;
  },
  // a captain leaves the arena: back to where they queued, ship repaired, no insurance fee
  /**
   * Return a captain from an arena match to their origin station.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} o - Player session.
   * @param {Record<string, unknown>} match - Arena match descriptor.
   * @param {boolean} died - True if ship was knocked out in combat.
   * @returns {void}
   */
  arenaExit(o, match, died) {
    const d = o.data,
      sp = match.sp;
    if (o.ent) {
      for (const x of [...sp.ships.values()]) if (x.owner === o.ent.id) sp.remove(x);
      if (!died) sp.remove(o.ent, 'jump');
      sp.players--;
      o.ent = null;
    }
    match.alive.delete(d.name);
    d.stellar = d.arenaReturn && STELLARS[d.arenaReturn] ? d.arenaReturn : 'qstation';
    d.sys = STELLARS[d.stellar].system;
    d.arenaReturn = null;
    d.fuel = undefined;
    d.shieldNow = d.armorNow = undefined;
    this.send(o, { t: 'arena', id: null });
    this.you(o);
    this.landed(o);
  },
  /**
   * Handle ship destruction inside the arena, free repair, and victory check.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} o - Knocked-out player session.
   * @param {import('./space.js').Space} space - Space simulation instance.
   * @returns {boolean} True if entity was in an arena match.
   */
  onArenaDeath(o, space) {
    const match = this.matches[space.id];
    if (!match) return false;
    this.toast(
      o,
      'Your ship was knocked out of the match. The arena crew patched her up for free.',
    );
    this.arenaExit(o, match, true);
    this.arenaCheck(match);
    return true;
  },
  /**
   * Check victory conditions for an active arena match and award Elo ratings and credits.
   * @this {Record<string, unknown>}
   * @param {Record<string, unknown>} match - Arena match descriptor.
   * @returns {void}
   */
  arenaCheck(match) {
    const alive = (t) => match.teams[t].filter((n) => match.alive.has(n));
    const a = alive('A'),
      b = alive('B'),
      timeUp = Date.now() > match.until;
    if (a.length && b.length && !timeUp) return;
    let winner = !a.length ? 'B' : !b.length ? 'A' : null;
    if (!winner) {
      // time: the side with more hull and shield left wins
      const hp = (names) =>
        names.reduce((t, n) => {
          const o = this.sessionOf(n);
          return (
            t +
            (o && o.ent
              ? o.ent.armor / o.ent.st.armor + o.ent.shield / Math.max(1, o.ent.st.shield)
              : 0)
          );
        }, 0);
      winner = hp(a) >= hp(b) ? 'A' : 'B';
    }
    const rating = (names) =>
      names.reduce(
        (t, n) => t + ((this.db.get(n) || {}).arena || { rating: ARENA.start }).rating,
        0,
      ) / Math.max(1, names.length);
    const rA = rating(match.teams.A),
      rB = rating(match.teams.B);
    for (const t of ['A', 'B'])
      for (const n of match.teams[t]) {
        const p = this.db.get(n);
        if (!p) continue;
        p.arena = p.arena || { rating: ARENA.start, w: 0, l: 0 };
        const won = t === winner,
          delta = elo(t === 'A' ? rA : rB, t === 'A' ? rB : rA, won);
        p.arena.rating = Math.max(100, p.arena.rating + delta);
        won ? p.arena.w++ : p.arena.l++;
        const cr = won ? 15000 * ARENA.modes[match.mode] : 3000;
        p.credits += cr;
        const o = this.sessionOf(n);
        if (o)
          this.toast(
            o,
            `Arena: team ${winner === 'A' ? 'Azure' : 'Crimson'} wins. Rating ${delta >= 0 ? '+' : ''}${delta} (now ${p.arena.rating}), ${credits(cr)} credits.`,
          );
        this.log(p, `Arena ${match.mode}: ${won ? 'won' : 'lost'} (rating ${p.arena.rating}).`);
      }
    for (const n of [...match.alive]) {
      const o = this.sessionOf(n);
      if (o) this.arenaExit(o, match, false);
    }
    match.sp.keep = false;
    delete this.matches[match.id];
    delete this.live[match.id];
    this.db.touch();
  },
  /**
   * Periodic tick check across all arena matches and matchmaker queues.
   * @this {Record<string, unknown>}
   * @returns {void}
   */
  arenaTick() {
    for (const m of Object.values(this.matches)) this.arenaCheck(m);
    for (const mode of Object.keys(this.arenaQ)) this.tryMatch(mode);
  },

  // ------------------------------------------------------------------ the exchange (player market): escrowed orders, matched by price
  /**
   * Handle player exchange operations (place, cancel, collect storage, credit transfer).
   * @this {Record<string, unknown>}
   * @param {import('./game.js').Session} s - Player session.
   * @param {{op: string, side?: string, qty?: number, price?: number, kind?: string, mat?: string, grade?: number, cid?: string, id?: number, to?: string, n?: number}} m - Exchange action payload.
   * @returns {void}
   */
  exchangeOp(s, m) {
    const d = s.data,
      p = STELLARS[d.stellar],
      W = this.db.world;
    if (!p || s.ent || !(p.hub || (p.svc.includes('T') && !p.site)))
      return this.toast(s, 'The exchange is open at market worlds.');
    d.storage = d.storage || {};
    switch (m.op) {
      case 'place': {
        const side = m.side === 'buy' ? 'buy' : 'sell',
          qty = Math.max(1, Math.min(9999, m.qty | 0)),
          price = Math.max(1, Math.min(EXCHANGE.maxPrice, Math.round(+m.price || 0)));
        let item;
        if (m.kind === 'mat' && MATERIALS.includes(m.mat) && m.grade >= 0 && m.grade <= 4)
          item = { kind: 'mat', mat: m.mat, grade: m.grade | 0 };
        else if (m.kind === 'com' && COMMODITIES.some((c) => c.id === m.cid))
          item = { kind: 'com', cid: m.cid };
        else return;
        if (W.orders.filter((o) => o.owner === d.name).length >= EXCHANGE.maxOrders)
          return this.toast(s, `You can have ${EXCHANGE.maxOrders} open orders.`);
        if (side === 'sell') {
          // escrow the goods
          if (item.kind === 'mat') {
            if (d.mats[item.mat][item.grade] < qty)
              return this.toast(s, 'You do not have that many crates.');
            d.mats[item.mat][item.grade] -= qty;
          } else {
            if ((d.cargo[item.cid] || 0) < qty)
              return this.toast(s, 'You do not have that much in your hold.');
            d.cargo[item.cid] -= qty;
            if (!d.cargo[item.cid]) delete d.cargo[item.cid];
          }
        } else {
          if (d.credits < qty * price)
            return this.toast(s, 'Not enough credits to back that order.');
          d.credits -= qty * price;
        }
        const order = { id: W.nextOrder++, owner: d.name, side, item, qty, price, t: Date.now() };
        this.matchOrder(order);
        if (order.qty > 0) {
          W.orders.push(order);
          this.toast(
            s,
            `Order placed: ${side} ${order.qty} ${this.itemName(item)} at ${credits(price)}.`,
          );
        }
        break;
      }
      case 'cancel': {
        const o = W.orders.find((x) => x.id === m.id && x.owner === d.name);
        if (!o) return;
        this.refundOrder(o);
        W.orders = W.orders.filter((x) => x !== o);
        this.toast(s, 'Order cancelled.');
        break;
      }
      case 'collect': {
        const st = this.stats(d);
        let room = st.cargo - Object.values(d.cargo).reduce((a, b) => a + b, 0),
          got = 0;
        for (const [k, v] of Object.entries(d.storage)) {
          const n = Math.min(v, room);
          if (n <= 0) continue;
          d.cargo[k] = (d.cargo[k] || 0) + n;
          d.storage[k] -= n;
          if (!d.storage[k]) delete d.storage[k];
          room -= n;
          got += n;
        }
        this.toast(
          s,
          got ? `Loaded ${got} t from exchange storage.` : 'Nothing in storage, or no room.',
        );
        break;
      }
      case 'transfer': {
        // send credits to another captain
        const to = this.db.get(String(m.to || '')),
          n = Math.max(0, Math.min(d.credits, m.n | 0));
        if (!to || to.name === d.name) return this.toast(s, 'No captain by that name.');
        if (n < 1000) return this.toast(s, 'Transfers start at 1,000 credits.');
        d.credits -= n;
        to.credits += n;
        this.log(to, `Received ${credits(n)} credits from ${d.name}.`);
        this.log(d, `Sent ${credits(n)} credits to ${to.name}.`);
        const o = this.sessionOf(to.name);
        if (o) {
          this.toast(o, `${d.name} sent you ${credits(n)} credits.`);
          this.you(o);
        }
        this.toast(s, `Sent ${credits(n)} credits to ${to.name}.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  /**
   * Format display name of an exchange order item (material grade or commodity).
   * @this {Record<string, unknown>}
   * @param {{kind: string, mat?: string, grade?: number, cid?: string}} it - Exchange item specification.
   * @returns {string} Formatted item name.
   */
  itemName(it) {
    return it.kind === 'mat' ? `${it.mat} ${GRADES[it.grade]}` : comName(it.cid);
  },
  /**
   * Compare two exchange items for type, material, grade, or commodity identity.
   * @this {Record<string, unknown>}
   * @param {{kind: string, mat?: string, grade?: number, cid?: string}} a - First item.
   * @param {{kind: string, mat?: string, grade?: number, cid?: string}} b - Second item.
   * @returns {boolean} True if items match.
   */
  sameItem(a, b) {
    return (
      a.kind === b.kind &&
      (a.kind === 'mat' ? a.mat === b.mat && a.grade === b.grade : a.cid === b.cid)
    );
  },
  /**
   * Deliver purchased goods to a buyer (materials directly, commodities to exchange storage).
   * @this {Record<string, unknown>}
   * @param {string} name - Buyer captain name.
   * @param {{kind: string, mat?: string, grade?: number, cid?: string}} it - Purchased item.
   * @param {number} qty - Quantity purchased.
   * @returns {void}
   */
  deliver(name, it, qty) {
    // goods to a buyer: crates straight in, commodities to exchange storage
    const p = this.db.get(name);
    if (!p) return;
    if (it.kind === 'mat') p.mats[it.mat][it.grade] += qty;
    else {
      p.storage = p.storage || {};
      p.storage[it.cid] = (p.storage[it.cid] || 0) + qty;
    }
  },
  /**
   * Credit payment amount to a seller captain's account.
   * @this {Record<string, unknown>}
   * @param {string} name - Captain name.
   * @param {number} n - Credit amount.
   * @returns {void}
   */
  pay(name, n) {
    const p = this.db.get(name);
    if (p) {
      p.credits += n;
      p.stats.earned += n;
    }
  },
  /**
   * Refund escrowed credits or inventory items for a cancelled exchange order.
   * @this {Record<string, unknown>}
   * @param {Record<string, unknown>} o - Order record.
   * @returns {void}
   */
  refundOrder(o) {
    if (o.side === 'sell') this.deliver(o.owner, o.item, o.qty);
    else this.pay(o.owner, o.qty * o.price);
  },
  /**
   * Match an incoming exchange order against the open order book.
   * @this {Record<string, unknown>}
   * @param {Record<string, unknown>} order - Incoming order record.
   * @returns {void}
   */
  matchOrder(order) {
    const W = this.db.world;
    const book = W.orders
      .filter(
        (o) =>
          o.side !== order.side &&
          this.sameItem(o.item, order.item) &&
          o.owner !== order.owner &&
          (order.side === 'buy' ? o.price <= order.price : o.price >= order.price),
      )
      .sort((a, b) =>
        order.side === 'buy' ? a.price - b.price || a.t - b.t : b.price - a.price || a.t - b.t,
      );
    for (const o of book) {
      if (!order.qty) break;
      const n = Math.min(order.qty, o.qty),
        price = o.price,
        buyer = order.side === 'buy' ? order : o,
        seller = order.side === 'buy' ? o : order;
      this.deliver(buyer.owner, order.item, n);
      this.pay(seller.owner, Math.round(n * price * (1 - EXCHANGE.fee)));
      if (buyer === order && order.price > price) this.pay(order.owner, n * (order.price - price)); // the buyer escrowed at their own price
      order.qty -= n;
      o.qty -= n;
      for (const nm of [buyer.owner, seller.owner]) {
        const ss = this.sessionOf(nm);
        if (ss) {
          this.toast(
            ss,
            `Exchange: ${nm === buyer.owner ? 'bought' : 'sold'} ${n} ${this.itemName(order.item)} at ${credits(price)}.`,
          );
          this.notify(
            ss,
            'Exchange order filled',
            `${n} ${this.itemName(order.item)} at ${credits(price)}`,
          );
          this.you(ss);
        }
      }
    }
    W.orders = W.orders.filter((o) => o.qty > 0);
  },
  /**
   * Build exchange order book summary and player-specific order state for client.
   * @this {Record<string, unknown>}
   * @param {import('./game.js').PlayerData} d - Saved player data.
   * @returns {Record<string, unknown>} Exchange book payload.
   */
  exchangePayload(d) {
    const book = {};
    for (const o of this.db.world.orders) {
      const k = o.item.kind === 'mat' ? `mat:${o.item.mat}:${o.item.grade}` : `com:${o.item.cid}`;
      const b = (book[k] = book[k] || { item: o.item, bid: 0, ask: 0, bids: 0, asks: 0 });
      if (o.side === 'buy') {
        b.bid = Math.max(b.bid, o.price);
        b.bids += o.qty;
      } else {
        b.ask = b.ask ? Math.min(b.ask, o.price) : o.price;
        b.asks += o.qty;
      }
    }
    return {
      book: Object.values(book),
      mine: this.db.world.orders.filter((o) => o.owner === d.name),
      storage: d.storage || {},
    };
  },

  // ------------------------------------------------------------------ leaderboards and profiles
  /**
   * Retrieve top 20 rankings for a given leaderboard category.
   * @this {Record<string, unknown>}
   * @param {string} cat - Leaderboard category ('earned', 'kills', 'mined', 'arena', 'station', 'colonies', 'mastery').
   * @returns {Array<{name: string, fleet: null, v: number}>} Top leaderboard entries.
   */
  leaderboard(cat) {
    const all = Object.values(this.db.players),
      vals = {
        earned: (p) => (p.stats && p.stats.earned) || 0,
        kills: (p) => (p.stats && p.stats.kills) || 0,
        mined: (p) => (p.stats && p.stats.mined) || 0,
        arena: (p) => (p.arena && p.arena.w + p.arena.l ? p.arena.rating : 0),
        station: (p) => (p.station && p.station.ops) || 0,
        colonies: (p) => this.coloniesOf(p).length,
        mastery: (p) => Object.values(p.mastery || {}).reduce((a, b) => a + b, 0),
      };
    const val = Object.prototype.hasOwnProperty.call(vals, cat) ? vals[cat] : null;
    if (!val) return [];
    return all
      .map((p) => ({ name: p.name, fleet: null, v: Math.round(val(p)) }))
      .concat(this.rivalBoard ? this.rivalBoard(cat) : [])
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 20); // 1.1: rival captains compete too
  },
  /**
   * Fetch public captain profile overview by captain name.
   * @this {Record<string, unknown>}
   * @param {string} name - Captain player name.
   * @returns {Record<string, unknown> | null} Captain profile record or null if not found.
   */
  profile(name) {
    const p = this.db.get(String(name || ''));
    if (!p) return null;
    const top = Object.entries(p.mastery || {}).sort((a, b) => b[1] - a[1])[0];
    return {
      name: p.name,
      fleet: null,
      ship: this.A.ships[p.ship.hull].name,
      shipName: p.ship.name,
      ops: p.station.ops,
      site: p.station.site ? SYS[STELLARS[p.station.site].system].name : null,
      colonies: this.coloniesOf(p).map(([id]) => STELLARS[id].name),
      kills: p.stats.kills,
      earned: p.stats.earned,
      jumps: p.stats.jumps,
      mined: p.stats.mined || 0,
      arena: p.arena || null,
      mastery: top ? { ship: this.A.ships[top[0]].name, tier: masteryTier(top[1]) } : null,
      officers: (p.officers || []).length,
      online: !!this.sessionOf(p.name),
      created: p.created || null,
    };
  },
};
