import type { IndexFleetCapabilities } from './story-faction-contracts.ts';
export type { IndexFleetCapabilities } from './story-faction-contracts.ts';
import type { Entity, Space, LootItem } from './space.ts';
import { DT, makeLoadout, shipStats } from '../shared/rules.ts';
import { INDEX_FLEET_TYPES, INDEX_FLEET_LIMITS } from '../shared/index-fleet.ts';
import { SYS } from '../shared/galaxy.ts';

/** A machine's logical identity is stable across forms, splits and reloads. */
export interface IndexFleetActor {
  /** Current visual hull; changing it does not replace this actor. */
  hull: number;
  /** Original role, independent of its deployed form. */
  base: number;
  /** Living health is saved without free healing on unload. */
  armor: number;
  shield: number;
  /** Saved local coordinates avoid teleporting through a dock on reload. */
  x: number;
  y: number;
  /** Destroyed identities cannot return during this encounter. */
  dead: boolean;
  /** Split Tridents remain logically alive but are not rendered. */
  hidden: boolean;
  /** Parent slot, never a transient simulation ID. */
  parent?: number;
  /** True for the three physical pieces of one Trident. */
  blade?: boolean;
  /** Original blade identities, including destroyed ones. */
  pieces?: number[];
  /** Form transition deadline on the persisted simulation clock. */
  transition?: { hull: number; until: number };
  /** Ability/form cooldowns survive unloading. */
  readyAt: number;
  /** Last deliberate damage, controlling safe recovery. */
  hitAt: number;
  /** Finite children born to this logical parent. */
  launched: number;
}
/** One bounded group per system; no global conquest or wall-clock spread. */
export interface IndexFleetWorld {
  /** Stable save roster, including dead drones and blades. */
  actors: IndexFleetActor[];
  /** Finite encounter-wide replacements, unaffected by form changes. */
  remaining: number;
  /** Direct attackers are recorded per captain, not per Armada. */
  offenders: Record<string, number>;
  /** Existing mining warnings identify one exact rock. */
  warnings: Record<string, { rock: number; at: number }>;
  /** Acquisition is limited to a small marked worksite, outside docking lanes. */
  site: { x: number; y: number };
  /** Claimed rock identity, not a whole asteroid field. */
  claim?: number;
  /** Exact finite generation identity of the marked rock. */
  claimKey?: string;
  /** One finite local reboot, not repeated Kernel stun farming. */
  kernelLost: boolean;
  rebootUntil: number;
  /** Rest after the group is destroyed; reconnect cannot refill it. */
  dormantUntil: number;
  /** Extraction uses one finite shared mining owner. */
  extractAt: number;
  /** Talon immunity is keyed by captain, not a replaced ship entity. */
  holdImmunity: Record<string, number>;
}
/** Game remains the storage and economy authority. */

interface FleetLocal {
  /** Runtime IDs mapped back to their saved slots. */
  entities: Map<number, number>;
  /** One notice per arriving captain. */
  notified: Set<string>;
  /** Short Talon holds are never persisted across jumps or reloads. */
  holds: Map<number, { source: number; until: number; thrust: number }>;
  /** Last periodic save/extraction update. */
  savedAt: number;
  /** Unique local negative loot identifiers. */
  lootId: number;
}
const locals = new WeakMap<Space, FleetLocal>();
function local(space: Space): FleetLocal {
  let result = locals.get(space);
  if (!result) {
    result = {
      entities: new Map(),
      notified: new Set(),
      holds: new Map(),
      savedAt: -1,
      lootId: -2000000,
    };
    locals.set(space, result);
  }
  return result;
}
function saved(capabilities: IndexFleetCapabilities, space: Space): IndexFleetWorld | undefined {
  return capabilities.fleets()[space.id];
}
function state(
  capabilities: IndexFleetCapabilities,
  space: Space,
  entity: Entity,
): IndexFleetActor | undefined {
  const slot = local(space).entities.get(entity.id);
  return slot === undefined ? undefined : saved(capabilities, space)?.actors[slot];
}
function live(space: Space): Entity[] {
  return [...space.ships.values()].filter(
    (entity) => local(space).entities.has(entity.id) && !entity.dead,
  );
}
function entityFor(space: Space, slot: number): Entity | undefined {
  for (const [id, index] of local(space).entities) if (index === slot) return space.ships.get(id);
}
function near(world: IndexFleetWorld, entity: Entity): boolean {
  return Math.hypot(entity.x - world.site.x, entity.y - world.site.y) <= INDEX_FLEET_LIMITS.radius;
}
function tell(
  capabilities: IndexFleetCapabilities,
  space: Space,
  entity: Entity,
  text: string,
): void {
  const session = space.root(entity).player?.s;
  if (session) capabilities.toast(session, text);
}
/** Reserve the largest posture, including the diagonal of the rendered 1.25× hull. */
function footprint(space: Space, actor: IndexFleetActor): number {
  const forms =
    actor.base === 912
      ? [912, 913]
      : actor.base === 919
        ? [919, 920]
        : actor.base === 921
          ? [921, 922]
          : actor.base === 923
            ? [923, 924]
            : [actor.hull];
  return Math.max(...forms.map((hull) => space.A.ships[hull].size));
}

