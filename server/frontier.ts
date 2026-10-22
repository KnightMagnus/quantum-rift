import type {
  ArenaMatch,
  ColonyState as ColonyData,
  ExchangeItem,
  ExchangeOrder,
} from './world-contracts.ts';
import type { StellarBody } from '../shared/galaxy.ts';
export interface FrontierOperations {
  frontierInit(this: FrontierCapabilities): void;
  bonus(this: FrontierCapabilities, playerData: PlayerData): Record<string, number>;
  notify(this: FrontierCapabilities, session: Session, title: string, body: string): void;
  worldPayload(this: FrontierCapabilities): ReturnType<typeof FrontierOperations.worldPayload>;
  mastery(this: FrontierCapabilities, session: Session, amount: number): void;
  colonizable(this: FrontierCapabilities, p: StellarBody | null): boolean;
  coloniesOf(this: FrontierCapabilities, playerData: PlayerData): Array<[string, ColonyData]>;
  colonyMax(this: FrontierCapabilities, playerData: PlayerData): number;
  colonyBuffs(this: FrontierCapabilities, playerData: PlayerData): Record<string, number>;
  accrue(this: FrontierCapabilities, c: ColonyData): void;
  colonyPayload(
    this: FrontierCapabilities,
    p: StellarBody | null,
    playerData: PlayerData,
  ): ReturnType<typeof FrontierOperations.colonyPayload>;
  colonyOp(
    this: FrontierCapabilities,
    session: Session,
    m: { op: string; kind?: string; i?: number },
  ): void;
  defenseRating(this: FrontierCapabilities, playerData: PlayerData): number;
  defenseUpgrade(this: FrontierCapabilities, session: Session): void;
  raidStrength(this: FrontierCapabilities, playerData: PlayerData, win: number): number;
  raidCheck(this: FrontierCapabilities, session: Session): void;
  startWave(this: FrontierCapabilities, session: Session, strength: number): void;
  onWaveKill(this: FrontierCapabilities, entity: Entity): void;
  waveTick(this: FrontierCapabilities): void;
  resolveRaid(
    this: FrontierCapabilities,
    session: Session,
    strength: number,
    foughtOff: boolean,
  ): void;
  arenaOp(
    this: FrontierCapabilities,
    session: Session,
    m: { op: 'queue' | 'leave'; mode: '1v1' | '2v2' | '4v4' },
  ): void;
  arenaPayload(
    this: FrontierCapabilities,
    playerData: PlayerData,
    session: Session,
  ): ReturnType<typeof FrontierOperations.arenaPayload>;
  tryMatch(this: FrontierCapabilities, mode: '1v1' | '2v2' | '4v4'): ArenaMatch | null;
  arenaExit(this: FrontierCapabilities, session: Session, match: ArenaMatch, died: boolean): void;
  onArenaDeath(this: FrontierCapabilities, session: Session, space: Space): boolean;
  arenaCheck(this: FrontierCapabilities, match: ArenaMatch): void;
  arenaTick(this: FrontierCapabilities): void;
  exchangeOp(
    this: FrontierCapabilities,
    session: Session,
    m: {
      op: string;
      side?: string;
      qty?: number;
      price?: number;
      lots?: GradeLots;
      kind?: string;
      mat?: string;
      grade?: number;
      cid?: string;
      id?: number;
      to?: string;
      n?: number;
    },
  ): void;
  itemName(this: FrontierCapabilities, it: ExchangeItem): string;
  sameItem(this: FrontierCapabilities, a: ExchangeItem, b: ExchangeItem): boolean;
  deliver(
    this: FrontierCapabilities,
    name: string,
    it: ExchangeItem,
    qty: number,
    lots?: GradeLots,
  ): void;
  pay(this: FrontierCapabilities, name: string, n: number): void;
  refundOrder(this: FrontierCapabilities, o: ExchangeOrder): void;
  matchOrder(this: FrontierCapabilities, order: ExchangeOrder, reserve: () => void): void;
  exchangePayload(
    this: FrontierCapabilities,
    playerData: PlayerData,
  ): ReturnType<typeof FrontierOperations.exchangePayload>;
  leaderboard(
    this: FrontierCapabilities,
    cat: string,
  ): Array<{ name: string; fleet: null; v: number }>;
  profile(this: FrontierCapabilities, name: string): ReturnType<typeof FrontierOperations.profile>;
}
import type { FrontierCapabilities } from './features.ts';
import type { LotTransfer, GradeLots } from '../shared/cargo-contracts.ts';
import type { PlayerData, Session } from './game.ts';
import type { Entity, Space } from './space.ts';

import {
  migrateCargoLots,
  assertLots,
  planTake,
  applyTake,
  addLots,
  moveLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.ts';
// Quantum Rift: server feature operations: planetary colonies, station defense raids, ship
// mastery, the arena, the player exchange, leaderboards, captain profiles and browser notifications.
import { SYS, STELLARS, FACTIONS, COMMODITIES, MATERIALS, GRADES } from '../shared/galaxy.ts';
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
} from '../shared/frontier.ts';
import { credits } from '../shared/rules.ts';

