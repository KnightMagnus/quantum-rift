import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { dredgePilot, control, industrialStep, seed, lots } from './helpers/dredge-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { refineryGame } from './helpers/refinery-fixture.ts';
for (const elapsedSeconds of [1 / 30, 0.5, 1]) {
  const feature = dredgePilot(undefined, 'Smelt' + elapsedSeconds),
    { g: game, s: session } = feature;
  seed(requiredFixtureValue(session).data, { ore: lots(12) });
  control(feature, 'smelter');
  industrialStep(feature, 60, elapsedSeconds);
  assert.equal(
    requiredFixtureValue(session).data.cargo.ore,
    6,
    'six real input tonnes per active minute',
  );
  assert.equal(requiredFixtureValue(session).data.cargo.alloy_ingots, 1);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).outputs.alloy_ingots,
    120,
    '420 units, not 70% twice',
  );
  const amount = requiredFixtureValue(session).data.cargo.ore;
  game.paused = true;
  industrialStep(feature, 30, elapsedSeconds);
  assert.equal(requiredFixtureValue(session).data.cargo.ore, amount);
  game.paused = false;
  control(feature, 'off');
  industrialStep(feature, 10, elapsedSeconds);
  assert.equal(requiredFixtureValue(session).data.cargo.ore, amount);
  game.db.flush();
  const heat = requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).heat,
    reloadedGame = refineryGame(new Database(game.db.dir)),
    saved = reloadedGame.db.get(requiredFixtureValue(session).data.name);
  assert.equal(requiredFixtureValue(requiredFixtureValue(saved).ship.industrial).heat, heat);
  assert.equal(requiredFixtureValue(requiredFixtureValue(saved).ship.industrial).smelter, false);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(saved).ship.industrial).outputs.alloy_ingots,
    120,
    'no offline production',
  );
}
const pilotFixture = dredgePilot(),
  { g: game, s: session } = pilotFixture;
seed(requiredFixtureValue(session).data, { ore: lots(0, 6, 0) });
control(pilotFixture, 'recipe', { recipe: 'alloy', grade: 'rich' });
control(pilotFixture, 'smelter');
industrialStep(pilotFixture, 10);
assert.equal(requiredFixtureValue(session).data.cargoLots.byCommodity.ore.rich, 5);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).outputs.alloy_ingots,
  70,
);
// Partial work is real and input-specific; cannot switch into a different free input.
industrialStep(pilotFixture, 3);
control(pilotFixture, 'recipe', { recipe: 'cells', grade: 'common' });
assert.equal(
  requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).recipe,
  'alloy',
);
// Unprotected destruction destroys mobile fractional assets once; hull thermal state persists.
const heat = requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).heat;
game.onPlayerDeath(
  requiredFixtureValue(requiredFixtureValue(session).ent.player),
  pilotFixture.sp,
  null,
);
assert.deepEqual(
  requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).outputs,
  {},
);
assert.equal(requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).workMs, 0);
assert.equal(requiredFixtureValue(requiredFixtureValue(session).data.ship.industrial).heat, heat);
assert.equal(requiredFixtureValue(session).data.cargo.ore || 0, 0);
console.log(
  '70/300 rational mobile recovery, 6t/min, exact grades, frame partitions, pause/offline restart and death economics.',
);
// Real economic checkpoint faults: pre-journal retry vs uncertain final sync and reopen.
for (const after of [false, true]) {
  const pilotFixture2 = dredgePilot(undefined, 'Fault' + after);
  seed(requiredFixtureValue(pilotFixture2.s).data, { ore: lots(5) });
  control(pilotFixture2, 'smelter');
  industrialStep(pilotFixture2, 9);
  let restore;
  if (after) {
    const original = pilotFixture2.g.db.syncDirectory.bind(pilotFixture2.g.db);
    let calls = 0;
    pilotFixture2.g.db.syncDirectory = () => {
      if (++calls === 3) throw Error('final-sync-injected');
      return original();
    };
    restore = () => (pilotFixture2.g.db.syncDirectory = original);
  } else {
    const original = pilotFixture2.g.db.writeDurable.bind(pilotFixture2.g.db);
    pilotFixture2.g.db.writeDurable = () => {
      throw Error('pre-journal-injected');
    };
    restore = () => (pilotFixture2.g.db.writeDurable = original);
  }
  assert.throws(() => industrialStep(pilotFixture2, 1), /injected/);
  restore();
  if (after) {
    assert.equal(pilotFixture2.g.db.economicFrozen, true);
    assert.equal(requiredFixtureValue(pilotFixture2.s).data.cargo.ore, 4);
    const reopened = refineryGame(new Database(pilotFixture2.g.db.dir));
    assert.equal(requiredFixtureValue(reopened.db.get(pilotFixture2.s.data.name)).cargo.ore, 4);
    assert.equal(
      requiredFixtureValue(
        requiredFixtureValue(reopened.db.get(pilotFixture2.s.data.name)).ship.industrial,
      ).outputs.alloy_ingots,
      70,
    );
  } else {
    assert.equal(pilotFixture2.g.db.economicFrozen, false);
    assert.equal(requiredFixtureValue(pilotFixture2.s).data.cargo.ore, 5);
    industrialStep(pilotFixture2, 0.1);
    assert.equal(requiredFixtureValue(pilotFixture2.s).data.cargo.ore, 4);
  }
}

// Actual jettison can remove unreserved input. Switching then discards time only.
{
  const pilotFixture2 = dredgePilot(undefined, 'JettisonWork');
  seed(requiredFixtureValue(pilotFixture2.s).data, { ore: lots(1), gas: lots(6) });
  control(pilotFixture2, 'smelter');
  industrialStep(pilotFixture2, 3);
  requiredFixtureValue(
    requiredFixtureValue(pilotFixture2.s).data.ship.industrial,
  ).outputs.alloy_ingots = 70;
  pilotFixture2.g.features.fleetcmd.jettison(pilotFixture2.s, 'ore', 1);
  assert.equal(requiredFixtureValue(pilotFixture2.s).data.cargo.ore || 0, 0);
  control(pilotFixture2, 'off');
  control(pilotFixture2, 'recipe', { recipe: 'cells', grade: 'common' });
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).recipe,
    'cells',
  );
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).workMs,
    0,
  );
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).outputs
      .alloy_ingots,
    70,
  );
  assert.ok(
    requiredFixtureValue(pilotFixture2.s).sock.out.some((message) =>
      JSON.stringify(message).includes('discarded partial smelter work'),
    ),
  );
  control(pilotFixture2, 'smelter');
  industrialStep(pilotFixture2, 7);
  assert.equal(
    requiredFixtureValue(pilotFixture2.s).data.cargo.gas,
    6,
    'discarded ore time never transfers to gas',
  );
  industrialStep(pilotFixture2, 3);
  assert.equal(requiredFixtureValue(pilotFixture2.s).data.cargo.gas, 5);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(pilotFixture2.s).data.ship.industrial).outputs
      .fuel_cells,
    70,
  );
}
