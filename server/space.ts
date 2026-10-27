import type { IndexWorksite } from './index-worksite.ts';
import type { RawStellarBody } from '../shared/galaxy.ts';
import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { GameAssets, ShipLoadout, ShipStatsBonus, WeaponConfig } from '../shared/rules.ts';
import type { Game, Mission } from './game.ts';
import type { MiningSource } from './mining-contracts.ts';
export type Session = import('./game.ts').Session;
export type PlayerReference = import('./game.ts').PlayerReference;
export type SpaceSystem = import('./game.ts').SpaceSystem;
export type ShipStats = import('./game.ts').ShipStats;
export type WeaponMount = {
  /** Weapon item ID. */
  w: number;

  /** Number of mounted weapon instances. */
  n: number;

  /** Precomputed weapon parameters (range, reload, speed, homing, etc.). */
  p: WeaponConfig;

  /** Current weapon cooldown time remaining in seconds. */
  cd: number;

  /** Current ammunition count or Infinity if unlimited. */
  ammo: number;

  /** Sound effect identifier. */
  snd: number;

  /** True if secondary weapon (missile, torpedo, drone bay). */
  sec: boolean;

  /** Timestamp of last sound effect emission. */
  sndT: number;
};
export interface EntityFeatureState {
  platform?: boolean;
  holdout?: string;
  civil?: boolean;
  arena?: string;
  hailOfferUntil?: number;
  hailResolved?: boolean;
  hailFuelHelp?: boolean;
  hailFuelChecked?: boolean;
  hailRepaired?: boolean;
  hailHardship?: { requested: number; resolved: boolean };
  hailEscort?: { owner: number; expires: number; dest: string };
  rescueOf?: { id: string; owner: number };
  story?: number;
  storyBoard?: boolean;
  storyAlly?: boolean;
  /** A personal convoy cannot be found until a Thalassi contact gives its bearing. */
  storySight?: 'thalassi';
  /** The choir holds a truthful channel rather than attacking the Dreamer. */
  storySinger?: boolean;
  /** Logical slot, parent slot, transition milliseconds and surviving-blade bitmask. */
  indexState?: [number, number, number, number];
  holdAt?: { x: number; y: number };
  home?: { x: number; y: number };
  wreckT?: number;

  /** Whether participating in shared fleet or group combat. */
  sharedCombat?: boolean;
  combatOwners?: number[];
  beamAcc?: number;
  beamEvT?: number;
  dmgBy?: Record<string, number>;
  bribed?: Set<string | number>;
  relHitT?: number;
  thankT?: number;
  boarded?: boolean;
  boardedBy?: number | null;
  warned?: boolean;
  ordSeq?: number;
  noLeave?: boolean;
  swarmling?: boolean;
  fled?: boolean;
  formationHolding?: boolean;
  holdoutBoss?: boolean;
}
export type Entity = EntityFeatureState & {
  /** Member of the bounded, neutral Index workgroup. */
  indexWorksite?: boolean;
  /** Carrying parent, separate from combat root ownership. */
  indexParent?: number;
  /** Persisted finite roster position. */
  indexSlot?: number;
  /** Unique entity simulation ID. */
  id: number;

  /** Hull ID of the ship. */
  hull: number | string;

  /** Faction identifier string. */
  faction: string;

  /** Coordinate X in 2D space. */
  x: number;

  /** Coordinate Y in 2D space. */
  y: number;

  /** Velocity vector X component. */
  vx: number;

  /** Velocity vector Y component. */
  vy: number;

  /** Heading orientation angle in radians. */
  a: number;

  /**
   * Live computed ship stats containing max armor.
   * Computed live ship stats.
   */
  st: ShipStats;

  /** Current shield hitpoints. */
  shield: number;

  /** Current armor hitpoints. */
  armor: number;

  /** Current hyperspace fuel. */
  fuel: number;

  /** AI behavior mode ('patrol', 'trade', 'raid', 'escort', 'flee', 'leave'). */
  ai: string | null;

  /**
   * Player reference if this is a player-controlled ship.
   * Session reference if this is a player-controlled ship.
   */
  player: PlayerReference | null;

  /** Entity ID of the commanding or parent ship. */
  owner: number | null;

  /** Custom or display ship name. */
  name: string | null;

  /**
   * Current active combat target entity.
   * Current active combat or navigation target entity.
   * Current combat target entity.
   */
  target: Entity | null;

  /**
   * Set of hostile entity IDs that have engaged this ship.
   * Set of hostile entity IDs that have attacked or engaged this ship.
   */
  aggro: Set<number>;

  /**
   * Ship input control state.
   * Input control state.
   */
  inp: {
    thrust?: number;
    turn?: number;
    ab?: number;
    rev?: number;
    fire1?: number;
    fire2?: number;
  };

  /** Array of installed weapon mounts and turrets. */
  guns: WeaponMount[];

  /**
   * True if the ship is destroyed.
   * True if the ship is destroyed or decommissioned.
   */
  dead: boolean;

  /** Simulation timestamp when entity was spawned. */
  born: number;

  /** Time until next AI decision cycle. */
  think: number;

  /**
   * Target destination waypoint coordinates.
   * Target destination point for navigation or docking.
   */
  dest: { x: number; y: number; id?: string; name?: string; out?: boolean; r?: number } | null;

  /** Entity flight state ('fly', 'jumpout', 'landed'). */
  state: string;

  /** Countdown timer for hyperjump execution. */
  jumpT: number;

  /** Destination system ID during jump. */
  jumpTo?: string;

  /** Mission data object if this is a spawned mission target. */
  mission?: Pick<Mission, 'id' | 'owner'> | null;
  /** Captains who dealt positive damage to their own accepted bounty target. */
  bountyContributors?: Set<number>;

  /** Lifespan in seconds before departure. */
  life: number;

  /** Cargo capacity or cargo indicator. */
  cargo: number;

  /**
   * Base combat strength rating.
   * Base strength rating of the ship.
   */
  strength: number;

  /** Combat role class ('interceptor', 'fighter', 'corvette', 'frigate', 'destroyer', 'cruiser'). */
  role?: string;

  /** AI combat personality ('cautious', 'steady', 'reckless'). */
  pers?: string;

  /**
   * Effective combat power rating.
   * Effective power rating.
   */
  pw: number;

  /**
   * True if the ship is disabled and drifting.
   * True if ship is disabled and drifting.
   */
  disabled?: boolean;

  /** Simulation timestamp when ship was disabled. */
  disT?: number;

  /** Simulation timestamp when ship was last damaged. */
  hitT?: number;

  /**
   * Entity ID of attacker that dealt last damage.
   * Entity ID of last attacker.
   */
  lastHitBy?: number;

  /** Grace period timestamp protecting newly arrived players. */
  graceT?: number;

  /** Arrival aperture inhibited until cleared. */
  wormExit?: string;

  /** Wormhole transit cooldown timestamp. */
  wormT?: number;

  /**
   * Rescue protection countdown timestamp.
   * Rescue grace period timestamp.
   */
  rescueT?: number;

  /** Parent carrier entity ID if this is a launched fighter drone. */
  fighterOf?: number;

  /** True if fighter drone is recalled to dock. */
  recall?: boolean;

  /** True if player ship has elite mastery. */
  elite?: boolean;

  /** True if this is an AI rival captain. */
  rival?: string;

  /** Fallback AI behavior for rival. */
  rivalAi?: string;

  /**
   * Whether automated combat maneuvers and weapon firing are enabled.
   * True if automated combat assist is active.
   */
  autoCombat?: boolean;

  /**
   * Shared combat target designated by assist or group leader.
   * Target entity selected by combat assist.
   */
  combatTarget?: Entity | null;

  /**
   * Active fleet order ('hold', 'holdfire', 'loot', 'gather', etc.).
   * Active fleet order mode ('hold', 'holdfire', 'loot', 'gather', etc.).
   * Current fleet command order ('gather', 'attack', 'hold', 'holdfire', 'loot').
   */
  order?: string;

  /**
   * Monotonic sequence counter of fleet orders.
   * Monotonic sequence counter for fleet order changes.
   * Sequence counter for fleet orders.
   */
  orderSeq?: number;

  /** True if invasion boss entity. */
  boss?: string;

  /** True if escort minion of an invasion boss. */
  bossMinion?: boolean;

  /** True if Armada contract kingpin target. */
  kingpin?: string;
  kingpinGuard?: string;
  contractTeam?: string[];

  /** True if spawned as part of a system state war fleet. */
  warFleet?: boolean;

  /** Armada shield recharge multiplier bonus. */
  coopRe?: number;

  /** Speed catchup boost when escort falls behind. */
  catchup?: ShipStats | null;

  /** True if accompanying a trader convoy. */
  tradeMate?: boolean;

  /** Formation slot index for wingmates. */
  escortSlot?: number;

  /** Saved wingmate unique identifier. */
  wingUid?: string;

  /** Player session ID of commanding player. */
  wingOf?: number;

  /** Hard attached towing velocity limit. */
  towCap?: number;

  /**
   * Timestamp until which entity is distracted.
   * Timestamp until distraction by jettisoned cargo expires.
   */
  distractT?: number;

  /**
   * Secondary weapon fire target entity.
   * Current target entity to aim weapons at.
   */
  fireAt?: Entity | null;

  /** Sequence number of last applied player input packet. */
  seq?: number;

  /** Previous state of secondary fire button. */
  _f2?: number;

  /**
   * Exemption flag preventing disablement threshold.
   * True if entity is destroyed immediately without disability threshold.
   */
  noDisable?: boolean;

  /** Noncombat industrial collector root ID. */
  industrialRoot?: number;

  /** Mining-pressure encounter scope ID. */
  miningEncounter?: string;

  /** Timestamp of last distress call for reinforcements. */
  helpT?: number;

  /** True if dreadnought boss entity. */
  dread?: boolean;

  /** Timestamp of last reputation penalty hit. */
  repHitT?: number;

  /** Linked story objective ID. */
  storyKill?: boolean;

  /** Faction arc objective identifier. */
  arcOf?: { sid: number; fac: string } | null;

  /** Hunt mission identifier. */
  huntOf?: number;

  /** Session ID of the captain this career practice raider was sent after. */
  practiceOf?: number;

  /** Ambient encounter identity, retained by surviving escorts after their leader leaves. */
  ambientGroup?: number;

  /** Recent unselected fire volleys per captain; lawful traffic tolerates isolated crossfire. */
  incidentalHits?: Map<number, { count: number; last: number }>;

  /** Arena combat team designation ('A' or 'B'). */
  team?: string;

  /** Convoy fleet identifier. */
  convoyOf?: { id: string; owner: number };

  /** Frontier wave encounter entity. */
  wave?: string;

  /** Formation slot assigned. */
  slot?: number | null;

  /** Calculated fuel requirement for hyperjump. */
  jumpCost?: number;
};
export type Rock = {
  /** Unique asteroid rock ID. */
  id: number;

  /** Coordinate X. */
  x: number;

  /** Coordinate Y. */
  y: number;

  /** Asteroid rock collision radius. */
  r: number;

  /** Ore commodity type mined ('gas', 'shards', 'ore', etc.). */
  ore: string;

  /** Ore richness multiplier. */
  rich: number;

  /** Current rock durability hitpoints. */
  hp: number;

  /** Maximum rock durability hitpoints. */
  max: number;

  /** Timestamp when depleted rock will respawn, or 0 if active. */
  down: number;

  /** Event tracking timestamp. */
  evT: number;
};
export type Shot = {
  pd?: number;

  /** Captured root captain for ordinary rock damage. */
  captain?: string | null;

  /** Unique projectile ID. */
  id: number;

  /** Captured pressure-encounter scope. */
  miningEncounter?: string;

  /** Captured mining provenance. */
  mining?: MiningSource | null;

  /** Weapon ID used to fire this shot. */
  w: number;

  /** Entity ID of shooting ship. */
  owner: number;

  /** Current position X. */
  x: number;

  /** Current position Y. */
  y: number;

  /** Velocity X component. */
  vx: number;

  /** Velocity Y component. */
  vy: number;

  /** Remaining projectile lifetime in seconds. */
  life: number;

  /** Armor / hull damage dealt on impact. */
  dmgA: number;

  /** Shield damage dealt on impact. */
  dmgS: number;

  /** Precomputed weapon properties. */
  p: WeaponConfig;

  /** Guided missile target entity, if homing. */
  target?: Entity | null;
};
export type Beam = {
  /** Entity ID of beam emitter. */
  id: number;
  /** Weapon ID. */
  w: number;
  /** Beam direction angle in radians. */
  a: number;
  /** Beam length in world units. */
  len: number;
  /** Simulation timestamp until beam expires. */
  until: number;
};
export type LootItem = {
  /** Explicit Index salvage claim; automatic collectors must skip it. */
  indexClaim?: boolean;
  /** Captain who explicitly chose to take this parcel. */
  indexTakenBy?: string;
  lots?: GradeLots;
  lvl?: number;

  /** Credits salvage value. */
  credits?: number;

  /** Material commodity type. */
  mat?: string;

  /** Material grade index (0-4). */
  grade?: number;

  /** Mined ore commodity ID. */
  ore?: string;

  /** Authored field richness (not raw grade). */
  rich?: number;
  remainingLots?: GradeLots;
  generationKey?: string;
  parcelKey?: string;
  progressionTokens?: number[];
  progressionClaimed?: boolean;

  /** Quantity of ore or units. */
  n?: number;

  /** Jettisoned commodity ID. */
  cargo?: string;

  /** Owner-only pickup grace in origin-system simulation time. */
  jettisonPickup?: { owner: string; sys: string; until: number };

  /** Quest salvage payload. */
  salvage?: string;
  owner?: number;

  /** Pirate treasure chest payload. */
  chest?: string;
};
export type FloatingLoot = {
  /** Unique loot canister ID. */
  id: number;

  /** Position X. */
  x: number;

  /** Position Y. */
  y: number;

  /** Drift velocity X. */
  vx: number;

  /** Drift velocity Y. */
  vy: number;

  /** Item contents. */
  it: LootItem;

  /** Spawn simulation timestamp. */
  t: number;

  /** Visual kind (0: canister/credits, 1: material crate, 2: jettisoned cargo). */
  kind: number;

  /** True if already collected by a ship. */
  taken?: boolean;
};
export type SpaceSnapshot = {
  /** Array of serialized ship state tuples. */
  ships: Array<Array<number | string | null>>;

  /** Serialized projectile positions and weapon types. */
  shots: Array<number[]>;

  /** Serialized active laser beam vectors. */
  beams: Array<number[]>;

  /** Serialized floating salvage canisters. */
  loot: Array<number[]>;

  /** Transient visual/audio simulation events. */
  ev: Array<[string, ...(number | string)[]]>;
};

