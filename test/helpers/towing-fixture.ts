import { requiredFixtureValue } from './required.ts';
import assert from 'node:assert/strict';
import { refineryGame, refineryPilot, seed, lots } from './refinery-fixture.ts';
import { makeLoadout } from '../../shared/rules.ts';
import { TOW as towingRules } from '../../shared/towing-rules.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { type TowRequest } from '../../server/towing-contracts.ts';
export { refineryGame, seed, lots };
let counter = 0;
export function tug(game = refineryGame(), name = 'TowPilot', hull = 815) {
  const session = refineryPilot(game, name + ++counter);
  requiredFixtureValue(session).data.ship = makeLoadout(game.A, hull);
  if (hull !== 815) requiredFixtureValue(session).data.ship.outfits[towingRules.rig] = 1;
  requiredFixtureValue(session).data.sys = 'meridian';
  requiredFixtureValue(session).data.stellar = null;
  game.spawnPlayer(session, 10000, 10000, 0, 0);
  const entity = requiredFixtureValue(session.ent);
  const space = game.spaces.meridian;
  space.spawnT = 1e9;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
  for (const entity of [...space.ships.values()]) if (!entity.player) space.remove(entity);
  entity.guns = [];
  entity.graceT = 1e9;
  game.features.towing.ensure('meridian');
  const options = requiredFixtureValue(
    requiredFixtureValue(
      requiredFixtureValue(game.db.world.towing).slots.find((slot) => slot.sys === 'meridian'),
    ).object,
  );
  Object.assign(entity, {
    x: requiredFixtureValue(options).x,
    y: requiredFixtureValue(options).y - 90,
    vx: 0,
    vy: 0,
  });
  return { g: game, s: Object.assign(session, { ent: entity }), sp: space, o: options };
}
export function survey(feature: ReturnType<typeof tug>) {
  feature.s.data.miningSurvey = {
    version: 1,
    sys: feature.s.data.sys,
    x: requiredFixtureValue(feature.s.ent).x,
    y: requiredFixtureValue(feature.s.ent).y,
    revealUntil: requiredFixtureValue(feature.g.db.world.mining).clock + 6,
    cooldownUntil: 0,
  };
}
export function command(
  pilotFixture: ReturnType<typeof tug>,
  operation: TowRequest['op'],
  extra: TowRequest & Record<string, unknown> = {},
) {
  return pilotFixture.g.features.towing.command(pilotFixture.s, {
    t: 'towing',
    op: operation,
    id: pilotFixture.o.id,
    revision: pilotFixture.o.revision,
    ...extra,
  });
}
export function attach(pilotFixture: ReturnType<typeof tug>) {
  survey(pilotFixture);
  assert.equal(command(pilotFixture, 'attach'), true, 'real tow attachment');
}
export function atPort(pilotFixture: ReturnType<typeof tug>) {
  const stellarBody = STELLARS[pilotFixture.o.acceptPorts[0]];
  Object.assign(requiredFixtureValue(pilotFixture.s.ent), {
    x: stellarBody.x,
    y: stellarBody.y + stellarBody.r + 30,
    vx: 0,
    vy: 0,
  });
  Object.assign(pilotFixture.o, {
    x: stellarBody.x,
    y: stellarBody.y + stellarBody.r + 90,
    vx: 0,
    vy: 0,
  });
  return stellarBody;
}
export function advance(pilotFixture: ReturnType<typeof tug>, seconds: number) {
  for (let advancedSeconds = 0; advancedSeconds < seconds - 1e-8; advancedSeconds += 1 / 30) {
    pilotFixture.g.features.mining.advanceClock(Math.min(1 / 30, seconds - advancedSeconds));
    pilotFixture.sp.tick();
  }
}
