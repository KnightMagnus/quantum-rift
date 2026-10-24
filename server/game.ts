import { wireRecord } from '../shared/wire-actions.ts';
import { playerPortrait } from '../shared/portraits.ts';
import { attentionPayload, type RecentPatrolScan } from './attention.ts';
export interface SeedOfficer {
  name: string;
  role: string;
  race?: string;
  rarity?: number;
  lv?: number;
  slot?: string;
}
export interface SeedFleetConfig {
  docks?: Array<{ lead?: number; name?: string; wings?: number[] }>;
  crew?: SeedOfficer[];
  spare?: SeedOfficer[];
}
export interface SeedDefinition {
  name?: string;
  pass?: string;
  retire?: boolean;
  sync?: boolean | string;
  tutorial?: boolean;
  credits?: number;
  rep?: Record<string, number>;
  extra?: Partial<PlayerData>;
  ship?: number;
  shipName?: string;
  outfits?: Record<string, number>;
  station?: {
    ops?: number;
    research?: string;
    site?: string;
    fallback?: boolean;
    shuttles?: string;
  };
  mats?: number[];
  system?: string;
  stellar?: string;
  log?: string;
  storedShips?: string;
  ships?: Array<{ hull: number }>;
  officers?: SeedOfficer[];
  storyPass?: boolean;
  blueprints?: number;
  fleet?: SeedFleetConfig;
}
export type FreshPlayerData = Pick<
  PlayerData,
  | 'credits'
  | 'sys'
  | 'stellar'
  | 'ship'
  | 'cargo'
  | 'cargoLots'
  | 'storage'
  | 'storageLots'
  | 'mats'
  | 'rep'
  | 'missions'
  | 'escorts'
  | 'log'
  | 'station'
  | 'stats'
  | 'tut'
  | 'tutV'
  | 'explored'
>;
import type { ArenaMatch, RaidWave } from './world-contracts.ts';
import type { InvasionBoss } from '../shared/fronts.ts';
import type { TradeState, DuelState, DuelInvite } from './coop-contracts.ts';
export type StellarBody = import('../shared/galaxy.ts').StellarBody;
import type {
  FeaturePlayerState,
  StoredShip,
  SavedShuttle,
  SavedArc,
  SavedQuests,
} from './save-contracts.ts';

import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { EconomyReceipt } from '../shared/economy-receipt.ts';
import type {
  GameAssets,
  OfficerRecord,
  OutfitAsset,
  ShipLoadout,
  StationState,
} from '../shared/rules.ts';
import type { CombatAssist as CombatAssistCombatAssist, CombatState } from './combat-assist.ts';
import type { CargoLoot } from './contracts.ts';
import type { GameStorage as Database } from './game-storage.ts';
import type { GamePlatform, GameConnection } from './game-platform.ts';
import type { FeatureServices } from './features.ts';
import type { MessageCapabilities } from './game-message-handlers.ts';
import type { JobCapabilities, JobService } from './jobs.ts';
import type { MessageRegistry, NetworkMessage } from './message-registry.ts';
import type { SavedSurvey } from './mining-contracts.ts';
import type { PortCapabilities, PortService } from './port-services.ts';
import type { LootItem, Space as SpaceSpace } from './space.ts';
export type Entity = import('./space.ts').Entity;
export type PlayerInput = {
  /** Automatic navigation input. */
  navigation?: boolean;

  /** Sequence number. */
  seq: number;

  /** Forward thrust control. */
  thrust: number;

  /** Rotational turn steering. */
  turn: number;

  /** Afterburner boost flag. */
  ab: number;

  /** Reverse thrusters flag. */
  rev: number;

  /** Primary weapon fire flag. */
  fire1: number;

  /** Secondary weapon fire flag. */
  fire2: number;
};
export type PlayerData = FeaturePlayerState & {
  /** Catalog portrait choice, optional for legacy checkpoints. */
  portraitId?: string;
  id?: number;

  /** Recent trip cash flow; never a source of credits. */
  economyReceipt?: EconomyReceipt;
  miningSurvey?: SavedSurvey;

  /** Specialist blueprint fragments. */
  bp: Record<string, number>;

  /** Captain name. */
  name: string;

  /** Balance in credits. */
  credits: number;

  /** Current solar system ID. */
  sys: string;

  /** Docked stellar or null while flying. */
  stellar: string | null;

  /** Unique identifier for player ship. */
  shipUid?: string;

  /** Current active ship loadout. */
  ship: ShipLoadout;

  /** Cargo inventory mapping commodity ID to tons. */
  cargo: Record<string, number>;

  /** Reputation standings per faction. */
  rep: Record<string, number>;

  /**
   * Faction tokens balances.
   * Current player token balances.
   */
  tokens?: Record<string, number>;

  /** Crafting materials inventory grades. */
  mats: Record<string, number[]>;

  /** Personal station state and research tree. */
  station: StationState;

  /** Personal station stored ships. */
  dock: StoredShip[];

  /** Station shuttle fleet. */
  shuttles: SavedShuttle[];

  /** Station officer roster. */
  officers: Array<OfficerRecord>;

  /** Bridge officer assignments. */
  bridge: Record<string, number | string | null>;

  /** Story arc states. */
  arcs: Record<string, SavedArc>;

  /** Discovered radio station IDs. */
  radioStations?: string[];

  /** Active and completed missions. */
  quests: SavedQuests;

  /** Syndicate operations progression. */
  syn: number;

  /** Specialist career progression. */
  spec: Record<string, number>;

  /** Frontline goals and token progress. */
  fronts: Record<string, number | string | boolean>;

  /** Lifetime combat and trading stats. */
  stats: Record<string, number>;

  /** Armada group identifier if joined. */
  armada?: string | number | null;

  /** Whether following armada leader. */
  armadaFollow?: boolean;

  /** Operations level. */
  ops?: number;

  /** Monotonic counter for IDs. */
  nextUid?: number;

  /** Timestamp of last save. */
  saveTime?: number;
};
export interface FormationTarget {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  slot: number;
  gap: number;
}
export type Session = {
  /** Last real patrol scan, transient and private to this connection. */
  attentionScan?: RecentPatrolScan;
  rep?: Record<string, number>;
  refinerySignature?: string;
  huntT?: number;
  praiseT?: Record<string, number>;
  retaliationVisit?: { sys: string; factions: Set<string> };
  rallyT?: number;
  dmT?: number;
  trade?: string | null;
  duel?: string | null;
  duelInv?: DuelInvite | null;
  armadaFormationLeader?: string | null;
  armadaFormationTarget?: FormationTarget | null;
  hailLedger?: { space: SpaceSpace; used: Set<string>; seq: number } | null;

  /** Unique session ID. */
  id: number;

  /** Client WebSocket connection. */
  sock: GameConnection;

  /** Native match ingress applies the latest validated control on the current authoritative tick. */
  inputScheduling?: 'match';

  /** Remote client IP address. */
  ip: string;

  /**
   * Player account save data.
   * Player account save data from DB.
   */
  data: PlayerData;

  /**
   * Currently active ship entity in space.
   * Currently active ship entity in space, or null if docked.
   */
  ent: Entity | null;

  /**
   * Pending input command queue.
   * Pending input commands queue.
   */
  inputs: PlayerInput[];

  /**
   * Most recent processed input.
   * Most recent input processed.
   */
  lastInput?: Partial<PlayerInput> | null;

  /** Captain name. */
  name: string | null;

  /** Timestamp of last chat message sent. */
  chatT: number;

  /** Number of messages received in current rate-limiting window. */
  msgs: number;

  /** Timestamp start of current rate-limiting window. */
  msgT: number;

  /** Timestamp of last user activity. */
  actT?: number;

  /** Timestamp when user logged in. */
  loginT?: number;

  /** Whether this account was newly created during login. */
  isNew?: boolean;

  /** Combat assist state for this session. */
  combat?: CombatState;

  /** Timestamp of last cargo-full notification. */
  fullT?: number;
};
export type PlayerReference = {
  /** Session ID. */
  id: number;

  /** Captain name. */
  name: string;

  /** Faction reputation map. */
  rep: Record<string, number>;

  /** Input commands queue. */
  inputs: PlayerInput[];

  /** Last processed input. */
  lastInput?: Partial<PlayerInput> | null;

  /** Reference to the parent session. */
  s: Session;
};
export type SpaceSystem = import('../shared/galaxy.ts').StarSystem;
export type LegacyStellarBody = {
  id: string;
  name: string;
  type?: string;
  x: number;
  y: number;
  r: number;
  svc: string;
  system: string;
  tech?: number;
  site?: boolean;
  hub?: boolean;
  outlaw?: boolean;
  prices?: Record<string, number>;
  wormhole?: string;
  exit?: string;
};
export type MarketItem = {
  /** Commodity ID. */
  id: string;

  /** Commodity display name. */
  name: string;

  /** Unit price in credits, or null if not traded. */
  price: number | null;

  /** Remaining finite Composite Plating buyer tonnes for this port/day. */
  sellCap?: number;

  /** Whether a temporary flash market price is active. */
  flash?: boolean;

  /** Percentage price shift due to system state or trade volume. */
  moved?: number;
};
export type Mission = {
  lost?: boolean;
  giver?: string;
  standing?: string;
  steps?: number;
  full?: boolean;
  rewardText?: string;
  needs?: { hold: number; pax: number };
  convoyName?: string;
  raiders?: number;
  raiderHull?: number;
  guard?: number;
  eventide?: boolean;
  rescuePoint?: [number, number];
  scanT?: number;
  chain?: { fac: string; step: number };
  poolReward?: number;
  armada?: string;
  offerVersion?: number;
  team?: string[];
  point?: [number, number];
  points?: [number, number][];
  seen?: number[];
  exp?: { n: number; stage: number; b: string; home: string };
  failed?: boolean;
  warned?: boolean;
  wreckName?: string;
  side?: string;
  story?: string;
  syn?: number | string;

  /**
   * Mission or trade offer identifier
   * Unique mission ID.
   */
  id: string;

  /** Saved five-stop passenger tour. */
  radioTour?: { stops: string[]; stop: number };

  /** Mission type ('cargo', 'bounty', 'patrol', 'supply', 'smuggle', 'assassinate', 'quest', 'warband'). */
  type: string;

  /**
   * Mission headline
   * Mission display title.
   */
  title: string;

  /** Target system ID. */
  sys: string;

  /**
   * Destination stellar ID for delivery/landing.
   * Destination system or planet
   */
  dest?: string;

  /** Commodity ID to transport. */
  cid?: string;

  /** Quantity of cargo/passengers. */
  qty?: number;

  /** Number of passengers. */
  pax?: number;

  /** Target kill count needed for patrol. */
  need?: number;

  /** Current kill count achieved for patrol. */
  got?: number;

  /** Target ship hull ID. */
  hull?: number;

  /** Target faction ID. */
  faction?: string;

  /** Target NPC name for bounty. */
  targetName?: string;

  /** Payout upon completion in credits. */
  reward: number;

  /**
   * Narrative brief/description.
   * Mission brief
   */
  text: string;

  /** Whether mission objectives are fulfilled. */
  done?: boolean;

  /** Whether payout has been disbursed. */
  paid?: boolean;

  /** Session ID of mission contractor. */
  owner?: number | null;

  /** Timestamp when accepted. */
  taken?: number;

  /**
   * Timestamp deadline if time-sensitive.
   * Optional deadline timestamp; its presence indicates whether the job has a short delivery deadline.
   */
  deadline?: number;

  /** Duration in minutes if rush delivery. */
  rush?: number;

  /** Linked quest metadata. */
  quest?: { qid: string; step: number; of: number; name: string };

  /** True for elite dangerous bounties. */
  elite?: boolean;

  /** True if bounty target is currently spawned in-system. */
  spawned?: boolean;
};
export type SaveSlotSummary = {
  /** Captain name. */
  name: string;

  /** Current ship name. */
  ship: string;

  /** Balance in credits. */
  credits: number;

  /** Personal Station Tier. */
  ops: number;

  /** Current system name. */
  sys: string;
};
export type CommunityPayload = {
  /** Names of captains currently docked at Quantum Station. */
  docked: string[];

  /** Leaderboard of top earners. */
  top: Array<{ name: string; earned: number; kills: number; ship: string; ai?: boolean }>;

  /** List of claimable station hulls and their owners. */
  stations: Array<{ system: string; owner: string | null; ops: number }>;

  /**
   * Captains currently online and their systems.
   * Active online captains list.
   */
  online: Array<{ name: string; sys: string }>;
};
export type ShipStats = import('../shared/rules.ts').ComputedShipStats;

