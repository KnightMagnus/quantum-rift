import { purchaseUnit, saleValue } from './trade-pricing.js';
import {
  recordEconomy,
  beginEconomyTrip,
  arriveEconomyTrip,
  economyReceipt,
} from '../shared/economy-receipt.js';
import {
  migrateCargoLots,
  assertLots,
  planTake,
  applyTake,
  addLots,
  clearLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.js';
import { clampStanding } from '../shared/reputation.js';
import { eventideOffers } from '../shared/eventide.js';
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
 * @property {import('../shared/economy-receipt.js').EconomyReceipt} [economyReceipt] Recent trip cash flow; never a source of credits.
 * @property {import("./mining-contracts.js").SavedSurvey} [miningSurvey]
 * @property {Record<string,number>} [bp] Specialist blueprint fragments.
 * @property {string} name Captain name.
 * @property {number} credits Balance in credits.
 * @property {string} sys Current solar system ID.
 * @property {string|null} [stellar] Docked stellar or null while flying.
 * @property {string} [shipUid] Unique identifier for player ship.
 * @property {import('../shared/rules.js').ShipLoadout} ship Current active ship loadout.
 * @property {Record<string, number>} [cargo] Cargo inventory mapping commodity ID to tons.
 * @property {Record<string, number>} [rep] Reputation standings per faction.
 * @property {Record<string, number>} [tokens] Faction tokens balances.
 * @property {Record<string, number[]>} [mats] Crafting materials inventory grades.
 * @property {import('../shared/rules.js').StationState} [station] Personal station state and research tree.
 * @property {Array<{ship: import('../shared/rules.js').ShipLoadout, escorts?: Array<{ship: import('../shared/rules.js').ShipLoadout}>}>} [dock] Personal station stored ships.
 * @property {Array<{id: string, name: string, hull: number, busyUntil?: number}>} [shuttles] Station shuttle fleet.
 * @property {Array<import('../shared/rules.js').OfficerRecord>} [officers] Station officer roster.
 * @property {Record<string, string>} [bridge] Bridge officer assignments.
 * @property {Record<string, number | string | boolean>} [arcs] Story arc states.
 * @property {Record<string, import('../shared/quests.js').QuestRecord | number | boolean>} [quests] Active and completed missions.
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
 * @property {import('node:events').EventEmitter & {send: (data: string | Buffer | Uint8Array | import('./message-registry.js').NetworkMessage) => void, close: () => void, open: boolean, backlog: number}} sock Client WebSocket connection.
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
 * @property {import('./combat-assist.js').CombatState} [combat] Combat assist state for this session.
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
 * @property {import('../shared/quests.js').QuestRecord} [quest] Linked quest metadata.
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
import { createMessageRegistry } from './message-registry.js';
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
  FACTION_HULLS,
  FACTION_OUTFITS,
  EXTRA_OUTFITS,
  OPS,
  RESEARCH,
  REFINERY,
  ORE_PROCESS,
  STATION_SHIPS,
  WINGMATES,
  TRAFFIC,
  RELOCATE,
  relocateCost,
  SITES,
  SITE_PRICES,
} from '../shared/galaxy.js';
import {
  augmentAssets,
  shipStats,
  researchBonus,
  price,
  allOutfits,
  makeLoadout,
  loadoutValue,
  ensureStockOutfits,
  outfitSaleValue,
  stockOutfitLimit,
  K,
  DT,
  TICK,
  angleTo,
  credits,
} from '../shared/rules.js';
import { Space } from './space.js';
import { destType } from './syndicate.js';
import { synTier } from '../shared/syndicate.js';
import { STATES, TRADE_IMPACT } from '../shared/living.js';
import { WING_ONLY } from '../shared/docks.js';
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

const MAT_PRICE = [6000, 18000, 45000, 110000, 260000];
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
 * Clamps a numeric value between minimum and maximum bounds.
 * @param {number} v Input value.
 * @param {number} a Minimum bound.
 * @param {number} b Maximum bound.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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

