import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import type { Entity, Space } from '../../server/space.ts';
import type { GameAssets } from '../../shared/rules.ts';
import { DT } from '../../shared/rules.ts';
import type { NhalCapabilities, NhalPopulation } from '../../server/nhal.ts';
import { NhalOperations, nhalDepth } from '../../server/nhal.ts';
import { NHAL_HULLS, NHAL_WEAPONS, NHAL_LIMITS } from '../../shared/nhal.ts';
import { SYS, STELLARS } from '../../shared/galaxy.ts';
import { SPRITES } from '../../shared/sprites26.ts';
import { mockEntity, mockPlayerReference, mockSession, mockSpace } from './mocks.ts';

/** Deterministic, storage-free behavior fixture callable by a registered story suite. */
export function verifyNhal(): void {
  let clock = 0;
  let nextId = 1;
  const populations: Record<string, NhalPopulation> = {};
  const warnings: string[] = [];
  const capabilities: NhalCapabilities = {
    populations: () => populations,
    clock: () => clock,
    touch() {},
    toast: (_session, text) => warnings.push(text),
  };
  const assets: GameAssets = JSON.parse(
    filesystem.readFileSync(new URL('../../shared/assets.json', import.meta.url), 'utf8'),
  );
  for (const hull of NHAL_HULLS) assets.ships[hull.id] = hull;
  for (const weapon of NHAL_WEAPONS) assets.weapons[weapon.id] = weapon;
  const deepSystems = Object.values(SYS).filter((system) => system.faction === 'deep');
  const border = deepSystems.find((system) => nhalDepth(system.id) === 0)!;
  const interior = deepSystems.find((system) => nhalDepth(system.id) >= 2)!;
  assert.ok(border && interior, 'staging has both entry and inner Deep systems');
  function fixture(system = border): Space {
    const ships = new Map<number, Entity>();
    const space = mockSpace({
      id: system.id,
      sys: system,
      A: assets,
      t: 0,
      ships,
      loot: [],
      events: [],
      root: (entity) => entity,
      steer: (entity) => {
        entity.inp = { thrust: 1 };
        return 0;
      },
      fight: (entity, target) => {
        entity.fireAt = target;
      },
      damage: (victim, amount, shield, source) => {
        victim.armor -= amount;
        if (victim.armor <= 0) {
          victim.dead = true;
          ships.delete(victim.id);
        }
        NhalOperations.damaged.call(capabilities, space, victim, source, amount + shield);
        return [amount + shield, 0, source?.id || 0];
      },
      makeShip: (options) => {
        const hull = assets.ships[options.loadout!.hull];
        const entity = mockEntity({
          id: nextId++,
          hull: hull.id,
          faction: options.faction,
          name: options.name,
          state: 'fly',
          x: options.x,
          y: options.y,
          vx: 100,
          vy: 0,
          armor: hull.armor,
          shield: 0,
          st: { armor: hull.armor },
          inp: {},
          guns: [],
          dead: false,
          player: null,
        });
        ships.set(entity.id, entity);
        return entity;
      },
    });
    return space;
  }
  function human(space: Space): Entity {
    const entity = mockEntity({
      id: nextId++,
      hull: 704,
      faction: 'quantum',
      state: 'fly',
      x: 0,
      y: 0,
      vx: 100,
      vy: 0,
      armor: 10000,
      shield: 0,
      st: { armor: 10000 },
      inp: {},
      player: mockPlayerReference({ id: 777, s: mockSession({}) }),
    });
    space.ships.set(entity.id, entity);
    return entity;
  }
  function ordinary(space: Space, hull: number): Entity {
    // Force the formation selector, not the internal spawn implementation.
    const previous = Math.random;
    const depth = nhalDepth(space.id);
    const pool =
      depth < 1 ? [901, 900, 904] : depth < 2 ? [902, 903, 905, 904] : [906, 907, 905, 903];
    Math.random = () => (pool.indexOf(hull) + 0.1) / pool.length;
    clock += 26;
    const result = NhalOperations.spawnTraffic.call(capabilities, space);
    Math.random = previous;
    assert.ok(result, `formation ${hull} spawned`);
    return result;
  }
  const entry = fixture();
  for (let count = 0; count < 50; count++) {
    clock += 26;
    NhalOperations.spawnTraffic.call(capabilities, entry);
  }
  assert.ok(
    [...entry.ships.values()].every((entity) => [900, 901, 904].includes(Number(entity.hull))),
    'entry traffic only introduces small creatures',
  );
  assert.ok(entry.ships.size <= NHAL_LIMITS.live);
  assert.ok(![...entry.ships.values()].some((entity) => Number(entity.hull) === 908));
  const normal = fixture(SYS.sol);
  assert.equal(NhalOperations.spawnTraffic.call(capabilities, normal), null);
  assert.equal(normal.ships.size, 0, 'non-Deep traffic remains untouched');
  const space = fixture();
  clock += 601;
  const watcher = ordinary(space, 901);
  watcher.x = 0;
  watcher.y = 0;
  const player = human(space);
  player.x = 500;
  space.t = 4;
  NhalOperations.ai.call(capabilities, space, watcher);
  assert.match(warnings.at(-1)!, /Watcher calling/);
  player.x = 950;
  space.t = 7;
  NhalOperations.ai.call(capabilities, space, watcher);
  assert.equal(populations[space.id].calls, 0, 'escaping during acquisition cancels reinforcement');
  player.x = 500;
  space.t = 16;
  NhalOperations.ai.call(capabilities, space, watcher);
  space.t = 22;
  NhalOperations.ai.call(capabilities, space, watcher);
  assert.equal(populations[space.id].calls, 1);
  assert.equal([...space.ships.values()].filter((entity) => Number(entity.hull) === 904).length, 2);
  for (let call = 0; call < 20; call++) {
    space.t += 31;
    NhalOperations.ai.call(capabilities, space, watcher);
    space.t += 6;
    NhalOperations.ai.call(capabilities, space, watcher);
  }
  assert.equal(
    populations[space.id].calls,
    NHAL_LIMITS.calls,
    'calls cannot recursively refill the encounter',
  );
  const umbral = mockEntity({ id: nextId++, faction: 'umbral', state: 'fly' });
  assert.equal(NhalOperations.allow.call(capabilities, space, watcher, umbral), true);
  assert.equal(NhalOperations.allow.call(capabilities, space, umbral, watcher), true);
  assert.equal(NhalOperations.allow.call(capabilities, space, watcher, watcher), false);
  assert.equal(NhalOperations.allow.call(capabilities, space, player, umbral), null);
  const flayer = [...space.ships.values()].find((entity) => Number(entity.hull) === 904)!;
  NhalOperations.damaged.call(capabilities, space, player, flayer, 10);
  assert.equal(
    NhalOperations.status.call(capabilities, space, player).slow,
    2,
    'one bounded countdown is projected for the recipient',
  );
  const firstWarnings = warnings.length;
  NhalOperations.damaged.call(capabilities, space, player, flayer, 10);
  assert.equal(warnings.length, firstWarnings, 'repeated slows neither stack nor refresh');
  player.vx = 100;
  NhalOperations.nhalTick.call(capabilities, space);
  assert.ok(player.vx < 100);
  player.inp.thrust = 1;
  NhalOperations.nhalTick.call(capabilities, space);
  const escapedSpeed = player.vx;
  NhalOperations.nhalTick.call(capabilities, space);
  assert.equal(player.vx, escapedSpeed, 'thrust breaks drag instead of disabling controls');
  player.inp = {};
  const lampreySpace = fixture();
  clock += 601;
  const lamprey = ordinary(lampreySpace, 900);
  lamprey.x = 0;
  lamprey.y = 0;
  const prey = human(lampreySpace);
  prey.x = 20;
  lampreySpace.t = 4;
  NhalOperations.ai.call(capabilities, lampreySpace, lamprey);
  assert.match(lamprey.name!, /Attached Lamprey/);
  prey.inp.thrust = 1;
  for (let tick = 0; tick < Math.ceil(1.2 / DT); tick++) {
    lampreySpace.t += DT;
    NhalOperations.ai.call(capabilities, lampreySpace, lamprey);
  }
  assert.equal(lamprey.name, 'Nhal Lamprey', 'one second thrust breaks latch');
  lamprey.armor = 10;
  NhalOperations.damaged.call(capabilities, lampreySpace, lamprey, prey, 1);
  NhalOperations.nhalTick.call(capabilities, lampreySpace);
  assert.equal(lamprey.armor, 10, 'no regeneration immediately after damage');
  lamprey.target = null;
  lampreySpace.t += 11;
  NhalOperations.nhalTick.call(capabilities, lampreySpace);
  assert.ok(lamprey.armor > 10, 'regeneration begins only after the damage-free interval');
  const inner = fixture(interior);
  clock += 601;
  const spitter = ordinary(inner, 905);
  spitter.x = 0;
  spitter.y = 0;
  const victim = human(inner);
  victim.x = 50;
  NhalOperations.damaged.call(capabilities, inner, victim, spitter, 0);
  const baseline = victim.armor;
  NhalOperations.nhalTick.call(capabilities, inner);
  assert.equal(victim.armor, baseline, 'misses do not apply ichor');
  NhalOperations.damaged.call(capabilities, inner, victim, spitter, 1);
  for (let tick = 0; tick < Math.ceil(5 / DT); tick++) {
    inner.t += DT;
    NhalOperations.damaged.call(capabilities, inner, victim, spitter, 1);
    NhalOperations.nhalTick.call(capabilities, inner);
  }
  assert.ok(
    baseline - victim.armor <= 29,
    'ichor has bounded duration and cannot stack indefinitely',
  );
  inner.ships.delete(spitter.id);
  const brood = ordinary(inner, 907);
  brood.x = 0;
  brood.y = 0;
  for (let launch = 0; launch < 30; launch++) {
    inner.t += 9;
    NhalOperations.ai.call(capabilities, inner, brood);
  }
  const babies = [...inner.ships.values()].filter((entity) => Number(entity.hull) === 900);
  assert.ok(babies.length <= 12);
  assert.ok(inner.ships.size <= NHAL_LIMITS.live);
  assert.ok(populations[inner.id].offspring <= NHAL_LIMITS.offspring);
  const beforeLoot = inner.loot.length;
  NhalOperations.killed.call(capabilities, inner, babies[0], victim);
  assert.equal(inner.loot.length, beforeLoot, 'offspring do not grant duplicate salvage rewards');
  NhalOperations.killed.call(capabilities, inner, brood, victim);
  assert.equal(inner.loot.at(-1)!.it.cargo, 'nhal_bone');
  NhalOperations.killed.call(capabilities, inner, brood, victim);
  assert.equal(inner.loot.length, beforeLoot + 1, 'a parent pays once');
  const scriptedBorder = fixture(SYS.dimmer);
  const scriptedLamprey = NhalOperations.storyCreature.call(
    capabilities,
    scriptedBorder,
    900,
    777,
    0,
    0,
    0,
  );
  assert.equal(
    NhalOperations.storyCreature.call(capabilities, scriptedBorder, 900, 777, 0, 0, 0),
    scriptedLamprey,
  );
  assert.notEqual(
    NhalOperations.storyCreature.call(capabilities, scriptedBorder, 900, 777, 0, 0, 1),
    scriptedLamprey,
  );
  assert.equal(
    scriptedBorder.ships.size,
    2,
    'scripted roster slots are idempotent without forbidding three distinct mission attackers',
  );
  const scriptedRival = mockEntity({ id: nextId++, faction: 'umbral', story: 777, state: 'fly' });
  const unrelatedRival = mockEntity({ id: nextId++, faction: 'umbral', story: 778, state: 'fly' });
  assert.equal(
    NhalOperations.allow.call(capabilities, scriptedBorder, scriptedLamprey, scriptedRival),
    true,
    'authored rivals in the same personal encounter can genuinely clash',
  );
  assert.equal(
    NhalOperations.allow.call(capabilities, scriptedBorder, scriptedLamprey, unrelatedRival),
    false,
  );
  const dreamer = NhalOperations.storyDreamer.call(capabilities, inner, 777, 1000, 0)!;
  assert.ok(dreamer);
  assert.equal(NhalOperations.storyDreamer.call(capabilities, inner, 777, 1000, 0), dreamer);
  const bystander = mockEntity({
    id: 9999,
    faction: 'quantum',
    state: 'fly',
    player: mockPlayerReference({ id: 778, s: mockSession({ data: {} }) }),
  });
  assert.equal(
    NhalOperations.allow.call(capabilities, inner, dreamer, bystander),
    false,
    'story Dreamer is personal, not a shared boss ambush',
  );
  victim.x = dreamer.x + 300;
  victim.y = dreamer.y;
  inner.t += 4;
  NhalOperations.ai.call(capabilities, inner, dreamer);
  assert.match(dreamer.name!, /pulse/);
  victim.x = dreamer.x + 1000;
  const safeArmor = victim.armor;
  inner.t += 4;
  NhalOperations.ai.call(capabilities, inner, dreamer);
  assert.equal(victim.armor, safeArmor, 'pulse can be avoided by leaving its announced radius');
  assert.equal(dreamer.inp.fire1, 0, 'pulse grants a genuine recovery interval');
  const oldBudget = populations[inner.id];
  const unloaded = fixture(interior);
  clock += 26;
  NhalOperations.spawnTraffic.call(capabilities, unloaded);
  assert.equal(
    populations[inner.id],
    oldBudget,
    'unloading does not reset persisted encounter budgets',
  );
  for (const portId of ['thrum', 'brood', 'tide', 'deep', 'facet'])
    assert.ok(STELLARS[portId].svc!.includes('T'));
  for (const hull of NHAL_HULLS) {
    assert.ok(hull.npcOnly && !hull.cost && hull.faction === 'nhal');
    assert.ok(SPRITES[hull.id]);
    for (const suffix of ['.webp', '_glow.webp', '_yard.png'])
      assert.ok(
        filesystem.existsSync(
          new URL(`../../client/assets/ships/${hull.id}${suffix}`, import.meta.url),
        ),
      );
  }
  console.log(
    'Nhal: staged native formations, hostility, finite calls/broods, timed counterplay, regeneration, personal Dreamer and one-time salvage passed.',
  );
}
