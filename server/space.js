import { formationTargets, steerFormation, cancelFormation } from './armada-formation.js';
import { eventideDrain } from '../shared/eventide.js';
/**
 * @typedef {import('./game.js').Session} Session
 * @typedef {import('./game.js').PlayerReference} PlayerReference
 * @typedef {import('./game.js').SpaceSystem} SpaceSystem
 * @typedef {import('./game.js').ShipStats} ShipStats
 *
 * @typedef {object} WeaponMount
 * @property {number} w Weapon item ID.
 * @property {number} n Number of mounted weapon instances.
 * @property {WeaponConfig} p Precomputed weapon parameters (range, reload, speed, homing, etc.).
 * @property {number} cd Current weapon cooldown time remaining in seconds.
 * @property {number} ammo Current ammunition count or Infinity if unlimited.
 * @property {string} snd Sound effect identifier.
 * @property {boolean} sec True if secondary weapon (missile, torpedo, drone bay).
 * @property {number} sndT Timestamp of last sound effect emission.
 *
 * @typedef {object} Entity
 * @property {number} id Unique entity simulation ID.
 * @property {number} hull Hull ID of the ship.
 * @property {string} faction Faction identifier string.
 * @property {number} x Coordinate X in 2D space.
 * @property {number} y Coordinate Y in 2D space.
 * @property {number} vx Velocity vector X component.
 * @property {number} vy Velocity vector Y component.
 * @property {number} a Heading orientation angle in radians.
 * @property {ShipStats} st Computed live ship stats.
 * @property {number} shield Current shield hitpoints.
 * @property {number} armor Current armor hitpoints.
 * @property {number} fuel Current hyperspace fuel.
 * @property {string | null} ai AI behavior mode ('patrol', 'trade', 'raid', 'escort', 'flee', 'leave').
 * @property {PlayerReference | null} player Player reference if this is a player-controlled ship.
 * @property {number | null} owner Entity ID of the commanding or parent ship.
 * @property {string | null} name Custom or display ship name.
 * @property {Entity | null} target Current combat target entity.
 * @property {Set<number>} aggro Set of hostile entity IDs that have attacked or engaged this ship.
 * @property {{thrust?: number, turn?: number, ab?: number, rev?: number, fire1?: number, fire2?: number}} inp Input control state.
 * @property {WeaponMount[]} guns Array of installed weapon mounts and turrets.
 * @property {boolean} dead True if the ship is destroyed or decommissioned.
 * @property {number} born Simulation timestamp when entity was spawned.
 * @property {number} think Time until next AI decision cycle.
 * @property {{x: number, y: number} | null} dest Target destination point for navigation or docking.
 * @property {string} state Entity flight state ('fly', 'jumpout', 'landed').
 * @property {number} jumpT Countdown timer for hyperjump execution.
 * @property {string} [jumpTo] Destination system ID during jump.
 * @property {Mission} [mission] Mission data object if this is a spawned mission target.
 * @property {number} life Lifespan in seconds before departure.
 * @property {number} cargo Cargo capacity or cargo indicator.
 * @property {number} strength Base strength rating of the ship.
 * @property {string} [role] Combat role class ('interceptor', 'fighter', 'corvette', 'frigate', 'destroyer', 'cruiser').
 * @property {string} [pers] AI combat personality ('cautious', 'steady', 'reckless').
 * @property {number} pw Effective power rating.
 * @property {boolean} [disabled] True if ship is disabled and drifting.
 * @property {number} [disT] Simulation timestamp when ship was disabled.
 * @property {number} [hitT] Simulation timestamp when ship was last damaged.
 * @property {number} [lastHitBy] Entity ID of last attacker.
 * @property {number} [graceT] Grace period timestamp protecting newly arrived players.
 * @property {string} [wormExit] Arrival aperture inhibited until cleared.
 * @property {number} [wormT] Wormhole transit cooldown timestamp.
 * @property {number} [rescueT] Rescue grace period timestamp.
 * @property {number} [fighterOf] Parent carrier entity ID if this is a launched fighter drone.
 * @property {boolean} [recall] True if fighter drone is recalled to dock.
 * @property {boolean} [elite] True if player ship has elite mastery.
 * @property {boolean} [rival] True if this is an AI rival captain.
 * @property {string} [rivalAi] Fallback AI behavior for rival.
 * @property {boolean} [autoCombat] True if automated combat assist is active.
 * @property {Entity | null} [combatTarget] Target entity selected by combat assist.
 * @property {string} [order] Current fleet command order ('gather', 'attack', 'hold', 'holdfire', 'loot').
 * @property {number} [orderSeq] Sequence counter for fleet orders.
 * @property {boolean} [boss] True if invasion boss entity.
 * @property {boolean} [bossMinion] True if escort minion of an invasion boss.
 * @property {boolean} [kingpin] True if Armada contract kingpin target.
 * @property {boolean} [warFleet] True if spawned as part of a system state war fleet.
 * @property {number} [coopRe] Armada shield recharge multiplier bonus.
 * @property {{dx: number, dy: number, mul: number} | boolean} [catchup] Speed catchup boost when escort falls behind.
 * @property {boolean} [tradeMate] True if accompanying a trader convoy.
 * @property {number} [escortSlot] Formation slot index for wingmates.
 * @property {string} [wingUid] Saved wingmate unique identifier.
 * @property {number} [wingOf] Player session ID of commanding player.
 * @property {number} [towCap] Hard attached towing velocity limit.
 * @property {number} [distractT] Timestamp until distraction by jettisoned cargo expires.
 * @property {Entity | null} [fireAt] Current target entity to aim weapons at.
 * @property {number} [seq] Sequence number of last applied player input packet.
 * @property {number} [_f2] Previous state of secondary fire button.
 * @property {boolean} [noDisable] True if entity is destroyed immediately without disability threshold.
 * @property {number} [industrialRoot] Noncombat industrial collector root ID.
 * @property {string} [miningEncounter] Mining-pressure encounter scope ID.
 * @property {number} [helpT] Timestamp of last distress call for reinforcements.
 * @property {boolean} [dread] True if dreadnought boss entity.
 * @property {number} [repHitT] Timestamp of last reputation penalty hit.
 * @property {number} [storyKill] Linked story objective ID.
 * @property {string} [arcOf] Faction arc objective identifier.
 * @property {string} [huntOf] Hunt mission identifier.
 * @property {string} [team] Arena combat team designation ('A' or 'B').
 * @property {boolean} [convoyOf] Convoy fleet identifier.
 * @property {boolean} [wave] Frontier wave encounter entity.
 * @property {number} [slot] Formation slot assigned.
 * @property {number} [jumpCost] Calculated fuel requirement for hyperjump.
 *
 * @typedef {object} Rock
 * @property {number} id Unique asteroid rock ID.
 * @property {number} x Coordinate X.
 * @property {number} y Coordinate Y.
 * @property {number} r Asteroid rock collision radius.
 * @property {string} ore Ore commodity type mined ('gas', 'shards', 'ore', etc.).
 * @property {number} rich Ore richness multiplier.
 * @property {number} hp Current rock durability hitpoints.
 * @property {number} max Maximum rock durability hitpoints.
 * @property {number} down Timestamp when depleted rock will respawn, or 0 if active.
 * @property {number} evT Event tracking timestamp.
 *
 * @typedef {object} Shot
 * @property {string|null} [captain] Captured root captain for ordinary rock damage.
 * @property {number} id Unique projectile ID.
 * @property {string} [miningEncounter] Captured pressure-encounter scope.
 * @property {MiningSource|null} [mining] Captured mining provenance.
 * @property {number} w Weapon ID used to fire this shot.
 * @property {number} owner Entity ID of shooting ship.
 * @property {number} x Current position X.
 * @property {number} y Current position Y.
 * @property {number} vx Velocity X component.
 * @property {number} vy Velocity Y component.
 * @property {number} life Remaining projectile lifetime in seconds.
 * @property {number} dmgA Armor / hull damage dealt on impact.
 * @property {number} dmgS Shield damage dealt on impact.
 * @property {WeaponConfig} p Precomputed weapon properties.
 * @property {Entity | null} [target] Guided missile target entity, if homing.
 *
 * @typedef {object} Beam
 * @property {number} id Entity ID of beam emitter.
 * @property {number} w Weapon ID.
 * @property {number} a Beam direction angle in radians.
 * @property {number} len Beam length in world units.
 * @property {number} until Simulation timestamp until beam expires.
 *
 * @typedef {object} LootItem
 * @property {number} [credits] Credits salvage value.
 * @property {string} [mat] Material commodity type.
 * @property {number} [grade] Material grade index (0-4).
 * @property {string} [ore] Mined ore commodity ID.
 * @property {number} [rich] Authored field richness (not raw grade).
 * @property {GradeLots} [remainingLots]
 * @property {string} [generationKey]
 * @property {string} [parcelKey]
 * @property {number[]} [progressionTokens]
 * @property {boolean} [progressionClaimed]
 * @property {number} [n] Quantity of ore or units.
 * @property {string} [cargo] Jettisoned commodity ID.
 * @property {{owner: string, sys: string, until: number}} [jettisonPickup] Owner-only pickup grace in origin-system simulation time.
 * @property {{id: string, name: string, xp?: number, credits?: number}} [salvage] Quest salvage payload.
 * @property {{credits?: number, tokens?: number, shards?: number, rep?: Record<string, number>}} [chest] Pirate treasure chest payload.
 *
 * @typedef {object} FloatingLoot
 * @property {number} id Unique loot canister ID.
 * @property {number} x Position X.
 * @property {number} y Position Y.
 * @property {number} vx Drift velocity X.
 * @property {number} vy Drift velocity Y.
 * @property {LootItem} it Item contents.
 * @property {number} t Spawn simulation timestamp.
 * @property {number} kind Visual kind (0: canister/credits, 1: material crate, 2: jettisoned cargo).
 * @property {boolean} [taken] True if already collected by a ship.
 *
 * @typedef {object} SpaceSnapshot
 * @property {Array<Array<number | string | null>>} ships Array of serialized ship state tuples.
 * @property {Array<number[]>} shots Serialized projectile positions and weapon types.
 * @property {Array<number[]>} beams Serialized active laser beam vectors.
 * @property {Array<number[]>} loot Serialized floating salvage canisters.
 * @property {Array<[string, ...(number | string)[]]>} ev Transient visual/audio simulation events.
 */