/** @import { CaptainProfile, ColonyData } from '../client/frontier_ui.ts' */
/** @import { GradeLots } from '../shared/cargo-contracts.ts' */
/** @import { PlayerData, Session } from './game.ts' */
/** @import { Entity, Space } from './space.ts' */

/**
 * Clamp a numeric value between a lower and an upper bound.
 * @param {number} v - Value to clamp.
 * @param {number} a - Lower bound.
 * @param {number} b - Upper bound.
 * @returns {number} Clamped value.
 */
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/**
 * Look up commodity human-readable display name by commodity ID.
 * @param {string} id - Commodity identifier.
 * @returns {string} Commodity name.
 */
const comName = (id: string): string => (COMMODITIES.find((c) => c.id === id) || { name: id }).name;

export const FrontierOperations = {
  /**
   * Initialize world colonies, player market orders, and arena/wave structures.
   * @returns {void}
   */
  frontierInit(this: FrontierCapabilities) {
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
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, number>} Aggregated stat bonuses.
   */
  bonus(this: FrontierCapabilities, playerData: PlayerData) {
    const b = this.frontsBonus(playerData);
    const tier = masteryTier((playerData.mastery || {})[playerData.ship.hull] || 0);
    for (const [k, v] of Object.entries(MASTERY.bonus[tier] || {})) b[k] = (b[k] || 0) + v;
    for (const [k, v] of Object.entries(this.colonyBuffs(playerData))) b[k] = (b[k] || 0) + v;
    if (this.A.ships[playerData.ship.hull] && this.A.ships[playerData.ship.hull].role === 'survey')
      b.miningPct = (b.miningPct || 0) + 50; // survey ships mine better
    return b;
  },
  /**
   * Send a system notification message to a player session.
   * @param {Session} session - Player session.
   * @param {string} title - Notification title text.
   * @param {string} body - Notification body text.
   * @returns {void}
   */
  notify(this: FrontierCapabilities, session: Session, title: string, body: string) {
    if (session) this.send(session, { t: 'notify', title, body });
  },

  /**
   * Build world telemetry payload augmented with active colony ownership names.
   * @returns {Record<string, string | number | boolean>} World telemetry payload.
   */
  worldPayload(this: FrontierCapabilities) {
    const w = this.frontsWorldPayload() as ReturnType<
        FrontierCapabilities['frontsWorldPayload']
      > & { colonies: Record<string, string> },
      col: Record<string, string> = {};
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
   * @param {Session} session - Player session.
   * @param {number} amount - Mastery points to add.
   * @returns {void}
   */
  mastery(this: FrontierCapabilities, session: Session, amount: number) {
    const playerData = session.data;
    playerData.mastery = playerData.mastery || {};
    const h = playerData.ship.hull,
      before = masteryTier(playerData.mastery[h] || 0);
    playerData.mastery[h] = Math.round(((playerData.mastery[h] || 0) + amount) * 10) / 10;
    const after = masteryTier(playerData.mastery[h]);
    if (after > before) {
      const H = this.A.ships[h];
      this.toast(
        session,
        `Mastery: your ${H.name} reached Tier ${after}.${after === 5 ? ' Her hull now carries a gold trim.' : ''}`,
      );
      this.log(playerData, `${H.name} reached mastery Tier ${after}.`);
      if (session.ent) session.ent.elite = after >= 5;
    }
  },

  // ------------------------------------------------------------------ colonies
  /**
   * Determine whether a stellar body is eligible for player colonization.
   * @param {StellarBody | null} p - Stellar body.
   * @returns {boolean} True if colonizable.
   */
  colonizable(this: FrontierCapabilities, p: StellarBody | null) {
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
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<[string, ColonyData]>} List of [stellarId, colony] pairs.
   */
  coloniesOf(this: FrontierCapabilities, playerData: PlayerData) {
    const k = this.db.key(playerData.name);
    return Object.entries(this.db.world.colonies).filter(([, c]) => c.owner === k);
  },
  /**
   * Compute maximum allowed colonies for player based on personal Station Tier.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Maximum colonies.
   */
  colonyMax(this: FrontierCapabilities, playerData: PlayerData) {
    return playerData.station.ops >= 5 ? COLONY.maxAtOps5 : COLONY.max;
  },
  /**
   * Aggregate active stat buffs produced by buildings across all player-owned colonies.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, number>} Aggregated colony buff map.
   */
  colonyBuffs(this: FrontierCapabilities, playerData: PlayerData) {
    const out: Record<string, number> = {};
    if (!this.db.world.colonies) return out;
    for (const [, c] of this.coloniesOf(playerData))
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
   * @param {ColonyData} c - Colony data structure.
   * @returns {void}
   */
  accrue(this: FrontierCapabilities, c: ColonyData) {
    const now = Date.now(),
      h = (now - (c.t || now)) / 3600000,
      L = COLONY_LEVELS[c.lv]!;
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
   * @param {{id: string} | null} p - Stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string | number | boolean> | null} Colony telemetry payload, or open descriptor, or null.
   */
  colonyPayload(this: FrontierCapabilities, p: StellarBody | null, playerData: PlayerData) {
    if (!p) return null;
    const c = this.db.world.colonies[p.id];
    if (!c) return this.colonizable(p) ? { open: true } : null;
    this.accrue(c);
    const o = this.db.players[c.owner];
    return {
      owner: o ? o.name : '?',
      own: o && o.name === playerData.name,
      lv: c.lv,
      buildings: c.buildings,
      store: Object.fromEntries(Object.entries(c.store).map(([k, v]) => [k, Math.floor(v)])),
      name: c.name,
    };
  },
  /**
   * Handle planetary colony operations (founding, building, demolishing, upgrading, collecting, abandoning).
   * @param {Session} session - Player session.
   * @param {{op: string, kind?: string, i?: number}} m - Colony action payload.
   * @returns {void}
   */
  colonyOp(
    this: FrontierCapabilities,
    session: Session,
    m: { op: string; kind?: string; i?: number },
  ) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar!];
    if (!p || session.ent) return;
    const W = this.db.world,
      c = W.colonies[p.id],
      own = c && c.owner === this.db.key(playerData.name);
    switch (m.op) {
      case 'found': {
        if (!this.colonizable(p) || c) return this.toast(session, 'This world cannot be settled.');
        if (this.coloniesOf(playerData).length >= this.colonyMax(playerData))
          return this.toast(
            session,
            `You can run ${this.colonyMax(playerData)} colonies${playerData.station.ops < 5 ? ' (3 at Station Tier 5)' : ''}.`,
          );
        if (playerData.credits < COLONY.cost || !this.hasMats(playerData, COLONY.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= COLONY.cost;
        this.takeMats(playerData, COLONY.mats);
        W.colonies[p.id] = {
          owner: this.db.key(playerData.name),
          lv: 1,
          buildings: [],
          store: {},
          t: Date.now(),
          name: `${p.name} Colony`,
        };
        this.log(playerData, `Founded a colony on ${p.name} (${SYS[p.system].name}).`);
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${playerData.name} settled ${p.name} in ${SYS[p.system].name}.`,
        });
        break;
      }
      case 'build': {
        if (!own) return;
        const B = BUILDINGS[m.kind!];
        if (!B) return;
        if (c.buildings.length >= COLONY_LEVELS[c.lv]!.slots)
          return this.toast(session, 'Every building slot is used. Upgrade the colony for more.');
        if (B.buff && c.buildings.includes(m.kind!))
          return this.toast(session, 'One of each buff building per colony.');
        if (playerData.credits < B.cost) return this.toast(session, 'Not enough credits.');
        this.accrue(c);
        playerData.credits -= B.cost;
        c.buildings.push(m.kind!);
        this.toast(session, `${B.name} built.`);
        break;
      }
      case 'demolish': {
        if (!own) return;
        this.accrue(c);
        c.buildings.splice(m.i! | 0, 1);
        break;
      }
      case 'upgrade': {
        if (!own) return;
        const L = COLONY_LEVELS[c.lv + 1];
        if (!L) return;
        if (playerData.credits < L.cost! || !this.hasMats(playerData, L.mats!))
          return this.toast(session, 'You need the credits and materials listed.');
        this.accrue(c);
        playerData.credits -= L.cost!;
        this.takeMats(playerData, L.mats!);
        c.lv++;
        this.toast(session, `Colony upgraded to level ${c.lv}.`);
        this.log(playerData, `${c.name} reached level ${c.lv}.`);
        break;
      }
      case 'collect': {
        if (!own) return;
        assertLots(playerData.cargo, playerData.cargoLots);
        this.accrue(c);
        const st = this.stats(playerData);
        let room = st!.cargo - this.holdUsed(playerData);
        const got = [];
        if (c.store.credits >= 1) {
          const cr = Math.floor(c.store.credits);
          playerData.credits += cr;
          playerData.stats.earned += cr;
          c.store.credits -= cr;
          got.push(`${credits(cr)} cr`);
        }
        for (const [k, v] of Object.entries(c.store)) {
          if (k === 'credits') continue;
          const n = Math.min(Math.floor(v), room);
          if (n <= 0) continue;
          addLots(playerData.cargo, playerData.cargoLots, commonLots(k, n), Math.max(0, room));
          c.store[k] -= n;
          room -= n;
          got.push(`${n} t ${comName(k)}`);
        }
        this.toast(
          session,
          got.length ? `Collected ${got.join(', ')}.` : 'Nothing to collect (or no cargo room).',
        );
        break;
      }
      case 'abandon': {
        if (!own) return;
        delete W.colonies[p.id];
        this.log(playerData, `Abandoned the colony on ${p.name}.`);
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
    this.pushWorld();
  },

  // ------------------------------------------------------------------ station defense
  /**
   * Calculate personal station defense rating from turret level and Station Tier rating.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Defense rating score.
   */
  defenseRating(this: FrontierCapabilities, playerData: PlayerData) {
    const S = playerData.station;
    return (
      DEFENSE.levels[S.defense || 0].rating +
      S.ops * DEFENSE.opsRating +
      (S.ops >= 5 ? DEFENSE.gridBonus : 0)
    );
  },
  /**
   * Upgrade personal station defense turrets by one level.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  defenseUpgrade(this: FrontierCapabilities, session: Session) {
    const playerData = session.data,
      S = playerData.station,
      L = DEFENSE.levels[(S.defense || 0) + 1];
    if (!L) return this.toast(session, 'Station defenses are at their maximum.');
    if (playerData.credits < L.cost! || !this.hasMats(playerData, L.mats!))
      return this.toast(session, 'You need the credits and materials listed.');
    playerData.credits -= L.cost!;
    this.takeMats(playerData, L.mats!);
    S.defense = (S.defense || 0) + 1;
    this.toast(session, `Defense turrets upgraded to level ${S.defense}.`);
  },
  /**
   * Determine prospective NPC raid strength attacking player station in a time window.
   * @param {PlayerData} playerData - Saved player data.
   * @param {number} win - Time window index.
   * @returns {number} Raid strength score.
   */
  raidStrength(this: FrontierCapabilities, playerData: PlayerData, win: number) {
    const S = SYS[STELLARS[playerData.station.site!].system];
    let h = 0;
    for (const c of playerData.name + win) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 150 + playerData.station.ops * 150 + (h % 300) + S.danger * 80;
  },
  /**
   * Check whether personal station is due for an incoming raid encounter.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  raidCheck(this: FrontierCapabilities, session: Session) {
    const playerData = session.data,
      S = playerData.station;
    if (!S.site || S.ops < DEFENSE.minOps || this.waves[playerData.name]) return;
    const win = Math.floor(Date.now() / (DEFENSE.everyH * 3600000));
    if (S.raidWin === undefined) {
      S.raidWin = win;
      return;
    }
    if (S.raidWin >= win) return;
    S.raidWin = win;
    const strength = this.raidStrength(playerData, win),
      site = STELLARS[S.site];
    if (session.ent && playerData.sys === site.system) return this.startWave(session, strength);
    this.resolveRaid(session, strength, false);
  },
  /**
   * Spawn a live combat wave of hostile raiders targeting the player's personal station.
   * @param {Session} session - Player session.
   * @param {number} strength - Calculated raid strength.
   * @returns {void}
   */
  startWave(this: FrontierCapabilities, session: Session, strength: number) {
    const playerData = session.data,
      site = STELLARS[playerData.station.site!],
      sp = this.spaces[site.system],
      n = clamp(Math.round(strength / 160), 2, 8),
      ids = new Set<number>();
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
      e.wave = playerData.name;
      e.life = 1e9;
      e.target = session.ent;
      ids.add(e.id);
      sp.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
    }
    this.waves[playerData.name] = {
      ids,
      until: Date.now() + DEFENSE.waveMin * 60000,
      strength,
      sys: site.system,
    };
    this.toast(session, `RAID: ${n} raiders are closing on your Personal Station. Drive them off!`);
    this.notify(
      session,
      'Station under attack',
      `${n} raiders are attacking your Personal Station.`,
    );
  },
  /**
   * Track destroyed raid wave entities and resolve victory if all raiders are eliminated.
   * @param {Entity} entity - Killed ship entity.
   * @returns {void}
   */
  onWaveKill(this: FrontierCapabilities, entity: Entity) {
    const w = this.waves[entity.wave!];
    if (!w) return;
    w.ids.delete(entity.id);
    if (!w.ids.size) {
      delete this.waves[entity.wave!];
      const s = this.sessionOf(entity.wave!);
      if (s) this.resolveRaid(s, w.strength, true);
    }
  },
  /**
   * Periodic check on active defense waves, cleaning up expired raids.
   * @returns {void}
   */
  waveTick(this: FrontierCapabilities) {
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
   * @param {Session} session - Player session.
   * @param {number} strength - Raid strength rating.
   * @param {boolean} foughtOff - True if player actively destroyed the wave.
   * @returns {void}
   */
  resolveRaid(this: FrontierCapabilities, session: Session, strength: number, foughtOff: boolean) {
    const playerData = session.data,
      rating = this.defenseRating(playerData),
      win = foughtOff || Math.random() < rating / (rating + strength);
    if (win) {
      const cr = Math.round(
        strength *
          (foughtOff ? 60 : 30) *
          (this.flying && this.flying(playerData, 'bulwark') ? 2 : 1),
      );
      playerData.credits += cr;
      playerData.stats.earned += cr;
      if (this.specOnRaid) this.specOnRaid(session, true);
      let extra = '';
      if (foughtOff || Math.random() < 0.4) {
        const mt = MATERIALS[Math.floor(Math.random() * 3)],
          g = clamp(Math.floor(strength / 500), 0, 3);
        playerData.mats[mt][g]++;
        extra = ` and a ${mt} ${GRADES[g]} crate`;
      }
      const msg = foughtOff
        ? `You drove off the raid on your station: ${credits(cr)} credits salvage${extra}.`
        : `Your station's turrets repelled a raid (defense ${rating} vs ${strength}): ${credits(cr)} credits salvage${extra}.`;
      this.toast(session, msg);
      this.log(playerData, msg);
      this.notify(session, 'Raid repelled', msg);
    } else {
      const lost = [];
      for (const m of MATERIALS)
        for (let g = 0; g < 2; g++) {
          const n = Math.floor(playerData.mats[m][g] * 0.2);
          if (n) {
            playerData.mats[m][g] -= n;
            lost.push(`${n} ${m} ${GRADES[g]}`);
          }
        }
      playerData.station.refUnits = 0;
      const msg = `Raiders broke through your station's defenses (defense ${rating} vs ${strength}) and looted the refinery${lost.length ? ' and ' + lost.join(', ') : ''}. Upgrade the turrets.`;
      this.toast(session, msg);
      this.log(playerData, msg);
      this.notify(session, 'Station raided', msg);
    }
    this.db.touch();
    this.you(session);
  },

  // ------------------------------------------------------------------ the arena
  /**
   * Handle arena queue join and leave operations.
   * @param {Session} session - Player session.
   * @param {{op: 'queue' | 'leave', mode: '1v1' | '2v2' | '4v4'}} m - Arena action payload.
   * @returns {void}
   */
  arenaOp(
    this: FrontierCapabilities,
    session: Session,
    m: { op: 'queue' | 'leave'; mode: '1v1' | '2v2' | '4v4' },
  ) {
    const playerData = session.data;
    if (m.op === 'queue') {
      if (session.ent || !playerData.stellar)
        return this.toast(session, 'Queue for the arena while docked.');
      if (!ARENA.modes[m.mode]) return;
      for (const q of Object.values(this.arenaQ)) {
        const i = q.indexOf(session.id);
        if (i >= 0) q.splice(i, 1);
      }
      this.arenaQ[m.mode].push(session.id);
      this.toast(
        session,
        `Queued for ${m.mode}. You will be pulled into the Crucible when a match is ready.`,
      );
      this.tryMatch(m.mode);
    } else if (m.op === 'leave') {
      for (const q of Object.values(this.arenaQ)) {
        const i = q.indexOf(session.id);
        if (i >= 0) q.splice(i, 1);
      }
      this.toast(session, 'Left the arena queue.');
    }
    this.you(session);
  },
  /**
   * Build arena status payload including queue size and rating.
   * @param {PlayerData} playerData - Saved player data.
   * @param {Session} session - Player session.
   * @returns {Record<string, string | number | boolean>} Arena status descriptor.
   */
  arenaPayload(this: FrontierCapabilities, playerData: PlayerData, session: Session) {
    playerData.arena = playerData.arena || { rating: ARENA.start, w: 0, l: 0 };
    const q = Object.entries(this.arenaQ).find(([, q]) => q.includes(session.id));
    return {
      ...playerData.arena,
      queued: q ? q[0] : null,
      sizes: Object.fromEntries(Object.entries(this.arenaQ).map(([k, v]) => [k, v.length])),
    };
  },
  /**
   * Attempt to construct an arena match from queued players for a given mode.
   * @param {'1v1' | '2v2' | '4v4'} mode - Arena combat mode.
   * @returns {ArenaMatch | null} Created match descriptor or null if not enough players.
   */
  tryMatch(this: FrontierCapabilities, mode: '1v1' | '2v2' | '4v4') {
    const n = ARENA.modes[mode],
      q = this.arenaQ[mode];
    for (let i = q.length - 1; i >= 0; i--) {
      const o = this.sessions.get(q[i]);
      if (!o || o.ent || !o.data || !o.data.stellar) q.splice(i, 1);
    }
    if (q.length < n * 2) return null;
    const ids = q
      .splice(0, n * 2)
      .map((id) => this.sessions.get(id)!)
      .sort(
        (a, b) => ((b.data.arena || {}).rating || 1000) - ((a.data.arena || {}).rating || 1000),
      );
    const A: Session[] = [],
      B: Session[] = [];
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
      alive: new Set<string>(),
    });
    for (const [team, list, side] of [
      ['A', A, -1],
      ['B', B, 1],
    ] as const)
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
        // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
        for (const x of [...sp.ships.values()]) if (x.owner === o.ent!.id) sp.remove(x); // no escorts in the Crucible
        o.ent!.team = team;
        o.ent!.arena = id;
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
   * @param {Session} session - Player session.
   * @param {ArenaMatch} match - Arena match descriptor.
   * @param {boolean} died - True if ship was knocked out in combat.
   * @returns {void}
   */
  arenaExit(this: FrontierCapabilities, session: Session, match: ArenaMatch, died: boolean) {
    const playerData = session.data,
      sp = match.sp;
    if (session.ent) {
      // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
      for (const x of [...sp.ships.values()]) if (x.owner === session.ent.id) sp.remove(x);
      if (!died) sp.remove(session.ent, 'jump');
      sp.players--;
      session.ent = null;
    }
    match.alive.delete(playerData.name);
    playerData.stellar =
      playerData.arenaReturn && STELLARS[playerData.arenaReturn]
        ? playerData.arenaReturn
        : 'qstation';
    playerData.sys = STELLARS[playerData.stellar!].system;
    playerData.arenaReturn = null;
    playerData.fuel = undefined;
    playerData.shieldNow = playerData.armorNow = undefined;
    this.send(session, { t: 'arena', id: null });
    this.you(session);
    this.landed(session);
  },
  /**
   * Handle ship destruction inside the arena, free repair, and victory check.
   * @param {Session} session - Knocked-out player session.
   * @param {Space} space - Space simulation instance.
   * @returns {boolean} True if entity was in an arena match.
   */
  onArenaDeath(this: FrontierCapabilities, session: Session, space: Space) {
    const match = this.matches[space.id];
    if (!match) return false;
    this.toast(
      session,
      'Your ship was knocked out of the match. The arena crew patched her up for free.',
    );
    this.arenaExit(session, match, true);
    this.arenaCheck(match);
    return true;
  },
  /**
   * Check victory conditions for an active arena match and award Elo ratings and credits.
   * @param {ArenaMatch} match - Arena match descriptor.
   * @returns {void}
   */
  arenaCheck(this: FrontierCapabilities, match: ArenaMatch) {
    const alive = (t: 'A' | 'B') => match.teams[t].filter((n) => match.alive.has(n));
    const a = alive('A'),
      b = alive('B'),
      timeUp = Date.now() > match.until;
    if (a.length && b.length && !timeUp) return;
    let winner: 'A' | 'B' | null = !a.length ? 'B' : !b.length ? 'A' : null;
    if (!winner) {
      // time: the side with more hull and shield left wins
      const hp = (names: string[]) =>
        names.reduce((t, n) => {
          const o = this.sessionOf(n);
          return (
            t +
            (o && o.ent
              ? o.ent.armor / o.ent.st.armor + o.ent.shield / Math.max(1, o.ent.st!.shield)
              : 0)
          );
        }, 0);
      winner = hp(a) >= hp(b) ? 'A' : 'B';
    }
    const rating = (names: string[]) =>
      names.reduce(
        (t, n) => t + ((this.db.get(n) || {}).arena || { rating: ARENA.start }).rating,
        0,
      ) / Math.max(1, names.length);
    const rA = rating(match.teams.A),
      rB = rating(match.teams.B);
    for (const t of ['A', 'B'] as const)
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
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
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
   * @returns {void}
   */
  arenaTick(this: FrontierCapabilities) {
    for (const m of Object.values(this.matches)) this.arenaCheck(m);
    for (const mode of Object.keys(this.arenaQ)) this.tryMatch(mode as '1v1' | '2v2' | '4v4');
  },

  // ------------------------------------------------------------------ the exchange (player market): escrowed orders, matched by price
  /**
   * Handle player exchange operations (place, cancel, collect storage, credit transfer).
   * @param {Session} session - Player session.
   * @param {{op: string, side?: string, qty?: number, price?: number, lots?: GradeLots, kind?: string, mat?: string, grade?: number, cid?: string, id?: number, to?: string, n?: number}} m - Exchange action payload.
   * @returns {void}
   */
  exchangeOp(
    this: FrontierCapabilities,
    session: Session,
    m: {
      op: string;
      side?: string;
      qty?: number;
      price?: number;
      lots?: GradeLots;
      kind?: string;
      mat?: string;
      grade?: number;
      cid?: string;
      id?: number;
      to?: string;
      n?: number;
    },
  ) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar!],
      W = this.db.world;
    if (!p || session.ent || !(p.hub || (p.svc.includes('T') && !p.site)))
      return this.toast(session, 'The exchange is open at market worlds.');
    try {
      assertLots(playerData.cargo, playerData.cargoLots);
      assertLots(playerData.storage, playerData.storageLots);
    } catch {
      return this.toast(session, 'Cargo validation failed.');
    }
    switch (m.op) {
      case 'place': {
        const side = m.side === 'buy' ? 'buy' : 'sell',
          qty = Math.max(1, Math.min(9999, m.qty! | 0)),
          price = Math.max(1, Math.min(EXCHANGE.maxPrice, Math.round(+m.price! || 0)));
        let item: ExchangeItem, escrow: LotTransfer | undefined, reserve: () => void;
        if (m.kind === 'mat' && MATERIALS.includes(m.mat!) && m.grade! >= 0 && m.grade! <= 4)
          item = { kind: 'mat', mat: m.mat!, grade: m.grade! | 0 };
        else if (m.kind === 'com' && COMMODITIES.some((c) => c.id === m.cid))
          item = { kind: 'com', cid: m.cid! };
        else return;
        if (W.orders.filter((o) => o.owner === playerData.name).length >= EXCHANGE.maxOrders)
          return this.toast(session, `You can have ${EXCHANGE.maxOrders} open orders.`);
        if (side === 'sell') {
          // escrow the goods
          if (item.kind === 'mat') {
            if (
              playerData.mats[(item as Extract<ExchangeItem, { kind: 'mat' }>).mat][
                (item as Extract<ExchangeItem, { kind: 'mat' }>).grade
              ] < qty
            )
              return this.toast(session, 'You do not have that many crates.');
            reserve = () => {
              playerData.mats[(item as Extract<ExchangeItem, { kind: 'mat' }>).mat][
                (item as Extract<ExchangeItem, { kind: 'mat' }>).grade
              ] -= qty;
            };
          } else {
            if ((playerData.cargo[item.cid] || 0) < qty)
              return this.toast(session, 'You do not have that much in your hold.');
            try {
              escrow = planTake(playerData.cargo, playerData.cargoLots, item.cid, qty, m.lots);
            } catch {
              return this.toast(session, 'Those cargo grades are unavailable.');
            }
            reserve = () => applyTake(playerData.cargo, playerData.cargoLots, escrow!);
          }
        } else {
          if (playerData.credits < qty * price)
            return this.toast(session, 'Not enough credits to back that order.');
          reserve = () => {
            playerData.credits -= qty * price;
          };
        }
        const order = {
          id: W.nextOrder++,
          owner: playerData.name,
          side,
          item,
          qty,
          price,
          lots: escrow ? { ...escrow.grades } : undefined,
          t: Date.now(),
        };
        let committed = false;
        try {
          this.matchOrder(order, () => {
            reserve();
            committed = true;
          });
        } catch (error) {
          // Only preflight failures are denials. Never refund after a completed swap.
          if (committed) throw error;
          return this.toast(session, 'Order rejected: cargo validation failed.');
        }
        if (order.qty > 0) {
          this.toast(
            session,
            `Order placed: ${side} ${order.qty} ${this.itemName(item)} at ${credits(price)}.`,
          );
        }
        break;
      }
      case 'cancel': {
        const o = W.orders.find((x) => x.id === m.id && x.owner === playerData.name);
        if (!o) return;
        this.refundOrder(o);
        W.orders = W.orders.filter((x) => x !== o);
        this.toast(session, 'Order cancelled.');
        break;
      }
      case 'collect': {
        const st = this.stats(playerData);
        let room = st!.cargo - this.holdUsed(playerData),
          got = 0;
        for (const [k, v] of Object.entries(playerData.storage)) {
          const n = Math.min(v, room);
          if (n <= 0) continue;
          moveLots(
            playerData.storage,
            playerData.storageLots,
            playerData.cargo,
            playerData.cargoLots,
            k,
            n,
            'common-first',
            Math.max(0, room),
          );
          room -= n;
          got += n;
        }
        this.toast(
          session,
          got ? `Loaded ${got} t from exchange storage.` : 'Nothing in storage, or no room.',
        );
        break;
      }
      case 'transfer': {
        // send credits to another captain
        const to = this.db.get(String(m.to || '')),
          n = Math.max(0, Math.min(playerData.credits, m.n! | 0));
        if (!to || to.name === playerData.name)
          return this.toast(session, 'No captain by that name.');
        if (n < 1000) return this.toast(session, 'Transfers start at 1,000 credits.');
        playerData.credits -= n;
        to.credits += n;
        this.log(to, `Received ${credits(n)} credits from ${playerData.name}.`);
        this.log(playerData, `Sent ${credits(n)} credits to ${to.name}.`);
        const o = this.sessionOf(to.name);
        if (o) {
          this.toast(o, `${playerData.name} sent you ${credits(n)} credits.`);
          this.you(o);
        }
        this.toast(session, `Sent ${credits(n)} credits to ${to.name}.`);
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
   * Format display name of an exchange order item (material grade or commodity).
   * @param {ExchangeItem} it - Exchange item specification.
   * @returns {string} Formatted item name.
   */
  itemName(this: FrontierCapabilities, it: ExchangeItem) {
    return it.kind === 'mat' ? `${it.mat} ${GRADES[it.grade]}` : comName(it.cid);
  },
  /**
   * Compare two exchange items for type, material, grade, or commodity identity.
   * @param {ExchangeItem} a - First item.
   * @param {ExchangeItem} b - Second item.
   * @returns {boolean} True if items match.
   */
  sameItem(this: FrontierCapabilities, a: ExchangeItem, b: ExchangeItem) {
    return (
      a.kind === b.kind &&
      (a.kind === 'mat'
        ? a.mat === (b as typeof a).mat && a.grade === (b as typeof a).grade
        : a.cid === (b as typeof a).cid)
    );
  },
  /**
   * Deliver purchased goods to a buyer (materials directly, commodities to exchange storage).
   * @param {string} name - Buyer captain name.
   * @param {ExchangeItem} it - Purchased item.
   * @param {number} qty - Quantity purchased.
   * @param {GradeLots} [lots] Exact escrow grades.
   * @returns {void}
   */
  deliver(
    this: FrontierCapabilities,
    name: string,
    it: ExchangeItem,
    qty: number,
    lots?: GradeLots,
  ) {
    // goods to a buyer: crates straight in, commodities to exchange storage
    const p = this.db.get(name);
    if (!p) return;
    if (it.kind === 'mat') p.mats[it.mat][it.grade] += qty;
    else {
      migrateCargoLots(p);
      addLots(p.storage, p.storageLots, {
        cid: it.cid,
        qty,
        grades: lots === undefined ? commonLots(it.cid, qty).grades : lots,
      });
    }
  },
  /**
   * Credit payment amount to a seller captain's account.
   * @param {string} name - Captain name.
   * @param {number} n - Credit amount.
   * @returns {void}
   */
  pay(this: FrontierCapabilities, name: string, n: number) {
    const p = this.db.get(name);
    if (p) {
      p.credits += n;
      p.stats.earned += n;
    }
  },
  /**
   * Refund escrowed credits or inventory items for a cancelled exchange order.
   * @param {ExchangeOrder} o - Order record.
   * @returns {void}
   */
  refundOrder(this: FrontierCapabilities, o: ExchangeOrder) {
    if (o.side === 'sell') this.deliver(o.owner, o.item, o.qty, o.lots);
    else this.pay(o.owner, o.qty * o.price);
  },
  /**
   * Match an incoming exchange order against the open order book.
   * @param {ExchangeOrder} order - Incoming escrow order record.
   * @param {() => void} reserve - Commit the validated incoming reservation.
   * @returns {void}
   */
  matchOrder(this: FrontierCapabilities, order: ExchangeOrder, reserve: () => void) {
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
    // Validate every destination and escrow remainder before the first fill/pay.
    // Old book entries have no grade records and migrate as genuinely common escrow.
    const trialPlayers = new Map(),
      trialOrder = structuredClone(order);
    for (const original of book) {
      if (!trialOrder.qty) break;
      const o = structuredClone(original),
        buyer = trialOrder.side === 'buy' ? trialOrder : o,
        seller = trialOrder.side === 'buy' ? o : trialOrder,
        n = Math.min(trialOrder.qty, o.qty);
      if (seller.item.kind === 'com') {
        const available =
          seller.lots === undefined ? commonLots(seller.item.cid, seller.qty).grades : seller.lots;
        addLots(
          {},
          { version: 1, byCommodity: {} },
          { cid: seller.item.cid, qty: seller.qty, grades: available },
        );
        const selected = splitLots(available, n);
        let p = trialPlayers.get(buyer.owner);
        if (!p) {
          const saved = this.db.get(buyer.owner);
          if (!saved || !this.db.get(seller.owner)) throw new Error('Missing order owner');
          p = structuredClone(saved);
          migrateCargoLots(p);
          trialPlayers.set(buyer.owner, p);
        }
        addLots(p.storage, p.storageLots, { cid: seller.item.cid, qty: n, grades: selected });
        seller.lots = { ...available };
        for (const g of ['common', 'rich', 'pure'] as const) seller.lots![g] -= selected[g];
      }
      trialOrder.qty -= n;
    }
    reserve();
    const fills = [];
    for (const o of book) {
      if (!order.qty) break;
      const n = Math.min(order.qty, o.qty),
        price = o.price,
        buyer = order.side === 'buy' ? order : o,
        seller = order.side === 'buy' ? o : order;
      const available =
        seller.lots === undefined
          ? seller.item.kind === 'com'
            ? commonLots(seller.item.cid, seller.qty).grades
            : null
          : seller.lots;
      const selected = available ? splitLots(available, n) : undefined;
      this.deliver(buyer.owner, order.item, n, selected);
      if (selected) {
        seller.lots = available!;
        for (const g of ['common', 'rich', 'pure'] as const) seller.lots![g] -= selected[g];
      }
      this.pay(seller.owner, Math.round(n * price * (1 - EXCHANGE.fee)));
      if (buyer === order && order.price > price) this.pay(order.owner, n * (order.price - price)); // the buyer escrowed at their own price
      order.qty -= n;
      o.qty -= n;
      fills.push({ buyer: buyer.owner, seller: seller.owner, n, price });
    }
    W.orders = W.orders.filter((o) => o.qty > 0);
    if (order.qty > 0) W.orders.push(order);
    this.db.touch();
    // Notification/socket failures cannot roll back mass, credits or pending escrow.
    for (const { buyer, seller, n, price } of fills) {
      for (const nm of [buyer, seller]) {
        const ss = this.sessionOf(nm);
        if (ss) {
          this.toast(
            ss,
            `Exchange: ${nm === buyer ? 'bought' : 'sold'} ${n} ${this.itemName(order.item)} at ${credits(price)}.`,
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
  },
  /**
   * Build exchange order book summary and player-specific order state for client.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, Array<{by: string, p: number, n: number}>>} Exchange book payload.
   */
  exchangePayload(this: FrontierCapabilities, playerData: PlayerData) {
    const book: Record<
      string,
      { item: ExchangeItem; bid: number; ask: number; bids: number; asks: number }
    > = {};
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
      mine: this.db.world.orders.filter((o) => o.owner === playerData.name),
      storage: playerData.storage || {},
    };
  },

  // ------------------------------------------------------------------ leaderboards and profiles
  /**
   * Retrieve top 20 rankings for a given leaderboard category.
   * @param {string} cat - Leaderboard category ('earned', 'kills', 'mined', 'arena', 'station', 'colonies', 'mastery').
   * @returns {Array<{name: string, fleet: null, v: number}>} Top leaderboard entries.
   */
  leaderboard(this: FrontierCapabilities, cat: string) {
    const all = Object.values(this.db.players),
      vals: Record<string, (player: PlayerData) => number> = {
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
      .map<{ name: string; fleet?: string | null; ai?: boolean; v: number }>((p) => ({
        name: p.name,
        fleet: null,
        v: Math.round(val(p)),
      }))
      .concat(this.rivalBoard ? this.rivalBoard(cat) : [])
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 20); // rival captains compete too
  },
  /**
   * Fetch public captain profile overview by captain name.
   * @param {string} name - Captain player name.
   * @returns {CaptainProfile | null} Captain profile record or null if not found.
   */
  profile(this: FrontierCapabilities, name: string) {
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
      mastery: top ? { ship: this.A.ships[Number(top[0])].name, tier: masteryTier(top[1]) } : null,
      officers: (p.officers || []).length,
      online: !!this.sessionOf(p.name),
      created: p.created || null,
    };
  },
};