import { formationTargets, steerFormation, cancelFormation } from './armada-formation.ts';
import { eventideDrain } from '../shared/eventide.ts';

// One star system's live simulation: ships (players, their escorts, NPC traffic), shots, beams, loot.
import { SYS as systemsById, TRAFFIC, FACTIONS, MATERIALS } from '../shared/galaxy.ts';
import { roleMult } from '../shared/roles.ts';
import {
  fitRaidToBudget,
  raidBudget,
  hullCombatPower,
  shipCombatPower,
} from '../shared/hostile.ts';
import { STATES } from '../shared/living.ts';
import {
  shipStats,
  weaponParams,
  weaponSound,
  step,
  wrap,
  angDiff,
  angleTo,
  hostileFactions,
  K as physicsConstants,
  DT as tickDuration,
} from '../shared/rules.ts';

let NEXT = 1;
const SLOTS = [
  [-1, 1],
  [1, 1],
  [-2, 1.8],
  [2, 1.8],
  [0, 2.2],
  [-3, 2.6],
  [3, 2.6],
  [-1, 3],
  [1, 3],
]; // escort formation: [lateral, behind]
/**
 * Calculates Euclidean distance between an entity and coordinates.
 * @param entity Source entity.
 * @param positionX Target X coordinate.
 * @param positionY Target Y coordinate.
 * @returns Distance in world units.
 */
const distance0 = (entity: Entity, positionX: number, positionY: number): number =>
  Math.hypot(positionX - entity.x, positionY - entity.y);
const faction2 = Object.keys(FACTIONS);
/**
 * Generates a random float in range [a, b).
 * @param firstValue Minimum bound.
 * @param secondValue Maximum bound.
 * @returns Random float.
 */
const random2 = (firstValue: number, secondValue: number): number =>
  firstValue + Math.random() * (secondValue - firstValue);
/**
 * Picks a random element from an array.
 * @param entries2 Source array.
 * @returns Randomly selected element.
 */
const pick = <ValueType>(entries: ValueType[]): ValueType =>
  entries[Math.floor(Math.random() * entries.length)];

/**
 * Live 2D space simulation for a single star system.
 * Simulates ships, physics, weapons fire, projectile trajectories, laser beams,
 * floating debris/loot, asteroid fields, and NPC combat AI.
 */
export class Space {
  /** Parent game server engine instance. */
  declare game: Game;

  /** Global game asset definitions. */
  declare A: GameAssets;

  /**
   * System configuration parameters.
   * System definition and stellar data from galaxy database.
   */
  declare sys: SpaceSystem;

  /**
   * Space system identifier.
   * Unique system identifier string.
   */
  declare id: string;

  /**
   * Map of entity ID to live ship entities.
   * Map of entity ID to active ship entities.
   * Active ships, escorts, drones, and traffic in this system.
   */
  declare ships: Map<number, Entity>;
  /** Transient identities of the initial neutral Index worksite. */
  declare indexWorksite?: IndexWorksite;

  /** Active ballistic and guided weapon projectiles. */
  declare shots: Shot[];

  /** Active continuous beam weapons currently firing. */
  declare beams: Beam[];

  /**
   * Array of floating cargo canisters adrift in space.
   * Floating cargo canisters, mined ore chunks, and salvage crates.
   */
  declare loot: FloatingLoot[];

  /** Transient visual and audio events accumulated for next client network update. */
  declare events: Array<[string, ...(number | string)[]]>;

  /** Mining field asteroids and gas pockets. */
  declare rocks: Rock[];

  /** Cached system-wide modifiers from active fronts or living states. */
  declare m: Record<string, number> | null;

  /** Counter for modifier recalculation cadence. */
  declare mT: number;

  /** Quiet duration timer for system sleep deallocation. */
  declare quietT: number;

  /** Prevent deallocation flag. */
  declare keep: boolean;

  /** Count of tick simulation errors. */
  declare errs: number;

  /** Cached list of neighboring faction IDs for frontier traffic generation. */
  declare nearFacs: string[];

  /** Cached landing-capable spaceports in this system. */
  declare _ports: RawStellarBody[];

  /**
   * Current simulation timestamp.
   * Simulation timestamp in seconds.
   */
  declare t: number;

  /** Countdown until next background traffic spawn check. */
  declare spawnT: number;

  /** Earliest simulation time when another ambient hostile group may arrive. */
  declare nextRaidT?: number;

  /** Number of human player-piloted ships currently flying in this system. */
  declare players: number;

  /**
   * Initializes a live system space simulation.
   * @param game Server game instance.
   * @param systemId Unique star system ID.
   */
  constructor(game: Game, systemId: string) {
    this.game = game;
    this.A = game.A;
    this.sys = systemsById[systemId];
    this.id = systemId;
    this.ships = new Map();
    this.shots = [];
    this.beams = [];
    this.loot = [];
    this.events = [];
    this.t = 0;
    this.spawnT = 1;
    this.players = 0;
    if (!this.sys.arena)
      for (
        let index = 0, count = 5 + this.sys.danger + Math.floor(this.ports().length / 2);
        index < count;
        index++
      )
        this.spawnTraffic(true); // busier systems
    // asteroids and gas pockets in the system's mining fields: they break into ore that ships scoop up, and regrow
    this.rocks = [];
    this.game.features.mining.openSpace(this);
    this.game.features.index?.open(this);
  }
  /**
   * Generates compact serialized state array of asteroid field rocks for client rendering.
   * @returns Compact array of [id, x, y, radius, ore, hpPct].
   */
  rocksPayload(): Array<[number, number, number, number, string, number]> {
    return this.rocks.map((rock) => [
      rock.id,
      rock.x,
      rock.y,
      rock.r,
      rock.ore,
      rock.down ? 0 : Math.round((100 * rock.hp) / rock.max),
    ]);
  }
  /**
   * Applies weapon damage to an asteroid rock, spawning floating ore chunks when broken.
   * @param rock Target asteroid rock.
   * @param damage2 Incoming weapon damage.
   * @param mining Whether damage originates from a mining laser.
   */
  hitRock(
    rock: Rock,
    damage: number,
    mining: boolean,
    captain: string | null | undefined = null,
  ): void {
    // Legacy direct damage retains ordinary output; clean credit requires actual collision provenance.
    this.game.features.mining.ordinary(this, rock, damage * (mining ? 6 : 1), captain);
  }
  /**
   * Finds an active asteroid rock intersecting coordinates.
   * @param positionX Coordinate X.
   * @param positionY Coordinate Y.
   * @param padding Hitbox expansion padding.
   * @returns Colliding rock, or null if none.
   */
  rockAt(positionX: number, positionY: number, padding: number = 0): Rock | null {
    for (const rock of this.rocks)
      if (
        !rock.down &&
        Math.abs(rock.x - positionX) < rock.r + padding &&
        Math.abs(rock.y - positionY) < rock.r + padding &&
        Math.hypot(rock.x - positionX, rock.y - positionY) < rock.r + padding
      )
        return rock;
    return null;
  }

  // ------------------------------------------------------------------ ships
  /**
   * Spawns and registers a new ship entity in this space simulation.
   * @param options Ship initialization parameters.
   * @param o.loadout Ship loadout with hull, outfits, weapons, and ammo.
   * @param o.hull Hull ID if no loadout specified.
   * @param o.faction Faction affiliation ID.
   * @param o.x Initial position X.
   * @param o.y Initial position Y.
   * @param o.vx Initial velocity X.
   * @param o.vy Initial velocity Y.
   * @param o.a Initial heading angle in radians.
   * @param o.bonus Stat multiplier bonuses.
   * @param o.shield Override initial shields.
   * @param o.armor Override initial armor.
   * @param o.fuel Override initial fuel.
   * @param o.ai AI behavior mode.
   * @param o.player Player reference if player-piloted.
   * @param o.owner Commanding parent entity ID.
   * @param o.name Display name.
   * @param o.state Initial flight state.
   * @param o.mission Linked mission payload.
   * @param o.cargo Carried cargo count.
   * @param o.pers Combat personality override.
   * @param o.ammo Weapon ammo counts.
   * @returns The initialized and registered ship entity.
   */
  makeShip(entity: {
    loadout?: ShipLoadout;
    hull?: number;
    faction?: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    a?: number;
    bonus?: ShipStatsBonus;
    shield?: number;
    armor?: number;
    fuel?: number;
    ai?: string | null;
    player?: PlayerReference | null;
    owner?: number | null;
    name?: string | null;
    state?: string;
    mission?: Pick<Mission, 'id' | 'owner'> | null;
    cargo?: number;
    pers?: string;
    ammo?: Record<string | number, number>;
  }): Entity {
    const loadout = entity.loadout || { hull: entity.hull!, outfits: {} };
    const computedShipStats = shipStats(this.A, loadout, entity.bonus || {})!;
    const currentEntity = {
      id: NEXT++,
      hull: loadout.hull,
      faction: entity.faction || 'spacer',
      x: entity.x || 0,
      y: entity.y || 0,
      vx: entity.vx || 0,
      vy: entity.vy || 0,
      a: entity.a || 0,
      st: computedShipStats,
      shield: entity.shield ?? computedShipStats.shield,
      armor: entity.armor ?? computedShipStats.armor,
      fuel: entity.fuel ?? computedShipStats.fuel,
      ai: entity.ai || null,
      player: entity.player || null,
      owner: entity.owner || null,
      name: entity.name || null,
      target: null,
      aggro: new Set(),
      inp: { thrust: 0, turn: 0 },
      guns: [],
      dead: false,
      born: this.t,
      think: 0,
      dest: null,
      state: entity.state || 'fly',
      jumpT: 0,
      mission: entity.mission || null,
      life: random2(150, 300),
      cargo: entity.cargo || 0,
      strength: this.A.ships[loadout.hull].strength || 10,
    } as Omit<Entity, 'pw'> & { pw?: number };
    const shipHullAsset = this.A.ships[loadout.hull];
    currentEntity.role = shipHullAsset.role;
    if (!currentEntity.player) {
      const factionDef = FACTIONS[currentEntity.faction] || {},
        radius = Math.random();
      currentEntity.pers =
        entity.pers ||
        (factionDef.pirate
          ? radius < 0.15
            ? 'cautious'
            : radius < 0.6
              ? 'steady'
              : 'reckless'
          : radius < 0.35
            ? 'cautious'
            : radius < 0.85
              ? 'steady'
              : 'reckless');
    } // how a captain fights
    currentEntity.pw = shipCombatPower(this.A, loadout, entity.bonus || {});
    const defAmmo: Record<string, number> = {};
    for (const [width, , firstValue] of shipHullAsset.weapons)
      defAmmo[width] = (defAmmo[width] || 0) + firstValue!;
    for (const [width, count] of Object.entries(computedShipStats.weapons)) {
      const weaponAsset = this.A.weapons[width];
      if (!weaponAsset) continue;
      const weapon = weaponParams(weaponAsset);
      const needsAmmo = (weapon.homing || weapon.rocket || weapon.bay) && weaponAsset.ammo !== -1;
      const ammo = needsAmmo
        ? entity.ammo && entity.ammo[width] !== undefined
          ? entity.ammo[width]
          : defAmmo[width] || 0
        : Infinity;
      currentEntity.guns.push({
        w: +width,
        n: count,
        p: weapon,
        cd: random2(0, weapon.reload),
        ammo,
        snd: weaponSound(weaponAsset),
        sec: weapon.homing || weapon.rocket || weapon.bay,
        sndT: 0,
      });
    }
    this.ships.set(currentEntity.id, currentEntity as Entity);
    return currentEntity as Entity;
  }
  /**
   * Removes a ship entity from simulation and flags it as dead.
   * @param entity Ship entity to remove.
   * @param reason Visual flash effect trigger reason (e.g. 'jump').
   */
  remove(entity: Entity, reason?: string): void {
    if (entity.player && entity.player.s.ent === entity && this.game.db.world.towing)
      this.game.features.towing.detach(entity.player.s);
    entity.dead = true;
    this.ships.delete(entity.id);
    if (reason) this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
  }
  /**
   * Resolves the top-level owner or wing leader for an entity (traversing up to 4 levels).
   * @param entity Candidate entity.
   * @returns Root leader entity, or the entity itself.
   */

  /**
   * Resolves fleet root or parent commanding entity.
   * Resolves the faction of the fleet leader or commanding root entity.
   */
  root(entity: null): null;

  /**
   * Resolves fleet root or parent commanding entity.
   * Resolves the faction of the fleet leader or commanding root entity.
   */
  root(entity: Entity): Entity;

  /**
   * Resolves fleet root or parent commanding entity.
   * Resolves the faction of the fleet leader or commanding root entity.
   */
  root(entity: Entity | null): Entity | null;

  /**
   * Resolves fleet root or parent commanding entity.
   * Resolves the faction of the fleet leader or commanding root entity.
   */
  root(entity: Entity | null): Entity | null {
    let entity2: Entity | null = entity,
      entryKey = 0;
    while (entity2 && entity2.owner && entryKey++ < 4)
      entity2 = this.ships.get(entity2.owner) || null;
    return entity2 || entity;
  }
  /**
   * Gets cached list of landing-capable ports in this system.
   * @returns Array of stellar bodies with landing services.
   */
  ports(): RawStellarBody[] {
    return (
      this._ports ||
      (this._ports = this.sys.stellars.filter(
        (stellarBody) => stellarBody.svc && stellarBody.svc.includes('L') && !stellarBody.site,
      ))
    );
  } // where traffic can land
  /**
   * Gets the player session ID owning an entity or its root escort group.
   * @param entity Candidate entity.
   * @returns Player session ID, or null if NPC.
   */
  pid(entity: Entity): number | null {
    const entity2 = this.root(entity);
    return entity2 && entity2.player ? entity2.player.id : null;
  }
  // Session-only hostility lasts through landing/relaunch, but not the next system visit.
  beginVisit(session: Session) {
    if (session.retaliationVisit?.sys !== this.id)
      session.retaliationVisit = { sys: this.id, factions: new Set() };
    return session.retaliationVisit;
  }
  localRetaliation(entity: Entity, player: Entity) {
    const visit = player?.player?.s?.retaliationVisit;
    return !!(visit?.sys === this.id && visit.factions.has(entity.faction));
  }
  // Ambient NPCs overlook below-Tier-3 captains throughout the main galaxy.
  // This is target-acquisition protection, not immunity to stray fire.