// One star system's live simulation: ships (players, their escorts, NPC traffic), shots, beams, loot.
import { SYS, TRAFFIC, FACTIONS, MATERIALS } from '../shared/galaxy.js';
import { roleMult } from '../shared/roles.js';
import { STATES } from '../shared/living.js';
import {
  shipStats,
  weaponParams,
  weaponSound,
  step,
  wrap,
  angDiff,
  angleTo,
  hostileFactions,
  K,
  DT,
} from '../shared/rules.js';

/** @import { GradeLots } from '../shared/cargo-contracts.js' */
/** @import { GameAssets, ShipLoadout, ShipStatsBonus, WeaponConfig } from '../shared/rules.js' */
/** @import { Game, Mission, StellarBody } from './game.js' */
/** @import { MiningSource } from './mining-contracts.js' */

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
 * @param {Entity} entity Source entity.
 * @param {number} x Target X coordinate.
 * @param {number} y Target Y coordinate.
 * @returns {number} Distance in world units.
 */
const d0 = (entity, x, y) => Math.hypot(x - entity.x, y - entity.y);
const FAC = Object.keys(FACTIONS);
/**
 * Generates a random float in range [a, b).
 * @param {number} a Minimum bound.
 * @param {number} b Maximum bound.
 * @returns {number} Random float.
 */
const rnd = (a, b) => a + Math.random() * (b - a);
/**
 * Picks a random element from an array.
 * @template T
 * @param {T[]} arr Source array.
 * @returns {T} Randomly selected element.
 */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Live 2D space simulation for a single star system.
 * Simulates ships, physics, weapons fire, projectile trajectories, laser beams,
 * floating debris/loot, asteroid fields, and NPC combat AI.
 *
 * @property {Game} game Parent game server engine instance.
 * @property {GameAssets} A Global game asset definitions.
 * @property {SpaceSystem} sys System definition and stellar data from galaxy database.
 * @property {string} id Unique system identifier string.
 * @property {Map<number, Entity>} ships Active ships, escorts, drones, and traffic in this system.
 * @property {Shot[]} shots Active ballistic and guided weapon projectiles.
 * @property {Beam[]} beams Active continuous beam weapons currently firing.
 * @property {FloatingLoot[]} loot Floating cargo canisters, mined ore chunks, and salvage crates.
 * @property {Array<[string, ...(number | string)[]]>} events Transient visual and audio events accumulated for next client network update.
 * @property {number} t Simulation timestamp in seconds.
 * @property {number} spawnT Countdown until next background traffic spawn check.
 * @property {number} players Number of human player-piloted ships currently flying in this system.
 * @property {Rock[]} rocks Mining field asteroids and gas pockets.
 * @property {Record<string, number>} m Cached system-wide modifiers from active fronts or living states.
 * @property {number} mT Counter for modifier recalculation cadence.
 * @property {number} quietT Quiet duration timer for system sleep deallocation.
 * @property {boolean} keep Prevent deallocation flag.
 * @property {number} errs Count of tick simulation errors.
 * @property {string[]} nearFacs Cached list of neighboring faction IDs for frontier traffic generation.
 * @property {StellarBody[]} _ports Cached landing-capable spaceports in this system.
 */
export class Space {
  /**
   * Initializes a live system space simulation.
   * @param {Game} game Server game instance.
   * @param {string} sysId Unique star system ID.
   */
  constructor(game, sysId) {
    this.game = game;
    this.A = game.A;
    this.sys = SYS[sysId];
    this.id = sysId;
    this.ships = new Map();
    this.shots = [];
    this.beams = [];
    this.loot = [];
    this.events = [];
    this.t = 0;
    this.spawnT = 1;
    this.players = 0;
    if (!this.sys.arena)
      for (let i = 0, n = 5 + this.sys.danger + Math.floor(this.ports().length / 2); i < n; i++)
        this.spawnTraffic(true); // 2.3: busier systems
    // asteroids and gas pockets in the system's mining fields: they break into ore that ships scoop up, and regrow
    this.rocks = [];
    this.game.features.mining.openSpace(this);
  }
  /**
   * Generates compact serialized state array of asteroid field rocks for client rendering.
   * @returns {Array<[number, number, number, number, string, number]>} Compact array of [id, x, y, radius, ore, hpPct].
   */
  rocksPayload() {
    return this.rocks.map((k) => [
      k.id,
      k.x,
      k.y,
      k.r,
      k.ore,
      k.down ? 0 : Math.round((100 * k.hp) / k.max),
    ]);
  }
  /**
   * Applies weapon damage to an asteroid rock, spawning floating ore chunks when broken.
   * @param {Rock} k Target asteroid rock.
   * @param {number} dmg Incoming weapon damage.
   * @param {boolean} mining Whether damage originates from a mining laser.
   * @returns {void}
   */
  hitRock(k, dmg, mining, captain = null) {
    // Legacy direct damage retains ordinary output; clean credit requires actual collision provenance.
    this.game.features.mining.ordinary(this, k, dmg * (mining ? 6 : 1), captain);
  }
  /**
   * Finds an active asteroid rock intersecting coordinates.
   * @param {number} x Coordinate X.
   * @param {number} y Coordinate Y.
   * @param {number} [pad=0] Hitbox expansion padding.
   * @returns {Rock | null} Colliding rock, or null if none.
   */
  rockAt(x, y, pad = 0) {
    for (const k of this.rocks)
      if (
        !k.down &&
        Math.abs(k.x - x) < k.r + pad &&
        Math.abs(k.y - y) < k.r + pad &&
        Math.hypot(k.x - x, k.y - y) < k.r + pad
      )
        return k;
    return null;
  }

