import type { Space } from '../../server/space.ts';
import type { SavedRockGeneration } from '../../server/mining-contracts.ts';
import { requiredFixtureValue } from './required.ts';
import { refineryGame, refineryPilot, seed, lots } from './refinery-fixture.ts';
import { makeLoadout, DT as simulationStepSeconds } from '../../shared/rules.ts';
import type { IndustrialRequest } from '../../server/industrial-contracts.ts';
export { seed, lots, simulationStepSeconds as DT };
let pilotCounter = 0;
export function dredgePilot(
  game = refineryGame(),
  name = 'Dredger',
  hull = 815,
  systemId = 'meridian',
) {
  const session = refineryPilot(game, name.replace(/[^a-zA-Z]/g, '').slice(0, 12) + ++pilotCounter);
  requiredFixtureValue(session).data.ship = makeLoadout(game.A, hull);
  requiredFixtureValue(session).data.stellar = null;
  requiredFixtureValue(session).data.sys = systemId;
  game.spawnPlayer(session, 10000, 10000, 0, 0);
  const entity = requiredFixtureValue(session.ent);
  const space = game.spaces[systemId] as Omit<Space, 'rocks'> & { rocks: SavedRockGeneration[] };
  space.spawnT = 1e9;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
  for (const entity of [...space.ships.values()]) if (!entity.player) space.remove(entity);
  entity.guns = [];
  entity.graceT = 1e9;
  return { g: game, s: Object.assign(session, { ent: entity }), sp: space };
}
export function control(
  feature: ReturnType<typeof dredgePilot>,
  operation: IndustrialRequest['op'],
  extra: IndustrialRequest & Record<string, unknown> = {},
) {
  feature.g.features.industrial.command(feature.s, { t: 'industrial', op: operation, ...extra });
}
export function industrialStep(
  pilotFixture: ReturnType<typeof dredgePilot>,
  seconds: number,
  elapsedSeconds = 1 / 30,
) {
  for (
    let advancedSeconds = 0;
    advancedSeconds < seconds - 1e-8;
    advancedSeconds += elapsedSeconds
  ) {
    const step = Math.min(elapsedSeconds, seconds - advancedSeconds);
    pilotFixture.g.features.mining.advanceClock(step);
    pilotFixture.g.features.industrial.industrialTick(pilotFixture.sp, step);
    pilotFixture.g.features.mining.endTick(pilotFixture.sp);
  }
}
export function fullStep(pilotFixture: ReturnType<typeof dredgePilot>, seconds: number) {
  for (
    let advancedSeconds = 0;
    advancedSeconds < seconds - 1e-8;
    advancedSeconds += simulationStepSeconds
  ) {
    pilotFixture.g.features.mining.advanceClock(simulationStepSeconds);
    pilotFixture.sp.tick();
  }
}