/** Saved roster slots, rather than wire IDs, own non-overlapping neutral berths. */
function formationPoint(
  space: Space,
  world: IndexFleetWorld,
  slot: number,
): { x: number; y: number } {
  const actor = world.actors[slot];
  if (actor.parent !== undefined) {
    const parent = world.actors[actor.parent];
    const center = formationPoint(space, world, actor.parent);
    const siblings = world.actors.filter(
      (candidate) => candidate.parent === actor.parent && !candidate.dead && !candidate.hidden,
    );
    const angle =
      (Math.PI * 2 * Math.max(0, siblings.indexOf(actor))) / Math.max(6, siblings.length);
    const radius = footprint(space, parent) + footprint(space, actor) + 120;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  }
  // Retain vacant parent berths after losses; survivors do not collapse toward the site.
  const parents = world.actors.filter((candidate) => candidate.parent === undefined);
  const angle = -Math.PI * 0.75 + (Math.PI * 2 * parents.indexOf(actor)) / parents.length;
  const widest = Math.max(...parents.map((parent) => footprint(space, parent)));
  const radius = Math.max(
    800,
    (widest * 2 + 180) / (2 * Math.sin(Math.PI / Math.max(2, parents.length))),
  );
  return { x: world.site.x + Math.cos(angle) * radius, y: world.site.y + Math.sin(angle) * radius };
}

/** Keep neutral machine hull envelopes apart after actual movement, never moving players. */
function separateNeutralMachines(space: Space, world: IndexFleetWorld): boolean {
  const machines = live(space).filter((entity) => !entity.target);
  let changed = false;
  for (let pass = 0; pass < 2; pass++) {
    for (let leftIndex = 0; leftIndex < machines.length; leftIndex++) {
      const left = machines[leftIndex];
      const leftSlot = local(space).entities.get(left.id)!;
      for (let rightIndex = leftIndex + 1; rightIndex < machines.length; rightIndex++) {
        const right = machines[rightIndex];
        const rightSlot = local(space).entities.get(right.id)!;
        const deltaX = right.x - left.x;
        const deltaY = right.y - left.y;
        const distance = Math.hypot(deltaX, deltaY);
        const clearance =
          footprint(space, world.actors[leftSlot]) + footprint(space, world.actors[rightSlot]) + 80;
        if (distance >= clearance) continue;
        const angle = (leftSlot + 1) * 2.399963229728653 + rightSlot;
        const normalX = distance ? deltaX / distance : Math.cos(angle);
        const normalY = distance ? deltaY / distance : Math.sin(angle);
        const correction = Math.min(12, (clearance - distance) / 2);
        left.x -= normalX * correction;
        left.y -= normalY * correction;
        right.x += normalX * correction;
        right.y += normalY * correction;
        const closing = (right.vx - left.vx) * normalX + (right.vy - left.vy) * normalY;
        if (closing < 0) {
          left.vx += (normalX * closing) / 2;
          left.vy += (normalY * closing) / 2;
          right.vx -= (normalX * closing) / 2;
          right.vy -= (normalY * closing) / 2;
        }
        changed = true;
      }
    }
  }
  return changed;
}