  // ------------------------------------------------------------------ ships
  /**
   * Spawns and registers a new ship entity in this space simulation.
   * @param {object} o Ship initialization parameters.
   * @param {ShipLoadout} [o.loadout] Ship loadout with hull, outfits, weapons, and ammo.
   * @param {number} [o.hull] Hull ID if no loadout specified.
   * @param {string} [o.faction] Faction affiliation ID.
   * @param {number} [o.x=0] Initial position X.
   * @param {number} [o.y=0] Initial position Y.
   * @param {number} [o.vx=0] Initial velocity X.
   * @param {number} [o.vy=0] Initial velocity Y.
   * @param {number} [o.a=0] Initial heading angle in radians.
   * @param {ShipStatsBonus} [o.bonus] Stat multiplier bonuses.
   * @param {number} [o.shield] Override initial shields.
   * @param {number} [o.armor] Override initial armor.
   * @param {number} [o.fuel] Override initial fuel.
   * @param {string | null} [o.ai] AI behavior mode.
   * @param {PlayerReference | null} [o.player] Player reference if player-piloted.
   * @param {number | null} [o.owner] Commanding parent entity ID.
   * @param {string | null} [o.name] Display name.
   * @param {string} [o.state='fly'] Initial flight state.
   * @param {Mission} [o.mission] Linked mission payload.
   * @param {number} [o.cargo] Carried cargo count.
   * @param {string} [o.pers] Combat personality override.
   * @param {Record<number, number>} [o.ammo] Weapon ammo counts.
   * @returns {Entity} The initialized and registered ship entity.
   */
  makeShip(o) {
    const loadout = o.loadout || { hull: o.hull, outfits: {} };
    const st = shipStats(this.A, loadout, o.bonus || {});
    const e = {
      id: NEXT++,
      hull: loadout.hull,
      faction: o.faction || 'spacer',
      x: o.x || 0,
      y: o.y || 0,
      vx: o.vx || 0,
      vy: o.vy || 0,
      a: o.a || 0,
      st,
      shield: o.shield ?? st.shield,
      armor: o.armor ?? st.armor,
      fuel: o.fuel ?? st.fuel,
      ai: o.ai || null,
      player: o.player || null,
      owner: o.owner || null,
      name: o.name || null,
      target: null,
      aggro: new Set(),
      inp: { thrust: 0, turn: 0 },
      guns: [],
      dead: false,
      born: this.t,
      think: 0,
      dest: null,
      state: o.state || 'fly',
      jumpT: 0,
      mission: o.mission || null,
      life: rnd(150, 300),
      cargo: o.cargo || 0,
      strength: this.A.ships[loadout.hull].strength || 10,
    };
    const H = this.A.ships[loadout.hull];
    e.role = H.role;
    if (!e.player) {
      const F = FACTIONS[e.faction] || {},
        r = Math.random();
      e.pers =
        o.pers ||
        (F.pirate
          ? r < 0.15
            ? 'cautious'
            : r < 0.6
              ? 'steady'
              : 'reckless'
          : r < 0.35
            ? 'cautious'
            : r < 0.85
              ? 'steady'
              : 'reckless');
    } // 2.4: how a captain fights
    const statBonuses = o.bonus || {};
    e.pw = Math.round(
      (H.strength || 10) *
        (1 +
          ((statBonuses.shieldPct || 0) +
            (statBonuses.armorPct || 0) +
            (statBonuses.damagePct || 0)) /
            300),
    ); // 0.9: effective strength (levels)
    const defAmmo = {};
    for (const [w, , a] of H.weapons) defAmmo[w] = (defAmmo[w] || 0) + a;
    for (const [w, n] of Object.entries(st.weapons)) {
      const W = this.A.weapons[w];
      if (!W) continue;
      const weapon = weaponParams(W);
      const needsAmmo = (weapon.homing || weapon.rocket || weapon.bay) && W.ammo !== -1;
      const ammo = needsAmmo
        ? o.ammo && o.ammo[w] !== undefined
          ? o.ammo[w]
          : defAmmo[w] || 0
        : Infinity;
      e.guns.push({
        w: +w,
        n,
        p: weapon,
        cd: rnd(0, weapon.reload),
        ammo,
        snd: weaponSound(W),
        sec: weapon.homing || weapon.rocket || weapon.bay,
        sndT: 0,
      });
    }
    this.ships.set(e.id, e);
    return e;
  }
  /**
   * Removes a ship entity from simulation and flags it as dead.
   * @param {Entity} entity Ship entity to remove.
   * @param {string} [why] Visual flash effect trigger reason (e.g. 'jump').
   * @returns {void}
   */
  remove(entity, why) {
    if (entity.player && entity.player.s.ent === entity && this.game.db.world.towing)
      this.game.features.towing.detach(entity.player.s);
    entity.dead = true;
    this.ships.delete(entity.id);
    if (why) this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
  }
  /**
   * Resolves the top-level owner or wing leader for an entity (traversing up to 4 levels).
   * @param {Entity} entity Candidate entity.
   * @returns {Entity} Root leader entity, or the entity itself.
   */
  root(entity) {
    let r = entity,
      k = 0;
    while (r && r.owner && k++ < 4) r = this.ships.get(r.owner) || null;
    return r || entity;
  }
  /**
   * Gets cached list of landing-capable ports in this system.
   * @returns {StellarBody[]} Array of stellar bodies with landing services.
   */
  ports() {
    return (
      this._ports ||
      (this._ports = this.sys.stellars.filter(
        (stellarBody) => stellarBody.svc && stellarBody.svc.includes('L') && !stellarBody.site,
      ))
    );
  } // 2.3: where traffic can land
  /**
   * Gets the player session ID owning an entity or its root escort group.
   * @param {Entity} entity Candidate entity.
   * @returns {number | null} Player session ID, or null if NPC.
   */
  pid(entity) {
    const r = this.root(entity);
    return r && r.player ? r.player.id : null;
  }
  // Session-only hostility lasts through landing/relaunch, but not the next system visit.
  beginVisit(session) {
    if (session.retaliationVisit?.sys !== this.id)
      session.retaliationVisit = { sys: this.id, factions: new Set() };
    return session.retaliationVisit;
  }
  localRetaliation(npc, player) {
    const visit = player?.player?.s?.retaliationVisit;
    return !!(visit?.sys === this.id && visit.factions.has(npc.faction));
  }
  // Ambient NPCs overlook below-Tier-3 captains throughout the main galaxy.
  // This is target-acquisition protection, not immunity to stray fire.
  newcomerTruce(e, o) {
    const entity = this.root(o),
      re = this.root(e);
    if (!entity?.player || !re || re.player || this.sys.farside || this.sys.arena) return false;
    if (!this.game.newcomer?.(entity.player.s?.data) || this.localRetaliation(re, entity))
      return false;
    if (
      re.aggro.has(entity.id) ||
      entity.aggro.has(re.id) ||
      re.mission?.owner === entity.player.id ||
      (re.storyKill && re.story === entity.player.id) ||
      re.arcOf?.sid === entity.player.id ||
      re.huntOf === entity.player.id ||
      re.combatOwners?.includes(entity.player.id) ||
      (re.kingpin &&
        entity.player.s?.data.missions?.some(
          (m) => m.type === 'warband' && m.id === re.kingpin && !m.done,
        ))
    )
      return false;
    return true;
  }
  /** Targeting truce; short arrival grace remains separate from newcomer eligibility. */
  spared(e, o) {
    const entity = this.root(o),
      re = this.root(e);
    if (!entity?.player || !re || re.player) return false;
    if (this.localRetaliation(re, entity)) return false;
    return entity.graceT > this.t || this.newcomerTruce(e, o);
  }
  // Idle wingmates must not turn a captain's protected passage into an unsolicited fight.
  canAcquire(e, o) {
    if (e.industrialRoot || o.industrialRoot) return false;
    if (
      (e.miningEncounter || o.miningEncounter) &&
      this.game.features.pressure.allow(this, e, o) === false
    )
      return false;
    if (this.spared(e, o)) return false;
    const lead = this.root(e);
    return !(
      !e.player &&
      lead?.player &&
      !this.ordered(e, o) &&
      !(lead.sharedCombat && lead.combatTarget === o) &&
      this.newcomerTruce(o, e)
    );
  }
  // 2.1: can a's fire hurt b? Hostiles always; a captain's own guns also hit any ship not on their side (like EV Nova),
  // which angers it and costs standing. Escorts and NPCs still only hit their enemies.
  // 2.1: your wingmates under an attack order (K) go after whatever you have targeted, hostile or not
  /**
   * Checks whether an escort entity is ordered by its player leader to attack target.
   * @param {Entity} entity Escort entity.
   * @param {Entity} t Candidate target entity.
   * @returns {boolean} True if escort is explicitly ordered to attack target.
   */
  ordered(entity, t) {
    const r = this.root(entity);
    if (
      !entity.owner ||
      !r ||
      !r.player ||
      r.order !== 'attack' ||
      !r.target ||
      r.target.dead ||
      this.sys.arena
    )
      return false;
    const rt = this.root(t);
    return rt === this.root(r.target) && rt !== r && !rt.player;
  }
  /**
   * Determines whether weapon fire from entity a can damage entity b.
   * @param {Entity} attacker Attacking ship entity.
   * @param {Entity} rightEntity Target ship entity.
   * @returns {boolean} True if attacks can connect and damage target.
   */
  canHit(attacker, rightEntity) {
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
        target.graceT > this.t &&
        !this.localRetaliation(source, target)
      );
    }
    if (this.ordered(attacker, rightEntity)) return true;
    if (!attacker || !rightEntity || !attacker.player || this.sys.arena) return false;
    const entity = this.root(rightEntity);
    if (entity === attacker || entity.player) return false; // never your own wing; players only in lawless space (isHostile)
    return !rightEntity.dead && rightEntity.state === 'fly';
  }
  /**
   * Checks whether this system is classified as safe inner Concord space (danger <= 2).
   * @returns {boolean} True if inner territory.
   */
  inner() {
    const S = this.sys;
    return S.danger <= 2 && !S.farside && !S.arena && !['umbral', 'deep'].includes(S.faction);
  }

  /**
   * Evaluates mutual hostility between two ships based on factions, aggro, duels, and missions.
   * @param {Entity} leftEntity First entity.
   * @param {Entity} rightEntity Second entity.
   * @returns {boolean} True if ships are hostile to one another.
   */
  isHostile(leftEntity, rightEntity) {
    if (
      !leftEntity ||
      !rightEntity ||
      leftEntity === rightEntity ||
      leftEntity.dead ||
      rightEntity.dead
    )
      return false;
    const scoped =
      leftEntity.miningEncounter || rightEntity.miningEncounter
        ? this.game.features.pressure.allow(this, leftEntity, rightEntity)
        : null;
    if (scoped !== null) return scoped;
    const entity = this.root(leftEntity),
      rb = this.root(rightEntity);
    if (entity === rb) return false;
    if (entity.rescueT > this.t || rb.rescueT > this.t) return false; // 2.6: a downed captain waiting for rescue is left alone
    const pa = entity.player,
      pb = rb.player;
    if (this.sys.arena) return !!(entity.team && rb.team && entity.team !== rb.team); // arena: teams only
    if (pa && pb && this.game.features.coop.sameArmada(pa, pb)) return false; // 2.6: Armada members and their wingmates never fight
    if (pa && pb)
      return !!(this.game.features.coop.dueling && this.game.features.coop.dueling(pa, pb)); // 2.6: no open-galaxy PvP, whatever was fired; only agreed duels (and the Crucible, above)
    if (entity.aggro.has(rb.id) || rb.aggro.has(entity.id)) return true;
    if (
      ((entity.boss || entity.bossMinion || entity.kingpin) && pb) ||
      ((rb.boss || rb.bossMinion || rb.kingpin) && pa)
    )
      return true; // 2.6: Armada contract kingpins too   // invasion bosses attack everyone
    if (pa || pb) {
      const p = pa || pb,
        npc = pa ? rb : entity,
        rep = p.rep[npc.faction] || 0,
        F = FACTIONS[npc.faction];
      if (this.localRetaliation(npc, pa ? entity : rb)) return true;
      const rh = this.game.features.rivals.rivalHostile
        ? this.game.features.rivals.rivalHostile(npc, p)
        : undefined;
      if (rh !== undefined) return rh; // 1.1: rivals, hired guns, bribes
      if (F && F.pirate) return rep < 30;
      if (F && F.alwaysHostile) return true;
      if (npc.mission && npc.mission.owner === p.id) return true;
      return rep <= -30;
    }
    return hostileFactions(entity.faction, rb.faction);
  }

  // ------------------------------------------------------------------ traffic
  /**
   * Spawns ambient civilian traders, faction patrols, or pirate raiders based on system danger.
   * @param {boolean} [initial] True if spawning initial population on system spin-up.
   * @returns {Entity | void} The lead spawned ship entity, if any.
   */
  spawnTraffic(initial) {
    const S = this.sys;
    if (
      (S.faction === 'vashari' || S.faction === 'frontier') &&
      Math.random() < 0.14 * (this.m ? this.m.swarm : 1)
    )
      return this.spawnSwarm(initial);
    if (
      this.game.features.hostile.eclipseChance &&
      Math.random() < this.game.features.hostile.eclipseChance(S, this.m)
    )
      return this.spawnEclipse(initial);
    let fac = S.faction;
    if (FACTIONS[fac].region) {
      // Frontier and the Deep fly no flag: traffic comes from the neighbours, raiders and scavengers
      if (!this.nearFacs) {
        const ns = new Set();
        for (const l of S.links) {
          const f = SYS[l].faction;
          if (!FACTIONS[f].region && !FACTIONS[f].pirate) ns.add(f);
        }
        this.nearFacs = [...ns, 'spacer', 'spacer'];
      }
      const roll0 = Math.random();
      if (fac === 'deep') fac = roll0 < 0.7 ? 'umbral' : 'hollow';
      else fac = roll0 < 0.12 * S.danger ? 'hollow' : pick(this.nearFacs);
    }
    const T = TRAFFIC[fac];
    let kind,
      f = fac,
      roll = Math.random();
    const st = this.game.features.living.stateOf
        ? this.game.features.living.stateOf(this.id)
        : null,
      SX = st ? STATES[st.kind] : null; // 2.4: the system's state shapes its traffic
    if (st && st.kind === 'war' && st.enemy && TRAFFIC[st.enemy] && Math.random() < 0.35) {
      const lead = this.spawnGroup('patrol', st.enemy, TRAFFIC[st.enemy].war, initial);
      if (lead)
        for (const e of this.ships.values())
          if (e === lead || e.owner === lead.id) e.warFleet = true;
      return lead;
    } // 2.5.2: tagged, so newcomers are spared
    if (st && st.kind === 'pirates' && Math.random() < 0.3) roll = -1; // force a raid roll below
    if (FACTIONS[fac].pirate) kind = 'raid';
    else if ((S.danger >= 2 || roll < 0) && roll < 0.08 * S.danger * (this.m ? this.m.raid : 1)) {
      kind = 'raid';
      f = Math.random() < 0.3 && S.danger >= 3 && !S.farside ? 'umbral' : 'hollow';
    } else if (roll < 0.68 && T.traders.length) kind = 'trade';
    else if (roll < 0.82) {
      kind = 'trade';
      f = 'spacer';
    } else kind = 'patrol';
    if (
      kind === 'raid' &&
      FACTIONS[S.faction].pirate &&
      [...this.ships.values()].filter((e) => e.ai === 'raid' && !e.owner && !e.mission).length >=
        3 + Math.floor(S.danger / 2)
    ) {
      kind = 'trade';
      f = 'spacer';
    } // 2.3: pirate havens get visiting smugglers and free traders too
    else if (
      kind === 'raid' &&
      !FACTIONS[S.faction].pirate &&
      [...this.ships.values()].filter((e) => e.ai === 'raid' && !e.owner && !e.mission).length >=
        (this.inner() ? 1 : 2) + Math.floor(S.danger / 2) + ((SX && SX.raidCap) || 0)
    ) {
      kind = 'trade';
      f = T.traders.length ? fac : 'spacer';
      roll = 1;
    } // 2.0.3: raiders don't pile up while traders come and go
    let pool =
      kind === 'trade'
        ? TRAFFIC[f].traders.length
          ? TRAFFIC[f].traders
          : TRAFFIC.spacer.traders
        : TRAFFIC[f].war;
    if (kind === 'raid' && this.inner() && pool.length > 2)
      pool = [...pool]
        .sort((a, b) => ((this.A.ships[a] || {}).cost || 0) - ((this.A.ships[b] || {}).cost || 0))
        .slice(0, pool.length - 1); // 2.0.3: no destroyers raiding inner space
    const hull = pick(pool);
    if (!this.A.ships[hull]) return;
    const n =
      kind === 'trade'
        ? Math.random() < 0.22
          ? 2 + (Math.random() < 0.4 ? 1 : 0)
          : 1
        : (Math.random() < 0.4 ? 2 : 1) + (kind === 'raid' && S.danger > 3 ? 1 : 0); // 2.3: some traders run in small convoys
    let lead = null;
    for (let i = 0; i < n; i++) {
      const h =
        i === 0
          ? hull
          : pick(
              pool.filter((x) => (this.A.ships[x].cost || 0) <= (this.A.ships[hull].cost || 1e9)) ||
                pool,
            );
      let x, y, a, v;
      if (initial) {
        x = rnd(-1800, 1800);
        y = rnd(-1800, 1800);
        a = rnd(-Math.PI, Math.PI);
        v = 30;
      } else if (kind === 'trade' && this.ports().length && Math.random() < 0.45) {
        // take off from a spaceport
        const stellarBody = pick(this.ports());
        x = stellarBody.x + rnd(-40, 40);
        y = stellarBody.y + rnd(-40, 40);
        a = rnd(-Math.PI, Math.PI);
        v = 10;
      } else {
        const ang = rnd(-Math.PI, Math.PI);
        x = Math.sin(ang) * 2600;
        y = -Math.cos(ang) * 2600;
        a = wrap(ang + Math.PI);
        v = 140;
      }
      const entity = this.makeShip({
        hull: h,
        faction: f,
        x: x + i * 60,
        y: y + i * 50,
        a,
        vx: Math.sin(a) * v,
        vy: -Math.cos(a) * v,
        ai: kind,
        owner: lead ? lead.id : null,
      });
      if (!initial) this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
      if (!lead) lead = entity;
      else {
        entity.ai = 'escort';
        if (kind === 'trade') entity.tradeMate = true;
      }
    }
  }
  // 2.4: a group of warships of one power (a border war's attackers)
  /**
   * Spawns a coordinated group of ships flying in formation.
   * @param {string} kind AI behavior ('patrol', 'raid', 'trade').
   * @param {string} f Faction identifier.
   * @param {number[]} pool Available hull ID options.
   * @param {boolean} [initial] True if spawning initial population.
   * @returns {Entity | null} Lead ship entity, or null.
   */
  spawnGroup(kind, f, pool, initial) {
    const hull = pick(pool.filter((h) => this.A.ships[h]));
    if (!hull) return;
    const ang = rnd(-Math.PI, Math.PI),
      n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
    let lead = null;
    for (let i = 0; i < n; i++) {
      const x = initial ? rnd(-1800, 1800) : Math.sin(ang) * 2600,
        y = initial ? rnd(-1800, 1800) : -Math.cos(ang) * 2600,
        a = wrap(ang + Math.PI);
      const entity = this.makeShip({
        hull: i
          ? pick(
              pool.filter(
                (h) =>
                  this.A.ships[h] &&
                  (this.A.ships[h].cost || 0) <= (this.A.ships[hull].cost || 1e9),
              ),
            ) || hull
          : hull,
        faction: f,
        x: x + i * 70,
        y: y + i * 50,
        a,
        vx: Math.sin(a) * 120,
        vy: -Math.cos(a) * 120,
        ai: i ? 'escort' : kind,
        owner: lead ? lead.id : null,
      });
      if (!initial) this.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
      if (!lead) lead = entity;
    }
    return lead;
  }
  // 0.8: a Feral Swarm cluster: a Thrip Darter brood-leader and its drones, hostile to everyone
  /**
   * Spawns a hostile Vashari alien drone swarm.
   * @param {boolean} [initial] True if spawning initial population.
   * @returns {Entity | null} Lead swarm entity, or null.
   */
  spawnSwarm(initial) {
    const ang = Math.random() * Math.PI * 2,
      d = initial ? 600 + Math.random() * 1400 : 2400,
      x = Math.cos(ang) * d,
      y = Math.sin(ang) * d;
    const lead = this.makeShip({
      hull: 765,
      faction: 'swarm',
      x,
      y,
      a: ang + Math.PI,
      ai: 'raid',
      name: 'Swarm Brood-Leader',
    });
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const entity = this.makeShip({
        hull: i % 3 ? 718 : 765,
        faction: 'swarm',
        x: x + (Math.random() - 0.5) * 160,
        y: y + (Math.random() - 0.5) * 160,
        a: ang + Math.PI,
        ai: 'escort',
        owner: lead.id,
      });
      entity.swarmling = true;
    }
    if (!initial) this.events.push(['flash', Math.round(x), Math.round(y)]);
    return lead;
  }
  // 0.9: an Umbral Eclipse cell, violet-lit and far from home
  /**
   * Spawns an Eclipse cultist strike group.
   * @param {boolean} [initial] True if spawning initial population.
   * @returns {Entity | null} Lead cultist entity, or null.
   */
  spawnEclipse(initial) {
    const ang = Math.random() * Math.PI * 2,
      d = initial ? 700 + Math.random() * 1300 : 2400,
      x = Math.cos(ang) * d,
      y = Math.sin(ang) * d;
    const lead = this.makeShip({
      hull: Math.random() < 0.35 ? 763 : 762,
      faction: 'eclipse',
      x,
      y,
      a: ang + Math.PI,
      ai: 'raid',
      name: 'Eclipse Cell',
    });
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++)
      this.makeShip({
        hull: i ? 761 : 762,
        faction: 'eclipse',
        x: x + (i - 1) * 110,
        y: y + 90,
        a: ang + Math.PI,
        ai: 'escort',
        owner: lead.id,
      });
    if (!initial) this.events.push(['flash', Math.round(x), Math.round(y)]);
    return lead;
  }
  /**
   * Generates a unique sequential identifier for floating loot canisters.
   * @returns {number} Next loot ID.
   */
  nextLootId() {
    return NEXT++;
  }
  /**
   * Spawns a named bounty mission target and its defensive escort wing.
   * @param {Mission} mission Bounty mission specification.
   * @returns {Entity | null} Spawned mission target entity.
   */
  spawnMissionTarget(mission) {
    const hull = mission.hull,
      ang = rnd(-Math.PI, Math.PI);
    const entity = this.makeShip({
      hull,
      faction: mission.faction,
      x: Math.sin(ang) * 1500,
      y: -Math.cos(ang) * 1500,
      a: wrap(ang + Math.PI),
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
   * @param {Entity} entity Ship entity to steer.
   * @param {number} tx Target X coordinate.
   * @param {number} ty Target Y coordinate.
   * @param {boolean} arrive Whether to brake and bring velocity to zero at target.
   * @param {number} [tvx=0] Target velocity X for formation matching.
   * @param {number} [tvy=0] Target velocity Y for formation matching.
   * @param {boolean} [landing=false] Keep landing cruise pointed toward its destination.
   * @returns {number} Distance remaining to target coordinates.
   */
  steer(entity, tx, ty, arrive, tvx = 0, tvy = 0, landing = false) {
    const st = entity.st,
      dx = tx - entity.x,
      dy = ty - entity.y,
      d = Math.hypot(dx, dy),
      sp = Math.hypot(entity.vx, entity.vy);
    const want = Math.atan2(dx, -dy),
      diff = angDiff(want, entity.a);
    if (arrive) {
      // 2.0.1: plan a speed that falls to zero at the target (allowing time to turn around), and steer to close the velocity error
      const tflip = Math.PI / Math.max(0.3, st.turn),
        ux = d > 1 ? dx / d : 0,
        uy = d > 1 ? dy / d : 0;
      const vAllow = Math.min(
        st.maxSpeed * 0.95,
        Math.sqrt(2 * st.accel * Math.max(0, d - 10 - sp * tflip * 0.6)) * 0.8,
      );
      const ex = tvx + ux * vAllow - entity.vx,
        ey = tvy + uy * vAllow - entity.vy,
        em = Math.hypot(ex, ey);
      // Match player landing policy: tiny longitudinal speed corrections must not
      // leave a cruising ship sideways. Keep actual lateral correction and the
      // existing turn-time/braking envelope; formation steering is unchanged.
      const lateral = (entity.vx * dy - entity.vy * dx) / (d || 1);
      if (
        landing &&
        vAllow === st.maxSpeed * 0.95 &&
        Math.abs(lateral) < 8 &&
        entity.vx * dx + entity.vy * dy >= 0
      ) {
        entity.inp = {
          turn: Math.abs(diff) < st.turn * DT ? 0 : Math.sign(diff),
          thrust: Math.abs(diff) < 0.15 && sp < vAllow - 8 ? 1 : 0,
        };
        if (Math.abs(diff) < st.turn * DT) entity.a = want;
        return d;
      }
      if (em < 8) {
        entity.inp = { turn: 0, thrust: 0 };
        return d;
      }
      const wa = Math.atan2(ex, -ey),
        da = angDiff(wa, entity.a);
      entity.inp = {
        turn: Math.abs(da) < st.turn * DT ? 0 : Math.sign(da),
        thrust: Math.abs(da) < 0.45 && em > 12 ? 1 : 0,
      };
      if (Math.abs(da) < st.turn * DT) entity.a = wa;
      return d;
    }
    entity.inp = {
      turn: Math.abs(diff) < st.turn * DT ? 0 : Math.sign(diff),
      thrust: Math.abs(diff) < 0.7 ? 1 : 0,
    };
    if (Math.abs(diff) < st.turn * DT) entity.a = want;
    return d;
  }
  /**
   * Scans nearby space for the closest valid hostile target entity.
   * @param {Entity} entity Searching ship entity.
   * @param {number} [range=1800] Maximum search radius.
   * @returns {Entity | null} Closest hostile entity, or null if none in range.
   */
  findTarget(entity, range = 1800) {
    let best = null,
      bd = range;
    for (const o of this.ships.values()) {
      if (
        o === entity ||
        o.state !== 'fly' ||
        !this.isHostile(entity, o) ||
        !this.canAcquire(entity, o)
      )
        continue;
      const d = Math.hypot(o.x - entity.x, o.y - entity.y) * (o.hull === 813 && o.player ? 3 : 1); // the Wraith is noticed at a third of the range
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }
  /**
   * Executes AI logic for an NPC ship: target selection, fleet commands, navigation, and retreat.
   * @param {Entity} entity NPC ship entity to update.
   * @returns {void}
   */
  ai(entity) {
    if (entity.player) return;
    entity.think -= DT;
    const owner = entity.owner ? this.ships.get(entity.owner) : null;
    if (entity.ai === 'escort' && !owner)
      entity.ai = entity.fighterOf ? 'leave' : entity.tradeMate ? 'trade' : 'patrol'; // 2.3: a convoy whose leader landed goes about its own trade
    if (entity.armor < entity.st.armor * 0.15 && !entity.player && !entity.noDisable) {
      // disabled: drifts; unclaimed wrecks are towed away after a while
      if (!entity.disabled) entity.disT = this.t;
      entity.inp = { thrust: 0, turn: 0 };
      entity.disabled = true;
      if (
        this.t - entity.disT > 75 &&
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
        if (entity.distractT > this.t) {
          entity.target = null;
          if (entity.dest) {
            this.steer(entity, entity.dest.x, entity.dest.y, true);
            return;
          }
        } // raiders chasing jettisoned cargo
        if (entity.ai === 'escort' && owner) {
          const ord = owner.order || 'gather'; // 1.1 fleet commands: gather, attack, hold, holdfire, loot
          if (entity.ordSeq !== owner.orderSeq) {
            entity.ordSeq = owner.orderSeq;
            entity.holdAt = { x: entity.x, y: entity.y };
            if (ord === 'holdfire' || ord === 'loot') entity.target = null;
          }
          const ot =
            owner.target &&
            !owner.target.dead &&
            (this.isHostile(entity, owner.target) ||
              (ord === 'attack' && this.ordered(entity, owner.target)))
              ? owner.target
              : null;
          const attacker = [...this.root(owner).aggro]
            .map((id) => this.ships.get(id))
            .find((s) => s && !s.dead);
          if (ord === 'holdfire' || (ord === 'loot' && !attacker)) entity.target = null;
          else if (ord === 'attack') entity.target = ot || attacker || null;
          else if (ord === 'hold') {
            const near = (t) =>
              t && Math.hypot(t.x - entity.holdAt.x, t.y - entity.holdAt.y) < 900 ? t : null;
            entity.target = near(ot) || near(attacker) || near(this.findTarget(entity, 600));
          } else
            entity.target =
              ot ||
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
        } // 2.4: a beaten captain runs for the jump point
        if (entity.ai === 'flee') entity.target = null;
      } // (not recalled)
    }
    if (owner && this.root(owner).sharedCombat) {
      const root = this.root(owner);
      entity.target =
        !entity.recall &&
        !['hold', 'holdfire', 'loot'].includes(root.order) &&
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
              : { x: rnd(-3000, 3000), y: rnd(-3000, 3000), out: true }; // 2.3: traders fly to worlds they can land on
        const d = this.steer(
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
          d < Math.max(40, (entity.dest.r || 60) * 0.5) &&
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
        if (entity.dest.out && d < 200) entity.ai = 'leave';
        break;
      }
      case 'guard': {
        // Dreadnoughts and invasion bosses hold station near their anchor point
        const h = entity.home || { x: 0, y: 0 },
          dd = Math.hypot(h.x - entity.x, h.y - entity.y);
        if (dd > 250) this.steer(entity, h.x, h.y, true);
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
                  x: pick(this.sys.stellars).x + rnd(-400, 400),
                  y: pick(this.sys.stellars).y + rnd(-400, 400),
                }
              : { x: rnd(-2000, 2000), y: rnd(-2000, 2000) };
        this.steer(entity, entity.dest.x, entity.dest.y, false);
        entity.inp.thrust =
          entity.inp.thrust && Math.hypot(entity.vx, entity.vy) < entity.st.maxSpeed * 0.6 ? 1 : 0;
        break;
      }
      case 'escort': {
        if (!owner) break;
        if (entity.recall) {
          const d = this.steer(entity, owner.x, owner.y, true, owner.vx, owner.vy);
          entity.catchup = owner.st;
          if (d < Math.max(50, owner.st.size * 0.35)) this.dock(entity, owner);
          break;
        } // 2.1: drones flying home
        const ord = owner.order || 'gather';
        if (ord === 'hold' && entity.holdAt) {
          const d = this.steer(entity, entity.holdAt.x, entity.holdAt.y, true);
          if (d < 60) entity.inp = { turn: 0, thrust: 0 };
          break;
        }
        if (ord === 'loot') {
          // sweep up nearby loot for the fleet's owner
          let best = null,
            bd = 1800;
          for (const l of this.loot) {
            if (l.taken) continue;
            const dd = Math.hypot(l.x - entity.x, l.y - entity.y);
            if (dd < bd) {
              bd = dd;
              best = l;
            }
          }
          const rp = this.root(owner).player;
          if (best && rp) {
            this.steer(entity, best.x, best.y, true);
            if (
              bd < Math.max(40, entity.st.size * 0.5) &&
              this.game.onLoot(rp, best.it) !== false
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
          for (const o of this.ships.values())
            if (o !== entity && o.owner === entity.owner && o.slot != null) used.add(o.slot);
          let i = 0;
          while (used.has(i)) i++;
          entity.slot = i;
        }
        const [lat, back] = SLOTS[entity.slot % SLOTS.length],
          ring = Math.floor(entity.slot / SLOTS.length),
          sz = Math.max(60, owner.st.size * 0.5);
        const L = lat * (55 + sz * 0.4),
          B = back * (60 + sz * 0.45) + ring * 70;
        const ox = owner.x + Math.cos(owner.a) * L - Math.sin(owner.a) * B,
          oy = owner.y + Math.sin(owner.a) * L + Math.cos(owner.a) * B;
        const d = this.steer(
          entity,
          ox,
          oy,
          d0(entity, ox, oy) > 250 ? false : true,
          owner.vx,
          owner.vy,
        );
        entity.catchup = d > 200 ? owner.st : null; // escorts can always keep up with the ship they guard
        if (d < 120) {
          const sp = Math.hypot(owner.vx, owner.vy);
          if (sp > 30) {
            const da = angDiff(owner.a, entity.a);
            entity.inp = {
              turn: Math.sign(da),
              thrust: Math.hypot(entity.vx, entity.vy) < sp ? 1 : 0,
            };
          }
        }
        if (
          entity.fighterOf &&
          owner &&
          !owner.player &&
          !owner.target &&
          d < 60 &&
          this.t - entity.born > 20
        ) {
          this.dock(entity, owner);
        } // a captain's drones stay out until recalled
        break;
      }
      case 'flee':
      case 'leave': {
        const ang = Math.atan2(entity.x, -entity.y) || 0.01;
        this.steer(entity, entity.x + Math.sin(ang) * 2000, entity.y - Math.cos(ang) * 2000, false);
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
   * @param {Entity} entity Ship entity to test.
   * @returns {boolean} True if ship should disengage and flee.
   */
  mayFlee(entity) {
    const thr = { cautious: 0.45, steady: 0.27, reckless: 0 }[entity.pers] || 0;
    if (
      !thr ||
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
    return entity.armor < entity.st.armor * thr && entity.shield < entity.st.shield * 0.15;
  }
  // 2.4: a ship under attack calls nearby ships of its own side to help
  /**
   * Broadcasts a distress call to nearby allied NPC ships when taking fire.
   * @param {Entity} entity Attacked ship entity.
   * @param {Entity} attacker Enemy ship inflicting damage.
   * @returns {void}
   */
  callHelp(entity, attacker) {
    if (entity.miningEncounter || attacker.miningEncounter) return;
    if (entity.player || this.sys.arena || (entity.helpT || -99) > this.t - 5) return;
    entity.helpT = this.t;
    for (const o of this.ships.values()) {
      if (
        o === entity ||
        o.player ||
        o.owner ||
        o.faction !== entity.faction ||
        o.target ||
        o.dead ||
        o.disabled ||
        (o.ai !== 'patrol' && o.ai !== 'raid' && o.ai !== 'guard')
      )
        continue;
      if (Math.hypot(o.x - entity.x, o.y - entity.y) > 1800 || this.spared(o, attacker)) continue;
      o.aggro.add(attacker.id);
      o.target = attacker;
    }
  }
  /**
   * Docks a returned fighter drone into its carrier bay and replenishes bay ammo.
   * @param {Entity} entity Drone fighter entity returning.
   * @param {Entity} owner Carrier parent entity.
   * @returns {void}
   */
  dock(entity, owner) {
    const g = owner.guns.find((g) => g.p.bay && this.A.weapons[g.w].launch === entity.hull);
    if (g && g.ammo !== Infinity) g.ammo++;
    this.remove(entity);
  }
  /**
   * Computes combat maneuvering, broadside circling, and attack vectoring toward target.
   * @param {Entity} entity Attacking ship entity.
   * @param {Entity} t Target enemy ship entity.
   * @returns {void}
   */
  fight(entity, t) {
    const primaryOnly = entity.autoCombat || (entity.owner && this.root(entity).sharedCombat);
    const best = entity.guns
      .filter((g) => !g.p.pd && g.ammo > 0 && (!primaryOnly || !g.sec))
      .reduce((m, g) => Math.max(m, g.p.range), 300);
    const dx = t.x - entity.x,
      dy = t.y - entity.y,
      d = Math.hypot(dx, dy);
    const lead = Math.min(1.2, d / 600);
    const lx = t.x + (t.vx - entity.vx) * lead,
      ly = t.y + (t.vy - entity.vy) * lead;
    if (
      entity.st.size >= 110 &&
      entity.st.turrets >= 2 &&
      d < best * 1.1 &&
      d > Math.max(140, entity.st.size)
    ) {
      // 2.4: capitals with turrets circle and fire broadsides instead of ramming
      const side = entity.id % 2 ? 1 : -1,
        ta =
          Math.atan2(dx, -dy) +
          side * (Math.PI / 2 - (d > best * 0.8 ? 0.35 : d < best * 0.5 ? -0.35 : 0));
      this.steer(entity, entity.x + Math.sin(ta) * 300, entity.y - Math.cos(ta) * 300, false);
      entity.inp.thrust =
        Math.hypot(entity.vx, entity.vy) < entity.st.maxSpeed * 0.6 ? entity.inp.thrust : 0;
    } else if (d > best * 0.75) this.steer(entity, lx, ly, false);
    else if (d < Math.max(120, entity.st.size * 0.9)) {
      const away = Math.atan2(-dx, dy) + 0.8;
      this.steer(entity, entity.x + Math.sin(away) * 300, entity.y - Math.cos(away) * 300, false);
    } else {
      this.steer(entity, lx, ly, false);
      entity.inp.thrust =
        Math.hypot(entity.vx, entity.vy) < entity.st.maxSpeed * 0.5 ? entity.inp.thrust : 0;
    }
    entity.fireAt = t;
  }

  // ------------------------------------------------------------------ combat
  /**
   * Discharges a weapon mount, creating ballistic projectiles, guided missiles, or drone fighters.
   * @param {Entity} entity Firing ship entity.
   * @param {WeaponMount} g Weapon mount being discharged.
   * @param {Entity | null} t Target entity, if guided.
   * @param {number} angle Fire orientation heading in radians.
   * @returns {void}
   */
  fire(entity, g, t, angle) {
    const weapon = g.p,
      W = this.A.weapons[g.w];
    const captain = this.root(entity).player?.s.name;
    const provenance = {
      captain: captain ? this.game.db.key(captain) : null,
      source: entity.id,
      mount: entity.guns.indexOf(g),
      weapon: g.w,
      cadence: weapon.reload / Math.max(1, g.n),
      contactId: `beam:${this.game.db.world.mining?.clock}:${entity.id}:${entity.guns.indexOf(g)}:${this.t}`,
    };
    if (g.ammo <= 0) return;
    if (weapon.bay) {
      const launch = W.launch;
      if (!launch || !this.A.ships[launch]) return;
      if (
        [...this.ships.values()].filter((s) => s.fighterOf === entity.id).length >=
        Math.min(6, g.n * 4)
      )
        return;
      const f = this.makeShip({
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
      f.fighterOf = entity.id;
      f.life = 1e9;
      g.ammo--;
      g.cd = 2.5;
      this.sound(entity, g);
      return;
    }
    if (weapon.homing || weapon.rocket) g.ammo--;
    g.cd = weapon.reload / Math.max(1, g.n);
    const ang = angle + (Math.random() - 0.5) * weapon.inacc;
    const dm = entity.st.damageMul || 1;
    if (weapon.beam) {
      const len = weapon.range;
      let hit = this.ray(entity, ang, len);
      const rk = this.rayRock(entity, ang, hit ? hit.d : len);
      if (rk) {
        this.beams.push({
          id: entity.id,
          a: ang,
          len: rk.d,
          w: g.w,
          until: this.t + (weapon.continuous ? DT * 1.5 : 0.12),
        });
        const damage =
          (weapon.dmgA + weapon.dmgS * 0.3) *
          (weapon.continuous ? K.beamDps * DT * Math.max(1, g.n) : 1);
        if (W.mining)
          this.game.features.mining.contact(this, rk.k, {
            source: provenance,
            damage,
            x: rk.x,
            y: rk.y,
            projectile: false,
          });
        else this.hitRock(rk.k, damage, false, provenance.captain);
        if (!weapon.continuous || this.t - g.sndT > 0.6) this.sound(entity, g);
        if (weapon.continuous) g.cd = 0;
        return;
      }
      const dur = weapon.continuous ? DT * 1.5 : 0.12;
      this.beams.push({
        id: entity.id,
        a: ang,
        len: hit ? hit.d : len,
        w: g.w,
        until: this.t + dur,
      });
      if (hit) {
        const k = weapon.continuous ? K.beamDps * DT * Math.max(1, g.n) : 1;
        const bm = this.m ? this.m.beam : 1,
          r = this.damage(
            hit.s,
            weapon.dmgA * k * dm * bm,
            weapon.dmgS * k * dm * bm,
            entity,
            weapon.ion,
          );
        if (weapon.continuous) {
          hit.s.beamAcc = (hit.s.beamAcc || 0) + r[0];
          if (this.t - (hit.s.beamEvT || 0) > 0.3) {
            hit.s.beamEvT = this.t;
            this.hitEv(hit.x, hit.y, g.w, hit.s, [hit.s.beamAcc, r[1], r[2]]);
            hit.s.beamAcc = 0;
          }
        } else this.hitEv(hit.x, hit.y, g.w, hit.s, r);
      }
      if (!weapon.continuous || this.t - g.sndT > 0.6) this.sound(entity, g);
      if (weapon.continuous) g.cd = 0;
      return;
    }
    const sp = weapon.speed;
    const ox = entity.x + Math.sin(entity.a) * entity.st.size * 0.35,
      oy = entity.y - Math.cos(entity.a) * entity.st.size * 0.35;
    const shotId = NEXT++;
    this.shots.push({
      id: shotId,
      miningEncounter: entity.miningEncounter,
      mining: W.mining
        ? Object.freeze({ ...provenance, contactId: `shot:${this.game.features.mining.shotId()}` })
        : null,
      captain: provenance.captain,
      x: ox,
      y: oy,
      vx: entity.vx * (weapon.homing ? 0.3 : 1) + Math.sin(ang) * sp,
      vy: entity.vy * (weapon.homing ? 0.3 : 1) - Math.cos(ang) * sp,
      life: weapon.life,
      w: g.w,
      p: weapon,
      owner: entity.id,
      target: weapon.homing ? t : null,
      dmgA: weapon.dmgA * dm,
      dmgS: weapon.dmgS * dm,
      pd: 0,
    });
    this.sound(entity, g);
  }
  /**
   * Emits a weapon discharge sound effect event, rate-limited to avoid audio flood.
   * @param {Entity} entity Firing ship entity.
   * @param {WeaponMount} g Weapon mount producing sound.
   * @returns {void}
   */
  sound(entity, g) {
    if (this.t - g.sndT > 0.12) {
      g.sndT = this.t;
      this.events.push(['snd', g.snd, Math.round(entity.x), Math.round(entity.y)]);
    }
  }
  /**
   * Performs raycast collision check for instant-hit continuous beam lasers against ships.
   * @param {Entity} entity Firing ship entity.
   * @param {number} ang Beam trajectory heading in radians.
   * @param {number} len Maximum beam range.
   * @returns {{s: Entity, d: number, x: number, y: number} | null} Hit ship and intersection point, or null.
   */
  ray(entity, ang, len) {
    const dx = Math.sin(ang),
      dy = -Math.cos(ang);
    let best = null;
    for (const s of this.ships.values()) {
      if (s === entity || s.state !== 'fly' || !this.canHit(entity, s)) continue;
      const rx = s.x - entity.x,
        ry = s.y - entity.y,
        along = rx * dx + ry * dy;
      if (along < 0 || along > len) continue;
      const perp = Math.abs(rx * dy - ry * dx),
        r = Math.max(10, s.st.size * 0.32);
      if (perp < r && (!best || along < best.d))
        best = { s, d: along, x: entity.x + dx * along, y: entity.y + dy * along };
    }
    return best;
  }
  /**
   * Performs raycast collision check for mining laser beams against asteroid rocks.
   * @param {Entity} entity Firing ship entity.
   * @param {number} ang Beam trajectory heading in radians.
   * @param {number} len Maximum beam range.
   * @returns {{k: Rock, d: number, x:number, y:number} | null} Hit rock and distance, or null.
   */
  rayRock(entity, ang, len) {
    const dx = Math.sin(ang),
      dy = -Math.cos(ang);
    let best = null;
    for (const k of this.rocks) {
      if (k.down) continue;
      const rx = k.x - entity.x,
        ry = k.y - entity.y,
        along = rx * dx + ry * dy;
      if (along < -k.r || along > len + k.r) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < k.r) {
        const d = Math.max(0, along - Math.sqrt(k.r * k.r - perp * perp));
        if (d <= len && (!best || d < best.d))
          best = { k, d, x: entity.x + dx * d, y: entity.y + dy * d };
      }
    }
    return best;
  }
  // 2.1: a captain's fighter bays work as a toggle on F: tap to launch every drone, tap again to call them all home
  /**
   * Toggles carrier fighter bays: launches all bay drones, or recalls active drones to dock.
   * @param {Entity} entity Carrier ship entity.
   * @returns {void}
   */
  toggleDrones(entity) {
    const out = [...this.ships.values()].filter((s) => s.fighterOf === entity.id && !s.dead);
    const say = (m) => {
      if (entity.player && entity.player.s && this.game.toast) this.game.toast(entity.player.s, m);
    };
    if (out.some((f) => !f.recall)) {
      for (const f of out) {
        f.recall = true;
        f.target = null;
      }
      say(`Drones recalled (${out.length}). Tap F to launch them again.`);
      return;
    }
    let n = 0;
    for (const g of entity.guns) {
      if (!g.p.bay) continue;
      const W = this.A.weapons[g.w],
        launch = W && W.launch;
      if (!launch || !this.A.ships[launch]) continue;
      const cap = Math.min(6, g.n * 4);
      while (
        g.ammo > 0 &&
        [...this.ships.values()].filter((s) => s.fighterOf === entity.id).length < cap
      ) {
        const a = entity.a + (n % 2 ? 1 : -1) * (0.6 + 0.25 * n),
          f = this.makeShip({
            hull: launch,
            faction: entity.faction,
            x: entity.x + Math.sin(a) * 30,
            y: entity.y - Math.cos(a) * 30,
            a,
            vx: entity.vx + Math.sin(a) * 60,
            vy: entity.vy - Math.cos(a) * 60,
            ai: 'escort',
            owner: entity.id,
          });
        f.fighterOf = entity.id;
        f.life = 1e9;
        if (g.ammo !== Infinity) g.ammo--;
        n++;
      }
      if (n) this.sound(entity, g);
    }
    say(n ? `Drones launched (${n}). Tap F to recall them.` : 'No drones left in the bays.');
  }
  /**
   * Evaluates weapon mount cooldowns, target alignment, point defense, and triggers firing.
   * @param {Entity} entity Ship entity updating weapons.
   * @returns {void}
   */
  weapons(entity) {
    const inp = entity.inp || {},
      automated = entity.autoCombat || (entity.owner && this.root(entity).sharedCombat),
      t = entity.autoCombat
        ? entity.combatTarget
        : entity.player
          ? entity.target && this.ships.get(entity.target.id)
            ? entity.target
            : null
          : entity.fireAt;
    if (t && !entity.player && !this.canAcquire(entity, t)) {
      entity.fireAt = null;
      return;
    }
    if (entity.player && !automated) {
      const f2 = inp.fire2 ? 1 : 0;
      if (f2 && !entity._f2 && entity.guns.some((g) => g.p.bay)) this.toggleDrones(entity);
      entity._f2 = f2;
    }
    for (const g of entity.guns) {
      g.cd -= DT;
      if (g.cd > 0 || g.ammo <= 0) continue;
      const weapon = g.p;
      if (weapon.pd) {
        // point defense: shoot down missiles and fighters
        let best = null,
          bd = weapon.range;
        for (const s of this.shots) {
          if (!s.target || !s.p.homing) continue;
          const o = this.ships.get(s.owner);
          if (!o || !this.isHostile(entity, o)) continue;
          const d = Math.hypot(s.x - entity.x, s.y - entity.y);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        if (best) {
          if (Math.random() < 0.35) {
            best.life = 0;
            this.events.push(['hit', Math.round(best.x), Math.round(best.y), g.w]);
          }
          this.fire(entity, g, null, angleTo(entity, best.x, best.y));
          continue;
        }
        const f = [...this.ships.values()].find(
          (s) =>
            s.fighterOf &&
            this.isHostile(entity, s) &&
            this.canAcquire(entity, s) &&
            Math.hypot(s.x - entity.x, s.y - entity.y) < weapon.range,
        );
        if (f) this.fire(entity, g, f, angleTo(entity, f.x, f.y));
        continue;
      }
      if (automated && g.sec) continue;
      if (automated && (!t || !this.game.combatAssist.valid(this, this.root(entity), t))) continue;
      if (weapon.bay && entity.player) continue; // 2.1: bays launch and recall on a tap of F (toggleDrones)
      const wantFire = entity.autoCombat
        ? !!t
        : entity.player
          ? g.sec
            ? inp.fire2
            : inp.fire1
          : !!t;
      if (!wantFire) continue;
      // Manual mining uses the existing aim/heading, independently of combat selection.
      // Other weapons and delegated combat keep their targeting/leading behavior.
      const tgt =
        entity.player && !automated && this.A.weapons[g.w]?.mining ? null : t && !t.dead ? t : null;
      if (weapon.bay || weapon.homing) {
        if (tgt || !weapon.homing) this.fire(entity, g, tgt, entity.a);
        continue;
      }
      if (tgt) {
        const d = Math.hypot(tgt.x - entity.x, tgt.y - entity.y);
        if ((!entity.player || automated) && d > weapon.range * 1.05) continue;
        const tt = weapon.beam ? 0 : d / weapon.speed;
        const aim = angleTo(
          entity,
          tgt.x + (tgt.vx - entity.vx) * tt,
          tgt.y + (tgt.vy - entity.vy) * tt,
        );
        if (weapon.turret) {
          if (d < weapon.range * 1.1 || (entity.player && !automated))
            this.fire(entity, g, tgt, aim);
          continue;
        }
        if (weapon.arc && Math.abs(angDiff(aim, entity.a)) < weapon.arc) {
          this.fire(entity, g, tgt, aim);
          continue;
        }
        if ((!entity.player || automated) && Math.abs(angDiff(aim, entity.a)) > 0.18) continue;
      } else if (!entity.player) continue;
      this.fire(entity, g, tgt, entity.a);
    }
  }
  /**
   * Applies armor and shield damage to a ship, resolving role multipliers and kill thresholds.
   * @param {Entity} entity Ship entity receiving damage.
   * @param {number} dA Base armor / hull damage.
   * @param {number} dS Base shield damage.
   * @param {Entity | null} [src] Attacker entity source.
   * @param {boolean} [ion] Whether weapon inflicts ion damage.
   * @returns {[number, number, number] | void} Tuple [damageDealt, hitShieldsFlag, shooterRootId].
   */
  damage(entity, dA, dS, src, ion) {
    if (entity.industrialRoot) return [0, 0, src?.id || 0]; // Utility collectors cannot tank combat or grant rewards.
    if (
      src &&
      (src.miningEncounter || entity.miningEncounter) &&
      this.game.features.pressure.allow(this, src, entity) === false
    )
      return;
    if (entity.dead) return;
    const srcRoot = src ? this.root(src) : null;
    if (src && src.role && entity.role) {
      const rm = roleMult(src.role, entity.role);
      dA *= rm;
      dS *= rm;
    } // the class triangle
    if (src && this.game.features.specialists.specMult) {
      const sm = this.game.features.specialists.specMult(this.root(src), src, entity);
      dA *= sm;
      dS *= sm;
    } // specialty ships
    const sh0 = entity.shield,
      ar0 = entity.armor,
      hadShield = entity.shield > 0;
    if (entity.shield > 0) {
      entity.shield -= dS;
      if (entity.shield < 0) {
        entity.armor += entity.shield * (dA / Math.max(1, dS)) * 0.5;
        entity.shield = 0;
      }
    } else entity.armor -= dA;
    entity.hitT = this.t;
    if (src) entity.lastHitBy = src.id;
    const done = Math.max(0, sh0 - entity.shield) + Math.max(0, ar0 - entity.armor);
    // Incidental NPC fire does not make an overlooked captain's wing initiate
    // retaliation and thereby attract the entire faction. Deliberate outgoing
    // damage still creates normal visit-local hostility and reputation costs.
    if (done > 0 && srcRoot && srcRoot !== this.root(entity) && !this.newcomerTruce(src, entity)) {
      const victim = this.root(entity),
        first = !victim.aggro.has(srcRoot.id);
      if (srcRoot.player?.s && !victim.player && !this.sys.arena)
        this.beginVisit(srcRoot.player.s).factions.add(victim.faction);
      victim.aggro.add(srcRoot.id);
      if (!entity.player && !entity.target && entity.ai !== 'flee') entity.target = srcRoot;
      if (first && !entity.owner) this.callHelp(entity, srcRoot);
    }
    if (srcRoot && srcRoot.player && !entity.player) this.game.onHit(srcRoot.player, entity, this);
    if (entity.boss) this.game.features.fronts.onBossDamage(entity, srcRoot, done);
    if (
      srcRoot &&
      srcRoot.player &&
      this.root(entity).player &&
      !this.sys.arena &&
      this.game.features.coop.duelHit &&
      this.game.features.coop.duelHit(srcRoot, entity, this)
    )
      return [done, hadShield ? 1 : 0, srcRoot.id]; // 2.6: a duel stops at disabled
    if (
      entity.armor <= 0 &&
      entity.player &&
      this.game.features.coop.rescueHold &&
      this.game.features.coop.rescueHold(entity, srcRoot, this)
    )
      return [done, hadShield ? 1 : 0, srcRoot ? srcRoot.id : 0]; // 2.6: an Armada can rescue a downed captain
    if (entity.armor <= 0) this.kill(entity, srcRoot);
    return [done, hadShield ? 1 : 0, srcRoot ? srcRoot.id : 0];
  }
  // hit event: x, y, weapon, target id, damage dealt, shooter (root) id, 1 if it hit shields
  /**
   * Emits a hit event packet for client particle effects and damage numbers.
   * @param {number} x Hit position X.
   * @param {number} y Hit position Y.
   * @param {number} w Weapon ID that scored the hit.
   * @param {Entity} entity Target ship entity.
   * @param {[number, number, number]} r Damage outcome tuple.
   * @returns {void}
   */
  hitEv(x, y, w, entity, r) {
    this.events.push([
      'hit',
      Math.round(x),
      Math.round(y),
      w,
      entity.id,
      Math.round(r[0]),
      r[2],
      r[1],
    ]);
  }
  /**
   * Destroys a ship entity, triggering explosions, bounty rewards, death handling, and salvage drop.
   * @param {Entity} entity Ship entity destroyed.
   * @param {Entity | null} [by] Killer root entity, if any.
   * @returns {void}
   */
  kill(entity, by) {
    this.events.push(['boom', Math.round(entity.x), Math.round(entity.y), entity.st.size]);
    this.remove(entity);
    for (const f of this.ships.values()) if (f.fighterOf === entity.id) f.ai = 'leave';
    if (entity.player) {
      this.game.onPlayerDeath(entity.player, this, by);
      return;
    }
    if (entity.industrialRoot) return; // No farmable salvage, bounty or replacement ammo.
    if (entity.boss) this.game.features.fronts.onBossKilled(entity, this);
    if (entity.convoyOf) this.game.features.fronts.onConvoyLost(entity);
    if (entity.wingUid && this.game.features.docks.onWingLost)
      this.game.features.docks.onWingLost(entity); // 2.1
    if (entity.wave) this.game.features.frontier.onWaveKill(entity);
    if (this.game.features.hostile.maybeChest)
      this.game.features.hostile.maybeChest(this, entity, by);
    if (by && by.player)
      this.game.onKill(by.player, entity, this, entity.lastHitBy && entity.lastHitBy !== by.id);
    if (!entity.fighterOf && Math.random() < (by && by.hull === 810 ? 0.82 : 0.55))
      this.dropLoot(entity);
  }
  /**
   * Spawns floating credit canisters and material salvage crates at destroyed ship's position.
   * @param {Entity} entity Destroyed ship entity.
   * @returns {void}
   */
  dropLoot(entity) {
    const str = entity.strength || 10,
      items = [];
    items.push({ credits: Math.round(str * rnd(15, 40)) });
    if (Math.random() < 0.35)
      items.push({
        mat: pick(MATERIALS),
        grade: Math.min(4, Math.floor(Math.random() * (1 + str / 300))),
      });
    for (const it of items)
      this.loot.push({
        id: NEXT++,
        x: entity.x + rnd(-30, 30),
        y: entity.y + rnd(-30, 30),
        vx: entity.vx * 0.3 + rnd(-20, 20),
        vy: entity.vy * 0.3 + rnd(-20, 20),
        it,
        t: this.t,
        kind: it.mat ? 1 : 0,
      });
  }

  // ------------------------------------------------------------------ tick
  /**
   * Advances the simulation by one discrete timestep: moves entities, checks collisions, updates weapons and loot.
   * @returns {void}
   */
  tick() {
    this.t += DT;
    if (!this.m || ++this.mT % 30 === 0) {
      this.m = this.game.features.fronts.mods ? this.game.features.fronts.mods(this.id) : null;
      this.mT = this.mT || 1;
    }
    const S = this.sys;
    if (this.players > 0 && !this.sys.arena) {
      this.spawnT -= DT;
      const SX = this.game.features.living.stateOf && this.game.features.living.stateOf(this.id),
        tm = SX ? STATES[SX.kind].traders || 1 : 1;
      const want = Math.min(
        28,
        (6 + this.ports().length * 2 + S.stellars.length * 0.5 + S.danger * 1.5) * tm,
      ); // 2.3: more traffic everywhere; 2.4: booms and festivals bring more
      const npcs = [...this.ships.values()].filter((e) => !e.player && !e.owner).length;
      if (this.spawnT <= 0) {
        this.spawnT = rnd(2, 5);
        if (npcs < want) this.spawnTraffic(false);
      }
    }
    this.game.combatAssist?.resolve(this);
    const formations = formationTargets(this);
    for (const e of this.ships.values()) {
      if (e.towCap && e.player) {
        formations.delete(e.id);
        e.catchup = null;
        if (e.autoCombat) this.game.combatAssist.stop(e.player.s, 'Towing requires manual flight');
        if (e.state === 'jumpout') e.state = 'fly';
      }
      if (e.state === 'jumpout') {
        e.jumpT -= DT;
        const sp = e.st.maxSpeed * 3;
        e.vx = Math.sin(e.a) * sp;
        e.vy = -Math.cos(e.a) * sp;
        e.x += e.vx * DT;
        e.y += e.vy * DT;
        if (e.jumpT <= 0) this.game.finishJump(e, this);
        continue;
      }
      if (e.industrialRoot) continue; // Industrial controller owns noncombat movement/collection.
      if (e.player) {
        const q = e.player.inputs;
        const inp = q.length ? q.shift() : e.player.lastInput;
        if (inp) {
          e.player.lastInput = inp;
          e.inp = inp;
          e.seq = inp.seq;
          if (inp.navigation) {
            formations.delete(e.id);
            e.player.s.armadaFormationTarget = null;
          }
          if (
            formations.has(e.id) &&
            !inp.navigation &&
            (inp.thrust || inp.turn || inp.ab || inp.rev || inp.fire1 || inp.fire2)
          ) {
            cancelFormation(this.game, e.player.s, 'manual flight or weapons input');
            formations.delete(e.id);
          }
        }
      } else this.ai(e);
      if (formations.has(e.id) && !e.autoCombat) steerFormation(e, formations.get(e.id));
      if (e.player && e.autoCombat) {
        e.inp = {};
        e.fireAt = null;
        if (this.game.combatAssist.valid(this, e, e.combatTarget)) {
          this.fight(e, e.combatTarget);
          e.inp.fire1 = 1;
        }
      }
      if (e.player && e.autoCombat && !this.game.combatAssist.valid(this, e, e.combatTarget))
        e.inp = {};
      const st = e.catchup
        ? {
            ...e.st,
            maxSpeed: Math.max(e.st.maxSpeed, e.catchup.maxSpeed * 1.15),
            accel: Math.max(e.st.accel, e.catchup.accel * 1.1),
            turn: Math.max(e.st.turn, e.catchup.turn),
          }
        : e.st;
      step(e, st, e.disabled ? {} : e.inp);
      e.shield = Math.min(
        e.st.shield,
        e.shield +
          e.st.shieldRe *
            DT *
            (this.t - (e.hitT || -9) > 2 ? 1 : 0.4) *
            (this.m ? this.m.shieldRe : 1) *
            (e.coopRe || 1),
      ); // 2.6: coopRe is the Armada buff
      const radiation = eventideDrain(this.sys, e, Date.now() / 1000);
      if (radiation) e.shield = Math.max(0, e.shield - radiation * DT);
      if (e.st.armorRe) e.armor = Math.min(e.st.armor, e.armor + e.st.armorRe * DT);
      if (e.st.fuelRe) e.fuel = Math.min(e.st.fuel, e.fuel + e.st.fuelRe * DT);
      if (!e.disabled) this.weapons(e);
      if (e.wormExit) {
        const mouth = this.sys.stellars.find((stellarBody) => stellarBody.id === e.wormExit);
        if (!mouth || Math.hypot(mouth.x - e.x, mouth.y - e.y) > mouth.r * 0.65)
          e.wormExit = undefined;
      }
      if (e.player && e.state === 'fly' && this.sys.gate && !e.wormExit && !(e.wormT > this.t))
        for (const stellarBody of this.sys.stellars)
          if (
            stellarBody.wormhole &&
            !e.towCap &&
            Math.hypot(stellarBody.x - e.x, stellarBody.y - e.y) < stellarBody.r * 0.5
          ) {
            this.game.wormholeTransit(e, this, stellarBody);
            break;
          }
    }
    for (const s of this.shots) {
      if (s.target && !s.target.dead) {
        const want = angleTo(s, s.target.x, s.target.y),
          cur = Math.atan2(s.vx, -s.vy),
          d = angDiff(want, cur),
          sp = Math.hypot(s.vx, s.vy);
        const na = cur + Math.max(-3 * DT, Math.min(3 * DT, d));
        s.vx = Math.sin(na) * sp;
        s.vy = -Math.cos(na) * sp;
      }
      s.x += s.vx * DT;
      s.y += s.vy * DT;
      s.life -= DT;
      if (s.life <= 0) continue;
      const owner = this.ships.get(s.owner);
      for (const e of this.ships.values()) {
        if (e.industrialRoot || e.id === s.owner || e.state !== 'fly') continue;
        if (
          s.miningEncounter &&
          !this.game.features.pressure.shotAllowed(this, s.miningEncounter, e)
        )
          continue;
        if (owner ? !this.canHit(owner, e) : false) continue;
        const r = Math.max(9, e.st.size * 0.32);
        if (
          Math.abs(e.x - s.x) < r &&
          Math.abs(e.y - s.y) < r &&
          Math.hypot(e.x - s.x, e.y - s.y) < r
        ) {
          const r = this.damage(e, s.dmgA, s.dmgS, owner || null, s.p.ion);
          s.life = 0;
          this.hitEv(s.x, s.y, s.w, e, r);
          if (s.p.blast) this.events.push(['blast', Math.round(s.x), Math.round(s.y), s.p.blast]);
          if (s.p.blast)
            for (const o of this.ships.values())
              if (
                o !== e &&
                owner &&
                (!s.miningEncounter ||
                  this.game.features.pressure.shotAllowed(this, s.miningEncounter, o)) &&
                this.canHit(owner, o) &&
                Math.hypot(o.x - s.x, o.y - s.y) < s.p.blast
              )
                this.damage(o, s.dmgA * 0.5, s.dmgS * 0.5, owner);
          break;
        }
      }
      if (s.life > 0 && this.rocks.length) {
        const k = this.rockAt(s.x, s.y);
        if (k) {
          if (s.mining)
            this.game.features.mining.contact(this, k, {
              source: s.mining,
              damage: s.dmgA + s.dmgS * 0.3,
              x: s.x,
              y: s.y,
              projectile: true,
            });
          else this.hitRock(k, s.dmgA + s.dmgS * 0.3, false, s.captain);
          s.life = 0;
          this.events.push(['hit', Math.round(s.x), Math.round(s.y), s.w]);
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    this.beams = this.beams.filter((b) => b.until > this.t && this.ships.has(b.id));
    this.game.features.towing.towingTick(this);
    if ([...this.ships.values()].some((e) => e.player && e.hull === 815))
      this.game.features.industrial.industrialTick(this, DT);
    this.game.features.mining.endTick(this);
    this.game.features.pressure.pressureTick(this);
    for (const l of this.loot) {
      l.x += l.vx * DT;
      l.y += l.vy * DT;
      l.vx *= 0.99;
      l.vy *= 0.99;
    }
    this.loot = this.loot.filter((l) => l.it.generationKey || this.t - l.t < (l.it.ore ? 150 : 90));
    for (const e of this.ships.values())
      if (e.player && e.state === 'fly') {
        const reach = Math.max(30, e.st.size * 0.5) * (e.hull === 810 ? 4 : 1); // the Tidecaller's tractor tentacles
        for (const l of this.loot)
          if (!l.taken && Math.hypot(l.x - e.x, l.y - e.y) < reach) {
            if (this.game.onLoot(e.player, l.it) === false) continue;
            l.taken = true;
            this.events.push(['pickup', l.id]);
          }
      }
    this.loot = this.loot.filter((l) => !l.taken);
  }
  /**
   * Compiles compact network snapshot of all ships, shots, beams, and loot in this system.
   * @returns {SpaceSnapshot} Serialized system state payload.
   */
  snapshot() {
    const ships = [];
    for (const e of this.ships.values()) {
      const fl =
        (e.inp && e.inp.thrust ? 1 : 0) |
        (e.inp && e.inp.ab ? 2 : 0) |
        (e.disabled ? 4 : 0) |
        (e.state === 'jumpout' ? 8 : 0) |
        (e.player ? 16 : 0) |
        (e.elite ? 32 : 0) |
        (e.rival ? 64 : 0);
      ships.push([
        e.id,
        e.hull,
        Math.round(e.x),
        Math.round(e.y),
        Math.round(e.a * 1000),
        Math.round(e.vx),
        Math.round(e.vy),
        fl,
        Math.round((100 * e.shield) / Math.max(1, e.st.shield)),
        Math.round((100 * e.armor) / Math.max(1, e.st.armor)),
        FAC.indexOf(e.faction),
        e.player
          ? (this.sys.arena ? `${e.team === 'A' ? 'Azure' : 'Crimson'} · ` : '') + e.player.name
          : e.name || null,
        e.owner || 0,
        e.pw || 0,
      ]);
    }
    const shots = this.shots.map((s) => [
      Math.round(s.x),
      Math.round(s.y),
      Math.round(s.vx),
      Math.round(s.vy),
      s.w,
    ]);
    const beams = this.beams.map((b) => [b.id, Math.round(b.a * 1000), Math.round(b.len), b.w]);
    const loot = this.loot.map((l) => [l.id, Math.round(l.x), Math.round(l.y), l.kind]);
    const ev = this.events;
    this.events = [];
    return { ships, shots, beams, loot, ev };
  }
}