  /** Checks ambient targeting truce without arrival grace. */
  newcomerTruce(entity2: Entity | null, entity3: Entity) {
    const entity = this.root(entity3),
      entity4 = this.root(entity2);
    if (!entity?.player || !entity4 || entity4.player || this.sys.farside || this.sys.arena)
      return false;
    if (!this.game.newcomer?.(entity.player.s?.data) || this.localRetaliation(entity4, entity))
      return false;
    if (
      entity4.aggro.has(entity.id) ||
      entity.aggro.has(entity4.id) ||
      entity4.mission?.owner === entity.player.id ||
      (entity4.storyKill && entity4.story === entity.player.id) ||
      entity4.arcOf?.sid === entity.player.id ||
      entity4.huntOf === entity.player.id ||
      entity4.combatOwners?.includes(entity.player.id) ||
      (entity4.kingpin &&
        entity.player.s?.data.missions?.some(
          (mission) =>
            mission.type === 'warband' && mission.id === entity4.kingpin && !mission.done,
        ))
    )
      return false;
    return true;
  }
  /** Targeting truce; short arrival grace remains separate from newcomer eligibility. */

  /** Checks whether source faction spares target. */
  spared(entity2: Entity, entity3: Entity) {
    const entity = this.root(entity3),
      entity4 = this.root(entity2);
    if (!entity?.player || !entity4 || entity4.player) return false;
    if (this.localRetaliation(entity4, entity) || entity4.aggro.has(entity.id)) return false;
    return entity.graceT! > this.t || this.newcomerTruce(entity2, entity3);
  }
  // Idle wingmates must not turn a captain's protected passage into an unsolicited fight.
  canAcquire(entity: Entity, entity3: Entity) {
    if (entity.industrialRoot || entity3.industrialRoot) return false;
    if (
      (entity.miningEncounter || entity3.miningEncounter) &&
      this.game.features.pressure.allow(this, entity, entity3) === false
    )
      return false;
    if (this.spared(entity, entity3)) return false;
    const sourceRoot = this.root(entity),
      targetRoot = this.root(entity3);
    if (
      !sourceRoot.player &&
      (sourceRoot.ai === 'raid' || sourceRoot.ambientGroup != null) &&
      targetRoot.player &&
      !sourceRoot.aggro.has(targetRoot.id) &&
      !targetRoot.aggro.has(sourceRoot.id) &&
      !sourceRoot.mission &&
      !sourceRoot.huntOf &&
      !sourceRoot.boss &&
      !sourceRoot.kingpin &&
      !sourceRoot.storyKill &&
      !sourceRoot.arcOf &&
      !sourceRoot.wave &&
      !sourceRoot.combatOwners
    ) {
      const hunters = new Set(
        [...this.ships.values()]
          .filter(
            (ship) =>
              !ship.dead &&
              (ship.ai === 'raid' || ship.ambientGroup != null) &&
              ship.target &&
              this.root(ship.target) === targetRoot,
          )
          .map((ship) => ship.ambientGroup ?? ship.id),
      );
      if (
        !hunters.has(sourceRoot.ambientGroup ?? sourceRoot.id) &&
        hunters.size >= (this.sys.danger >= 6 ? 3 : 2)
      )
        return false;
    }

    const lead = this.root(entity);
    return !(
      !entity.player &&
      lead?.player &&
      !this.ordered(entity, entity3) &&
      !(lead.sharedCombat && lead.combatTarget === entity3) &&
      this.newcomerTruce(entity3, entity)
    );
  }
  // can a's fire hurt b? Hostiles always; a captain's own guns also hit any ship not on their side (like EV Nova),
  // which angers it and costs standing. Escorts and NPCs still only hit their enemies.
  // your wingmates under an attack order (K) go after whatever you have targeted, hostile or not
  /**
   * Checks whether an escort entity is ordered by its player leader to attack target.
   * @param entity Escort entity.
   * @param entity2 Candidate target entity.
   * @returns True if escort is explicitly ordered to attack target.
   */
  ordered(entity: Entity, entity2: Entity): boolean {
    const entity3 = this.root(entity);
    if (
      !entity.owner ||
      !entity3 ||
      !entity3.player ||
      entity3.order !== 'attack' ||
      !entity3.target ||
      entity3.target.dead ||
      this.sys.arena
    )
      return false;
    const entity4 = this.root(entity2);
    return entity4 === this.root(entity3.target) && entity4 !== entity3 && !entity4.player;
  }
  /**
   * Determines whether weapon fire from entity a can damage entity b.
   * @param attacker Attacking ship entity.
   * @param rightEntity Target ship entity.
   * @returns True if attacks can connect and damage target.
   */

  /** Checks whether attacks can connect and damage target. */
  canHit(attacker: Entity, rightEntity: Entity): boolean {
    const sourceCaptain = this.root(attacker).player?.id;
    const targetCaptain = this.root(rightEntity).player?.id;
    if (
      (rightEntity.story && sourceCaptain && rightEntity.story !== sourceCaptain) ||
      (attacker.story && targetCaptain && attacker.story !== targetCaptain)
    )
      return false;
    if (attacker.industrialRoot || rightEntity.industrialRoot) return false;
    if (
      (attacker.miningEncounter || rightEntity.miningEncounter) &&
      this.game.features.pressure.allow(this, attacker, rightEntity) === false
    )
      return false;
    if (this.isHostile(attacker, rightEntity)) {
      // Only arrival grace blocks physical damage. Ambient newcomer truce blocks
      // acquisition, while existing shots/beams can still hit a crossing captain.
      const target = this.root(rightEntity),
        source = this.root(attacker);
      return !(
        target?.player &&
        !source?.player &&
        target.graceT! > this.t &&
        !this.localRetaliation(source, target)
      );
    }
    if (this.ordered(attacker, rightEntity)) return true;
    if (!attacker || !rightEntity || !attacker.player || this.sys.arena) return false;
    const entity = this.root(rightEntity);
    if (entity === attacker || entity.player) return false; // Never your own wing; player attacks follow consent and arena rules (isHostile).
    return !rightEntity.dead && rightEntity.state === 'fly';
  }
  /**
   * Checks whether this system is classified as safe inner Concord space (danger <= 2).
   * @returns True if inner territory.
   */
  inner(): boolean {
    const starSystem = this.sys;
    return (
      starSystem.danger <= 2 &&
      !starSystem.farside &&
      !starSystem.arena &&
      !['umbral', 'deep'].includes(starSystem.faction)
    );
  }

  /**
   * Evaluates mutual hostility between two ships based on factions, aggro, duels, and missions.
   * @param leftEntity First entity.
   * @param rightEntity Second entity.
   * @returns True if ships are hostile to one another.
   */

  /** Checks hostile relationship between entities. */
  isHostile(leftEntity: Entity, rightEntity: Entity): boolean {
    if (
      !leftEntity ||
      !rightEntity ||
      leftEntity === rightEntity ||
      leftEntity.dead ||
      rightEntity.dead
    )
      return false;
    const firstCaptain = this.root(leftEntity).player;
    const secondCaptain = this.root(rightEntity).player;
    if (
      (leftEntity.story && secondCaptain && leftEntity.story !== secondCaptain.id) ||
      (rightEntity.story && firstCaptain && rightEntity.story !== firstCaptain.id)
    )
      return false;
    if (
      (firstCaptain?.s.data.story?.flags?.d2 === 'umbral' && rightEntity.faction === 'umbral') ||
      (secondCaptain?.s.data.story?.flags?.d2 === 'umbral' && leftEntity.faction === 'umbral')
    ) {
      if (!leftEntity.aggro.has(rightEntity.id) && !rightEntity.aggro.has(leftEntity.id))
        return false;
    }
    const nhalHostility = this.game.features.nhal?.allow(this, leftEntity, rightEntity) ?? null;
    if (nhalHostility !== null) return nhalHostility;
    const fleetHostility =
      this.game.features.indexFleet?.allow(this, leftEntity, rightEntity) ?? null;
    if (fleetHostility !== null) return fleetHostility;
    const indexHostility = this.game.features.index?.allow(this, leftEntity, rightEntity) ?? null;
    if (indexHostility !== null) return indexHostility;
    const scoped =
      leftEntity.miningEncounter || rightEntity.miningEncounter
        ? this.game.features.pressure.allow(this, leftEntity, rightEntity)
        : null;
    if (scoped !== null) return scoped;
    const entity = this.root(leftEntity),
      entity2 = this.root(rightEntity);
    if (entity === entity2) return false;
    if (entity.rescueT! > this.t || entity2.rescueT! > this.t) return false; // a downed captain waiting for rescue is left alone
    const playerReference = entity.player,
      playerReference2 = entity2.player;
    if (this.sys.arena) return !!(entity.team && entity2.team && entity.team !== entity2.team); // arena: teams only
    if (
      playerReference &&
      playerReference2 &&
      this.game.features.coop.sameArmada(playerReference, playerReference2)
    )
      return false; // Armada members and their wingmates never fight
    if (playerReference && playerReference2)
      return !!(
        this.game.features.coop.dueling &&
        this.game.features.coop.dueling(playerReference, playerReference2)
      ); // no open-galaxy PvP, whatever was fired; only agreed duels (and the Crucible, above)
    if (entity.aggro.has(entity2.id) || entity2.aggro.has(entity.id)) return true;
    if (
      ((entity.boss || entity.bossMinion || entity.kingpin) && playerReference2) ||
      ((entity2.boss || entity2.bossMinion || entity2.kingpin) && playerReference)
    )
      return true; // Armada contract kingpins too   // invasion bosses attack everyone
    if (playerReference || playerReference2) {
      const playerReference3 = (playerReference || playerReference2)!,
        entity3 = playerReference ? entity2 : entity,
        reputation = playerReference3.rep[entity3.faction] || 0,
        factionDef = FACTIONS[entity3.faction];
      if (this.localRetaliation(entity3, playerReference ? entity : entity2)) return true;
      const rivalHostile2 = this.game.features.rivals.rivalHostile
        ? this.game.features.rivals.rivalHostile(entity3, playerReference3)
        : undefined;
      if (rivalHostile2 !== undefined) return rivalHostile2; // rivals, hired guns, bribes
      if (factionDef && factionDef.pirate) return reputation < 30;
      if (factionDef && factionDef.alwaysHostile) return true;
      if (entity3.mission && entity3.mission.owner === playerReference3.id) return true;
      return reputation <= -30;
    }
    return hostileFactions(entity.faction, entity2.faction);
  }

