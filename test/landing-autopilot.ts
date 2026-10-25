import { requiredFixtureValue } from './helpers/required.ts';
// Closed-loop regression: production guidance drives the actual shared flight
// physics for every stock hull, with varied drift, headings and landing radii.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { landingGuidance, landingReady, type AutopilotState } from '../client/landing_autopilot.ts';
import {
  augmentAssets,
  shipStats,
  makeLoadout,
  step,
  DT as simulationStepSeconds,
  wrap,
} from '../shared/rules.ts';
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
let count = 0,
  maxSeconds = 0,
  maxLandingSpeed = 0;
// These NPC-only work postures refold before travelling; deployed Loom speed
// cannot cross a 3,000-unit approach inside the existing 300-second landing bound.
// Their transit hulls remain covered here, and all forms retain braking checks below.
const workingPostures = new Map([
  [913, 912],
  [920, 919],
  [922, 921],
  [924, 923],
]);
const closedLoopHullCoverage = new Set<number>();
for (const hull of Object.keys(assets.ships)) {
  if (workingPostures.has(Number(hull))) continue;
  const shipStats3 = requiredFixtureValue(shipStats(assets, makeLoadout(assets, hull)));
  for (const radius of [40, 70, 165, 330])
    for (const seed of [
      [
        450,
        500,
        requiredFixtureValue(shipStats3).maxSpeed * 0.6,
        -requiredFixtureValue(shipStats3).maxSpeed * 0.4,
        2.5,
      ],
      [radius + 20, 0, requiredFixtureValue(shipStats3).maxSpeed, 0, 0],
      [0, 1000, 0, -requiredFixtureValue(shipStats3).maxSpeed, Math.PI],
      [0, 3000, 1, -requiredFixtureValue(shipStats3).maxSpeed, Math.PI / 2],
      [
        0,
        3000,
        requiredFixtureValue(shipStats3).maxSpeed * 0.4,
        -requiredFixtureValue(shipStats3).maxSpeed * 0.8,
        Math.PI / 2,
      ],
      [
        radius + 5,
        0,
        requiredFixtureValue(shipStats3).maxSpeed * 0.6,
        requiredFixtureValue(shipStats3).maxSpeed * 0.6,
        Math.PI,
      ],
    ]) {
      const [horizontalPosition, verticalPosition, velocityX, velocityY, firstValue] = seed,
        ship = {
          x: horizontalPosition,
          y: verticalPosition,
          vx: velocityX,
          vy: velocityY,
          a: firstValue,
          fuel: requiredFixtureValue(shipStats3).fuel,
        },
        port = { x: 0, y: 0, r: radius },
        state: AutopilotState = {};
      let authority = { ...ship, t: 0 },
        landed = false,
        tick = 0,
        landSpeed,
        braking = false;
      for (; tick < 9000; tick++) {
        const input = { navigation: true } as unknown as Record<string, number>,
          currentTime = tick * simulationStepSeconds * 1000;
        // Delayed 10 Hz authoritative snapshots; prediction remains ahead of them.
        if (tick % 3 === 0) authority = { ...ship, t: currentTime };
        landingGuidance(state, ship, shipStats3, port, input);
        assert.equal(input.ab, 0, 'landing must not burn afterburner fuel');
        if (state.phase === 'brake') {
          braking = true;
          assert.equal(input.turn, 0, 'committed braking does not alternate approach headings');
          assert.ok(!input.thrust || input.rev, 'braking thrust requires retrograde control');
        }
        if (landingReady(state, ship, authority, shipStats3, port, currentTime)) {
          assert.ok(Math.hypot(ship.x, ship.y) <= radius + 25, 'conservative server radius margin');
          landSpeed = Math.hypot(ship.vx, ship.vy);
          assert.ok(
            landSpeed <=
              Math.max(2, requiredFixtureValue(shipStats3).accel * simulationStepSeconds * 0.55) +
                1,
            'settled speed, not just under 80',
          );
          assert.equal(
            landingReady(
              state,
              ship,
              authority,
              shipStats3,
              port,
              currentTime + simulationStepSeconds * 1000,
            ),
            false,
            'no duplicate requests',
          );
          landed = true;
          break;
        }
        step(ship, shipStats3, input);
        assert.equal(
          ship.fuel,
          requiredFixtureValue(shipStats3).fuel,
          'normal landing flight consumes no fuel',
        );
      }
      assert.ok(braking, 'arrival must use committed braking');
      assert.ok(landed, `hull ${hull}, radius ${radius}, initial ${seed.join(',')} must land`);
      maxSeconds = Math.max(maxSeconds, tick * simulationStepSeconds);
      maxLandingSpeed = Math.max(maxLandingSpeed, requiredFixtureValue(landSpeed));
      count++;
      closedLoopHullCoverage.add(Number(hull));
    }
}
for (const [working, transit] of workingPostures) {
  assert.equal(
    assets.ships[working].npcOnly,
    true,
    'a non-travelling work posture is never a player hull',
  );
  assert.equal(
    assets.ships[working].spr?.banks,
    false,
    'only the authored level-only work sheets skip the travelling approach',
  );
  assert.ok(
    closedLoopHullCoverage.has(transit),
    `work posture ${working} has its actual transit counterpart ${transit} covered by the full closed-loop landing matrix`,
  );
}
// Reproduce a delayed/held retrograde thrust after the last partial pulse.
// This previously reversed a near-stopped ship, causing another braking turn.
for (const hull of Object.keys(assets.ships)) {
  const shipStats2 = requiredFixtureValue(shipStats(assets, makeLoadout(assets, hull))),
    drift = requiredFixtureValue(shipStats2).accel * simulationStepSeconds * 0.65;
  for (const heading of [0, 0.7, -2.4]) {
    const makeShip = () => ({
      x: 0,
      y: 0,
      vx: -Math.sin(heading) * drift,
      vy: Math.cos(heading) * drift,
      a: heading,
      fuel: requiredFixtureValue(shipStats2).fuel,
    });
    const ship = makeShip();
    for (let tick = 0; tick < 12; tick++) {
      step(ship, shipStats2, { navigation: true, rev: 1, thrust: 1 });
      assert.ok(
        Math.hypot(ship.vx, ship.vy) <=
          Math.max(2, requiredFixtureValue(shipStats2).accel * simulationStepSeconds * 0.55),
        'held navigation brake stays within the landing stopped-speed bound',
      );
      assert.ok(Math.abs(wrap(ship.a - heading)) < 1e-8, 'no extra braking rotation at rest');
    }
    // Guidance permits thrust within one turn step plus 0.02 radians. A held
    // near-aligned final pulse must not accelerate the reversed residual drift.
    const near = makeShip();
    near.a += requiredFixtureValue(shipStats2).turn * simulationStepSeconds + 0.01;
    step(near, shipStats2, { navigation: true, rev: 1, thrust: 1 });
    const finalHeading = near.a;
    for (let tick = 0; tick < 12; tick++) {
      step(near, shipStats2, { navigation: true, rev: 1, thrust: 1 });
      assert.ok(
        Math.hypot(near.vx, near.vy) <=
          Math.max(2, requiredFixtureValue(shipStats2).accel * simulationStepSeconds * 0.55),
        'near-aligned held braking cannot accelerate residual drift',
      );
      assert.ok(
        Math.abs(wrap(near.a - finalHeading)) < 1e-8,
        'near-aligned braking cannot chase residual drift into another turn',
      );
    }
    const manual = makeShip();
    step(manual, shipStats2, { rev: 1, thrust: 1 });
    assert.ok(
      manual.vx * -Math.sin(heading) + manual.vy * Math.cos(heading) < 0,
      'manual thrust can still reverse the original drift',
    );
  }
}
// Far-field heading must not follow tiny residual acceleration or speed overshoot.
for (const hull of [703, 704, 714, 821]) {
  const shipStats2 = requiredFixtureValue(shipStats(assets, makeLoadout(assets, hull)));
  for (const fraction of [0.9, 1]) {
    const ship = {
      x: 0,
      y: 3000,
      vx: 1,
      vy: -requiredFixtureValue(shipStats2).maxSpeed * fraction,
      a: Math.PI / 2,
      fuel: requiredFixtureValue(shipStats2).fuel,
    };
    const port = { x: 0, y: 0, r: 70 },
      state: AutopilotState = {};
    for (let tick = 0; tick < 180; tick++) {
      const input: Record<string, number> = {};
      landingGuidance(state, ship, shipStats2, port, input);
      step(ship, shipStats2, input);
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
  const state: AutopilotState = { phase: 'brake' };
  for (let index = 0; index < 10; index++)
    assert.equal(
      landingReady(state, ship, authority, stats, port, 1000 + index),
      false,
      'stale/outside/fast authority blocks landing',
    );
}
console.log(JSON.stringify({ cases: count, maxSeconds, maxLandingSpeed }));