/**
 * Quantum Rift master game engine.
 * Manages player accounts, client network sessions, world and system state,
 * trade markets, mission boards, station management, and game loops.
 * @property {import('../shared/rules.js').GameAssets} A Game assets object containing ships, weapons, outfits, and commodities.
 * @property {import('./db.js').DB} db Persistent JSON database instance for player accounts and world state.
 * @property {Record<string | number, import('../shared/rules.js').OutfitAsset>} O Outfit definitions lookup by ID.
 * @property {Record<string, import('./space.js').Space>} spaces Active simulated spaces by system ID, backed by live proxy.
 * @property {Map<number, Session>} sessions Connected client sessions by session ID.
 * @property {number} nextSid Next session identifier sequence number.
 * @property {number} tickN Server tick counter.
 * @property {Record<string, import('./space.js').Space>} live Cache of currently instantiated systems.
 * @property {import('./features.js').FeatureServices} features Modular feature service delegations.
 * @property {import('./combat-assist.js').CombatAssist} combatAssist Combat assist controller.
 * @property {import('./message-registry.js').MessageRegistry} messageHandlers Registered client message handlers.
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
  /** Legacy feature state; see docs/FEATURES.md. @type {{sys: string, boss: {name: string, hull: number}, until: number, ent: Entity, sp: import('./space.js').Space} | null | undefined} */
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
   * @param {import('../shared/rules.js').GameAssets} A Game assets object containing ships, weapons, outfits, and commodities.
   * @param {import('./db.js').DB} db Persistent JSON database instance for player accounts and world state.
   */
  constructor(A, db) {
    augmentAssets(A);
    this.A = A;
    this.db = db;
    this.O = allOutfits(A);
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
    /** @type {import('./features.js').FeatureServices} */
    this.features = createFeatures(this);
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
    }, 1000 / TICK); // 2.0.2: one bad ship never takes the server down
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
   * @param {PlayerData} sv Raw save object to import.
   * @returns {string} Sanitized name of imported captain.
   */
  importSave(sv) {
    if (!sv || typeof sv.name !== 'string' || !sv.ship || !sv.station)
      throw new Error('That is not a Quantum Rift save file.');
    const name = sv.name.trim().slice(0, 20);
    if (!/^[A-Za-z0-9 _'-]{3,20}$/.test(name)) throw new Error('Bad captain name in the save.');
    for (const o of this.sessions.values())
      if (o.data && o.data.name.toLowerCase() === name.toLowerCase())
        throw new Error('That captain is playing right now.');
    const imported = structuredClone(sv);
    migrateCargoLots(imported); // validate before replacing any existing slot
    const p = this.db.create(name, 'solo', {});
    for (const k of Object.keys(imported))
      if (!['__proto__', 'constructor', 'prototype', 'salt', 'hash'].includes(k))
        p[k] = imported[k];
    p.name = name;
    this.db.touch();
    this.db.flush();
    return name; // 2.0.3: own keys only
  }
  /**
   * System wake hook called when a space is accessed.
   * @param {import('./space.js').Space} sp Newly awakened space instance.
   * @returns {import('./space.js').Space} The space instance.
   */
  wake(sp) {
    return sp;
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
      } // 2.0.2: retired seed accounts are removed, and their holdings freed
      if (!c.name || !c.pass) continue;
      const have = this.db.get(c.name);
      if (have) {
        if (c.sync === true) this.syncSeed(have, c);
        continue;
      }
      const site = c.station?.fallback
        ? [c.station.site, ...SITES.map((s) => s.id)].find(
            (id) => STELLARS[id]?.site && !this.siteOwner(id),
          )
        : c.station?.site;
      if (c.station?.fallback && !site) {
        console.warn(`Cannot create seeded captain ${c.name}: no unclaimed station hull.`);
        continue;
      }
      const d = this.fresh();
      d.tut = c.tutorial ? 0 : TUTORIAL.length; // seeded veterans skip the tutorial
      d.explored = SYSTEMS.filter((x) => x.anchor).map((x) => x.id);
      if (c.credits !== undefined) d.credits = c.credits;
      if (c.rep) Object.assign(d.rep, c.rep);
      if (c.extra) Object.assign(d, JSON.parse(JSON.stringify(c.extra))); // 1.2: test seeds can set standing, Syndicate points, commendations...
      if (c.ship) d.ship = makeLoadout(this.A, c.ship, c.shipName || 'Rift Runner');
      if (c.outfits)
        for (const [o, n] of Object.entries(c.outfits))
          d.ship.outfits[o] = (d.ship.outfits[o] || 0) + n;
      if (c.station) {
        const st = d.station;
        st.claimed = true;
        st.ops = c.station.ops || 0;
        st.refT = Date.now();
        if (c.station.research === 'all') st.done = RESEARCH.map((r) => r.id);
        if (site && STELLARS[site] && !this.siteOwner(site)) {
          st.site = site;
          this.db.world.sites[site] = this.db.key(c.name);
        }
      }
      if (c.mats) for (const m of MATERIALS) d.mats[m] = c.mats.slice();
      if (c.system && SYS[c.system]) {
        d.sys = c.system;
        d.stellar = c.stellar || d.stellar;
      }
      if (c.station?.fallback && site) {
        d.sys = STELLARS[site].system;
        d.stellar = site;
      }
      const p = this.db.create(c.name, c.pass, d);
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
   * @param {PlayerData} p Player save record.
   * @param {{station?: {ops?: number, research?: string}, ships?: Array<{hull: number}>}} c Seed definition configuration.
   * @returns {void}
   */
  syncSeed(p, c) {
    this.features.hangar.hangarInit(p);
    const st = p.station,
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
      this.db.world.sites[want.site] = this.db.key(p.name);
    }
    if (want.shuttles === 'all')
      for (const kind of Object.keys(SHUTTLES))
        if (
          !p.shuttles.some((x) => x.kind === kind) &&
          p.shuttles.length < this.features.hangar.bays(p)
        )
          p.shuttles.push({
            id: this.features.hangar.uid(p),
            kind,
            state: 'idle',
            crew: null,
            runs: 0,
          });
    if (c.officers && !p.officers.some((o) => o.seed))
      for (const [i, o] of c.officers.entries()) {
        const off = {
          id: this.features.hangar.uid(p),
          seed: true,
          name: o.name,
          race: o.race,
          role: o.role,
          rarity: o.rarity ?? 3,
          lv: o.lv || 10,
          xp: 0,
        };
        p.officers.push(off);
        if (o.slot) p.bridge[o.slot] = off.id;
      }
    if (c.mats)
      for (const m of MATERIALS) p.mats[m] = p.mats[m].map((n, g) => Math.max(n, c.mats[g]));
    p.tut = TUTORIAL.length; // showcase captains skip the career guide
    if (c.storyPass) {
      this.features.story.storyInit(p);
      p.story.pass = true;
    }
    if (c.blueprints) {
      p.bp = p.bp || {};
      for (const id of Object.keys(SPEC)) p.bp[id] = Math.max(p.bp[id] || 0, c.blueprints);
    }
    if (c.fleet && !p.seedFleet) this.seedFleet(p, c.fleet);
    console.log('Synced seeded captain', c.name);
  }
  // 2.1 playtest seeds: fill the docks with ships and crew them, once ({ docks: [{ lead, name, wings: [hulls] }], crew: [...officers], spare: [...officers] })
  /**
   * Sets up a test seed captain's docks with ships, wingmates, and officers.
   * @param {PlayerData} p Player save record.
   * @param {{docks?: Array<{lead?: number, name?: string, wings?: number[]}>, crew?: Array<{role: string, rarity: string, lv?: number}>, spare?: Array<{role: string, rarity: string, lv?: number}>}} F Seed fleet configuration with docks, crew, and ships.
   * @returns {void}
   */
  seedFleet(p, F) {
    this.features.docks.docksInit(p);
    p.seedFleet = true;
    const crew = [...(F.crew || [])],
      newOff = (o) => {
        const off = {
          id: this.features.hangar.uid(p),
          seed: true,
          name: o.name,
          race: o.race,
          role: o.role,
          rarity: o.rarity ?? 2,
          lv: o.lv || 10,
          xp: 0,
        };
        p.officers.push(off);
        return off.id;
      };
    (F.docks || []).forEach((D, i) => {
      if (i >= p.docks.length) return;
      if (D.lead) {
        const ship = makeLoadout(this.A, D.lead, D.name || this.A.ships[D.lead].name);
        ship.uid = this.features.docks.shipUid(p);
        if (i === p.activeDock) {
          p.ship = ship;
          p.shipless = false;
          p.docks[i].lead = ship.uid;
        } // a test account: the old ship is simply replaced
        else {
          p.dock.push({ ship, bridge: {} });
          p.docks[i].lead = ship.uid;
        }
      }
      p.docks[i].wings = (D.wings || []).map((h) => {
        const ship = makeLoadout(this.A, h, this.A.ships[h].name);
        ship.uid = this.features.docks.shipUid(p);
        p.dock.push({ ship, bridge: {} });
        const cap = crew.length ? newOff(crew.shift()) : null,
          mate = crew.length ? newOff(crew.shift()) : null;
        return { uid: ship.uid, cap, crew: mate };
      });
    });
    for (const o of F.spare || []) newOff(o);
    this.features.docks.docksInit(p);
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
   * @param {Session} s Session disconnecting.
   * @returns {void}
   */
  disconnect(s) {
    if (s.data) this.features.towing.detach(s);
    if (s.data) this.features.industrial.stop(s);
    if (s.data && this.sessions.has(s.id)) this.features.coop.coopLogout(s); // 2.6: duels, trades, presence
    this.sessions.delete(s.id);
    for (const q of Object.values(this.arenaQ || {})) {
      const i = q.indexOf(s.id);
      if (i >= 0) q.splice(i, 1);
    }
    if (s.data && this.matches && this.matches[s.data.sys]) {
      this.matches[s.data.sys].alive.delete(s.data.name);
      s.data.stellar = s.data.arenaReturn || 'qstation';
    }
    if (s.ent) {
      const d = s.data,
        sp = this.spaces[d.sys],
        e = s.ent;
      this.dropEscorts(sp, e);
      sp.remove(e);
      sp.players--;
      s.ent = null;
      // logging off in space: you are docked at the nearest world in the same system, or back at your last landing
      const here = SYS[d.sys].stellars
        .filter(
          (p) => p.svc.includes('L') && !(p.site && this.siteOwner(p.id) && !this.ownSite(d, p)),
        )
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (here) d.stellar = here.id;
      else {
        const back = d.lastStellar && STELLARS[d.lastStellar] ? d.lastStellar : START.stellar;
        d.stellar = back;
        d.sys = STELLARS[back].system;
      }
      d.fuel = e.fuel;
    }
    if (s.data) {
      // End a Solo confirmation pause before another captain can sign in between ticks.
      if (this.solo && ![...this.sessions.values()].some((x) => x.data)) this.setPaused(false);
      this.db.touch();
      this.db.flush(); // Commit the final dock/flight state before a deliberate account switch.
      if (!this.solo) this.broadcast({ t: 'chat', from: '', msg: `${s.name} left the Rift.` });
    }
  }
  /**
   * Sends a message payload to a client session if socket is open and backlog is acceptable.
   * @param {Session | import('./contracts.js').CommandSession} s Destination session.
   * @param {string | import("./message-registry.js").NetworkMessage} m Message object or string to send.
   * @returns {void}
   */
  send(s, m) {
    if ('sock' in s && s.sock && s.sock.open && s.sock.backlog < 4e6) s.sock.send(m);
  }
  /**
   * Sends a transient toast banner message to the player's UI.
   * @param {Session | import('./contracts.js').CommandSession} s Recipient session.
   * @param {string} msg Notification banner message text.
   * @returns {void}
   */
  toast(s, msg) {
    this.send(s, { t: 'toast', msg });
  }
  /**
   * Broadcasts a JSON message to all authenticated sessions matching an optional predicate.
   * @param {string | import("./message-registry.js").NetworkMessage} m Message payload to broadcast.
   * @param {((s: Session) => boolean)} [filter] Optional predicate to filter sessions.
   * @returns {void}
   */
  broadcast(m, filter) {
    const str = JSON.stringify(m);
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
   * @param {Session | import('./contracts.js').CommandSession} s Player session.
   * @returns {void}
   */
  you(s) {
    const d = s.data;
    this.features.docks.docksInit(d);
    this.checkStation(d);
    const st = this.features.shipStats.stats(d);
    this.send(s, {
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
        refinery: this.features.refinery.payload(s),
        industrial: this.features.industrial.payload(s),
        towing: this.features.towing.payload(s),
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
        arena: this.features.frontier.arenaPayload(d, s),
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
        fuel: s.ent ? s.ent.fuel : (d.fuel ?? st.fuel),
        cargoUsed: Object.values(d.cargo).reduce((a, b) => a + b, 0),
        jobCargo: this.jobCargo(d),
        duel: this.features.coop.duelPayload(s),
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
    for (const st of SITES) {
      const o = this.siteOwner(st.id);
      if (o) out[st.id] = { owner: o.name, ops: o.station.ops };
    }
    return out;
  }
  /**
   * Checks whether player owns the station hull at stellar body p.
   * @param {PlayerData} d Player save data.
   * @param {StellarBody} p Stellar body.
   * @returns {boolean} True if player owns this station site.
   */
  ownSite(d, p) {
    return !!(p && p.site && d.station.site === p.id);
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
   * @param {Session} s Player session.
   * @param {string} ev Tutorial trigger event identifier.
   * @returns {void}
   */
  tut(s, ev) {
    // advance the first-flight tutorial if this event is the current goal
    const d = s.data;
    if (d.tut == null || d.tut >= TUTORIAL.length) return;
    const T = TUTORIAL[d.tut];
    if (ev !== '*check' && T.ev !== ev) return;
    if (ev === '*check' && !(T.check && T.check(d, this.A))) return;
    d.credits += T.reward;
    if (T.mat) d.mats[T.mat[0]][T.mat[1]] += T.mat[2];
    d.tut++;
    this.toast(
      s,
      `Career: ${T.title} complete. +${credits(T.reward)} credits${T.mat ? ` and a ${T.mat[0]} ${GRADES[T.mat[1]]} crate` : ''}.`,
    );
    this.log(d, `Career goal "${T.title}" complete.`);
    if (d.tut >= TUTORIAL.length)
      this.toast(s, 'Career guide complete. The Rift is yours, Captain.');
    this.db.touch();
    this.you(s);
  }
  // 2.0.3: newcomer protection lasts until your Personal Station reaches Station Tier 3 (see Space.spared)
  // 2.0.3: cargo carried for jobs takes up real hold space
  /**
   * Calculates total cargo tonnage allocated to active delivery and smuggling jobs.
   * @param {{missions?: Array<Pick<Mission, 'type' | 'qty'>>}} d Player mission cargo.
   * @returns {number} Cargo space currently allocated to active cargo and smuggling missions.
   */
  jobCargo(d) {
    return (d.missions || [])
      .filter((m) => m.type === 'cargo' || m.type === 'smuggle')
      .reduce((a, m) => a + (m.qty || 0), 0);
  }
  /**
   * Calculates total hold space currently used by commodities and job cargo.
   * @param {{cargo: Record<string, number>, missions?: Array<Pick<Mission, 'type' | 'qty'>>}} d Commodity and mission cargo.
   * @returns {number} Total cargo hold tonnage used by trade commodities and mission cargo.
   */
  holdUsed(d) {
    return Object.values(d.cargo).reduce((a, b) => a + b, 0) + this.jobCargo(d);
  }
  /**
   * Calculates passenger berths occupied by active passenger missions.
   * @param {PlayerData} d Player save data.
   * @returns {number} Passenger berths occupied by active passenger missions.
   */
  jobBunks(d) {
    return occupiedPassengerSeats(d.missions);
  }
  // Check the actual destination loadout for swaps; purchases use the stock loadout.
  /**
   * Checks if candidate hull or ship loadout can accommodate current cargo, missions, and passengers.
   * @param {PlayerData} d Player save data.
   * @param {number | {hull: number, outfits: Record<string, number>}} hullOrShip Candidate ship hull ID or loadout.
   * @param {boolean} [goods=true] Whether to include commodities in calculation.
   * @returns {string | null} Failure explanation reason, or null if ship fits.
   */
  fitsJobs(d, hullOrShip, goods = true) {
    const hull = typeof hullOrShip === 'object' ? hullOrShip.hull : hullOrShip;
    const H = this.A.ships[hull];
    if (!H) return 'Unknown hull.';
    const ship = typeof hullOrShip === 'object' ? hullOrShip : makeLoadout(this.A, hull, '');
    const need = (goods ? Object.values(d.cargo).reduce((a, b) => a + b, 0) : 0) + this.jobCargo(d),
      cap = shipStats(this.A, ship).cargo;
    if (need > cap)
      return `The ${H.name} can't hold your ${need} t of cargo${this.jobCargo(d) ? ' (including job cargo)' : ''}.`;
    const pax = this.jobBunks(d);
    if (pax > passengerSeats(H, ship))
      return `The ${H.name} doesn't have seats for your ${pax} passenger${pax > 1 ? 's' : ''}.`;
    return null;
  }
  // 2.0.3: when you leave a system, your escorts go with you; a rival flying alongside goes back to their own business
  /**
   * Cleans up or returns escort wingmates and fighter drones when a ship leaves space.
   * @param {import('./space.js').Space} space Active system space simulation.
   * @param {Entity} e Leader entity leaving or destroyed.
   * @param {string} [why] Removal reason (e.g. 'jump').
   * @returns {void}
   */
  dropEscorts(space, e, why) {
    if (e.player?.s) this.features.industrial.stop(e.player.s);
    const ids = new Set([e.id]);
    for (let k = 0; k < 3; k++)
      for (const x of space.ships.values()) if (x.owner && ids.has(x.owner)) ids.add(x.id); // escorts, and their fighters
    for (const x of [...space.ships.values()]) {
      if (x === e || !ids.has(x.id)) continue;
      if (x.fighterOf === e.id) {
        space.dock(x, e);
        continue;
      } // 2.1: drones still out go back into their bays
      if (x.rival && x.owner === e.id) {
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
  // 2.0.3: pausing a solo game stops the clock on rush deadlines and loan payments (station timers still run in real time)
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
   * @param {PlayerData} d Player save data.
   * @returns {boolean} True if player qualifies for newcomer protection.
   */
  newcomer(d) {
    return !!d && !d.noShield && !((d.station && d.station.ops) >= 3);
  }
  /**
   * Warns protected captains when jumping into lawless or dangerous systems.
   * @param {Session} s Player session.
   * @param {SpaceSystem} S Destination space system.
   * @returns {void}
   */
  protectNote(s, S) {
    // Warn once on crossing the Gateway: the main-map truce does not reach Farside.
    const d = s.data;
    if (!this.newcomer(d) || d.protWarned) return;
    if (S.farside) {
      d.protWarned = true;
      this.toast(
        s,
        `Newcomer protection does not reach ${S.name}: this is Farside, where normal hostility applies.`,
      );
    }
  }
  /**
   * Appends an entry to the captain's log history (capped at 200 entries).
   * @param {PlayerData} d Player save data.
   * @param {string} text Entry text to append.
   * @returns {void}
   */
  log(d, text) {
    d.log.push({ t: Date.now(), text });
    if (d.log.length > 200) d.log.shift();
  }

  // Fixed routes; authentication, flood and activity gates remain in onMessage.
  /**
   * Builds the message router table binding route actions to feature services and handlers.
   * @returns {import('./message-registry.js').MessageRegistry} Initialized message registry dispatcher.
   */
  createMessageHandlers() {
    return createMessageRegistry([
      ['towing', (s, m) => this.features.towing.command(s, m)],
      ['industrial', (s, m) => this.features.industrial.command(s, m)],
      ['miningPressure', (s, m) => this.features.pressure.consent(s, m)],
      ['refinery', (s, m) => this.features.refinery.command(s, m)],
      ['miningOrder', (s, m) => this.features.refinery.command(s, m, true)],
      [
        'mining',
        (s, m) => {
          this.features.mining.survey(s, m);
        },
      ],
      [
        'combat',
        /**
         * Dispatches combat assist autopilot mode command.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.combatAssist.command(s, m);
        },
      ],
      [
        'input',
        /**
         * Processes raw ship flight controls (thrust, turn, afterburner, weapons fire).
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          if (
            (m.th || m.tu || m.ab || m.rv || m.f1 || m.f2) &&
            s.combat &&
            (s.combat.on || s.combat.consent)
          )
            this.combatAssist.manual(s);
          if (s.ent && s.inputs.length < 8)
            s.inputs.push({
              seq: m.seq | 0,
              thrust: m.th ? 1 : 0,
              turn: clamp(m.tu | 0, -1, 1),
              ab: m.ab ? 1 : 0,
              rev: m.rv ? 1 : 0,
              fire1: m.f1 ? 1 : 0,
              fire2: m.f2 ? 1 : 0,
              navigation: !!m.nav,
            });
          return;
        },
      ],
      [
        'target',
        /**
         * Selects or clears current combat target entity.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          if (s.ent) {
            const sp = this.spaces[d.sys];
            s.ent.target = m.id ? sp.ships.get(m.id) || null : null;
            this.combatAssist.selected(s, s.ent.target, sp);
            if (s.ent.target) this.tut(s, 'target');
          }
          return;
        },
      ],
      [
        'tutskip',
        /**
         * Skips career tutorial guide to completion.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          if (d.tut != null && d.tut < TUTORIAL.length) {
            d.tut = TUTORIAL.length;
            this.you(s);
          }
          return;
        },
      ],
      [
        'land',
        /**
         * Requests landing at target stellar body.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.combatAssist.stop(s, 'Travel or boarding');
          this.land(s, m.stellar);
          return;
        },
      ],
      [
        'depart',
        /**
         * Requests launch from currently docked stellar body into space.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.depart(s);
          return;
        },
      ],
      [
        'jump',
        /**
         * Initiates hyperjump to connected system.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.combatAssist.stop(s, 'Travel or boarding');
          this.jump(s, m.to);
          return;
        },
      ],
      [
        'trade',
        /**
         * Executes commodity buy or sell transaction at docked market.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.trade(s, m.cid, m.qty | 0, m.lots);
          return;
        },
      ],
      [
        'buyship',
        /**
         * Purchases a ship from shipyard for flagship or hangar storage.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          if (m.store) this.features.docks.buyToHangar(s, m.hull | 0);
          else this.buyShip(s, m.hull | 0);
          return;
        },
      ],
      [
        'docks',
        /**
         * Dispatches drydock operations (ship loadouts, wing assignments).
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.docks.docksOp(s, m);
          return; // 2.1
        },
      ],
      [
        'questdrop',
        /**
         * Abandons an active story quest.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          if (typeof m.qid === 'string') {
            this.features.quests.questFail(s, m.qid, 'abandoned');
            this.you(s);
            if (d.stellar) this.landed(s);
          }
          return; // 2.4
        },
      ],
      [
        'outfit',
        /**
         * Purchases or sells ship outfits and ammunition.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.outfit(s, m.id | 0, m.n | 0);
          return;
        },
      ],
      [
        'accept',
        /**
         * Accepts mission from stellar job board.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.accept(s, m.id);
          return;
        },
      ],
      [
        'abandon',
        /**
         * Abandons an active mission.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          {
            // 2.0.3: an abandoned bounty's target leaves too
            const gone = d.missions.find((x) => x.id === m.id);
            if (!gone) return;
            if (gone.type === 'miningOrder')
              return this.features.refinery.command(
                s,
                { t: 'miningOrder', op: 'cancelOrder', id: gone.id, port: gone.dest },
                true,
              );
            d.missions = d.missions.filter((x) => x !== gone);
            if (gone.quest) this.features.quests.questFail(s, gone.quest.qid, 'abandoned'); // 2.4: abandoning a step ends the story
            if (gone.sys && this.live[gone.sys]) {
              const sp = this.live[gone.sys];
              for (const x of [...sp.ships.values()])
                if (x.mission && x.mission.id === gone.id) {
                  x.mission = null;
                  x.ai = 'leave';
                  x.target = null;
                  x.life = 0;
                }
            }
            this.log(d, `Abandoned: ${gone.title}.`);
            this.db.touch();
            this.you(s);
            if (d.stellar) this.landed(s);
            return;
          }
        },
      ],
      [
        'station',
        /**
         * Performs Personal Station operations (claim, upgrade, refinery, research, relocate).
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.station(s, m);
          return;
        },
      ],
      [
        'buymat',
        /**
         * Purchases or sells engineering materials at station or commodity hub.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.buyMat(s, m.mat, m.grade | 0, m.n | 0);
          return;
        },
      ],
      [
        'rename',
        /**
         * Renames current flagship.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          if (typeof m.name === 'string' && !d.shipless) {
            d.ship.name =
              m.name.replace(/[<>]/g, '').trim().slice(0, 28) || this.A.ships[d.ship.hull].name;
            this.you(s);
          }
          return;
        },
      ],
      [
        'note',
        /**
         * Adds a custom captain's log note entry.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          if (typeof m.text === 'string' && m.text.trim()) {
            this.log(d, m.text.slice(0, 500));
            this.you(s);
          }
          return;
        },
      ],
      [
        'chat',
        /**
         * Sends chat message to system, global, or Armada channels.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.chat(s, m);
          return;
        },
      ],
      [
        'officer',
        /**
         * Performs bridge officer assignments, recruitment, and promotions.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.hangar.officerOp(s, m);
          return;
        },
      ],
      [
        'shuttle',
        /**
         * Dispatches or manages automated trade and mining shuttles.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.hangar.shuttleOp(s, m);
          return;
        },
      ],
      [
        'dock',
        /**
         * Manages hangar ship storage and swap operations.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.hangar.dockOp(s, m);
          return;
        },
      ],
      [
        'board',
        /**
         * Boards disabled enemy ship or performs rescue operation.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.combatAssist.stop(s, 'Travel or boarding');
          this.features.hangar.board(s, m);
          return;
        },
      ],
      [
        'spec',
        /**
         * Performs ship specialization tier upgrades and modification.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.specialists.specOp(s, m);
          return;
        },
      ],
      [
        'armada',
        /**
         * Performs co-op Armada formation, invites, and group commands.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.coop.armadaOp(s, m);
          return; // 2.6: the co-op group (was the solo-armada summon)
        },
      ],
      [
        'holdout',
        /**
         * Initiates survival holdout wave combat event.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.hostile.holdoutStart(s);
          return;
        },
      ],
      [
        'storyacc',
        /**
         * Accepts main storyline progression chapter.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.story.storyAccept(s, m);
          return;
        },
      ],
      [
        'social',
        /**
         * Dispatches social operations: friend requests, direct messages, blocks.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.coop.socialOp(s, m);
          return; // 2.6: friends, DMs, blocks
        },
      ],
      [
        'trade2',
        /**
         * Conducts secure station-to-station cargo and credit trade between captains.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.coop.tradeOp(s, m);
          return; // 2.6: trading between stations
        },
      ],
      [
        'duel',
        /**
         * Initiates or accepts formal non-lethal captain duel challenge.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.coop.duelOp(s, m);
          return; // 2.6: agreed duels
        },
      ],
      [
        'goal',
        /**
         * Claims milestone reward for faction war front goal.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.fronts.claimGoal(s, m);
          return;
        },
      ],
      [
        'store',
        /**
         * Purchases items from faction front milestone store.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.fronts.storeBuy(s, m);
          return;
        },
      ],
      [
        'colony',
        /**
         * Dispatches frontier planet colonization and outpost development operations.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.frontier.colonyOp(s, m);
          return;
        },
      ],
      [
        'arena',
        /**
         * Enters matchmaking queue or manages combat arena operations.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.frontier.arenaOp(s, m);
          return;
        },
      ],
      [
        'exchange',
        /**
         * Exchanges faction victory tokens and currencies.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.frontier.exchangeOp(s, m);
          return;
        },
      ],
      [
        'boards',
        /**
         * Requests community competitive leaderboard data.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.send(s, {
            t: 'boards',
            cat: m.cat,
            list: this.features.frontier.leaderboard(m.cat),
          });
          return;
        },
      ],
      [
        'profile',
        /**
         * Requests public captain career and combat profile.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.send(s, { t: 'profile', p: this.features.frontier.profile(m.name) });
          return;
        },
      ],
      [
        'ping',
        /**
         * Responds to client latency measurement ping with pong.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.send(s, { t: 'pong', c: m.c });
          return;
        },
      ],
      [
        'hail',
        /**
         * Initiates radio comms hail to target stellar or ship.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.hail.hail(s, m);
          return; // 1.1
        },
      ],
      ['hailin', (s, m) => this.hails.request(s, m)],
      [
        'hailopt',
        /**
         * Selects dialogue conversation choice during active radio hail.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.hail.hailOpt(s, m);
          return;
        },
      ],
      [
        'order',
        /**
         * Issues fleet command order to escort wingmates.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          if (s.ent) {
            if (m.o === 'attack' && s.ent.order !== 'attack')
              this.combatAssist.attack(s, this.spaces[s.data.sys]);
            else this.combatAssist.stop(s, 'Fleet order');
          }
          this.features.fleetcmd.fleetOrder(s, m.o);
          return;
        },
      ],
      [
        'jettison',
        /**
         * Jettisons cargo into space to lighten ship or distract raiders.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.fleetcmd.jettison(s, m.cid, m.n | 0, m.lots);
          return;
        },
      ],
      [
        'rivals',
        /**
         * Requests status payload of active AI rival captains.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          const d = s.data;
          this.send(s, { t: 'rivals', list: this.features.rivals.rivalsPayload(d) });
          return;
        },
      ],
      [
        'bm',
        /**
         * Purchases illicit contraband from syndicate black market.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.syndicate.bmBuy(s, m.id);
          return;
        },
      ],
      [
        'arcacc',
        /**
         * Accepts faction campaign story arc.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.arcs.arcAccept(s, m.fac);
          return; // 1.2
        },
      ],
      [
        'promote',
        /**
         * Claims syndicate crime tier promotion.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.syndicate.promote(s, m.id);
          return;
        },
      ],
      [
        'lower',
        /**
         * Dispatches lower deck syndicate crew operations.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.syndicate.lowerDeck(s, m);
          return;
        },
      ],
      [
        'bank',
        /**
         * Performs Syndicate bank loan borrowing and repayment.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          this.features.syndicate.bankOp(s, m);
          return;
        },
      ],
      [
        'pause',
        /**
         * Toggles solo play game pause state.
         * @param {Session} s Player session.
         * @param {import("./message-registry.js").NetworkMessage} m Message payload.
         */
        (s, m) => {
          if (this.solo && [...this.sessions.values()].filter((x) => x.data).length === 1) {
            this.setPaused(!this.paused);
            this.send(s, { t: 'paused', on: this.paused });
          }
          return;
        },
      ],
    ]);
  }

  /**
   * Ingests, rate-limits, authenticates, and dispatches an incoming client message.
   * @param {Session} s Source session.
   * @param {import("./message-registry.js").NetworkMessage} m Incoming parsed client message.
   * @returns {void}
   */
  onMessage(s, m) {
    const now = Date.now();
    if (now - s.msgT > 1000) {
      s.msgT = now;
      s.msgs = 0;
    }
    if (++s.msgs > 120) return; // flood guard
    if (!s.data) {
      if (m.t === 'hello') this.hello(s, m);
      return;
    }
    if (this.db.economicFrozen && !['ping', 'input', 'chat'].includes(m.t))
      return this.toast(s, 'Checkpoint recovery required; economic actions frozen.');
    if (m.t !== 'ping') s.actT = now; // 2.6: for Online / Away
    this.messageHandlers.dispatch(m.t, s, m);
  }
  /**
   * Handles player login authentication and new account registration.
   * @param {Session} s Unauthenticated session.
   * @param {{name: string, pass: string}} m Authentication handshake payload.
   * @returns {void}
   */
  hello(s, m) {
    const name = String(m.name || '').trim(),
      pass = String(m.pass || '');
    if (
      !/^[A-Za-z0-9 _'-]{3,20}$/.test(name) ||
      /^(__proto__|constructor|prototype|hasownproperty|tostring|valueof)$/i.test(name.trim())
    )
      return this.send(s, { t: 'error', msg: 'Pick a captain name of 3-20 letters or numbers.' });
    if (pass.length < 4 && !this.solo)
      return this.send(s, { t: 'error', msg: 'Your password needs at least 4 characters.' });
    // failed-login throttle: 6 misses per name or per address in 10 minutes locks that name/address out for the rest of the window
    const now = Date.now(),
      fk = ['n:' + name.toLowerCase(), 'i:' + s.ip];
    this.fails = this.fails || new Map();
    for (const k of fk) {
      const f = this.fails.get(k);
      if (f && now - f.t > 600000) this.fails.delete(k);
    }
    if (fk.some((k) => (this.fails.get(k) || { n: 0 }).n >= 6))
      return this.send(s, {
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
        return this.send(s, { t: 'error', msg: 'Wrong password for that captain.' });
      }
    } else {
      p = this.db.create(name, pass || 'solo', this.fresh());
      this.log(p, 'Took command of the Gnat Skiff "Rift Runner" at Quantum Station.');
      s.isNew = true;
    }
    for (const o of this.sessions.values())
      if (o !== s && o.data === p) {
        this.send(o, { t: 'error', msg: 'Signed in somewhere else.' });
        o.sock.close();
        this.disconnect(o);
      }
    try {
      if (migrateCargoLots(p).changed) this.db.touch();
    } catch (error) {
      console.error('Cargo save rejected:', name, error.message);
      return this.send(s, {
        t: 'error',
        msg: 'Cargo save validation failed. Contact the server operator.',
      });
    }
    s.data = p;
    s.name = p.name;
    p.id = s.id;
    tutMigrate(p);
    this.features.hangar.hangarInit(p);
    this.features.coop.coopMigrate(p);
    this.features.docks.docksInit(p);
    this.features.hostile.hostInit(p);
    this.features.story.storyInit(p);
    this.features.syndicate.synInit(p);
    this.features.arcs.arcsInit(p);
    if (!p.explored) p.explored = SYSTEMS.filter((x) => x.anchor).map((x) => x.id); // captains from before 0.4 know the old 30 systems
    s.rep = p.rep;
    s.id = s.id;
    if (!STELLARS[p.stellar]) {
      p.sys = START.system;
      p.stellar = START.stellar;
    }
    if (STELLARS[p.stellar].system !== p.sys) p.sys = STELLARS[p.stellar].system; // repair saves from the old log-off bug
    this.send(s, { t: 'welcome', id: s.id, name: p.name });
    this.send(s, { t: 'sites', sites: this.sitesPayload() });
    this.send(s, this.features.world.worldPayload());
    this.features.coop.coopLogin(s); // 2.6: Armada membership, offline DMs, friends' status
    this.idleCheck(s);
    this.you(s);
    this.landed(s);
    this.features.story.storyOnLand(s, STELLARS[p.stellar]);
    this.features.arcs.arcOnLand(s, STELLARS[p.stellar]); // a story step waiting where you logged off still pops up
    if (!this.solo) this.broadcast({ t: 'chat', from: '', msg: `${p.name} entered the Rift.` }); // 2.4: no join messages in a solo game
    if (s.isNew)
      this.toast(
        s,
        'Newcomer protection: ambient factions and pirates across the main galaxy overlook you until Station Tier 3. Stray fire can still hurt; attacking or taking combat jobs permits retaliation. Farside is unprotected.',
      );
  }
  // player-facing reference used by Space (id, name, rep, inputs)
  /**
   * Constructs player reference descriptor used by Space simulation to bridge entity and session.
   * @param {Session} s Player session.
   * @returns {PlayerReference} Player reference descriptor for Space.
   */
  pref(s) {
    return {
      id: s.id,
      name: s.name,
      rep: s.data.rep,
      get inputs() {
        return s.inputs;
      },
      get lastInput() {
        return s.lastInput;
      },
      set lastInput(v) {
        s.lastInput = v;
      },
      s,
    };
  }

  // ------------------------------------------------------------------ space: depart, land, jump
  /**
   * Spawns player ship and active wingmates into space system simulation.
   * @param {Session} s Player session.
   * @param {number} x Coordinate X.
   * @param {number} y Coordinate Y.
   * @param {number} a Heading angle in radians.
   * @param {number} v Initial velocity magnitude.
   * @returns {void}
   */
  spawnPlayer(s, x, y, a, v) {
    this.features.towing.detach(s);
    if (!s.data.ship.uid) s.data.ship.uid = this.features.docks.shipUid(s.data);
    if (s.combat) this.combatAssist.stop(s, 'New flight state; rearm explicitly');
    const d = s.data,
      sp = this.spaces[d.sys];
    sp.beginVisit(s);
    const e = sp.makeShip({
      loadout: d.ship,
      bonus: this.features.bonuses.bonus(d),
      faction: 'quantum',
      x,
      y,
      a,
      vx: Math.sin(a) * v,
      vy: -Math.cos(a) * v,
      player: this.pref(s),
      fuel: d.fuel,
      ammo: d.ship.ammo,
      shield: d.shieldNow,
      armor: d.armorNow,
    });
    s.ent = e;
    s.inputs = [];
    sp.players++;
    e.elite = masteryTier((d.mastery || {})[d.ship.hull] || 0) >= 5;
    const eb = this.features.specialists.flying(d, 'herald')
      ? { shieldPct: 25 * this.features.specialists.power(d) }
      : this.features.specialists.flying(d, 'tidecaller')
        ? { shieldRePct: 40 * this.features.specialists.power(d) }
        : {};
    for (const { w, i, x: W } of this.features.docks.activeWings(d)) {
      // 2.1: the active dock's wingmates, with their own outfits and officers
      const wb = this.features.docks.wingBonus(d, w);
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
      m.wingOf = s.id;
    }
    for (const m of d.missions)
      if (
        m.type === 'bounty' &&
        m.sys === d.sys &&
        !m.done &&
        ![...sp.ships.values()].some((x) => x.mission && x.mission.id === m.id)
      ) {
        m.spawned = true;
        sp.spawnMissionTarget({ ...m, owner: s.id });
        this.toast(s, `Your bounty target, ${m.targetName}, is in this system.`);
      }
    this.send(s, {
      t: 'space',
      sys: d.sys,
      id: e.id,
      rocks: sp.rocksPayload(),
      miningRocks: this.features.mining.rocksPayload(sp),
      mining: this.features.mining.payload(s, sp),
      industrial: this.features.industrial.payload(s),
      towing: this.features.towing.payload(s),
      miningPressure: this.features.pressure.payload(s),
      miningHazards: this.features.pressure.hazards(sp.id),
    });
    this.features.fronts.missionArrive(s, sp);
    this.features.story.storyArrive(s, sp);
    this.features.arcs.arcArrive(s, sp);
    if (!this.solo) {
      this.features.coop.warbandArrive(s, sp);
      const A = this.features.coop.armadaOf(d);
      if (A) {
        this.features.coop.armadaRefresh(A);
        this.features.coop.armadaPush(A);
      }
    } // 2.6: members see where you are
  }
  /**
   * Launches player ship from docked stellar body into active space flight.
   * @param {Session} s Player session launching from stellar.
   * @returns {void}
   */
  depart(s) {
    const d = s.data;
    if (s.ent || !d.stellar) return;
    if (d.shipless)
      return this.toast(
        s,
        'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.',
      );
    if (this.features.specialists.inDrydock(d)) {
      const st = d.specState[d.ship.hull];
      return this.toast(
        s,
        `The ${this.A.ships[d.ship.hull].name} is in the drydock for her tier-up: ${Math.ceil((st.upT - Date.now()) / 60000)} minutes left.`,
      );
    }
    const p = STELLARS[d.stellar];
    const a = Math.random() * Math.PI * 2;
    beginEconomyTrip(d, p.id, Date.now());
    d.stellar = null;
    this.spawnPlayer(s, p.x + Math.sin(a) * (p.r + 30), p.y - Math.cos(a) * (p.r + 30), a, 40);
    this.you(s);
  }
  /**
   * Lands player ship at a stellar body, repairing, refueling, and completing missions.
   * @param {Session} s Player session landing.
   * @param {string} sid Target stellar ID.
   * @returns {void}
   */
  land(s, sid) {
    const d = s.data,
      e = s.ent;
    if (!e) return;
    if (this.features.towing.attached(s))
      return this.toast(s, 'Deliver or detach the motherlode before landing.');
    if (e.disabled) return this.toast(s, 'Your ship is disabled.');
    const p = STELLARS[sid];
    if (!p || p.system !== d.sys) return;
    if (!p.svc.includes('L')) return this.toast(s, `${p.name} has nowhere to land.`);
    const dist = Math.hypot(e.x - p.x, e.y - p.y),
      sp = Math.hypot(e.vx, e.vy);
    if (dist > p.r + 60) return this.toast(s, `Too far from ${p.name} to land.`);
    if (sp > 80) return this.toast(s, 'Slow down to land.');
    const fac = SYS[d.sys].faction;
    if (!p.outlaw && (d.rep[fac] || 0) <= -30 && !(d.landPass && d.landPass[p.id] > Date.now()))
      return this.toast(s, `${p.name} refuses you permission to land. Hail them (T) to talk.`);
    const space = this.spaces[d.sys];
    this.dropEscorts(space, e);
    d.fuel = e.fuel;
    for (const g of e.guns) if (g.ammo !== Infinity) d.ship.ammo[g.w] = g.ammo;
    space.remove(e);
    space.players--;
    s.ent = null;
    d.stellar = sid;
    arriveEconomyTrip(d, sid, Date.now());
    // free refuel and repair
    const st = this.features.shipStats.stats(d);
    d.fuel = st.fuel;
    d.shieldNow = undefined;
    d.armorNow = undefined;
    this.completeOnLanding(s, p);
    if (d.sys !== START.system) this.tut(s, 'land2');
    if (p.site) this.tut(s, 'site');
    this.db.touch();
    this.you(s);
    this.landed(s);
    this.features.story.storyOnLand(s, p);
    this.features.arcs.arcOnLand(s, p);
    if (!this.solo) {
      const A = this.features.coop.armadaOf(d);
      if (A) this.features.coop.armadaPush(A);
    } // 2.6
  }
  /**
   * Transmits docked port services payload (market, shipyard, jobs, outfitter) to client.
   * @param {Session} s Player session currently docked.
   * @returns {void}
   */
  landed(s) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p) return;
    const own = this.ownSite(d, p),
      so = p.site ? this.siteOwner(p.id) : null;
    this.send(s, {
      t: 'landed',
      refinery: this.features.refinery.payload(s),
      stellar: p.id,
      market: this.market(p),
      tradeTerms: {
        site: !!p.site,
        tradePct: this.features.bonuses.bonus(d).tradePct || 0,
        sell: this.features.fronts.mods(p.system).sell,
      },
      offers: this.offers(p, d),
      yard: this.yard(p, d),
      outfitter: this.outfitter(p, d),
      mats: this.matsFor(p, d),
      site: p.site ? { owner: so ? so.name : null, ops: so ? so.station.ops : 0, own } : null,
      community: p.hub ? this.community() : null,
      news: p.svc.includes('B') || p.hub ? this.features.rivals.newsFeed(6) : null,
      contact: this.features.quests.barTalk(p, d),
      blackmarket: this.features.syndicate.blackMarket(p, d),
      arcs: this.features.arcs.arcOffersAt(d, p).map((o) => ({
        fac: o.fac,
        title: o.title,
        brief: o.brief,
        text: o.text,
        locked: o.locked || null,
        arc: ARCS_NAME(o.fac),
      })),
      bank: this.features.syndicate.bankAt(p) ? this.features.syndicate.bankInfo(d) : null,
      bar: this.features.hangar.barOffers(p, d),
      store: this.features.fronts.storeFor(p),
      colony: this.features.frontier.colonyPayload(p, d),
      story: (() => {
        const o = this.features.story.storyOffer(d, p);
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
          ? this.features.frontier.exchangePayload(d)
          : null,
    });
  }
  /**
   * Initiates hyperjump to connected system, charging jump drive.
   * @param {Session} s Player session initiating hyperjump.
   * @param {string} to Destination system ID.
   * @returns {void}
   */
  jump(s, to) {
    if (this.features.towing.attached(s))
      return this.toast(s, 'Detach the motherlode before jumping.');
    const d = s.data,
      e = s.ent;
    if (!e || e.state !== 'fly') return;
    if (e.disabled) return this.toast(s, 'Your ship is disabled.');
    const S = SYS[d.sys];
    const skip = !S.links.includes(to)
      ? this.features.specialists.pathfinderJump(d, d.sys, to)
      : null;
    if (!S.links.includes(to) && !skip) return this.toast(s, 'No hyperspace route there.');
    if (this.features.specialists.inDrydock(d))
      return this.toast(
        s,
        'Your ship is booked into the drydock for her tier-up. Land and wait for it to finish.',
      );
    if (this.features.story.deepLocked(d, to))
      return this.toast(
        s,
        "The Deep is uncharted: ships that jump in blind are never seen again. The Que'vari are said to keep charts of the dark.",
      );
    const fuelCost = K.jumpFuel * this.features.fronts.mods(d.sys).jumpFuel * (skip ? 1.5 : 1);
    e.jumpCost = fuelCost;
    if (e.fuel < fuelCost)
      return this.toast(
        s,
        skip
          ? `A Pathfinder skip-jump needs ${Math.round((fuelCost / K.jumpFuel) * 10) / 10} jumps of fuel.`
          : this.features.fronts.mods(d.sys).jumpFuel > 1
            ? 'Gravity shear: this jump needs double fuel.'
            : 'Not enough fuel to jump.',
      );
    for (const p of S.stellars)
      if (Math.hypot(e.x - p.x, e.y - p.y) < K.jumpClear)
        return this.toast(s, 'Too close to ' + p.name + ' to jump. Fly further out.');
    const T = SYS[to];
    e.a = Math.atan2(T.x - S.x, -(T.y - S.y));
    e.state = 'jumpout';
    e.jumpT = e.st.jumpFast ? 0.6 : 1.6;
    e.jumpTo = to;
    this.spaces[d.sys].events.push(['jump', e.id]);
    for (const x of this.spaces[d.sys].ships.values())
      if (x.owner === e.id && !x.fighterOf && !x.rival) {
        x.state = 'jumpout';
        x.jumpT = e.jumpT + 0.3;
        x.a = e.a;
        x.jumpTo = '-';
      }
    this.features.coop.armadaLeaderJump(s, to); // 2.6: members who follow the leader get the destination
  }
  /**
   * Finalizes hyperjump: deducts fuel, explores destination, and spawns ship in new system.
   * @param {Entity} e Jumping ship entity.
   * @param {import('./space.js').Space} space Origin space simulation.
   * @returns {void}
   */
  finishJump(e, space) {
    if (e.player && this.features.towing.attached(e.player.s)) {
      e.state = 'fly';
      return this.toast(e.player.s, 'Detach the motherlode before jumping.');
    }
    if (!e.player) {
      space.remove(e, 'jump');
      return;
    }
    const s = e.player.s,
      d = s.data,
      from = SYS[d.sys],
      to = SYS[e.jumpTo];
    this.dropEscorts(space, e, 'jump'); // first, so drones still out are counted back into the bays
    d.fuel = e.fuel - (e.jumpCost || K.jumpFuel);
    for (const g of e.guns) if (g.ammo !== Infinity) d.ship.ammo[g.w] = g.ammo;
    d.shieldNow = e.shield;
    d.armorNow = e.armor;
    space.remove(e, 'jump');
    space.players--;
    s.ent = null;
    d.sys = to.id;
    d.stats.jumps++;
    this.features.hangar.officerXp(s, 4);
    this.features.fronts.goal(s, 'jumps');
    this.features.frontier.mastery(s, 3);
    if (!d.explored.includes(to.id)) {
      d.explored.push(to.id);
      this.features.fronts.goal(s, 'charted');
      this.features.specialists.specOnChart(s);
      if (to.gen) this.log(d, `Charted ${to.name} (${FACTIONS[to.faction].name}).`);
    }
    const ang = Math.atan2(from.x - to.x, -(from.y - to.y)); // arrive from the direction we came
    const a = ang + Math.PI;
    this.spawnPlayer(s, Math.sin(ang) * 2200, -Math.cos(ang) * 2200, a, e.st.maxSpeed);
    d.shieldNow = d.armorNow = undefined;
    s.ent.graceT = this.spaces[d.sys].t + 6; // 2.0.3: a few seconds to get your bearings after a jump
    this.protectNote(s, to);
    this.spaces[d.sys].events.push(['flash', Math.round(s.ent.x), Math.round(s.ent.y)]);
    this.you(s);
    for (const m of d.missions)
      if (m.type === 'patrol' && m.sys === d.sys)
        this.toast(s, `Patrol: destroy ${m.need - m.got} more hostile ships here.`);
  }

  // 0.8: flying into the Sol Gateway (or its far mouth) crosses instantly, with no fuel cost
  /**
   * Handles instantaneous transit through Sol Gateway wormholes without fuel consumption.
   * @param {Entity} e Ship entity entering wormhole.
   * @param {import('./space.js').Space} space Origin space.
   * @param {StellarBody} p Wormhole gateway stellar body.
   * @returns {void}
   */
  wormholeTransit(e, space, p) {
    if (e.player && this.features.towing.attached(e.player.s))
      return this.toast(e.player.s, 'Detach the motherlode before Gateway transit.');
    const s = e.player.s,
      d = s.data,
      to = SYS[p.wormhole],
      exit = to.stellars.find((x) => x.id === p.exit);
    this.dropEscorts(space, e);
    d.fuel = e.fuel;
    for (const g of e.guns) if (g.ammo !== Infinity) d.ship.ammo[g.w] = g.ammo;
    d.shieldNow = e.shield;
    d.armorNow = e.armor;
    space.events.push(['flash', Math.round(e.x), Math.round(e.y)]);
    space.remove(e);
    space.players--;
    s.ent = null;
    d.sys = to.id;
    d.stats.jumps++;
    this.features.fronts.goal(s, 'jumps');
    this.features.frontier.mastery(s, 3);
    const first = !d.explored.includes(to.id);
    if (first) {
      d.explored.push(to.id);
      this.features.fronts.goal(s, 'charted');
      this.log(
        d,
        to.farside
          ? 'Passed through the Sol Gateway. The stars on the far side match no chart.'
          : 'Came home through the Gateway to Sol.',
      );
    }
    const a = Math.random() * Math.PI * 2;
    this.spawnPlayer(
      s,
      exit.x + Math.sin(a) * (exit.r * 0.15),
      exit.y - Math.cos(a) * (exit.r * 0.15),
      a,
      140,
    );
    d.shieldNow = d.armorNow = undefined;
    s.ent.wormT = this.spaces[d.sys].t + 4;
    s.ent.wormExit = exit.id; // Rearm only after leaving the arrival aperture.
    s.ent.graceT = this.spaces[d.sys].t + 6;
    this.protectNote(s, to);
    this.spaces[d.sys].events.push(['flash', Math.round(s.ent.x), Math.round(s.ent.y)]);
    this.toast(
      s,
      to.farside
        ? `Through the Gateway: ${to.name}.${first ? ' Nothing out here is on any chart.' : ''}`
        : 'Back through the Gateway: Sol.',
    );
    this.you(s);
  }
  // ------------------------------------------------------------------ combat outcomes
  /**
   * Handles weapon impact against NPC ship, updating faction reputation and rival state.
   * @param {PlayerReference} pref Attacking player reference.
   * @param {Entity} npc Target entity hit.
   * @param {import('./space.js').Space} space Space simulation.
   * @returns {void}
   */
  onHit(pref, npc, space) {
    const s = pref.s,
      d = s.data;
    if (!d) return;
    this.features.rivals.rivalOnHit(s, npc, space);
    if (space.isHostile(npc, s.ent || npc) && npc.aggro.size <= 1 && FACTIONS[npc.faction].pirate)
      return;
    if (
      !FACTIONS[npc.faction].pirate &&
      !FACTIONS[npc.faction].alwaysHostile &&
      !npc.dread &&
      !npc.boss &&
      !npc.mission &&
      (d.rep[npc.faction] || 0) > -100 &&
      (!npc.repHitT || space.t - npc.repHitT > 1.5)
    ) {
      npc.repHitT = space.t;
      d.rep[npc.faction] = clampStanding((d.rep[npc.faction] || 0) - 1);
    }
  }
  /**
   * Resolves combat kill: awards bounties, increases combat rating, and fulfills mission objectives.
   * @param {PlayerReference} pref Killing player reference.
   * @param {Entity} npc Entity destroyed.
   * @param {import('./space.js').Space} space Space simulation.
   * @param {boolean} [byEscort] Whether final blow was landed by an escort.
   * @returns {void}
   */
  onKill(pref, npc, space, byEscort) {
    const s = pref.s,
      d = s.data;
    if (!d) return;
    d.stats.kills++;
    d.stats.combat = (d.stats.combat || 0) + (npc.pw || npc.strength || 10); // 1.1: combat rating
    this.features.hangar.officerXp(s, 8 + Math.round((npc.strength || 10) / 40));
    this.features.frontier.mastery(s, (npc.strength || 10) / 8);
    this.features.specialists.specOnKill(s, npc, space, byEscort);
    const F = FACTIONS[npc.faction];
    if (this.features.rivals.rivalOnKill(s, npc, space)) {
      this.toast(s, `You destroyed ${npc.name.split(' · ')[0]}'s ship. They will not forget it.`);
      this.you(s);
      return;
    } // 1.1
    if (npc.storyKill) this.features.story.storyProgress(s, npc);
    if (npc.kingpin) this.features.coop.warbandDown(npc); // 2.6: an Armada contract's kingpin
    this.features.living.stateOnKill(s, npc, space); // 2.4
    if (npc.arcOf) this.features.arcs.arcProgress(s, npc); // 1.2 faction arcs
    if (npc.boss || npc.bossMinion) {
      this.features.fronts.goal(s, 'kills');
      this.you(s);
      return;
    }
    if (F.pirate || F.alwaysHostile || npc.mission) {
      const stB = (() => {
        const st = this.features.living.stateOf(space.id);
        return (st && STATES[st.kind].bounty) || 1;
      })(); // 2.4: a pirate scourge pays more
      const bounty = Math.round(
        ((npc.strength || 10) * 25 + 500) *
          (1 + (this.features.bonuses.bonus(d).lootPct || 0) / 100) *
          this.features.fronts.mods(space.id).bounty *
          stB *
          (this.features.specialists.flying(d, 'vanguard')
            ? 1 + 0.5 * this.features.specialists.power(d)
            : 1),
      );
      this.features.coop.shareBounty(s, bounty, space, npc);
      this.features.fronts.goal(s, 'kills'); // 2.6: Armada members present get kill credit and a share
      d.credits += bounty;
      d.stats.earned += bounty;
      d.rep.quantum = clampStanding(d.rep.quantum + 1);
      d.rep.spacer = clampStanding(d.rep.spacer + 1);
      this.toast(
        s,
        `Destroyed ${npc.name || this.A.ships[npc.hull].name}. Bounty: ${credits(bounty)} credits.`,
      );
      this.tut(s, 'kill');
    } else {
      d.rep[npc.faction] = clampStanding((d.rep[npc.faction] || 0) - 10);
      for (const [f, X] of Object.entries(FACTIONS))
        if (X.hostile.includes(npc.faction)) d.rep[f] = clampStanding((d.rep[f] || 0) + 2);
      this.toast(s, `Destroyed a ${F.short} ship. ${F.name} will remember that.`);
    }
    for (const m of d.missions) {
      if (m.type === 'bounty' && npc.mission && npc.mission.id === m.id) {
        m.done = true;
        this.toast(
          s,
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
          this.toast(s, 'Patrol complete. Land anywhere to collect your pay.');
        }
      }
    }
    this.you(s);
  }
  /**
   * Handles player ship destruction: charges insurance fee, clears cargo, and respawns at station.
   * @param {PlayerReference} pref Player reference destroyed.
   * @param {import('./space.js').Space} space Space simulation.
   * @param {Entity | null} [by] Killer entity, if any.
   * @returns {void}
   */
  onPlayerDeath(pref, space, by) {
    const s = pref.s,
      d = s.data;
    if (!d) return;
    this.features.towing.detach(s);
    if (space.sys.arena && this.features.frontier.onArenaDeath(s, space)) return;
    if (s.ent) this.dropEscorts(space, s.ent, 'jump'); // 2.0.3: escorts no longer linger after you are destroyed
    space.players--;
    s.ent = null;
    const fee = Math.min(d.credits, Math.round((this.A.ships[d.ship.hull].cost || 0) * 0.05));
    d.credits -= fee;
    if (d.ship.industrial) {
      d.ship.industrial.outputs = {};
      d.ship.industrial.workMs = 0;
      d.ship.industrial.harvestMs = 0;
    }
    if (!this.features.specialists.flying(d, 'lodestar')) clearLots(d.cargo, d.cargoLots); // the Lodestar's hold is protected; wingmates fly home
    const back =
      d.station &&
      d.station.site &&
      STELLARS[d.station.site] &&
      this.ownSite(d, STELLARS[d.station.site])
        ? d.station.site
        : START.stellar; // 1.0.1: your own station hull if you have one, otherwise the hub
    d.stellar = back;
    d.sys = STELLARS[back].system;
    if (s.retaliationVisit?.sys !== d.sys) s.retaliationVisit = undefined;
    d.fuel = undefined;
    for (const m of d.missions) if (m.type === 'cargo') m.lost = true;
    d.missions = d.missions.filter((m) => !m.lost);
    this.log(
      d,
      `Ship destroyed${by && by.player ? ' by ' + by.player.name : ''}. The insurers rebuilt it at ${STELLARS[back].name} for ${credits(fee)} credits; the cargo was lost.`,
    );
    this.send(s, { t: 'dead', fee, at: STELLARS[back].name });
    if (by && by.player)
      this.broadcast({
        t: 'chat',
        from: '',
        msg: `${by.player.name} destroyed ${s.name} in ${SYS[space.id].name}.`,
      });
    this.db.touch();
    this.you(s);
    this.landed(s);
  }
  /**
   * Finds the nearest market port that purchases a specific commodity.
   * @param {string} sys Starting system ID.
   * @param {string} cid Commodity ID.
   * @returns {{p: StellarBody, j: number} | null} Nearest purchasing stellar port and jump distance, or null.
   */
  nearestBuyer(sys, cid) {
    // 2.5.2: the closest market that buys a good (by jumps)
    const dist = { [sys]: 0 },
      q = [sys];
    while (q.length) {
      const x = q.shift();
      const j = dist[x];
      for (const sp of SYS[x].stellars) {
        const p = STELLARS[sp.id];
        if (p && !p.site && (p.svc || '').includes('T') && price(p, cid) !== null) return { p, j };
      }
      if (j < 5)
        for (const l of SYS[x].links)
          if (dist[l] === undefined) {
            dist[l] = j + 1;
            q.push(l);
          }
    }
    return null;
  }
  /**
   * Handles player scooping floating salvage canister, ore chunk, or credits.
   * @param {PlayerReference} pref Player scooping loot.
   * @param {import('./space.js').LootItem} it Loot item payload.
   * @returns {boolean | void} Returns false if cargo hold full when mining ore.
   */
  onLoot(pref, it) {
    const s = pref.s,
      d = s.data;
    if (!d) return;
    if (it.cargo) return this.features.fleetcmd.lootCargo(s, it); // 1.1: jettisoned cargo
    if (it.salvage) return this.features.quests.questLoot(s, it); // 2.4: a quest's salvage
    if (it.ore) {
      // mined ore goes into the cargo hold, if there is room
      // Freeze the original economic parcel once, including when the first hold is full.
      if (it.remainingLots === undefined) {
        const b = this.features.bonuses.bonus(d),
          raw = it.n * (1 + (b.miningPct || 0) / 100) * this.features.fronts.mods(d.sys).mining,
          want = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
        it.remainingLots = commonLots(it.ore, want).grades;
      }
      const want = Object.values(it.remainingLots).reduce((a, b) => a + b, 0);
      if (!want) return true;
      const st = this.features.shipStats.stats(d),
        used = this.holdUsed(d),
        n = Math.min(want, st.cargo - used);
      if (n <= 0) {
        if (!s.fullT || Date.now() - s.fullT > 8000) {
          s.fullT = Date.now(); // 2.5.2: say where it can go
          const C = COMMODITIES.find((c) => c.id === it.ore),
            B = this.nearestBuyer(d.sys, it.ore);
          this.toast(
            s,
            !st.cargo
              ? 'This ship has no cargo hold. Fit a Cargo Compression outfit (it takes no space) to keep what you mine.'
              : `Cargo hold full. ${C.name} sells at ${B ? `${B.p.name}${B.j ? ` (${B.j} jump${B.j > 1 ? 's' : ''})` : ' in this system'}` : 'markets further out'}${d.station && d.station.ops >= 1 ? ', or process it at your station' : ''}.`,
          );
        }
        return false;
      }
      const selected = splitLots(it.remainingLots, n);
      addLots(
        d.cargo,
        d.cargoLots,
        { cid: it.ore, qty: n, grades: selected },
        Math.max(0, st.cargo - used),
      );
      for (const g of ['common', 'rich', 'pure']) it.remainingLots[g] -= selected[g];
      d.stats.mined = (d.stats.mined || 0) + n;
      this.features.fronts.goal(s, 'mined', n);
      this.features.frontier.mastery(s, n * 0.3);
      if (it.generationKey) this.features.mining.collected(s, it, n);
      else if (!it.progressionClaimed) {
        it.progressionClaimed = true;
        this.features.specialists.specOnMine(s, it);
      }
      this.toast(s, `+${n} t ${COMMODITIES.find((c) => c.id === it.ore).name}`);
      this.you(s);
      return Object.values(it.remainingLots).every((q) => q === 0);
    }
    if (it.credits) {
      it.credits = Math.round(
        it.credits * (1 + (this.features.bonuses.bonus(d).lootPct || 0) / 100),
      );
      d.credits += it.credits;
      this.toast(s, `Salvaged ${credits(it.credits)} credits.`);
    }
    if (it.chest) return this.features.hostile.openChest(s, it);
    if (it.credits || it.mat) this.features.specialists.specOnLoot(s);
    if (it.mat) {
      d.mats[it.mat][it.grade]++;
      this.toast(s, `Salvaged a ${it.mat} crate (grade ${GRADES[it.grade]}).`);
    }
    this.you(s);
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
    const stations = SITES.map((st) => {
      const o = this.siteOwner(st.id);
      return { system: SYS[st.system].name, owner: o ? o.name : null, ops: o ? o.station.ops : 0 };
    });
    const online = [...this.sessions.values()]
      .filter((x) => x.data)
      .map((x) => ({ name: x.name, sys: SYS[x.data.sys].name }));
    return { docked, top, stations, online };
  }
  // ------------------------------------------------------------------ markets
  /**
   * Generates commodity market prices for a stellar port, applying flash and state modifiers.
   * @param {StellarBody} p Stellar port.
   * @returns {MarketItem[] | null} Array of traded commodities and pricing, or null.
   */
  market(p) {
    if (p.site) {
      const o = this.siteOwner(p.id);
      return o && o.station.ops >= 1
        ? COMMODITIES.map((c) => ({
            id: c.id,
            name: c.name,
            ...(c.id === 'composite_plating'
              ? { sellCap: this.features.refinery.sellRoom(p.id, Number.MAX_SAFE_INTEGER) }
              : {}),
            price: price({ ...p, prices: SITE_PRICES }, c.id),
          })).filter((x) => x.price !== null)
        : null;
    }
    if (!p.svc.includes('T')) return null;
    const now = Date.now();
    return COMMODITIES.map((c) => {
      const pr = price(p, c.id, now),
        lm = this.features.living.livingMult(p, c.id);
      return {
        id: c.id,
        name: c.name,
        ...(c.id === 'composite_plating'
          ? { sellCap: this.features.refinery.sellRoom(p.id, Number.MAX_SAFE_INTEGER) }
          : {}),
        price:
          pr === null ? null : Math.round(pr * this.features.rivals.flashMult(p.id, c.id) * lm),
        flash: this.features.rivals.flashMult(p.id, c.id) !== 1,
        moved: Math.round((lm - 1) * 100),
      };
    }).filter((x) => x.price !== null); // 1.1: market flashes; 2.4: system states and what captains sold here
  }
  /**
   * Executes commodity purchase or sale transaction with market depth price impact.
   * @param {Session} s Player session.
   * @param {string} cid Commodity ID.
   * @param {number} qty Amount to buy (>0) or sell (<0).
   * @param {import('../shared/cargo-contracts.js').GradeLots|'common-first'} [selection]
   * @returns {void}
   */
  trade(s, cid, qty, selection = 'common-first') {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    try {
      assertLots(d.cargo, d.cargoLots);
    } catch {
      return this.toast(s, 'Cargo validation failed.');
    }
    if (this.db.economicFrozen) return;
    const captured = Date.now();
    const pr0 = price(p.site ? { ...p, prices: SITE_PRICES } : p, cid, captured);
    if (pr0 === null || !qty || !this.market(p)) return;
    const pr = p.site
      ? pr0
      : Math.round(
          pr0 * this.features.rivals.flashMult(p.id, cid) * this.features.living.livingMult(p, cid),
        );
    const st = this.features.shipStats.stats(d),
      used = this.holdUsed(d);
    if (qty > 0) {
      const tb = (this.features.bonuses.bonus(d).tradePct || 0) / 100;
      qty = Math.min(qty, st.cargo - used);
      while (qty > 0 && qty * purchaseUnit(pr, qty, tb * 100, !!p.site) > d.credits)
        qty = Math.min(qty - 1, Math.floor(d.credits / purchaseUnit(pr, qty, tb * 100, !!p.site)));
      const bp = purchaseUnit(pr, qty, tb * 100, !!p.site);
      if (qty <= 0) return this.toast(s, 'No room or no money for that.');
      d.paid = d.paid || {};
      d.paid[cid] = Math.round(
        ((d.paid[cid] || bp) * (d.cargo[cid] || 0) + bp * qty) / ((d.cargo[cid] || 0) + qty),
      ); // 2.4: what you paid, on average
      addLots(d.cargo, d.cargoLots, commonLots(cid, qty), Math.max(0, st.cargo - used));
      d.credits -= qty * bp;
      recordEconomy(d, p.id, 'purchases', qty * bp);
      if (!p.site) this.features.living.addImpact(p.id, cid, -qty); // 2.4: buying raises the local price
    } else {
      const have = d.cargo[cid] || 0;
      qty = Math.min(-qty, have);
      if (cid === 'composite_plating') qty = this.features.refinery.sellRoom(p.id, qty, captured);
      if (!qty) return this.toast(s, 'No sale inventory or finite buyer demand remaining.');
      let take;
      try {
        take = planTake(d.cargo, d.cargoLots, cid, qty, selection);
      } catch {
        return this.toast(s, 'Those cargo grades are unavailable.');
      }
      const sale = saleValue(
        pr,
        take.grades,
        this.features.bonuses.bonus(d).tradePct || 0,
        !!p.site,
        this.features.fronts.mods(p.system).sell,
      );
      applyTake(d.cargo, d.cargoLots, take);
      if (cid === 'composite_plating') this.features.refinery.sold(p.id, qty, captured);
      this.features.fronts.goal(s, 'trade', sale);
      d.credits += sale - qty * pr;
      d.credits += qty * pr;
      recordEconomy(d, p.id, 'sales', sale);
      if (!d.cargo[cid]) {
        delete d.cargo[cid];
        if (d.paid) delete d.paid[cid];
      }
      d.stats.earned += qty * pr;
      this.tut(s, 'sell');
      if (!p.site) {
        this.features.living.addImpact(p.id, cid, qty);
        this.features.living.stateProgress(s, p.system, 'cid:' + cid, qty);
      } // 2.4: selling lowers it, and feeds a famine or a rush
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
  }
  /**
   * Lists upgrade materials for sale at a stellar body based on faction specialization.
   * @param {StellarBody} p Stellar body.
   * @param {PlayerData} [d] Player data.
   * @returns {Array<{mat: string, grade: number, price: number}>} Upgrade materials available.
   */
  matsFor(p, d) {
    const fac = SYS[p.system].faction,
      out = [];
    if (p.hub || (d && this.ownSite(d, p) && d.station.ops >= 1))
      MATERIALS.forEach((m) =>
        [0, 1].forEach((g) => out.push({ mat: m, grade: g, price: MAT_PRICE[g] })),
      );
    if (p.site) return out;
    const special = {
      korrund: ['alloy', 2],
      ylith: ['crystal', 2],
      thalassi: ['isotope', 2],
      quevari: ['crystal', 3],
    }[fac];
    if (special && p.svc.includes('T'))
      out.push({ mat: special[0], grade: special[1], price: MAT_PRICE[special[1]] });
    return out;
  }
  /**
   * Executes purchase or sale of crafting and upgrade materials.
   * @param {Session} s Player session.
   * @param {string} mat Material name ('alloy', 'crystal', 'isotope').
   * @param {number} grade Material grade index (0-4).
   * @param {number} n Quantity to buy (>0) or sell (<0).
   * @returns {void}
   */
  buyMat(s, mat, grade, n) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    const offer = this.matsFor(p, d).find((o) => o.mat === mat && o.grade === grade);
    if (!offer) return;
    if (n > 0) {
      n = Math.min(n, Math.floor(d.credits / offer.price));
      if (!n) return this.toast(s, 'Not enough credits.');
      d.credits -= n * offer.price;
      d.mats[mat][grade] += n;
    } else {
      n = Math.min(-n, d.mats[mat][grade]);
      d.credits += Math.round(n * offer.price * 0.6);
      d.mats[mat][grade] -= n;
    }
    this.db.touch();
    this.you(s);
  }

  // ------------------------------------------------------------------ shipyard and outfitter
  /**
   * Compiles list of ship hulls available for purchase at shipyard.
   * @param {StellarBody} p Stellar port.
   * @param {PlayerData} [d] Player data.
   * @returns {number[] | null} Array of hull IDs for sale, or null.
   */
  yard(p, d) {
    if (p.site) {
      // your Personal Station sells the station ships for its Station Tier
      if (!this.ownSite(d, p) || d.station.ops < 3) return null;
      const list = new Set();
      for (const [lv, hs] of Object.entries(STATION_SHIPS))
        if (d.station.ops >= +lv) hs.forEach((h) => list.add(h));
      for (const h of [703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713]) list.add(h);
      if (d.station.ops >= 4) WINGMATES.forEach((h) => list.add(h)); // 2.1: wingmate ships (2.6: the Armada escort hulls are retired)
      return [...list].sort((a, b) => this.A.ships[a].cost - this.A.ships[b].cost);
    }
    if (!p.svc.includes('Y')) return null;
    const fac = SYS[p.system].faction,
      list = new Set();
    for (const h of FACTION_HULLS[fac] || []) {
      const H = this.A.ships[h];
      if (H && (H.tech <= p.tech || H.tech >= 400)) list.add(h);
    }
    if (fac !== 'quevari' && fac !== 'umbral')
      for (const h of [703, 704, 705, 706, 707, 708, 709, 710, 820, 821, 822])
        if (this.A.ships[h].tech <= p.tech) list.add(h); // 2.3: the Wasp, Swift and Pelican are sold everywhere
    return [...list].sort((a, b) => this.A.ships[a].cost - this.A.ships[b].cost);
  }
  /**
   * Calculates credit trade-in value for captain's current ship and outfits (50% value).
   * @param {PlayerData} d Player save data.
   * @returns {number} Credit trade-in value of current ship and installed outfits.
   */
  tradeIn(d) {
    if (d.shipless) return 0;
    return loadoutValue(this.A, d.ship);
  }
  /**
   * Purchases a new flagship hull, applying trade-in credit for previous ship.
   * @param {Session} s Player session.
   * @param {number} hull Hull ID to purchase.
   * @returns {void}
   */
  buyShip(s, hull) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    const yard = this.yard(p, d) || [];
    if (!yard.includes(hull)) return;
    if (WING_ONLY.includes(hull)) return this.features.docks.buyToHangar(s, hull); // 2.1: escort hulls go straight to the hangar
    const H = this.A.ships[hull],
      cost = H.cost - this.tradeIn(d);
    if (d.credits < cost)
      return this.toast(s, `You need ${credits(cost)} credits (after your trade-in).`);
    {
      const why = this.fitsJobs(d, hull);
      if (why) return this.toast(s, why + ' Sell cargo or finish jobs first.');
    }
    d.credits -= cost;
    this.log(d, `Bought a ${H.name} at ${p.name}.`);
    d.ship = makeLoadout(this.A, hull, d.shipless ? 'Rift Runner' : d.ship.name);
    d.shipless = false;
    d.fuel = undefined;
    this.features.docks.leadChanged(d);
    this.db.touch();
    this.you(s);
    this.landed(s);
    this.toast(s, `The ${H.name} is yours.`);
  }
  /**
   * Compiles list of ship outfits available for purchase at outfitter.
   * @param {StellarBody} p Stellar port.
   * @param {PlayerData} [d] Player data.
   * @returns {number[] | null} Array of outfit IDs for sale, or null.
   */
  outfitter(p, d) {
    if (p.site && !(d && this.ownSite(d, p) && d.station.ops >= 2)) return null;
    if (!p.site && !p.svc.includes('O')) return null;
    const fac = p.site ? 'quantum' : SYS[p.system].faction,
      list = [];
    for (const o of Object.values(this.O)) {
      if (o.faction && o.faction !== fac) continue;
      const special = FACTION_OUTFITS[fac] && FACTION_OUTFITS[fac].includes(o.id);
      if (special || ((o.tech <= p.tech || p.site) && o.tech < 100 && !(fac === 'umbral'))) {
        if (o.tech >= 7 && !special && !(p.hub || p.site || fac === 'quantum')) continue; // quantum tech only in Concord space
        list.push(o.id);
      }
    }
    return list.sort((a, b) => this.O[a].cost - this.O[b].cost);
  }
  /**
   * Purchases or sells a ship outfit or ammunition batch.
   * @param {Session} s Player session.
   * @param {number} id Outfit ID.
   * @param {number} n Quantity to buy (>0) or sell (<0).
   * @returns {void}
   */
  outfit(s, id, n) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent || !n) return;
    const o = this.O[id];
    if (!o) return;
    if (d.shipless)
      return this.toast(
        s,
        'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.',
      );
    const list = this.outfitter(p, d);
    if (!list) return this.toast(s, 'There is no outfitter here.');
    if (n > 0 && !list.includes(id)) return;
    const st = this.features.shipStats.stats(d);
    if (n > 0) {
      if (
        o.eff.towRig &&
        (st.cargo < 60 || ['fighter', 'interceptor'].includes(this.A.ships[d.ship.hull].role))
      )
        return this.toast(s, 'Tow Rig requires a non-fighter hull with at least 60t cargo.');
      if (o.eff.ammo) {
        // ammunition: needs the launcher
        const w = o.eff.ammo,
          H = this.A.ships[d.ship.hull];
        const launchers = st.weapons[w] || 0;
        if (!launchers) return this.toast(s, 'You have nothing that fires that.');
        const have = d.ship.ammo[w] ?? 0;
        const cap = o.max * launchers;
        const k = Math.min(n, cap - have, Math.floor(d.credits / o.cost));
        if (k <= 0) return this.toast(s, 'Magazines full or not enough credits.');
        d.ship.ammo[w] = have + k;
        d.credits -= k * o.cost;
      } else {
        ensureStockOutfits(this.A, d.ship);
        const cur = d.ship.outfits[id] || 0;
        const limit = stockOutfitLimit(this.A, d.ship, id);
        if (cur + n > limit) return this.toast(s, `You can carry at most ${limit}.`);
        if ((o.mass || 0) * n > st.free) return this.toast(s, 'Not enough free space.');
        if (o.eff.weapon && o.turret && st.turrets + n > st.maxTurrets)
          return this.toast(s, 'No free turret mounts.');
        if (o.eff.weapon && !o.turret && st.guns + n > st.maxGuns)
          return this.toast(s, 'No free gun mounts.');
        if (d.credits < o.cost * n) return this.toast(s, 'Not enough credits.');
        d.credits -= o.cost * n;
        d.ship.outfits[id] = cur + n;
      }
    } else {
      const cur = d.ship.outfits[id] || 0,
        k = Math.min(cur, -n);
      if (!k) return;
      if (o.eff.cargo && this.holdUsed(d) > st.cargo - o.eff.cargo * k)
        return this.toast(s, 'Sell cargo first.');
      if (o.eff.passengerSeats && this.jobBunks(d) > st.passengerSeats - o.eff.passengerSeats * k)
        return this.toast(s, 'Deliver your passengers before removing their seats.');
      const refund = outfitSaleValue(this.A, d.ship, id, k);
      d.ship.outfits[id] = cur - k;
      if (!d.ship.outfits[id]) delete d.ship.outfits[id];
      d.credits += refund;
    }
    this.db.touch();
    this.you(s);
  }

  // ------------------------------------------------------------------ missions
  /**
   * Generates procedural job board mission offers for a stellar port.
   * @param {StellarBody} p Stellar port.
   * @param {PlayerData} d Player data.
   * @returns {Mission[]} Available job board missions.
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
      if (roll < 0.5) {
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
          text: `Carry ${qty} tons of ${c.name.toLowerCase()} to ${dest.name} in the ${S.name} system (${jumps} jump${jumps > 1 ? 's' : ''}).`,
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
    out.unshift(...this.features.quests.questOffers(p, d)); // 2.4: contacts and side stories lead the board
    return out.filter(
      (o) =>
        !d.missions.some((m) => m.id === o.id) &&
        !(destType(o) && o.dest === p.id) &&
        !(o.type === 'assassinate' && rank < 3),
    );
  }
  /**
   * Accepts a mission from the local stellar job board.
   * @param {Session} s Player session.
   * @param {string} id Mission ID to accept.
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
  }
  /**
   * Evaluates active missions upon landing, paying rewards and logging completions.
   * @param {Session} s Player session landing.
   * @param {StellarBody} p Landed stellar port.
   * @returns {void}
   */
  completeOnLanding(s, p) {
    const d = s.data;
    d.lastStellar = p.id;
    for (const m of [...d.missions]) {
      if (m.type === 'miningOrder') continue;
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
  }

  // ------------------------------------------------------------------ Quantum Station (each captain's own)
  /**
   * Updates Personal Station timers: refinery generation, active research, and construction.
   * @param {PlayerData} d Player save data.
   * @returns {void}
   */
  checkStation(d) {
    const S = d.station;
    if (!S.claimed) return;
    this.features.hangar.hangarInit(d);
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
      this.log(d, `Research complete: ${RESEARCH.find((r) => r.id === S.active.id).name}.`);
      S.active = null;
    }
    this.features.hangar.startQueued(d);
  }
  /**
   * Verifies if player has required material quantities.
   * @param {PlayerData} d Player save data.
   * @param {Array<[string, number, number]>} mats Required materials tuple [name, grade, count].
   * @returns {boolean} True if inventory satisfies all material requirements.
   */
  hasMats(d, mats) {
    return mats.every(([m, g, n]) => d.mats[m][g] >= n);
  }
  /**
   * Deducts specified material quantities from player inventory.
   * @param {PlayerData} d Player save data.
   * @param {Array<[string, number, number]>} mats Materials to consume [name, grade, count].
   * @returns {void}
   */
  takeMats(d, mats) {
    for (const [m, g, n] of mats) d.mats[m][g] -= n;
  }
  /**
   * Processes Personal Station operations: claiming derelicts, upgrades, refinery, and relocation.
   * @param {Session} s Player session.
   * @param {import("./message-registry.js").NetworkMessage} m Station operation payload.
   * @returns {void}
   */
  station(s, m) {
    const d = s.data,
      p = STELLARS[d.stellar],
      S = d.station;
    if (!p || s.ent) return;
    this.checkStation(d);
    if (m.op === 'claim') {
      if (!p.site)
        return this.toast(
          s,
          'Find a derelict station hull to claim. They drift in systems across the galaxy.',
        );
      if (this.siteOwner(p.id))
        return this.toast(s, 'Another captain has already claimed this hull.');
      if (S.site)
        return this.toast(
          s,
          `You already have a Personal Station in ${SYS[STELLARS[S.site].system].name}.`,
        );
      const first = !S.claimed;
      S.site = p.id;
      S.claimed = true;
      S.refT = Date.now();
      this.db.world.sites[p.id] = this.db.key(d.name);
      if (first) d.mats.alloy[0] += 1;
      this.log(
        d,
        `Claimed a derelict station hull in ${SYS[p.system].name}.${first ? ' Its last crew left an Alloy I crate aboard.' : ' Your station progress moved with you.'}`,
      );
      this.toast(s, 'This hull is yours. Start Station Tier 1 when ready.');
      this.broadcast({
        t: 'chat',
        from: '',
        msg: `${s.name} claimed a station hull in ${SYS[p.system].name}.`,
      });
      this.db.touch();
      this.pushSites();
      this.you(s);
      this.landed(s);
      return;
    }
    if (!this.ownSite(d, p)) return this.toast(s, 'Land at your Personal Station for that.');
    switch (m.op) {
      case 'upgrade': {
        const o = OPS[S.ops];
        if (!S.claimed || !o) break;
        if (d.credits < o.cost || !this.hasMats(d, o.mats))
          return this.toast(s, 'You need the credits and materials listed.');
        d.credits -= o.cost;
        this.takeMats(d, o.mats);
        S.ops++;
        S.refT = Date.now();
        this.log(d, `Quantum Station reached Station Tier ${S.ops}: ${o.title}.`);
        this.toast(s, `Station Tier ${S.ops} complete: ${o.unlock}.`);
        if (S.ops === 3)
          this.toast(
            s,
            'Newcomer protection has ended at Station Tier 3: factions across the main galaxy now treat you like any other captain.',
          );
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${s.name}'s Personal Station reached Station Tier ${S.ops}.`,
        });
        this.pushSites();
        break;
      }
      case 'process': {
        // ore -> material crates
        if (S.ops < 1) return this.toast(s, 'Build Station Tier 1 first.');
        const ore = m.id,
          mat = ORE_PROCESS.to[ore];
        if (!mat) break;
        const have = d.cargo[ore] || 0,
          n = Math.min(
            Math.floor(have / ORE_PROCESS.per),
            Math.floor(d.credits / ORE_PROCESS.cost),
            m.all ? 99 : 1,
          );
        if (n <= 0)
          return this.toast(
            s,
            `You need ${ORE_PROCESS.per} t of ${COMMODITIES.find((c) => c.id === ore).name} and ${credits(ORE_PROCESS.cost)} credits per crate.`,
          );
        const g = Math.min(4, ORE_PROCESS.grade[S.ops] + (researchBonus(S).processGrade || 0));
        let take;
        try {
          take = planTake(d.cargo, d.cargoLots, ore, n * ORE_PROCESS.per, m.lots);
        } catch {
          return this.toast(s, 'Those cargo grades are unavailable.');
        }
        applyTake(d.cargo, d.cargoLots, take);
        d.credits -= n * ORE_PROCESS.cost;
        d.mats[mat][g] += n;
        this.toast(
          s,
          `Processed ${n * ORE_PROCESS.per} t into ${n} ${mat} ${GRADES[g]} crate${n > 1 ? 's' : ''}.`,
        );
        break;
      }
      case 'collect': {
        if (!S.refUnits) return this.toast(s, 'The refinery has nothing ready.');
        const n = S.refUnits,
          cr = n * (2500 + S.ops * 1500);
        d.credits += cr;
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
          d.mats[mt][g]++;
          got.push(`${mt} ${GRADES[g]}`);
        }
        this.toast(
          s,
          `Collected ${n} refinery unit${n > 1 ? 's' : ''}: ${credits(cr)} credits and ${got.join(', ')}.`,
        );
        break;
      }
      case 'research': {
        if (
          S.active ||
          ((RESEARCH.find((x) => x.id === m.id) || {}).needs &&
            !S.done.includes(RESEARCH.find((x) => x.id === m.id).needs))
        ) {
          this.features.hangar.queueResearch(s, m.id);
          break;
        }
        const r = RESEARCH.find((x) => x.id === m.id);
        if (!r || S.done.includes(r.id) || S.ops < r.ops) break;
        if (d.credits < r.cost || !this.hasMats(d, r.mats))
          return this.toast(s, 'You need the credits and materials listed.');
        d.credits -= r.cost;
        this.takeMats(d, r.mats);
        S.active = { id: r.id, ends: Date.now() + r.minutes * 60000 };
        this.toast(s, `Research started: ${r.name} (${r.minutes} minutes).`);
        break;
      }
      case 'hire':
      case 'dismiss':
        return this.toast(
          s,
          'Wingmates are ships now: buy them at your station shipyard and assign them to a dock (STATION, then DOCKS).',
        ); // 2.1
      case 'unqueue':
        S.queue = S.queue.filter((x) => x !== m.id);
        break;
      case 'defense':
        this.features.frontier.defenseUpgrade(s);
        break;
      case 'refine':
        this.features.hangar.refineUp(s, m.mat, m.g | 0, m.n | 0);
        break;
      case 'refit':
        return this.toast(s, 'Refits were retired in 2.6.');
      case 'relocate': {
        // 2.6: warp the station to another unclaimed hull; you ride along
        const to = STELLARS[m.site],
          cost = relocateCost(S.ops),
          wait = (S.relocT || 0) + RELOCATE.cooldownH * 3600000 - Date.now();
        if (!to || !to.site || to.id === S.site)
          return this.toast(s, 'Choose an unclaimed station hull.');
        if (this.siteOwner(to.id)) return this.toast(s, 'Another captain has claimed that hull.');
        if (wait > 0)
          return this.toast(
            s,
            `The station's warp core is recharging: ${Math.ceil(wait / 3600000)} h left.`,
          );
        if (d.holdout && d.holdout.active) return this.toast(s, 'Not during a Holdout.');
        if (d.credits < cost || !this.hasMats(d, RELOCATE.mats))
          return this.toast(
            s,
            `Relocating needs ${credits(cost)} credits and ${RELOCATE.mats.map(([a, g]) => a + ' ' + GRADES[g]).join(', ')}.`,
          );
        if (s.trade) this.features.coop.tradeCancel(s.trade, 'The station is warping away.');
        const from = STELLARS[S.site];
        d.credits -= cost;
        this.takeMats(d, RELOCATE.mats);
        delete this.db.world.sites[S.site];
        S.site = to.id;
        S.relocT = Date.now();
        this.db.world.sites[to.id] = this.db.key(d.name);
        d.stellar = to.id;
        d.sys = to.system;
        if (from.system !== to.system) s.retaliationVisit = undefined;
        this.log(
          d,
          `Warped your Personal Station from ${SYS[from.system].name} to ${SYS[to.system].name}. Everything came along.`,
        );
        this.toast(s, `Station warp complete: welcome to ${SYS[to.system].name}.`);
        if (!this.solo)
          this.broadcast({
            t: 'chat',
            from: '',
            msg: `${d.name}'s Personal Station warped from ${SYS[from.system].name} to ${SYS[to.system].name}. The old hull is free to claim.`,
          });
        this.pushSites();
        break;
      }
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
  }

  // ------------------------------------------------------------------ chat
  /**
   * Broadcasts chat message across system, global, or Armada channels.
   * @param {Session} s Sending session.
   * @param {{msg: string, ch?: string}} m Chat message payload.
   * @returns {void}
   */
  chat(s, m) {
    const msg = String(m.msg || '')
      .slice(0, 240)
      .trim();
    if (!msg) return;
    const now = Date.now();
    if (now - s.chatT < 700) return;
    s.chatT = now;
    const sys = m.ch === 'sys',
      A = (m.ch === 'armada' || m.ch === 'fleet') && this.features.coop.armadaOf(s.data); // 2.6: the fleet channel is now the Armada's
    if ((m.ch === 'armada' || m.ch === 'fleet') && !A)
      return this.toast(s, 'You are not in an Armada.');
    const deaf = (o) =>
      this.features.coop.blocked && this.features.coop.blocked(o.data, s.data.name); // 2.6: blocked captains are not heard
    this.broadcast(
      {
        t: 'chat',
        from: s.name,
        msg,
        ch: A ? 'armada' : sys ? 'sys' : 'all',
        sys: s.data.sys,
        ship: sys && !A && s.ent?.state === 'fly' ? s.ent.id : null,
      },
      A
        ? (o) => o.data.armada === A.id && !deaf(o)
        : sys
          ? (o) => o.data.sys === s.data.sys && !deaf(o)
          : (o) => !deaf(o),
    );
  }

  /**
   * Suspends and deallocates an idle space simulation when no players are present.
   * @param {import('./space.js').Space} sp Space instance to suspend.
   * @returns {void}
   */
  sleep(sp) {
    for (const s of this.sessions.values())
      if (s.data?.sys === sp.id) this.features.towing.detach(s);
    this.features.mining.suspendSpace(sp);
    delete this.live[sp.id];
  }
  // every two seconds: shuttles that have come home report in, finished research hands over to the queue
  /**
   * Periodic maintenance check per session: shuttle missions, research queue, and station ticks.
   * @param {Session} s Active session.
   * @returns {void}
   */
  idleCheck(s) {
    const d = s.data;
    this.features.hangar.hangarInit(d);
    const before =
      (d.station.active && d.station.active.id) +
      '|' +
      d.station.queue.length +
      '|' +
      d.station.done.length +
      '|' +
      d.station.refUnits;
    this.checkStation(d);
    if (d.tut != null && d.tut < TUTORIAL.length && TUTORIAL[d.tut].check) this.tut(s, '*check');
    let changed =
      this.features.specialists.specCheck(d) ||
      before !==
        (d.station.active && d.station.active.id) +
          '|' +
          d.station.queue.length +
          '|' +
          d.station.done.length +
          '|' +
          d.station.refUnits;
    const now = Date.now(),
      back = d.shuttles.filter((x) => x.state === 'out' && now >= x.ends);
    for (const sh of back) this.features.hangar.resolveShuttle(s, sh);
    if (back.length) {
      d.shuttles = d.shuttles.filter((x) => x.state !== 'gone');
      changed = true;
    }
    if (changed) {
      this.db.touch();
      this.you(s);
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
    } // 2.4: system states come and go   // 1.1: rival careers, news, market flashes, hired guns
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