  // ------------------------------------------------------------------ traffic
  /**
   * Spawns ambient civilian traders, faction patrols, or pirate raiders based on system danger.
   * @param initial True if spawning initial population on system spin-up.
   * @returns The lead spawned ship entity, if any.
   */
  spawnTraffic(initial?: boolean): Entity | null | void {
    const starSystem = this.sys;
    if (['table', 'quantum-rift', 'beyond-rift', 'founding-vigil'].includes(starSystem.id))
      return null;
    if (starSystem.faction === 'deep') {
      // An occasional, explicitly tagged Eclipse cell is an encounter exception,
      // not a return to the Deep's former Umbral/Hollow population mix.
      if (
        !Array.from(this.ships.values()).some(
          (entity) => entity.faction === 'eclipse' && !entity.dead,
        ) &&
        this.game.features.hostile?.eclipseChance &&
        Math.random() < this.game.features.hostile.eclipseChance(starSystem, this.m)
      )
        return this.spawnEclipse(initial);
      return this.game.features.nhal?.spawnTraffic(this, initial) ?? null;
    }
    if (
      (starSystem.faction === 'vashari' || starSystem.faction === 'frontier') &&
      Math.random() < 0.14 * (this.m ? this.m.swarm : 1)
    )
      return this.spawnSwarm(initial);
    if (
      this.game.features.hostile.eclipseChance &&
      Math.random() < this.game.features.hostile.eclipseChance(starSystem, this.m)
    )
      return this.spawnEclipse(initial);
    let faction3 = starSystem.faction;
    if (FACTIONS[faction3].region) {
      // Frontier and the Deep fly no flag: traffic comes from the neighbours, raiders and scavengers
      if (!this.nearFacs) {
        const neutralSystems = new Set<string>();
        for (const link of starSystem.links) {
          const faction4 = systemsById[link].faction;
          if (!FACTIONS[faction4].region && !FACTIONS[faction4].pirate)
            neutralSystems.add(faction4);
        }
        this.nearFacs = [...neutralSystems, 'spacer', 'spacer'];
      }
      const roll = Math.random();
      if (faction3 === 'deep') faction3 = roll < 0.7 ? 'umbral' : 'hollow';
      else faction3 = roll < 0.12 * starSystem.danger ? 'hollow' : pick(this.nearFacs);
    }
    const traffic = TRAFFIC[faction3];
    let kind,
      faction32 = faction3,
      roll = Math.random();
    const livingState = this.game.features.living.stateOf
        ? this.game.features.living.stateOf(this.id)
        : null,
      systemState = livingState ? STATES[livingState.kind] : null; // the system's state shapes its traffic
    if (
      livingState &&
      livingState.kind === 'war' &&
      livingState.enemy &&
      TRAFFIC[livingState.enemy] &&
      Math.random() < 0.35
    ) {
      const lead = this.spawnGroup(
        'patrol',
        livingState.enemy,
        TRAFFIC[livingState.enemy].war,
        initial,
      );
      if (lead)
        for (const entity of this.ships.values())
          if (entity === lead || entity.owner === lead.id) entity.warFleet = true;
      return lead;
    } // tagged, so newcomers are spared
    if (livingState && livingState.kind === 'pirates' && Math.random() < 0.3) roll = -1; // force a raid roll below
    if (FACTIONS[faction3].pirate) kind = 'raid';
    else if (
      (starSystem.danger >= 2 || roll < 0) &&
      roll < 0.08 * starSystem.danger * (this.m ? this.m.raid : 1)
    ) {
      kind = 'raid';
      faction32 =
        Math.random() < 0.3 && starSystem.danger >= 3 && !starSystem.farside ? 'umbral' : 'hollow';
    } else if (roll < 0.68 && traffic.traders.length) kind = 'trade';
    else if (roll < 0.82) {
      kind = 'trade';
      faction32 = 'spacer';
    } else kind = 'patrol';
    if (
      kind === 'raid' &&
      FACTIONS[starSystem.faction].pirate &&
      [...this.ships.values()].filter(
        (entity) => entity.ai === 'raid' && !entity.owner && !entity.mission,
      ).length >=
        3 + Math.floor(starSystem.danger / 2)
    ) {
      kind = 'trade';
      faction32 = 'spacer';
    } // pirate havens get visiting smugglers and free traders too
    else if (
      kind === 'raid' &&
      !FACTIONS[starSystem.faction].pirate &&
      [...this.ships.values()].filter(
        (entity) => entity.ai === 'raid' && !entity.owner && !entity.mission,
      ).length >=
        (this.inner() ? 1 : 2) +
          Math.floor(starSystem.danger / 2) +
          ((systemState && systemState.raidCap) || 0)
    ) {
      kind = 'trade';
      faction32 = traffic.traders.length ? faction3 : 'spacer';
      roll = 1;
    } // raiders don't pile up while traders come and go
    let pool =
      kind === 'trade'
        ? TRAFFIC[faction32].traders.length
          ? TRAFFIC[faction32].traders
          : TRAFFIC.spacer.traders
        : TRAFFIC[faction32].war;
    if (kind === 'raid' && this.inner() && pool.length > 2)
      pool = [...pool]
        .sort(
          (firstValue, secondValue) =>
            ((this.A.ships[firstValue] || {}).cost || 0) -
            ((this.A.ships[secondValue] || {}).cost || 0),
        )
        .slice(0, pool.length - 1); // no destroyers raiding inner space
    const hull = pick(pool);
    if (!this.A.ships[hull]) return;
    const count =
      kind === 'trade'
        ? Math.random() < 0.22
          ? 2 + (Math.random() < 0.4 ? 1 : 0)
          : 1
        : (Math.random() < 0.4 ? 2 : 1) + (kind === 'raid' && starSystem.danger > 3 ? 1 : 0); // some traders run in small convoys
    let hulls = [hull];
    for (let index = 1; index < count; index++)
      hulls.push(
        pick(
          pool.filter(
            (positionX) => (this.A.ships[positionX].cost || 0) <= (this.A.ships[hull].cost || 1e9),
          ) || pool,
        ),
      );
    if (kind === 'raid') hulls = this.fitAmbientRaid(hulls, pool);
    let lead = null;
    for (const [index, height] of hulls.entries()) {
      let positionX, positionY, firstValue, value;
      if (initial) {
        positionX = random2(-1800, 1800);
        positionY = random2(-1800, 1800);
        firstValue = random2(-Math.PI, Math.PI);
        value = 30;
      } else if (kind === 'trade' && this.ports().length && Math.random() < 0.45) {
        // take off from a spaceport
        const stellarBody = pick(this.ports());
        positionX = stellarBody.x + random2(-40, 40);
        positionY = stellarBody.y + random2(-40, 40);
        firstValue = random2(-Math.PI, Math.PI);
        value = 10;
      } else {
        const angle = random2(-Math.PI, Math.PI);
        positionX = Math.sin(angle) * 2600;
        positionY = -Math.cos(angle) * 2600;
        firstValue = wrap(angle + Math.PI);
        value = 140;
      }
      const entity = this.makeShip({
        hull: height,
        faction: faction32,
        x: positionX + index * 60,
        y: positionY + index * 50,
        a: firstValue,
        vx: Math.sin(firstValue) * value,
        vy: -Math.cos(firstValue) * value,
        ai: kind,
        owner: lead ? lead.id : null,
      });
      if (!initial) this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
      if (kind === 'raid') entity.ambientGroup = lead?.id ?? entity.id;
      if (!lead) lead = entity;
      else {
        entity.ai = 'escort';
        if (kind === 'trade') entity.tradeMate = true;
      }
    }
  }
  /** Live ambient raiders, including escorts and special incursion cells. */
  ambientRaiders(): Entity[] {
    return [...this.ships.values()].filter((entity) => {
      const root = this.root(entity);
      return (
        !entity.dead &&
        !root.player &&
        (entity.ambientGroup != null || root.ai === 'raid' || root.warFleet) &&
        !root.mission &&
        !root.huntOf &&
        !root.practiceOf &&
        !root.storyKill &&
        !root.arcOf &&
        !root.boss &&
        !root.kingpin &&
        !root.wave &&
        !root.combatOwners
      );
    });
  }

  /** Remaining shared ambient threat allowance; unoccupied systems defer hostile wake spawns. */
  raidBudget(): number | null {
    if (this.sys.farside || this.sys.arena) return null;
    const powers: number[] = [];
    for (const entity of this.ships.values()) {
      const playerData = entity.player?.s?.data;
      if (entity.dead || !playerData || entity.player!.s.ent !== entity) continue;
      powers.push(this.game.features.hostile.myPower(playerData));
    }
    if (!powers.length) return 0;
    const strongest = Math.max(...powers);
    const fleetPower =
      strongest + (powers.reduce((sum, power) => sum + power, 0) - strongest) * 0.6;
    const raiders = this.ambientRaiders();
    const roots = new Set(raiders.map((entity) => entity.ambientGroup ?? this.root(entity).id));
    if (roots.size >= (this.sys.danger >= 5 ? 3 : 2)) return 0;
    const present = raiders.reduce((sum, entity) => sum + entity.pw, 0);
    const totalBudget = fleetPower * (0.4 + 0.2 * Math.max(0, this.sys.danger));
    return Math.max(0, Math.min(raidBudget(strongest, this.sys.danger), totalBudget - present));
  }

  /** Fit every ambient encounter through one strict allowance, with no over-budget floor. */
  fitAmbientRaid(hulls: number[], pool: number[]): number[] {
    const budget = this.raidBudget();
    if (budget == null) return hulls;
    if ((this.nextRaidT ?? -Infinity) > this.t) return [];
    const available = pool.filter(
      (hull) => this.A.ships[hull] && hullCombatPower(this.A, hull) <= budget,
    );
    if (!available.length) return [];
    const fitted = fitRaidToBudget(
      hulls,
      available,
      (hull) => hullCombatPower(this.A, hull),
      budget,
    );
    // A cleared encounter leaves time to recover shields before its replacement arrives.
    this.nextRaidT = this.t + Math.max(12, 38 - this.sys.danger * 4);
    return fitted;
  }
  // a group of warships of one power (a border war's attackers)
  /**
   * Spawns a coordinated group of ships flying in formation.
   * @param kind AI behavior ('patrol', 'raid', 'trade').
   * @param factionId Faction identifier.
   * @param pool Available hull ID options.
   * @param initial True if spawning initial population.
   * @returns Lead ship entity, or null.
   */
  spawnGroup(
    kind: string,
    factionId: string,
    pool: number[],
    initial?: boolean,
  ): Entity | null | undefined {
    const hull = pick(pool.filter((height) => this.A.ships[height]));
    if (!hull) return;
    const angle = random2(-Math.PI, Math.PI),
      count = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
    let hulls = [hull];
    for (let index = 1; index < count; index++)
      hulls.push(
        pick(
          pool.filter(
            (height) =>
              this.A.ships[height] &&
              (this.A.ships[height].cost || 0) <= (this.A.ships[hull].cost || 1e9),
          ),
        ) || hull,
      );
    if (kind === 'raid' || kind === 'patrol') hulls = this.fitAmbientRaid(hulls, pool);
    let lead = null;
    for (const [index, groupHull] of hulls.entries()) {
      const positionX = initial ? random2(-1800, 1800) : Math.sin(angle) * 2600,
        positionY = initial ? random2(-1800, 1800) : -Math.cos(angle) * 2600,
        wrap2 = wrap(angle + Math.PI);
      const entity = this.makeShip({
        hull: groupHull,
        faction: factionId,
        x: positionX + index * 70,
        y: positionY + index * 50,
        a: wrap2,
        vx: Math.sin(wrap2) * 120,
        vy: -Math.cos(wrap2) * 120,
        ai: index ? 'escort' : kind,
        owner: lead ? lead.id : null,
      });
      if (!initial) this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
      if (kind === 'patrol') entity.warFleet = true;
      entity.ambientGroup = lead?.id ?? entity.id;
      if (!lead) lead = entity;
    }
    return lead;
  }
  // a Feral Swarm cluster: a Thrip Darter brood-leader and its drones, hostile to everyone
  /**
   * Spawns a hostile Vashari alien drone swarm.
   * @param initial True if spawning initial population.
   * @returns Lead swarm entity, or null.
   */
  spawnSwarm(initial?: boolean): Entity | null {
    if ([...this.ships.values()].some((entity) => !entity.dead && entity.faction === 'swarm'))
      return null;
    const count = 4 + Math.floor(Math.random() * 4);
    const hulls = this.fitAmbientRaid(
      [765, ...Array.from({ length: count }, (_, index) => (index % 3 ? 718 : 765))],
      [718, 765],
    );
    return this.spawnIncursion(hulls, 'swarm', initial);
  }
  /** Spawns at most one Eclipse cell within the shared ambient threat allowance. */
  spawnEclipse(initial?: boolean): Entity | null {
    if ([...this.ships.values()].some((entity) => !entity.dead && entity.faction === 'eclipse'))
      return null;
    const hulls = this.fitAmbientRaid(
      [Math.random() < 0.35 ? 763 : 762, 762, 761, 761],
      [761, 762, 763],
    );
    return this.spawnIncursion(hulls, 'eclipse', initial);
  }
  /** Materializes an already budgeted incursion without bypassing its fitted hull list. */
  spawnIncursion(hulls: number[], faction: string, initial?: boolean): Entity | null {
    const angle = Math.random() * Math.PI * 2;
    const distance = initial ? 1800 : 2600;
    let lead: Entity | null = null;
    for (const [index, hull] of hulls.entries()) {
      const entity = this.makeShip({
        hull,
        faction,
        x: Math.cos(angle) * distance + index * 80,
        y: Math.sin(angle) * distance + index * 50,
        a: angle + Math.PI,
        ai: index ? 'escort' : 'raid',
        owner: lead?.id,
      });
      entity.ambientGroup = lead?.id ?? entity.id;
      if (!lead) lead = entity;
      else if (faction === 'swarm') entity.swarmling = true;
    }
    if (lead && !initial) this.events.push(['flash', Math.round(lead.x), Math.round(lead.y)]);
    return lead;
  }
  /**
   * Generates a unique sequential identifier for floating loot canisters.
   * @returns Next loot ID.
   */

  /** Generates the next sequential unique loot canister ID. */
  nextLootId(): number {
    return NEXT++;
  }
  /**
   * Spawns a named bounty mission target and its defensive escort wing.
   * @param mission Bounty mission specification.
   * @returns Spawned mission target entity.
   */
  spawnMissionTarget(mission: Mission): Entity | null {
    const hull = mission.hull,
      angle = random2(-Math.PI, Math.PI);
    const entity = this.makeShip({
      hull,
      faction: mission.faction,
      x: Math.sin(angle) * 1500,
      y: -Math.cos(angle) * 1500,
      a: wrap(angle + Math.PI),
      ai: 'raid',
      name: mission.targetName,
      mission: { id: mission.id, owner: mission.owner },
    });
    entity.life = 1e9;
    this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
    return entity;
  }

