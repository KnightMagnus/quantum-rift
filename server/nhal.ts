import type { NhalCapabilities } from './story-faction-contracts.ts';
export type { NhalCapabilities } from './story-faction-contracts.ts';
import type { Entity, Space } from './space.ts';
import { DT, makeLoadout } from '../shared/rules.ts';
import { NHAL_LIMITS } from '../shared/nhal.ts';
import { SYS } from '../shared/galaxy.ts';

/** Shared finite budgets survive reconnects and system unloading. */
export interface NhalPopulation {
  /** Persisted simulation-clock instant when the current population budget expires. */
  until: number;
  /** Ambient and reinforcement creatures born in this period. */
  spawned: number;
  /** Offspring born in this period, across every parent. */
  offspring: number;
  /** Completed Watcher calls across the population. */
  calls: number;
  /** Ambient formation cadence is independent of traffic polling frequency. */
  nextWave: number;
}
/** Dependencies retain storage ownership in Game. */

/** A status has one fixed deadline; repeated hits cannot extend it. */
interface Status {
  /** End of the current short slow or damage interval. */
  until: number;
  /** Earliest next application, protecting an escape window. */
  immuneUntil: number;
  /** Remaining damage, charged once per simulation tick. */
  damage: number;
  /** Source identity, for detachment when the creature dies. */
  source?: number;
}
interface Creature {
  /** Finite offspring allowance attached to this parent identity. */
  launched: number;
  /** Parent identity for no-reward offspring. */
  parent?: number;
  /** Individual ability cadence. */
  readyAt: number;
  /** Telegraph start time and acquired target. */
  windup?: { target: number; until: number };
  /** Current timed latch. */
  latch?: { target: number; until: number; thrust: number };
  /** Last incoming damage, used for delayed regeneration. */
  hitAt: number;
  /** Explicit encounter owner; Dreamers are not ordinary traffic. */
  storyOwner?: number;
  /** Explicit mission roster slot; repeated arrival does not duplicate the actor. */
  storySlot?: number;
}
interface LocalState {
  /** Creature state is separate from player ownership/root identity. */
  creatures: Map<number, Creature>;
  /** One slow and one ichor interval per affected ship. */
  effects: Map<number, { slow?: Status; ichor?: Status }>;
  /** Negative loot IDs cannot collide with Space's positive allocator. */
  nextLoot: number;
}
const localStates = new WeakMap<Space, LocalState>();
function local(space: Space): LocalState {
  let state = localStates.get(space);
  if (!state) {
    state = { creatures: new Map(), effects: new Map(), nextLoot: -1000000 };
    localStates.set(space, state);
  }
  return state;
}
function population(capabilities: NhalCapabilities, space: Space): NhalPopulation {
  const populations = capabilities.populations();
  let state = populations[space.id];
  if (!state || state.until <= capabilities.clock()) {
    state = {
      until: capabilities.clock() + NHAL_LIMITS.epoch,
      spawned: 0,
      offspring: 0,
      calls: 0,
      nextWave: 0,
    };
    populations[space.id] = state;
    capabilities.touch();
  }
  return state;
}
function living(space: Space): Entity[] {
  return [...space.ships.values()].filter((entity) => entity.faction === 'nhal' && !entity.dead);
}
function distance(left: Entity, right: Entity): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function valid(space: Space, entity?: Entity): entity is Entity {
  return !!entity && !entity.dead && entity.state === 'fly' && space.ships.has(entity.id);
}
function notify(capabilities: NhalCapabilities, space: Space, target: Entity, text: string): void {
  const session = space.root(target).player?.s;
  if (session) capabilities.toast(session, text);
}
/** Border distance is computed from real links, not from danger (all Deep systems share it). */
export function nhalDepth(system: string): number {
  let frontier = [system];
  const seen = new Set(frontier);
  for (let depth = 0; frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const star = SYS[id];
      if (!star || star.faction !== 'deep') return Math.max(0, depth - 1);
      for (const link of star.links)
        if (!seen.has(link)) {
          seen.add(link);
          next.push(link);
        }
    }
    frontier = next;
  }
  return 0;
}
function spawn(
  capabilities: NhalCapabilities,
  space: Space,
  hull: number,
  x: number,
  y: number,
  parent?: number,
): Entity | null {
  const budget = population(capabilities, space);
  if (living(space).length >= NHAL_LIMITS.live || budget.spawned >= NHAL_LIMITS.spawned)
    return null;
  if (parent && budget.offspring >= NHAL_LIMITS.offspring) return null;
  const entity = space.makeShip({
    loadout: makeLoadout(space.A, hull),
    faction: 'nhal',
    ai: 'nhal',
    x,
    y,
    name: `Nhal ${space.A.ships[hull].name}`,
  });
  entity.noDisable = true;
  local(space).creatures.set(entity.id, {
    launched: 0,
    parent,
    readyAt: space.t + 3,
    hitAt: space.t,
  });
  budget.spawned++;
  if (parent) budget.offspring++;
  capabilities.touch();
  return entity;
}
function applyStatus(
  capabilities: NhalCapabilities,
  space: Space,
  target: Entity,
  source: Entity,
  kind: 'slow' | 'ichor',
  duration: number,
): boolean {
  const effects = local(space).effects;
  const status = effects.get(target.id) || {};
  if ((status[kind]?.immuneUntil || 0) > space.t) return false;
  status[kind] = {
    until: space.t + duration,
    immuneUntil: space.t + duration + 5,
    damage: kind === 'ichor' ? 7 : 0,
    source: source.id,
  };
  effects.set(target.id, status);
  notify(
    capabilities,
    space,
    target,
    kind === 'ichor'
      ? `Ichor burn — ${duration} seconds. Further hits cannot stack it.`
      : `Nhal drag — ${duration} seconds. Thrust away to break free.`,
  );
  return true;
}
export const NhalOperations = {
  /** Deep dispatch must run before eclipse, war and regional traffic branches. */
  spawnTraffic(this: NhalCapabilities, space: Space, _initial?: boolean): Entity | null {
    if (space.sys.faction !== 'deep') return null;
    const budget = population(this, space);
    if (budget.nextWave > this.clock() || living(space).length >= 8) return null;
    budget.nextWave = this.clock() + 25;
    this.touch();
    const depth = nhalDepth(space.id);
    const rolls =
      depth < 1 ? [901, 900, 904] : depth < 2 ? [902, 903, 905, 904] : [906, 907, 905, 903];
    const hull = rolls[Math.floor(Math.random() * rolls.length)];
    const angle = Math.random() * Math.PI * 2;
    const lead = spawn(this, space, hull, Math.sin(angle) * 2000, Math.cos(angle) * 2000);
    if (lead && [902, 903, 907].includes(hull))
      for (let escort = 0; escort < 2; escort++)
        if (
          spawn(
            this,
            space,
            900,
            lead.x + 100 * (escort ? 1 : -1),
            lead.y + 120,
            hull === 907 ? lead.id : undefined,
          ) &&
          hull === 907
        )
          local(space).creatures.get(lead.id)!.launched++;
    return lead;
  },
  /** Explicit owner-scoped Dreamer; never selected by ambient pools. */
  storyDreamer(
    this: NhalCapabilities,
    space: Space,
    owner: number,
    x: number,
    y: number,
  ): Entity | null {
    if (space.sys.faction !== 'deep') return null;
    return NhalOperations.storyCreature.call(this, space, 908, owner, x, y, 0);
  },
  /** Authored border encounters receive native abilities without changing ambient geography. */
  storyCreature(
    this: NhalCapabilities,
    space: Space,
    hull: number,
    owner: number,
    x: number,
    y: number,
    slot = 0,
  ): Entity {
    if (
      hull < 900 ||
      hull > 908 ||
      !Number.isInteger(hull) ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= 12
    )
      throw new Error('Invalid Nhal story roster slot');
    const existing = living(space).find(
      (entity) =>
        Number(entity.hull) === hull &&
        local(space).creatures.get(entity.id)?.storyOwner === owner &&
        local(space).creatures.get(entity.id)?.storySlot === slot,
    );
    if (existing) return existing;
    const entity = space.makeShip({
      loadout: makeLoadout(space.A, hull),
      faction: 'nhal',
      ai: 'nhal',
      x,
      y,
      name: hull === 908 ? 'The Dreamer' : `Nhal ${space.A.ships[hull].name}`,
    });
    entity.noDisable = true;
    entity.story = owner;
    local(space).creatures.set(entity.id, {
      launched: 0,
      readyAt: space.t + 3,
      hitAt: space.t,
      storyOwner: owner,
      storySlot: slot,
    });
    return entity;
  },
  /** Unlike alwaysHostile's player-only path, this also covers Umbral/Hollow NPCs. */
  allow(this: NhalCapabilities, space: Space, left: Entity, right: Entity): boolean | null {
    if (left.faction !== 'nhal' && right.faction !== 'nhal') return null;
    if (left === right || left.dead || right.dead || left.faction === right.faction) return false;
    const creature = left.faction === 'nhal' ? left : right;
    const visitor = left === creature ? right : left;
    const owner = local(space).creatures.get(creature.id)?.storyOwner ?? creature.mission?.owner;
    const captain = space.root(visitor).player?.s.data;
    if (
      captain?.story?.flags?.nhal_ending === 'seal' &&
      nhalDepth(space.id) === 0 &&
      !creature.aggro.has(space.root(visitor).id)
    )
      return false;
    if (owner !== undefined && space.root(visitor).player?.id !== owner && visitor.story !== owner)
      return false;
    return !visitor.industrialRoot && !(space.root(visitor).rescueT! > space.t);
  },
  /** Landed hits, not proximity, cause Flayer/Spitter statuses. */
  damaged(
    this: NhalCapabilities,
    space: Space,
    victim: Entity,
    source: Entity | null | undefined,
    done: number,
  ): void {
    if (!(done > 0)) return;
    const creature = local(space).creatures.get(victim.id);
    if (creature) creature.hitAt = space.t;
    if (!source || victim.faction === 'nhal' || !valid(space, victim)) return;
    if (source.faction === 'nhal' && Number(source.hull) === 904)
      applyStatus(this, space, victim, source, 'slow', 2);
    if (source.faction === 'nhal' && Number(source.hull) === 905)
      applyStatus(this, space, victim, source, 'ichor', 4);
  },
  /** Role movement and windups remain authoritative and do not disable escape controls. */
  ai(this: NhalCapabilities, space: Space, entity: Entity): boolean {
    if (entity.faction !== 'nhal') return false;
    const state = local(space).creatures.get(entity.id);
    if (!state) return false; // Authored mission enemies can retain their own AI.
    const candidates = [...space.ships.values()].filter(
      (target) => valid(space, target) && NhalOperations.allow.call(this, space, entity, target),
    );
    entity.target =
      candidates.sort((left, right) => distance(entity, left) - distance(entity, right))[0] || null;
    const target = entity.target;
    entity.inp = {};
    entity.fireAt = null;
    if (!target || distance(entity, target) > 2600) {
      state.windup = undefined;
      state.latch = undefined;
      space.steer(
        entity,
        Math.sin(space.t * 0.03 + entity.id) * 1700,
        Math.cos(space.t * 0.03 + entity.id) * 1700,
        false,
      );
      return true;
    }
    const hull = Number(entity.hull);
    const range = distance(entity, target);
    if (hull === 901) {
      space.steer(entity, target.x + 650, target.y, false);
      const budget = population(this, space);
      if (state.windup && (state.windup.target !== target.id || range > 900)) {
        notify(this, space, target, 'Watcher call broken.');
        state.windup = undefined;
        state.readyAt = space.t + 8;
      }
      if (
        !state.windup &&
        range <= 900 &&
        space.t >= state.readyAt &&
        budget.calls < NHAL_LIMITS.calls
      ) {
        state.windup = { target: target.id, until: space.t + 5 };
        notify(this, space, target, 'Watcher calling — 5 seconds. Break range or destroy it.');
      }
      if (state.windup && space.t >= state.windup.until) {
        budget.calls++;
        state.readyAt = space.t + 30;
        state.windup = undefined;
        let responses = 0;
        for (let count = 0; count < 2; count++) {
          const reinforcement =
            state.storyOwner === undefined
              ? spawn(this, space, 904, entity.x + (count ? 180 : -180), entity.y)
              : NhalOperations.storyCreature.call(
                  this,
                  space,
                  904,
                  state.storyOwner,
                  entity.x + (count ? 180 : -180),
                  entity.y,
                  2 + budget.calls * 2 + count,
                );
          if (reinforcement) responses++;
        }
        this.touch();
        notify(
          this,
          space,
          target,
          `Watcher call answered — ${responses} hunter${responses === 1 ? '' : 's'}.`,
        );
      }
      entity.name = state.windup
        ? `Watcher calling · ${Math.max(1, Math.ceil(state.windup.until - space.t))}s · break 900 range`
        : 'Nhal Watcher';
    } else if (hull === 900) {
      const attached = [...local(space).creatures.values()].filter(
        (creature) => creature.latch?.target === target.id && creature.latch.until > space.t,
      ).length;
      if (!state.latch && range < 110 && attached < 2 && space.t >= state.readyAt) {
        state.latch = { target: target.id, until: space.t + 3, thrust: 0 };
        notify(
          this,
          space,
          target,
          'Lamprey attached — thrust for a second or destroy it. Releases in 3 seconds.',
        );
      }
      if (state.latch) {
        if (target.inp.thrust || target.inp.ab) state.latch.thrust += DT;
        if (
          state.latch.until <= space.t ||
          state.latch.target !== target.id ||
          state.latch.thrust >= 1 ||
          range > 300
        ) {
          state.latch = undefined;
          state.readyAt = space.t + 8;
          entity.name = 'Nhal Lamprey';
        } else {
          entity.x = target.x + 45;
          entity.y = target.y;
          entity.vx = target.vx;
          entity.vy = target.vy;
          entity.name = `Attached Lamprey · ${Math.ceil(state.latch.until - space.t)}s · thrust to detach`;
          space.damage(target, 7 * DT, 7 * DT, entity);
          return true;
        }
      }
      space.steer(entity, target.x, target.y, false);
      entity.fireAt = target;
      entity.inp.fire1 = 1;
    } else if (hull === 906) {
      space.fight(entity, target);
      entity.inp.fire1 = 1;
      if (!state.windup && range < 500 && space.t >= state.readyAt) {
        state.windup = { target: target.id, until: space.t + 2 };
        notify(this, space, target, 'Kraken reaching — 2 seconds. Leave 500 range.');
      }
      if (state.windup && (state.windup.target !== target.id || range > 500)) {
        state.windup = undefined;
        state.readyAt = space.t + 10;
      }
      if (state.windup && state.windup.until <= space.t) {
        applyStatus(this, space, target, entity, 'slow', 2);
        state.windup = undefined;
        state.readyAt = space.t + 12;
      }
      entity.name = state.windup
        ? `Kraken reaching · ${Math.ceil(state.windup.until - space.t)}s · leave 500 range`
        : 'Nhal Kraken';
    } else if (hull === 907) {
      space.fight(entity, target);
      entity.inp.fire1 = 1;
      const children = living(space).filter(
        (child) => local(space).creatures.get(child.id)?.parent === entity.id,
      ).length;
      if (space.t >= state.readyAt && state.launched < 12 && children < NHAL_LIMITS.perParent) {
        const child = spawn(this, space, 900, entity.x + 140, entity.y, entity.id);
        if (child) {
          state.launched++;
          notify(this, space, target, `Broodmother launching Lamprey · ${state.launched}/12.`);
        }
        state.readyAt = space.t + 8;
      }
    } else if (hull === 908) {
      space.fight(entity, target);
      entity.inp.fire1 = !state.windup ? 1 : 0;
      if (!state.windup && space.t >= state.readyAt) {
        state.windup = { target: target.id, until: space.t + 3 };
        notify(
          this,
          space,
          target,
          'Dreamer pulse — 3 seconds. Leave 900 range; its recovery follows.',
        );
      }
      if (state.windup && state.windup.until <= space.t) {
        space.events.push(['blast', Math.round(entity.x), Math.round(entity.y), 900]);
        for (const victim of candidates)
          if (distance(entity, victim) < 900) space.damage(victim, 90, 90, entity);
        state.windup = undefined;
        state.readyAt = space.t + 10;
      }
      // Recovery is a real break in weapon fire, not just a visual cue.
      if (!state.windup && state.readyAt - space.t > 7) {
        entity.inp.fire1 = 0;
        entity.fireAt = null;
      }
      entity.name = state.windup
        ? `Dreamer pulse · ${Math.ceil(state.windup.until - space.t)}s · leave 900 range`
        : 'The Dreamer';
    } else if (hull === 902 || hull === 903) {
      // Transports protect their slow migration instead of behaving like civilian traders.
      space.steer(entity, entity.x + 500, Math.sin(space.t * 0.04) * 1400, false);
      entity.fireAt = target;
      entity.inp.fire1 = 1;
    } else if (hull === 904) {
      const side = entity.id % 2 ? 1 : -1;
      space.steer(
        entity,
        target.x + Math.cos(space.t * 0.7) * 260 * side,
        target.y + Math.sin(space.t * 0.7) * 260,
        false,
      );
      entity.fireAt = target;
      entity.inp.fire1 = 1;
    } else {
      space.fight(entity, target);
      entity.inp.fire1 = 1;
    }
    return true;
  },
  nhalTick(this: NhalCapabilities, space: Space): void {
    const state = local(space);
    for (const [id, effects] of state.effects) {
      const target = space.ships.get(id);
      if (!valid(space, target)) {
        state.effects.delete(id);
        continue;
      }
      if (effects.slow && effects.slow.until > space.t) {
        const source = effects.slow.source && space.ships.get(effects.slow.source);
        if (!source || source.dead || target.inp.thrust || target.inp.ab)
          effects.slow.until = space.t;
        else {
          target.vx *= 1 - 0.55 * DT;
          target.vy *= 1 - 0.55 * DT;
        }
      }
      if (effects.ichor && effects.ichor.until > space.t)
        space.damage(target, effects.ichor.damage * DT, effects.ichor.damage * DT, null);
      if (Math.max(effects.slow?.immuneUntil || 0, effects.ichor?.immuneUntil || 0) <= space.t)
        state.effects.delete(id);
    }
    for (const [id, creature] of state.creatures) {
      const entity = space.ships.get(id);
      if (creature.storyOwner !== undefined && space.game) {
        const owner = space.game.sessions.get(creature.storyOwner);
        if (!owner?.ent || owner.data.sys !== space.id) {
          if (entity) space.remove(entity);
          state.creatures.delete(id);
          continue;
        }
      }
      if (!valid(space, entity)) {
        state.creatures.delete(id);
        continue;
      }
      if (
        space.t - creature.hitAt >= 10 &&
        (!entity.target ||
          !valid(space, entity.target) ||
          distance(entity, entity.target) > 1600) &&
        !((state.effects.get(id)?.ichor?.until || 0) > space.t)
      )
        entity.armor = Math.min(entity.st.armor, entity.armor + entity.st.armor * 0.005 * DT);
    }
  },
  /** Recipient-only bounded countdowns; repeated hits share one visible status. */
  status(this: NhalCapabilities, space: Space, entity: Entity) {
    const state = local(space);
    const effects = state.effects.get(entity.id);
    const remaining = (until: number | undefined) =>
      Math.min(15, Math.max(0, Math.ceil((until || 0) - space.t)));
    const latch = [...state.creatures.values()]
      .filter((creature) => creature.latch?.target === entity.id)
      .reduce((until, creature) => Math.max(until, creature.latch!.until), 0);
    return {
      slow: remaining(effects?.slow?.until),
      ichor: remaining(effects?.ichor?.until),
      latch: remaining(latch),
    };
  },
  /** Return true to suppress generic bounty, reputation and material drops. */
  killed(this: NhalCapabilities, space: Space, entity: Entity, killer?: Entity | null): boolean {
    if (entity.faction !== 'nhal') return false;
    const state = local(space);
    const creature = state.creatures.get(entity.id);
    state.creatures.delete(entity.id);
    if (!creature || creature.parent || !killer || !space.root(killer).player) return true;
    const hull = Number(entity.hull);
    const cargo =
      hull === 901 ? 'nhal_eye' : hull === 905 || hull === 902 ? 'nhal_ichor' : 'nhal_bone';
    space.loot.push({
      id: state.nextLoot--,
      x: entity.x,
      y: entity.y,
      vx: 0,
      vy: 0,
      it: { cargo, n: hull >= 906 ? 3 : 1 },
      t: space.t,
      kind: 2,
    });
    return true;
  },
};
