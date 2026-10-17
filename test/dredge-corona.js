import assert from 'node:assert/strict';
import {
  dredgePilot,
  control,
  industrialStep,
  fullStep,
  seed,
  lots,
  DT,
} from './helpers/dredge-fixture.js';
import { CORONA_BANDS, coronaAt, INDUSTRIAL } from '../shared/industrial-rules.js';
import { SYS, STELLARS } from '../shared/galaxy.js';
for (const b of CORONA_BANDS) {
  assert.ok(SYS[b.sys], 'authored system exists');
  for (const p of SYS[b.sys].stellars)
    assert.ok(
      Math.hypot(p.x - b.x, p.y - b.y) > b.outer + p.r + 1000,
      'outside launch/port/gate corridors',
    );
}
for (const heading of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
  const f = dredgePilot(undefined, 'Stock' + heading),
    e = f.s.ent,
    b = CORONA_BANDS[0];
  e.x = b.entry.x;
  e.y = b.entry.y;
  e.a = heading;
  e.vx = e.vy = 0;
  const shields = e.shield,
    hull = e.armor;
  control(f, 'harvest');
  fullStep(f, 15);
  assert.equal(f.s.data.cargo.plasma, 5, 'first five tonnes in 15 productive seconds');
  assert.ok(Math.abs(f.s.data.ship.industrial.heat - 45) < 0.01);
  control(f, 'off');
  let exit = 0;
  // Actual stock turn/acceleration/velocity: turn toward outward east, then accelerate.
  while (coronaAt('meridian', e.x, e.y) && exit < 10) {
    const delta = Math.atan2(Math.sin(Math.PI / 2 - e.a), Math.cos(Math.PI / 2 - e.a));
    e.player.lastInput = {
      seq: 1,
      turn: Math.abs(delta) > 0.04 ? Math.sign(delta) : 0,
      thrust: Math.abs(delta) < 0.15 ? 1 : 0,
    };
    f.s.inputs = [];
    f.g.features.mining.advanceClock(DT);
    f.sp.tick();
    exit += DT;
  }
  assert.ok(exit <= 10, 'actual stock exit within signalled margin');
  assert.equal(e.shield, shields);
  assert.equal(e.armor, hull);
}
// Uniform fine/coarse heat threshold and actual damage ordering.
for (const dt of [1 / 30, 0.5, 1]) {
  const f = dredgePilot(undefined, 'Heat' + dt),
    e = f.s.ent,
    b = CORONA_BANDS[0];
  e.x = b.entry.x;
  e.y = b.entry.y;
  control(f, 'harvest');
  industrialStep(f, 34, dt);
  assert.equal(f.s.data.ship.industrial.harvest, false);
  assert.equal(e.shield, e.st.shield);
  assert.equal(e.armor, e.st.armor);
  industrialStep(f, 7, dt);
  assert.ok(e.shield < e.st.shield);
  assert.equal(e.armor, e.st.armor);
  industrialStep(f, 11, dt);
  assert.ok(e.armor < e.st.armor);
}
const f = dredgePilot(),
  b = CORONA_BANDS[0];
f.s.ent.x = b.entry.x;
f.s.ent.y = b.entry.y;
seed(f.s.data, { food: lots(400) });
control(f, 'harvest');
industrialStep(f, 20);
assert.equal(f.s.data.cargo.plasma || 0, 0);
assert.equal(f.s.data.ship.industrial.harvestMs, 0);
seed(f.s.data, {});
f.s.data.ship.industrial.heat = 0;
f.s.data.ship.industrial.harvest = false;
control(f, 'harvest');
f.s.lastInput = { navigation: true };
industrialStep(f, 1);
assert.equal(f.s.data.ship.industrial.harvest, false, 'navigation cancels opt-in');
console.log(
  'Real stock 15s harvest/10s escape at four headings, fine/coarse cutoffs then shield/hull damage, full hold and navigation denial.',
);
// Source depletion is finite across reconnect/reload; stock plasma is the sole spendable upgrade balance.
const finite = dredgePilot(undefined, 'Finite'),
  ef = finite.s.ent;
ef.x = b.entry.x;
ef.y = b.entry.y;
control(finite, 'harvest');
industrialStep(finite, 3);
const src = finite.g.db.world.industrial.sources[b.id];
assert.equal(src.units, INDUSTRIAL.sourceUnits - 300);
src.units = 0;
const plasma = finite.s.data.cargo.plasma;
industrialStep(finite, 3);
assert.equal(finite.s.data.cargo.plasma, plasma);
finite.g.db.flush();
assert.equal(finite.s.data.spec.plasma || 0, 0);

// ALL OFF is not cooling while passive corona exceeds cooling capacity.
{
  const f = dredgePilot(undefined, 'OffHeat'),
    e = f.s.ent,
    b = CORONA_BANDS[0];
  e.x = b.entry.x;
  e.y = b.entry.y;
  control(f, 'harvest');
  industrialStep(f, 15);
  control(f, 'off');
  const before = f.s.data.ship.industrial.heat;
  industrialStep(f, 2);
  assert.ok(Math.abs(f.s.data.ship.industrial.heat - before - 6) < 1e-6);
  assert.match(f.s.data.ship.industrial.reason, /CORONA HEATING — EXIT BAND/);
  f.s.data.ship.industrial.heat = 105;
  industrialStep(f, 1);
  assert.match(f.s.data.ship.industrial.reason, /THERMAL CUTOFF.*CORONA HEATING — EXIT BAND/);
  e.x = b.x + b.outer + 2000;
  const hot = f.s.data.ship.industrial.heat;
  industrialStep(f, 1);
  assert.ok(f.s.data.ship.industrial.heat < hot);
  assert.doesNotMatch(f.s.data.ship.industrial.reason, /CORONA HEATING/);
  f.s.data.ship.industrial.heat = 60;
  industrialStep(f, 1);
  assert.equal(f.s.data.ship.industrial.reason, 'OFF / COOLING');
}
// Arbitrary automatic route segments, not just authored stellar-to-stellar routes.
{
  const { coronaRouteBlocked } = await import('../shared/industrial-rules.js');
  const { step } = await import('../shared/rules.js');
  const { landingGuidance } = await import('../client/landing_autopilot.js');
  const b = CORONA_BANDS[0],
    f = dredgePilot(undefined, 'Keepout'),
    e = f.s.ent;
  const start = { x: b.x + 7000, y: b.y },
    target = { x: b.x - 7000, y: b.y, r: 100 };
  assert.equal(coronaRouteBlocked(b.sys, start, target), true);
  assert.equal(coronaRouteBlocked(b.sys, b.entry, target), true, 'inside-start also rejected');
  let refused = false;
  Object.assign(e, start, { vx: 0, vy: 0 });
  for (let i = 0; i < 300; i++) {
    const inp = {};
    if (coronaRouteBlocked(b.sys, e, target)) refused = true;
    else landingGuidance({}, e, e.st, target, inp);
    step(e, e.st, inp);
    assert.equal(coronaAt(b.sys, e.x, e.y), null, 'rejected route never enters collector');
  }
  assert.equal(refused, true);
  for (const a of SYS[b.sys].stellars)
    for (const z of SYS[b.sys].stellars)
      assert.equal(coronaRouteBlocked(b.sys, a, z), false, 'authored safe routes unaffected');
}
