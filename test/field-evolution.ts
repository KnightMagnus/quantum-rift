import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { tug as createTugFixture, attach, command, survey } from './helpers/towing-fixture.ts';
import { TOW as towingRules } from '../shared/towing-rules.ts';
const feature = createTugFixture(),
  { g: game, s: session } = feature;
const weapon = game.db.world.towing,
  initial = requiredFixtureValue(weapon).slots.length;
attach(feature);
command(feature, 'detach');
const grace = requiredFixtureValue(feature.o).graceUntil;
const pilotFixture = createTugFixture(game, 'Foreign');
pilotFixture.o = feature.o;
survey(pilotFixture);
requiredFixtureValue(game.db.world.mining).clock = grace - 1;
assert.equal(command(pilotFixture, 'attach'), false);
requiredFixtureValue(game.db.world.mining).clock = grace;
survey(pilotFixture);
assert.equal(command(pilotFixture, 'attach'), true);
assert.equal(
  requiredFixtureValue(feature.o).owner,
  game.db.key(requiredFixtureValue(pilotFixture.s).data.name),
);
// Same pressure ledger, finite retained slots/receipts, never a normal-rock bonus/parcels.
const slot = requiredFixtureValue(weapon).slots.find(
  (entry) => entry.object?.id === requiredFixtureValue(feature.o).id,
);
const beforeLoot = feature.sp.loot.length,
  oldId = requiredFixtureValue(feature.o).id;
assert.equal(
  game.features.towing.destroy(
    pilotFixture.s,
    requiredFixtureValue(feature.o).id,
    requiredFixtureValue(feature.o).revision,
  ),
  true,
);
game.features.towing.ensure('meridian');
assert.equal(
  requiredFixtureValue(requiredFixtureValue(slot).object).id,
  oldId,
  'no immediate paid respawn',
);
const nextAt = requiredFixtureValue(slot).nextAt;
requiredFixtureValue(game.db.world.mining).clock = nextAt - 0.01;
game.features.towing.ensure('meridian');
assert.equal(requiredFixtureValue(requiredFixtureValue(slot).object).id, oldId);
requiredFixtureValue(game.db.world.mining).clock = nextAt;
game.features.towing.ensure('meridian');
assert.ok(requiredFixtureValue(requiredFixtureValue(slot).object).id > oldId);
assert.equal(requiredFixtureValue(requiredFixtureValue(slot).object).mass, 24);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(slot).object).hp,
  100,
  'renewed motherlode is full health',
);
assert.equal(
  requiredFixtureValue(slot).issued,
  requiredFixtureValue(slot).delivered +
    requiredFixtureValue(slot).discarded +
    requiredFixtureValue(requiredFixtureValue(slot).object).mass,
);
const liveId = requiredFixtureValue(requiredFixtureValue(slot).object).id;
requiredFixtureValue(game.db.world.mining).clock += 1e9;
game.features.towing.ensure('meridian');
assert.equal(
  requiredFixtureValue(requiredFixtureValue(slot).object).id,
  liveId,
  'lazy time never replaces a live object',
);
assert.equal(requiredFixtureValue(weapon).slots.length, initial);
assert.equal(feature.sp.loot.length, beforeLoot);
for (let index = 0; index < 100; index++) {
  feature.o = requiredFixtureValue(requiredFixtureValue(slot).object);
  Object.assign(requiredFixtureValue(session).ent, {
    x: requiredFixtureValue(feature.o).x,
    y: requiredFixtureValue(feature.o).y - 90,
    vx: 0,
    vy: 0,
  });
  attach(feature);
  assert.equal(
    game.features.towing.destroy(
      session,
      requiredFixtureValue(feature.o).id,
      requiredFixtureValue(feature.o).revision,
    ),
    true,
  );
  requiredFixtureValue(game.db.world.mining).clock = requiredFixtureValue(slot).nextAt;
  game.features.towing.ensure('meridian');
  assert.equal(
    requiredFixtureValue(slot).issued,
    requiredFixtureValue(slot).delivered + requiredFixtureValue(slot).discarded + 24,
  );
}
assert.equal(requiredFixtureValue(weapon).slots.length, initial);
assert.ok(requiredFixtureValue(weapon).receipts.length <= towingRules.receiptLimit);
const player = game.features.pressure.fieldState('meridian', 0);
assert.ok(player.recovery >= 0 && player.recovery <= 40);
assert.match(player.label, /RECOVERING|STEADY|RICH OPPORTUNITY/);
game.paused = true;
const identifier = requiredFixtureValue(requiredFixtureValue(slot).object).id,
  clock = requiredFixtureValue(game.db.world.mining).clock;
game.features.mining.advanceClock(1);
game.features.towing.towingTick(feature.sp);
assert.equal(requiredFixtureValue(game.db.world.mining).clock, clock);
assert.equal(requiredFixtureValue(requiredFixtureValue(slot).object).id, identifier);
console.log(
  'Logical-clock grace boundary, same pressure owner, finite authored epochs/recovery and bounded history over 100 generations; no lazy/offline parcels or second rock bounty.',
);