  // ------------------------------------------------------------------ AI
  /**
   * Computes steering heading and thrust inputs for an entity navigating to coordinates.
   * @param entity Ship entity to steer.
   * @param targetX Target X coordinate.
   * @param targetY Target Y coordinate.
   * @param arrive Whether to brake and bring velocity to zero at target.
   * @param targetVelocityX Target velocity X for formation matching.
   * @param targetVelocityY Target velocity Y for formation matching.
   * @param landing Keep landing cruise pointed toward its destination.
   * @returns Distance remaining to target coordinates.
   */
  steer(
    entity: Entity,
    targetX: number,
    targetY: number,
    arrive: boolean,
    targetVelocityX: number = 0,
    targetVelocityY: number = 0,
    landing: boolean = false,
  ): number {
    const computedShipStats = entity.st,
      deltaX = targetX - entity.x,
      deltaY = targetY - entity.y,
      distance = Math.hypot(deltaX, deltaY),
      space = Math.hypot(entity.vx, entity.vy);
    const want = Math.atan2(deltaX, -deltaY),
      diff = angDiff(want, entity.a);
    if (arrive) {
      // plan a speed that falls to zero at the target (allowing time to turn around), and steer to close the velocity error
      const flipTime = Math.PI / Math.max(0.3, computedShipStats.turn),
        unitX = distance > 1 ? deltaX / distance : 0,
        unitY = distance > 1 ? deltaY / distance : 0;
      const vAllow = Math.min(
        computedShipStats.maxSpeed * 0.95,
        Math.sqrt(
          2 * computedShipStats.accel * Math.max(0, distance - 10 - space * flipTime * 0.6),
        ) * 0.8,
      );
      const velocityErrorX = targetVelocityX + unitX * vAllow - entity.vx,
        velocityErrorY = targetVelocityY + unitY * vAllow - entity.vy,
        errorMagnitude = Math.hypot(velocityErrorX, velocityErrorY);
      // Match player landing policy: tiny longitudinal speed corrections must not
      // leave a cruising ship sideways. Keep actual lateral correction and the
      // existing turn-time/braking envelope; formation steering is unchanged.
      const lateral = (entity.vx * deltaY - entity.vy * deltaX) / (distance || 1);
      if (
        landing &&
        vAllow === computedShipStats.maxSpeed * 0.95 &&
        Math.abs(lateral) < 8 &&
        entity.vx * deltaX + entity.vy * deltaY >= 0
      ) {
        entity.inp = {
          turn: Math.abs(diff) < computedShipStats.turn * tickDuration ? 0 : Math.sign(diff),
          thrust: Math.abs(diff) < 0.15 && space < vAllow - 8 ? 1 : 0,
        };
        if (Math.abs(diff) < computedShipStats.turn * tickDuration) entity.a = want;
        return distance;
      }
      if (errorMagnitude < 8) {
        entity.inp = { turn: 0, thrust: 0 };
        return distance;
      }
      const atan = Math.atan2(velocityErrorX, -velocityErrorY),
        angDiff2 = angDiff(atan, entity.a);
      entity.inp = {
        turn: Math.abs(angDiff2) < computedShipStats.turn * tickDuration ? 0 : Math.sign(angDiff2),
        thrust: Math.abs(angDiff2) < 0.45 && errorMagnitude > 12 ? 1 : 0,
      };
      if (Math.abs(angDiff2) < computedShipStats.turn * tickDuration) entity.a = atan;
      return distance;
    }
    entity.inp = {
      turn: Math.abs(diff) < computedShipStats.turn * tickDuration ? 0 : Math.sign(diff),
      thrust: Math.abs(diff) < 0.7 ? 1 : 0,
    };
    if (Math.abs(diff) < computedShipStats.turn * tickDuration) entity.a = want;
    return distance;
  }
  /**
   * Scans nearby space for the closest valid hostile target entity.
   * @param entity Searching ship entity.
   * @param range Maximum search radius.
   * @returns Closest hostile entity, or null if none in range.
   */
  findTarget(entity: Entity, range: number = 1800): Entity | null {
    let best = null,
      range2 = range;
    for (const entity2 of this.ships.values()) {
      if (
        entity2 === entity ||
        entity2.state !== 'fly' ||
        !this.isHostile(entity, entity2) ||
        !this.canAcquire(entity, entity2)
      )
        continue;
      const distance =
        Math.hypot(entity2.x - entity.x, entity2.y - entity.y) *
        (entity2.hull === 813 && entity2.player ? 3 : 1); // the Wraith is noticed at a third of the range
      if (distance < range2) {
        range2 = distance;
        best = entity2;
      }
    }
    return best;
  }
  /**
   * Executes AI logic for an NPC ship: target selection, fleet commands, navigation, and retreat.
   * @param entity NPC ship entity to update.
   */
  ai(entity: Entity): void {
    if (entity.player) return;
    if (entity.storySinger) {
      entity.inp = {};
      entity.fireAt = null;
      entity.target = null;
      this.steer(entity, entity.home!.x, entity.home!.y, false);
      return;
    }
    if (this.game?.features?.nhal?.ai(this, entity)) return;
    if (this.game?.features?.indexFleet?.ai(this, entity)) return;
    if (this.game?.features?.index?.ai(this, entity)) return;
    entity.think -= tickDuration;
    const owner = entity.owner ? this.ships.get(entity.owner) : null;
    if (entity.ai === 'escort' && !owner)
      entity.ai = entity.fighterOf ? 'leave' : entity.tradeMate ? 'trade' : 'patrol'; // a convoy whose leader landed goes about its own trade
    if (entity.armor < entity.st.armor * 0.15 && !entity.player && !entity.noDisable) {
      // disabled: drifts; unclaimed wrecks are towed away after a while
      if (!entity.disabled) entity.disT = this.t;
      entity.inp = { thrust: 0, turn: 0 };
      entity.disabled = true;
      if (
        this.t - entity.disT! > 75 &&
        !entity.mission &&
        !entity.rescueOf &&
        !entity.boardedBy &&
        !this.pid(entity)
      )
        this.remove(entity, 'jump');
      return;
    }
    if (entity.think <= 0) {
      entity.think = 0.4 + Math.random() * 0.3;
      if (entity.recall) {
        entity.target = null;
      } else {
        if (
          entity.target &&
          (entity.target.dead ||
            entity.target.state !== 'fly' ||
            !(this.isHostile(entity, entity.target) || this.ordered(entity, entity.target)) ||
            !this.canAcquire(entity, entity.target))
        )
          entity.target = null;
        if (entity.rival && this.game.features.rivals.rivalThink && !entity.owner)
          this.game.features.rivals.rivalThink(entity, this); // 1.1
        if (entity.distractT! > this.t) {
          entity.target = null;
          if (entity.dest) {
            this.steer(entity, entity.dest.x, entity.dest.y, true);
            return;
          }
        } // raiders chasing jettisoned cargo
        if (entity.ai === 'escort' && owner) {
          const order2 = owner.order || 'gather'; // 1.1 fleet commands: gather, attack, hold, holdfire, loot
          if (entity.ordSeq !== owner.orderSeq) {
            entity.ordSeq = owner.orderSeq;
            entity.holdAt = { x: entity.x, y: entity.y };
            if (order2 === 'holdfire' || order2 === 'loot') entity.target = null;
          }
          const entity2 =
            owner.target &&
            !owner.target.dead &&
            (this.isHostile(entity, owner.target) ||
              (order2 === 'attack' && this.ordered(entity, owner.target)))
              ? owner.target
              : null;
          const attacker = [...this.root(owner).aggro]
            .map((identifier) => this.ships.get(identifier))
            .find((entity) => entity && !entity.dead);
          if (order2 === 'holdfire' || (order2 === 'loot' && !attacker)) entity.target = null;
          else if (order2 === 'attack') entity.target = entity2 || attacker || null;
          else if (order2 === 'hold') {
            const near = (entity3: Entity | null | undefined) =>
              entity3 &&
              Math.hypot(entity3.x - entity.holdAt!.x, entity3.y - entity.holdAt!.y) < 900
                ? entity3
                : null;
            entity.target = near(entity2) || near(attacker) || near(this.findTarget(entity, 600));
          } else
            entity.target =
              entity2 ||
              attacker ||
              (owner.player ? null : this.findTarget(entity, 900)) ||
              (owner.player ? this.findTarget(entity, 700) : null);
        } else if (entity.ai === 'patrol' || entity.ai === 'raid')
          entity.target =
            entity.target || this.findTarget(entity, entity.ai === 'raid' ? 2200 : 1500);
        else if (entity.ai === 'trade' && entity.aggro.size) entity.ai = 'flee';
        if (
          this.t - entity.born > entity.life &&
          (entity.ai === 'patrol' || entity.ai === 'raid') &&
          !entity.target
        )
          entity.ai = 'leave';
        if (
          entity.target &&
          (entity.ai === 'patrol' || entity.ai === 'raid') &&
          this.mayFlee(entity)
        ) {
          entity.ai = 'flee';
          entity.target = null;
          entity.fled = true;
          this.events.push(['flee', entity.id]);
        } // a beaten captain runs for the jump point
        if (entity.ai === 'flee') entity.target = null;
      } // (not recalled)
    }
    if (owner && this.root(owner).sharedCombat) {
      const root = this.root(owner);
      entity.target =
        !entity.recall &&
        !['hold', 'holdfire', 'loot'].includes(root.order!) &&
        this.game.combatAssist.valid(this, root, root.combatTarget)
          ? root.combatTarget
          : null;
      entity.fireAt = null;
    }
    // Also covers targets assigned directly by rivals, NPC escorts, hunts or stories,
    // and retained targets between AI think cycles.
    if (entity.target && !this.canAcquire(entity, entity.target)) {
      entity.target = null;
      entity.fireAt = null;
    }
    if (entity.target) {
      entity.catchup = null;
      return this.fight(entity, entity.target);
    }
    switch (entity.ai) {
      case 'trade': {
        if (!entity.dest)
          entity.dest =
            this.ports().length && Math.random() < 0.75
              ? pick(this.ports())
              : { x: random2(-3000, 3000), y: random2(-3000, 3000), out: true }; // traders fly to worlds they can land on
        const steer2 = this.steer(
          entity,
          entity.dest.x,
          entity.dest.y,
          !entity.dest.out,
          0,
          0,
          !entity.dest.out,
        );
        if (
          !entity.dest.out &&
          steer2 < Math.max(40, (entity.dest.r || 60) * 0.5) &&
          Math.hypot(entity.vx, entity.vy) < 45
        ) {
          // settled over the pad: land
          this.events.push(['land', entity.id]);
          if (entity.convoyOf) this.game.features.fronts.onConvoyLanded(entity);
          if (entity.rival && this.game.features.rivals.rivalDocked)
            this.game.features.rivals.rivalDocked(entity);
          this.game.hails?.landed(entity, this);
          this.remove(entity);
        }
        if (entity.dest.out && steer2 < 200) entity.ai = 'leave';
        break;
      }
      case 'guard': {
        // Dreadnoughts and invasion bosses hold station near their anchor point
        const height = entity.home || { x: 0, y: 0 },
          distanceSquared = Math.hypot(height.x - entity.x, height.y - entity.y);
        if (distanceSquared > 250) this.steer(entity, height.x, height.y, true);
        else {
          entity.inp = { turn: 1, thrust: Math.hypot(entity.vx, entity.vy) < 15 ? 1 : 0 };
        }
        break;
      }
      case 'patrol':
      case 'raid': {
        if (!entity.dest || Math.hypot(entity.dest.x - entity.x, entity.dest.y - entity.y) < 200)
          entity.dest =
            Math.random() < 0.5 && this.sys.stellars.length
              ? {
                  x: pick(this.sys.stellars).x + random2(-400, 400),
                  y: pick(this.sys.stellars).y + random2(-400, 400),
                }
              : { x: random2(-2000, 2000), y: random2(-2000, 2000) };
        this.steer(entity, entity.dest.x, entity.dest.y, false);
        entity.inp.thrust =
          entity.inp.thrust && Math.hypot(entity.vx, entity.vy) < entity.st.maxSpeed * 0.6 ? 1 : 0;
        break;
      }
      case 'escort': {
        if (!owner) break;
        if (entity.recall) {
          const steer3 = this.steer(entity, owner.x, owner.y, true, owner.vx, owner.vy);
          entity.catchup = owner.st;
          if (steer3 < Math.max(50, owner.st.size * 0.35)) this.dock(entity, owner);
          break;
        } // drones flying home
        const order3 = owner.order || 'gather';
        if (order3 === 'hold' && entity.holdAt) {
          const steer4 = this.steer(entity, entity.holdAt!.x, entity.holdAt!.y, true);
          if (steer4 < 60) entity.inp = { turn: 0, thrust: 0 };
          break;
        }
        if (order3 === 'loot') {
          // sweep up nearby loot for the fleet's owner
          let best = null,
            body = 1800;
          for (const floatingLoot of this.loot) {
            if (floatingLoot.taken || floatingLoot.it.indexClaim || floatingLoot.it.indexTakenBy)
              continue;
            const distanceSquared = Math.hypot(
              floatingLoot.x - entity.x,
              floatingLoot.y - entity.y,
            );
            if (distanceSquared < body) {
              body = distanceSquared;
              best = floatingLoot;
            }
          }
          const playerReference = this.root(owner).player;
          if (best && playerReference) {
            this.steer(entity, best.x, best.y, true);
            if (
              body < Math.max(40, entity.st.size * 0.5) &&
              this.game.onLoot(playerReference, best.it) !== false
            ) {
              best.taken = true;
              this.events.push(['pickup', best.id]);
            }
            break;
          }
        }
        if (entity.slot == null) {
          // each escort keeps its own formation slot
          const used = new Set();
          for (const entity3 of this.ships.values())
            if (entity3 !== entity && entity3.owner === entity.owner && entity3.slot != null)
              used.add(entity3.slot);
          let index = 0;
          while (used.has(index)) index++;
          entity.slot = index;
        }
        const [lateralOffset, back] = SLOTS[entity.slot % SLOTS.length],
          ring = Math.floor(entity.slot / SLOTS.length),
          size2 = Math.max(60, owner.st.size * 0.5);
        const length2 = lateralOffset * (55 + size2 * 0.4),
          secondValue = back * (60 + size2 * 0.45) + ring * 70;
        const offsetX = owner.x + Math.cos(owner.a) * length2 - Math.sin(owner.a) * secondValue,
          offsetY = owner.y + Math.sin(owner.a) * length2 + Math.cos(owner.a) * secondValue;
        const steer5 = this.steer(
          entity,
          offsetX,
          offsetY,
          distance0(entity, offsetX, offsetY) > 250 ? false : true,
          owner.vx,
          owner.vy,
        );
        entity.catchup = steer5 > 200 ? owner.st : null; // escorts can always keep up with the ship they guard
        if (steer5 < 120) {
          const space = Math.hypot(owner.vx, owner.vy);
          if (space > 30) {
            const angDiff2 = angDiff(owner.a, entity.a);
            entity.inp = {
              turn: Math.sign(angDiff2),
              thrust: Math.hypot(entity.vx, entity.vy) < space ? 1 : 0,
            };
          }
        }
        if (
          entity.fighterOf &&
          owner &&
          !owner.player &&
          !owner.target &&
          steer5 < 60 &&
          this.t - entity.born > 20
        ) {
          this.dock(entity, owner);
        } // a captain's drones stay out until recalled
        break;
      }
      case 'flee':
      case 'leave': {
        const angle = Math.atan2(entity.x, -entity.y) || 0.01;
        this.steer(
          entity,
          entity.x + Math.sin(angle) * 2000,
          entity.y - Math.cos(angle) * 2000,
          false,
        );
        if (Math.hypot(entity.x, entity.y) > 2800) {
          if (entity.rival) {
            entity.ai = entity.rivalAi || 'patrol';
            entity.dest = null;
            entity.aggro.clear();
          } else this.remove(entity, 'jump');
        }
        break;
      }
    }
  }
  // 2.4 personalities: cautious captains run early, steady ones when badly hurt, reckless ones never; named and story ships fight to the end
  /**
   * Checks whether ship's personality and damage state warrant tactical retreat.
   * @param entity Ship entity to test.
   * @returns True if ship should disengage and flee.
   */
  mayFlee(entity: Entity): boolean {
    const retreatThreshold = { cautious: 0.45, steady: 0.27, reckless: 0 }[entity.pers!] || 0;
    if (
      !retreatThreshold ||
      entity.owner ||
      entity.mission ||
      entity.rival ||
      entity.boss ||
      entity.bossMinion ||
      entity.arcOf ||
      entity.storyKill ||
      entity.fighterOf ||
      entity.noDisable ||
      this.sys.arena
    )
      return false;
    return (
      entity.armor < entity.st.armor * retreatThreshold && entity.shield < entity.st.shield * 0.15
    );
  }
  // a ship under attack calls nearby ships of its own side to help
  /**
   * Broadcasts a distress call to nearby allied NPC ships when taking fire.
   * @param entity Attacked ship entity.
   * @param attacker Enemy ship inflicting damage.
   */
  callHelp(entity: Entity, attacker: Entity): void {
    if (entity.miningEncounter || attacker.miningEncounter) return;
    if (entity.player || this.sys.arena || (entity.helpT || -99) > this.t - 5) return;
    entity.helpT = this.t;
    for (const entity2 of this.ships.values()) {
      if (
        entity2 === entity ||
        entity2.player ||
        entity2.owner ||
        entity2.faction !== entity.faction ||
        entity2.target ||
        entity2.dead ||
        entity2.disabled ||
        (entity2.ai !== 'patrol' && entity2.ai !== 'raid' && entity2.ai !== 'guard')
      )
        continue;
      if (
        Math.hypot(entity2.x - entity.x, entity2.y - entity.y) > 1800 ||
        this.spared(entity2, attacker)
      )
        continue;
      entity2.aggro.add(attacker.id);
      entity2.target = attacker;
    }
  }
  /**
   * Docks a returned fighter drone into its carrier bay and replenishes bay ammo.
   * @param entity Drone fighter entity returning.
   * @param owner Carrier parent entity.
   */
  dock(entity: Entity, owner: Entity): void {
    const weaponMount = owner.guns.find(
      (weaponMount) => weaponMount.p.bay && this.A.weapons[weaponMount.w].launch === entity.hull,
    );
    if (weaponMount && weaponMount.ammo !== Infinity) weaponMount.ammo++;
    this.remove(entity);
  }
  /**
   * Computes combat maneuvering, broadside circling, and attack vectoring toward target.
   * @param entity Attacking ship entity.
   * @param entity2 Target enemy ship entity.
   */
  fight(entity: Entity, entity2: Entity): void {
    const best = entity.guns
      .filter((weaponMount) => !weaponMount.p.pd && !weaponMount.p.bay && weaponMount.ammo > 0)
      .reduce((message, weaponMount) => Math.max(message, weaponMount.p.range), 300);
    const deltaX = entity2.x - entity.x,
      deltaY = entity2.y - entity.y,
      distance = Math.hypot(deltaX, deltaY);
    const lead = Math.min(1.2, distance / 600);
    const localX = entity2.x + (entity2.vx - entity.vx) * lead,
      localY = entity2.y + (entity2.vy - entity.vy) * lead;
    if (
      entity.st.size >= 110 &&
      entity.st.turrets >= 2 &&
      distance < best * 1.1 &&
      distance > Math.max(140, entity.st.size)
    ) {
      // capitals with turrets circle and fire broadsides instead of ramming
      const side = entity.id % 2 ? 1 : -1,
        targetAngle =
          Math.atan2(deltaX, -deltaY) +
          side * (Math.PI / 2 - (distance > best * 0.8 ? 0.35 : distance < best * 0.5 ? -0.35 : 0));
      this.steer(
        entity,
        entity.x + Math.sin(targetAngle) * 300,
        entity.y - Math.cos(targetAngle) * 300,
        false,
      );
      entity.inp.thrust =
        Math.hypot(entity.vx, entity.vy) < entity.st.maxSpeed * 0.6 ? entity.inp.thrust : 0;
    } else if (distance > best * 0.75) this.steer(entity, localX, localY, false);
    else if (distance < Math.max(120, entity.st.size * 0.9)) {
      const away = Math.atan2(-deltaX, deltaY) + 0.8;
      this.steer(entity, entity.x + Math.sin(away) * 300, entity.y - Math.cos(away) * 300, false);
    } else {
      this.steer(entity, localX, localY, false);
      entity.inp.thrust =
        Math.hypot(entity.vx, entity.vy) < entity.st.maxSpeed * 0.5 ? entity.inp.thrust : 0;
    }
    entity.fireAt = entity2;
  }

