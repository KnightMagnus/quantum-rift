import assert from 'node:assert/strict';
import type { GameAssets } from '../../shared/rules.ts';
import { DT, step } from '../../shared/rules.ts';
import { Space } from '../../server/space.ts';
import type { Entity } from '../../server/space.ts';
import { IndexFleetOperations } from '../../server/index-fleet.ts';
import type { IndexFleetCapabilities, IndexFleetWorld } from '../../server/index-fleet.ts';
import { NhalOperations } from '../../server/nhal.ts';
import type { NhalCapabilities, NhalPopulation } from '../../server/nhal.ts';
import { SYS } from '../../shared/galaxy.ts';
import { mockPlayerReference, mockSession, mockSpace } from './mocks.ts';

/** Wire allocation history must not change faction steering or physical outcomes. */
export function verifyStorySeededMotion(assets: GameAssets): void {
  const originalRandom = Math.random;
  let randomState = 0;
  function resetRandom(): void {
    randomState = 928344;
    Math.random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
  }
  function fixture(system: string): Space {
    return mockSpace({
      id: system,
      sys: SYS[system],
      A: assets,
      t: 0,
      ships: new Map(),
      loot: [],
      events: [],
      beams: [],
      rocks: [],
      // oxlint-disable-next-line typescript/unbound-method -- Installed as a method on the fixture Space, preserving its receiver.
      makeShip: Space.prototype.makeShip,
      // oxlint-disable-next-line typescript/unbound-method -- Installed as a method on the fixture Space, preserving its receiver.
      remove: Space.prototype.remove,
      // oxlint-disable-next-line typescript/unbound-method -- Installed as a method on the fixture Space, preserving its receiver.
      root: Space.prototype.root,
      // oxlint-disable-next-line typescript/unbound-method -- Installed as a method on the fixture Space, preserving its receiver.
      steer: Space.prototype.steer,
      fight: (entity, target) => {
        entity.fireAt = target;
      },
    });
  }
  function physical(entity: Entity): unknown[] {
    return [
      entity.hull,
      entity.x,
      entity.y,
      entity.vx,
      entity.vy,
      entity.a,
      entity.armor,
      entity.shield,
      entity.inp,
    ];
  }
  function sample(allocatorPrefix: number) {
    resetRandom();
    const unrelated = fixture('sol');
    for (let count = 0; count < allocatorPrefix; count++) unrelated.makeShip({ hull: 704 });
    // Keep authored randomness identical while deliberately leaving wire IDs shifted.
    resetRandom();
    let clock = 0;
    const fleets: Record<string, IndexFleetWorld> = {};
    const fleetCapabilities: IndexFleetCapabilities = {
      fleets: () => fleets,
      clock: () => clock,
      key: () => null,
      provoked: () => false,
      extract() {},
      virginRock: () => null,
      touch() {},
      toast() {},
    };
    const survey = fixture('glasswake');
    IndexFleetOperations.fleetTick.call(fleetCapabilities, survey);
    const populations: Record<string, NhalPopulation> = {};
    const nhalCapabilities: NhalCapabilities = {
      populations: () => populations,
      clock: () => clock,
      touch() {},
      toast() {},
    };
    const nativeSpace = fixture('maw');
    const native = NhalOperations.spawnTraffic.call(nhalCapabilities, nativeSpace);
    assert.ok(native, 'native population supplies an idle-motion sample');
    const encounter = fixture('maw');
    const target = encounter.makeShip({
      hull: 704,
      faction: 'quantum',
      x: 450,
      y: 0,
      player: mockPlayerReference({
        id: 28100,
        s: mockSession({ data: { story: { step: 0, active: null, done: [] } } }),
      }),
    });
    const flayer = NhalOperations.storyCreature.call(
      nhalCapabilities,
      encounter,
      904,
      28100,
      0,
      0,
      3,
    );
    const trace: unknown[][] = [];
    for (let tick = 0; tick < 60; tick++) {
      clock += DT;
      for (const space of [survey, nativeSpace, encounter]) {
        space.t += DT;
        for (const entity of space.ships.values()) {
          if (entity === target) continue;
          if (space === survey) IndexFleetOperations.ai.call(fleetCapabilities, space, entity);
          else NhalOperations.ai.call(nhalCapabilities, space, entity);
          step(entity, entity.st, entity.inp);
        }
      }
      IndexFleetOperations.fleetTick.call(fleetCapabilities, survey);
      trace.push([
        [...survey.ships.values()].map(physical),
        [...nativeSpace.ships.values()].map(physical),
        physical(flayer),
      ]);
    }
    assert.ok(
      trace.some((frame) => JSON.stringify(frame) !== JSON.stringify(trace[0])),
      'comparison includes moving physical states, not an empty fixture',
    );
    return { firstWireId: flayer.id, trace };
  }
  try {
    const first = sample(0);
    const repeated = sample(0);
    const shifted = sample(1);
    assert.notEqual(
      first.firstWireId,
      repeated.firstWireId,
      'same seeded fixture does not reset the process-wide wire allocator',
    );
    assert.equal(
      new Set([first.firstWireId % 2, repeated.firstWireId % 2, shifted.firstWireId % 2]).size,
      2,
      'both allocator parities are exercised',
    );
    assert.deepEqual(
      repeated.trace,
      first.trace,
      'repeated seeded Index/Nhal simulation is independent of prior actor allocations',
    );
    assert.deepEqual(
      shifted.trace,
      first.trace,
      'an unrelated allocated actor cannot change neutral formations, native waypoints or Flayer flanks',
    );
    console.log(
      'Story seeded motion: real steering/physics remain identical across shifted wire IDs for Index formations, native Nhal and scripted Flayers.',
    );
  } finally {
    Math.random = originalRandom;
  }
}
