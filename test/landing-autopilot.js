// Closed-loop regression: production guidance drives the actual shared flight
// physics for every stock hull, with varied drift, headings and landing radii.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { landingGuidance, landingReady } from '../client/landing_autopilot.js';
import { augmentAssets, shipStats, makeLoadout, step, DT, wrap } from '../shared/rules.js';
const A = augmentAssets(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
);
let count = 0,
  maxSeconds = 0,
  maxLandingSpeed = 0;
for (const hull of Object.keys(A.ships)) {
  const st = shipStats(A, makeLoadout(A, hull));
  for (const radius of [40, 70, 165, 330])
    for (const seed of [
      [450, 500, st.maxSpeed * 0.6, -st.maxSpeed * 0.4, 2.5],
      [radius + 20, 0, st.maxSpeed, 0, 0],
      [0, 1000, 0, -st.maxSpeed, Math.PI],
      [0, 3000, 1, -st.maxSpeed, Math.PI / 2],
      [0, 3000, st.maxSpeed * 0.4, -st.maxSpeed * 0.8, Math.PI / 2],
      [radius + 5, 0, st.maxSpeed * 0.6, st.maxSpeed * 0.6, Math.PI],
    ]) {
      const [x, y, vx, vy, a] = seed,
        ship = { x, y, vx, vy, a, fuel: st.fuel },
        port = { x: 0, y: 0, r: radius },
        state = {};
      let authority = { ...ship, t: 0 },
        landed = false,
        tick = 0,
        landSpeed,
        braking = false;
      for (; tick < 9000; tick++) {
        const input = { navigation: true },
          now = tick * DT * 1000;
        // Delayed 10 Hz authoritative snapshots; prediction remains ahead of them.
        if (tick % 3 === 0) authority = { ...ship, t: now };
        landingGuidance(state, ship, st, port, input);
        assert.equal(input.ab, 0, 'landing must not burn afterburner fuel');
        if (state.phase === 'brake') {
          braking = true;
          assert.equal(input.turn, 0, 'committed braking does not alternate approach headings');
          assert.ok(!input.thrust || input.rev, 'braking thrust requires retrograde control');
        }
        if (landingReady(state, ship, authority, st, port, now)) {
          assert.ok(Math.hypot(ship.x, ship.y) <= radius + 25, 'conservative server radius margin');
          landSpeed = Math.hypot(ship.vx, ship.vy);
          assert.ok(
            landSpeed <= Math.max(2, st.accel * DT * 0.55) + 1,
            'settled speed, not just under 80',
          );
          assert.equal(
            landingReady(state, ship, authority, st, port, now + DT * 1000),
            false,
            'no duplicate requests',
          );
          landed = true;
          break;
        }
        step(ship, st, input);
        assert.equal(ship.fuel, st.fuel, 'normal landing flight consumes no fuel');
      }
      assert.ok(braking, 'arrival must use committed braking');
      assert.ok(landed, `hull ${hull}, radius ${radius}, initial ${seed} must land`);
      maxSeconds = Math.max(maxSeconds, tick * DT);
      maxLandingSpeed = Math.max(maxLandingSpeed, landSpeed);
      count++;
    }
}
// Reproduce a delayed/held retrograde thrust after the last partial pulse.
// This previously reversed a near-stopped ship, causing another braking turn.
for (const hull of Object.keys(A.ships)) {
  const st = shipStats(A, makeLoadout(A, hull)),
    drift = st.accel * DT * 0.65;
  for (const heading of [0, 0.7, -2.4]) {
    const makeShip = () => ({
      x: 0,
      y: 0,
      vx: -Math.sin(heading) * drift,
      vy: Math.cos(heading) * drift,
      a: heading,
      fuel: st.fuel,
    });
    const ship = makeShip();
    for (let tick = 0; tick < 12; tick++) {
      step(ship, st, { navigation: true, rev: 1, thrust: 1 });
      assert.ok(
        Math.hypot(ship.vx, ship.vy) <= Math.max(2, st.accel * DT * 0.55),
        'held navigation brake stays within the landing stopped-speed bound',
      );
      assert.ok(Math.abs(wrap(ship.a - heading)) < 1e-8, 'no extra braking rotation at rest');
    }
    // Guidance permits thrust within one turn step plus 0.02 radians. A held
    // near-aligned final pulse must not accelerate the reversed residual drift.
    const near = makeShip();
    near.a += st.turn * DT + 0.01;
    step(near, st, { navigation: true, rev: 1, thrust: 1 });
    const finalHeading = near.a;
    for (let tick = 0; tick < 12; tick++) {
      step(near, st, { navigation: true, rev: 1, thrust: 1 });
      assert.ok(
        Math.hypot(near.vx, near.vy) <= Math.max(2, st.accel * DT * 0.55),
        'near-aligned held braking cannot accelerate residual drift',
      );
      assert.ok(
        Math.abs(wrap(near.a - finalHeading)) < 1e-8,
        'near-aligned braking cannot chase residual drift into another turn',
      );
    }
    const manual = makeShip();
    step(manual, st, { rev: 1, thrust: 1 });
    assert.ok(
      manual.vx * -Math.sin(heading) + manual.vy * Math.cos(heading) < 0,
      'manual thrust can still reverse the original drift',
    );
  }
}
// Far-field heading must not follow tiny residual acceleration or speed overshoot.
for (const hull of [703, 704, 714, 821]) {
  const st = shipStats(A, makeLoadout(A, hull));
  for (const fraction of [0.9, 1]) {
    const ship = {
      x: 0,
      y: 3000,
      vx: 1,
      vy: -st.maxSpeed * fraction,
      a: Math.PI / 2,
      fuel: st.fuel,
    };
    const port = { x: 0, y: 0, r: 70 },
      state = {};
    for (let tick = 0; tick < 180; tick++) {
      const input = {};
      landingGuidance(state, ship, st, port, input);
      step(ship, st, input);
      if (tick > 90) {
        const bearing = Math.atan2(port.x - ship.x, -(port.y - ship.y));
        assert.ok(
          Math.abs(wrap(ship.a - bearing)) < 0.2,
          'targetward cruise heading hull ' + hull + ' speed ' + fraction + ': ' + ship.a,
        );
        assert.equal(input.rev, 0, 'no premature retrograde cruise');
      }
    }
  }
}
const port = { x: 0, y: 0, r: 60 },
  ship = { x: 0, y: 0, vx: 0, vy: 0, a: 0 },
  stats = { accel: 150, turn: 2, maxSpeed: 150 };
for (const authority of [
  { ...ship, x: 150, t: 1000 },
  { ...ship, vx: 100, t: 1000 },
  { ...ship, t: 0 },
  null,
]) {
  const state = { phase: 'brake' };
  for (let i = 0; i < 10; i++)
    assert.equal(
      landingReady(state, ship, authority, stats, port, 1000 + i),
      false,
      'stale/outside/fast authority blocks landing',
    );
}
console.log(JSON.stringify({ cases: count, maxSeconds, maxLandingSpeed }));