  // ------------------------------------------------------------------ combat
  /**
   * Discharges a weapon mount, creating ballistic projectiles, guided missiles, or drone fighters.
   * @param entity Firing ship entity.
   * @param weaponMount Weapon mount being discharged.
   * @param entity2 Target entity, if guided.
   * @param angle Fire orientation heading in radians.
   */
  fire(entity: Entity, weaponMount: WeaponMount, entity2: Entity | null, angle: number): void {
    const weapon = weaponMount.p,
      weaponAsset = this.A.weapons[weaponMount.w];
    const captain = this.root(entity).player?.s.name;
    const provenance = {
      captain: captain ? this.game.db.key(captain) : null,
      source: entity.id,
      mount: entity.guns.indexOf(weaponMount),
      weapon: weaponMount.w,
      cadence: weapon.reload / Math.max(1, weaponMount.n),
      contactId: `beam:${this.game.db.world.mining?.clock}:${entity.id}:${entity.guns.indexOf(weaponMount)}:${this.t}`,
    };
    if (weaponMount.ammo <= 0) return;
    if (weapon.bay) {
      const launch = weaponAsset.launch;
      if (!launch || !this.A.ships[launch]) return;
      if (
        [...this.ships.values()].filter((entity3) => entity3.fighterOf === entity.id).length >=
        Math.min(6, weaponMount.n * 4)
      )
        return;
      const entity3 = this.makeShip({
        hull: launch,
        faction: entity.faction,
        x: entity.x,
        y: entity.y,
        a: entity.a,
        vx: entity.vx,
        vy: entity.vy,
        ai: 'escort',
        owner: entity.id,
      });
      entity3.fighterOf = entity.id;
      entity3.life = 1e9;
      weaponMount.ammo--;
      weaponMount.cd = 2.5;
      this.sound(entity, weaponMount);
      return;
    }
    if (weapon.homing || weapon.rocket) weaponMount.ammo--;
    weaponMount.cd = weapon.reload / Math.max(1, weaponMount.n);
    const angle2 = angle + (Math.random() - 0.5) * weapon.inacc;
    const damageMultiplier = entity.st.damageMul || 1;
    if (weapon.beam) {
      const range2 = weapon.range;
      let hitResult = this.ray(entity, angle2, range2);
      const rayRock2 = this.rayRock(entity, angle2, hitResult ? hitResult.d : range2);
      if (rayRock2) {
        this.beams.push({
          id: entity.id,
          a: angle2,
          len: rayRock2.d,
          w: weaponMount.w,
          until: this.t + (weapon.continuous ? tickDuration * 1.5 : 0.12),
        });
        const damage =
          (weapon.dmgA + weapon.dmgS * 0.3) *
          (weapon.continuous
            ? physicsConstants.beamDps * tickDuration * Math.max(1, weaponMount.n)
            : 1);
        if (weaponAsset.mining)
          this.game.features.mining.contact(this, rayRock2.k, {
            source: provenance,
            damage,
            x: rayRock2.x,
            y: rayRock2.y,
            projectile: false,
          });
        else this.hitRock(rayRock2.k, damage, false, provenance.captain);
        if (!weapon.continuous || this.t - weaponMount.sndT > 0.6) this.sound(entity, weaponMount);
        if (weapon.continuous) weaponMount.cd = 0;
        return;
      }
      const duration = weapon.continuous ? tickDuration * 1.5 : 0.12;
      this.beams.push({
        id: entity.id,
        a: angle2,
        len: hitResult ? hitResult.d : range2,
        w: weaponMount.w,
        until: this.t + duration,
      });
      if (hitResult) {
        const entryKey = weapon.continuous
          ? physicsConstants.beamDps * tickDuration * Math.max(1, weaponMount.n)
          : 1;
        const beamMultiplier = this.m ? this.m.beam : 1,
          damage2 = this.damage(
            hitResult.s,
            weapon.dmgA * entryKey * damageMultiplier * beamMultiplier,
            weapon.dmgS * entryKey * damageMultiplier * beamMultiplier,
            entity,
            weapon.ion,
          );
        if (weapon.continuous) {
          hitResult.s.beamAcc =
            (hitResult.s.beamAcc || 0) + (damage2 as [number, number, number])[0];
          if (this.t - (hitResult.s.beamEvT || 0) > 0.3) {
            hitResult.s.beamEvT = this.t;
            this.hitEv(hitResult.x, hitResult.y, weaponMount.w, hitResult.s, [
              hitResult.s.beamAcc!,
              (damage2 as [number, number, number])[1],
              (damage2 as [number, number, number])[2],
            ]);
            hitResult.s.beamAcc = 0;
          }
        } else this.hitEv(hitResult.x, hitResult.y, weaponMount.w, hitResult.s, damage2);
      }
      if (!weapon.continuous || this.t - weaponMount.sndT > 0.6) this.sound(entity, weaponMount);
      if (weapon.continuous) weaponMount.cd = 0;
      return;
    }
    const speed2 = weapon.speed;
    const offsetX = entity.x + Math.sin(entity.a) * entity.st.size * 0.35,
      offsetY = entity.y - Math.cos(entity.a) * entity.st.size * 0.35;
    const shotId = NEXT++;
    this.shots.push({
      id: shotId,
      miningEncounter: entity.miningEncounter,
      mining: weaponAsset.mining
        ? Object.freeze({ ...provenance, contactId: `shot:${this.game.features.mining.shotId()}` })
        : null,
      captain: provenance.captain,
      x: offsetX,
      y: offsetY,
      vx: entity.vx * (weapon.homing ? 0.3 : 1) + Math.sin(angle2) * speed2,
      vy: entity.vy * (weapon.homing ? 0.3 : 1) - Math.cos(angle2) * speed2,
      life: weapon.life,
      w: weaponMount.w,
      p: weapon,
      owner: entity.id,
      target: weapon.homing ? entity2 : null,
      dmgA: weapon.dmgA * damageMultiplier,
      dmgS: weapon.dmgS * damageMultiplier,
      pd: 0,
    });
    this.sound(entity, weaponMount);
  }
  /**
   * Emits a weapon discharge sound effect event, rate-limited to avoid audio flood.
   * @param entity Firing ship entity.
   * @param weaponMount Weapon mount producing sound.
   */
  sound(entity: Entity, weaponMount: WeaponMount): void {
    if (this.t - weaponMount.sndT > 0.12) {
      weaponMount.sndT = this.t;
      this.events.push(['snd', weaponMount.snd, Math.round(entity.x), Math.round(entity.y)]);
    }
  }
  /**
   * Performs raycast collision check for instant-hit continuous beam lasers against ships.
   * @param entity Firing ship entity.
   * @param angle2 Beam trajectory heading in radians.
   * @param length2 Maximum beam range.
   * @returns Hit ship and intersection point, or null.
   */
  ray(
    entity: Entity,
    angle: number,
    length: number,
  ): { s: Entity; d: number; x: number; y: number } | null {
    const deltaX = Math.sin(angle),
      deltaY = -Math.cos(angle);
    let best = null;
    for (const entity2 of this.ships.values()) {
      if (entity2 === entity || entity2.state !== 'fly' || !this.canHit(entity, entity2)) continue;
      const relativeX = entity2.x - entity.x,
        relativeY = entity2.y - entity.y,
        along = relativeX * deltaX + relativeY * deltaY;
      if (along < 0 || along > length) continue;
      const perpendicular = Math.abs(relativeX * deltaY - relativeY * deltaX),
        radius = Math.max(10, entity2.st.size * 0.32);
      if (perpendicular < radius && (!best || along < best.d))
        best = { s: entity2, d: along, x: entity.x + deltaX * along, y: entity.y + deltaY * along };
    }
    return best;
  }
  /**
   * Performs raycast collision check for mining laser beams against asteroid rocks.
   * @param entity Firing ship entity.
   * @param angle2 Beam trajectory heading in radians.
   * @param length2 Maximum beam range.
   * @returns Hit rock and distance, or null.
   */
  rayRock(
    entity: Entity,
    angle: number,
    length: number,
  ): { k: Rock; d: number; x: number; y: number } | null {
    const deltaX = Math.sin(angle),
      deltaY = -Math.cos(angle);
    let best = null;
    for (const rock of this.rocks) {
      if (rock.down) continue;
      const relativeX = rock.x - entity.x,
        relativeY = rock.y - entity.y,
        along = relativeX * deltaX + relativeY * deltaY;
      if (along < -rock.r || along > length + rock.r) continue;
      const perpendicular = Math.abs(relativeX * deltaY - relativeY * deltaX);
      if (perpendicular < rock.r) {
        const distance = Math.max(
          0,
          along - Math.sqrt(rock.r * rock.r - perpendicular * perpendicular),
        );
        if (distance <= length && (!best || distance < best.d))
          best = {
            k: rock,
            d: distance,
            x: entity.x + deltaX * distance,
            y: entity.y + deltaY * distance,
          };
      }
    }
    return best;
  }
  // a captain's fighter bays work as a toggle on F: tap to launch every drone, tap again to call them all home
  /**
   * Toggles carrier fighter bays: launches all bay drones, or recalls active drones to dock.
   * @param entity Carrier ship entity.
   */
  toggleDrones(entity: Entity): void {
    const entitys = [...this.ships.values()].filter(
      (entity2) => entity2.fighterOf === entity.id && !entity2.dead,
    );
    const announce = (message: string) => {
      if (entity.player && entity.player.s && this.game.toast)
        this.game.toast(entity.player.s, message);
    };
    if (entitys.some((entity) => !entity.recall)) {
      for (const entity of entitys) {
        entity.recall = true;
        entity.target = null;
      }
      announce(`Drones recalled (${entitys.length}). Tap F to launch them again.`);
      return;
    }
    let count = 0;
    for (const weaponMount of entity.guns) {
      if (!weaponMount.p.bay) continue;
      const weaponAsset = this.A.weapons[weaponMount.w],
        launch = weaponAsset && weaponAsset.launch;
      if (!launch || !this.A.ships[launch]) continue;
      const capacity = Math.min(6, weaponMount.n * 4);
      while (
        weaponMount.ammo > 0 &&
        [...this.ships.values()].filter((entity3) => entity3.fighterOf === entity.id).length <
          capacity
      ) {
        const firstValue = entity.a + (count % 2 ? 1 : -1) * (0.6 + 0.25 * count),
          entity3 = this.makeShip({
            hull: launch,
            faction: entity.faction,
            x: entity.x + Math.sin(firstValue) * 30,
            y: entity.y - Math.cos(firstValue) * 30,
            a: firstValue,
            vx: entity.vx + Math.sin(firstValue) * 60,
            vy: entity.vy - Math.cos(firstValue) * 60,
            ai: 'escort',
            owner: entity.id,
          });
        entity3.fighterOf = entity.id;
        entity3.life = 1e9;
        if (weaponMount.ammo !== Infinity) weaponMount.ammo--;
        count++;
      }
      if (count) this.sound(entity, weaponMount);
    }
    announce(
      count ? `Drones launched (${count}). Tap F to recall them.` : 'No drones left in the bays.',
    );
  }
  /**
   * Evaluates weapon mount cooldowns, target alignment, point defense, and triggers firing.
   * @param entity Ship entity updating weapons.
   */
  weapons(entity: Entity): void {
    const input = entity.inp || {},
      automated = entity.autoCombat || (entity.owner && this.root(entity).sharedCombat),
      entity2 = entity.autoCombat
        ? entity.combatTarget
        : entity.player
          ? entity.target && this.ships.get(entity.target.id)
            ? entity.target
            : null
          : entity.fireAt;
    if (entity2 && !entity.player && !this.canAcquire(entity, entity2)) {
      entity.fireAt = null;
      return;
    }
    if (entity.player && !automated) {
      const factionId = input.fire2 ? 1 : 0;
      if (factionId && !entity._f2 && entity.guns.some((weaponMount) => weaponMount.p.bay))
        this.toggleDrones(entity);
      entity._f2 = factionId;
    }
    for (const weaponMount of entity.guns) {
      weaponMount.cd -= tickDuration;
      if (weaponMount.cd > 0 || weaponMount.ammo <= 0) continue;
      const weapon = weaponMount.p;
      if (weapon.pd) {
        // point defense: shoot down missiles and fighters
        let best = null,
          range2 = weapon.range;
        for (const shot of this.shots) {
          if (!shot.target || !shot.p.homing) continue;
          const entity3 = this.ships.get(shot.owner);
          if (!entity3 || !this.isHostile(entity, entity3)) continue;
          const distance = Math.hypot(shot.x - entity.x, shot.y - entity.y);
          if (distance < range2) {
            range2 = distance;
            best = shot;
          }
        }
        if (best) {
          if (Math.random() < 0.35) {
            best.life = 0;
            this.events.push(['hit', Math.round(best.x), Math.round(best.y), weaponMount.w]);
          }
          this.fire(entity, weaponMount, null, angleTo(entity, best.x, best.y));
          continue;
        }
        const entity4 = [...this.ships.values()].find(
          (entity5) =>
            entity5.fighterOf &&
            this.isHostile(entity, entity5) &&
            this.canAcquire(entity, entity5) &&
            Math.hypot(entity5.x - entity.x, entity5.y - entity.y) < weapon.range,
        );
        if (entity4) this.fire(entity, weaponMount, entity4, angleTo(entity, entity4.x, entity4.y));
        continue;
      }
      if (
        automated &&
        (!entity2 || !this.game.combatAssist.valid(this, this.root(entity), entity2))
      )
        continue;
      if (weapon.bay && entity.player) continue; // bays launch and recall on a tap of F (toggleDrones)
      const wantFire = entity.autoCombat
        ? !!entity2
        : entity.player
          ? weaponMount.sec
            ? input.fire2
            : input.fire1
          : !!entity2;
      if (!wantFire) continue;
      // Manual mining uses the existing aim/heading, independently of combat selection.
      // Other weapons and delegated combat keep their targeting/leading behavior.
      const entity5 =
        entity.player && !automated && this.A.weapons[weaponMount.w]?.mining
          ? null
          : entity2 && !entity2.dead
            ? entity2
            : null;
      if (weapon.bay || weapon.homing) {
        if (entity5 || !weapon.homing) this.fire(entity, weaponMount, entity5, entity.a);
        continue;
      }
      if (entity5) {
        const distance = Math.hypot(entity5.x - entity.x, entity5.y - entity.y);
        if ((!entity.player || automated) && distance > weapon.range * 1.05) continue;
        const travelTime = weapon.beam ? 0 : distance / weapon.speed;
        const angleTo2 = angleTo(
          entity,
          entity5.x + (entity5.vx - entity.vx) * travelTime,
          entity5.y + (entity5.vy - entity.vy) * travelTime,
        );
        if (weapon.turret) {
          if (distance < weapon.range * 1.1 || (entity.player && !automated))
            this.fire(entity, weaponMount, entity5, angleTo2);
          continue;
        }
        if (weapon.arc && Math.abs(angDiff(angleTo2, entity.a)) < weapon.arc) {
          this.fire(entity, weaponMount, entity5, angleTo2);
          continue;
        }
        if ((!entity.player || automated) && Math.abs(angDiff(angleTo2, entity.a)) > 0.18) continue;
      } else if (!entity.player) continue;
      this.fire(entity, weaponMount, entity5, entity.a);
    }
  }
  /**
   * Applies armor and shield damage to a ship, resolving role multipliers and kill thresholds.
   * @param entity Ship entity receiving damage.
   * @param angleDelta Base armor / hull damage.
   * @param shieldDamage Base shield damage.
   * @param entity2 Attacker entity source.
   * @param unusedIon Whether weapon inflicts ion damage.
   * @returns Tuple [damageDealt, hitShieldsFlag, shooterRootId].
   */
  damage(
    entity: Entity,
    angleDelta: number,
    shieldDamage: number,
    entity2?: Entity | null,
    _unusedIon?: number | boolean,
  ): [number, number, number] | void {
    const fleetScale = this.game.features.indexFleet?.damageScale(this, entity) ?? 1;
    angleDelta *= fleetScale;
    shieldDamage *= fleetScale;
    if (entity.industrialRoot) return [0, 0, entity2?.id || 0]; // Utility collectors cannot tank combat or grant rewards.
    if (
      entity2 &&
      (entity2.miningEncounter || entity.miningEncounter) &&
      this.game.features.pressure.allow(this, entity2, entity) === false
    )
      return;
    if (entity.dead) return;
    const srcRoot = entity2 ? this.root(entity2) : null;
    if (entity2 && entity2.role && entity.role) {
      const roleMult2 = roleMult(entity2.role, entity.role);
      angleDelta *= roleMult2;
      shieldDamage *= roleMult2;
    } // the class triangle
    if (entity2 && this.game.features.specialists.specMult) {
      const specMult2 = this.game.features.specialists.specMult(
        this.root(entity2),
        entity2,
        entity,
      );
      angleDelta *= specMult2;
      shieldDamage *= specMult2;
    } // specialty ships
    const shield2 = entity.shield,
      armor2 = entity.armor,
      hadShield = entity.shield > 0;
    if (entity.shield > 0) {
      entity.shield -= shieldDamage;
      if (entity.shield < 0) {
        entity.armor += entity.shield * (angleDelta / Math.max(1, shieldDamage)) * 0.5;
        entity.shield = 0;
      }
    } else entity.armor -= angleDelta;
    entity.hitT = this.t;
    if (entity2) entity.lastHitBy = entity2.id;
    const done = Math.max(0, shield2 - entity.shield) + Math.max(0, armor2 - entity.armor);
    if (done > 0 && srcRoot?.player && entity.mission?.owner === srcRoot.player.id) {
      const captain = srcRoot.player.s?.data;
      if (
        captain?.missions.some(
          (mission) =>
            mission.type === 'bounty' && !mission.done && mission.id === entity.mission!.id,
        )
      )
        (entity.bountyContributors ||= new Set()).add(srcRoot.player.id);
    }
    if (done > 0 && entity2) this.game?.features?.nhal?.damaged(this, entity, entity2, done);
    if (done > 0 && entity2) this.game?.features?.indexFleet?.damaged(this, entity, entity2, done);
    if (done > 0 && entity2) this.game?.features?.index?.damaged(this, entity, entity2);
    // Incidental NPC fire does not make an overlooked captain's wing initiate
    // retaliation and thereby attract the entire faction. Deliberate outgoing
    // damage still creates normal visit-local hostility and reputation costs.
    if (
      done > 0 &&
      srcRoot &&
      srcRoot !== this.root(entity) &&
      !entity.indexWorksite &&
      !srcRoot.indexWorksite &&
      !this.newcomerTruce(entity2!, entity)
    ) {
      const victim = this.root(entity),
        first = !victim.aggro.has(srcRoot.id);
      const deliberate =
        (srcRoot.target && this.root(srcRoot.target) === victim) ||
        (srcRoot.combatTarget && this.root(srcRoot.combatTarget) === victim);
      let retaliate = true;
      if (
        srcRoot.player &&
        !victim.player &&
        first &&
        !deliberate &&
        !FACTIONS[victim.faction]?.pirate &&
        !FACTIONS[victim.faction]?.alwaysHostile
      ) {
        const hits = (victim.incidentalHits ||= new Map());
        let recent = hits.get(srcRoot.id);
        if (!recent || this.t - recent.last > 10) recent = { count: 0, last: -Infinity };
        // Count separated volleys, not every pellet in one accidental broadside.
        if (this.t - recent.last >= 1.5) {
          recent.count++;
          recent.last = this.t;
        }
        hits.set(srcRoot.id, recent);
        retaliate = recent.count >= 3;
      }
      if (retaliate) {
        if (srcRoot.player?.s && !victim.player && !this.sys.arena && first && deliberate)
          this.beginVisit(srcRoot.player.s).factions.add(victim.faction);
        victim.aggro.add(srcRoot.id);
        if (!entity.player && !entity.target && entity.ai !== 'flee') entity.target = srcRoot;
        if (first && !entity.owner && (!srcRoot.player || deliberate))
          this.callHelp(entity, srcRoot);
      }
    }
    if (
      srcRoot &&
      srcRoot.player &&
      !entity.player &&
      !entity.indexWorksite &&
      entity.faction !== 'nhal'
    )
      this.game.onHit(srcRoot.player, entity, this);
    if (entity.boss) this.game.features.fronts.onBossDamage(entity, srcRoot, done);
    if (
      srcRoot &&
      srcRoot.player &&
      this.root(entity).player &&
      !this.sys.arena &&
      this.game.features.coop.duelHit &&
      this.game.features.coop.duelHit(srcRoot, entity, this)
    )
      return [done, hadShield ? 1 : 0, srcRoot.id]; // a duel stops at disabled
    if (
      entity.armor <= 0 &&
      entity.player &&
      this.game.features.coop.rescueHold &&
      this.game.features.coop.rescueHold(entity, srcRoot, this)
    )
      return [done, hadShield ? 1 : 0, srcRoot ? srcRoot.id : 0]; // an Armada can rescue a downed captain
    if (entity.armor <= 0) this.kill(entity, srcRoot);
    return [done, hadShield ? 1 : 0, srcRoot ? srcRoot.id : 0];
  }
  // hit event: x, y, weapon, target id, damage dealt, shooter (root) id, 1 if it hit shields
  /**
   * Emits a hit event packet for client particle effects and damage numbers.
   * @param positionX Hit position X.
   * @param positionY Hit position Y.
   * @param width Weapon ID that scored the hit.
   * @param entity Target ship entity.
   * @param radius Damage outcome tuple.
   */
  hitEv(
    positionX: number,
    positionY: number,
    width: number,
    entity: Entity,
    radius: [number, number, number] | void,
  ): void {
    this.events.push([
      'hit',
      Math.round(positionX),
      Math.round(positionY),
      width,
      entity.id,
      Math.round((radius as [number, number, number])[0]),
      (radius as [number, number, number])[2],
      (radius as [number, number, number])[1],
    ]);
  }
  /**
   * Destroys a ship entity, triggering explosions, bounty rewards, death handling, and salvage drop.
   * @param entity Ship entity destroyed.
   * @param entity2 Killer root entity, if any.
   */
  kill(entity: Entity, entity2?: Entity | null): void {
    if (entity.dead) return;
    this.events.push(['boom', Math.round(entity.x), Math.round(entity.y), entity.st.size]);
    this.remove(entity);
    for (const entity3 of this.ships.values())
      if (entity3.fighterOf === entity.id) entity3.ai = 'leave';
    if (entity.player) {
      this.game.onPlayerDeath(entity.player, this, entity2);
      return;
    }
    if (this.game?.features?.nhal?.killed(this, entity, entity2)) {
      if (entity2?.player)
        this.game.onKill(
          entity2.player,
          entity,
          this,
          (entity.lastHitBy && entity.lastHitBy !== entity2.id) as boolean | undefined,
        );
      return;
    }
    if (this.game?.features?.indexFleet?.killed(this, entity, entity2)) return;
    if (entity.indexWorksite) return; // Worksite machines never grant generic bounty or drone loot.
    if (entity.industrialRoot) return; // No farmable salvage, bounty or replacement ammo.
    if (entity.boss) this.game.features.fronts.onBossKilled(entity, this);
    if (entity.convoyOf) this.game.features.fronts.onConvoyLost(entity);
    if (entity.wingUid && this.game.features.docks.onWingLost)
      this.game.features.docks.onWingLost(entity); // 2.1
    if (entity.wave) this.game.features.frontier.onWaveKill(entity);
    if (this.game.features.hostile.maybeChest)
      this.game.features.hostile.maybeChest(this, entity, entity2);
    if (entity2 && entity2.player)
      this.game.onKill(
        entity2.player,
        entity,
        this,
        (entity.lastHitBy && entity.lastHitBy !== entity2.id) as boolean | undefined,
      );
    if (entity.mission && entity.bountyContributors?.has(entity.mission.owner!)) {
      const owner = [...this.game.sessions.values()].find(
        (session) => session.id === entity.mission!.owner,
      );
      const mission = owner?.data?.missions.find(
        (mission) =>
          mission.type === 'bounty' && mission.id === entity.mission!.id && !mission.done,
      );
      if (owner && mission) {
        mission.done = true;
        this.game.toast(
          owner,
          `Bounty complete: ${mission.targetName} is dead. Land anywhere to collect your pay.`,
        );
        this.game.db.touch();
        this.game.you(owner);
      }
    }
    if (!entity.fighterOf && Math.random() < (entity2 && entity2.hull === 810 ? 0.82 : 0.55))
      this.dropLoot(entity);
  }
  /**
   * Spawns floating credit canisters and material salvage crates at destroyed ship's position.
   * @param entity Destroyed ship entity.
   */
  dropLoot(entity: Entity): void {
    const text = entity.strength || 10,
      items = [];
    items.push({ credits: Math.round(text * random2(15, 40)) });
    if (Math.random() < 0.35)
      items.push({
        mat: pick(MATERIALS),
        grade: Math.min(4, Math.floor(Math.random() * (1 + text / 300))),
      });
    for (const item of items)
      this.loot.push({
        id: NEXT++,
        x: entity.x + random2(-30, 30),
        y: entity.y + random2(-30, 30),
        vx: entity.vx * 0.3 + random2(-20, 20),
        vy: entity.vy * 0.3 + random2(-20, 20),
        it: item,
        t: this.t,
        kind: item.mat ? 1 : 0,
      });
  }