function createEntity(space: Space, actor: IndexFleetActor, slot: number): Entity {
  const entity = space.makeShip({
    loadout: makeLoadout(space.A, actor.hull),
    faction: 'index',
    ai: 'index-fleet',
    x: actor.x,
    y: actor.y,
    armor: actor.armor,
    shield: actor.shield,
    name: `Index ${space.A.ships[actor.hull].name}`,
  });
  entity.indexWorksite = true;
  entity.noDisable = true;
  local(space).entities.set(entity.id, slot);
  return entity;
}
function add(
  capabilities: IndexFleetCapabilities,
  space: Space,
  hull: number,
  parent?: number,
  blade = false,
): Entity | null {
  const world = saved(capabilities, space)!;
  if (live(space).length >= INDEX_FLEET_LIMITS.live) return null;
  if (parent !== undefined && !blade) {
    const roster = world.actors.filter(
      (actor) => actor.parent === parent && !actor.blade && !actor.dead,
    );
    if (roster.length >= INDEX_FLEET_LIMITS.drones || world.remaining <= 0) return null;
    world.remaining--;
  }
  const hullAsset = space.A.ships[hull];
  const actor: IndexFleetActor = {
    hull,
    base: hull,
    armor: hullAsset.armor,
    shield: hullAsset.shield,
    x: world.site.x + (world.actors.length % 5) * 150 - 300,
    y: world.site.y + Math.floor(world.actors.length / 5) * 120,
    dead: false,
    hidden: false,
    parent,
    blade,
    readyAt: capabilities.clock(),
    hitAt: -100,
    launched: 0,
  };
  const slot = world.actors.push(actor) - 1;
  const berth = formationPoint(space, world, slot);
  actor.x = berth.x;
  actor.y = berth.y;
  if (parent !== undefined && !blade) world.actors[parent].launched++;
  capabilities.touch();
  return createEntity(space, actor, slot);
}
function changeForm(
  capabilities: IndexFleetCapabilities,
  space: Space,
  entity: Entity,
  hull: number,
): void {
  const actor = state(capabilities, space, entity)!;
  const stats = shipStats(space.A, makeLoadout(space.A, hull))!;
  const armor = entity.armor;
  const shield = entity.shield;
  entity.hull = hull;
  entity.st = stats;
  entity.armor = Math.min(armor, stats.armor);
  entity.shield = Math.min(shield, stats.shield);
  for (const mount of entity.guns) mount.n = stats.weapons[mount.w] || 0;
  actor.hull = hull;
  actor.transition = undefined;
  actor.readyAt = capabilities.clock() + 12;
  space.events.push(['flash', Math.round(entity.x), Math.round(entity.y)]);
  capabilities.touch();
}
function transition(
  capabilities: IndexFleetCapabilities,
  space: Space,
  entity: Entity,
  hull: number,
): void {
  const actor = state(capabilities, space, entity)!;
  if (actor.transition || capabilities.clock() < actor.readyAt) return;
  actor.transition = { hull, until: capabilities.clock() + 2 };
  capabilities.touch();
}
function split(capabilities: IndexFleetCapabilities, space: Space, entity: Entity): void {
  const world = saved(capabilities, space)!;
  const actor = state(capabilities, space, entity)!;
  const slot = local(space).entities.get(entity.id)!;
  const survivors = actor.pieces
    ? actor.pieces.filter((piece) => !world.actors[piece].dead)
    : [0, 1, 2];
  if (live(space).length + survivors.length - 1 > INDEX_FLEET_LIMITS.live) return;
  actor.x = entity.x;
  actor.y = entity.y;
  actor.armor = entity.armor;
  actor.shield = entity.shield;
  if (!actor.pieces) {
    actor.pieces = [];
    for (let index = 0; index < 3; index++) {
      const blade = add(capabilities, space, 918, slot, true)!;
      actor.pieces.push(local(space).entities.get(blade.id)!);
    }
  }
  const pieces = actor.pieces.filter((piece) => !world.actors[piece].dead);
  for (const [index, piece] of pieces.entries()) {
    const fragment = world.actors[piece];
    fragment.hidden = false;
    fragment.armor = entity.armor / pieces.length;
    fragment.shield = entity.shield / pieces.length;
    fragment.x = entity.x + (index - 1) * 120;
    fragment.y = entity.y + 120;
    const blade = entityFor(space, piece) || createEntity(space, fragment, piece);
    blade.armor = fragment.armor;
    blade.shield = fragment.shield;
    blade.x = fragment.x;
    blade.y = fragment.y;
  }
  actor.hidden = true;
  actor.transition = undefined;
  actor.readyAt = capabilities.clock() + 12;
  space.remove(entity, 'flash');
  local(space).entities.delete(entity.id);
  capabilities.touch();
}
function rejoin(
  capabilities: IndexFleetCapabilities,
  space: Space,
  actor: IndexFleetActor,
  slot: number,
): void {
  const world = saved(capabilities, space)!;
  const pieces = (actor.pieces || []).filter((index) => !world.actors[index].dead);
  const fragments = pieces.map((index) => entityFor(space, index));
  if (
    !fragments.length ||
    fragments.some(
      (entity) =>
        !entity || entity.target || Math.hypot(entity.x - actor.x, entity.y - actor.y) > 200,
    )
  )
    return;
  actor.armor = fragments.reduce((sum, entity) => sum + entity!.armor, 0);
  actor.shield = fragments.reduce((sum, entity) => sum + entity!.shield, 0);
  actor.hidden = false;
  actor.readyAt = capabilities.clock() + 12;
  for (const index of pieces) {
    world.actors[index].hidden = true;
    const entity = entityFor(space, index)!;
    space.remove(entity, 'flash');
    local(space).entities.delete(entity.id);
  }
  createEntity(space, actor, slot);
  capabilities.touch();
}
/** Stable role distribution; the initial Glasswake group receives a Mutable. */
export function indexFleetType(system: string): number {
  if (system === 'glasswake') return 912;
  const systems = Object.values(SYS)
    .filter((star) => star.farside && star.id !== 'glasswake')
    .map((star) => star.id)
    .sort();
  return INDEX_FLEET_TYPES[(systems.indexOf(system) + 1) % INDEX_FLEET_TYPES.length];
}
export const IndexFleetOperations = {
  open(this: IndexFleetCapabilities, space: Space): void {
    if (
      !space.sys.farside ||
      ['table', 'quantum-rift', 'beyond-rift', 'founding-vigil'].includes(space.id) ||
      local(space).entities.size
    )
      return;
    let world = saved(this, space);
    if (world && world.dormantUntil > this.clock()) return;
    if (world && world.actors.every((actor) => actor.dead)) world = undefined;
    if (!world) {
      const safeRock = space.rocks.find((rock) =>
        space.sys.stellars.every(
          (stellar) =>
            !stellar.svc?.includes('L') ||
            Math.hypot(rock.x - stellar.x, rock.y - stellar.y) > stellar.r + 1400,
        ),
      );
      const site =
        space.id === 'glasswake'
          ? { x: 1300, y: 600 }
          : safeRock
            ? { x: safeRock.x, y: safeRock.y - 200 }
            : { x: 2600, y: 1800 };
      world = {
        actors: [],
        remaining: INDEX_FLEET_LIMITS.replacements,
        offenders: {},
        warnings: {},
        site,
        kernelLost: false,
        rebootUntil: 0,
        dormantUntil: 0,
        extractAt: this.clock() + 10,
        holdImmunity: {},
      };
      this.fleets()[space.id] = world;
      // Adopt the original worksite rather than spawning a second Quarry/Archive group.
      for (const entity of space.ships.values()) {
        if (!entity.indexWorksite || ![910, 911, 914, 915].includes(Number(entity.hull))) continue;
        const actor: IndexFleetActor = {
          hull: Number(entity.hull),
          base: Number(entity.hull),
          armor: entity.armor,
          shield: entity.shield,
          x: entity.x,
          y: entity.y,
          dead: false,
          hidden: false,
          readyAt: this.clock(),
          hitAt: -100,
          launched: 0,
        };
        local(space).entities.set(entity.id, world.actors.push(actor) - 1);
      }
      for (const entity of space.ships.values()) {
        if (!entity.indexParent || !local(space).entities.has(entity.id)) continue;
        const actor = state(this, space, entity)!;
        actor.parent = local(space).entities.get(entity.indexParent);
      }
      if (!world.actors.length) {
        for (const hull of [910, 911]) {
          const parent = add(this, space, hull)!;
          const slot = local(space).entities.get(parent.id)!;
          for (let count = 0; count < 2; count++) add(this, space, count ? 915 : 914, slot);
        }
      }
      add(this, space, 909);
      add(this, space, indexFleetType(space.id));
      // Only a newly issued roster takes fresh berths; saved encounters resume in place.
      for (const [slot, actor] of world.actors.entries()) {
        const entity = entityFor(space, slot);
        if (!entity) continue;
        const berth = formationPoint(space, world, slot);
        actor.x = entity.x = berth.x;
        actor.y = entity.y = berth.y;
      }
      this.touch();
      return;
    }
    // Restore saved forms, losses and budgets, adopting legacy worksite entities once.
    const candidates = [...space.ships.values()].filter((entity) => entity.indexWorksite);
    for (const [slot, actor] of world.actors.entries()) {
      if (actor.dead || actor.hidden) continue;
      const existing = candidates.find(
        (entity) => !local(space).entities.has(entity.id) && Number(entity.hull) === actor.hull,
      );
      if (existing) {
        existing.armor = actor.armor;
        existing.shield = actor.shield;
        existing.x = actor.x;
        existing.y = actor.y;
        local(space).entities.set(existing.id, slot);
      } else createEntity(space, actor, slot);
    }
    // A previously destroyed legacy actor cannot be revived by the old initializer.
    for (const entity of candidates)
      if (!local(space).entities.has(entity.id)) space.remove(entity);
  },
  allow(this: IndexFleetCapabilities, space: Space, left: Entity, right: Entity): boolean | null {
    if (!local(space).entities.has(left.id) && !local(space).entities.has(right.id)) return null;
    if (
      left.dead ||
      right.dead ||
      left === right ||
      (left.faction === 'index' && right.faction === 'index')
    )
      return false;
    const machine = local(space).entities.has(left.id) ? left : right;
    const visitor = space.root(machine === left ? right : left);
    const world = saved(this, space)!;
    const owner = this.key(visitor);
    return !!(
      owner &&
      near(world, visitor) &&
      ((world.offenders[owner] || 0) > this.clock() || this.provoked(space, visitor))
    );
  },
  /** Shared engine applies this before damage, not by healing the victim afterward. */
  damageScale(this: IndexFleetCapabilities, space: Space, entity: Entity): number {
    if (!state(this, space, entity)) return 1;
    return Number(entity.hull) === 913
      ? 0.65
      : Number(entity.hull) === 923
        ? 0.65
        : Number(entity.hull) === 924
          ? 1.25
          : 1;
  },
  damaged(
    this: IndexFleetCapabilities,
    space: Space,
    victim: Entity,
    source: Entity,
    done = 1,
  ): void {
    const actor = state(this, space, victim);
    if (!actor || !(done > 0)) return;
    actor.hitAt = this.clock();
    const owner = this.key(space.root(source));
    if (owner) saved(this, space)!.offenders[owner] = this.clock() + 45;
    if (actor.base === 912 && actor.hull === 912) transition(this, space, victim, 913);
    if (actor.base === 916 && !actor.hidden && !actor.transition && this.clock() >= actor.readyAt) {
      actor.transition = { hull: 918, until: this.clock() + 2 };
      tell(
        this,
        space,
        source,
        'Trident separating — 2 seconds. Three blades share one hull and salvage budget.',
      );
    }
    this.touch();
  },
  mining(this: IndexFleetCapabilities, space: Space, rock: number, visitor: Entity): void {
    const world = saved(this, space);
    const owner = this.key(space.root(visitor));
    if (!world || world.claim !== rock || !owner) return;
    const previous = world.warnings[owner];
    if (!previous || previous.rock !== rock || this.clock() - previous.at > 20) {
      world.warnings[owner] = { rock, at: this.clock() };
      tell(
        this,
        space,
        visitor,
        'Stop mining the marked Index rock. Continued extraction after 4 seconds draws defensive fire.',
      );
    } else if (this.clock() - previous.at >= 4) world.offenders[owner] = this.clock() + 45;
    this.touch();
  },
  /** Claimed parcels still require an explicit, contextual take action. */
  take(this: IndexFleetCapabilities, space: Space, visitor: Entity, item: LootItem): boolean {
    const owner = this.key(space.root(visitor));
    if (!owner || !item.indexClaim || !saved(this, space)) return false;
    saved(this, space)!.offenders[owner] = this.clock() + 45;
    item.indexClaim = false;
    item.indexTakenBy = owner;
    this.touch();
    return true;
  },
  ai(this: IndexFleetCapabilities, space: Space, entity: Entity): boolean {
    const actor = state(this, space, entity);
    if (!actor) return false;
    const world = saved(this, space)!;
    const now = this.clock();
    entity.inp = {};
    entity.fireAt = null;
    if (actor.parent !== undefined && !actor.blade && world.actors[actor.parent].dead) {
      actor.dead = true;
      space.remove(entity, 'flash');
      local(space).entities.delete(entity.id);
      this.touch();
      return true;
    }
    const targets = [...space.ships.values()].filter(
      (candidate) =>
        !candidate.dead &&
        candidate.state === 'fly' &&
        IndexFleetOperations.allow.call(this, space, entity, candidate),
    );
    entity.target =
      targets.sort(
        (left, right) =>
          Math.hypot(left.x - entity.x, left.y - entity.y) -
          Math.hypot(right.x - entity.x, right.y - entity.y),
      )[0] || null;
    const target = entity.target;
    const baseName = space.A.ships[entity.hull].name;
    entity.name = `Index ${baseName} · ${target ? 'defending marked work' : 'neutral survey'}`;
    if (world.rebootUntil > now) {
      entity.name = `Index reboot · ${Math.ceil(world.rebootUntil - now)}s`;
      entity.target = null;
      const berth = formationPoint(space, world, local(space).entities.get(entity.id)!);
      space.steer(entity, berth.x, berth.y, true);
      return true;
    }
    if (actor.transition) {
      entity.name = `Index ${baseName} · changing form ${Math.max(1, Math.ceil(actor.transition.until - now))}s`;
      if (now >= actor.transition.until) {
        if (actor.transition.hull === 918) {
          split(this, space, entity);
          return true;
        }
        if (
          actor.transition.hull === 920 &&
          [...space.ships.values()].some(
            (other) =>
              other !== entity &&
              !other.dead &&
              Math.hypot(other.x - entity.x, other.y - entity.y) < 260 + other.st.size,
          )
        ) {
          actor.transition.until = now + 1;
          return true;
        }
        changeForm(this, space, entity, actor.transition.hull);
      } else return true;
    }
    if (actor.base === 919) {
      if (target) {
        if (Number(entity.hull) === 920) transition(this, space, entity, 919);
        const berth = formationPoint(space, world, local(space).entities.get(entity.id)!);
        space.steer(entity, berth.x, berth.y, true);
      } else {
        if (Number(entity.hull) === 919) transition(this, space, entity, 920);
        const berth = formationPoint(space, world, local(space).entities.get(entity.id)!);
        space.steer(entity, berth.x, berth.y, true);
      }
      return true; // Mining emitters never become unannounced combat lasers.
    }
    if (actor.base === 923) {
      if (target && Number(entity.hull) === 923 && world.remaining > 0)
        transition(this, space, entity, 924);
      if (!target && Number(entity.hull) === 924 && now - actor.hitAt > 10)
        transition(this, space, entity, 923);
    }
    if (actor.base === 912 && !target && Number(entity.hull) === 913 && now - actor.hitAt > 10)
      transition(this, space, entity, 912);
    if (actor.base === 921) {
      const range = target ? Math.hypot(entity.x - target.x, entity.y - target.y) : Infinity;
      if (target && range < 430 && Number(entity.hull) === 921 && now >= actor.readyAt) {
        transition(this, space, entity, 922);
        tell(
          this,
          space,
          target,
          'Talon cage opening — 2 seconds. Leave 430 range or thrust to escape.',
        );
      }
      if (Number(entity.hull) === 922) {
        if (target && range < 430) {
          const owner = this.key(space.root(target))!;
          if ((world.holdImmunity[owner] || 0) <= now) {
            local(space).holds.set(target.id, { source: entity.id, until: now + 2, thrust: 0 });
            world.holdImmunity[owner] = now + 12;
            tell(
              this,
              space,
              target,
              'Talon hold — 2 seconds. Thrust for a second to escape; 10 seconds of immunity follows.',
            );
            this.touch();
          }
        }
        if (!target || range > 430 || now >= actor.readyAt) transition(this, space, entity, 921);
      }
    }
    if (target && actor.base !== 914) {
      space.fight(entity, target);
      entity.inp.fire1 = 1;
    } else {
      const berth = formationPoint(space, world, local(space).entities.get(entity.id)!);
      space.steer(entity, berth.x, berth.y, true);
      if (actor.base === 914) entity.target = null; // A neutral sampler scan cannot fire or trigger retaliation.
    }
    return true;
  },
  fleetTick(this: IndexFleetCapabilities, space: Space): void {
    IndexFleetOperations.open.call(this, space);
    const world = saved(this, space);
    if (!world) return;
    const now = this.clock();
    for (const entity of space.ships.values()) {
      const owner = this.key(space.root(entity));
      if (owner && near(world, entity) && !local(space).notified.has(owner)) {
        local(space).notified.add(owner);
        tell(
          this,
          space,
          entity,
          'Index worksite — transit and unmarked rocks are safe. Leave marked material alone.',
        );
      }
    }
    for (const [targetId, hold] of local(space).holds) {
      const target = space.ships.get(targetId);
      const source = space.ships.get(hold.source);
      if (
        !target ||
        !source ||
        target.dead ||
        source.dead ||
        target.state !== 'fly' ||
        hold.until <= now ||
        Math.hypot(target.x - source.x, target.y - source.y) > 500
      ) {
        local(space).holds.delete(targetId);
        continue;
      }
      if (target.inp.thrust || target.inp.ab) hold.thrust += DT;
      if (hold.thrust >= 1) {
        local(space).holds.delete(targetId);
        continue;
      }
      target.vx *= 1 - 0.7 * DT;
      target.vy *= 1 - 0.7 * DT;
    }
    if (separateNeutralMachines(space, world)) this.touch();
    for (const [slot, actor] of world.actors.entries()) {
      if (actor.dead) continue;
      if (actor.hidden) {
        if (actor.base === 916 && now >= actor.readyAt && now - actor.hitAt > 10)
          rejoin(this, space, actor, slot);
        continue;
      }
      const entity = entityFor(space, slot);
      if (!entity || entity.dead) continue;
      entity.indexState = [
        slot,
        actor.parent ?? -1,
        Math.max(0, Math.ceil(((actor.transition?.until || now) - now) * 1000)),
        actor.pieces
          ? actor.pieces.reduce(
              (mask, piece, index) => mask | (world.actors[piece].dead ? 0 : 1 << index),
              0,
            )
          : actor.blade && actor.parent !== undefined
            ? (world.actors[actor.parent].pieces || []).reduce(
                (mask, piece, index) => mask | (world.actors[piece].dead ? 0 : 1 << index),
                0,
              )
            : 0,
      ];
      actor.x = entity.x;
      actor.y = entity.y;
      actor.hull = Number(entity.hull);
      actor.armor = entity.armor;
      actor.shield = entity.shield;
      if (world.rebootUntil > now) continue;
      if (
        [910, 911, 912, 923].includes(actor.base) &&
        actor.readyAt <= now &&
        !actor.transition &&
        (actor.base !== 923 || Number(entity.hull) === 924)
      ) {
        const children = world.actors.filter(
          (child) => child.parent === slot && !child.blade && !child.dead,
        );
        if (children.length < 12 && actor.launched < 24 && world.remaining > 0) {
          const samplerLimit =
            actor.base === 910 ? 6 : actor.base === 911 ? 9 : actor.base === 912 ? 3 : 4;
          const hull =
            children.filter((child) => child.base === 914).length < samplerLimit ? 914 : 915;
          if (add(this, space, hull, slot)) {
            actor.readyAt = now + 8;
            entity.name += ' · launching drone';
          }
        }
      }
      if (actor.blade && actor.parent !== undefined) {
        const parent = world.actors[actor.parent];
        space.beams.push({
          id: entity.id,
          w: 128,
          a: Math.atan2(parent.x - entity.x, -(parent.y - entity.y)),
          len: Math.hypot(parent.x - entity.x, parent.y - entity.y),
          until: space.t + DT * 2,
        });
      }
    }
    if (
      space.id !== 'glasswake' &&
      now >= world.extractAt &&
      live(space).some((entity) => [910, 920].includes(Number(entity.hull)) && !entity.target)
    ) {
      world.extractAt = now + 1;
      if (world.claim === undefined) {
        const selected = this.virginRock(space, world.site);
        world.claim = selected?.id;
        world.claimKey = selected?.key;
      }
      const rock = space.rocks.find((candidate) => candidate.id === world.claim && !candidate.down);
      if (!rock) world.claim = undefined;
      if (rock && world.rebootUntil <= now) {
        const loom = live(space).find((entity) => Number(entity.hull) === 920 && !entity.target);
        const quarry = live(space).find((entity) => Number(entity.hull) === 910 && !entity.target);
        if (loom || quarry) {
          this.extract(space, rock, 12);
          for (let emitter = 0; loom && emitter < 6; emitter++)
            space.beams.push({
              id: loom.id,
              w: 128,
              a: Math.atan2(rock.x - loom.x, -(rock.y - loom.y)) + (emitter - 2.5) * 0.003,
              len: Math.hypot(rock.x - loom.x, rock.y - loom.y),
              until: space.t + 0.8,
            });
          for (const parcel of space.loot)
            if (
              parcel.it.generationKey === world.claimKey &&
              !!world.claimKey &&
              !parcel.it.indexTakenBy
            )
              parcel.it.indexClaim = true;
        }
      }
      this.touch();
    }
    if (local(space).savedAt !== Math.floor(now)) {
      local(space).savedAt = Math.floor(now);
      this.touch();
    }
  },
  /** All configurations and blades share a single modest salvage payout. */
  killed(
    this: IndexFleetCapabilities,
    space: Space,
    entity: Entity,
    killer?: Entity | null,
  ): boolean {
    const actor = state(this, space, entity);
    if (!actor) return false;
    const world = saved(this, space)!;
    actor.dead = true;
    if (actor.base === 916 && actor.pieces)
      for (const piece of actor.pieces) world.actors[piece].dead = true;
    actor.armor = 0;
    actor.shield = 0;
    local(space).entities.delete(entity.id);
    if (actor.base === 909 && !world.kernelLost) {
      world.kernelLost = true;
      world.rebootUntil = this.clock() + INDEX_FLEET_LIMITS.reboot;
      if (killer)
        tell(
          this,
          space,
          killer,
          'Kernel lost — local colossi reboot for 6 seconds. Existing drones withdraw; no healing or fresh launches.',
        );
    }
    let reward = actor.parent === undefined && !actor.blade;
    if (actor.blade && actor.parent !== undefined) {
      const parent = world.actors[actor.parent];
      parent.hitAt = this.clock();
      if (parent.pieces!.every((piece) => world.actors[piece].dead)) {
        parent.dead = true;
        reward = true;
      }
    }
    if (reward && killer && this.key(space.root(killer))) {
      space.loot.push({
        id: local(space).lootId--,
        x: entity.x,
        y: entity.y,
        vx: 0,
        vy: 0,
        it: { cargo: actor.base === 909 ? 'index_core' : 'index_parts', n: 1 },
        t: space.t,
        kind: 2,
      });
    }
    if (world.actors.every((candidate) => candidate.dead || candidate.hidden))
      world.dormantUntil = this.clock() + 600;
    this.touch();
    return true;
  },
};
