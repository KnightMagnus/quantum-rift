import assert from 'node:assert/strict';
import { dredgePilot, control, industrialStep, seed, lots } from './helpers/dredge-fixture.js';
import { DB } from '../server/db.js';
import { refineryGame } from './helpers/refinery-fixture.js';
for (const dt of [1 / 30, 0.5, 1]) {
  const f = dredgePilot(undefined, 'Smelt' + dt),
    { g, s } = f;
  seed(s.data, { ore: lots(12) });
  control(f, 'smelter');
  industrialStep(f, 60, dt);
  assert.equal(s.data.cargo.ore, 6, 'six real input tonnes per active minute');
  assert.equal(s.data.cargo.alloy_ingots, 1);
  assert.equal(s.data.ship.industrial.outputs.alloy_ingots, 120, '420 units, not 70% twice');
  const amount = s.data.cargo.ore;
  g.paused = true;
  industrialStep(f, 30, dt);
  assert.equal(s.data.cargo.ore, amount);
  g.paused = false;
  control(f, 'off');
  industrialStep(f, 10, dt);
  assert.equal(s.data.cargo.ore, amount);
  g.db.flush();
  const heat = s.data.ship.industrial.heat,
    g2 = refineryGame(new DB(g.db.dir)),
    saved = g2.db.get(s.data.name);
  assert.equal(saved.ship.industrial.heat, heat);
  assert.equal(saved.ship.industrial.smelter, false);
  assert.equal(saved.ship.industrial.outputs.alloy_ingots, 120, 'no offline production');
}
const f = dredgePilot(),
  { g, s } = f;
seed(s.data, { ore: lots(0, 6, 0) });
control(f, 'recipe', { recipe: 'alloy', grade: 'rich' });
control(f, 'smelter');
industrialStep(f, 10);
assert.equal(s.data.cargoLots.byCommodity.ore.rich, 5);
assert.equal(s.data.ship.industrial.outputs.alloy_ingots, 70);
// Partial work is real and input-specific; cannot switch into a different free input.
industrialStep(f, 3);
control(f, 'recipe', { recipe: 'cells', grade: 'common' });
assert.equal(s.data.ship.industrial.recipe, 'alloy');
// Unprotected destruction destroys mobile fractional assets once; hull thermal state persists.
const heat = s.data.ship.industrial.heat;
g.onPlayerDeath(s.ent.player, f.sp, null);
assert.deepEqual(s.data.ship.industrial.outputs, {});
assert.equal(s.data.ship.industrial.workMs, 0);
assert.equal(s.data.ship.industrial.heat, heat);
assert.equal(s.data.cargo.ore || 0, 0);
console.log(
  '70/300 rational mobile recovery, 6t/min, exact grades, frame partitions, pause/offline restart and death economics.',
);
// Real economic checkpoint faults: pre-journal retry vs uncertain final sync and reopen.
for (const after of [false, true]) {
  const f = dredgePilot(undefined, 'Fault' + after);
  seed(f.s.data, { ore: lots(5) });
  control(f, 'smelter');
  industrialStep(f, 9);
  let restore;
  if (after) {
    const original = f.g.db.syncDirectory.bind(f.g.db);
    let calls = 0;
    f.g.db.syncDirectory = () => {
      if (++calls === 3) throw Error('final-sync-injected');
      return original();
    };
    restore = () => (f.g.db.syncDirectory = original);
  } else {
    const original = f.g.db.writeDurable.bind(f.g.db);
    f.g.db.writeDurable = () => {
      throw Error('pre-journal-injected');
    };
    restore = () => (f.g.db.writeDurable = original);
  }
  assert.throws(() => industrialStep(f, 1), /injected/);
  restore();
  if (after) {
    assert.equal(f.g.db.economicFrozen, true);
    assert.equal(f.s.data.cargo.ore, 4);
    const reopened = refineryGame(new DB(f.g.db.dir));
    assert.equal(reopened.db.get(f.s.data.name).cargo.ore, 4);
    assert.equal(reopened.db.get(f.s.data.name).ship.industrial.outputs.alloy_ingots, 70);
  } else {
    assert.equal(f.g.db.economicFrozen, false);
    assert.equal(f.s.data.cargo.ore, 5);
    industrialStep(f, 0.1);
    assert.equal(f.s.data.cargo.ore, 4);
  }
}
