import type { Session } from './game.ts';
import type { GameStorage } from './game-storage.ts';
import type { Entity, Space, LootItem, Rock } from './space.ts';
import { INDEX_SITE } from '../shared/index.ts';
import { makeLoadout } from '../shared/rules.ts';

/** Persistent timers use the existing mining clock, which stops with simulation. */
export interface IndexWorld {
  /** One workgroup's remaining replacements; unloads do not replenish them. */
  replacements: number;
  /** Claimed rock identity persists across unloading. */
  claim?: number | null;
  /** Actors survive unload/restart without free healing or fresh drone budgets. */
  actors?: Array<{
    hull: number;
    parent: number | null;
    armor: number;
    shield: number;
    dead: boolean;
  }>;
  /** Captains responsible for disturbing the site, never their whole Armada. */
  offenders: Record<string, { until: number; warning: number; rock?: number }>;
  /** Destroyed groups do not immediately respawn on reconnect. */
  dormantUntil: number;
}
/** Live identities belong to the space and are discarded with it. */
export interface IndexWorksite {
  /** Quarry and Archive IDs. */
  parents: number[];
  /** Current marked rock, selected only before it has player activity. */
  claim: number | null;
  /** Next NPC extraction instant on the persisted logical clock. */
  extractAt: number;
  /** Captains already shown the approach notice on this visit. */
  notified: Set<number>;
  /** Countdown between finite replacement launches. */
  launchAt: number;
}
export interface IndexCapabilities {
  /** Current storage, including finite mining budgets and clock. */
  db: Pick<GameStorage, 'world' | 'key' | 'touch'>;
  /** Shared mining owner applies the finite rock allocation. */
  extract: (space: Space, rock: Rock, damage: number) => void;
  /** Current sessions, not a copied connection roster. */
  sessions: () => IterableIterator<Session>;
  /** Non-interrupting notices through the normal cockpit channel. */
  toast: (session: Session, text: string) => void;
}
function saved(capabilities: IndexCapabilities): IndexWorld {
  return (capabilities.db.world.indexWorksite ||= {
    replacements: 12,
    offenders: {},
    dormantUntil: 0,
  });
}
function clock(capabilities: IndexCapabilities): number {
  return capabilities.db.world.mining?.clock || 0;
}
function key(capabilities: IndexCapabilities, entity: Entity): string | null {
  return entity.player ? capabilities.db.key(entity.player.s.data.name) : null;
}
function near(entity: Entity): boolean {
  return Math.hypot(entity.x - INDEX_SITE.x, entity.y - INDEX_SITE.y) <= INDEX_SITE.radius;
}
function spawn(space: Space, hull: number, x: number, y: number, parent?: number): Entity {
  const entity = space.makeShip({
    loadout: makeLoadout(space.A, hull),
    faction: 'index',
    ai: 'index',
    x,
    y,
    name: `Index ${space.A.ships[hull].name} · marked worksite`,
  });
  entity.indexWorksite = true;
  entity.indexParent = parent;
  entity.noDisable = true;
  return entity;
}
function provoke(capabilities: IndexCapabilities, owner: string) {
  const offender = (saved(capabilities).offenders[owner] ||= { until: 0, warning: 0 });
  offender.until = clock(capabilities) + 45;
  capabilities.db.touch();
}
export const IndexOperations = {
  open(this: IndexCapabilities, space: Space): void {
    if (
      space.id !== INDEX_SITE.sys ||
      space.indexWorksite ||
      saved(this).dormantUntil > clock(this)
    )
      return;
    const previous = saved(this).actors;
    if (previous) {
      const entities = previous.map((actor) =>
        actor.dead ? null : spawn(space, actor.hull, INDEX_SITE.x, INDEX_SITE.y),
      );
      entities.forEach((entity, slot) => {
        if (!entity) return;
        const actor = previous[slot];
        entity.indexSlot = slot;
        entity.armor = actor.armor;
        entity.shield = actor.shield;
        if (actor.parent !== null) {
          const parent = entities[actor.parent];
          if (!parent) space.remove(entity);
          else entity.indexParent = parent.id;
        }
      });
      space.indexWorksite = {
        parents: entities
          .filter((entity): entity is Entity => !!entity && !entity.indexParent && !entity.dead)
          .map((entity) => entity.id),
        claim: saved(this).claim ?? null,
        extractAt: clock(this) + 25,
        launchAt: clock(this) + 30,
        notified: new Set(),
      };
      return;
    }
    saved(this).replacements = 12;
    const quarry = spawn(space, 910, INDEX_SITE.x - 160, INDEX_SITE.y - 260);
    const archive = spawn(space, 911, INDEX_SITE.x + 240, INDEX_SITE.y - 260);
    space.indexWorksite = {
      parents: [quarry.id, archive.id],
      claim: saved(this).claim ?? null,
      extractAt: clock(this) + 25,
      launchAt: clock(this) + 30,
      notified: new Set(),
    };
    quarry.indexSlot = 0;
    archive.indexSlot = 1;
    for (const parent of [quarry, archive])
      for (let slot = 0; slot < 4; slot++) {
        const drone = spawn(
          space,
          slot < 2 ? 914 : 915,
          parent.x + 90 * (slot - 1),
          parent.y + 160,
          parent.id,
        );
        drone.indexSlot = 2 + parent.indexSlot! * 4 + slot;
      }
    saved(this).actors = [...space.ships.values()]
      .filter((entity) => entity.indexWorksite)
      .sort((left, right) => left.indexSlot! - right.indexSlot!)
      .map((entity) => ({
        hull: Number(entity.hull),
        parent: entity.indexParent === quarry.id ? 0 : entity.indexParent === archive.id ? 1 : null,
        armor: entity.armor,
        shield: entity.shield,
        dead: false,
      }));
    this.db.touch();
  },
  /** Override standing and generic faction hostility in both NPC and player directions. */
  allow(this: IndexCapabilities, space: Space, left: Entity, right: Entity): boolean | null {
    if (!left.indexWorksite && !right.indexWorksite) return null;
    if (left.indexWorksite && right.indexWorksite) return false;
    const machine = left.indexWorksite ? left : right;
    const visitor = space.root(left.indexWorksite ? right : left);
    const owner = key(this, visitor);
    // Stray NPC fire never blames a bystander; machines do not declare faction wars.
    return !!(
      owner &&
      !machine.dead &&
      near(visitor) &&
      (visitor.player?.s.data.story?.flags?.index_ending === 'silence' ||
        (saved(this).offenders[owner]?.until || 0) > clock(this))
    );
  },
  damaged(this: IndexCapabilities, space: Space, victim: Entity, source: Entity): void {
    if (!victim.indexWorksite) return;
    const owner = key(this, space.root(source));
    if (owner) provoke(this, owner);
  },
  mining(this: IndexCapabilities, system: string, rock: number, owner: string | null): void {
    if (!owner || system !== INDEX_SITE.sys) return;
    // A claim is an explicit finite rock identity, not a whole field or nearby ship.
    const session = [...this.sessions()].find(
      (session) =>
        session.data && this.db.key(session.data.name) === owner && session.data.sys === system,
    );
    const offender = (saved(this).offenders[owner] ||= { until: 0, warning: 0 });
    if (!offender.warning || offender.rock !== rock || clock(this) - offender.warning > 20) {
      offender.warning = clock(this) || Number.EPSILON;
      offender.rock = rock;
      if (session)
        this.toast(
          session,
          'Stop mining the marked Index rock. Continued work will draw defensive fire.',
        );
    } else if (clock(this) - offender.warning >= 4) provoke(this, owner);
    this.db.touch();
  },
  pickup(this: IndexCapabilities, session: Session, item: LootItem): boolean {
    if (!item.indexClaim)
      return !item.indexTakenBy || item.indexTakenBy === this.db.key(session.data.name);
    // Claimed parcels never enter automatic scoop/tractor paths. Explicit take is handled by hail.
    return false;
  },
  take(this: IndexCapabilities, session: Session, space: Space): boolean {
    if (
      !session.ent ||
      session.ent.dead ||
      session.ent.disabled ||
      session.ent.state !== 'fly' ||
      session.data.sys !== space.id ||
      space.id !== INDEX_SITE.sys ||
      !space.indexWorksite
    )
      return false;
    const parcel = space.loot.find(
      (parcel) =>
        !parcel.taken &&
        parcel.it.indexClaim &&
        Math.hypot(parcel.x - session.ent!.x, parcel.y - session.ent!.y) <= 250,
    );
    if (!parcel) {
      this.toast(session, 'No marked salvage within 250 units.');
      return false;
    }
    const owner = this.db.key(session.data.name);
    provoke(this, owner);
    parcel.it.indexClaim = false;
    parcel.it.indexTakenBy = owner;
    this.toast(
      session,
      'Marked salvage released. The Index are defending their worksite; leave the marked area to disengage.',
    );
    return true;
  },
  ai(this: IndexCapabilities, space: Space, entity: Entity): boolean {
    if (!entity.indexWorksite) return false;
    const parent = entity.indexParent ? space.ships.get(entity.indexParent) : null;
    if (entity.indexParent && (!parent || parent.dead)) {
      space.remove(entity);
      return true;
    }
    const target = [...space.ships.values()].find(
      (candidate) => candidate.player && IndexOperations.allow.call(this, space, entity, candidate),
    );
    entity.target = target || null;
    if (target && entity.hull !== 914) space.steer(entity, target.x, target.y, true);
    else {
      const slot = (entity.indexSlot ?? 0) % 6;
      space.steer(
        entity,
        (parent?.x ?? INDEX_SITE.x) + Math.cos(slot) * 180,
        (parent?.y ?? INDEX_SITE.y) + Math.sin(slot) * 180,
        true,
      );
      if (entity.hull !== 915) entity.target = null;
    }
    return true;
  },
  indexTick(this: IndexCapabilities, space: Space): void {
    if (space.id !== INDEX_SITE.sys) return;
    IndexOperations.open.call(this, space);
    const site = space.indexWorksite;
    if (!site) return;
    for (const session of this.sessions())
      if (
        session.data &&
        session.data.sys === space.id &&
        session.ent &&
        near(session.ent) &&
        !site.notified.has(session.id)
      ) {
        site.notified.add(session.id);
        this.toast(
          session,
          'Index worksite — leave marked material alone. Transit and unmarked rocks are safe. Hail an Index machine for details.',
        );
      }
    const actors = saved(this).actors!;
    actors.forEach((actor, slot) => {
      const entity = [...space.ships.values()].find(
        (entity) => entity.indexWorksite && entity.indexSlot === slot,
      );
      if (!entity || entity.dead) {
        if (!actor.dead) this.db.touch();
        actor.dead = true;
      } else {
        if (actor.armor !== entity.armor || actor.shield !== entity.shield) this.db.touch();
        actor.armor = entity.armor;
        actor.shield = entity.shield;
      }
    });
    const parentIds = this.db.world.indexFleets?.[space.id]
      ? [...space.ships.values()]
          .filter((entity) => entity.indexWorksite && [910, 911].includes(Number(entity.hull)))
          .map((entity) => entity.id)
      : site.parents;
    const parents = parentIds
      .map((id) => space.ships.get(id))
      .filter((parent): parent is Entity => !!parent && !parent.dead);
    if (!parents.length) {
      if (this.db.world.indexFleets?.[space.id]) return;
      for (const entity of space.ships.values()) if (entity.indexWorksite) space.remove(entity);
      site.claim = null;
      saved(this).claim = null;
      saved(this).actors = undefined;
      space.indexWorksite = undefined;
      for (const parcel of space.loot) parcel.it.indexClaim = false;
      saved(this).dormantUntil = clock(this) + 600;
      this.db.touch();
      return;
    }
    const generation = this.db.world.mining?.systems[space.id]?.rocks;
    if (!generation) return;
    let claimed = generation.find((rock) => rock.id === site.claim && !rock.down);
    if (!claimed) {
      // Never move a claim onto an already-working captain or their old parcels.
      claimed = generation.find(
        (rock) =>
          !rock.down &&
          !rock.dredgeToken &&
          !rock.work &&
          rock.hp === rock.max &&
          rock.stage === 0 &&
          !rock.heat &&
          !Object.keys(rock.seen).length &&
          !rock.leases.length &&
          Math.hypot(rock.x - INDEX_SITE.x, rock.y - INDEX_SITE.y) < 400,
      );
      site.claim = claimed?.id ?? null;
      saved(this).claim = site.claim;
      this.db.touch();
    }
    if ((this.db.world.indexFleets?.[space.id]?.rebootUntil || 0) > clock(this)) return;
    if (claimed && clock(this) >= site.extractAt && parents.some((parent) => parent.hull === 910)) {
      site.extractAt = clock(this) + 1;
      // Use the shared finite root budget and stage rules; do not mint a separate Index ore stream.
      this.extract(space, claimed, 12);
      for (const parcel of space.loot)
        if (parcel.it.generationKey === claimed.key && !parcel.it.indexTakenBy)
          parcel.it.indexClaim = true;
    }
    if (
      !this.db.world.indexFleets?.[space.id] &&
      clock(this) >= site.launchAt &&
      saved(this).replacements > 0
    ) {
      site.launchAt = clock(this) + 30;
      for (const parent of parents) {
        const children = [...space.ships.values()].filter(
          (entity) => entity.indexParent === parent.id,
        );
        if (children.length >= 4 || saved(this).replacements <= 0) continue;
        const slot = actors.findIndex((actor) => actor.dead && actor.parent === parent.indexSlot);
        if (slot < 0) continue;
        const drone = spawn(space, actors[slot].hull, parent.x + 100, parent.y, parent.id);
        drone.indexSlot = slot;
        actors[slot] = { ...actors[slot], dead: false, armor: drone.armor, shield: drone.shield };
        saved(this).replacements--;
        this.db.touch();
      }
    }
  },
};
