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
  colonizable(this: FrontierCapabilities, stellarBody: StellarBody | null): boolean;
  coloniesOf(this: FrontierCapabilities, playerData: PlayerData): Array<[string, ColonyData]>;
  colonyMax(this: FrontierCapabilities, playerData: PlayerData): number;
  colonyBuffs(this: FrontierCapabilities, playerData: PlayerData): Record<string, number>;
  accrue(this: FrontierCapabilities, colonyState: ColonyData): void;
  colonyPayload(
    this: FrontierCapabilities,
    stellarBody: StellarBody | null,
    playerData: PlayerData,
  ): ReturnType<typeof FrontierOperations.colonyPayload>;
  colonyOp(
    this: FrontierCapabilities,
    session: Session,
    message: { op: string; kind?: string; i?: number },
  ): void;
  defenseRating(this: FrontierCapabilities, playerData: PlayerData): number;
  defenseUpgrade(this: FrontierCapabilities, session: Session): void;
  raidStrength(this: FrontierCapabilities, playerData: PlayerData, window: number): number;
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
    message: { op: 'queue' | 'leave'; mode: '1v1' | '2v2' | '4v4' },
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
    message: {
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
  itemName(this: FrontierCapabilities, exchangeItem: ExchangeItem): string;
  sameItem(
    this: FrontierCapabilities,
    exchangeItem: ExchangeItem,
    exchangeItem2: ExchangeItem,
  ): boolean;
  deliver(
    this: FrontierCapabilities,
    name: string,
    exchangeItem: ExchangeItem,
    quantity: number,
    lots?: GradeLots,
  ): void;
  pay(this: FrontierCapabilities, name: string, count: number): void;
  refundOrder(this: FrontierCapabilities, exchangeOrder: ExchangeOrder): void;
  matchOrder(this: FrontierCapabilities, order: ExchangeOrder, reserve: () => void): void;
  exchangePayload(
    this: FrontierCapabilities,
    playerData: PlayerData,
  ): ReturnType<typeof FrontierOperations.exchangePayload>;
  leaderboard(
    this: FrontierCapabilities,
    category: string,
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
import {
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
} from '../shared/galaxy.ts';
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
  elo as eloRating,
  EXCHANGE,
} from '../shared/frontier.ts';
import { credits } from '../shared/rules.ts';

/** @import { CaptainProfile, ColonyData } from '../client/frontier_ui.ts' */
/** @import { GradeLots } from '../shared/cargo-contracts.ts' */
/** @import { PlayerData, Session } from './game.ts' */
/** @import { Entity, Space } from './space.ts' */

/**
 * Clamp a numeric value between a lower and an upper bound.
 * @param {number} value - Value to clamp.
 * @param {number} firstValue - Lower bound.
 * @param {number} secondValue - Upper bound.
 * @returns {number} Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Look up commodity human-readable display name by commodity ID.
 * @param {string} identifier - Commodity identifier.
 * @returns {string} Commodity name.
 */
const comName = (identifier: string): string =>
  (COMMODITIES.find((commodityDef) => commodityDef.id === identifier) || { name: identifier }).name;

export const FrontierOperations = {
  /**
   * Initialize world colonies, player market orders, and arena/wave structures.
   * @returns {void}
   */
  frontierInit(this: FrontierCapabilities) {
    const worldData = this.db.world;
    worldData.colonies = worldData.colonies || {};
    worldData.orders = worldData.orders || [];
    worldData.nextOrder = worldData.nextOrder || 1;
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
    const frontsBonus2 = this.frontsBonus(playerData);
    const tier = masteryTier((playerData.mastery || {})[playerData.ship.hull] || 0);
    for (const [entryKey, value] of Object.entries(MASTERY.bonus[tier] || {}))
      frontsBonus2[entryKey] = (frontsBonus2[entryKey] || 0) + value;
    for (const [entryKey, value] of Object.entries(this.colonyBuffs(playerData)))
      frontsBonus2[entryKey] = (frontsBonus2[entryKey] || 0) + value;
    if (this.A.ships[playerData.ship.hull] && this.A.ships[playerData.ship.hull].role === 'survey')
      frontsBonus2.miningPct = (frontsBonus2.miningPct || 0) + 50; // survey ships mine better
    return frontsBonus2;
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
    const width = this.frontsWorldPayload() as ReturnType<
        FrontierCapabilities['frontsWorldPayload']
      > & { colonies: Record<string, string> },
      column: Record<string, string> = {};
    for (const [identifier, colonyState] of Object.entries(this.db.world.colonies || {})) {
      const playerAccount = this.db.players[colonyState.owner];
      if (playerAccount) column[identifier] = playerAccount.name;
    }
    width.colonies = column;
    return width;
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
    const hull2 = playerData.ship.hull,
      before = masteryTier(playerData.mastery[hull2] || 0);
    playerData.mastery[hull2] = Math.round(((playerData.mastery[hull2] || 0) + amount) * 10) / 10;
    const after = masteryTier(playerData.mastery[hull2]);
    if (after > before) {
      const shipHullAsset = this.A.ships[hull2];
      this.toast(
        session,
        `Mastery: your ${shipHullAsset.name} reached Tier ${after}.${after === 5 ? ' Her hull now carries a gold trim.' : ''}`,
      );
      this.log(playerData, `${shipHullAsset.name} reached mastery Tier ${after}.`);
      if (session.ent) session.ent.elite = after >= 5;
    }
  },

  // ------------------------------------------------------------------ colonies
  /**
   * Determine whether a stellar body is eligible for player colonization.
   * @param {StellarBody | null} stellarBody - Stellar body.
   * @returns {boolean} True if colonizable.
   */
  colonizable(this: FrontierCapabilities, stellarBody: StellarBody | null) {
    return !!(
      stellarBody &&
      stellarBody.kind === 'planet' &&
      !stellarBody.site &&
      stellarBody.svc.includes('L') &&
      FACTIONS[systemsById[stellarBody.system].faction].region
    );
  },
  /**
   * Retrieve all colonies owned by the player.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<[string, ColonyData]>} List of [stellarId, colony] pairs.
   */
  coloniesOf(this: FrontierCapabilities, playerData: PlayerData) {
    const entryKey = this.db.key(playerData.name);
    return Object.entries(this.db.world.colonies).filter(
      ([, colonyState]) => colonyState.owner === entryKey,
    );
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
    const result: Record<string, number> = {};
    if (!this.db.world.colonies) return result;
    for (const [, colonyState] of this.coloniesOf(playerData))
      for (const building of colonyState.buildings) {
        const colonyBuilding = BUILDINGS[building];
        if (colonyBuilding && colonyBuilding.buff)
          for (const [entryKey, value] of Object.entries(colonyBuilding.buff))
            result[entryKey] = Math.min(BUFF_CAP[entryKey] || 99, (result[entryKey] || 0) + value);
      }
    return result;
  },
  /**
   * Accrue passive production (credits, commodities) in colony storage based on elapsed time.
   * @param {ColonyData} colonyState - Colony data structure.
   * @returns {void}
   */
  accrue(this: FrontierCapabilities, colonyState: ColonyData) {
    const currentTime = Date.now(),
      height = (currentTime - (colonyState.t || currentTime)) / 3600000,
      colonyLevelInfo = COLONY_LEVELS[colonyState.lv]!;
    colonyState.store = colonyState.store || {};
    for (const building of colonyState.buildings) {
      const colonyBuilding = BUILDINGS[building];
      if (!colonyBuilding || !colonyBuilding.produce) continue;
      for (const [entryKey, value] of Object.entries(colonyBuilding.produce)) {
        const capacity = value * colonyLevelInfo.mult * COLONY.storeHours;
        colonyState.store[entryKey] = Math.min(
          capacity,
          (colonyState.store[entryKey] || 0) + value * colonyLevelInfo.mult * height,
        );
      }
    }
    colonyState.t = currentTime;
  },
  /**
   * Build network telemetry payload describing colony status at a stellar body.
   * @param {{id: string} | null} stellarBody - Stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string | number | boolean> | null} Colony telemetry payload, or open descriptor, or null.
   */
  colonyPayload(
    this: FrontierCapabilities,
    stellarBody: StellarBody | null,
    playerData: PlayerData,
  ) {
    if (!stellarBody) return null;
    const colonyState = this.db.world.colonies[stellarBody.id];
    if (!colonyState) return this.colonizable(stellarBody) ? { open: true } : null;
    this.accrue(colonyState);
    const playerAccount = this.db.players[colonyState.owner];
    return {
      owner: playerAccount ? playerAccount.name : '?',
      own: playerAccount && playerAccount.name === playerData.name,
      lv: colonyState.lv,
      buildings: colonyState.buildings,
      store: Object.fromEntries(
        Object.entries(colonyState.store).map(([entryKey, value]) => [entryKey, Math.floor(value)]),
      ),
      name: colonyState.name,
    };
  },
  /**
   * Handle planetary colony operations (founding, building, demolishing, upgrading, collecting, abandoning).
   * @param {Session} session - Player session.
   * @param {{op: string, kind?: string, i?: number}} message - Colony action payload.
   * @returns {void}
   */
  colonyOp(
    this: FrontierCapabilities,
    session: Session,
    message: { op: string; kind?: string; i?: number },
  ) {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!];
    if (!stellarBody || session.ent) return;
    const worldData = this.db.world,
      colonyState = worldData.colonies[stellarBody.id],
      owner2 = colonyState && colonyState.owner === this.db.key(playerData.name);
    switch (message.op) {
      case 'found': {
        if (!this.colonizable(stellarBody) || colonyState)
          return this.toast(session, 'This world cannot be settled.');
        if (this.coloniesOf(playerData).length >= this.colonyMax(playerData))
          return this.toast(
            session,
            `You can run ${this.colonyMax(playerData)} colonies${playerData.station.ops < 5 ? ' (3 at Station Tier 5)' : ''}.`,
          );
        if (playerData.credits < COLONY.cost || !this.hasMats(playerData, COLONY.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= COLONY.cost;
        this.takeMats(playerData, COLONY.mats);
        worldData.colonies[stellarBody.id] = {
          owner: this.db.key(playerData.name),
          lv: 1,
          buildings: [],
          store: {},
          t: Date.now(),
          name: `${stellarBody.name} Colony`,
        };
        this.log(
          playerData,
          `Founded a colony on ${stellarBody.name} (${systemsById[stellarBody.system].name}).`,
        );
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${playerData.name} settled ${stellarBody.name} in ${systemsById[stellarBody.system].name}.`,
        });
        break;
      }
      case 'build': {
        if (!owner2) return;
        const colonyBuilding = BUILDINGS[message.kind!];
        if (!colonyBuilding) return;
        if (colonyState.buildings.length >= COLONY_LEVELS[colonyState.lv]!.slots)
          return this.toast(session, 'Every building slot is used. Upgrade the colony for more.');
        if (colonyBuilding.buff && colonyState.buildings.includes(message.kind!))
          return this.toast(session, 'One of each buff building per colony.');
        if (playerData.credits < colonyBuilding.cost)
          return this.toast(session, 'Not enough credits.');
        this.accrue(colonyState);
        playerData.credits -= colonyBuilding.cost;
        colonyState.buildings.push(message.kind!);
        this.toast(session, `${colonyBuilding.name} built.`);
        break;
      }
      case 'demolish': {
        if (!owner2) return;
        this.accrue(colonyState);
        colonyState.buildings.splice(message.i! | 0, 1);
        break;
      }
      case 'upgrade': {
        if (!owner2) return;
        const colonyLevelInfo = COLONY_LEVELS[colonyState.lv + 1];
        if (!colonyLevelInfo) return;
        if (
          playerData.credits < colonyLevelInfo.cost! ||
          !this.hasMats(playerData, colonyLevelInfo.mats!)
        )
          return this.toast(session, 'You need the credits and materials listed.');
        this.accrue(colonyState);
        playerData.credits -= colonyLevelInfo.cost!;
        this.takeMats(playerData, colonyLevelInfo.mats!);
        colonyState.lv++;
        this.toast(session, `Colony upgraded to level ${colonyState.lv}.`);
        this.log(playerData, `${colonyState.name} reached level ${colonyState.lv}.`);
        break;
      }
      case 'collect': {
        if (!owner2) return;
        assertLots(playerData.cargo, playerData.cargoLots);
        this.accrue(colonyState);
        const computedShipStats = this.stats(playerData);
        let room = computedShipStats!.cargo - this.holdUsed(playerData);
        const received = [];
        if (colonyState.store.credits >= 1) {
          const credits2 = Math.floor(colonyState.store.credits);
          playerData.credits += credits2;
          playerData.stats.earned += credits2;
          colonyState.store.credits -= credits2;
          received.push(`${credits(credits2)} cr`);
        }
        for (const [entryKey, value] of Object.entries(colonyState.store)) {
          if (entryKey === 'credits') continue;
          const count = Math.min(Math.floor(value), room);
          if (count <= 0) continue;
          addLots(
            playerData.cargo,
            playerData.cargoLots,
            commonLots(entryKey, count),
            Math.max(0, room),
          );
          colonyState.store[entryKey] -= count;
          room -= count;
          received.push(`${count} t ${comName(entryKey)}`);
        }
        this.toast(
          session,
          received.length
            ? `Collected ${received.join(', ')}.`
            : 'Nothing to collect (or no cargo room).',
        );
        break;
      }
      case 'abandon': {
        if (!owner2) return;
        delete worldData.colonies[stellarBody.id];
        this.log(playerData, `Abandoned the colony on ${stellarBody.name}.`);
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
    const stationState = playerData.station;
    return (
      DEFENSE.levels[stationState.defense || 0].rating +
      stationState.ops * DEFENSE.opsRating +
      (stationState.ops >= 5 ? DEFENSE.gridBonus : 0)
    );
  },
  /**
   * Upgrade personal station defense turrets by one level.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  defenseUpgrade(this: FrontierCapabilities, session: Session) {
    const playerData = session.data,
      stationState = playerData.station,
      defenseLevelInfo = DEFENSE.levels[(stationState.defense || 0) + 1];
    if (!defenseLevelInfo) return this.toast(session, 'Station defenses are at their maximum.');
    if (
      playerData.credits < defenseLevelInfo.cost! ||
      !this.hasMats(playerData, defenseLevelInfo.mats!)
    )
      return this.toast(session, 'You need the credits and materials listed.');
    playerData.credits -= defenseLevelInfo.cost!;
    this.takeMats(playerData, defenseLevelInfo.mats!);
    stationState.defense = (stationState.defense || 0) + 1;
    this.toast(session, `Defense turrets upgraded to level ${stationState.defense}.`);
  },
  /**
   * Determine prospective NPC raid strength attacking player station in a time window.
   * @param {PlayerData} playerData - Saved player data.
   * @param {number} window - Time window index.
   * @returns {number} Raid strength score.
   */
  raidStrength(this: FrontierCapabilities, playerData: PlayerData, window: number) {
    const starSystem = systemsById[STELLARS[playerData.station.site!].system];
    let height = 0;
    for (const component of playerData.name + window)
      height = (height * 31 + component.charCodeAt(0)) >>> 0;
    return 150 + playerData.station.ops * 150 + (height % 300) + starSystem.danger * 80;
  },
  /**
   * Check whether personal station is due for an incoming raid encounter.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  raidCheck(this: FrontierCapabilities, session: Session) {
    const playerData = session.data,
      stationState = playerData.station;
    if (!stationState.site || stationState.ops < DEFENSE.minOps || this.waves[playerData.name])
      return;
    const window = Math.floor(Date.now() / (DEFENSE.everyH * 3600000));
    if (stationState.raidWin === undefined) {
      stationState.raidWin = window;
      return;
    }
    if (stationState.raidWin >= window) return;
    stationState.raidWin = window;
    const strength = this.raidStrength(playerData, window),
      site = STELLARS[stationState.site];
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
      space = this.spaces[site.system],
      clamp2 = clamp(Math.round(strength / 160), 2, 8),
      identifiers = new Set<number>();
    for (let index = 0; index < clamp2; index++) {
      const angle = (index / clamp2) * Math.PI * 2,
        faction2 = index % 3 === 2 && strength > 900 ? 'umbral' : 'hollow',
        pool = faction2 === 'umbral' ? [761, 762] : [705, 708, 711, 716];
      const entity = space.makeShip({
        hull: pool[index % pool.length],
        faction: faction2,
        x: site.x + Math.cos(angle) * 1400,
        y: site.y + Math.sin(angle) * 1400,
        ai: 'raid',
        name: index === 0 ? 'Raid Leader' : null,
      });
      entity.wave = playerData.name;
      entity.life = 1e9;
      entity.target = session.ent;
      identifiers.add(entity.id);
      space.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
    }
    this.waves[playerData.name] = {
      ids: identifiers,
      until: Date.now() + DEFENSE.waveMin * 60000,
      strength,
      sys: site.system,
    };
    this.toast(
      session,
      `RAID: ${clamp2} raiders are closing on your Personal Station. Drive them off!`,
    );
    this.notify(
      session,
      'Station under attack',
      `${clamp2} raiders are attacking your Personal Station.`,
    );
  },
  /**
   * Track destroyed raid wave entities and resolve victory if all raiders are eliminated.
   * @param {Entity} entity - Killed ship entity.
   * @returns {void}
   */
  onWaveKill(this: FrontierCapabilities, entity: Entity) {
    const raidWave = this.waves[entity.wave!];
    if (!raidWave) return;
    raidWave.ids.delete(entity.id);
    if (!raidWave.ids.size) {
      delete this.waves[entity.wave!];
      const session = this.sessionOf(entity.wave!);
      if (session) this.resolveRaid(session, raidWave.strength, true);
    }
  },
  /**
   * Periodic check on active defense waves, cleaning up expired raids.
   * @returns {void}
   */
  waveTick(this: FrontierCapabilities) {
    for (const [name, raidWave] of Object.entries(this.waves))
      if (Date.now() > raidWave.until) {
        delete this.waves[name];
        const space = this.live[raidWave.sys];
        if (space)
          for (const identifier of raidWave.ids) {
            const entity = space.ships.get(identifier);
            if (entity) space.remove(entity, 'jump');
          }
        const session = this.sessionOf(name);
        if (session)
          this.resolveRaid(
            session,
            raidWave.strength * Math.max(0.3, raidWave.ids.size / 4),
            false,
          );
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
      window = foughtOff || Math.random() < rating / (rating + strength);
    if (window) {
      const credits2 = Math.round(
        strength *
          (foughtOff ? 60 : 30) *
          (this.flying && this.flying(playerData, 'bulwark') ? 2 : 1),
      );
      playerData.credits += credits2;
      playerData.stats.earned += credits2;
      if (this.specOnRaid) this.specOnRaid(session, true);
      let extra = '';
      if (foughtOff || Math.random() < 0.4) {
        const materials = MATERIALS[Math.floor(Math.random() * 3)],
          clamp2 = clamp(Math.floor(strength / 500), 0, 3);
        playerData.mats[materials][clamp2]++;
        extra = ` and a ${materials} ${GRADES[clamp2]} crate`;
      }
      const message = foughtOff
        ? `You drove off the raid on your station: ${credits(credits2)} credits salvage${extra}.`
        : `Your station's turrets repelled a raid (defense ${rating} vs ${strength}): ${credits(credits2)} credits salvage${extra}.`;
      this.toast(session, message);
      this.log(playerData, message);
      this.notify(session, 'Raid repelled', message);
    } else {
      const lost = [];
      for (const mATERIALS of MATERIALS)
        for (let game = 0; game < 2; game++) {
          const count = Math.floor(playerData.mats[mATERIALS][game] * 0.2);
          if (count) {
            playerData.mats[mATERIALS][game] -= count;
            lost.push(`${count} ${mATERIALS} ${GRADES[game]}`);
          }
        }
      playerData.station.refUnits = 0;
      const message = `Raiders broke through your station's defenses (defense ${rating} vs ${strength}) and looted the refinery${lost.length ? ' and ' + lost.join(', ') : ''}. Upgrade the turrets.`;
      this.toast(session, message);
      this.log(playerData, message);
      this.notify(session, 'Station raided', message);
    }
    this.db.touch();
    this.you(session);
  },

  // ------------------------------------------------------------------ the arena
  /**
   * Handle arena queue join and leave operations.
   * @param {Session} session - Player session.
   * @param {{op: 'queue' | 'leave', mode: '1v1' | '2v2' | '4v4'}} message - Arena action payload.
   * @returns {void}
   */
  arenaOp(
    this: FrontierCapabilities,
    session: Session,
    message: { op: 'queue' | 'leave'; mode: '1v1' | '2v2' | '4v4' },
  ) {
    const playerData = session.data;
    if (message.op === 'queue') {
      if (session.ent || !playerData.stellar)
        return this.toast(session, 'Queue for the arena while docked.');
      if (!ARENA.modes[message.mode]) return;
      for (const quantity of Object.values(this.arenaQ)) {
        const indexOf2 = quantity.indexOf(session.id);
        if (indexOf2 >= 0) quantity.splice(indexOf2, 1);
      }
      this.arenaQ[message.mode].push(session.id);
      this.toast(
        session,
        `Queued for ${message.mode}. You will be pulled into the Crucible when a match is ready.`,
      );
      this.tryMatch(message.mode);
    } else if (message.op === 'leave') {
      for (const quantity of Object.values(this.arenaQ)) {
        const indexOf3 = quantity.indexOf(session.id);
        if (indexOf3 >= 0) quantity.splice(indexOf3, 1);
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
    const quantity = Object.entries(this.arenaQ).find(([, quantity]) =>
      quantity.includes(session.id),
    );
    return {
      ...playerData.arena,
      queued: quantity ? quantity[0] : null,
      sizes: Object.fromEntries(
        Object.entries(this.arenaQ).map(([entryKey, value]) => [entryKey, value.length]),
      ),
    };
  },
  /**
   * Attempt to construct an arena match from queued players for a given mode.
   * @param {'1v1' | '2v2' | '4v4'} mode - Arena combat mode.
   * @returns {ArenaMatch | null} Created match descriptor or null if not enough players.
   */
  tryMatch(this: FrontierCapabilities, mode: '1v1' | '2v2' | '4v4') {
    const mode2 = ARENA.modes[mode],
      arenaQ2 = this.arenaQ[mode];
    for (let index = arenaQ2.length - 1; index >= 0; index--) {
      const session = this.sessions.get(arenaQ2[index]);
      if (!session || session.ent || !session.data || !session.data.stellar)
        arenaQ2.splice(index, 1);
    }
    if (arenaQ2.length < mode2 * 2) return null;
    const sessions4 = arenaQ2
      .splice(0, mode2 * 2)
      .map((identifier) => this.sessions.get(identifier)!)
      .sort(
        (session, session3) =>
          ((session3.data.arena || {}).rating || 1000) -
          ((session.data.arena || {}).rating || 1000),
      );
    const sessions2: Session[] = [],
      sessions3: Session[] = [];
    sessions4.forEach((session, index) =>
      (index % 4 === 0 || index % 4 === 3 ? sessions2 : sessions3).push(session),
    ); // snake draft by rating
    const identifier = `arena-${this.nextMatch++}`;
    systemsById[identifier] = arenaSystem(identifier);
    const space = this.spaces[identifier];
    space.keep = true;
    const match = (this.matches[identifier] = {
      id: identifier,
      mode,
      sp: space,
      teams: {
        A: sessions2.map((session) => session.data.name),
        B: sessions3.map((session) => session.data.name),
      },
      until: Date.now() + ARENA.matchMin * 60000,
      alive: new Set<string>(),
    });
    for (const [team, list, side] of [
      ['A', sessions2, -1],
      ['B', sessions3, 1],
    ] as const)
      list.forEach((session, index) => {
        const playerData = session.data;
        playerData.arenaReturn = playerData.stellar;
        playerData.stellar = null;
        playerData.sys = identifier;
        this.spawnPlayer(
          session,
          (side * ARENA.size) / 2,
          (index - (list.length - 1) / 2) * 160,
          side < 0 ? Math.PI / 2 : -Math.PI / 2,
          0,
        );
        // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
        for (const entity of [...space.ships.values()])
          if (entity.owner === session.ent!.id) space.remove(entity); // no escorts in the Crucible
        session.ent!.team = team;
        session.ent!.arena = identifier;
        match.alive.add(playerData.name);
        this.send(session, {
          t: 'arena',
          id: identifier,
          team,
          teams: match.teams,
          until: match.until,
        });
        this.toast(
          session,
          `ARENA ${mode}: you fight for team ${team === 'A' ? 'Azure' : 'Crimson'}. Last team flying wins.`,
        );
        this.notify(session, 'Arena match found', `${mode} in the Crucible. Good hunting.`);
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
      space = match.sp;
    if (session.ent) {
      // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
      for (const entity of [...space.ships.values()])
        if (entity.owner === session.ent.id) space.remove(entity);
      if (!died) space.remove(session.ent, 'jump');
      space.players--;
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
    const alive = (time: 'A' | 'B') => match.teams[time].filter((count) => match.alive.has(count));
    const alive2 = alive('A'),
      alive3 = alive('B'),
      timeUp = Date.now() > match.until;
    if (alive2.length && alive3.length && !timeUp) return;
    let winner: 'A' | 'B' | null = !alive2.length ? 'B' : !alive3.length ? 'A' : null;
    if (!winner) {
      // time: the side with more hull and shield left wins
      const hullPoints = (names: string[]) =>
        names.reduce((time, count) => {
          const session = this.sessionOf(count);
          return (
            time +
            (session && session.ent
              ? session.ent.armor / session.ent.st.armor +
                session.ent.shield / Math.max(1, session.ent.st!.shield)
              : 0)
          );
        }, 0);
      winner = hullPoints(alive2) >= hullPoints(alive3) ? 'A' : 'B';
    }
    const rating = (names: string[]) =>
      names.reduce(
        (time, count) =>
          time + ((this.db.get(count) || {}).arena || { rating: ARENA.start }).rating,
        0,
      ) / Math.max(1, names.length);
    const rating2 = rating(match.teams.A),
      rating3 = rating(match.teams.B);
    for (const time of ['A', 'B'] as const)
      for (const team of match.teams[time]) {
        const playerAccount = this.db.get(team);
        if (!playerAccount) continue;
        playerAccount.arena = playerAccount.arena || { rating: ARENA.start, w: 0, l: 0 };
        const hasWon = time === winner,
          delta = eloRating(
            time === 'A' ? rating2 : rating3,
            time === 'A' ? rating3 : rating2,
            hasWon,
          );
        playerAccount.arena.rating = Math.max(100, playerAccount.arena.rating + delta);
        hasWon ? playerAccount.arena.w++ : playerAccount.arena.l++;
        const credits2 = hasWon ? 15000 * ARENA.modes[match.mode] : 3000;
        playerAccount.credits += credits2;
        const session = this.sessionOf(team);
        if (session)
          this.toast(
            session,
            `Arena: team ${winner === 'A' ? 'Azure' : 'Crimson'} wins. Rating ${delta >= 0 ? '+' : ''}${delta} (now ${playerAccount.arena.rating}), ${credits(credits2)} credits.`,
          );
        this.log(
          playerAccount,
          `Arena ${match.mode}: ${hasWon ? 'won' : 'lost'} (rating ${playerAccount.arena.rating}).`,
        );
      }
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const count of [...match.alive]) {
      const session = this.sessionOf(count);
      if (session) this.arenaExit(session, match, false);
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
    for (const arenaMatch of Object.values(this.matches)) this.arenaCheck(arenaMatch);
    for (const mode of Object.keys(this.arenaQ)) this.tryMatch(mode as '1v1' | '2v2' | '4v4');
  },

  // ------------------------------------------------------------------ the exchange (player market): escrowed orders, matched by price
  /**
   * Handle player exchange operations (place, cancel, collect storage, credit transfer).
   * @param {Session} session - Player session.
   * @param {{op: string, side?: string, qty?: number, price?: number, lots?: GradeLots, kind?: string, mat?: string, grade?: number, cid?: string, id?: number, to?: string, n?: number}} message - Exchange action payload.
   * @returns {void}
   */
  exchangeOp(
    this: FrontierCapabilities,
    session: Session,
    message: {
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
      stellarBody = STELLARS[playerData.stellar!],
      worldData = this.db.world;
    if (
      !stellarBody ||
      session.ent ||
      !(stellarBody.hub || (stellarBody.svc.includes('T') && !stellarBody.site))
    )
      return this.toast(session, 'The exchange is open at market worlds.');
    try {
      assertLots(playerData.cargo, playerData.cargoLots);
      assertLots(playerData.storage, playerData.storageLots);
    } catch {
      return this.toast(session, 'Cargo validation failed.');
    }
    switch (message.op) {
      case 'place': {
        const side = message.side === 'buy' ? 'buy' : 'sell',
          quantity = Math.max(1, Math.min(9999, message.qty! | 0)),
          price = Math.max(1, Math.min(EXCHANGE.maxPrice, Math.round(+message.price! || 0)));
        let item: ExchangeItem, escrow: LotTransfer | undefined, reserve: () => void;
        if (
          message.kind === 'mat' &&
          MATERIALS.includes(message.mat!) &&
          message.grade! >= 0 &&
          message.grade! <= 4
        )
          item = { kind: 'mat', mat: message.mat!, grade: message.grade! | 0 };
        else if (
          message.kind === 'com' &&
          COMMODITIES.some((commodityDef) => commodityDef.id === message.cid)
        )
          item = { kind: 'com', cid: message.cid! };
        else return;
        if (
          worldData.orders.filter((exchangeOrder) => exchangeOrder.owner === playerData.name)
            .length >= EXCHANGE.maxOrders
        )
          return this.toast(session, `You can have ${EXCHANGE.maxOrders} open orders.`);
        if (side === 'sell') {
          // escrow the goods
          if (item.kind === 'mat') {
            if (
              playerData.mats[(item as Extract<ExchangeItem, { kind: 'mat' }>).mat][
                (item as Extract<ExchangeItem, { kind: 'mat' }>).grade
              ] < quantity
            )
              return this.toast(session, 'You do not have that many crates.');
            reserve = () => {
              playerData.mats[(item as Extract<ExchangeItem, { kind: 'mat' }>).mat][
                (item as Extract<ExchangeItem, { kind: 'mat' }>).grade
              ] -= quantity;
            };
          } else {
            if ((playerData.cargo[item.cid] || 0) < quantity)
              return this.toast(session, 'You do not have that much in your hold.');
            try {
              escrow = planTake(
                playerData.cargo,
                playerData.cargoLots,
                item.cid,
                quantity,
                message.lots,
              );
            } catch {
              return this.toast(session, 'Those cargo grades are unavailable.');
            }
            reserve = () => applyTake(playerData.cargo, playerData.cargoLots, escrow!);
          }
        } else {
          if (playerData.credits < quantity * price)
            return this.toast(session, 'Not enough credits to back that order.');
          reserve = () => {
            playerData.credits -= quantity * price;
          };
        }
        const order = {
          id: worldData.nextOrder++,
          owner: playerData.name,
          side,
          item,
          qty: quantity,
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
        const exchangeOrder = worldData.orders.find(
          (exchangeOrder) =>
            exchangeOrder.id === message.id && exchangeOrder.owner === playerData.name,
        );
        if (!exchangeOrder) return;
        this.refundOrder(exchangeOrder);
        worldData.orders = worldData.orders.filter(
          (exchangeOrder2) => exchangeOrder2 !== exchangeOrder,
        );
        this.toast(session, 'Order cancelled.');
        break;
      }
      case 'collect': {
        const computedShipStats = this.stats(playerData);
        let room = computedShipStats!.cargo - this.holdUsed(playerData),
          received = 0;
        for (const [entryKey, value] of Object.entries(playerData.storage)) {
          const count = Math.min(value, room);
          if (count <= 0) continue;
          moveLots(
            playerData.storage,
            playerData.storageLots,
            playerData.cargo,
            playerData.cargoLots,
            entryKey,
            count,
            'common-first',
            Math.max(0, room),
          );
          room -= count;
          received += count;
        }
        this.toast(
          session,
          received
            ? `Loaded ${received} t from exchange storage.`
            : 'Nothing in storage, or no room.',
        );
        break;
      }
      case 'transfer': {
        // send credits to another captain
        const playerAccount = this.db.get(String(message.to || '')),
          count = Math.max(0, Math.min(playerData.credits, message.n! | 0));
        if (!playerAccount || playerAccount.name === playerData.name)
          return this.toast(session, 'No captain by that name.');
        if (count < 1000) return this.toast(session, 'Transfers start at 1,000 credits.');
        playerData.credits -= count;
        playerAccount.credits += count;
        this.log(playerAccount, `Received ${credits(count)} credits from ${playerData.name}.`);
        this.log(playerData, `Sent ${credits(count)} credits to ${playerAccount.name}.`);
        const session2 = this.sessionOf(playerAccount.name);
        if (session2) {
          this.toast(session2, `${playerData.name} sent you ${credits(count)} credits.`);
          this.you(session2);
        }
        this.toast(session, `Sent ${credits(count)} credits to ${playerAccount.name}.`);
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
   * @param {ExchangeItem} exchangeItem - Exchange item specification.
   * @returns {string} Formatted item name.
   */
  itemName(this: FrontierCapabilities, exchangeItem: ExchangeItem) {
    return exchangeItem.kind === 'mat'
      ? `${exchangeItem.mat} ${GRADES[exchangeItem.grade]}`
      : comName(exchangeItem.cid);
  },
  /**
   * Compare two exchange items for type, material, grade, or commodity identity.
   * @param {ExchangeItem} exchangeItem - First item.
   * @param {ExchangeItem} exchangeItem2 - Second item.
   * @returns {boolean} True if items match.
   */
  sameItem(this: FrontierCapabilities, exchangeItem: ExchangeItem, exchangeItem2: ExchangeItem) {
    return (
      exchangeItem.kind === exchangeItem2.kind &&
      (exchangeItem.kind === 'mat'
        ? exchangeItem.mat === (exchangeItem2 as typeof exchangeItem).mat &&
          exchangeItem.grade === (exchangeItem2 as typeof exchangeItem).grade
        : exchangeItem.cid === (exchangeItem2 as typeof exchangeItem).cid)
    );
  },
  /**
   * Deliver purchased goods to a buyer (materials directly, commodities to exchange storage).
   * @param {string} name - Buyer captain name.
   * @param {ExchangeItem} exchangeItem - Purchased item.
   * @param {number} quantity - Quantity purchased.
   * @param {GradeLots} [lots] Exact escrow grades.
   * @returns {void}
   */
  deliver(
    this: FrontierCapabilities,
    name: string,
    exchangeItem: ExchangeItem,
    quantity: number,
    lots?: GradeLots,
  ) {
    // goods to a buyer: crates straight in, commodities to exchange storage
    const playerAccount = this.db.get(name);
    if (!playerAccount) return;
    if (exchangeItem.kind === 'mat')
      playerAccount.mats[exchangeItem.mat][exchangeItem.grade] += quantity;
    else {
      migrateCargoLots(playerAccount);
      addLots(playerAccount.storage, playerAccount.storageLots, {
        cid: exchangeItem.cid,
        qty: quantity,
        grades: lots === undefined ? commonLots(exchangeItem.cid, quantity).grades : lots,
      });
    }
  },
  /**
   * Credit payment amount to a seller captain's account.
   * @param {string} name - Captain name.
   * @param {number} count - Credit amount.
   * @returns {void}
   */
  pay(this: FrontierCapabilities, name: string, count: number) {
    const playerAccount = this.db.get(name);
    if (playerAccount) {
      playerAccount.credits += count;
      playerAccount.stats.earned += count;
    }
  },
  /**
   * Refund escrowed credits or inventory items for a cancelled exchange order.
   * @param {ExchangeOrder} exchangeOrder - Order record.
   * @returns {void}
   */
  refundOrder(this: FrontierCapabilities, exchangeOrder: ExchangeOrder) {
    if (exchangeOrder.side === 'sell')
      this.deliver(exchangeOrder.owner, exchangeOrder.item, exchangeOrder.qty, exchangeOrder.lots);
    else this.pay(exchangeOrder.owner, exchangeOrder.qty * exchangeOrder.price);
  },
  /**
   * Match an incoming exchange order against the open order book.
   * @param {ExchangeOrder} order - Incoming escrow order record.
   * @param {() => void} reserve - Commit the validated incoming reservation.
   * @returns {void}
   */
  matchOrder(this: FrontierCapabilities, order: ExchangeOrder, reserve: () => void) {
    const worldData = this.db.world;
    const book = worldData.orders
      .filter(
        (exchangeOrder) =>
          exchangeOrder.side !== order.side &&
          this.sameItem(exchangeOrder.item, order.item) &&
          exchangeOrder.owner !== order.owner &&
          (order.side === 'buy'
            ? exchangeOrder.price <= order.price
            : exchangeOrder.price >= order.price),
      )
      .sort((exchangeOrder, exchangeOrder2) =>
        order.side === 'buy'
          ? exchangeOrder.price - exchangeOrder2.price || exchangeOrder.t - exchangeOrder2.t
          : exchangeOrder2.price - exchangeOrder.price || exchangeOrder.t - exchangeOrder2.t,
      );
    // Validate every destination and escrow remainder before the first fill/pay.
    // Old book entries have no grade records and migrate as genuinely common escrow.
    const trialPlayers = new Map(),
      trialOrder = structuredClone(order);
    for (const original of book) {
      if (!trialOrder.qty) break;
      const exchangeOrder = structuredClone(original),
        buyer = trialOrder.side === 'buy' ? trialOrder : exchangeOrder,
        seller = trialOrder.side === 'buy' ? exchangeOrder : trialOrder,
        count = Math.min(trialOrder.qty, exchangeOrder.qty);
      if (seller.item.kind === 'com') {
        const available =
          seller.lots === undefined ? commonLots(seller.item.cid, seller.qty).grades : seller.lots;
        addLots(
          {},
          { version: 1, byCommodity: {} },
          { cid: seller.item.cid, qty: seller.qty, grades: available },
        );
        const selected = splitLots(available, count);
        let position = trialPlayers.get(buyer.owner);
        if (!position) {
          const saved = this.db.get(buyer.owner);
          if (!saved || !this.db.get(seller.owner)) throw new Error('Missing order owner');
          position = structuredClone(saved);
          migrateCargoLots(position);
          trialPlayers.set(buyer.owner, position);
        }
        addLots(position.storage, position.storageLots, {
          cid: seller.item.cid,
          qty: count,
          grades: selected,
        });
        seller.lots = { ...available };
        for (const game of ['common', 'rich', 'pure'] as const)
          seller.lots![game] -= selected[game];
      }
      trialOrder.qty -= count;
    }
    reserve();
    const fills = [];
    for (const exchangeOrder of book) {
      if (!order.qty) break;
      const count = Math.min(order.qty, exchangeOrder.qty),
        price = exchangeOrder.price,
        buyer = order.side === 'buy' ? order : exchangeOrder,
        seller = order.side === 'buy' ? exchangeOrder : order;
      const available =
        seller.lots === undefined
          ? seller.item.kind === 'com'
            ? commonLots(seller.item.cid, seller.qty).grades
            : null
          : seller.lots;
      const selected = available ? splitLots(available, count) : undefined;
      this.deliver(buyer.owner, order.item, count, selected);
      if (selected) {
        seller.lots = available!;
        for (const game of ['common', 'rich', 'pure'] as const)
          seller.lots![game] -= selected[game];
      }
      this.pay(seller.owner, Math.round(count * price * (1 - EXCHANGE.fee)));
      if (buyer === order && order.price > price)
        this.pay(order.owner, count * (order.price - price)); // the buyer escrowed at their own price
      order.qty -= count;
      exchangeOrder.qty -= count;
      fills.push({ buyer: buyer.owner, seller: seller.owner, n: count, price });
    }
    worldData.orders = worldData.orders.filter((exchangeOrder) => exchangeOrder.qty > 0);
    if (order.qty > 0) worldData.orders.push(order);
    this.db.touch();
    // Notification/socket failures cannot roll back mass, credits or pending escrow.
    for (const { buyer, seller, n: count, price } of fills) {
      for (const name of [buyer, seller]) {
        const session = this.sessionOf(name);
        if (session) {
          this.toast(
            session,
            `Exchange: ${name === buyer ? 'bought' : 'sold'} ${count} ${this.itemName(order.item)} at ${credits(price)}.`,
          );
          this.notify(
            session,
            'Exchange order filled',
            `${count} ${this.itemName(order.item)} at ${credits(price)}`,
          );
          this.you(session);
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
    for (const exchangeOrder of this.db.world.orders) {
      const entryKey =
        exchangeOrder.item.kind === 'mat'
          ? `mat:${exchangeOrder.item.mat}:${exchangeOrder.item.grade}`
          : `com:${exchangeOrder.item.cid}`;
      const secondValue = (book[entryKey] = book[entryKey] || {
        item: exchangeOrder.item,
        bid: 0,
        ask: 0,
        bids: 0,
        asks: 0,
      });
      if (exchangeOrder.side === 'buy') {
        secondValue.bid = Math.max(secondValue.bid, exchangeOrder.price);
        secondValue.bids += exchangeOrder.qty;
      } else {
        secondValue.ask = secondValue.ask
          ? Math.min(secondValue.ask, exchangeOrder.price)
          : exchangeOrder.price;
        secondValue.asks += exchangeOrder.qty;
      }
    }
    return {
      book: Object.values(book),
      mine: this.db.world.orders.filter((exchangeOrder) => exchangeOrder.owner === playerData.name),
      storage: playerData.storage || {},
    };
  },

  // ------------------------------------------------------------------ leaderboards and profiles
  /**
   * Retrieve top 20 rankings for a given leaderboard category.
   * @param {string} category - Leaderboard category ('earned', 'kills', 'mined', 'arena', 'station', 'colonies', 'mastery').
   * @returns {Array<{name: string, fleet: null, v: number}>} Top leaderboard entries.
   */
  leaderboard(this: FrontierCapabilities, category: string) {
    const playerAccounts = Object.values(this.db.players),
      values2: Record<string, (player: PlayerData) => number> = {
        earned: (playerData) => (playerData.stats && playerData.stats.earned) || 0,
        kills: (playerData) => (playerData.stats && playerData.stats.kills) || 0,
        mined: (playerData) => (playerData.stats && playerData.stats.mined) || 0,
        arena: (playerData) =>
          playerData.arena && playerData.arena.w + playerData.arena.l ? playerData.arena.rating : 0,
        station: (playerData) => (playerData.station && playerData.station.ops) || 0,
        colonies: (playerData) => this.coloniesOf(playerData).length,
        mastery: (playerData) =>
          Object.values(playerData.mastery || {}).reduce(
            (firstValue, secondValue) => firstValue + secondValue,
            0,
          ),
      };
    const value = Object.prototype.hasOwnProperty.call(values2, category)
      ? values2[category]
      : null;
    if (!value) return [];
    return playerAccounts
      .map<{ name: string; fleet?: string | null; ai?: boolean; v: number }>((playerAccount) => ({
        name: playerAccount.name,
        fleet: null,
        v: Math.round(value(playerAccount)),
      }))
      .concat(this.rivalBoard ? this.rivalBoard(category) : [])
      .filter((positionX) => positionX.v > 0)
      .sort((firstValue, secondValue) => secondValue.v - firstValue.v)
      .slice(0, 20); // rival captains compete too
  },
  /**
   * Fetch public captain profile overview by captain name.
   * @param {string} name - Captain player name.
   * @returns {CaptainProfile | null} Captain profile record or null if not found.
   */
  profile(this: FrontierCapabilities, name: string) {
    const playerAccount = this.db.get(String(name || ''));
    if (!playerAccount) return null;
    const sort2 = Object.entries(playerAccount.mastery || {}).sort(
      (firstValue, secondValue) => secondValue[1] - firstValue[1],
    )[0];
    return {
      name: playerAccount.name,
      fleet: null,
      ship: this.A.ships[playerAccount.ship.hull].name,
      shipName: playerAccount.ship.name,
      ops: playerAccount.station.ops,
      site: playerAccount.station.site
        ? systemsById[STELLARS[playerAccount.station.site].system].name
        : null,
      colonies: this.coloniesOf(playerAccount).map(([identifier]) => STELLARS[identifier].name),
      kills: playerAccount.stats.kills,
      earned: playerAccount.stats.earned,
      jumps: playerAccount.stats.jumps,
      mined: playerAccount.stats.mined || 0,
      arena: playerAccount.arena || null,
      mastery: sort2
        ? { ship: this.A.ships[Number(sort2[0])].name, tier: masteryTier(sort2[1]) }
        : null,
      officers: (playerAccount.officers || []).length,
      online: !!this.sessionOf(playerAccount.name),
      created: playerAccount.created || null,
    };
  },
};