  // ------------------------------------------------------------------ tick
  /**
   * Advances the simulation by one discrete timestep: moves entities, checks collisions, updates weapons and loot.
   */
  tick(): void {
    this.t += tickDuration;
    if (!this.m || ++this.mT % 30 === 0) {
      this.m = this.game.features.fronts.mods ? this.game.features.fronts.mods(this.id) : null;
      this.mT = this.mT || 1;
    }
    const starSystem = this.sys;
    if (this.players > 0 && !this.sys.arena) {
      this.spawnT -= tickDuration;
      const livingState =
          this.game.features.living.stateOf && this.game.features.living.stateOf(this.id),
        time = livingState ? STATES[livingState.kind].traders || 1 : 1;
      const want = Math.min(
        28,
        (6 + this.ports().length * 2 + starSystem.stellars.length * 0.5 + starSystem.danger * 1.5) *
          time,
      ); // more traffic everywhere; 2.4: booms and festivals bring more
      const length2 = [...this.ships.values()].filter(
        (entity) => !entity.player && !entity.owner,
      ).length;
      if (this.spawnT <= 0) {
        this.spawnT = random2(2, 5);
        if (length2 < want) this.spawnTraffic(false);
      }
    }
    this.game.combatAssist?.resolve(this);
    const formations = formationTargets(this);
    for (const entity of this.ships.values()) {
      if (entity.towCap && entity.player) {
        formations.delete(entity.id);
        entity.catchup = null;
        if (entity.autoCombat)
          this.game.combatAssist.stop(entity.player.s, 'Towing requires manual flight');
        if (entity.state === 'jumpout') entity.state = 'fly';
      }
      if (entity.state === 'jumpout') {
        entity.jumpT -= tickDuration;
        const space = entity.st.maxSpeed * 3;
        entity.vx = Math.sin(entity.a) * space;
        entity.vy = -Math.cos(entity.a) * space;
        entity.x += entity.vx * tickDuration;
        entity.y += entity.vy * tickDuration;
        if (entity.jumpT <= 0) this.game.finishJump(entity, this);
        continue;
      }
      if (entity.industrialRoot) continue; // Industrial controller owns noncombat movement/collection.
      if (entity.player) {
        const playerInputs = entity.player.inputs;
        const input = playerInputs.length ? playerInputs.shift() : entity.player.lastInput;
        if (input) {
          entity.player.lastInput = input;
          entity.inp = input;
          entity.seq = input.seq;
          if (input.navigation) {
            formations.delete(entity.id);
            entity.player.s.armadaFormationTarget = null;
          }
          if (
            formations.has(entity.id) &&
            !input.navigation &&
            (input.thrust || input.turn || input.ab || input.rev || input.fire1 || input.fire2)
          ) {
            cancelFormation(this.game, entity.player.s, 'manual flight or weapons input');
            formations.delete(entity.id);
          }
        }
      } else this.ai(entity);
      if (formations.has(entity.id) && !entity.autoCombat)
        steerFormation(entity, formations.get(entity.id)!);
      if (entity.player && entity.autoCombat) {
        entity.inp = {};
        entity.fireAt = null;
        if (this.game.combatAssist.valid(this, entity, entity.combatTarget)) {
          this.fight(entity, entity.combatTarget);
          entity.inp.fire1 = 1;
        }
      }
      if (
        entity.player &&
        entity.autoCombat &&
        !this.game.combatAssist.valid(this, entity, entity.combatTarget)
      )
        entity.inp = {};
      const computedShipStats = entity.catchup
        ? {
            ...entity.st,
            maxSpeed: Math.max(entity.st.maxSpeed, entity.catchup.maxSpeed * 1.15),
            accel: Math.max(entity.st.accel, entity.catchup.accel * 1.1),
            turn: Math.max(entity.st.turn, entity.catchup.turn),
          }
        : entity.st;
      step(entity, computedShipStats, entity.disabled ? {} : entity.inp);
      entity.shield = Math.min(
        entity.st.shield,
        entity.shield +
          entity.st.shieldRe *
            tickDuration *
            (this.t - (entity.hitT || -9) > 2 ? 1 : 0.4) *
            (this.m ? this.m.shieldRe : 1) *
            (entity.coopRe || 1),
      ); // coopRe is the Armada buff
      const radiation = eventideDrain(this.sys, entity, Date.now() / 1000);
      if (radiation) entity.shield = Math.max(0, entity.shield - radiation * tickDuration);
      if (entity.st.armorRe)
        entity.armor = Math.min(entity.st.armor, entity.armor + entity.st.armorRe * tickDuration);
      if (entity.st.fuelRe)
        entity.fuel = Math.min(entity.st.fuel, entity.fuel + entity.st.fuelRe * tickDuration);
      if (!entity.disabled) this.weapons(entity);
      if (entity.wormExit) {
        const mouth = this.sys.stellars.find((stellarBody) => stellarBody.id === entity.wormExit);
        if (!mouth || Math.hypot(mouth.x - entity.x, mouth.y - entity.y) > mouth.r * 0.65)
          entity.wormExit = undefined;
      }
      if (
        entity.player &&
        entity.state === 'fly' &&
        this.sys.gate &&
        !entity.wormExit &&
        !(entity.wormT! > this.t)
      )
        for (const stellarBody of this.sys.stellars)
          if (
            stellarBody.wormhole &&
            !entity.towCap &&
            Math.hypot(stellarBody.x - entity.x, stellarBody.y - entity.y) < stellarBody.r * 0.5
          ) {
            this.game.wormholeTransit(entity, this, stellarBody);
            break;
          }
    }
    for (const shot of this.shots) {
      if (shot.target && !shot.target.dead) {
        const want = angleTo(shot, shot.target.x, shot.target.y),
          atan = Math.atan2(shot.vx, -shot.vy),
          angDiff2 = angDiff(want, atan),
          space = Math.hypot(shot.vx, shot.vy);
        const normalAngle =
          atan + Math.max(-3 * tickDuration, Math.min(3 * tickDuration, angDiff2));
        shot.vx = Math.sin(normalAngle) * space;
        shot.vy = -Math.cos(normalAngle) * space;
      }
      shot.x += shot.vx * tickDuration;
      shot.y += shot.vy * tickDuration;
      shot.life -= tickDuration;
      if (shot.life <= 0) continue;
      const owner = this.ships.get(shot.owner);
      for (const entity of this.ships.values()) {
        if (entity.industrialRoot || entity.id === shot.owner || entity.state !== 'fly') continue;
        if (
          shot.miningEncounter &&
          !this.game.features.pressure.shotAllowed(this, shot.miningEncounter, entity)
        )
          continue;
        if (owner ? !this.canHit(owner, entity) : false) continue;
        const radius = Math.max(9, entity.st.size * 0.32);
        if (
          Math.abs(entity.x - shot.x) < radius &&
          Math.abs(entity.y - shot.y) < radius &&
          Math.hypot(entity.x - shot.x, entity.y - shot.y) < radius
        ) {
          const damage2 = this.damage(entity, shot.dmgA, shot.dmgS, owner || null, shot.p.ion);
          shot.life = 0;
          this.hitEv(shot.x, shot.y, shot.w, entity, damage2);
          if (shot.p.blast)
            this.events.push(['blast', Math.round(shot.x), Math.round(shot.y), shot.p.blast]);
          if (shot.p.blast)
            for (const entity4 of this.ships.values())
              if (
                entity4 !== entity &&
                owner &&
                (!shot.miningEncounter ||
                  this.game.features.pressure.shotAllowed(this, shot.miningEncounter, entity4)) &&
                this.canHit(owner, entity4) &&
                Math.hypot(entity4.x - shot.x, entity4.y - shot.y) < shot.p.blast
              )
                this.damage(entity4, shot.dmgA * 0.5, shot.dmgS * 0.5, owner);
          break;
        }
      }
      if (shot.life > 0 && this.rocks.length) {
        const rock = this.rockAt(shot.x, shot.y);
        if (rock) {
          if (shot.mining)
            this.game.features.mining.contact(this, rock, {
              source: shot.mining,
              damage: shot.dmgA + shot.dmgS * 0.3,
              x: shot.x,
              y: shot.y,
              projectile: true,
            });
          else this.hitRock(rock, shot.dmgA + shot.dmgS * 0.3, false, shot.captain);
          shot.life = 0;
          this.events.push(['hit', Math.round(shot.x), Math.round(shot.y), shot.w]);
        }
      }
    }
    this.shots = this.shots.filter((shot) => shot.life > 0);
    this.beams = this.beams.filter((beam) => beam.until > this.t && this.ships.has(beam.id));
    this.game.features.towing.towingTick(this);
    if ([...this.ships.values()].some((entity) => entity.player && entity.hull === 815))
      this.game.features.industrial.industrialTick(this, tickDuration);
    this.game.features.mining.endTick(this);
    this.game.features.pressure.pressureTick(this);
    this.game?.features?.index?.indexTick(this);
    this.game?.features?.indexFleet?.fleetTick(this);
    this.game?.features?.nhal?.nhalTick(this);
    for (const session of this.game.sessions.values())
      if (session.data?.sys === this.id)
        this.game.features.story?.storyTick(session, this, tickDuration);
    for (const floatingLoot of this.loot) {
      floatingLoot.x += floatingLoot.vx * tickDuration;
      floatingLoot.y += floatingLoot.vy * tickDuration;
      floatingLoot.vx *= 0.99;
      floatingLoot.vy *= 0.99;
    }
    this.loot = this.loot.filter(
      (floatingLoot) =>
        floatingLoot.it.generationKey || this.t - floatingLoot.t < (floatingLoot.it.ore ? 150 : 90),
    );
    for (const entity of this.ships.values())
      if (entity.player && entity.state === 'fly') {
        const reach = Math.max(30, entity.st.size * 0.5) * (entity.hull === 810 ? 4 : 1); // the Tidecaller's tractor tentacles
        for (const floatingLoot of this.loot)
          if (
            !floatingLoot.taken &&
            Math.hypot(floatingLoot.x - entity.x, floatingLoot.y - entity.y) < reach
          ) {
            if (this.game.onLoot(entity.player, floatingLoot.it) === false) continue;
            floatingLoot.taken = true;
            this.events.push(['pickup', floatingLoot.id]);
          }
      }
    this.loot = this.loot.filter((floatingLoot) => !floatingLoot.taken);
  }
  /**
   * Compiles compact network snapshot of all ships, shots, beams, and loot in this system.
   * @returns Serialized system state payload.
   */
  snapshot(): SpaceSnapshot {
    const ships = [];
    for (const entity of this.ships.values()) {
      const flags =
        (entity.inp && entity.inp.thrust ? 1 : 0) |
        (entity.inp && entity.inp.ab ? 2 : 0) |
        (entity.disabled ? 4 : 0) |
        (entity.state === 'jumpout' ? 8 : 0) |
        (entity.player ? 16 : 0) |
        (entity.elite ? 32 : 0) |
        (entity.rival ? 64 : 0);
      ships.push([
        entity.id,
        entity.hull,
        Math.round(entity.x),
        Math.round(entity.y),
        Math.round(entity.a * 1000),
        Math.round(entity.vx),
        Math.round(entity.vy),
        flags,
        Math.round((100 * entity.shield) / Math.max(1, entity.st.shield)),
        Math.round((100 * entity.armor) / Math.max(1, entity.st.armor)),
        faction2.indexOf(entity.faction),
        entity.player
          ? (this.sys.arena ? `${entity.team === 'A' ? 'Azure' : 'Crimson'} · ` : '') +
            entity.player.name
          : entity.name || null,
        entity.owner || 0,
        entity.pw || 0,
        entity.player?.s.data.story?.flags?.main_ending || null,
        ...(entity.indexState || []),
      ]);
    }
    const shots = this.shots.map((shot) => [
      Math.round(shot.x),
      Math.round(shot.y),
      Math.round(shot.vx),
      Math.round(shot.vy),
      shot.w,
      shot.owner,
    ]);
    const beams = this.beams.map((beam) => [
      beam.id,
      Math.round(beam.a * 1000),
      Math.round(beam.len),
      beam.w,
    ]);
    const loot = this.loot.map((floatingLoot) => [
      floatingLoot.id,
      Math.round(floatingLoot.x),
      Math.round(floatingLoot.y),
      floatingLoot.kind,
      ...(floatingLoot.it.indexClaim ? [1] : []),
    ]);
    const events2 = this.events;
    this.events = [];
    return { ships, shots, beams, loot, ev: events2 };
  }
}
