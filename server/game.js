import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { commodityCargoTonnes, reservedCargoTonnes } from '../shared/ship-capacity.ts';
import { createPortService } from './port-services.js';
import { discoverRadio } from './radio-discovery.js';
import { createJobService } from './jobs.js';
import { beginEconomyTrip, arriveEconomyTrip, economyReceipt } from '../shared/economy-receipt.js';
import {
  migrateCargoLots,
  planTake,
  applyTake,
  addLots,
  clearLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.js';
import { clampStanding } from '../shared/reputation.js';
/**
 * @typedef {import('./space.js').Entity} Entity
 *
 * @typedef {object} PlayerInput
 * @property {boolean} [navigation] Automatic navigation input.
 * @property {number} seq Sequence number.
 * @property {number} thrust Forward thrust control.
 * @property {number} turn Rotational turn steering.
 * @property {number} ab Afterburner boost flag.
 * @property {number} rev Reverse thrusters flag.
 * @property {number} fire1 Primary weapon fire flag.
 * @property {number} fire2 Secondary weapon fire flag.
 *
 * @typedef {object} PlayerData
 * @property {EconomyReceipt} [economyReceipt] Recent trip cash flow; never a source of credits.
 * @property {SavedSurvey} [miningSurvey]
 * @property {Record<string,number>} [bp] Specialist blueprint fragments.
 * @property {string} name Captain name.
 * @property {number} credits Balance in credits.
 * @property {string} sys Current solar system ID.
 * @property {string|null} [stellar] Docked stellar or null while flying.
 * @property {string} [shipUid] Unique identifier for player ship.
 * @property {ShipLoadout} ship Current active ship loadout.
 * @property {Record<string, number>} [cargo] Cargo inventory mapping commodity ID to tons.
 * @property {Record<string, number>} [rep] Reputation standings per faction.
 * @property {Record<string, number>} [tokens] Faction tokens balances.
 * @property {Record<string, number[]>} [mats] Crafting materials inventory grades.
 * @property {StationState} [station] Personal station state and research tree.
 * @property {Array<{ship: ShipLoadout, escorts?: Array<{ship: ShipLoadout}>}>} [dock] Personal station stored ships.
 * @property {Array<{id: string, name: string, hull: number, busyUntil?: number}>} [shuttles] Station shuttle fleet.
 * @property {Array<OfficerRecord>} [officers] Station officer roster.
 * @property {Record<string, string>} [bridge] Bridge officer assignments.
 * @property {Record<string, number | string | boolean>} [arcs] Story arc states.
 * @property {string[]} [radioStations] Discovered radio station IDs.
 * @property {Record<string, QuestRecord | number | boolean>} [quests] Active and completed missions.
 * @property {Record<string, number | string | boolean>} [syn] Syndicate operations progression.
 * @property {Record<string, number | string | boolean>} [spec] Specialist career progression.
 * @property {Record<string, number | string | boolean>} [fronts] Frontline goals and token progress.
 * @property {Record<string, number>} [stats] Lifetime combat and trading stats.
 * @property {string | number} [armada] Armada group identifier if joined.
 * @property {boolean} [armadaFollow] Whether following armada leader.
 * @property {number} [ops] Operations level.
 * @property {number} [nextUid] Monotonic counter for IDs.
 * @property {number} [saveTime] Timestamp of last save.
 *
 * @typedef {object} Session
 * @property {number} id Unique session ID.
 * @property {EventEmitter & {send: (data: string | Buffer | Uint8Array | NetworkMessage) => void, close: () => void, open: boolean, backlog: number}} sock Client WebSocket connection.
 * @property {string} ip Remote client IP address.
 * @property {PlayerData} data Player account save data from DB.
 * @property {Entity | null} ent Currently active ship entity in space, or null if docked.
 * @property {PlayerInput[]} inputs Pending input commands queue.
 * @property {PlayerInput | null} [lastInput] Most recent input processed.
 * @property {string | null} name Captain name.
 * @property {number} chatT Timestamp of last chat message sent.
 * @property {number} msgs Number of messages received in current rate-limiting window.
 * @property {number} msgT Timestamp start of current rate-limiting window.
 * @property {number} [actT] Timestamp of last user activity.
 * @property {number} [loginT] Timestamp when user logged in.
 * @property {boolean} [isNew] Whether this account was newly created during login.
 * @property {CombatState} [combat] Combat assist state for this session.
 * @property {number} [fullT] Timestamp of last cargo-full notification.
 *
 * @typedef {object} PlayerReference
 * @property {number} id Session ID.
 * @property {string} name Captain name.
 * @property {Record<string, number>} rep Faction reputation map.
 * @property {PlayerInput[]} inputs Input commands queue.
 * @property {PlayerInput | null} [lastInput] Last processed input.
 * @property {Session} s Reference to the parent session.
 *
 * @typedef {object} SpaceSystem
 * @property {string} id Unique system ID (e.g. 'sol', 'meridian').
 * @property {string} name Display name of the system.
 * @property {number} x Coordinate on galaxy map.
 * @property {number} y Coordinate on galaxy map.
 * @property {number} danger Danger level (0-5).
 * @property {string[]} links Connected hyperlanes system IDs.
 * @property {string} faction System controlling faction ID.
 * @property {StellarBody[]} stellars Planets, stations, sites, and wormholes in this system.
 * @property {boolean} [farside] True if located on the far side of the Sol Gateway.
 * @property {boolean} [arena] True if this is a combat arena system.
 * @property {boolean} [anchor] True if anchor system for exploration.
 * @property {boolean} [gate] True if system contains a wormhole or gateway.
 * @property {Array<{x: number, y: number, r: number, ore: string, rich: number, rocks: number,minor?:boolean,industrial?:boolean}>} [fields] Mining asteroid fields.
 *
 * @typedef {object} StellarBody
 * @property {string} id Stellar identifier.
 * @property {string} name Stellar display name.
 * @property {string} [type] Type of stellar ('planet', 'station', 'site', 'wormhole').
 * @property {number} x Position X in system.
 * @property {number} y Position Y in system.
 * @property {number} r Radius of body.
 * @property {string} svc Service flags string ('L' for land, 'T' for trade, 'Y' for shipyard, 'O' for outfitter, 'B' for bar/bounty, etc.).
 * @property {string} system System ID where this stellar is located.
 * @property {number} [tech] Tech level available for purchase.
 * @property {boolean} [site] True if this is a derelict/claimable Personal Station site.
 * @property {boolean} [hub] True if this is the central hub station (Quantum Station).
 * @property {boolean} [outlaw] True if outlaw haven with no reputation restrictions.
 * @property {Record<string, number>} [prices] Custom commodity price overrides.
 * @property {string} [wormhole] Destination system ID for wormhole transit.
 * @property {string} [exit] Destination stellar ID for wormhole transit.
 *
 * @typedef {object} MarketItem
 * @property {string} id Commodity ID.
 * @property {string} name Commodity display name.
 * @property {number | null} price Unit price in credits, or null if not traded.
 * @property {number} [sellCap] Remaining finite Composite Plating buyer tonnes for this port/day.
 * @property {boolean} [flash] Whether a temporary flash market price is active.
 * @property {number} [moved] Percentage price shift due to system state or trade volume.
 *
 * @typedef {object} Mission
 * @property {string} id Unique mission ID.
 * @property {{stops: string[], stop: number}} [radioTour] Saved five-stop passenger tour.
 * @property {string} type Mission type ('cargo', 'bounty', 'patrol', 'supply', 'smuggle', 'assassinate', 'quest', 'warband').
 * @property {string} title Mission display title.
 * @property {string} sys Target system ID.
 * @property {string} [dest] Destination stellar ID for delivery/landing.
 * @property {string} [cid] Commodity ID to transport.
 * @property {number} [qty] Quantity of cargo/passengers.
 * @property {number} [pax] Number of passengers.
 * @property {number} [need] Target kill count needed for patrol.
 * @property {number} [got] Current kill count achieved for patrol.
 * @property {number} [hull] Target ship hull ID.
 * @property {string} [faction] Target faction ID.
 * @property {string} [targetName] Target NPC name for bounty.
 * @property {number} reward Payout upon completion in credits.
 * @property {string} text Narrative brief/description.
 * @property {boolean} [done] Whether mission objectives are fulfilled.
 * @property {boolean} [paid] Whether payout has been disbursed.
 * @property {number} [owner] Session ID of mission contractor.
 * @property {number} [taken] Timestamp when accepted.
 * @property {number} [deadline] Timestamp deadline if time-sensitive.
 * @property {number} [rush] Duration in minutes if rush delivery.
 * @property {QuestRecord} [quest] Linked quest metadata.
 * @property {boolean} [elite] True for elite dangerous bounties.
 * @property {boolean} [spawned] True if bounty target is currently spawned in-system.
 *
 * @typedef {object} SaveSlotSummary
 * @property {string} name Captain name.
 * @property {string} ship Current ship name.
 * @property {number} credits Balance in credits.
 * @property {number} ops Personal Station Tier.
 * @property {string} sys Current system name.
 *
 * @typedef {object} CommunityPayload
 * @property {string[]} docked Names of captains currently docked at Quantum Station.
 * @property {Array<{name: string, earned: number, kills: number, ship: string, ai?: boolean}>} top Leaderboard of top earners.
 * @property {Array<{system: string, owner: string | null, ops: number}>} stations List of claimable station hulls and their owners.
 * @property {Array<{name: string, sys: string}>} online Captains currently online and their systems.
 *
 * @typedef {object} ShipStats
 * @property {number} shield Maximum shield capacity.
 * @property {number} shieldRe Shield recharge rate per second.
 * @property {number} armor Maximum armor / hull points.
 * @property {number} [armorRe] Armor repair rate per second.
 * @property {number} maxSpeed Maximum forward speed.
 * @property {number} accel Acceleration rating.
 * @property {number} turn Turn rate in radians per second.
 * @property {number} cargo Cargo capacity in metric tons.
 * @property {number} free Unallocated outfit mass / space.
 * @property {number} fuel Fuel capacity for hyperjumps.
 * @property {number} [fuelRe] Fuel ramscoop regeneration rate.
 * @property {number} size Collision bounding radius.
 * @property {number} mass Total ship mass.
 * @property {Record<number, number>} weapons Installed weapon mount counts by weapon ID.
 * @property {number} guns Forward gun mount count.
 * @property {number} maxGuns Maximum gun mounts.
 * @property {number} turrets Turret mount count.
 * @property {number} maxTurrets Maximum turret mounts.
 * @property {boolean} [jumpFast] Fast jump drive charge capability.
 */

import { HailService } from './hail-service.js';
import { CombatAssist } from './combat-assist.js';
import { createGameMessageHandlers } from './game-message-handlers.js';
import { createFeatures } from './features.js';
import { TUTORIAL, tutMigrate, TUT_VERSION } from '../shared/tutorial.js';
import fs from 'node:fs';
// Quantum Rift game server: sessions, the galaxy's systems, landing services, missions, Quantum Station.
import {
  SYSTEMS,
  SYS,
  STELLARS,
  FACTIONS,
  COMMODITIES,
  MATERIALS,
  GRADES,
  START,
  EXTRA_OUTFITS,
  OPS,
  RESEARCH,
  REFINERY,
  ORE_PROCESS,
  RELOCATE,
  relocateCost,
  SITES,
} from '../shared/galaxy.js';
import {
  augmentAssets,
  shipStats,
  researchBonus,
  price,
  allOutfits,
  makeLoadout,
  K,
  DT,
  TICK,
  angleTo,
  credits,
} from '../shared/rules.js';
import { Space } from './space.js';
import { synTier } from '../shared/syndicate.js';
import { STATES, TRADE_IMPACT } from '../shared/living.js';
import { ARCS } from '../shared/arcs.js';
/**
 * Resolves the display name for a faction story arc.
 * @param {string} f Faction identifier.
 * @returns {string} Story arc title.
 */
const ARCS_NAME = (f) => (ARCS[f] ? ARCS[f].name : '');
import { masteryTier } from '../shared/frontier.js';
import { SHUTTLES } from '../shared/hangar.js';
import { SPEC } from '../shared/specialty.js';
import { captainBonus } from '../shared/rules.js';
import { passengerSeats, occupiedPassengerSeats } from '../shared/passengers.js';

/** @import { GradeLots } from '../shared/cargo-contracts.js' */
/** @import { EconomyReceipt } from '../shared/economy-receipt.js' */
/** @import { QuestRecord } from '../shared/quests.js' */
/** @import { GameAssets, OfficerRecord, OutfitAsset, ShipLoadout, StationState } from '../shared/rules.js' */
/** @import { CombatAssist as CombatAssistCombatAssist, CombatState } from './combat-assist.js' */
/** @import { CommandSession } from './contracts.js' */
/** @import { DB } from './db.js' */
/** @import { FeatureServices } from './features.js' */
/** @import { MessageCapabilities } from './game-message-handlers.js' */
/** @import { JobCapabilities, JobService } from './jobs.js' */
/** @import { MessageRegistry, NetworkMessage } from './message-registry.js' */
/** @import { SavedSurvey } from './mining-contracts.js' */
/** @import { PortCapabilities, PortService } from './port-services.js' */
/** @import { LootItem, Space as SpaceSpace } from './space.js' */
/** @import { EventEmitter } from 'node:events' */

const galaxyGraph = new GalaxyGraph(SYS);

/**
 * Quantum Rift master game engine.
 * Manages player accounts, client network sessions, world and system state,
 * trade markets, mission boards, station management, and game loops.
 * @property {GameAssets} A Game assets object containing ships, weapons, outfits, and commodities.
 * @property {DB} db Persistent JSON database instance for player accounts and world state.
 * @property {Record<string | number, OutfitAsset>} O Outfit definitions lookup by ID.
 * @property {Record<string, SpaceSpace>} spaces Active simulated spaces by system ID, backed by live proxy.
 * @property {Map<number, Session>} sessions Connected client sessions by session ID.
 * @property {number} nextSid Next session identifier sequence number.
 * @property {number} tickN Server tick counter.
 * @property {Record<string, SpaceSpace>} live Cache of currently instantiated systems.
 * @property {FeatureServices} features Modular feature service delegations.
 * @property {JobService} jobService Ordinary job board, acceptance and completion owner.
 * @property {PortService} portService Ordinary market, material, shipyard and outfitter owner.
 * @property {CombatAssistCombatAssist} combatAssist Combat assist controller.
 * @property {MessageRegistry} messageHandlers Registered client message handlers.
 * @property {Map<string, {n: number, t: number}>} fails Failed sign-in attempt tracking map.
 * @property {boolean} paused Solo-mode pause flag.
 * @property {number} [pausedAt] Timestamp when solo mode was paused.
 * @property {number} [tickErr] Error count during server ticks.
 * @property {string} [worldKey] Cache key for deduplicating world status broadcasts.
 */
export class Game {
  /** Legacy feature state; see docs/FEATURES.md. @type {Record<string, string> | undefined} */
  _an;
  /** Legacy feature state; see docs/FEATURES.md. @type {number | undefined} */
  _anW;
  /** Legacy feature state; see docs/FEATURES.md. @type {{sys: string, boss: {name: string, hull: number}, until: number, ent: Entity, sp: SpaceSpace} | null | undefined} */
  invasion;
  /** Legacy feature state; see docs/FEATURES.md. @type {number | undefined} */
  lastInvWin;
  /** Legacy feature state; see docs/FEATURES.md. @type {Record<string, number[]> | undefined} */
  arenaQ;
  /** Legacy feature state; see docs/FEATURES.md. @type {Record<string, {id: string, sys: string, t: number, a: string, b: string}> | undefined} */
  matches;
  /** Legacy feature state; see docs/FEATURES.md. @type {number | undefined} */
  nextMatch;
  /** Legacy feature state; see docs/FEATURES.md. @type {Record<string, {wave: number, until: number, count: number}> | undefined} */
  waves;
  /** Legacy feature state; see docs/FEATURES.md. @type {Map<string, {sys: string, id: number}> | undefined} */
  rivalEnts;
  /** Legacy feature state; see docs/FEATURES.md. @type {boolean | undefined} */
  _livingStarted;
  /** Legacy feature state; see docs/FEATURES.md. @type {string[] | undefined} */
  _mkt;
  /** Legacy feature state; see docs/FEATURES.md. @type {Record<string, {a: string, b: string, start: number, sys: string}> | undefined} */
  duels;
  /** Legacy feature state; see docs/FEATURES.md. @type {Record<string, {from: string, to: string, offer: Record<string, number>, want: Record<string, number>}> | undefined} */
  trades;
  /** Legacy feature state; see docs/FEATURES.md. @type {number | undefined} */
  nextCoopId;
  /** Legacy feature state; see docs/FEATURES.md. @type {boolean | undefined} */
  solo;
  /**
   * Initializes the game server, assets, storage, features, and tick loop.
   * @param {GameAssets} assets Game assets object containing ships, weapons, outfits, and commodities.
   * @param {DB} database Persistent JSON database instance for player accounts and world state.
   */
  constructor(assets, database) {
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
    const live = (this.live = {});
    this.spaces = new Proxy(live, {
      get: (t, k) =>
        t[k] ||
        (typeof k === 'string' && SYS[k] ? this.wake((t[k] = new Space(this, k))) : undefined),
    });
    /** @type {FeatureServices} */
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
    setInterval(() => {
      try {
        this.tick();
      } catch (e) {
        this.tickErr = (this.tickErr || 0) + 1;
        if (this.tickErr < 20 || this.tickErr % 500 === 0)
          console.error('tick error', this.tickErr, e);
      }
    }, 1000 / TICK); // one bad ship never takes the server down
  }

  // solo mode: save slots and save files
  /**
   * Summarizes all stored player saves for solo slot selection.
   * @returns {SaveSlotSummary[]} Array of save summaries.
   */
  slots() {
    return Object.values(this.db.players).map((p) => ({
      name: p.name,
      ship: this.A.ships[p.ship.hull] ? this.A.ships[p.ship.hull].name : '?',
      credits: p.credits,
      ops: p.station ? p.station.ops : 0,
      sys: SYS[p.sys] ? SYS[p.sys].name : '',
    }));
  }
  /**
   * Imports an external save file object into the database.
   * @param {PlayerData} playerData Raw save object to import.
   * @returns {string} Sanitized name of imported captain.
   */
  importSave(playerData) {
    if (
      !playerData ||
      typeof playerData.name !== 'string' ||
      !playerData.ship ||
      !playerData.station
    )
      throw new Error('That is not a Quantum Rift save file.');
    const name = playerData.name.trim().slice(0, 20);
    if (!/^[A-Za-z0-9 _'-]{3,20}$/.test(name)) throw new Error('Bad captain name in the save.');
    for (const o of this.sessions.values())
      if (o.data && o.data.name.toLowerCase() === name.toLowerCase())
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
    const p = this.db.create(name, 'solo', {});
    for (const k of Object.keys(imported))
      if (!['__proto__', 'constructor', 'prototype', 'salt', 'hash'].includes(k))
        p[k] = imported[k];
    p.name = name;
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
   * @param {SpaceSpace} space Newly awakened space instance.
   * @returns {SpaceSpace} The space instance.
   */
  wake(space) {
    return space;
  }
  // Seed accounts are created on startup. sync:true explicitly upgrades existing saves;
  // sync:'create' applies the same setup only once, without resetting a saved captain.
  /**
   * Populates showcase and developer seed accounts defined in seeds.json.
   * @returns {void}
   */
  seed() {
    let list = [];
    try {
      list = JSON.parse(
        fs.readFileSync(process.env.SEEDS_FILE || new URL('./seeds.json', import.meta.url), 'utf8'),
      );
    } catch {
      return;
    }
    for (const c of list) {
      if (c.retire && c.name) {
        this.retireAccount(c.name);
        continue;
      } // retired seed accounts are removed, and their holdings freed
      if (!c.name || !c.pass) continue;
      const have = this.db.get(c.name);
      if (have) {
        if (c.sync === true) this.syncSeed(have, c);
        continue;
      }
      const site = c.station?.fallback
        ? [c.station.site, ...SITES.map((stellarBody) => stellarBody.id)].find(
            (id) => STELLARS[id]?.site && !this.siteOwner(id),
          )
        : c.station?.site;
      if (c.station?.fallback && !site) {
        console.warn(`Cannot create seeded captain ${c.name}: no unclaimed station hull.`);
        continue;
      }
      const playerData = this.fresh();
      playerData.tut = c.tutorial ? 0 : TUTORIAL.length; // seeded veterans skip the tutorial
      playerData.explored = SYSTEMS.filter((x) => x.anchor).map((x) => x.id);
      if (c.credits !== undefined) playerData.credits = c.credits;
      if (c.rep) Object.assign(playerData.rep, c.rep);
      if (c.extra) Object.assign(playerData, JSON.parse(JSON.stringify(c.extra))); // test seeds can set standing, Syndicate points, commendations...
      if (c.ship) playerData.ship = makeLoadout(this.A, c.ship, c.shipName || 'Rift Runner');
      if (c.outfits)
        for (const [o, n] of Object.entries(c.outfits))
          playerData.ship.outfits[o] = (playerData.ship.outfits[o] || 0) + n;
      if (c.station) {
        const st = playerData.station;
        st.claimed = true;
        st.ops = c.station.ops || 0;
        st.refT = Date.now();
        if (c.station.research === 'all') st.done = RESEARCH.map((r) => r.id);
        if (site && STELLARS[site] && !this.siteOwner(site)) {
          st.site = site;
          this.db.world.sites[site] = this.db.key(c.name);
        }
      }
      if (c.mats) for (const m of MATERIALS) playerData.mats[m] = c.mats.slice();
      if (c.system && SYS[c.system]) {
        playerData.sys = c.system;
        playerData.stellar = c.stellar || playerData.stellar;
      }
      if (c.station?.fallback && site) {
        playerData.sys = STELLARS[site].system;
        playerData.stellar = site;
      }
      const p = this.db.create(c.name, c.pass, playerData);
      this.log(p, c.log || 'Arrived in the Rift.');
      if (c.sync) this.syncSeed(p, c);
      if (c.storedShips === 'specialists') {
        this.features.specialists.specInit(p);
        this.features.docks.docksInit(p);
        for (const sp of Object.values(SPEC)) {
          const ship = makeLoadout(this.A, sp.id, sp.name);
          ship.uid = this.features.docks.shipUid(p);
          p.dock.push({ ship, bridge: {} });
          p.specState[sp.id] = { tier: 1, comp: {} };
        }
      }
      console.log('Created seeded captain', c.name);
    }
    this.db.touch();
    this.db.flush();
  }
  // "sync": true keeps a showcase captain's station fully upgraded across new versions (every research project done,
  // Station Tier 5, a full hangar and, if listed, an elite bridge crew). Credits, ships and cargo are left alone.
  /**
   * Retires an account, disconnecting active sessions and freeing claimed stations and colonies.
   * @param {string} name Captain name of the account to retire.
   * @returns {void}
   */
  retireAccount(name) {
    const k = this.db.key(name),
      p = this.db.get(name);
    if (!p) return;
    for (const o of this.sessions.values())
      if (o.data === p) {
        try {
          o.sock.close();
        } catch {}
      }
    const W = this.db.world;
    for (const [site, owner] of Object.entries(W.sites || {}))
      if (owner === k) delete W.sites[site]; // the station hull is a derelict again
    for (const [id, c] of Object.entries(W.colonies || {}))
      if (c.owner === k) delete W.colonies[id];
    if (Array.isArray(W.orders)) W.orders = W.orders.filter((o) => o.owner !== p.name);
    if (this.features.coop.armadaForget) this.features.coop.armadaForget(p.name); // 2.6
    delete this.db.players[k];
    this.db.touch();
    this.db.flush();
    console.log(`Retired seeded captain ${p.name}; their station hull is unclaimed again.`);
  }
  /**
   * Synchronizes a showcase captain's station, officers, and progress to version spec.
   * @param {PlayerData} playerData Player save record.
   * @param {{station?: {ops?: number, research?: string}, ships?: Array<{hull: number}>}} c Seed definition configuration.
   * @returns {void}
   */
  syncSeed(playerData, c) {
    this.features.hangar.hangarInit(playerData);
    const st = playerData.station,
      want = c.station || {};
    st.claimed = true;
    st.ops = Math.max(st.ops || 0, want.ops || 5);
    if (want.research === 'all') {
      st.done = RESEARCH.map((r) => r.id);
      st.active = null;
      st.queue = [];
    }
    if (!st.site && want.site && STELLARS[want.site] && !this.siteOwner(want.site)) {
      st.site = want.site;
      this.db.world.sites[want.site] = this.db.key(playerData.name);
    }
    if (want.shuttles === 'all')
      for (const kind of Object.keys(SHUTTLES))
        if (
          !playerData.shuttles.some((x) => x.kind === kind) &&
          playerData.shuttles.length < this.features.hangar.bays(playerData)
        )
          playerData.shuttles.push({
            id: this.features.hangar.uid(playerData),
            kind,
            state: 'idle',
            crew: null,
            runs: 0,
          });
    if (c.officers && !playerData.officers.some((officer) => officer.seed))
      for (const [i, o] of c.officers.entries()) {
        const off = {
          id: this.features.hangar.uid(playerData),
          seed: true,
          name: o.name,
          race: o.race,
          role: o.role,
          rarity: o.rarity ?? 3,
          lv: o.lv || 10,
          xp: 0,
        };
        playerData.officers.push(off);
        if (o.slot) playerData.bridge[o.slot] = off.id;
      }
    if (c.mats)
      for (const m of MATERIALS)
        playerData.mats[m] = playerData.mats[m].map((n, g) => Math.max(n, c.mats[g]));
    playerData.tut = TUTORIAL.length; // showcase captains skip the career guide
    if (c.storyPass) {
      this.features.story.storyInit(playerData);
      playerData.story.pass = true;
    }
    if (c.blueprints) {
      playerData.bp = playerData.bp || {};
      for (const id of Object.keys(SPEC))
        playerData.bp[id] = Math.max(playerData.bp[id] || 0, c.blueprints);
    }
    if (c.fleet && !playerData.seedFleet) this.seedFleet(playerData, c.fleet);
    console.log('Synced seeded captain', c.name);
  }
  // 2.1 playtest seeds: fill the docks with ships and crew them, once ({ docks: [{ lead, name, wings: [hulls] }], crew: [...officers], spare: [...officers] })
  /**
   * Sets up a test seed captain's docks with ships, wingmates, and officers.
   * @param {PlayerData} playerData Player save record.
   * @param {{docks?: Array<{lead?: number, name?: string, wings?: number[]}>, crew?: Array<{role: string, rarity: string, lv?: number}>, spare?: Array<{role: string, rarity: string, lv?: number}>}} F Seed fleet configuration with docks, crew, and ships.
   * @returns {void}
   */
  seedFleet(playerData, F) {
    this.features.docks.docksInit(playerData);
    playerData.seedFleet = true;
    const crew = [...(F.crew || [])],
      newOff = (o) => {
        const off = {
          id: this.features.hangar.uid(playerData),
          seed: true,
          name: o.name,
          race: o.race,
          role: o.role,
          rarity: o.rarity ?? 2,
          lv: o.lv || 10,
          xp: 0,
        };
        playerData.officers.push(off);
        return off.id;
      };
    (F.docks || []).forEach((D, i) => {
      if (i >= playerData.docks.length) return;
      if (D.lead) {
        const ship = makeLoadout(this.A, D.lead, D.name || this.A.ships[D.lead].name);
        ship.uid = this.features.docks.shipUid(playerData);
        if (i === playerData.activeDock) {
          playerData.ship = ship;
          playerData.shipless = false;
          playerData.docks[i].lead = ship.uid;
        } // a test account: the old ship is simply replaced
        else {
          playerData.dock.push({ ship, bridge: {} });
          playerData.docks[i].lead = ship.uid;
        }
      }
      playerData.docks[i].wings = (D.wings || []).map((h) => {
        const ship = makeLoadout(this.A, h, this.A.ships[h].name);
        ship.uid = this.features.docks.shipUid(playerData);
        playerData.dock.push({ ship, bridge: {} });
        const cap = crew.length ? newOff(crew.shift()) : null,
          mate = crew.length ? newOff(crew.shift()) : null;
        return { uid: ship.uid, cap, crew: mate };
      });
    });
    for (const o of F.spare || []) newOff(o);
    this.features.docks.docksInit(playerData);
  }
  // ------------------------------------------------------------------ sessions
  /**
   * Creates a fresh default captain save state with starter ship, credits, and tutorial.
   * @returns {PlayerData} Fresh initial player save state.
   */
  fresh() {
    const rep = Object.fromEntries(Object.keys(FACTIONS).map((f) => [f, 0]));
    rep.quantum = 10;
    return {
      credits: START.credits,
      sys: START.system,
      stellar: START.stellar,
      ship: makeLoadout(this.A, START.ship, 'Rift Runner'),
      cargo: {},
      cargoLots: { version: 1, byCommodity: {} },
      storage: {},
      storageLots: { version: 1, byCommodity: {} },
      mats: Object.fromEntries(MATERIALS.map((m) => [m, [0, 0, 0, 0, 0]])),
      rep,
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
   * @param {ClientSocket} sock WebSocket client connection.
   * @param {string} [ip='?'] Remote client IP address.
   * @returns {void}
   */
  connect(sock, ip = '?') {
    const s = {
      id: this.nextSid++,
      sock,
      ip,
      data: null,
      ent: null,
      inputs: [],
      lastInput: null,
      name: null,
      chatT: 0,
      msgs: 0,
      msgT: Date.now(),
    };
    this.sessions.set(s.id, s);
    sock.on('message', (m) => {
      try {
        this.onMessage(s, JSON.parse(m));
      } catch (e) {
        console.error('message error', e);
      }
    });
    sock.on('close', () => this.disconnect(s));
  }
  /**
   * Disconnects and unregisters a client session, saving flight state and docking in-system.
   * @param {Session} session Session disconnecting.
   * @returns {void}
   */
  disconnect(session) {
    if (session.data) this.features.towing.detach(session);
    if (session.data) this.features.industrial.stop(session);
    if (session.data && this.sessions.has(session.id)) this.features.coop.coopLogout(session); // duels, trades, presence
    this.sessions.delete(session.id);
    for (const q of Object.values(this.arenaQ || {})) {
      const i = q.indexOf(session.id);
      if (i >= 0) q.splice(i, 1);
    }
    if (session.data && this.matches && this.matches[session.data.sys]) {
      this.matches[session.data.sys].alive.delete(session.data.name);
      session.data.stellar = session.data.arenaReturn || 'qstation';
    }
    if (session.ent) {
      const playerData = session.data,
        sp = this.spaces[playerData.sys],
        entity = session.ent;
      this.dropEscorts(sp, entity);
      sp.remove(entity);
      sp.players--;
      session.ent = null;
      // logging off in space: you are docked at the nearest world in the same system, or back at your last landing
      const here = SYS[playerData.sys].stellars
        .filter(
          (stellarBody) =>
            stellarBody.svc.includes('L') &&
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
      if (this.solo && ![...this.sessions.values()].some((x) => x.data)) this.setPaused(false);
      this.db.touch();
      this.db.flush(); // Commit the final dock/flight state before a deliberate account switch.
      if (!this.solo)
        this.broadcast({ t: 'chat', from: '', msg: `${session.name} left the Rift.` });
    }
  }
  /**
   * Sends a message payload to a client session if socket is open and backlog is acceptable.
   * @param {Session | CommandSession} session Destination session.
   * @param {string | NetworkMessage} message Message object or string to send.
   * @returns {void}
   */
  send(session, message) {
    if ('sock' in session && session.sock && session.sock.open && session.sock.backlog < 4e6)
      session.sock.send(message);
  }
  /**
   * Sends a transient toast banner message to the player's UI.
   * @param {Session | CommandSession} session Recipient session.
   * @param {string} msg Notification banner message text.
   * @returns {void}
   */
  toast(session, msg) {
    this.send(session, { t: 'toast', msg });
  }
  /**
   * Broadcasts a JSON message to all authenticated sessions matching an optional predicate.
   * @param {string | NetworkMessage} message Message payload to broadcast.
   * @param {((s: Session) => boolean)} [filter] Optional predicate to filter sessions.
   * @returns {void}
   */
  broadcast(message, filter) {
    const str = JSON.stringify(message);
    for (const s of this.sessions.values()) if (s.data && (!filter || filter(s))) this.send(s, str);
  }
  /**
   * Legacy reputation getter.
   * @returns {null}
   */
  get rep() {
    return null;
  }
  /**
   * Sends full updated player state ('you' packet) to client session.
   * @param {Session | CommandSession} session Player session.
   * @returns {void}
   */
  you(session) {
    const d = session.data;
    this.features.docks.docksInit(d);
    this.checkStation(d);
    const st = this.features.shipStats.stats(d);
    this.send(session, {
      t: 'you',
      d: {
        name: d.name,
        credits: d.credits,
        sys: d.sys,
        stellar: d.stellar,
        ship: d.ship,
        cargo: d.cargo,
        cargoLots: structuredClone(d.cargoLots),
        paid: d.paid || {},
        economyReceipt: economyReceipt(d),
        radioStations: discoverRadio(this, session),
        mats: d.mats,
        rep: d.rep,
        shipless: !!d.shipless,
        docks: this.features.docks.docksPayload(d),
        newcomer: this.newcomer(d),
        arcs: this.features.arcs.arcsPayload(d),
        expd: d.expd || { n: 0 },
        rank: this.features.fleetcmd.rankOf(d),
        syn: synTier(d.syn),
        shards: d.shards || 0,
        lower: d.lower || [],
        loan: d.loan || null,
        credit: d.credit || 600,
        missions: d.missions,
        refinery: this.features.refinery.payload(session),
        industrial: this.features.industrial.payload(session),
        towing: this.features.towing.payload(session),
        escorts: d.escorts,
        shuttles: d.shuttles,
        officers: d.officers,
        bridge: d.bridge,
        dock: d.dock,
        bays: this.features.hangar.bays(d),
        dockSlots: this.features.hangar.dockSlots(d),
        board: this.features.hangar.shuttleBoard(d),
        bonus: this.features.bonuses.bonus(d),
        armada: this.features.coop.armadaPayload(d),
        social: this.features.coop.socialPayload(d),
        goals: this.features.fronts.goalsFor(d),
        tokens: d.tokens || {},
        chains: d.chains || {},
        quests: this.features.quests.questsPayload(d),
        arena: this.features.frontier.arenaPayload(d, session),
        spec: d.spec || {},
        bp: d.bp || {},
        story: this.features.story.storyPayload(d),
        holdout: d.holdout
          ? {
              best: d.holdout.best || 0,
              lastT: d.holdout.lastT || 0,
              wave: d.holdout.active ? d.holdout.active.wave : 0,
              active: !!d.holdout.active,
            }
          : null,
        power: this.features.hostile.myPower(d),
        parts: d.parts || {},
        specState: d.specState || {},
        mastery: d.mastery || {},
        colonies: this.features.frontier
          .coloniesOf(d)
          .map(([id, c]) => ({ id, name: c.name, lv: c.lv, sys: STELLARS[id].system })),
        defense: this.features.frontier.defenseRating(d),
        storage: d.storage || {},
        storageLots: structuredClone(d.storageLots),
        explored: d.explored,
        tut: d.tut ?? TUTORIAL.length,
        station: d.station,
        stats: d.stats,
        log: d.log.slice(-60),
        shipStats: st,
        fuel: session.ent ? session.ent.fuel : (d.fuel ?? st.fuel),
        cargoUsed: commodityCargoTonnes(d.cargo),
        jobCargo: this.jobCargo(d),
        duel: this.features.coop.duelPayload(session),
        duels: d.duels || null,
      },
    });
  }
  // ---- claimable station hulls
  /**
   * Finds the player account owning a claimable station site hull.
   * @param {string} id Stellar station site ID.
   * @returns {PlayerData | null} Player record of owner, or null if unclaimed.
   */
  siteOwner(id) {
    const k = this.db.world.sites[id];
    return k ? this.db.players[k] || null : null;
  }
  /**
   * Compiles map of all claimed station sites and their current owners/Station Tiers.
   * @returns {Record<string, {owner: string, ops: number}>} Map of claimed sites and owner information.
   */
  sitesPayload() {
    const out = {};
    for (const stellarBody of SITES) {
      const playerData = this.siteOwner(stellarBody.id);
      if (playerData) out[stellarBody.id] = { owner: playerData.name, ops: playerData.station.ops };
    }
    return out;
  }
  /**
   * Checks whether player owns the station hull at stellar body p.
   * @param {PlayerData} playerData Player save data.
   * @param {StellarBody} stellarBody Stellar body.
   * @returns {boolean} True if player owns this station site.
   */
  ownSite(playerData, stellarBody) {
    return !!(stellarBody && stellarBody.site && playerData.station.site === stellarBody.id);
  }
  /**
   * Broadcasts claimed station sites update to all players.
   * @returns {void}
   */
  pushSites() {
    this.broadcast({ t: 'sites', sites: this.sitesPayload() });
  }
  /**
   * Advances the career guide / tutorial when the current milestone event occurs.
   * @param {Session} session Player session.
   * @param {string} ev Tutorial trigger event identifier.
   * @returns {void}
   */
  tut(session, ev) {
    // advance the first-flight tutorial if this event is the current goal
    const playerData = session.data;
    if (playerData.tut == null || playerData.tut >= TUTORIAL.length) return;
    const T = TUTORIAL[playerData.tut];
    if (ev !== '*check' && T.ev !== ev) return;
    if (ev === '*check' && !(T.check && T.check(playerData, this.A))) return;
    playerData.credits += T.reward;
    if (T.mat) playerData.mats[T.mat[0]][T.mat[1]] += T.mat[2];
    playerData.tut++;
    this.toast(
      session,
      `Career: ${T.title} complete. +${credits(T.reward)} credits${T.mat ? ` and a ${T.mat[0]} ${GRADES[T.mat[1]]} crate` : ''}.`,
    );
    this.log(playerData, `Career goal "${T.title}" complete.`);
    if (playerData.tut >= TUTORIAL.length)
      this.toast(session, 'Career guide complete. The Rift is yours, Captain.');
    this.db.touch();
    this.you(session);
  }
  // newcomer protection lasts until your Personal Station reaches Station Tier 3 (see Space.spared)
  // cargo carried for jobs takes up real hold space
  /**
   * Calculates total cargo tonnage allocated to active delivery and smuggling jobs.
   * @param {{missions?: Array<Pick<Mission, 'type' | 'qty'>>}} d Player mission cargo.
   * @returns {number} Cargo space currently allocated to active cargo and smuggling missions.
   */
  jobCargo(d) {
    return reservedCargoTonnes(d.missions);
  }
  /**
   * Calculates total hold space currently used by commodities and job cargo.
   * @param {{cargo: Record<string, number>, missions?: Array<Pick<Mission, 'type' | 'qty'>>}} d Commodity and mission cargo.
   * @returns {number} Total cargo hold tonnage used by trade commodities and mission cargo.
   */
  holdUsed(d) {
    return commodityCargoTonnes(d.cargo) + this.jobCargo(d);
  }
  /**
   * Calculates passenger berths occupied by active passenger missions.
   * @param {PlayerData} playerData Player save data.
   * @returns {number} Passenger berths occupied by active passenger missions.
   */
  jobBunks(playerData) {
    return occupiedPassengerSeats(playerData.missions);
  }
  // Check the actual destination loadout for swaps; purchases use the stock loadout.
  /**
   * Checks if candidate hull or ship loadout can accommodate current cargo, missions, and passengers.
   * @param {PlayerData} playerData Player save data.
   * @param {number | {hull: number, outfits: Record<string, number>}} hullOrShip Candidate ship hull ID or loadout.
   * @param {boolean} [goods=true] Whether to include commodities in calculation.
   * @returns {string | null} Failure explanation reason, or null if ship fits.
   */
  fitsJobs(playerData, hullOrShip, goods = true) {
    const hull = typeof hullOrShip === 'object' ? hullOrShip.hull : hullOrShip;
    const H = this.A.ships[hull];
    if (!H) return 'Unknown hull.';
    const ship = typeof hullOrShip === 'object' ? hullOrShip : makeLoadout(this.A, hull, '');
    const need = (goods ? commodityCargoTonnes(playerData.cargo) : 0) + this.jobCargo(playerData),
      cap = shipStats(this.A, ship).cargo;
    if (need > cap)
      return `The ${H.name} can't hold your ${need} t of cargo${this.jobCargo(playerData) ? ' (including job cargo)' : ''}.`;
    const pax = this.jobBunks(playerData);
    if (pax > passengerSeats(H, ship))
      return `The ${H.name} doesn't have seats for your ${pax} passenger${pax > 1 ? 's' : ''}.`;
    return null;
  }
  // when you leave a system, your escorts go with you; a rival flying alongside goes back to their own business
  /**
   * Cleans up or returns escort wingmates and fighter drones when a ship leaves space.
   * @param {SpaceSpace} space Active system space simulation.
   * @param {Entity} entity Leader entity leaving or destroyed.
   * @param {string} [why] Removal reason (e.g. 'jump').
   * @returns {void}
   */
  dropEscorts(space, entity, why) {
    if (entity.player?.s) this.features.industrial.stop(entity.player.s);
    const ids = new Set([entity.id]);
    for (let k = 0; k < 3; k++)
      for (const x of space.ships.values()) if (x.owner && ids.has(x.owner)) ids.add(x.id); // escorts, and their fighters
    for (const x of [...space.ships.values()]) {
      if (x === entity || !ids.has(x.id)) continue;
      if (x.fighterOf === entity.id) {
        space.dock(x, entity);
        continue;
      } // drones still out go back into their bays
      if (x.rival && x.owner === entity.id) {
        x.owner = null;
        x.ai = x.rivalAi || 'patrol';
        x.target = null;
        x.slot = null;
        x.state = 'fly';
        continue;
      }
      space.remove(x, why);
    }
  }
  // pausing a solo game stops the clock on rush deadlines and loan payments (station timers still run in real time)
  /**
   * Toggles pause state for solo play, freezing mission deadlines and loans.
   * @param {boolean} on Pause state.
   * @returns {void}
   */
  setPaused(on) {
    if (on === !!this.paused) return;
    this.paused = on;
    if (on) {
      this.pausedAt = Date.now();
      return;
    }
    const dt = Date.now() - (this.pausedAt || Date.now());
    this.features.refinery.resume(dt);
    this.pausedAt = 0;
    if (dt <= 0) return;
    this.hails.resume(dt);
    for (const p of Object.values(this.db.players)) {
      for (const m of p.missions || []) if (m.deadline) m.deadline += dt;
      if (p.loan && p.loan.next) p.loan.next += dt;
    }
    this.db.touch();
  }
  /**
   * Checks whether a captain qualifies for newcomer protection (station below Station Tier 3).
   * @param {PlayerData} playerData Player save data.
   * @returns {boolean} True if player qualifies for newcomer protection.
   */
  newcomer(playerData) {
    return (
      !!playerData && !playerData.noShield && !((playerData.station && playerData.station.ops) >= 3)
    );
  }
  /**
   * Warns protected captains when jumping into lawless or dangerous systems.
   * @param {Session} session Player session.
   * @param {SpaceSystem} system Destination space system.
   * @returns {void}
   */
  protectNote(session, system) {
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
   * @param {PlayerData} playerData Player save data.
   * @param {string} text Entry text to append.
   * @returns {void}
   */
  log(playerData, text) {
    playerData.log.push({ t: Date.now(), text });
    if (playerData.log.length > 200) playerData.log.shift();
  }

  // Fixed routes; authentication, flood and activity gates remain in onMessage.
  /**
   * Builds the message router table binding route actions to feature services and handlers.
   * @returns {MessageRegistry} Initialized message registry dispatcher.
   */
  createMessageHandlers() {
    const game = this;
    // Live getters and forwarding calls retain late setup and test seams.
    /** @type {MessageCapabilities} */
    const capabilities = {
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
      accept: (...args) => game.accept(...args),
      buyMat: (...args) => game.buyMat(...args),
      buyShip: (...args) => game.buyShip(...args),
      chat: (...args) => game.chat(...args),
      depart: (...args) => game.depart(...args),
      jump: (...args) => game.jump(...args),
      land: (...args) => game.land(...args),
      landed: (...args) => game.landed(...args),
      log: (...args) => game.log(...args),
      outfit: (...args) => game.outfit(...args),
      send: (...args) => game.send(...args),
      setPaused: (...args) => game.setPaused(...args),
      station: (...args) => game.station(...args),
      trade: (...args) => game.trade(...args),
      tut: (...args) => game.tut(...args),
      you: (...args) => game.you(...args),
    };
    return createGameMessageHandlers(Object.freeze(capabilities));
  }

  /**
   * Ingests, rate-limits, authenticates, and dispatches an incoming client message.
   * @param {Session} session Source session.
   * @param {NetworkMessage} message Incoming parsed client message.
   * @returns {void}
   */
  onMessage(session, message) {
    const now = Date.now();
    if (now - session.msgT > 1000) {
      session.msgT = now;
      session.msgs = 0;
    }
    if (++session.msgs > 120) return; // flood guard
    if (!session.data) {
      if (message.t === 'hello') this.hello(session, message);
      return;
    }
    if (this.db.economicFrozen && !['ping', 'input', 'chat'].includes(message.t))
      return this.toast(session, 'Checkpoint recovery required; economic actions frozen.');
    if (message.t !== 'ping') session.actT = now; // for Online / Away
    this.messageHandlers.dispatch(message.t, session, message);
  }
  /**
   * Handles player login authentication and new account registration.
   * @param {Session} session Unauthenticated session.
   * @param {{name: string, pass: string}} m Authentication handshake payload.
   * @returns {void}
   */
  hello(session, m) {
    const name = String(m.name || '').trim(),
      pass = String(m.pass || '');
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
    const now = Date.now(),
      fk = ['n:' + name.toLowerCase(), 'i:' + session.ip];
    this.fails = this.fails || new Map();
    for (const k of fk) {
      const f = this.fails.get(k);
      if (f && now - f.t > 600000) this.fails.delete(k);
    }
    if (fk.some((k) => (this.fails.get(k) || { n: 0 }).n >= 6))
      return this.send(session, {
        t: 'error',
        msg: 'Too many failed sign-ins. Try again in a few minutes.',
      });
    let p = this.db.get(name);
    if (p) {
      if (!this.solo && !this.db.check(p, pass)) {
        for (const k of fk) {
          const f = this.fails.get(k) || { n: 0, t: now };
          f.n++;
          this.fails.set(k, f);
        }
        return this.send(session, { t: 'error', msg: 'Wrong password for that captain.' });
      }
    } else {
      p = this.db.create(name, pass || 'solo', this.fresh());
      this.log(p, 'Took command of the Gnat Skiff "Rift Runner" at Quantum Station.');
      session.isNew = true;
    }
    for (const o of this.sessions.values())
      if (o !== session && o.data === p) {
        this.send(o, { t: 'error', msg: 'Signed in somewhere else.' });
        o.sock.close();
        this.disconnect(o);
      }
    try {
      if (migrateCargoLots(p).changed) this.db.touch();
    } catch (error) {
      console.error('Cargo save rejected:', name, error.message);
      return this.send(session, {
        t: 'error',
        msg: 'Cargo save validation failed. Contact the server operator.',
      });
    }
    session.data = p;
    session.name = p.name;
    p.id = session.id;
    tutMigrate(p);
    this.features.hangar.hangarInit(p);
    this.features.coop.coopMigrate(p);
    this.features.docks.docksInit(p);
    this.features.hostile.hostInit(p);
    this.features.story.storyInit(p);
    this.features.syndicate.synInit(p);
    this.features.arcs.arcsInit(p);
    if (!p.explored) p.explored = SYSTEMS.filter((x) => x.anchor).map((x) => x.id); // captains from before 0.4 know the old 30 systems
    session.rep = p.rep;
    session.id = session.id;
    if (!STELLARS[p.stellar]) {
      p.sys = START.system;
      p.stellar = START.stellar;
    }
    if (STELLARS[p.stellar].system !== p.sys) p.sys = STELLARS[p.stellar].system; // repair saves from the old log-off bug
    this.send(session, { t: 'welcome', id: session.id, name: p.name });
    this.send(session, { t: 'sites', sites: this.sitesPayload() });
    this.send(session, this.features.world.worldPayload());
    this.features.coop.coopLogin(session); // Armada membership, offline DMs, friends' status
    this.idleCheck(session);
    this.you(session);
    this.landed(session);
    this.features.story.storyOnLand(session, STELLARS[p.stellar]);
    this.features.arcs.arcOnLand(session, STELLARS[p.stellar]); // a story step waiting where you logged off still pops up
    if (!this.solo) this.broadcast({ t: 'chat', from: '', msg: `${p.name} entered the Rift.` }); // no join messages in a solo game
    if (session.isNew)
      this.toast(
        session,
        'Newcomer protection: ambient factions and pirates across the main galaxy overlook you until Station Tier 3. Stray fire can still hurt; attacking or taking combat jobs permits retaliation. Farside is unprotected.',
      );
  }
  // player-facing reference used by Space (id, name, rep, inputs)
  /**
   * Constructs player reference descriptor used by Space simulation to bridge entity and session.
   * @param {Session} session Player session.
   * @returns {PlayerReference} Player reference descriptor for Space.
   */
  pref(session) {
    return {
      id: session.id,
      name: session.name,
      rep: session.data.rep,
      get inputs() {
        return session.inputs;
      },
      get lastInput() {
        return session.lastInput;
      },
      set lastInput(v) {
        session.lastInput = v;
      },
      s: session,
    };
  }

  // ------------------------------------------------------------------ space: depart, land, jump
  /**
   * Spawns player ship and active wingmates into space system simulation.
   * @param {Session} session Player session.
   * @param {number} x Coordinate X.
   * @param {number} y Coordinate Y.
   * @param {number} a Heading angle in radians.
   * @param {number} v Initial velocity magnitude.
   * @returns {void}
   */
  spawnPlayer(session, x, y, a, v) {
    this.features.towing.detach(session);
    if (!session.data.ship.uid) session.data.ship.uid = this.features.docks.shipUid(session.data);
    if (session.combat) this.combatAssist.stop(session, 'New flight state; rearm explicitly');
    const playerData = session.data,
      sp = this.spaces[playerData.sys];
    sp.beginVisit(session);
    const e = sp.makeShip({
      loadout: playerData.ship,
      bonus: this.features.bonuses.bonus(playerData),
      faction: 'quantum',
      x,
      y,
      a,
      vx: Math.sin(a) * v,
      vy: -Math.cos(a) * v,
      player: this.pref(session),
      fuel: playerData.fuel,
      ammo: playerData.ship.ammo,
      shield: playerData.shieldNow,
      armor: playerData.armorNow,
    });
    session.ent = e;
    session.inputs = [];
    sp.players++;
    e.elite = masteryTier((playerData.mastery || {})[playerData.ship.hull] || 0) >= 5;
    const eb = this.features.specialists.flying(playerData, 'herald')
      ? { shieldPct: 25 * this.features.specialists.power(playerData) }
      : this.features.specialists.flying(playerData, 'tidecaller')
        ? { shieldRePct: 40 * this.features.specialists.power(playerData) }
        : {};
    for (const { w, i, x: W } of this.features.docks.activeWings(playerData)) {
      // the active dock's wingmates, with their own outfits and officers
      const wb = this.features.docks.wingBonus(playerData, w);
      for (const [k, v] of Object.entries(eb)) wb[k] = (wb[k] || 0) + v;
      const m = sp.makeShip({
        loadout: W.ship,
        ammo: { ...(W.ship.ammo || {}) },
        faction: 'quantum',
        bonus: wb,
        x: x - Math.sin(a) * 120 + (i - 1) * 70,
        y: y + Math.cos(a) * 120,
        a,
        vx: e.vx,
        vy: e.vy,
        ai: 'escort',
        owner: e.id,
        name: W.ship.name || this.A.ships[W.ship.hull].name,
      });
      m.escortSlot = i;
      m.wingUid = W.ship.uid;
      m.wingOf = session.id;
    }
    for (const m of playerData.missions)
      if (
        m.type === 'bounty' &&
        m.sys === playerData.sys &&
        !m.done &&
        ![...sp.ships.values()].some((x) => x.mission && x.mission.id === m.id)
      ) {
        m.spawned = true;
        sp.spawnMissionTarget({ ...m, owner: session.id });
        this.toast(session, `Your bounty target, ${m.targetName}, is in this system.`);
      }
    this.send(session, {
      t: 'space',
      sys: playerData.sys,
      id: e.id,
      rocks: sp.rocksPayload(),
      miningRocks: this.features.mining.rocksPayload(sp),
      mining: this.features.mining.payload(session, sp),
      industrial: this.features.industrial.payload(session),
      towing: this.features.towing.payload(session),
      miningPressure: this.features.pressure.payload(session),
      miningHazards: this.features.pressure.hazards(sp.id),
    });
    this.features.fronts.missionArrive(session, sp);
    this.features.story.storyArrive(session, sp);
    this.features.arcs.arcArrive(session, sp);
    if (!this.solo) {
      this.features.coop.warbandArrive(session, sp);
      const A = this.features.coop.armadaOf(playerData);
      if (A) {
        this.features.coop.armadaRefresh(A);
        this.features.coop.armadaPush(A);
      }
    } // members see where you are
  }
  /**
   * Launches player ship from docked stellar body into active space flight.
   * @param {Session} session Player session launching from stellar.
   * @returns {void}
   */
  depart(session) {
    const playerData = session.data;
    if (session.ent || !playerData.stellar) return;
    if (playerData.shipless)
      return this.toast(
        session,
        'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.',
      );
    if (this.features.specialists.inDrydock(playerData)) {
      const st = playerData.specState[playerData.ship.hull];
      return this.toast(
        session,
        `The ${this.A.ships[playerData.ship.hull].name} is in the drydock for her tier-up: ${Math.ceil((st.upT - Date.now()) / 60000)} minutes left.`,
      );
    }
    const stellarBody = STELLARS[playerData.stellar];
    const a = Math.random() * Math.PI * 2;
    beginEconomyTrip(playerData, stellarBody.id, Date.now());
    playerData.stellar = null;
    this.spawnPlayer(
      session,
      stellarBody.x + Math.sin(a) * (stellarBody.r + 30),
      stellarBody.y - Math.cos(a) * (stellarBody.r + 30),
      a,
      40,
    );
    this.you(session);
  }
  /**
   * Lands player ship at a stellar body, repairing, refueling, and completing missions.
   * @param {Session} session Player session landing.
   * @param {string} sid Target stellar ID.
   * @returns {void}
   */
  land(session, sid) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity) return;
    if (this.features.towing.attached(session))
      return this.toast(session, 'Deliver or detach the motherlode before landing.');
    if (entity.disabled) return this.toast(session, 'Your ship is disabled.');
    const stellarBody = STELLARS[sid];
    if (!stellarBody || stellarBody.system !== playerData.sys) return;
    if (!stellarBody.svc.includes('L'))
      return this.toast(session, `${stellarBody.name} has nowhere to land.`);
    const dist = Math.hypot(entity.x - stellarBody.x, entity.y - stellarBody.y),
      sp = Math.hypot(entity.vx, entity.vy);
    if (dist > stellarBody.r + 60)
      return this.toast(session, `Too far from ${stellarBody.name} to land.`);
    if (sp > 80) return this.toast(session, 'Slow down to land.');
    const fac = SYS[playerData.sys].faction;
    if (
      !stellarBody.outlaw &&
      (playerData.rep[fac] || 0) <= -30 &&
      !(playerData.landPass && playerData.landPass[stellarBody.id] > Date.now())
    )
      return this.toast(
        session,
        `${stellarBody.name} refuses you permission to land. Hail them (T) to talk.`,
      );
    const space = this.spaces[playerData.sys];
    this.dropEscorts(space, entity);
    playerData.fuel = entity.fuel;
    for (const g of entity.guns) if (g.ammo !== Infinity) playerData.ship.ammo[g.w] = g.ammo;
    space.remove(entity);
    space.players--;
    session.ent = null;
    playerData.stellar = sid;
    arriveEconomyTrip(playerData, sid, Date.now());
    // free refuel and repair
    const st = this.features.shipStats.stats(playerData);
    playerData.fuel = st.fuel;
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
      const A = this.features.coop.armadaOf(playerData);
      if (A) this.features.coop.armadaPush(A);
    } // 2.6
  }
  /**
   * Transmits docked port services payload (market, shipyard, jobs, outfitter) to client.
   * @param {Session} session Player session currently docked.
   * @returns {void}
   */
  landed(session) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar];
    if (!p) return;
    const own = this.ownSite(playerData, p),
      so = p.site ? this.siteOwner(p.id) : null;
    this.send(session, {
      t: 'landed',
      refinery: this.features.refinery.payload(session),
      stellar: p.id,
      market: this.market(p),
      tradeTerms: {
        site: !!p.site,
        tradePct: this.features.bonuses.bonus(playerData).tradePct || 0,
        sell: this.features.fronts.mods(p.system).sell,
      },
      offers: this.offers(p, playerData),
      yard: this.yard(p, playerData),
      outfitter: this.outfitter(p, playerData),
      mats: this.matsFor(p, playerData),
      site: p.site ? { owner: so ? so.name : null, ops: so ? so.station.ops : 0, own } : null,
      community: p.hub ? this.community() : null,
      news: p.svc.includes('B') || p.hub ? this.features.rivals.newsFeed(6) : null,
      contact: this.features.quests.barTalk(p, playerData),
      blackmarket: this.features.syndicate.blackMarket(p, playerData),
      arcs: this.features.arcs.arcOffersAt(playerData, p).map((mission) => ({
        fac: mission.fac,
        title: mission.title,
        brief: mission.brief,
        text: mission.text,
        locked: mission.locked || null,
        arc: ARCS_NAME(mission.fac),
      })),
      bank: this.features.syndicate.bankAt(p) ? this.features.syndicate.bankInfo(playerData) : null,
      bar: this.features.hangar.barOffers(p, playerData),
      store: this.features.fronts.storeFor(p),
      colony: this.features.frontier.colonyPayload(p, playerData),
      story: (() => {
        const o = this.features.story.storyOffer(playerData, p);
        return o
          ? {
              id: o.id,
              title: o.title,
              brief: o.brief,
              text: o.text,
              acc: o.acc,
              locked: o.locked || null,
            }
          : null;
      })(),
      exchange:
        p.hub || (p.svc.includes('T') && !p.site)
          ? this.features.frontier.exchangePayload(playerData)
          : null,
    });
  }
  /**
   * Initiates hyperjump to connected system, charging jump drive.
   * @param {Session} session Player session initiating hyperjump.
   * @param {string} to Destination system ID.
   * @returns {void}
   */
  jump(session, to) {
    if (this.features.towing.attached(session))
      return this.toast(session, 'Detach the motherlode before jumping.');
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly') return;
    if (entity.disabled) return this.toast(session, 'Your ship is disabled.');
    const S = SYS[playerData.sys];
    const skip = !S.links.includes(to)
      ? this.features.specialists.pathfinderJump(playerData, playerData.sys, to)
      : null;
    if (!S.links.includes(to) && !skip) return this.toast(session, 'No hyperspace route there.');
    if (this.features.specialists.inDrydock(playerData))
      return this.toast(
        session,
        'Your ship is booked into the drydock for her tier-up. Land and wait for it to finish.',
      );
    if (this.features.story.deepLocked(playerData, to))
      return this.toast(
        session,
        "The Deep is uncharted: ships that jump in blind are never seen again. The Que'vari are said to keep charts of the dark.",
      );
    const fuelCost =
      K.jumpFuel * this.features.fronts.mods(playerData.sys).jumpFuel * (skip ? 1.5 : 1);
    entity.jumpCost = fuelCost;
    if (entity.fuel < fuelCost)
      return this.toast(
        session,
        skip
          ? `A Pathfinder skip-jump needs ${Math.round((fuelCost / K.jumpFuel) * 10) / 10} jumps of fuel.`
          : this.features.fronts.mods(playerData.sys).jumpFuel > 1
            ? 'Gravity shear: this jump needs double fuel.'
            : 'Not enough fuel to jump.',
      );
    for (const stellarBody of S.stellars)
      if (Math.hypot(entity.x - stellarBody.x, entity.y - stellarBody.y) < K.jumpClear)
        return this.toast(
          session,
          'Too close to ' + stellarBody.name + ' to jump. Fly further out.',
        );
    const T = SYS[to];
    entity.a = Math.atan2(T.x - S.x, -(T.y - S.y));
    entity.state = 'jumpout';
    entity.jumpT = entity.st.jumpFast ? 0.6 : 1.6;
    entity.jumpTo = to;
    this.spaces[playerData.sys].events.push(['jump', entity.id]);
    for (const x of this.spaces[playerData.sys].ships.values())
      if (x.owner === entity.id && !x.fighterOf && !x.rival) {
        x.state = 'jumpout';
        x.jumpT = entity.jumpT + 0.3;
        x.a = entity.a;
        x.jumpTo = '-';
      }
    this.features.coop.armadaLeaderJump(session, to); // members who follow the leader get the destination
  }
  /**
   * Finalizes hyperjump: deducts fuel, explores destination, and spawns ship in new system.
   * @param {Entity} entity Jumping ship entity.
   * @param {SpaceSpace} space Origin space simulation.
   * @returns {void}
   */
  finishJump(entity, space) {
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
      from = SYS[playerData.sys],
      to = SYS[entity.jumpTo];
    this.dropEscorts(space, entity, 'jump'); // first, so drones still out are counted back into the bays
    playerData.fuel = entity.fuel - (entity.jumpCost || K.jumpFuel);
    for (const g of entity.guns) if (g.ammo !== Infinity) playerData.ship.ammo[g.w] = g.ammo;
    playerData.shieldNow = entity.shield;
    playerData.armorNow = entity.armor;
    space.remove(entity, 'jump');
    space.players--;
    session.ent = null;
    playerData.sys = to.id;
    playerData.stats.jumps++;
    this.features.hangar.officerXp(session, 4);
    this.features.fronts.goal(session, 'jumps');
    this.features.frontier.mastery(session, 3);
    if (!playerData.explored.includes(to.id)) {
      playerData.explored.push(to.id);
      this.features.fronts.goal(session, 'charted');
      this.features.specialists.specOnChart(session);
      if (to.gen) this.log(playerData, `Charted ${to.name} (${FACTIONS[to.faction].name}).`);
    }
    const ang = Math.atan2(from.x - to.x, -(from.y - to.y)); // arrive from the direction we came
    const a = ang + Math.PI;
    this.spawnPlayer(session, Math.sin(ang) * 2200, -Math.cos(ang) * 2200, a, entity.st.maxSpeed);
    playerData.shieldNow = playerData.armorNow = undefined;
    session.ent.graceT = this.spaces[playerData.sys].t + 6; // a few seconds to get your bearings after a jump
    this.protectNote(session, to);
    this.spaces[playerData.sys].events.push([
      'flash',
      Math.round(session.ent.x),
      Math.round(session.ent.y),
    ]);
    this.you(session);
    for (const m of playerData.missions)
      if (m.type === 'patrol' && m.sys === playerData.sys)
        this.toast(session, `Patrol: destroy ${m.need - m.got} more hostile ships here.`);
  }

  // flying into the Sol Gateway (or its far mouth) crosses instantly, with no fuel cost
  /**
   * Handles instantaneous transit through Sol Gateway wormholes without fuel consumption.
   * @param {Entity} entity Ship entity entering wormhole.
   * @param {SpaceSpace} space Origin space.
   * @param {StellarBody} stellarBody Wormhole gateway stellar body.
   * @returns {void}
   */
  wormholeTransit(entity, space, stellarBody) {
    if (entity.player && this.features.towing.attached(entity.player.s))
      return this.toast(entity.player.s, 'Detach the motherlode before Gateway transit.');
    const session = entity.player.s,
      playerData = session.data,
      to = SYS[stellarBody.wormhole],
      exit = to.stellars.find((x) => x.id === stellarBody.exit);
    this.dropEscorts(space, entity);
    playerData.fuel = entity.fuel;
    for (const g of entity.guns) if (g.ammo !== Infinity) playerData.ship.ammo[g.w] = g.ammo;
    playerData.shieldNow = entity.shield;
    playerData.armorNow = entity.armor;
    space.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
    space.remove(entity);
    space.players--;
    session.ent = null;
    playerData.sys = to.id;
    playerData.stats.jumps++;
    this.features.fronts.goal(session, 'jumps');
    this.features.frontier.mastery(session, 3);
    const first = !playerData.explored.includes(to.id);
    if (first) {
      playerData.explored.push(to.id);
      this.features.fronts.goal(session, 'charted');
      this.log(
        playerData,
        to.farside
          ? 'Passed through the Sol Gateway. The stars on the far side match no chart.'
          : 'Came home through the Gateway to Sol.',
      );
    }
    const a = Math.random() * Math.PI * 2;
    this.spawnPlayer(
      session,
      exit.x + Math.sin(a) * (exit.r * 0.15),
      exit.y - Math.cos(a) * (exit.r * 0.15),
      a,
      140,
    );
    playerData.shieldNow = playerData.armorNow = undefined;
    session.ent.wormT = this.spaces[playerData.sys].t + 4;
    session.ent.wormExit = exit.id; // Rearm only after leaving the arrival aperture.
    session.ent.graceT = this.spaces[playerData.sys].t + 6;
    this.protectNote(session, to);
    this.spaces[playerData.sys].events.push([
      'flash',
      Math.round(session.ent.x),
      Math.round(session.ent.y),
    ]);
    this.toast(
      session,
      to.farside
        ? `Through the Gateway: ${to.name}.${first ? ' Nothing out here is on any chart.' : ''}`
        : 'Back through the Gateway: Sol.',
    );
    this.you(session);
  }
  // ------------------------------------------------------------------ combat outcomes
  /**
   * Handles weapon impact against NPC ship, updating faction reputation and rival state.
   * @param {PlayerReference} pref Attacking player reference.
   * @param {Entity} npc Target entity hit.
   * @param {SpaceSpace} space Space simulation.
   * @returns {void}
   */
  onHit(pref, npc, space) {
    const session = pref.s,
      playerData = session.data;
    if (!playerData) return;
    this.features.rivals.rivalOnHit(session, npc, space);
    if (
      space.isHostile(npc, session.ent || npc) &&
      npc.aggro.size <= 1 &&
      FACTIONS[npc.faction].pirate
    )
      return;
    if (
      !FACTIONS[npc.faction].pirate &&
      !FACTIONS[npc.faction].alwaysHostile &&
      !npc.dread &&
      !npc.boss &&
      !npc.mission &&
      (playerData.rep[npc.faction] || 0) > -100 &&
      (!npc.repHitT || space.t - npc.repHitT > 1.5)
    ) {
      npc.repHitT = space.t;
      playerData.rep[npc.faction] = clampStanding((playerData.rep[npc.faction] || 0) - 1);
    }
  }
  /**
   * Resolves combat kill: awards bounties, increases combat rating, and fulfills mission objectives.
   * @param {PlayerReference} pref Killing player reference.
   * @param {Entity} npc Entity destroyed.
   * @param {SpaceSpace} space Space simulation.
   * @param {boolean} [byEscort] Whether final blow was landed by an escort.
   * @returns {void}
   */
  onKill(pref, npc, space, byEscort) {
    const session = pref.s,
      playerData = session.data;
    if (!playerData) return;
    playerData.stats.kills++;
    playerData.stats.combat = (playerData.stats.combat || 0) + (npc.pw || npc.strength || 10); // combat rating
    this.features.hangar.officerXp(session, 8 + Math.round((npc.strength || 10) / 40));
    this.features.frontier.mastery(session, (npc.strength || 10) / 8);
    this.features.specialists.specOnKill(session, npc, space, byEscort);
    const F = FACTIONS[npc.faction];
    if (this.features.rivals.rivalOnKill(session, npc, space)) {
      this.toast(
        session,
        `You destroyed ${npc.name.split(' · ')[0]}'s ship. They will not forget it.`,
      );
      this.you(session);
      return;
    } // 1.1
    if (npc.storyKill) this.features.story.storyProgress(session, npc);
    if (npc.kingpin) this.features.coop.warbandDown(npc); // an Armada contract's kingpin
    this.features.living.stateOnKill(session, npc, space); // 2.4
    if (npc.arcOf) this.features.arcs.arcProgress(session, npc); // 1.2 faction arcs
    if (npc.boss || npc.bossMinion) {
      this.features.fronts.goal(session, 'kills');
      this.you(session);
      return;
    }
    if (F.pirate || F.alwaysHostile || npc.mission) {
      const stB = (() => {
        const st = this.features.living.stateOf(space.id);
        return (st && STATES[st.kind].bounty) || 1;
      })(); // a pirate scourge pays more
      const bounty = Math.round(
        ((npc.strength || 10) * 25 + 500) *
          (1 + (this.features.bonuses.bonus(playerData).lootPct || 0) / 100) *
          this.features.fronts.mods(space.id).bounty *
          stB *
          (this.features.specialists.flying(playerData, 'vanguard')
            ? 1 + 0.5 * this.features.specialists.power(playerData)
            : 1),
      );
      this.features.coop.shareBounty(session, bounty, space, npc);
      this.features.fronts.goal(session, 'kills'); // Armada members present get kill credit and a share
      playerData.credits += bounty;
      playerData.stats.earned += bounty;
      playerData.rep.quantum = clampStanding(playerData.rep.quantum + 1);
      playerData.rep.spacer = clampStanding(playerData.rep.spacer + 1);
      this.toast(
        session,
        `Destroyed ${npc.name || this.A.ships[npc.hull].name}. Bounty: ${credits(bounty)} credits.`,
      );
      this.tut(session, 'kill');
    } else {
      playerData.rep[npc.faction] = clampStanding((playerData.rep[npc.faction] || 0) - 10);
      for (const [f, X] of Object.entries(FACTIONS))
        if (X.hostile.includes(npc.faction))
          playerData.rep[f] = clampStanding((playerData.rep[f] || 0) + 2);
      this.toast(session, `Destroyed a ${F.short} ship. ${F.name} will remember that.`);
    }
    for (const m of playerData.missions) {
      if (m.type === 'bounty' && npc.mission && npc.mission.id === m.id) {
        m.done = true;
        this.toast(
          session,
          `Bounty complete: ${m.targetName} is dead. Land anywhere to collect ${credits(m.reward)}.`,
        );
      }
      if (
        m.type === 'patrol' &&
        m.sys === space.id &&
        (F.pirate || FACTIONS[SYS[m.sys].faction].hostile.includes(npc.faction)) &&
        !m.done
      ) {
        m.got++;
        if (m.got >= m.need) {
          m.done = true;
          this.toast(session, 'Patrol complete. Land anywhere to collect your pay.');
        }
      }
    }
    this.you(session);
  }
  /**
   * Handles player ship destruction: charges insurance fee, clears cargo, and respawns at station.
   * @param {PlayerReference} pref Player reference destroyed.
   * @param {SpaceSpace} space Space simulation.
   * @param {Entity | null} [entity] Killer entity, if any.
   * @returns {void}
   */
  onPlayerDeath(pref, space, entity) {
    const session = pref.s,
      playerData = session.data;
    if (!playerData) return;
    this.features.towing.detach(session);
    if (space.sys.arena && this.features.frontier.onArenaDeath(session, space)) return;
    if (session.ent) this.dropEscorts(space, session.ent, 'jump'); // escorts no longer linger after you are destroyed
    space.players--;
    session.ent = null;
    const fee = Math.min(
      playerData.credits,
      Math.round((this.A.ships[playerData.ship.hull].cost || 0) * 0.05),
    );
    playerData.credits -= fee;
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
    for (const m of playerData.missions) if (m.type === 'cargo') m.lost = true;
    playerData.missions = playerData.missions.filter((m) => !m.lost);
    this.log(
      playerData,
      `Ship destroyed${entity && entity.player ? ' by ' + entity.player.name : ''}. The insurers rebuilt it at ${STELLARS[back].name} for ${credits(fee)} credits; the cargo was lost.`,
    );
    this.send(session, { t: 'dead', fee, at: STELLARS[back].name });
    if (entity && entity.player)
      this.broadcast({
        t: 'chat',
        from: '',
        msg: `${entity.player.name} destroyed ${session.name} in ${SYS[space.id].name}.`,
      });
    this.db.touch();
    this.you(session);
    this.landed(session);
  }
  /**
   * Finds the nearest market port that purchases a specific commodity.
   * @param {string} sys Starting system ID.
   * @param {string} cid Commodity ID.
   * @returns {{p: StellarBody, j: number} | null} Nearest purchasing stellar port and jump distance, or null.
   */
  nearestBuyer(sys, cid) {
    // Keep authored tie order and the existing five-link search boundary.
    for (const [systemId, jumps] of galaxyGraph.walk(sys, { maxDepth: 5 })) {
      for (const port of SYS[systemId].stellars) {
        const stellarBody = STELLARS[port.id];
        if (
          stellarBody &&
          !stellarBody.site &&
          (stellarBody.svc || '').includes('T') &&
          price(stellarBody, cid) !== null
        )
          return { p: stellarBody, j: jumps };
      }
    }
    return null;
  }
  /**
   * Handles player scooping floating salvage canister, ore chunk, or credits.
   * @param {PlayerReference} pref Player scooping loot.
   * @param {LootItem} lootItem Loot item payload.
   * @returns {boolean | void} Returns false if cargo hold full when mining ore.
   */
  onLoot(pref, lootItem) {
    const session = pref.s,
      playerData = session.data;
    if (!playerData) return;
    if (lootItem.cargo) return this.features.fleetcmd.lootCargo(session, lootItem); // jettisoned cargo
    if (lootItem.salvage) return this.features.quests.questLoot(session, lootItem); // a quest's salvage
    if (lootItem.ore) {
      // mined ore goes into the cargo hold, if there is room
      // Freeze the original economic parcel once, including when the first hold is full.
      if (lootItem.remainingLots === undefined) {
        const b = this.features.bonuses.bonus(playerData),
          raw =
            lootItem.n *
            (1 + (b.miningPct || 0) / 100) *
            this.features.fronts.mods(playerData.sys).mining,
          want = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
        lootItem.remainingLots = commonLots(lootItem.ore, want).grades;
      }
      const want = Object.values(lootItem.remainingLots).reduce((a, b) => a + b, 0);
      if (!want) return true;
      const st = this.features.shipStats.stats(playerData),
        used = this.holdUsed(playerData),
        n = Math.min(want, st.cargo - used);
      if (n <= 0) {
        if (!session.fullT || Date.now() - session.fullT > 8000) {
          session.fullT = Date.now(); // say where it can go
          const C = COMMODITIES.find((c) => c.id === lootItem.ore),
            B = this.nearestBuyer(playerData.sys, lootItem.ore);
          this.toast(
            session,
            !st.cargo
              ? 'This ship has no cargo hold. Fit a Cargo Compression outfit (it takes no space) to keep what you mine.'
              : `Cargo hold full. ${C.name} sells at ${B ? `${B.p.name}${B.j ? ` (${B.j} jump${B.j > 1 ? 's' : ''})` : ' in this system'}` : 'markets further out'}${playerData.station && playerData.station.ops >= 1 ? ', or process it at your station' : ''}.`,
          );
        }
        return false;
      }
      const selected = splitLots(lootItem.remainingLots, n);
      addLots(
        playerData.cargo,
        playerData.cargoLots,
        { cid: lootItem.ore, qty: n, grades: selected },
        Math.max(0, st.cargo - used),
      );
      for (const g of ['common', 'rich', 'pure']) lootItem.remainingLots[g] -= selected[g];
      playerData.stats.mined = (playerData.stats.mined || 0) + n;
      this.features.fronts.goal(session, 'mined', n);
      this.features.frontier.mastery(session, n * 0.3);
      if (lootItem.generationKey) this.features.mining.collected(session, lootItem, n);
      else if (!lootItem.progressionClaimed) {
        lootItem.progressionClaimed = true;
        this.features.specialists.specOnMine(session, lootItem);
      }
      this.toast(session, `+${n} t ${COMMODITIES.find((c) => c.id === lootItem.ore).name}`);
      this.you(session);
      return Object.values(lootItem.remainingLots).every((q) => q === 0);
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
      playerData.mats[lootItem.mat][lootItem.grade]++;
      this.toast(session, `Salvaged a ${lootItem.mat} crate (grade ${GRADES[lootItem.grade]}).`);
    }
    this.you(session);
  }

  /**
   * Compiles social hub statistics: docked captains, top earners, and station claim statuses.
   * @returns {CommunityPayload} Active social / leaderboard statistics payload.
   */
  community() {
    const docked = [...this.sessions.values()]
      .filter((x) => x.data && x.data.stellar === 'qstation')
      .map((x) => x.name);
    const all = Object.values(this.db.players);
    const top = all
      .map((p) => ({
        name: p.name,
        earned: (p.stats && p.stats.earned) || 0,
        kills: (p.stats && p.stats.kills) || 0,
        ship: this.A.ships[p.ship.hull] ? this.A.ships[p.ship.hull].name : '',
      }))
      .concat(
        Object.values(this.db.world.rivals || {}).map((r) => ({
          name: (this.features.rivals.rivalName || (() => ''))(r.id),
          ai: true,
          earned: r.earned,
          kills: r.kills,
          ship: this.A.ships[r.hull] ? this.A.ships[r.hull].name : '',
        })),
      )
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 10);
    const stations = SITES.map((stellarBody) => {
      const playerData = this.siteOwner(stellarBody.id);
      return {
        system: SYS[stellarBody.system].name,
        owner: playerData ? playerData.name : null,
        ops: playerData ? playerData.station.ops : 0,
      };
    });
    const online = [...this.sessions.values()]
      .filter((x) => x.data)
      .map((x) => ({ name: x.name, sys: SYS[x.data.sys].name }));
    return { docked, top, stations, online };
  }
  // ------------------------------------------------------------------ markets
  /** @returns {PortService} Ordinary port commerce. */
  createPortService() {
    const game = this;
    /** @type {PortCapabilities} */
    const capabilities = {
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
      fitsJobs: (...args) => game.fitsJobs(...args),
      holdUsed: (...args) => game.holdUsed(...args),
      jobBunks: (...args) => game.jobBunks(...args),
      landed: (...args) => game.landed(...args),
      log: (...args) => game.log(...args),
      market: (...args) => game.market(...args),
      matsFor: (...args) => game.matsFor(...args),
      outfitter: (...args) => game.outfitter(...args),
      ownSite: (...args) => game.ownSite(...args),
      siteOwner: (...args) => game.siteOwner(...args),
      toast: (...args) => game.toast(...args),
      tradeIn: (...args) => game.tradeIn(...args),
      tut: (...args) => game.tut(...args),
      yard: (...args) => game.yard(...args),
      you: (...args) => game.you(...args),
    };
    return createPortService(Object.freeze(capabilities));
  }

  /**
   * Generates commodity market prices for a stellar port, applying flash and state modifiers.
   * @param {StellarBody} stellarBody Stellar port.
   * @returns {MarketItem[] | null} Array of traded commodities and pricing, or null.
   */
  market(stellarBody) {
    return this.portService.market(stellarBody);
  }
  /**
   * Executes commodity purchase or sale transaction with market depth price impact.
   * @param {Session} session Player session.
   * @param {string} cid Commodity ID.
   * @param {number} qty Amount to buy (>0) or sell (<0).
   * @param {GradeLots|'common-first'} [selection]
   * @returns {void}
   */
  trade(session, cid, qty, selection = 'common-first') {
    return this.portService.trade(session, cid, qty, selection);
  }
  /**
   * Lists upgrade materials for sale at a stellar body based on faction specialization.
   * @param {StellarBody} stellarBody Stellar body.
   * @param {PlayerData} [playerData] Player data.
   * @returns {Array<{mat: string, grade: number, price: number}>} Upgrade materials available.
   */
  matsFor(stellarBody, playerData) {
    return this.portService.matsFor(stellarBody, playerData);
  }
  /**
   * Executes purchase or sale of crafting and upgrade materials.
   * @param {Session} session Player session.
   * @param {string} mat Material name ('alloy', 'crystal', 'isotope').
   * @param {number} grade Material grade index (0-4).
   * @param {number} n Quantity to buy (>0) or sell (<0).
   * @returns {void}
   */
  buyMat(session, mat, grade, n) {
    return this.portService.buyMat(session, mat, grade, n);
  }

  // ------------------------------------------------------------------ shipyard and outfitter
  /**
   * Compiles list of ship hulls available for purchase at shipyard.
   * @param {StellarBody} stellarBody Stellar port.
   * @param {PlayerData} [playerData] Player data.
   * @returns {number[] | null} Array of hull IDs for sale, or null.
   */
  yard(stellarBody, playerData) {
    return this.portService.yard(stellarBody, playerData);
  }
  /**
   * Calculates credit trade-in value for captain's current ship and outfits (50% value).
   * @param {PlayerData} playerData Player save data.
   * @returns {number} Credit trade-in value of current ship and installed outfits.
   */
  tradeIn(playerData) {
    return this.portService.tradeIn(playerData);
  }
  /**
   * Purchases a new flagship hull, applying trade-in credit for previous ship.
   * @param {Session} session Player session.
   * @param {number} hull Hull ID to purchase.
   * @returns {void}
   */
  buyShip(session, hull) {
    return this.portService.buyShip(session, hull);
  }
  /**
   * Compiles list of ship outfits available for purchase at outfitter.
   * @param {StellarBody} stellarBody Stellar port.
   * @param {PlayerData} [playerData] Player data.
   * @returns {number[] | null} Array of outfit IDs for sale, or null.
   */
  outfitter(stellarBody, playerData) {
    return this.portService.outfitter(stellarBody, playerData);
  }
  /**
   * Purchases or sells a ship outfit or ammunition batch.
   * @param {Session} session Player session.
   * @param {number} id Outfit ID.
   * @param {number} n Quantity to buy (>0) or sell (<0).
   * @returns {void}
   */
  outfit(session, id, n) {
    return this.portService.outfit(session, id, n);
  }

  /** @returns {JobService} Ordinary job operations. */
  createJobService() {
    const game = this;
    /** @type {JobCapabilities} */
    const capabilities = {
      get A() {
        return game.A;
      },
      get db() {
        return game.db;
      },
      get features() {
        return game.features;
      },
      holdUsed: (...args) => game.holdUsed(...args),
      landed: (...args) => game.landed(...args),
      log: (...args) => game.log(...args),
      offers: (...args) => game.offers(...args),
      send: (...args) => game.send(...args),
      toast: (...args) => game.toast(...args),
      tut: (...args) => game.tut(...args),
      you: (...args) => game.you(...args),
    };
    return createJobService(Object.freeze(capabilities));
  }

  // ------------------------------------------------------------------ missions
  /**
   * Generates procedural job board mission offers for a stellar port.
   * @param {StellarBody} stellarBody Stellar port.
   * @param {PlayerData} playerData Player data.
   * @returns {Mission[]} Available job board missions.
   */
  offers(stellarBody, playerData) {
    return this.jobService.offers(stellarBody, playerData);
  }
  /**
   * Accepts a mission from the local stellar job board.
   * @param {Session} session Player session.
   * @param {string} id Mission ID to accept.
   * @returns {void}
   */
  accept(session, id) {
    return this.jobService.accept(session, id);
  }
  /**
   * Evaluates active missions upon landing, paying rewards and logging completions.
   * @param {Session} session Player session landing.
   * @param {StellarBody} stellarBody Landed stellar port.
   * @returns {void}
   */
  completeOnLanding(session, stellarBody) {
    return this.jobService.completeOnLanding(session, stellarBody);
  }

  // ------------------------------------------------------------------ Quantum Station (each captain's own)
  /**
   * Updates Personal Station timers: refinery generation, active research, and construction.
   * @param {PlayerData} playerData Player save data.
   * @returns {void}
   */
  checkStation(playerData) {
    const S = playerData.station;
    if (!S.claimed) return;
    this.features.hangar.hangarInit(playerData);
    const rb = researchBonus(S),
      now = Date.now(),
      per = (REFINERY.minutes[S.ops] * 60000) / (1 + (rb.refineSpeed || 0) / 100),
      cap = REFINERY.silo + (rb.silo || 0);
    if (S.ops >= 1 && per > 0) {
      while (S.refUnits < cap && now - S.refT >= per) {
        S.refUnits++;
        S.refT += per;
      }
      if (S.refUnits >= cap) S.refT = now;
    }
    if (S.active && now >= S.active.ends) {
      S.done.push(S.active.id);
      this.log(
        playerData,
        `Research complete: ${RESEARCH.find((r) => r.id === S.active.id).name}.`,
      );
      S.active = null;
    }
    this.features.hangar.startQueued(playerData);
  }
  /**
   * Verifies if player has required material quantities.
   * @param {PlayerData} playerData Player save data.
   * @param {Array<[string, number, number]>} mats Required materials tuple [name, grade, count].
   * @returns {boolean} True if inventory satisfies all material requirements.
   */
  hasMats(playerData, mats) {
    return mats.every(([m, g, n]) => playerData.mats[m][g] >= n);
  }
  /**
   * Deducts specified material quantities from player inventory.
   * @param {PlayerData} playerData Player save data.
   * @param {Array<[string, number, number]>} mats Materials to consume [name, grade, count].
   * @returns {void}
   */
  takeMats(playerData, mats) {
    for (const [m, g, n] of mats) playerData.mats[m][g] -= n;
  }
  /**
   * Processes Personal Station operations: claiming derelicts, upgrades, refinery, and relocation.
   * @param {Session} session Player session.
   * @param {NetworkMessage} message Station operation payload.
   * @returns {void}
   */
  station(session, message) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar],
      S = playerData.station;
    if (!p || session.ent) return;
    this.checkStation(playerData);
    if (message.op === 'claim') {
      if (!p.site)
        return this.toast(
          session,
          'Find a derelict station hull to claim. They drift in systems across the galaxy.',
        );
      if (this.siteOwner(p.id))
        return this.toast(session, 'Another captain has already claimed this hull.');
      if (S.site)
        return this.toast(
          session,
          `You already have a Personal Station in ${SYS[STELLARS[S.site].system].name}.`,
        );
      const first = !S.claimed;
      S.site = p.id;
      S.claimed = true;
      S.refT = Date.now();
      this.db.world.sites[p.id] = this.db.key(playerData.name);
      if (first) playerData.mats.alloy[0] += 1;
      this.log(
        playerData,
        `Claimed a derelict station hull in ${SYS[p.system].name}.${first ? ' Its last crew left an Alloy I crate aboard.' : ' Your station progress moved with you.'}`,
      );
      this.toast(session, 'This hull is yours. Start Station Tier 1 when ready.');
      this.broadcast({
        t: 'chat',
        from: '',
        msg: `${session.name} claimed a station hull in ${SYS[p.system].name}.`,
      });
      this.db.touch();
      this.pushSites();
      this.you(session);
      this.landed(session);
      return;
    }
    if (!this.ownSite(playerData, p))
      return this.toast(session, 'Land at your Personal Station for that.');
    switch (message.op) {
      case 'upgrade': {
        const o = OPS[S.ops];
        if (!S.claimed || !o) break;
        if (playerData.credits < o.cost || !this.hasMats(playerData, o.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= o.cost;
        this.takeMats(playerData, o.mats);
        S.ops++;
        S.refT = Date.now();
        this.log(playerData, `Quantum Station reached Station Tier ${S.ops}: ${o.title}.`);
        this.toast(session, `Station Tier ${S.ops} complete: ${o.unlock}.`);
        if (S.ops === 3)
          this.toast(
            session,
            'Newcomer protection has ended at Station Tier 3: factions across the main galaxy now treat you like any other captain.',
          );
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${session.name}'s Personal Station reached Station Tier ${S.ops}.`,
        });
        this.pushSites();
        break;
      }
      case 'process': {
        // ore -> material crates
        if (S.ops < 1) return this.toast(session, 'Build Station Tier 1 first.');
        const ore = message.id,
          mat = ORE_PROCESS.to[ore];
        if (!mat) break;
        const have = playerData.cargo[ore] || 0,
          n = Math.min(
            Math.floor(have / ORE_PROCESS.per),
            Math.floor(playerData.credits / ORE_PROCESS.cost),
            message.all ? 99 : 1,
          );
        if (n <= 0)
          return this.toast(
            session,
            `You need ${ORE_PROCESS.per} t of ${COMMODITIES.find((c) => c.id === ore).name} and ${credits(ORE_PROCESS.cost)} credits per crate.`,
          );
        const g = Math.min(4, ORE_PROCESS.grade[S.ops] + (researchBonus(S).processGrade || 0));
        let take;
        try {
          take = planTake(
            playerData.cargo,
            playerData.cargoLots,
            ore,
            n * ORE_PROCESS.per,
            message.lots,
          );
        } catch {
          return this.toast(session, 'Those cargo grades are unavailable.');
        }
        applyTake(playerData.cargo, playerData.cargoLots, take);
        playerData.credits -= n * ORE_PROCESS.cost;
        playerData.mats[mat][g] += n;
        this.toast(
          session,
          `Processed ${n * ORE_PROCESS.per} t into ${n} ${mat} ${GRADES[g]} crate${n > 1 ? 's' : ''}.`,
        );
        break;
      }
      case 'collect': {
        if (!S.refUnits) return this.toast(session, 'The refinery has nothing ready.');
        const n = S.refUnits,
          cr = n * (2500 + S.ops * 1500);
        playerData.credits += cr;
        S.refUnits = 0;
        S.refT = Date.now();
        const got = [];
        for (let i = 0; i < n; i++) {
          const mt = MATERIALS[Math.floor(Math.random() * 3)],
            g = Math.min(
              4,
              Math.floor(Math.random() * (S.ops >= 4 ? 4 : S.ops >= 2 ? 3 : 2)) +
                (researchBonus(S).refineGrade && Math.random() < 0.5 ? 1 : 0),
            );
          playerData.mats[mt][g]++;
          got.push(`${mt} ${GRADES[g]}`);
        }
        this.toast(
          session,
          `Collected ${n} refinery unit${n > 1 ? 's' : ''}: ${credits(cr)} credits and ${got.join(', ')}.`,
        );
        break;
      }
      case 'research': {
        if (
          S.active ||
          ((RESEARCH.find((x) => x.id === message.id) || {}).needs &&
            !S.done.includes(RESEARCH.find((x) => x.id === message.id).needs))
        ) {
          this.features.hangar.queueResearch(session, message.id);
          break;
        }
        const r = RESEARCH.find((x) => x.id === message.id);
        if (!r || S.done.includes(r.id) || S.ops < r.ops) break;
        if (playerData.credits < r.cost || !this.hasMats(playerData, r.mats))
          return this.toast(session, 'You need the credits and materials listed.');
        playerData.credits -= r.cost;
        this.takeMats(playerData, r.mats);
        S.active = { id: r.id, ends: Date.now() + r.minutes * 60000 };
        this.toast(session, `Research started: ${r.name} (${r.minutes} minutes).`);
        break;
      }
      case 'hire':
      case 'dismiss':
        return this.toast(
          session,
          'Wingmates are ships now: buy them at your station shipyard and assign them to a dock (STATION, then DOCKS).',
        ); // 2.1
      case 'unqueue':
        S.queue = S.queue.filter((x) => x !== message.id);
        break;
      case 'defense':
        this.features.frontier.defenseUpgrade(session);
        break;
      case 'refine':
        this.features.hangar.refineUp(session, message.mat, message.g | 0, message.n | 0);
        break;
      case 'refit':
        return this.toast(session, 'Refits were retired in 2.6.');
      case 'relocate': {
        // warp the station to another unclaimed hull; you ride along
        const stellarBody = STELLARS[message.site],
          cost = relocateCost(S.ops),
          wait = (S.relocT || 0) + RELOCATE.cooldownH * 3600000 - Date.now();
        if (!stellarBody || !stellarBody.site || stellarBody.id === S.site)
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
            `Relocating needs ${credits(cost)} credits and ${RELOCATE.mats.map(([a, g]) => a + ' ' + GRADES[g]).join(', ')}.`,
          );
        if (session.trade)
          this.features.coop.tradeCancel(session.trade, 'The station is warping away.');
        const from = STELLARS[S.site];
        playerData.credits -= cost;
        this.takeMats(playerData, RELOCATE.mats);
        delete this.db.world.sites[S.site];
        S.site = stellarBody.id;
        S.relocT = Date.now();
        this.db.world.sites[stellarBody.id] = this.db.key(playerData.name);
        playerData.stellar = stellarBody.id;
        playerData.sys = stellarBody.system;
        if (from.system !== stellarBody.system) session.retaliationVisit = undefined;
        this.log(
          playerData,
          `Warped your Personal Station from ${SYS[from.system].name} to ${SYS[stellarBody.system].name}. Everything came along.`,
        );
        this.toast(session, `Station warp complete: welcome to ${SYS[stellarBody.system].name}.`);
        if (!this.solo)
          this.broadcast({
            t: 'chat',
            from: '',
            msg: `${playerData.name}'s Personal Station warped from ${SYS[from.system].name} to ${SYS[stellarBody.system].name}. The old hull is free to claim.`,
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
   * @param {Session} session Sending session.
   * @param {{msg: string, ch?: string}} m Chat message payload.
   * @returns {void}
   */
  chat(session, m) {
    const msg = String(m.msg || '')
      .slice(0, 240)
      .trim();
    if (!msg) return;
    const now = Date.now();
    if (now - session.chatT < 700) return;
    session.chatT = now;
    const sys = m.ch === 'sys',
      A = (m.ch === 'armada' || m.ch === 'fleet') && this.features.coop.armadaOf(session.data); // the fleet channel is now the Armada's
    if ((m.ch === 'armada' || m.ch === 'fleet') && !A)
      return this.toast(session, 'You are not in an Armada.');
    const deaf = (o) =>
      this.features.coop.blocked && this.features.coop.blocked(o.data, session.data.name); // blocked captains are not heard
    this.broadcast(
      {
        t: 'chat',
        from: session.name,
        msg,
        ch: A ? 'armada' : sys ? 'sys' : 'all',
        sys: session.data.sys,
        ship: sys && !A && session.ent?.state === 'fly' ? session.ent.id : null,
      },
      A
        ? (o) => o.data.armada === A.id && !deaf(o)
        : sys
          ? (o) => o.data.sys === session.data.sys && !deaf(o)
          : (o) => !deaf(o),
    );
  }

  /**
   * Suspends and deallocates an idle space simulation when no players are present.
   * @param {SpaceSpace} space Space instance to suspend.
   * @returns {void}
   */
  sleep(space) {
    for (const s of this.sessions.values())
      if (s.data?.sys === space.id) this.features.towing.detach(s);
    this.features.mining.suspendSpace(space);
    delete this.live[space.id];
  }
  // every two seconds: shuttles that have come home report in, finished research hands over to the queue
  /**
   * Periodic maintenance check per session: shuttle missions, research queue, and station ticks.
   * @param {Session} session Active session.
   * @returns {void}
   */
  idleCheck(session) {
    const playerData = session.data;
    this.features.hangar.hangarInit(playerData);
    const before =
      (playerData.station.active && playerData.station.active.id) +
      '|' +
      playerData.station.queue.length +
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
          playerData.station.queue.length +
          '|' +
          playerData.station.done.length +
          '|' +
          playerData.station.refUnits;
    const now = Date.now(),
      back = playerData.shuttles.filter((x) => x.state === 'out' && now >= x.ends);
    for (const sh of back) this.features.hangar.resolveShuttle(session, sh);
    if (back.length) {
      playerData.shuttles = playerData.shuttles.filter((x) => x.state !== 'gone');
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
   * @returns {void}
   */
  tick() {
    if (this.db.economicFrozen) return;
    if (this.paused) {
      if (![...this.sessions.values()].some((x) => x.data)) this.setPaused(false);
      return;
    } // solo pause
    this.features.mining.advanceClock(1 / TICK);
    this.tickN++;
    if (this.tickN % 60 === 0)
      for (const session of this.sessions.values()) {
        if (!session.data) continue;
        const owner = this.db.key(session.data.name),
          rw = this.db.world.refinery;
        if (
          !rw?.batches.some((b) => b.owner === owner && !b.credited && b.status !== 'cancelled') &&
          !rw?.orders.some((o) => o.owner === owner && o.status === 'accepted')
        )
          continue;
        const data = this.features.refinery.payload(session),
          signature = JSON.stringify([
            data.batches.map((b) => [b.id, b.status]),
            data.ready,
            data.orders,
          ]);
        if (signature !== session.refinerySignature) {
          session.refinerySignature = signature;
          this.send(session, { t: 'refinery', data });
        }
      }

    if (this.tickN % (TICK * 2) === 0) {
      for (const s of this.sessions.values())
        if (s.data) {
          this.idleCheck(s);
          this.features.fronts.missionIdle(s);
          this.features.syndicate.missionDeadlines(s);
          this.features.quests.questSweep(s);
          this.features.quests.questSalvageIdle(s);
          this.features.syndicate.bankTick(s);
          this.features.frontier.raidCheck(s);
          this.features.specialists.specIdle(s);
          this.features.hostile.holdoutTick(s);
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
      for (const sp of Object.values(this.live))
        if (sp.players > 0) this.features.rivals.rivalSync(sp);
    if (this.tickN % (TICK * 30) === 0) {
      const v = this.features.world.worldPayload(),
        k = JSON.stringify([v.anomalies, v.event.id, v.states]);
      if (k !== this.worldKey) {
        this.worldKey = k;
        this.broadcast(v);
      }
    }
    // Docked observers keep the real system awake without a player entity.
    const observed = new Set();
    for (const s of this.sessions.values())
      if (s.data?.stellar && STELLARS[s.data.stellar]) {
        observed.add(s.data.sys);
        void this.spaces[s.data.sys];
      }
    for (const sp of Object.values(this.live)) {
      const safeTick = () => {
        try {
          sp.tick();
        } catch (e) {
          sp.errs = (sp.errs || 0) + 1;
          if (sp.errs < 5) console.error('space tick error', sp.id, e);
        }
      };
      if (sp.players > 0 || observed.has(sp.id)) {
        sp.quietT = 0;
        safeTick();
      } else if (this.tickN % 15 === 0) {
        safeTick();
        sp.quietT = (sp.quietT || 0) + 15 / TICK;
        if (sp.quietT > 120 && !sp.keep) this.sleep(sp);
      }
    }
    if (this.tickN % 2) return;
    const bySys = {};
    for (const s of this.sessions.values())
      if (s.data && (s.ent || observed.has(s.data.sys)))
        (bySys[s.data.sys] = bySys[s.data.sys] || []).push(s);
    for (const [sys, list] of Object.entries(bySys)) {
      const snap = this.spaces[sys].snapshot();
      for (const s of list) {
        const e = s.ent;
        if (!e) {
          this.send(s, {
            t: 'scene',
            sys,
            ...snap,
            miningRocks: this.features.mining.rocksPayload(this.spaces[sys]),
          });
          continue;
        }
        this.send(
          s,
          JSON.stringify({
            t: 'snap',
            ...snap,
            miningRocks: this.features.mining.rocksPayload(this.spaces[sys]),
            mining: this.features.mining.payload(s, this.spaces[sys]),
            industrial: this.features.industrial.payload(s),
            towing: this.features.towing.payload(s),
            miningPressure: this.features.pressure.payload(s),
            miningHazards: this.features.pressure.hazards(sys),
            combat: this.combatAssist.payload(s, this.spaces[sys]),
            formation: !!s.armadaFormationTarget,
            me: [
              e.id,
              e.seq || 0,
              +e.x.toFixed(2),
              +e.y.toFixed(2),
              +e.vx.toFixed(2),
              +e.vy.toFixed(2),
              +e.a.toFixed(4),
              Math.round(e.shield),
              Math.round(e.armor),
              Math.round(e.fuel),
              e.target ? e.target.id : 0,
              e.guns.filter((g) => g.ammo !== Infinity).map((g) => [g.w, g.ammo]),
            ],
          }),
        );
      }
    }
    for (const sp of Object.values(this.live)) if (!bySys[sp.id]) sp.events = [];
  }
}
