import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { LOGIN_HULLS, loginTraffic } from '../client/login-traffic.ts';
const assets = JSON.parse(filesystem.readFileSync('shared/assets.json', 'utf8'));
for (const ship of LOGIN_HULLS) {
  assert.equal(assets.ships[ship.hull].strength, ship.strength, 'Real catalog strength');
  assert.equal(assets.ships[ship.hull].size, ship.size, 'Real catalog silhouette size');
}
const sample = (fraction: number) => loginTraffic(fraction * 180, 1440, 900, 180);
assert.equal(sample(0.1).length, 6);
assert.ok(
  sample(0.1).every((ship) => ship.strength <= 30),
  'Early couriers are genuinely light catalog ships',
);
assert.equal(Math.max(...sample(0.32).map((ship) => ship.strength)), 180);
assert.equal(Math.max(...sample(0.52).map((ship) => ship.strength)), 300);
assert.equal(Math.max(...sample(0.72).map((ship) => ship.strength)), 900);
assert.equal(Math.max(...sample(0.92).map((ship) => ship.strength)), 2400);
for (let index = 0; index < 1000; index++) {
  const ships = sample(index / 1000);
  assert.ok(ships.length <= 11, 'At most six couriers and one five-ship formation');
  for (const ship of ships)
    assert.ok(Number.isFinite(ship.x) && Number.isFinite(ship.y) && ship.size > 0);
}
const formation = sample(0.72).filter((ship) => ship.formation);
const leader = formation[0];
assert.equal(formation.length, 5);
for (const escort of formation.slice(1)) {
  assert.ok(escort.x < leader.x, 'Rightward escorts trail their leader');
  assert.ok(escort.size < leader.size);
}
assert.equal(formation[1].y - leader.y, -(formation[2].y - leader.y));
const leftward = sample(0.92).filter((ship) => ship.formation);
assert.equal(leftward.length, 5);
for (const escort of leftward.slice(1))
  assert.ok(escort.x > leftward[0].x, 'Leftward escorts trail in the opposite direction');
for (const width of [320, 1440, 2400])
  for (const boundary of [0.24, 0.4, 0.44, 0.6, 0.64, 0.8, 0.84, 1])
    for (const ship of loginTraffic(boundary * 180, width, 600, 180).filter(
      (ship) => ship.formation,
    ))
      assert.ok(
        ship.x + ship.size / 2 <= 0 || ship.x - ship.size / 2 >= width,
        'Formations enter and leave offscreen at stage boundaries without visible popping',
      );
assert.deepEqual(
  loginTraffic(180, 1440, 900, 180),
  loginTraffic(0, 1440, 900, 180),
  'Actual track loop resets the schedule',
);
assert.equal(
  Math.max(...loginTraffic(259.2, 1440, 900, 360).map((ship) => ship.strength)),
  900,
  'A different decoded duration reaches the same stage at 72% of playback',
);
for (const invalid of [NaN, Infinity, -1])
  assert.ok(
    loginTraffic(invalid, NaN, Infinity, invalid).every(
      (ship) => Number.isFinite(ship.x) && Number.isFinite(ship.y),
    ),
  );
console.log(
  'Real catalog progression, bounded analytic traffic, trailing wing slots, loop reset and finite narrow inputs passed.',
);