import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { commodityCargoTonnes, reservedCargoTonnes } from '../shared/ship-capacity.ts';
import { createPortService } from './port-services.ts';
import { discoverRadio } from './radio-discovery.ts';
import { createJobService } from './jobs.ts';
import { beginEconomyTrip, arriveEconomyTrip, economyReceipt } from '../shared/economy-receipt.ts';
import {
  migrateCargoLots,
  planTake,
  applyTake,
  addLots,
  clearLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.ts';
import { clampStanding } from '../shared/reputation.ts';

import { HailService } from './hail-service.ts';
import { CombatAssist } from './combat-assist.ts';
import { createGameMessageHandlers } from './game-message-handlers.ts';
import { createFeatures } from './features.ts';
import { TUTORIAL, tutMigrate, TUT_VERSION } from '../shared/tutorial.ts';
// Quantum Rift game server: sessions, the galaxy's systems, landing services, missions, Quantum Station.
import {
  SYSTEMS,
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  START,
  OPS as operationLevels,
  RESEARCH,
  REFINERY,
  ORE_PROCESS,
  RELOCATE,
  relocateCost,
  SITES,
} from '../shared/galaxy.ts';
import {
  augmentAssets,
  shipStats,
  researchBonus,
  price,
  allOutfits,
  makeLoadout,
  K as physicsConstants,
  TICK,
  credits,
} from '../shared/rules.ts';
import { Space } from './space.ts';
import { synTier } from '../shared/syndicate.ts';
import { STATES } from '../shared/living.ts';
import { ARCS } from '../shared/arcs.ts';
/**
 * Resolves the display name for a faction story arc.
 * @param factionId Faction identifier.
 * @returns Story arc title.
 */
const ARCS_NAME = (factionId: string): string => (ARCS[factionId] ? ARCS[factionId].name : '');
import { masteryTier } from '../shared/frontier.ts';
import { SHUTTLES } from '../shared/hangar.ts';
import { SPEC } from '../shared/specialty.ts';
import { passengerSeats, occupiedPassengerSeats } from '../shared/passengers.ts';

const galaxyGraph = new GalaxyGraph(systemsById);

/**
 * Quantum Rift master game engine.
 * Manages player accounts, client network sessions, world and system state,
 * trade markets, mission boards, station management, and game loops.
 */
export class Game<Storage extends Database = Database> {
  /** Game assets object containing ships, weapons, outfits, and commodities. */
  declare A: GameAssets;

  /** Authority-owned player accounts and world storage. */
  declare db: Storage;

  /** Outfit definitions lookup by ID. */
  declare O: Record<string | number, OutfitAsset>;

  /**
   * Active solar system space instances.
   * Active simulated spaces by system ID, backed by live proxy.
   */
  declare spaces: Record<string, SpaceSpace>;

  /**
   * Active client sessions.
   * Connected client sessions by session ID.
   */
  declare sessions: Map<number, Session>;

  /** Cache of currently instantiated systems. */
  declare live: Record<string, SpaceSpace>;

  /** Ordinary job board, acceptance and completion owner. */
  declare jobService: JobService;

  /** Ordinary market, material, shipyard and outfitter owner. */
  declare portService: PortService;

  /** Combat assist controller. */
  declare combatAssist: CombatAssistCombatAssist;

  /** Registered client message handlers. */
  declare messageHandlers: MessageRegistry;

  /** Failed sign-in attempt tracking map. */
  declare fails: Map<string, { n: number; t: number }>;

  /** Solo-mode pause flag. */
  declare paused: boolean;

  /** Error count during server ticks. */
  declare tickErr?: number;

  /** Cache key for deduplicating world status broadcasts. */
  declare worldKey?: string | null;

  /** Next session identifier sequence number. */
  declare nextSid: number;

  /** Server tick counter. */
  declare tickN: number;
  declare hails: HailService;

  /**
   * Server feature services.
   * Modular feature service delegations.
   */
  declare features: FeatureServices;

  /** Host services; explicit platforms keep the core independent of Node. */
  declare platform: GamePlatform;

  /** Timestamp when solo mode was paused. */
  declare pausedAt: number;

  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  _an: Record<string, string> | undefined;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  _anW: number | undefined;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  invasion:
    | { sys: string; boss: InvasionBoss; until: number; ent: Entity; sp: SpaceSpace }
    | null
    | undefined;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  lastInvWin!: number;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  arenaQ!: Record<string, number[]>;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  matches!: Record<string, ArenaMatch>;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  nextMatch!: number;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  waves!: Record<string, RaidWave>;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  rivalEnts!: Map<string, { sys: string; id: number }>;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  _livingStarted: boolean | undefined;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  _mkt: string[] | undefined;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  duels!: Record<string, DuelState>;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  trades!: Record<string, TradeState>;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  nextCoopId!: number;
  /**
   * Legacy feature state; see docs/FEATURES.md.
   */
  solo: boolean | undefined;
  /**
   * Initializes the game server, assets, storage, features, and tick loop.
   * @param assets Game assets object containing ships, weapons, outfits, and commodities.
   * @param database Authority-owned player/world storage.
   * @param platform Host services; omitted for the local Node database adapter.
   */
  constructor(assets: GameAssets, database: Storage, platform?: GamePlatform) {
    const host = platform ?? database.gamePlatform?.();
    if (!host) throw new Error('Game requires an explicit host platform');
    if (host.automaticClock && !host.startClock)
      throw new Error('Automatic game clock requires platform.startClock');
    this.platform = host;
    augmentAssets(assets);
    this.A = assets;
    this.db = database;
    this.O = allOutfits(assets);
    this.spaces = {};
    this.sessions = new Map();
    this.nextSid = 1;
    this.tickN = 0;
    // Systems are simulated only while someone is there (or was, recently): a space is created on first access
    // and dropped after two quiet minutes, so 200 systems cost no more than the handful that are occupied.
    const live = (this.live = {} as Record<string, SpaceSpace>);
    this.spaces = new Proxy(live, {
      get: (time, entryKey) =>
        time[entryKey as string] ||
        (typeof entryKey === 'string' && systemsById[entryKey]
          ? this.wake((time[entryKey] = new Space(this, entryKey)))
          : undefined),
    });

    this.features = createFeatures(this);
    this.jobService = this.createJobService();
    this.portService = this.createPortService();
    this.combatAssist = new CombatAssist(this);
    this.hails = new HailService(this);
    this.messageHandlers = this.createMessageHandlers();
    this.features.mining.init();
    this.features.refinery.init();
    this.features.pressure.init();
    this.features.industrial.init();
    this.features.towing.init();
    this.features.fronts.frontsInit();
    this.features.coop.coopInit();
    this.features.frontier.frontierInit();
    this.features.rivals.rivalsInit();
    this.features.living.livingInit();
    this.features.living.livingTick();
    this.seed();
    if (host.automaticClock)
      host.startClock!(() => {
        try {
          this.tick();
        } catch (event) {
          this.tickErr = (this.tickErr || 0) + 1;
          if (this.tickErr < 20 || this.tickErr % 500 === 0)
            console.error('tick error', this.tickErr, event);
        }
      }, 1000 / TICK); // one bad ship never takes the server down
  }

  // solo mode: save slots and save files
  /**
   * Summarizes all stored player saves for solo slot selection.
   * @returns Array of save summaries.
   */
  slots(): SaveSlotSummary[] {
    return Object.values(this.db.players).map((playerAccount) => ({
      name: playerAccount.name,
      ship: this.A.ships[playerAccount.ship.hull]
        ? this.A.ships[playerAccount.ship.hull].name
        : '?',
      credits: playerAccount.credits,
      ops: playerAccount.station ? playerAccount.station.ops : 0,
      sys: systemsById[playerAccount.sys] ? systemsById[playerAccount.sys].name : '',
    }));
  }
  /**
   * Imports an external save file object into the database.
   * @param playerData Raw save object to import.
   * @returns Sanitized name of imported captain.
   */
  importSave(playerData: PlayerData): string {
    if (
      !playerData ||
      typeof playerData.name !== 'string' ||
      !playerData.ship ||
      !playerData.station
    )
      throw new Error('That is not a Quantum Rift save file.');
    const name = playerData.name.trim().slice(0, 20);
    if (!/^[A-Za-z0-9 _'-]{3,20}$/.test(name)) throw new Error('Bad captain name in the save.');
    for (const session of this.sessions.values())
      if (session.data && session.data.name.toLowerCase() === name.toLowerCase())
        throw new Error('That captain is playing right now.');
    const imported = structuredClone(playerData);
    migrateCargoLots(imported); // validate before replacing any existing slot
    const ownerKey = this.db.key(name);
    const site = imported.station.claimed ? imported.station.site : null;
    if (site) {
      if (!STELLARS[site]?.site) throw new Error('Unknown station location in the save.');
      const owner = this.db.world.sites[site];
      const otherClaim = Object.values(this.db.players).find(
        (captain) => this.db.key(captain.name) !== ownerKey && captain.station?.site === site,
      );
      if ((owner && owner !== ownerKey) || otherClaim)
        throw new Error(
          'That station location belongs to another captain. Choose another location.',
        );
    }
    const playerAccount = this.db.create(name, 'solo', {});
    for (const entryKey of Object.keys(imported))
      if (!['__proto__', 'constructor', 'prototype', 'salt', 'hash'].includes(entryKey))
        (playerAccount as Record<keyof PlayerData, unknown>)[entryKey as keyof PlayerData] =
          imported[entryKey as keyof PlayerData];
    playerAccount.name = name;
    // Save files contain captain data, not world ownership. Reconcile both on import.
    for (const [ownedSite, owner] of Object.entries(this.db.world.sites))
      if (owner === ownerKey) delete this.db.world.sites[ownedSite];
    if (site) this.db.world.sites[site] = ownerKey;
    this.db.touch();
    this.db.flush();
    return name; // own keys only
  }
  /**
   * System wake hook called when a space is accessed.
   * @param space Newly awakened space instance.
   * @returns The space instance.
   */
  wake(space: SpaceSpace): SpaceSpace {
    return space;
  }
  // Seed accounts are created on startup. sync:true explicitly upgrades existing saves;
  // sync:'create' applies the same setup only once, without resetting a saved captain.
  /**
   * Populates showcase and developer accounts supplied by the host platform.
   */
  seed(): void {
    const list = this.platform.seedDefinitions;
    for (const seedDefinition of list) {
      if (seedDefinition.retire && seedDefinition.name) {
        this.retireAccount(seedDefinition.name);
        continue;
      } // retired seed accounts are removed, and their holdings freed
      if (!seedDefinition.name || !seedDefinition.pass) continue;
      const have = this.db.get(seedDefinition.name);
      if (have) {
        if (seedDefinition.sync === true) this.syncSeed(have, seedDefinition);
        continue;
      }
      const site = seedDefinition.station?.fallback
        ? [seedDefinition.station.site, ...SITES.map((stellarBody) => stellarBody.id)].find(
            (identifier) => STELLARS[identifier!]?.site && !this.siteOwner(identifier!),
          )
        : seedDefinition.station?.site;
      if (seedDefinition.station?.fallback && !site) {
        console.warn(
          `Cannot create seeded captain ${seedDefinition.name}: no unclaimed station hull.`,
        );
        continue;
      }
      const playerData = this.fresh() as PlayerData;
      playerData.tut = seedDefinition.tutorial ? 0 : TUTORIAL.length; // seeded veterans skip the tutorial
      playerData.explored = SYSTEMS.filter((starSystem) => starSystem.anchor).map(
        (starSystem) => starSystem.id,
      );
      if (seedDefinition.credits !== undefined) playerData.credits = seedDefinition.credits;
      if (seedDefinition.rep) Object.assign(playerData.rep, seedDefinition.rep);
      if (seedDefinition.extra)
        Object.assign(playerData, JSON.parse(JSON.stringify(seedDefinition.extra))); // test seeds can set standing, Syndicate points, commendations...
      if (seedDefinition.ship)
        playerData.ship = makeLoadout(
          this.A,
          seedDefinition.ship,
          seedDefinition.shipName || 'Rift Runner',
        );
      if (seedDefinition.outfits)
        for (const [options, count] of Object.entries(seedDefinition.outfits))
          playerData.ship.outfits[options] = (playerData.ship.outfits[options] || 0) + count;
      if (seedDefinition.station) {
        const stationState = playerData.station;
        stationState.claimed = true;
        stationState.ops = seedDefinition.station.ops || 0;
        stationState.refT = Date.now();
        if (seedDefinition.station.research === 'all')
          stationState.done = RESEARCH.map((researchNode) => researchNode.id);
        if (site && STELLARS[site] && !this.siteOwner(site)) {
          stationState.site = site;
          this.db.world.sites[site] = this.db.key(seedDefinition.name);
        }
      }
      if (seedDefinition.mats)
        for (const mATERIALS of MATERIALS) playerData.mats[mATERIALS] = seedDefinition.mats.slice();
      if (seedDefinition.system && systemsById[seedDefinition.system]) {
        playerData.sys = seedDefinition.system;
        playerData.stellar = seedDefinition.stellar || playerData.stellar;
      }
      if (seedDefinition.station?.fallback && site) {
        playerData.sys = STELLARS[site].system;
        playerData.stellar = site;
      }
      const playerAccount = this.db.create(seedDefinition.name, seedDefinition.pass, playerData);
      this.log(playerAccount, seedDefinition.log || 'Arrived in the Rift.');
      if (seedDefinition.sync) this.syncSeed(playerAccount, seedDefinition);
      if (seedDefinition.storedShips === 'specialists') {
        this.features.specialists.specInit(playerAccount);
        this.features.docks.docksInit(playerAccount);
        for (const specialistShip of Object.values(SPEC)) {
          const ship = makeLoadout(this.A, specialistShip.id, specialistShip.name);
          ship.uid = this.features.docks.shipUid(playerAccount);
          playerAccount.dock.push({ ship, bridge: {} });
          playerAccount.specState[specialistShip.id] = { tier: 1, comp: {} };
        }
      }
      console.log('Created seeded captain', seedDefinition.name);
    }
    this.db.touch();
    this.db.flush();
  }
  // "sync": true keeps a showcase captain's station fully upgraded across new versions (every research project done,
  // Station Tier 5, a full hangar and, if listed, an elite bridge crew). Credits, ships and cargo are left alone.
  /**
   * Retires an account, disconnecting active sessions and freeing claimed stations and colonies.
   * @param name Captain name of the account to retire.
   */
  retireAccount(name: string): void {
    const entryKey = this.db.key(name),
      playerAccount = this.db.get(name);
    if (!playerAccount) return;
    for (const session of this.sessions.values())
      if (session.data === playerAccount) {
        try {
          session.sock.close();
        } catch {}
      }
    const worldData = this.db.world;
    for (const [site, owner] of Object.entries(worldData.sites || {}))
      if (owner === entryKey) delete worldData.sites[site]; // the station hull is a derelict again
    for (const [identifier, colonyState] of Object.entries(worldData.colonies || {}))
      if (colonyState.owner === entryKey) delete worldData.colonies[identifier];
    if (Array.isArray(worldData.orders))
      worldData.orders = worldData.orders.filter(
        (exchangeOrder) => exchangeOrder.owner !== playerAccount.name,
      );
    if (this.features.coop.armadaForget) this.features.coop.armadaForget(playerAccount.name); // 2.6
    delete this.db.players[entryKey];
    this.db.touch();
    this.db.flush();
    console.log(
      `Retired seeded captain ${playerAccount.name}; their station hull is unclaimed again.`,
    );
  }
  /**
   * Synchronizes a showcase captain's station, officers, and progress to version spec.
   * @param playerData Player save record.
   * @param seedDefinition Seed definition configuration.
   */
  syncSeed(playerData: PlayerData, seedDefinition: SeedDefinition): void {
    this.features.hangar.hangarInit(playerData);
    const stationState = playerData.station,
      want = seedDefinition.station || {};
    stationState.claimed = true;
    stationState.ops = Math.max(stationState.ops || 0, want.ops || 5);
    if (want.research === 'all') {
      stationState.done = RESEARCH.map((researchNode) => researchNode.id);
      stationState.active = null;
      stationState.queue = [];
    }
    if (!stationState.site && want.site && STELLARS[want.site] && !this.siteOwner(want.site)) {
      stationState.site = want.site;
      this.db.world.sites[want.site] = this.db.key(playerData.name);
    }
    if (want.shuttles === 'all')
      for (const kind of Object.keys(SHUTTLES))
        if (
          !playerData.shuttles.some((savedShuttle) => savedShuttle.kind === kind) &&
          playerData.shuttles.length < this.features.hangar.bays(playerData)
        )
          playerData.shuttles.push({
            id: this.features.hangar.uid(playerData),
            kind,
            state: 'idle',
            crew: null,
            runs: 0,
          });
    if (seedDefinition.officers && !playerData.officers.some((officer) => officer.seed))
      for (const [_index, seedOfficer] of seedDefinition.officers.entries()) {
        const offset = {
          id: this.features.hangar.uid(playerData),
          seed: true,
          name: seedOfficer.name,
          race: seedOfficer.race,
          role: seedOfficer.role,
          rarity: seedOfficer.rarity ?? 3,
          lv: seedOfficer.lv || 10,
          xp: 0,
        };
        playerData.officers.push(offset);
        if (seedOfficer.slot) playerData.bridge[seedOfficer.slot] = offset.id;
      }
    if (seedDefinition.mats)
      for (const mATERIALS of MATERIALS)
        playerData.mats[mATERIALS] = playerData.mats[mATERIALS].map((count, game) =>
          Math.max(count, seedDefinition.mats![game]),
        );
    playerData.tut = TUTORIAL.length; // showcase captains skip the career guide
    if (seedDefinition.storyPass) {
      this.features.story.storyInit(playerData);
      playerData.story.pass = true;
    }
    if (seedDefinition.blueprints) {
      playerData.bp = playerData.bp || {};
      for (const identifier of Object.keys(SPEC))
        playerData.bp[identifier] = Math.max(
          playerData.bp[identifier] || 0,
          seedDefinition.blueprints,
        );
    }
    if (seedDefinition.fleet && !playerData.seedFleet)
      this.seedFleet(playerData, seedDefinition.fleet);
    console.log('Synced seeded captain', seedDefinition.name);
  }
  // 2.1 playtest seeds: fill the docks with ships and crew them, once ({ docks: [{ lead, name, wings: [hulls] }], crew: [...officers], spare: [...officers] })
  /**
   * Sets up a test seed captain's docks with ships, wingmates, and officers.
   * @param playerData Player save record.
   * @param seedFleetConfig Seed fleet configuration with docks, crew, and ships.
   */
  seedFleet(playerData: PlayerData, seedFleetConfig: SeedFleetConfig): void {
    this.features.docks.docksInit(playerData);
    playerData.seedFleet = true;
    const crew = [...(seedFleetConfig.crew || [])],
      newOff = (seedOfficer: SeedOfficer) => {
        const offset = {
          id: this.features.hangar.uid(playerData),
          seed: true,
          name: seedOfficer.name,
          race: seedOfficer.race,
          role: seedOfficer.role,
          rarity: seedOfficer.rarity ?? 2,
          lv: seedOfficer.lv || 10,
          xp: 0,
        };
        playerData.officers.push(offset);
        return offset.id;
      };
    (seedFleetConfig.docks || []).forEach((distance, index) => {
      if (index >= playerData.docks.length) return;
      if (distance.lead) {
        const ship = makeLoadout(
          this.A,
          distance.lead,
          distance.name || this.A.ships[distance.lead].name,
        );
        ship.uid = this.features.docks.shipUid(playerData);
        if (index === playerData.activeDock) {
          playerData.ship = ship;
          playerData.shipless = false;
          playerData.docks[index].lead = ship.uid;
        } // a test account: the old ship is simply replaced
        else {
          playerData.dock.push({ ship, bridge: {} });
          playerData.docks[index].lead = ship.uid;
        }
      }
      playerData.docks[index].wings = (distance.wings || []).map((height) => {
        const ship = makeLoadout(this.A, height, this.A.ships[height].name);
        ship.uid = this.features.docks.shipUid(playerData);
        playerData.dock.push({ ship, bridge: {} });
        const capacity = crew.length ? newOff(crew.shift()!) : null,
          mate = crew.length ? newOff(crew.shift()!) : null;
        return { uid: ship.uid, cap: capacity, crew: mate };
      });
    });
    for (const seedOfficer of seedFleetConfig.spare || []) newOff(seedOfficer);
    this.features.docks.docksInit(playerData);
  }
  // ------------------------------------------------------------------ sessions
  /**
   * Creates a fresh default captain save state with starter ship, credits, and tutorial.
   * @returns Fresh initial player save state.
   */
  fresh(): FreshPlayerData {
    const fromEntries2 = Object.fromEntries(
      Object.keys(FACTIONS).map((factionId) => [factionId, 0]),
    );
    fromEntries2.quantum = 10;
    return {
      credits: START.credits,
      sys: START.system,
      stellar: START.stellar,
      ship: makeLoadout(this.A, START.ship, 'Rift Runner'),
      cargo: {},
      cargoLots: { version: 1, byCommodity: {} },
      storage: {},
      storageLots: { version: 1, byCommodity: {} },
      mats: Object.fromEntries(MATERIALS.map((message) => [message, [0, 0, 0, 0, 0]])),
      rep: fromEntries2,
      missions: [],
      escorts: [],
      log: [],
      station: { claimed: false, ops: 0, refUnits: 0, refT: Date.now(), active: null, done: [] },
      stats: { kills: 0, jumps: 0, earned: 0 },
      tut: 0,
      tutV: TUT_VERSION,
      explored: [START.system],
    };
  }
  /**
   * Handles incoming WebSocket client connection and binds message/close events.
   * @param socket WebSocket client connection.
   * @param ipAddress Remote client IP address.
   */
  connect(socket: GameConnection, ipAddress: string = '?'): void {
    const session = {
      id: this.nextSid++,
      sock: socket,
      ip: ipAddress,
      data: null,
      ent: null,
      inputs: [],
      lastInput: null,
      name: null,
      chatT: 0,
      msgs: 0,
      msgT: Date.now(),
    } as unknown as Session; // Registered before login; onMessage gates all authenticated actions.
    this.sessions.set(session.id, session);
    socket.on('message', (message) => {
      try {
        this.onMessage(session, JSON.parse(message));
      } catch (event) {
        console.error('message error', event);
      }
    });
    socket.on('close', () => this.disconnect(session));
  }
  /**
   * Disconnects and unregisters a client session, saving flight state and docking in-system.
   * @param session Session disconnecting.
   */
  disconnect(session: Session): void {
    if (session.data) this.features.towing.detach(session);
    if (session.data) this.features.industrial.stop(session);
    if (session.data && this.sessions.has(session.id)) this.features.coop.coopLogout(session); // duels, trades, presence
    this.sessions.delete(session.id);
    for (const quantity of Object.values(this.arenaQ || {})) {
      const indexOf2 = quantity.indexOf(session.id);
      if (indexOf2 >= 0) quantity.splice(indexOf2, 1);
    }
    if (session.data && this.matches && this.matches[session.data.sys]) {
      this.matches[session.data.sys].alive.delete(session.data.name);
      session.data.stellar = session.data.arenaReturn || 'qstation';
    }
    if (session.ent) {
      const playerData = session.data,
        space = this.spaces[playerData.sys],
        entity = session.ent;
      this.dropEscorts(space, entity);
      space.remove(entity);
      space.players--;
      session.ent = null;
      // logging off in space: you are docked at the nearest world in the same system, or back at your last landing
      const here = systemsById[playerData.sys].stellars
        .filter(
          (stellarBody) =>
            stellarBody.svc!.includes('L') &&
            !(
              stellarBody.site &&
              this.siteOwner(stellarBody.id) &&
              !this.ownSite(playerData, stellarBody)
            ),
        )
        .sort(
          (leftStellarBody, rightStellarBody) =>
            Math.hypot(leftStellarBody.x - entity.x, leftStellarBody.y - entity.y) -
            Math.hypot(rightStellarBody.x - entity.x, rightStellarBody.y - entity.y),
        )[0];
      if (here) playerData.stellar = here.id;
      else {
        const back =
          playerData.lastStellar && STELLARS[playerData.lastStellar]
            ? playerData.lastStellar
            : START.stellar;
        playerData.stellar = back;
        playerData.sys = STELLARS[back].system;
      }
      playerData.fuel = entity.fuel;
    }
    if (session.data) {
      // End a Solo confirmation pause before another captain can sign in between ticks.
      if (this.solo && ![...this.sessions.values()].some((session) => session.data))
        this.setPaused(false);
      this.db.touch();
      this.db.flush(); // Commit the final dock/flight state before a deliberate account switch.
      if (!this.solo)
        this.broadcast({ t: 'chat', from: '', msg: `${session.name} left the Rift.` });
    }
  }
  /**
   * Sends a message payload to a client session if socket is open and backlog is acceptable.
   * @param session Destination session.
   * @param message Message object or string to send.
   */

  /** Message transmitter. */
  send(session: Pick<Session, 'sock'>, message: string | object): void {
    if ('sock' in session && session.sock && session.sock.open && session.sock.backlog < 4e6)
      session.sock.send(message);
  }
  /**
   * Sends a transient toast banner message to the player's UI.
   * @param session Recipient session.
   * @param message Notification banner message text.
   */
  toast(session: Session, message: string): void {
    this.send(session, { t: 'toast', msg: message });
  }
  /**
   * Broadcasts a JSON message to all authenticated sessions matching an optional predicate.
   * @param message Message payload to broadcast.
   * @param filter Optional predicate to filter sessions.
   */
  broadcast(message: string | object, filter?: (session: Session) => boolean): void {
    const stringify2 = JSON.stringify(message);
    for (const session of this.sessions.values())
      if (session.data && (!filter || filter(session))) this.send(session, stringify2);
  }
  /**
   * Legacy reputation getter.
   */
  get rep(): null {
    return null;
  }
  /**
   * Sends full updated player state ('you' packet) to client session.
   * @param session Player session.
   */
  you(session: Session): void {
    const playerData = session.data as PlayerData;
    this.features.docks.docksInit(playerData);
    this.checkStation(playerData);
    const computedShipStats = this.features.shipStats.stats(playerData);
    this.send(session, {
      t: 'you',
      d: this.playerPayload(session, playerData, computedShipStats),
    });
  }
  /** Project normalized captain state for the browser without sharing saved-only fields. */
  playerPayload(
    session: Session,
    playerData: PlayerData,
    computedShipStats: ReturnType<FeatureServices['shipStats']['stats']>,
  ) {
    return {
      name: playerData.name,
      portraitId: playerPortrait(playerData.portraitId),
      credits: playerData.credits,
      sys: playerData.sys,
      stellar: playerData.stellar,
      ship: playerData.ship,
      cargo: playerData.cargo,
      cargoLots: structuredClone(playerData.cargoLots),
      paid: playerData.paid || {},
      economyReceipt: economyReceipt(playerData),
      radioStations: discoverRadio(this, session),
      mats: playerData.mats,
      rep: playerData.rep,
      shipless: !!playerData.shipless,
      docks: this.features.docks.docksPayload(playerData),
      newcomer: this.newcomer(playerData),
      arcs: this.features.arcs.arcsPayload(playerData),
      expd: playerData.expd || { n: 0 },
      rank: this.features.fleetcmd.rankOf(playerData),
      syn: synTier(playerData.syn),
      shards: playerData.shards || 0,
      lower: playerData.lower || [],
      loan: playerData.loan || null,
      credit: playerData.credit || 600,
      missions: playerData.missions,
      refinery: this.features.refinery.payload(session),
      industrial: this.features.industrial.payload(session),
      towing: this.features.towing.payload(session),
      escorts: playerData.escorts,
      shuttles: playerData.shuttles,
      officers: playerData.officers,
      bridge: playerData.bridge,
      dock: playerData.dock,
      bays: this.features.hangar.bays(playerData),
      dockSlots: this.features.hangar.dockSlots(playerData),
      board: this.features.hangar.shuttleBoard(playerData),
      bonus: this.features.bonuses.bonus(playerData),
      armada: this.features.coop.armadaPayload(playerData),
      social: this.features.coop.socialPayload(playerData),
      goals: this.features.fronts.goalsFor(playerData),
      tokens: playerData.tokens || {},
      chains: playerData.chains || {},
      quests: this.features.quests.questsPayload(playerData),
      arena: this.features.frontier.arenaPayload(playerData, session),
      spec: playerData.spec || {},
      bp: playerData.bp || {},
      story: this.features.story.storyPayload(playerData),
      holdout: playerData.holdout
        ? {
            best: playerData.holdout.best || 0,
            lastT: playerData.holdout.lastT || 0,
            wave: playerData.holdout.active ? playerData.holdout.active.wave : 0,
            active: !!playerData.holdout.active,
          }
        : null,
      power: this.features.hostile.myPower(playerData),
      parts: playerData.parts || {},
      specState: playerData.specState || {},
      mastery: playerData.mastery || {},
      colonies: this.features.frontier.coloniesOf(playerData).map(([identifier, colonyState]) => ({
        id: identifier,
        name: colonyState.name,
        lv: colonyState.lv,
        sys: STELLARS[identifier].system,
      })),
      defense: this.features.frontier.defenseRating(playerData),
      storage: playerData.storage || {},
      storageLots: structuredClone(playerData.storageLots),
      explored: playerData.explored,
      tut: playerData.tut ?? TUTORIAL.length,
      station: playerData.station,
      stats: playerData.stats,
      log: playerData.log.slice(-60),
      shipStats: computedShipStats,
      fuel: session.ent ? session.ent.fuel : (playerData.fuel ?? computedShipStats!.fuel),
      cargoUsed: commodityCargoTonnes(playerData.cargo),
      jobCargo: this.jobCargo(playerData),
      duel: this.features.coop.duelPayload(session),
      duels: playerData.duels || null,
    };
  }
  // ---- claimable station hulls
  /**
   * Finds the player account owning a claimable station site hull.
   * @param identifier Stellar station site ID.
   * @returns Player record of owner, or null if unclaimed.
   */
  siteOwner(identifier: string): PlayerData | null {
    const site = this.db.world.sites[identifier];
    return site ? this.db.players[site] || null : null;
  }
  /**
   * Compiles map of all claimed station sites and their current owners/Station Tiers.
   * @returns Map of claimed sites and owner information.
   */
  sitesPayload(): Record<string, { owner: string; ops: number }> {
    const result: Record<string, { owner: string; ops: number }> = {};
    for (const stellarBody of SITES) {
      const playerData = this.siteOwner(stellarBody.id);
      if (playerData)
        result[stellarBody.id] = { owner: playerData.name, ops: playerData.station.ops };
    }
    return result;
  }
  /**
   * Checks whether player owns the station hull at stellar body p.
   * @param playerData Player save data.
   * @param stellarBody Stellar body.
   * @returns True if player owns this station site.
   */
  ownSite(playerData: PlayerData, stellarBody: Pick<StellarBody, 'id' | 'site'>): boolean {
    return !!(stellarBody && stellarBody.site && playerData.station.site === stellarBody.id);
  }
  /**
   * Broadcasts claimed station sites update to all players.
   */
  pushSites(): void {
    this.broadcast({ t: 'sites', sites: this.sitesPayload() });
  }
  /**
   * Advances the career guide / tutorial when the current milestone event occurs.
   * @param session Player session.
   * @param event Tutorial trigger event identifier.
   */
  tut(session: Session, event: string): void {
    // advance the first-flight tutorial if this event is the current goal
    const playerData = session.data;
    if (playerData.tut == null || playerData.tut >= TUTORIAL.length) return;
    const tutorialStep = TUTORIAL[playerData.tut];
    if (event !== '*check' && tutorialStep.ev !== event) return;
    if (event === '*check' && !(tutorialStep.check && tutorialStep.check(playerData, this.A)))
      return;
    playerData.credits += tutorialStep.reward;
    if (tutorialStep.mat)
      playerData.mats[tutorialStep.mat[0]][tutorialStep.mat[1]] += tutorialStep.mat[2];
    playerData.tut++;
    this.toast(
      session,
      `Career: ${tutorialStep.title} complete. +${credits(tutorialStep.reward)} credits${tutorialStep.mat ? ` and a ${tutorialStep.mat[0]} ${GRADES[tutorialStep.mat[1]]} crate` : ''}.`,
    );
    this.log(playerData, `Career goal "${tutorialStep.title}" complete.`);
    if (playerData.tut >= TUTORIAL.length)
      this.toast(session, 'Career guide complete. The Rift is yours, Captain.');
    this.db.touch();
    this.you(session);
  }
  // newcomer protection lasts until your Personal Station reaches Station Tier 3 (see Space.spared)
  // cargo carried for jobs takes up real hold space
  /**
   * Calculates total cargo tonnage allocated to active delivery and smuggling jobs.
   * @param distance Player mission cargo.
   * @returns Cargo space currently allocated to active cargo and smuggling missions.
   */
  jobCargo(distance: { missions?: Array<Pick<Mission, 'type' | 'qty'>> }): number {
    return reservedCargoTonnes(distance.missions);
  }
  /**
   * Calculates total hold space currently used by commodities and job cargo.
   * @param distance Commodity and mission cargo.
   * @returns Total cargo hold tonnage used by trade commodities and mission cargo.
   */
  holdUsed(distance: {
    cargo: Record<string, number>;
    missions?: Array<Pick<Mission, 'type' | 'qty'>>;
  }): number {
    return commodityCargoTonnes(distance.cargo) + this.jobCargo(distance);
  }
  /**
   * Calculates passenger berths occupied by active passenger missions.
   * @param playerData Player save data.
   * @returns Passenger berths occupied by active passenger missions.
   */
  jobBunks(playerData: PlayerData): number {
    return occupiedPassengerSeats(playerData.missions);
  }
  // Check the actual destination loadout for swaps; purchases use the stock loadout.
  /**
   * Checks if candidate hull or ship loadout can accommodate current cargo, missions, and passengers.
   * @param playerData Player save data.
   * @param hullOrShip Candidate ship hull ID or loadout.
   * @param goods Whether to include commodities in calculation.
   * @returns Failure explanation reason, or null if ship fits.
   */
  fitsJobs(
    playerData: PlayerData,
    hullOrShip: number | ShipLoadout,
    goods: boolean = true,
  ): string | null {
    const hull = typeof hullOrShip === 'object' ? hullOrShip.hull : hullOrShip;
    const shipHullAsset = this.A.ships[hull];
    if (!shipHullAsset) return 'Unknown hull.';
    const ship = typeof hullOrShip === 'object' ? hullOrShip : makeLoadout(this.A, hull, '');
    const need = (goods ? commodityCargoTonnes(playerData.cargo) : 0) + this.jobCargo(playerData),
      cargo2 = shipStats(this.A, ship)!.cargo;
    if (need > cargo2)
      return `The ${shipHullAsset.name} can't hold your ${need} t of cargo${this.jobCargo(playerData) ? ' (including job cargo)' : ''}.`;
    const jobBunks2 = this.jobBunks(playerData);
    if (jobBunks2 > passengerSeats(shipHullAsset, ship))
      return `The ${shipHullAsset.name} doesn't have seats for your ${jobBunks2} passenger${jobBunks2 > 1 ? 's' : ''}.`;
    return null;
  }
  // when you leave a system, your escorts go with you; a rival flying alongside goes back to their own business
  /**
   * Cleans up or returns escort wingmates and fighter drones when a ship leaves space.
   * @param space Active system space simulation.
   * @param entity Leader entity leaving or destroyed.
   * @param reason Removal reason (e.g. 'jump').
   */
  dropEscorts(space: SpaceSpace, entity: Entity, reason?: string): void {
    if (entity.player?.s) this.features.industrial.stop(entity.player.s);
    const identifiers = new Set([entity.id]);
    for (let entryKey = 0; entryKey < 3; entryKey++)
      for (const entity of space.ships.values())
        if (entity.owner && identifiers.has(entity.owner)) identifiers.add(entity.id); // escorts, and their fighters
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const entity3 of [...space.ships.values()]) {
      if (entity3 === entity || !identifiers.has(entity3.id)) continue;
      if (entity3.fighterOf === entity.id) {
        space.dock(entity3, entity);
        continue;
      } // drones still out go back into their bays
      if (entity3.rival && entity3.owner === entity.id) {
        entity3.owner = null;
        entity3.ai = entity3.rivalAi || 'patrol';
        entity3.target = null;
        entity3.slot = null;
        entity3.state = 'fly';
        continue;
      }
      space.remove(entity3, reason);
    }
  }
  // pausing a solo game stops the clock on rush deadlines and loan payments (station timers still run in real time)
  /**
   * Toggles pause state for solo play, freezing mission deadlines and loans.
   * @param enabled Pause state.
   */
  setPaused(enabled: boolean): void {
    if (enabled === !!this.paused) return;
    this.paused = enabled;
    if (enabled) {
      this.pausedAt = Date.now();
      return;
    }
    const deltaTime = Date.now() - (this.pausedAt || Date.now());
    this.features.refinery.resume(deltaTime);
    this.pausedAt = 0;
    if (deltaTime <= 0) return;
    this.hails.resume(deltaTime);
    for (const playerAccount of Object.values(this.db.players)) {
      for (const mission of playerAccount.missions || [])
        if (mission.deadline) mission.deadline += deltaTime;
      if (playerAccount.loan && playerAccount.loan.next) playerAccount.loan.next += deltaTime;
    }
    this.db.touch();
  }
  /**
   * Checks whether a captain qualifies for newcomer protection (station below Station Tier 3).
   * @param playerData Player save data.
   * @returns True if player qualifies for newcomer protection.
   */
  newcomer(playerData: PlayerData): boolean {
    return (
      !!playerData && !playerData.noShield && !((playerData.station && playerData.station.ops) >= 3)
    );
  }
  /**
   * Warns protected captains when jumping into lawless or dangerous systems.
   * @param session Player session.
   * @param system Destination space system.
   */
  protectNote(session: Session, system: SpaceSystem): void {
    // Warn once on crossing the Gateway: the main-map truce does not reach Farside.
    const playerData = session.data;
    if (!this.newcomer(playerData) || playerData.protWarned) return;
    if (system.farside) {
      playerData.protWarned = true;
      this.toast(
        session,
        `Newcomer protection does not reach ${system.name}: this is Farside, where normal hostility applies.`,
      );
    }
  }
  /**
   * Appends an entry to the captain's log history (capped at 200 entries).
   * @param playerData Player save data.
   * @param text Entry text to append.
   */
  log(playerData: PlayerData, text: string): void {
    playerData.log.push({ t: Date.now(), text });
    if (playerData.log.length > 200) playerData.log.shift();
  }

  // Fixed routes; authentication, flood and activity gates remain in onMessage.
  /**
   * Builds the message router table binding route actions to feature services and handlers.
   * @returns Initialized message registry dispatcher.
   */
  createMessageHandlers(): MessageRegistry {
    // oxlint-disable-next-line typescript/no-this-alias -- Capability getters retain the coordinator receiver.
    const game = this;
    // Live getters and forwarding calls retain late setup and test seams.

    const capabilities: MessageCapabilities = {
      get A() {
        return game.A;
      },
      get combatAssist() {
        return game.combatAssist;
      },
      get db() {
        return game.db;
      },
      get features() {
        return game.features;
      },
      get hails() {
        return game.hails;
      },
      get live() {
        return game.live;
      },
      get paused() {
        return game.paused;
      },
      get sessions() {
        return game.sessions;
      },
      get solo() {
        return game.solo;
      },
      get spaces() {
        return game.spaces;
      },
      accept: (...argumentsList) => game.accept(...argumentsList),
      buyMat: (...argumentsList) => game.buyMat(...argumentsList),
      buyShip: (...argumentsList) => game.buyShip(...argumentsList),
      chat: (...argumentsList) => game.chat(...argumentsList),
      depart: (...argumentsList) => game.depart(...argumentsList),
      jump: (...argumentsList) => game.jump(...argumentsList),
      land: (...argumentsList) => game.land(...argumentsList),
      landed: (...argumentsList) => game.landed(...argumentsList),
      log: (...argumentsList) => game.log(...argumentsList),
      outfit: (...argumentsList) => game.outfit(...argumentsList),
      send: (...argumentsList) => game.send(...argumentsList),
      setPaused: (...argumentsList) => game.setPaused(...argumentsList),
      station: (...argumentsList) => game.station(...argumentsList),
      trade: (...argumentsList) => game.trade(...argumentsList),
      tut: (...argumentsList) => game.tut(...argumentsList),
      you: (...argumentsList) => game.you(...argumentsList),
    };
    return createGameMessageHandlers(Object.freeze(capabilities));
  }

  /**
   * Ingests, rate-limits, authenticates, and dispatches an incoming client message.
   * @param session Source session.
   * @param incoming Incoming decoded client value.
   */
  onMessage(session: Session, incoming: unknown): void {
    const currentTime = Date.now();
    if (currentTime - session.msgT > 1000) {
      session.msgT = currentTime;
      session.msgs = 0;
    }
    if (++session.msgs > 120) return; // flood guard
    if (!wireRecord(incoming)) return;
    const message = incoming as NetworkMessage;
    if (!session.data) {
      if (message.t === 'hello') this.hello(session, message);
      return;
    }
    if (this.db.economicFrozen && !['ping', 'input', 'chat'].includes(message.t!))
      return this.toast(session, 'Checkpoint recovery required; economic actions frozen.');
    if (message.t !== 'ping') session.actT = currentTime; // for Online / Away
    this.messageHandlers.dispatch(message.t!, session, message);
  }
  /**
   * Handles player login authentication and new account registration.
   * @param session Unauthenticated session.
   * @param message2 Authentication handshake payload.
   */
  hello(session: Session, message2: { name?: string; pass?: string }): void {
    const name = String(message2.name || '').trim(),
      pass = String(message2.pass || '');
    if (
      !/^[A-Za-z0-9 _'-]{3,20}$/.test(name) ||
      /^(__proto__|constructor|prototype|hasownproperty|tostring|valueof)$/i.test(name.trim())
    )
      return this.send(session, {
        t: 'error',
        msg: 'Pick a captain name of 3-20 letters or numbers.',
      });
    if (pass.length < 4 && !this.solo)
      return this.send(session, { t: 'error', msg: 'Your password needs at least 4 characters.' });
    // failed-login throttle: 6 misses per name or per address in 10 minutes locks that name/address out for the rest of the window
    const currentTime = Date.now(),
      floodKeys = ['n:' + name.toLowerCase(), 'i:' + session.ip];
    this.fails = this.fails || new Map();
    for (const floodKey of floodKeys) {
      const factionId = this.fails.get(floodKey);
      if (factionId && currentTime - factionId.t > 600000) this.fails.delete(floodKey);
    }
    if (floodKeys.some((entryKey) => (this.fails.get(entryKey) || { n: 0 }).n >= 6))
      return this.send(session, {
        t: 'error',
        msg: 'Too many failed sign-ins. Try again in a few minutes.',
      });
    let playerAccount = this.db.get(name);
    if (playerAccount) {
      if (!this.solo && !this.db.check(playerAccount, pass)) {
        for (const floodKey of floodKeys) {
          const factionId = this.fails.get(floodKey) || { n: 0, t: currentTime };
          factionId.n++;
          this.fails.set(floodKey, factionId);
        }
        return this.send(session, { t: 'error', msg: 'Wrong password for that captain.' });
      }
    } else {
      playerAccount = this.db.create(name, pass || 'solo', this.fresh());
      this.log(playerAccount, 'Took command of the Gnat Skiff "Rift Runner" at Quantum Station.');
      session.isNew = true;
    }
    for (const session2 of this.sessions.values())
      if (session2 !== session && session2.data === playerAccount) {
        this.send(session2, { t: 'error', msg: 'Signed in somewhere else.' });
        session2.sock.close();
        this.disconnect(session2);
      }
    try {
      if (migrateCargoLots(playerAccount).changed) this.db.touch();
    } catch (error) {
      console.error('Cargo save rejected:', name, (error as Error).message);
      return this.send(session, {
        t: 'error',
        msg: 'Cargo save validation failed. Contact the server operator.',
      });
    }
    session.data = playerAccount;
    session.name = playerAccount.name;
    playerAccount.id = session.id;
    tutMigrate(playerAccount);
    this.features.hangar.hangarInit(playerAccount);
    this.features.coop.coopMigrate(playerAccount);
    this.features.docks.docksInit(playerAccount);
    this.features.hostile.hostInit(playerAccount);
    this.features.story.storyInit(playerAccount);
    this.features.syndicate.synInit(playerAccount);
    this.features.arcs.arcsInit(playerAccount);
    if (!playerAccount.explored)
      playerAccount.explored = SYSTEMS.filter((starSystem) => starSystem.anchor).map(
        (starSystem) => starSystem.id,
      ); // captains from before 0.4 know the old 30 systems
    session.rep = playerAccount.rep;
    if (!STELLARS[playerAccount.stellar!]) {
      playerAccount.sys = START.system;
      playerAccount.stellar = START.stellar;
    }
    if (STELLARS[playerAccount.stellar!].system !== playerAccount.sys)
      playerAccount.sys = STELLARS[playerAccount.stellar!].system; // repair saves from the old log-off bug
    this.send(session, { t: 'welcome', id: session.id, name: playerAccount.name });
    this.send(session, { t: 'sites', sites: this.sitesPayload() });
    this.send(session, this.features.world.worldPayload());
    this.features.coop.coopLogin(session); // Armada membership, offline DMs, friends' status
    this.idleCheck(session);
    this.you(session);
    this.landed(session);
    this.features.story.storyOnLand(session, STELLARS[playerAccount.stellar!]);
    this.features.arcs.arcOnLand(session, STELLARS[playerAccount.stellar!]); // a story step waiting where you logged off still pops up
    if (!this.solo)
      this.broadcast({ t: 'chat', from: '', msg: `${playerAccount.name} entered the Rift.` }); // no join messages in a solo game
    if (session.isNew)
      this.toast(
        session,
        'Newcomer protection: ambient factions and pirates across the main galaxy overlook you until Station Tier 3. Stray fire can still hurt; attacking or taking combat jobs permits retaliation. Farside is unprotected.',
      );
  }
  // player-facing reference used by Space (id, name, rep, inputs)
  /**
   * Constructs player reference descriptor used by Space simulation to bridge entity and session.
   * @param session Player session.
   * @returns Player reference descriptor for Space.
   */
  pref(session: Session): PlayerReference {
    return {
      id: session.id,
      name: session.name!,
      rep: session.data.rep,
      get inputs() {
        return session.inputs;
      },
      get lastInput() {
        return session.lastInput;
      },
      set lastInput(value) {
        session.lastInput = value;
      },
      s: session,
    };
  }

  // ------------------------------------------------------------------ space: depart, land, jump
  /**
   * Spawns player ship and active wingmates into space system simulation.
   * @param session Player session.
   * @param positionX Coordinate X.
   * @param positionY Coordinate Y.
   * @param firstValue Heading angle in radians.
   * @param value Initial velocity magnitude.
   */
  spawnPlayer(
    session: Session,
    positionX: number,
    positionY: number,
    firstValue: number,
    value: number,
  ): void {
    this.features.towing.detach(session);
    if (!session.data.ship.uid) session.data.ship.uid = this.features.docks.shipUid(session.data);
    if (session.combat) this.combatAssist.stop(session, 'New flight state; rearm explicitly');
    const playerData = session.data,
      space = this.spaces[playerData.sys];
    space.beginVisit(session);
    const entity = space.makeShip({
      loadout: playerData.ship,
      bonus: this.features.bonuses.bonus(playerData),
      faction: 'quantum',
      x: positionX,
      y: positionY,
      a: firstValue,
      vx: Math.sin(firstValue) * value,
      vy: -Math.cos(firstValue) * value,
      player: this.pref(session),
      fuel: playerData.fuel,
      ammo: playerData.ship.ammo,
      shield: playerData.shieldNow,
      armor: playerData.armorNow,
    });
    session.ent = entity;
    session.inputs = [];
    space.players++;
    entity.elite = masteryTier((playerData.mastery || {})[playerData.ship.hull] || 0) >= 5;
    const equipmentBonus = this.features.specialists.flying(playerData, 'herald')
      ? { shieldPct: 25 * this.features.specialists.power(playerData) }
      : this.features.specialists.flying(playerData, 'tidecaller')
        ? { shieldRePct: 40 * this.features.specialists.power(playerData) }
        : {};
    for (const { w: savedDockWing, i: index, x: storedShip } of this.features.docks.activeWings(
      playerData,
    )) {
      // the active dock's wingmates, with their own outfits and officers
      const wingBonus2 = this.features.docks.wingBonus(playerData, savedDockWing);
      for (const [entryKey, value] of Object.entries(equipmentBonus))
        wingBonus2[entryKey] = (wingBonus2[entryKey] || 0) + value;
      const entity2 = space.makeShip({
        loadout: storedShip.ship,
        ammo: { ...storedShip.ship.ammo },
        faction: 'quantum',
        bonus: wingBonus2,
        x: positionX - Math.sin(firstValue) * 120 + (index - 1) * 70,
        y: positionY + Math.cos(firstValue) * 120,
        a: firstValue,
        vx: entity.vx,
        vy: entity.vy,
        ai: 'escort',
        owner: entity.id,
        name: storedShip.ship.name || this.A.ships[storedShip.ship.hull].name,
      });
      entity2.escortSlot = index;
      entity2.wingUid = storedShip.ship.uid;
      entity2.wingOf = session.id;
    }
    for (const mission2 of playerData.missions)
      if (
        mission2.type === 'bounty' &&
        mission2.sys === playerData.sys &&
        !mission2.done &&
        ![...space.ships.values()].some(
          (entity) => entity.mission && entity.mission.id === mission2.id,
        )
      ) {
        mission2.spawned = true;
        space.spawnMissionTarget({ ...mission2, owner: session.id });
        this.toast(session, `Your bounty target, ${mission2.targetName}, is in this system.`);
      }
    this.send(session, {
      t: 'space',
      sys: playerData.sys,
      id: entity.id,
      rocks: space.rocksPayload(),
      miningRocks: this.features.mining.rocksPayload(space),
      mining: this.features.mining.payload(session, space),
      industrial: this.features.industrial.payload(session),
      towing: this.features.towing.payload(session),
      miningPressure: this.features.pressure.payload(session),
      miningHazards: this.features.pressure.hazards(space.id),
    });
    this.features.fronts.missionArrive(session, space);
    this.features.story.storyArrive(session, space);
    this.features.arcs.arcArrive(session, space);
    if (!this.solo) {
      this.features.coop.warbandArrive(session, space);
      const armadaState = this.features.coop.armadaOf(playerData);
      if (armadaState) {
        this.features.coop.armadaRefresh(armadaState);
        this.features.coop.armadaPush(armadaState);
      }
    } // members see where you are
  }
  /**
   * Launches player ship from docked stellar body into active space flight.
   * @param session Player session launching from stellar.
   */
  depart(session: Session): void {
    const playerData = session.data;
    if (session.ent || !playerData.stellar) return;
    if (playerData.shipless)
      return this.toast(
        session,
        'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.',
      );
    if (this.features.specialists.inDrydock(playerData)) {
      const savedSpecialist = playerData.specState[playerData.ship.hull];
      return this.toast(
        session,
        `The ${this.A.ships[playerData.ship.hull].name} is in the drydock for her tier-up: ${Math.ceil((savedSpecialist.upT! - Date.now()) / 60000)} minutes left.`,
      );
    }
    const stellarBody = STELLARS[playerData.stellar!];
    const firstValue = Math.random() * Math.PI * 2;
    beginEconomyTrip(playerData, stellarBody.id, Date.now());
    playerData.stellar = null;
    this.spawnPlayer(
      session,
      stellarBody.x + Math.sin(firstValue) * (stellarBody.r + 30),
      stellarBody.y - Math.cos(firstValue) * (stellarBody.r + 30),
      firstValue,
      40,
    );
    this.you(session);
  }
  /**
   * Lands player ship at a stellar body, repairing, refueling, and completing missions.
   * @param session Player session landing.
   * @param sessionId Target stellar ID.
   */
  land(session: Session, sessionId: string): void {
    const playerData = session.data,
      entity = session.ent;
    if (!entity) return;
    if (this.features.towing.attached(session))
      return this.toast(session, 'Deliver or detach the motherlode before landing.');
    if (entity.disabled) return this.toast(session, 'Your ship is disabled.');
    const stellarBody = STELLARS[sessionId];
    if (!stellarBody || stellarBody.system !== playerData.sys) return;
    if (!stellarBody.svc!.includes('L'))
      return this.toast(session, `${stellarBody.name} has nowhere to land.`);
    const distance = Math.hypot(entity.x - stellarBody.x, entity.y - stellarBody.y),
      space2 = Math.hypot(entity.vx, entity.vy);
    if (distance > stellarBody.r + 60)
      return this.toast(session, `Too far from ${stellarBody.name} to land.`);
    if (space2 > 80) return this.toast(session, 'Slow down to land.');
    const faction2 = systemsById[playerData.sys].faction;
    if (
      !stellarBody.outlaw &&
      (playerData.rep[faction2] || 0) <= -30 &&
      !(playerData.landPass && playerData.landPass[stellarBody.id] > Date.now())
    )
      return this.toast(
        session,
        `${stellarBody.name} refuses you permission to land. Hail them (T) to talk.`,
      );
    const space = this.spaces[playerData.sys];
    this.dropEscorts(space, entity);
    playerData.fuel = entity.fuel;
    for (const weaponMount of entity.guns)
      if (weaponMount.ammo !== Infinity) playerData.ship.ammo[weaponMount.w] = weaponMount.ammo;
    space.remove(entity);
    space.players--;
    session.ent = null;
    playerData.stellar = sessionId;
    arriveEconomyTrip(playerData, sessionId, Date.now());
    // free refuel and repair
    const computedShipStats = this.features.shipStats.stats(playerData);
    playerData.fuel = computedShipStats!.fuel;
    playerData.shieldNow = undefined;
    playerData.armorNow = undefined;
    this.completeOnLanding(session, stellarBody);
    if (playerData.sys !== START.system) this.tut(session, 'land2');
    if (stellarBody.site) this.tut(session, 'site');
    this.db.touch();
    this.you(session);
    this.landed(session);
    this.features.story.storyOnLand(session, stellarBody);
    this.features.arcs.arcOnLand(session, stellarBody);
    if (!this.solo) {
      const armadaState = this.features.coop.armadaOf(playerData);
      if (armadaState) this.features.coop.armadaPush(armadaState);
    } // 2.6
  }
  /**
   * Transmits docked port services payload (market, shipyard, jobs, outfitter) to client.
   * @param session Player session currently docked.
   */
  landed(session: Session): void {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!];
    if (!stellarBody) return;
    const ownSite2 = this.ownSite(playerData, stellarBody),
      playerData2 = stellarBody.site ? this.siteOwner(stellarBody.id) : null;
    this.send(session, this.landedPayload(session, playerData, stellarBody, ownSite2, playerData2));
  }
  /** Project port services using the same live provider evaluations as the landed packet. */
  landedPayload(
    session: Session,
    playerData: PlayerData,
    stellarBody: (typeof STELLARS)[string],
    owner2: boolean,
    playerData2: PlayerData | null,
  ) {
    return {
      t: 'landed',
      refinery: this.features.refinery.payload(session),

      /** Landed stellar body identifier */
      stellar: stellarBody.id,
      market: this.market(stellarBody),
      tradeTerms: {
        site: !!stellarBody.site,
        tradePct: this.features.bonuses.bonus(playerData).tradePct || 0,
        sell: this.features.fronts.mods(stellarBody.system).sell,
      },
      offers: this.offers(stellarBody, playerData),
      yard: this.yard(stellarBody, playerData),
      outfitter: this.outfitter(stellarBody, playerData),
      mats: this.matsFor(stellarBody, playerData),
      site: stellarBody.site
        ? {
            owner: playerData2 ? playerData2.name : null,
            ops: playerData2 ? playerData2.station.ops : 0,
            own: owner2,
          }
        : null,
      community: stellarBody.hub ? this.community() : null,
      news:
        stellarBody.svc.includes('B') || stellarBody.hub ? this.features.rivals.newsFeed(6) : null,
      contact: this.features.quests.barTalk(stellarBody, playerData),
      blackmarket: this.features.syndicate.blackMarket(stellarBody, playerData),
      arcs: this.features.arcs.arcOffersAt(playerData, stellarBody).map((mission) => ({
        fac: mission.fac,
        title: mission.title,
        brief: mission.brief,
        text: mission.text,
        locked: mission.locked || null,
        arc: ARCS_NAME(mission.fac),
      })),
      bank: this.features.syndicate.bankAt(stellarBody)
        ? this.features.syndicate.bankInfo(playerData)
        : null,
      bar: this.features.hangar.barOffers(stellarBody, playerData),
      store: this.features.fronts.storeFor(stellarBody),
      colony: this.features.frontier.colonyPayload(stellarBody, playerData),
      story: (() => {
        const storyOffer2 = this.features.story.storyOffer(playerData, stellarBody);
        return storyOffer2
          ? {
              id: storyOffer2.id,
              title: storyOffer2.title,
              brief: storyOffer2.brief,
              text: storyOffer2.text,
              acc: storyOffer2.acc,
              locked: ('locked' in storyOffer2 ? storyOffer2.locked : null) || null,
            }
          : null;
      })(),
      exchange:
        stellarBody.hub || (stellarBody.svc.includes('T') && !stellarBody.site)
          ? this.features.frontier.exchangePayload(playerData)
          : null,
    };
  }
  /**
   * Initiates hyperjump to connected system, charging jump drive.
   * @param session Player session initiating hyperjump.
   * @param destination Destination system ID.
   */
  jump(session: Session, destination: string): void {
    if (this.features.towing.attached(session))
      return this.toast(session, 'Detach the motherlode before jumping.');
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly') return;
    if (entity.disabled) return this.toast(session, 'Your ship is disabled.');
    const starSystem = systemsById[playerData.sys];
    const skip = !starSystem.links.includes(destination)
      ? this.features.specialists.pathfinderJump(playerData, playerData.sys, destination)
      : null;
    if (!starSystem.links.includes(destination) && !skip)
      return this.toast(session, 'No hyperspace route there.');
    if (this.features.specialists.inDrydock(playerData))
      return this.toast(
        session,
        'Your ship is booked into the drydock for her tier-up. Land and wait for it to finish.',
      );
    if (this.features.story.deepLocked(playerData, destination))
      return this.toast(
        session,
        "The Deep is uncharted: ships that jump in blind are never seen again. The Que'vari are said to keep charts of the dark.",
      );
    const fuelCost =
      physicsConstants.jumpFuel *
      this.features.fronts.mods(playerData.sys).jumpFuel *
      (skip ? 1.5 : 1);
    entity.jumpCost = fuelCost;
    if (entity.fuel < fuelCost)
      return this.toast(
        session,
        skip
          ? `A Pathfinder skip-jump needs ${Math.round((fuelCost / physicsConstants.jumpFuel) * 10) / 10} jumps of fuel.`
          : this.features.fronts.mods(playerData.sys).jumpFuel > 1
            ? 'Gravity shear: this jump needs double fuel.'
            : 'Not enough fuel to jump.',
      );
    for (const stellarBody of starSystem.stellars)
      if (
        Math.hypot(entity.x - stellarBody.x, entity.y - stellarBody.y) < physicsConstants.jumpClear
      )
        return this.toast(
          session,
          'Too close to ' + stellarBody.name + ' to jump. Fly further out.',
        );
    const starSystem2 = systemsById[destination];
    entity.a = Math.atan2(starSystem2.x - starSystem.x, -(starSystem2.y - starSystem.y));
    entity.state = 'jumpout';
    entity.jumpT = entity.st.jumpFast ? 0.6 : 1.6;
    entity.jumpTo = destination;
    this.spaces[playerData.sys].events.push(['jump', entity.id]);
    for (const entity2 of this.spaces[playerData.sys].ships.values())
      if (entity2.owner === entity.id && !entity2.fighterOf && !entity2.rival) {
        entity2.state = 'jumpout';
        entity2.jumpT = entity.jumpT + 0.3;
        entity2.a = entity.a;
        entity2.jumpTo = '-';
      }
    this.features.coop.armadaLeaderJump(session, destination); // members who follow the leader get the destination
  }
  /**
   * Finalizes hyperjump: deducts fuel, explores destination, and spawns ship in new system.
   * @param entity Jumping ship entity.
   * @param space Origin space simulation.
   */
  finishJump(entity: Entity, space: SpaceSpace): void {
    if (entity.player && this.features.towing.attached(entity.player.s)) {
      entity.state = 'fly';
      return this.toast(entity.player.s, 'Detach the motherlode before jumping.');
    }
    if (!entity.player) {
      space.remove(entity, 'jump');
      return;
    }
    const session = entity.player.s,
      playerData = session.data,
      from = systemsById[playerData.sys],
      starSystem = systemsById[entity.jumpTo!];
    this.dropEscorts(space, entity, 'jump'); // first, so drones still out are counted back into the bays
    playerData.fuel = entity.fuel - (entity.jumpCost || physicsConstants.jumpFuel);
    for (const weaponMount of entity.guns)
      if (weaponMount.ammo !== Infinity) playerData.ship.ammo[weaponMount.w] = weaponMount.ammo;
    playerData.shieldNow = entity.shield;
    playerData.armorNow = entity.armor;
    space.remove(entity, 'jump');
    space.players--;
    session.ent = null;
    playerData.sys = starSystem.id;
    playerData.stats.jumps++;
    this.features.hangar.officerXp(session, 4);
    this.features.fronts.goal(session, 'jumps');
    this.features.frontier.mastery(session, 3);
    if (!playerData.explored.includes(starSystem.id)) {
      playerData.explored.push(starSystem.id);
      this.features.fronts.goal(session, 'charted');
      this.features.specialists.specOnChart(session);
      if (starSystem.gen)
        this.log(playerData, `Charted ${starSystem.name} (${FACTIONS[starSystem.faction].name}).`);
    }
    const atan = Math.atan2(from.x - starSystem.x, -(from.y - starSystem.y)); // arrive from the direction we came
    const firstValue = atan + Math.PI;
    this.spawnPlayer(
      session,
      Math.sin(atan) * 2200,
      -Math.cos(atan) * 2200,
      firstValue,
      entity.st.maxSpeed,
    );
    playerData.shieldNow = playerData.armorNow = undefined;
    session.ent!.graceT = this.spaces[playerData.sys].t + 6; // a few seconds to get your bearings after a jump
    this.protectNote(session, starSystem);
    this.spaces[playerData.sys].events.push([
      'flash',
      Math.round(session.ent!.x),
      Math.round(session.ent!.y),
    ]);
    this.you(session);
    for (const mission of playerData.missions)
      if (mission.type === 'patrol' && mission.sys === playerData.sys)
        this.toast(
          session,
          `Patrol: destroy ${mission.need! - mission.got!} more hostile ships here.`,
        );
  }

  // flying into the Gateway (or its far mouth) crosses instantly, with no fuel cost
  /**
   * Handles instantaneous transit through Gateway wormholes without fuel consumption.
   * @param entity Ship entity entering wormhole.
   * @param space Origin space.
   * @param stellarBody Wormhole gateway stellar body.
   */
  wormholeTransit(
    entity: Entity,
    space: SpaceSpace,
    stellarBody: import('../shared/galaxy.ts').RawStellarBody,
  ): void {
    if (entity.player && this.features.towing.attached(entity.player.s))
      return this.toast(entity.player.s, 'Detach the motherlode before Gateway transit.');
    const session = entity.player!.s,
      playerData = session.data,
      starSystem = systemsById[stellarBody.wormhole!],
      exit = starSystem.stellars.find((rawStellarBody) => rawStellarBody.id === stellarBody.exit)!;
    this.dropEscorts(space, entity);
    playerData.fuel = entity.fuel;
    for (const weaponMount of entity.guns)
      if (weaponMount.ammo !== Infinity) playerData.ship.ammo[weaponMount.w] = weaponMount.ammo;
    playerData.shieldNow = entity.shield;
    playerData.armorNow = entity.armor;
    space.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
    space.remove(entity);
    space.players--;
    session.ent = null;
    playerData.sys = starSystem.id;
    playerData.stats.jumps++;
    this.features.fronts.goal(session, 'jumps');
    this.features.frontier.mastery(session, 3);
    const first = !playerData.explored.includes(starSystem.id);
    if (first) {
      playerData.explored.push(starSystem.id);
      this.features.fronts.goal(session, 'charted');
      this.log(
        playerData,
        starSystem.farside
          ? 'Passed through the Gateway. The stars on the far side match no chart.'
          : 'Came home through the Gateway to Concordia.',
      );
    }
    const firstValue = Math.random() * Math.PI * 2;
    this.spawnPlayer(
      session,
      exit.x + Math.sin(firstValue) * (exit.r * 0.15),
      exit.y - Math.cos(firstValue) * (exit.r * 0.15),
      firstValue,
      140,
    );
    playerData.shieldNow = playerData.armorNow = undefined;
    session.ent!.wormT = this.spaces[playerData.sys].t + 4;
    session.ent!.wormExit = exit.id; // Rearm only after leaving the arrival aperture.
    session.ent!.graceT = this.spaces[playerData.sys].t + 6;
    this.protectNote(session, starSystem);
    this.spaces[playerData.sys].events.push([
      'flash',
      Math.round(session.ent!.x),
      Math.round(session.ent!.y),
    ]);
    this.toast(
      session,
      starSystem.farside
        ? `Through the Gateway: ${starSystem.name}.${first ? ' Nothing out here is on any chart.' : ''}`
        : 'Back through the Gateway: Sol.',
    );
    this.you(session);
  }
  // ------------------------------------------------------------------ combat outcomes
  /**
   * Handles weapon impact against NPC ship, updating faction reputation and rival state.
   * @param playerReference Attacking player reference.
   * @param entity Target entity hit.
   * @param space Space simulation.
   */
  onHit(playerReference: PlayerReference, entity: Entity, space: SpaceSpace): void {
    const session = playerReference.s,
      playerData = session.data;
    if (!playerData) return;
    this.features.rivals.rivalOnHit(session, entity, space);
    if (
      space.isHostile(entity, session.ent || entity) &&
      entity.aggro.size <= 1 &&
      FACTIONS[entity.faction].pirate
    )
      return;
    if (
      !FACTIONS[entity.faction].pirate &&
      !FACTIONS[entity.faction].alwaysHostile &&
      !entity.dread &&
      !entity.boss &&
      !entity.mission &&
      (playerData.rep[entity.faction] || 0) > -100 &&
      (!entity.repHitT || space.t - entity.repHitT > 1.5)
    ) {
      entity.repHitT = space.t;
      playerData.rep[entity.faction] = clampStanding((playerData.rep[entity.faction] || 0) - 1);
    }
  }
  /**
   * Resolves combat kill: awards bounties, increases combat rating, and fulfills mission objectives.
   * @param playerReference Killing player reference.
   * @param entity Entity destroyed.
   * @param space Space simulation.
   * @param byEscort Whether final blow was landed by an escort.
   */
  onKill(
    playerReference: PlayerReference,
    entity: Entity,
    space: SpaceSpace,
    byEscort?: boolean,
  ): void {
    const session = playerReference.s,
      playerData = session.data;
    if (!playerData) return;
    playerData.stats.kills++;
    playerData.stats.combat = (playerData.stats.combat || 0) + (entity.pw || entity.strength || 10); // combat rating
    this.features.hangar.officerXp(session, 8 + Math.round((entity.strength || 10) / 40));
    this.features.frontier.mastery(session, (entity.strength || 10) / 8);
    this.features.specialists.specOnKill(session, entity, space, byEscort);
    const factionDef = FACTIONS[entity.faction];
    if (this.features.rivals.rivalOnKill(session, entity, space)) {
      this.toast(
        session,
        `You destroyed ${entity.name!.split(' · ')[0]}'s ship. They will not forget it.`,
      );
      this.you(session);
      return;
    } // 1.1
    if (entity.storyKill) this.features.story.storyProgress(session, entity);
    if (entity.kingpin) this.features.coop.warbandDown(entity); // an Armada contract's kingpin
    this.features.living.stateOnKill(session, entity, space); // 2.4
    if (entity.arcOf) this.features.arcs.arcProgress(session, entity); // 1.2 faction arcs
    if (entity.boss || entity.bossMinion) {
      this.features.fronts.goal(session, 'kills');
      this.you(session);
      return;
    }
    if (factionDef.pirate || factionDef.alwaysHostile || entity.mission) {
      const stateBountyMultiplier = (() => {
        const livingState = this.features.living.stateOf(space.id);
        return (livingState && STATES[livingState.kind].bounty) || 1;
      })(); // a pirate scourge pays more
      const bounty = Math.round(
        ((entity.strength || 10) * 25 + 500) *
          (1 + (this.features.bonuses.bonus(playerData).lootPct || 0) / 100) *
          this.features.fronts.mods(space.id).bounty *
          stateBountyMultiplier *
          (this.features.specialists.flying(playerData, 'vanguard')
            ? 1 + 0.5 * this.features.specialists.power(playerData)
            : 1),
      );
      this.features.coop.shareBounty(session, bounty, space, entity);
      this.features.fronts.goal(session, 'kills'); // Armada members present get kill credit and a share
      playerData.credits += bounty;
      playerData.stats.earned += bounty;
      playerData.rep.quantum = clampStanding(playerData.rep.quantum + 1);
      playerData.rep.spacer = clampStanding(playerData.rep.spacer + 1);
      this.toast(
        session,
        `Destroyed ${entity.name || this.A.ships[entity.hull].name}. Bounty: ${credits(bounty)} credits.`,
      );
      this.tut(session, 'kill');
    } else {
      playerData.rep[entity.faction] = clampStanding((playerData.rep[entity.faction] || 0) - 10);
      for (const [factionId, factionDef] of Object.entries(FACTIONS))
        if (factionDef.hostile.includes(entity.faction))
          playerData.rep[factionId] = clampStanding((playerData.rep[factionId] || 0) + 2);
      this.toast(
        session,
        `Destroyed a ${factionDef.short} ship. ${factionDef.name} will remember that.`,
      );
    }
    for (const mission2 of playerData.missions) {
      if (mission2.type === 'bounty' && entity.mission && entity.mission.id === mission2.id) {
        mission2.done = true;
        this.toast(
          session,
          `Bounty complete: ${mission2.targetName} is dead. Land anywhere to collect ${credits(mission2.reward)}.`,
        );
      }
      if (
        mission2.type === 'patrol' &&
        mission2.sys === space.id &&
        (factionDef.pirate ||
          FACTIONS[systemsById[mission2.sys].faction].hostile.includes(entity.faction)) &&
        !mission2.done
      ) {
        mission2.got!++;
        if (mission2.got! >= mission2.need!) {
          mission2.done = true;
          this.toast(session, 'Patrol complete. Land anywhere to collect your pay.');
        }
      }
    }
    this.you(session);
  }
  /**
   * Handles player ship destruction: charges insurance fee, clears cargo, and respawns at station.
   * @param playerReference Player reference destroyed.
   * @param space Space simulation.
   * @param entity Killer entity, if any.
   */
  onPlayerDeath(playerReference: PlayerReference, space: SpaceSpace, entity?: Entity | null): void {
    const session = playerReference.s,
      playerData = session.data;
    if (!playerData) return;
    this.features.towing.detach(session);
    if (space.sys.arena && this.features.frontier.onArenaDeath(session, space)) return;
    if (session.ent) this.dropEscorts(space, session.ent, 'jump'); // escorts no longer linger after you are destroyed
    space.players--;
    session.ent = null;
    const serviceFee = Math.min(
      playerData.credits,
      Math.round((this.A.ships[playerData.ship.hull].cost || 0) * 0.05),
    );
    playerData.credits -= serviceFee;
    if (playerData.ship.industrial) {
      playerData.ship.industrial.outputs = {};
      playerData.ship.industrial.workMs = 0;
      playerData.ship.industrial.harvestMs = 0;
    }
    if (!this.features.specialists.flying(playerData, 'lodestar'))
      clearLots(playerData.cargo, playerData.cargoLots); // the Lodestar's hold is protected; wingmates fly home
    const back =
      playerData.station &&
      playerData.station.site &&
      STELLARS[playerData.station.site] &&
      this.ownSite(playerData, STELLARS[playerData.station.site])
        ? playerData.station.site
        : START.stellar; // your own station hull if you have one, otherwise the hub
    playerData.stellar = back;
    playerData.sys = STELLARS[back].system;
    if (session.retaliationVisit?.sys !== playerData.sys) session.retaliationVisit = undefined;
    playerData.fuel = undefined;
    for (const mission of playerData.missions) if (mission.type === 'cargo') mission.lost = true;
    playerData.missions = playerData.missions.filter((mission) => !mission.lost);
    this.log(
      playerData,
      `Ship destroyed${entity && entity.player ? ' by ' + entity.player.name : ''}. The insurers rebuilt it at ${STELLARS[back].name} for ${credits(serviceFee)} credits; the cargo was lost.`,
    );
    this.send(session, { t: 'dead', fee: serviceFee, at: STELLARS[back].name });
    if (entity && entity.player)
      this.broadcast({
        t: 'chat',
        from: '',
        msg: `${entity.player.name} destroyed ${session.name} in ${systemsById[space.id].name}.`,
      });
    this.db.touch();
    this.you(session);
    this.landed(session);
  }
  /**
   * Finds the nearest market port that purchases a specific commodity.
   * @param starSystem Starting system ID.
   * @param captainId Commodity ID.
   * @returns Nearest purchasing stellar port and jump distance, or null.
   */
  nearestBuyer(starSystem: string, captainId: string): { p: StellarBody; j: number } | null {
    // Keep authored tie order and the existing five-link search boundary.
    for (const [systemId, jumps] of galaxyGraph.walk(starSystem, { maxDepth: 5 })) {
      for (const port of systemsById[systemId].stellars) {
        const stellarBody = STELLARS[port.id];
        if (
          stellarBody &&
          !stellarBody.site &&
          (stellarBody.svc || '').includes('T') &&
          price(stellarBody, captainId) !== null
        )
          return { p: stellarBody, j: jumps };
      }
    }
    return null;
  }
  /**
   * Handles player scooping floating salvage canister, ore chunk, or credits.
   * @param playerReference Player scooping loot.
   * @param lootItem Loot item payload.
   * @returns Returns false if cargo hold full when mining ore.
   */
  onLoot(playerReference: PlayerReference, lootItem: LootItem): boolean | void {
    const session = playerReference.s,
      playerData = session.data;
    if (!playerData) return;
    if (lootItem.cargo) return this.features.fleetcmd.lootCargo(session, lootItem as CargoLoot); // jettisoned cargo
    if (lootItem.salvage) return this.features.quests.questLoot(session, lootItem); // a quest's salvage
    if (lootItem.ore) {
      // mined ore goes into the cargo hold, if there is room
      // Freeze the original economic parcel once, including when the first hold is full.
      if (lootItem.remainingLots === undefined) {
        const bonus2 = this.features.bonuses.bonus(playerData),
          rawData =
            lootItem.n! *
            (1 + (bonus2.miningPct || 0) / 100) *
            this.features.fronts.mods(playerData.sys).mining,
          want = Math.floor(rawData) + (Math.random() < rawData % 1 ? 1 : 0);
        lootItem.remainingLots = commonLots(lootItem.ore, want).grades;
      }
      const want = Object.values(lootItem.remainingLots).reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      );
      if (!want) return true;
      const computedShipStats = this.features.shipStats.stats(playerData),
        used = this.holdUsed(playerData),
        count = Math.min(want, computedShipStats!.cargo - used);
      if (count <= 0) {
        if (!session.fullT || Date.now() - session.fullT > 8000) {
          session.fullT = Date.now(); // say where it can go
          const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === lootItem.ore),
            nearestBuyer2 = this.nearestBuyer(playerData.sys, lootItem.ore);
          this.toast(
            session,
            !computedShipStats!.cargo
              ? 'This ship has no cargo hold. Fit a Cargo Compression outfit (it takes no space) to keep what you mine.'
              : `Cargo hold full. ${commodityDef!.name} sells at ${nearestBuyer2 ? `${nearestBuyer2.p.name}${nearestBuyer2.j ? ` (${nearestBuyer2.j} jump${nearestBuyer2.j > 1 ? 's' : ''})` : ' in this system'}` : 'markets further out'}${playerData.station && playerData.station.ops >= 1 ? ', or process it at your station' : ''}.`,
          );
        }
        return false;
      }
      const selected = splitLots(lootItem.remainingLots, count);
      addLots(
        playerData.cargo,
        playerData.cargoLots,
        { cid: lootItem.ore, qty: count, grades: selected },
        Math.max(0, computedShipStats!.cargo - used),
      );
      for (const game of ['common', 'rich', 'pure'] as const)
        lootItem.remainingLots[game] -= selected[game];
      playerData.stats.mined = (playerData.stats.mined || 0) + count;
      this.features.fronts.goal(session, 'mined', count);
      this.features.frontier.mastery(session, count * 0.3);
      if (lootItem.generationKey) this.features.mining.collected(session, lootItem, count);
      else if (!lootItem.progressionClaimed) {
        lootItem.progressionClaimed = true;
        this.features.specialists.specOnMine(session, lootItem);
      }
      this.toast(
        session,
        `+${count} t ${COMMODITIES.find((commodityDef) => commodityDef.id === lootItem.ore)!.name}`,
      );
      this.you(session);
      return Object.values(lootItem.remainingLots).every((quantity) => quantity === 0);
    }
    if (lootItem.credits) {
      lootItem.credits = Math.round(
        lootItem.credits * (1 + (this.features.bonuses.bonus(playerData).lootPct || 0) / 100),
      );
      playerData.credits += lootItem.credits;
      this.toast(session, `Salvaged ${credits(lootItem.credits)} credits.`);
    }
    if (lootItem.chest) return this.features.hostile.openChest(session, lootItem);
    if (lootItem.credits || lootItem.mat) this.features.specialists.specOnLoot(session);
    if (lootItem.mat) {
      playerData.mats[lootItem.mat][lootItem.grade!]++;
      this.toast(session, `Salvaged a ${lootItem.mat} crate (grade ${GRADES[lootItem.grade!]}).`);
    }
    this.you(session);
  }

  /**
   * Compiles social hub statistics: docked captains, top earners, and station claim statuses.
   * @returns Active social / leaderboard statistics payload.
   */
  community(): CommunityPayload {
    const docked = [...this.sessions.values()]
      .filter((session) => session.data && session.data.stellar === 'qstation')
      .map((session) => session.name!);
    const playerAccounts = Object.values(this.db.players);
    const slice2 = playerAccounts
      .map((playerAccount) => ({
        name: playerAccount.name,
        earned: (playerAccount.stats && playerAccount.stats.earned) || 0,
        kills: (playerAccount.stats && playerAccount.stats.kills) || 0,
        ship: this.A.ships[playerAccount.ship.hull]
          ? this.A.ships[playerAccount.ship.hull].name
          : '',
      }))
      .concat(
        Object.values(this.db.world.rivals || {}).map((rivalState) => ({
          name: (this.features.rivals.rivalName || (() => ''))(rivalState.id),
          ai: true,
          earned: rivalState.earned,
          kills: rivalState.kills,
          ship: this.A.ships[rivalState.hull] ? this.A.ships[rivalState.hull].name : '',
        })),
      )
      .sort((firstValue, secondValue) => secondValue.earned - firstValue.earned)
      .slice(0, 10);
    const stations = SITES.map((stellarBody) => {
      const playerData = this.siteOwner(stellarBody.id);
      return {
        system: systemsById[stellarBody.system].name,
        owner: playerData ? playerData.name : null,
        ops: playerData ? playerData.station.ops : 0,
      };
    });
    const online = [...this.sessions.values()]
      .filter((session) => session.data)
      .map((session) => ({ name: session.name!, sys: systemsById[session.data.sys].name }));
    return { docked, top: slice2, stations, online };
  }
  // ------------------------------------------------------------------ markets
  /**
   * @returns Ordinary port commerce.
   */
  createPortService(): PortService {
    // oxlint-disable-next-line typescript/no-this-alias -- Capability getters retain the coordinator receiver.
    const game = this;

    const capabilities: PortCapabilities = {
      get A() {
        return game.A;
      },
      get O() {
        return game.O;
      },
      get db() {
        return game.db;
      },
      get features() {
        return game.features;
      },
      fitsJobs: (...argumentsList) => game.fitsJobs(...argumentsList),
      holdUsed: (...argumentsList) => game.holdUsed(...argumentsList),
      jobBunks: (...argumentsList) => game.jobBunks(...argumentsList),
      landed: (...argumentsList) => game.landed(...argumentsList),
      log: (...argumentsList) => game.log(...argumentsList),
      market: (...argumentsList) => game.market(...argumentsList),
      matsFor: (...argumentsList) => game.matsFor(...argumentsList),
      outfitter: (...argumentsList) => game.outfitter(...argumentsList),
      ownSite: (...argumentsList) => game.ownSite(...argumentsList),
      siteOwner: (...argumentsList) => game.siteOwner(...argumentsList),
      toast: (...argumentsList) => game.toast(...argumentsList),
      tradeIn: (...argumentsList) => game.tradeIn(...argumentsList),
      tut: (...argumentsList) => game.tut(...argumentsList),
      yard: (...argumentsList) => game.yard(...argumentsList),
      you: (...argumentsList) => game.you(...argumentsList),
    };
    return createPortService(Object.freeze(capabilities));
  }

  /**
   * Generates commodity market prices for a stellar port, applying flash and state modifiers.
   * @param stellarBody Stellar port.
   * @returns Array of traded commodities and pricing, or null.
   */
  market(stellarBody: StellarBody): MarketItem[] | null {
    return this.portService.market(stellarBody);
  }
  /**
   * Executes commodity purchase or sale transaction with market depth price impact.
   * @param session Player session.
   * @param captainId Commodity ID.
   * @param quantity Amount to buy (>0) or sell (<0).
   */
  trade(
    session: Session,
    captainId: string,
    quantity: number,
    selection: GradeLots | 'common-first' = 'common-first',
  ): void {
    return this.portService.trade(session, captainId, quantity, selection);
  }
  /**
   * Lists upgrade materials for sale at a stellar body based on faction specialization.
   * @param stellarBody Stellar body.
   * @param playerData Player data.
   * @returns Upgrade materials available.
   */
  matsFor(
    stellarBody: StellarBody,
    playerData?: PlayerData,
  ): Array<{ mat: string; grade: number; price: number }> {
    return this.portService.matsFor(stellarBody, playerData);
  }
  /**
   * Executes purchase or sale of crafting and upgrade materials.
   * @param session Player session.
   * @param material Material name ('alloy', 'crystal', 'isotope').
   * @param grade Material grade index (0-4).
   * @param count Quantity to buy (>0) or sell (<0).
   */
  buyMat(session: Session, material: string, grade: number, count: number): void {
    return this.portService.buyMat(session, material, grade, count);
  }

  // ------------------------------------------------------------------ shipyard and outfitter
  /**
   * Compiles list of ship hulls available for purchase at shipyard.
   * @param stellarBody Stellar port.
   * @param playerData Player data.
   * @returns Array of hull IDs for sale, or null.
   */
  yard(stellarBody: StellarBody, playerData?: PlayerData): number[] | null {
    return this.portService.yard(stellarBody, playerData);
  }
  /**
   * Calculates credit trade-in value for captain's current ship and outfits (50% value).
   * @param playerData Player save data.
   * @returns Credit trade-in value of current ship and installed outfits.
   */
  tradeIn(playerData: PlayerData): number {
    return this.portService.tradeIn(playerData);
  }
  /**
   * Purchases a new flagship hull, applying trade-in credit for previous ship.
   * @param session Player session.
   * @param hull Hull ID to purchase.
   */
  buyShip(session: Session, hull: number): void {
    return this.portService.buyShip(session, hull);
  }
  /**
   * Compiles list of ship outfits available for purchase at outfitter.
   * @param stellarBody Stellar port.
   * @param playerData Player data.
   * @returns Array of outfit IDs for sale, or null.
   */
  outfitter(stellarBody: StellarBody, playerData?: PlayerData): number[] | null {
    return this.portService.outfitter(stellarBody, playerData);
  }
  /**
   * Purchases or sells a ship outfit or ammunition batch.
   * @param session Player session.
   * @param identifier Outfit ID.
   * @param count Quantity to buy (>0) or sell (<0).
   */
  outfit(session: Session, identifier: number, count: number): void {
    return this.portService.outfit(session, identifier, count);
  }

  /**
   * @returns Ordinary job operations.
   */
  createJobService(): JobService {
    // oxlint-disable-next-line typescript/no-this-alias -- Capability getters retain the coordinator receiver.
    const game = this;

    const capabilities: JobCapabilities = {
      get A() {
        return game.A;
      },
      get db() {
        return game.db;
      },
      get features() {
        return game.features;
      },
      holdUsed: (...argumentsList) => game.holdUsed(...argumentsList),
      landed: (...argumentsList) => game.landed(...argumentsList),
      log: (...argumentsList) => game.log(...argumentsList),
      offers: (...argumentsList) => game.offers(...argumentsList),
      send: (...argumentsList) => game.send(...argumentsList),
      toast: (...argumentsList) => game.toast(...argumentsList),
      tut: (...argumentsList) => game.tut(...argumentsList),
      you: (...argumentsList) => game.you(...argumentsList),
    };
    return createJobService(Object.freeze(capabilities));
  }

  // ------------------------------------------------------------------ missions
  /**
   * Generates procedural job board mission offers for a stellar port.
   * @param stellarBody Stellar port.
   * @param playerData Player data.
   * @returns Available job board missions.
   */
  offers(stellarBody: StellarBody, playerData: PlayerData): Mission[] {
    return this.jobService.offers(stellarBody, playerData);
  }
  /**
   * Accepts a mission from the local stellar job board.
   * @param session Player session.
   * @param identifier Mission ID to accept.
   */
  accept(session: Session, identifier: string): void {
    return this.jobService.accept(session, identifier);
  }
  /**
   * Evaluates active missions upon landing, paying rewards and logging completions.
   * @param session Player session landing.
   * @param stellarBody Landed stellar port.
   */
  completeOnLanding(session: Session, stellarBody: StellarBody): void {
    return this.jobService.completeOnLanding(session, stellarBody);
  }

  // ------------------------------------------------------------------ Quantum Station (each captain's own)
  /**
   * Updates Personal Station timers: refinery generation, active research, and construction.
   * @param playerData Player save data.
   */
  checkStation(playerData: PlayerData): void {
    const stationState = playerData.station;
    if (!stationState.claimed) return;
    this.features.hangar.hangarInit(playerData);
    const researchBonus2 = researchBonus(stationState),
      currentTime = Date.now(),
      perUnit =
        (REFINERY.minutes[stationState.ops] * 60000) /
        (1 + (researchBonus2.refineSpeed || 0) / 100),
      capacity = REFINERY.silo + (researchBonus2.silo || 0);
    if (stationState.ops >= 1 && perUnit > 0) {
      while (stationState.refUnits < capacity && currentTime - stationState.refT >= perUnit) {
        stationState.refUnits++;
        stationState.refT += perUnit;
      }
      if (stationState.refUnits >= capacity) stationState.refT = currentTime;
    }
    if (stationState.active && currentTime >= stationState.active.ends) {
      stationState.done.push(stationState.active.id);
      this.log(
        playerData,
        `Research complete: ${RESEARCH.find((researchNode) => researchNode.id === stationState.active!.id)!.name}.`,
      );
      stationState.active = null;
    }
    this.features.hangar.startQueued(playerData);
  }
  /**
   * Verifies if player has required material quantities.
   * @param playerData Player save data.
   * @param mats Required materials tuple [name, grade, count].
   * @returns True if inventory satisfies all material requirements.
   */
  hasMats(playerData: PlayerData, mats: Array<[string, number, number]>): boolean {
    return mats.every(([message, game, count]) => playerData.mats[message][game] >= count);
  }
  /**
   * Deducts specified material quantities from player inventory.
   * @param playerData Player save data.
   * @param mats Materials to consume [name, grade, count].
   */
  takeMats(playerData: PlayerData, mats: Array<[string, number, number]>): void {
    for (const [message, game, count] of mats) playerData.mats[message][game] -= count;
  }
  /**
   * Processes Personal Station operations: claiming derelicts, upgrades, refinery, and relocation.
   * @param session Player session.
   * @param message Station operation payload.
   */
  station(session: Session, message: NetworkMessage): void {
    const playerData = session.data,
      stellarBody2 = STELLARS[playerData.stellar!],
      stationState = playerData.station;
    if (!stellarBody2 || session.ent) return;
    this.checkStation(playerData);
    if (message.op === 'claim') {
      if (!stellarBody2.site)
        return this.toast(
          session,
          'Find a derelict station hull to claim. They drift in systems across the galaxy.',
        );
      if (this.siteOwner(stellarBody2.id))
        return this.toast(session, 'Another captain has already claimed this hull.');
      if (stationState.site)
        return this.toast(
          session,
          `You already have a Personal Station in ${systemsById[STELLARS[stationState.site!].system].name}.`,
        );
      const first = !stationState.claimed;
      stationState.site = stellarBody2.id;
      stationState.claimed = true;
      stationState.refT = Date.now();
      this.db.world.sites[stellarBody2.id] = this.db.key(playerData.name);
      if (first) playerData.mats.alloy[0] += 1;
      this.log(
        playerData,
        `Claimed a derelict station hull in ${systemsById[stellarBody2.system].name}.${first ? ' Its last crew left an Alloy I crate aboard.' : ' Your station progress moved with you.'}`,
      );
      this.toast(session, 'This hull is yours. Start Station Tier 1 when ready.');
      this.broadcast({
        t: 'chat',
        from: '',
        msg: `${session.name} claimed a station hull in ${systemsById[stellarBody2.system].name}.`,
      });
      this.db.touch();
      this.pushSites();
      this.you(session);
      this.landed(session);
      return;
    }
    if (!this.ownSite(playerData, stellarBody2))
      return this.toast(session, 'Land at your Personal Station for that.');
    switch (message.op) {
      case 'upgrade': {
        const opsLevelDef = operationLevels[stationState.ops];
        if (!stationState.claimed || !opsLevelDef) break;
        if (playerData.credits < opsLevelDef.cost || !this.hasMats(playerData, opsLevelDef.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= opsLevelDef.cost;
        this.takeMats(playerData, opsLevelDef.mats);
        stationState.ops++;
        stationState.refT = Date.now();
        this.log(
          playerData,
          `Quantum Station reached Station Tier ${stationState.ops}: ${opsLevelDef.title}.`,
        );
        this.toast(session, `Station Tier ${stationState.ops} complete: ${opsLevelDef.unlock}.`);
        if (stationState.ops === 3)
          this.toast(
            session,
            'Newcomer protection has ended at Station Tier 3: factions across the main galaxy now treat you like any other captain.',
          );
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${session.name}'s Personal Station reached Station Tier ${stationState.ops}.`,
        });
        this.pushSites();
        break;
      }
      case 'process': {
        // ore -> material crates
        if (stationState.ops < 1) return this.toast(session, 'Build Station Tier 1 first.');
        const oreCommodity = message.id as string,
          material = ORE_PROCESS.to[oreCommodity];
        if (!material) break;
        const have = playerData.cargo[oreCommodity] || 0,
          count = Math.min(
            Math.floor(have / ORE_PROCESS.per),
            Math.floor(playerData.credits / ORE_PROCESS.cost),
            message.all ? 99 : 1,
          );
        if (count <= 0)
          return this.toast(
            session,
            `You need ${ORE_PROCESS.per} t of ${COMMODITIES.find((commodityDef) => commodityDef.id === oreCommodity)!.name} and ${credits(ORE_PROCESS.cost)} credits per crate.`,
          );
        const game = Math.min(
          4,
          ORE_PROCESS.grade[stationState.ops] + (researchBonus(stationState).processGrade || 0),
        );
        let take;
        try {
          take = planTake(
            playerData.cargo,
            playerData.cargoLots,
            oreCommodity,
            count * ORE_PROCESS.per,
            message.lots,
          );
        } catch {
          return this.toast(session, 'Those cargo grades are unavailable.');
        }
        applyTake(playerData.cargo, playerData.cargoLots, take);
        playerData.credits -= count * ORE_PROCESS.cost;
        playerData.mats[material][game] += count;
        this.toast(
          session,
          `Processed ${count * ORE_PROCESS.per} t into ${count} ${material} ${GRADES[game]} crate${count > 1 ? 's' : ''}.`,
        );
        break;
      }
      case 'collect': {
        if (!stationState.refUnits) return this.toast(session, 'The refinery has nothing ready.');
        const refUnits2 = stationState.refUnits,
          credits2 = refUnits2 * (2500 + stationState.ops * 1500);
        playerData.credits += credits2;
        stationState.refUnits = 0;
        stationState.refT = Date.now();
        const received = [];
        for (let index = 0; index < refUnits2; index++) {
          const materials = MATERIALS[Math.floor(Math.random() * 3)],
            game = Math.min(
              4,
              Math.floor(
                Math.random() * (stationState.ops >= 4 ? 4 : stationState.ops >= 2 ? 3 : 2),
              ) + (researchBonus(stationState).refineGrade && Math.random() < 0.5 ? 1 : 0),
            );
          playerData.mats[materials][game]++;
          received.push(`${materials} ${GRADES[game]}`);
        }
        this.toast(
          session,
          `Collected ${refUnits2} refinery unit${refUnits2 > 1 ? 's' : ''}: ${credits(credits2)} credits and ${received.join(', ')}.`,
        );
        break;
      }
      case 'research': {
        if (
          stationState.active ||
          ((RESEARCH.find((researchNode) => researchNode.id === message.id) || {}).needs &&
            !stationState.done.includes(
              RESEARCH.find((researchNode) => researchNode.id === message.id)!.needs!,
            ))
        ) {
          this.features.hangar.queueResearch(session, message.id as string);
          break;
        }
        const researchNode = RESEARCH.find((researchNode) => researchNode.id === message.id);
        if (
          !researchNode ||
          stationState.done.includes(researchNode.id) ||
          stationState.ops < researchNode.ops
        )
          break;
        if (playerData.credits < researchNode.cost || !this.hasMats(playerData, researchNode.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= researchNode.cost;
        this.takeMats(playerData, researchNode.mats);
        stationState.active = {
          id: researchNode.id,
          ends: Date.now() + researchNode.minutes * 60000,
        };
        this.toast(
          session,
          `Research started: ${researchNode.name} (${researchNode.minutes} minutes).`,
        );
        break;
      }
      case 'hire':
      case 'dismiss':
        return this.toast(
          session,
          'Wingmates are ships now: buy them at your station shipyard and assign them to a dock (STATION, then DOCKS).',
        ); // 2.1
      case 'unqueue':
        stationState.queue = stationState.queue!.filter((positionX) => positionX !== message.id);
        break;
      case 'defense':
        this.features.frontier.defenseUpgrade(session);
        break;
      case 'refine':
        this.features.hangar.refineUp(session, message.mat!, message.g! | 0, message.n! | 0);
        break;
      case 'refit':
        return this.toast(session, 'Refits were retired in 2.6.');
      case 'relocate': {
        // warp the station to another unclaimed hull; you ride along
        const stellarBody = STELLARS[message.site!],
          cost = relocateCost(stationState.ops),
          wait = (stationState.relocT || 0) + RELOCATE.cooldownH * 3600000 - Date.now();
        if (!stellarBody || !stellarBody.site || stellarBody.id === stationState.site)
          return this.toast(session, 'Choose an unclaimed station hull.');
        if (this.siteOwner(stellarBody.id))
          return this.toast(session, 'Another captain has claimed that hull.');
        if (wait > 0)
          return this.toast(
            session,
            `The station's warp core is recharging: ${Math.ceil(wait / 3600000)} h left.`,
          );
        if (playerData.holdout && playerData.holdout.active)
          return this.toast(session, 'Not during a Holdout.');
        if (playerData.credits < cost || !this.hasMats(playerData, RELOCATE.mats))
          return this.toast(
            session,
            `Relocating needs ${credits(cost)} credits and ${RELOCATE.mats.map(([firstValue, game]) => firstValue + ' ' + GRADES[game]).join(', ')}.`,
          );
        if (session.trade)
          this.features.coop.tradeCancel(session.trade, 'The station is warping away.');
        const from = STELLARS[stationState.site!];
        playerData.credits -= cost;
        this.takeMats(playerData, RELOCATE.mats);
        delete this.db.world.sites[stationState.site!];
        stationState.site = stellarBody.id;
        stationState.relocT = Date.now();
        this.db.world.sites[stellarBody.id] = this.db.key(playerData.name);
        playerData.stellar = stellarBody.id;
        playerData.sys = stellarBody.system;
        if (from.system !== stellarBody.system) session.retaliationVisit = undefined;
        this.log(
          playerData,
          `Warped your Personal Station from ${systemsById[from.system].name} to ${systemsById[stellarBody.system].name}. Everything came along.`,
        );
        this.toast(
          session,
          `Station warp complete: welcome to ${systemsById[stellarBody.system].name}.`,
        );
        if (!this.solo)
          this.broadcast({
            t: 'chat',
            from: '',
            msg: `${playerData.name}'s Personal Station warped from ${systemsById[from.system].name} to ${systemsById[stellarBody.system].name}. The old hull is free to claim.`,
          });
        this.pushSites();
        break;
      }
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  }

  // ------------------------------------------------------------------ chat
  /**
   * Broadcasts chat message across system, global, or Armada channels.
   * @param session Sending session.
   * @param message Chat message payload.
   */
  chat(session: Session, message: { msg: string; ch?: string }): void {
    const trim2 = String(message.msg || '')
      .slice(0, 240)
      .trim();
    if (!trim2) return;
    const currentTime = Date.now();
    if (currentTime - session.chatT < 700) return;
    session.chatT = currentTime;
    const starSystem = message.ch === 'sys',
      firstValue =
        (message.ch === 'armada' || message.ch === 'fleet') &&
        this.features.coop.armadaOf(session.data); // the fleet channel is now the Armada's
    if ((message.ch === 'armada' || message.ch === 'fleet') && !firstValue)
      return this.toast(session, 'You are not in an Armada.');
    const deaf = (session2: Session) =>
      this.features.coop.blocked && this.features.coop.blocked(session2.data, session.data.name); // blocked captains are not heard
    this.broadcast(
      {
        t: 'chat',
        from: session.name,
        msg: trim2,
        ch: firstValue ? 'armada' : starSystem ? 'sys' : 'all',
        sys: session.data.sys,
        ship: starSystem && !firstValue && session.ent?.state === 'fly' ? session.ent.id : null,
      },
      firstValue
        ? (session) => session.data.armada === firstValue.id && !deaf(session)
        : starSystem
          ? (session2) => session2.data.sys === session.data.sys && !deaf(session2)
          : (session) => !deaf(session),
    );
  }

  /**
   * Suspends and deallocates an idle space simulation when no players are present.
   * @param space Space instance to suspend.
   */
  sleep(space: SpaceSpace): void {
    for (const session of this.sessions.values())
      if (session.data?.sys === space.id) this.features.towing.detach(session);
    this.features.mining.suspendSpace(space);
    delete this.live[space.id];
  }
  // every two seconds: shuttles that have come home report in, finished research hands over to the queue
  /**
   * Periodic maintenance check per session: shuttle missions, research queue, and station ticks.
   * @param session Active session.
   */
  idleCheck(session: Session): void {
    const playerData = session.data;
    this.features.hangar.hangarInit(playerData);
    const before =
      (playerData.station.active && playerData.station.active.id) +
      '|' +
      playerData.station.queue!.length +
      '|' +
      playerData.station.done.length +
      '|' +
      playerData.station.refUnits;
    this.checkStation(playerData);
    if (
      playerData.tut != null &&
      playerData.tut < TUTORIAL.length &&
      TUTORIAL[playerData.tut].check
    )
      this.tut(session, '*check');
    let changed =
      this.features.specialists.specCheck(playerData) ||
      before !==
        (playerData.station.active && playerData.station.active.id) +
          '|' +
          playerData.station.queue!.length +
          '|' +
          playerData.station.done.length +
          '|' +
          playerData.station.refUnits;
    const currentTime = Date.now(),
      back = playerData.shuttles.filter(
        (savedShuttle) => savedShuttle.state === 'out' && currentTime >= savedShuttle.ends!,
      );
    for (const savedShuttle of back) this.features.hangar.resolveShuttle(session, savedShuttle);
    if (back.length) {
      playerData.shuttles = playerData.shuttles.filter(
        (savedShuttle) => savedShuttle.state !== 'gone',
      );
      changed = true;
    }
    if (changed) {
      this.db.touch();
      this.you(session);
    }
  }
  // ------------------------------------------------------------------ loop
  /**
   * Main server engine simulation tick loop: ticks spaces, features, and sends state snapshots.
   */
  tick(): void {
    if (this.db.economicFrozen) return;
    if (this.paused) {
      if (![...this.sessions.values()].some((session) => session.data)) this.setPaused(false);
      return;
    } // solo pause
    this.features.mining.advanceClock(1 / TICK);
    this.tickN++;
    if (this.tickN % 60 === 0)
      for (const session of this.sessions.values()) {
        if (!session.data) continue;
        const owner = this.db.key(session.data.name),
          savedRefinery = this.db.world.refinery;
        if (
          !savedRefinery?.batches.some(
            (refineryBatch) =>
              refineryBatch.owner === owner &&
              !refineryBatch.credited &&
              refineryBatch.status !== 'cancelled',
          ) &&
          !savedRefinery?.orders.some(
            (miningOrder) => miningOrder.owner === owner && miningOrder.status === 'accepted',
          )
        )
          continue;
        const data = this.features.refinery.payload(session),
          signature = JSON.stringify([
            data.batches.map((refineryBatch) => [refineryBatch.id, refineryBatch.status]),
            data.ready,
            data.orders,
          ]);
        if (signature !== session.refinerySignature) {
          session.refinerySignature = signature;
          this.send(session, { t: 'refinery', data });
        }
      }

    if (this.tickN % (TICK * 2) === 0) {
      for (const session of this.sessions.values())
        if (session.data) {
          this.idleCheck(session);
          this.features.fronts.missionIdle(session);
          this.features.syndicate.missionDeadlines(session);
          this.features.quests.questSweep(session);
          this.features.quests.questSalvageIdle(session);
          this.features.syndicate.bankTick(session);
          this.features.frontier.raidCheck(session);
          this.features.specialists.specIdle(session);
          this.features.hostile.holdoutTick(session);
        }
      this.features.fronts.invasionTick();
      this.features.frontier.waveTick();
      this.features.frontier.arenaTick();
      this.features.coop.coopTick();
      this.hails.tick();
    }
    if (this.tickN % (TICK * 20) === 0) {
      this.features.rivals.rivalsTick();
      this.features.living.livingTick();
    } // system states come and go   // 1.1: rival careers, news, market flashes, hired guns
    if (this.tickN % (TICK * 2) === 1)
      for (const space of Object.values(this.live))
        if (space.players > 0) this.features.rivals.rivalSync(space);
    if (this.tickN % (TICK * 30) === 0) {
      const worldPayload2 = this.features.world.worldPayload(),
        stringify2 = JSON.stringify([
          worldPayload2.anomalies,
          worldPayload2.event!.id,
          worldPayload2.states,
        ]);
      if (stringify2 !== this.worldKey) {
        this.worldKey = stringify2;
        this.broadcast(worldPayload2);
      }
    }
    // Docked observers keep the real system awake without a player entity.
    const observed = new Set();
    for (const session of this.sessions.values())
      if (session.data?.stellar && STELLARS[session.data.stellar]) {
        observed.add(session.data.sys);
        void this.spaces[session.data.sys];
      }
    for (const space of Object.values(this.live)) {
      const safeTick = () => {
        try {
          space.tick();
        } catch (event) {
          space.errs = (space.errs || 0) + 1;
          if (space.errs < 5) console.error('space tick error', space.id, event);
        }
      };
      if (space.players > 0 || observed.has(space.id)) {
        space.quietT = 0;
        safeTick();
      } else if (this.tickN % 15 === 0) {
        safeTick();
        space.quietT = (space.quietT || 0) + 15 / TICK;
        if (space.quietT > 120 && !space.keep) this.sleep(space);
      }
    }
    if (this.tickN % 2) return;
    const bySystem: Record<string, Session[]> = {};
    for (const session of this.sessions.values())
      if (session.data && (session.ent || observed.has(session.data.sys)))
        (bySystem[session.data.sys] = bySystem[session.data.sys] || []).push(session);
    for (const [starSystem, list] of Object.entries(bySystem)) {
      const spaceSnapshot = this.spaces[starSystem].snapshot();
      for (const session of list) {
        const entity = session.ent;
        if (!entity) {
          this.send(session, {
            t: 'scene',
            sys: starSystem,
            ...spaceSnapshot,
            miningRocks: this.features.mining.rocksPayload(this.spaces[starSystem]),
          });
          continue;
        }
        this.send(
          session,
          JSON.stringify({
            t: 'snap',
            ...spaceSnapshot,
            attention: attentionPayload(session, this.spaces[starSystem]),
            miningRocks: this.features.mining.rocksPayload(this.spaces[starSystem]),
            mining: this.features.mining.payload(session, this.spaces[starSystem]),
            industrial: this.features.industrial.payload(session),
            towing: this.features.towing.payload(session),
            miningPressure: this.features.pressure.payload(session),
            miningHazards: this.features.pressure.hazards(starSystem),
            combat: this.combatAssist.payload(session, this.spaces[starSystem]),
            formation: !!session.armadaFormationTarget,
            me: [
              entity.id,
              entity.seq || 0,
              +entity.x.toFixed(2),
              +entity.y.toFixed(2),
              +entity.vx.toFixed(2),
              +entity.vy.toFixed(2),
              +entity.a.toFixed(4),
              Math.round(entity.shield),
              Math.round(entity.armor),
              Math.round(entity.fuel),
              entity.target ? entity.target.id : 0,
              entity.guns
                .filter((weaponMount) => weaponMount.ammo !== Infinity)
                .map((weaponMount) => [weaponMount.w, weaponMount.ammo]),
            ],
          }),
        );
      }
    }
    for (const space of Object.values(this.live)) if (!bySystem[space.id]) space.events = [];
  }
}
