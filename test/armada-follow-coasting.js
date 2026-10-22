// Actual shared flight physics: a matched follower must coast, not orbit tiny
// velocity errors. Include stock slow-turn and high-acceleration hulls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { augmentAssets, shipStats, makeLoadout, step, angDiff } from '../shared/rules.ts';
import { steerFormation } from '../server/armada-formation.ts';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
augmentAssets(A);
const proof = [];
for (const hull of [704, 714, 736, 744, 774, 784, 804]) {
  const st = shipStats(A, makeLoadout(A, hull, 'Coasting fixture'));
  const velocity = st.maxSpeed * 0.7;
  const e = { x: 10, y: 0, a: 0, vx: 0.3, vy: -velocity, st };
  let rotation = 0;
  for (let tick = 0; tick < 60 * 30; tick++) {
    const target = { x: 0, y: (-tick / 30) * velocity, vx: 0, vy: -velocity, a: 0 };
    const angle = e.a;
    steerFormation(e, target);
    step(e, st, e.inp);
    rotation += Math.abs(angDiff(e.a, angle));
    assert.ok(Math.hypot(e.x - target.x, e.y - target.y) < 60, `${hull} retains moving slot`);
    assert.ok(Math.hypot(e.vx, e.vy) > velocity * 0.95, `${hull} does not stop during coasting`);
  }
  assert.ok(rotation < 0.1, `${hull} coasts facing leader instead of rotating (${rotation})`);
  proof.push({ hull, rotation, x: e.x, speed: Math.hypot(e.vx, e.vy) });
  // Desired velocity must remain achievable at the speed ceiling: a leader
  // running at the follower's own maximum is not a reason to turn sideways.
  const ceiling = { x: 0, y: 0, a: 0, vx: 0, vy: -st.maxSpeed, st };
  for (let tick = 0; tick < 30 * 20; tick++) {
    const target = { x: 0, y: -500 - (tick / 30) * st.maxSpeed, vx: 0, vy: -st.maxSpeed, a: 0 };
    steerFormation(ceiling, target);
    assert.equal(ceiling.inp.thrust, 0, 'no unreachable acceleration request at maximum speed');
    assert.equal(ceiling.inp.turn, 0, 'ceiling cruise faces leader');
    step(ceiling, st, ceiling.inp);
  }
}
console.log('Pulse-aware coasting, no circling/stopping and attainable speed ceiling:', proof);
// Reacquisition uses ordinary leader controls and unchanged production physics,
// not target teleportation or catch-up boosts. Every sampled hull has enough
// speed to catch its same-hull leader's attainable cruising speed.
for (const hull of [704, 736, 774]) {
  const st = shipStats(A, makeLoadout(A, hull, 'Recovery fixture'));
  const leader = { x: 0, y: 0, vx: 0, vy: -st.maxSpeed * 0.6, a: 0 };
  const follower = { x: 500, y: 200, vx: 0, vy: 0, a: Math.PI, st };
  const tick = (input) => {
    step(leader, st, input);
    steerFormation(follower, leader);
    step(follower, st, follower.inp);
    assert.ok(Math.hypot(follower.vx, follower.vy) <= st.maxSpeed + 0.01, 'no speed boost');
  };
  const settle = (label) => {
    for (let n = 0; n < 30 * 180; n++) tick({});
    assert.ok(Math.hypot(follower.x - leader.x, follower.y - leader.y) < 100, `${hull}: ${label}`);
  };
  settle('moving leader acquired');
  for (let n = 0; n < 30 * 30 && Math.hypot(leader.vx, leader.vy) > 3; n++) {
    const turn = angDiff(Math.atan2(-leader.vx, leader.vy), leader.a);
    tick({ rev: 1, thrust: Math.abs(turn) < 0.03 ? 1 : 0 });
  }
  assert.ok(Math.hypot(leader.vx, leader.vy) < 3, 'leader physically stops');
  settle('leader stop acquired');
  for (let n = 0; n < 30 * 1.2; n++) tick({ thrust: 1 });
  settle('leader restart acquired');
  for (let n = 0; n < (Math.PI / 2 / st.turn) * 30; n++) tick({ turn: 1 });
  for (let n = 0; n < 30; n++) tick({ thrust: 1 });
  settle('sharp leader turn acquired');
}
console.log(
  'Production physics recovery: same-hull normal/slow captains, leader stop/restart/sharp turn passed.',
);

// Cross-hull physics: a faster follower can acquire a slower leader; a slower
// follower cannot magically catch a faster leader but must not exceed its stats.
const stats = [704, 714, 736, 744, 774, 784, 804]
  .map((hull) => ({
    hull,
    st: shipStats(A, makeLoadout(A, hull, 'Mixed-speed fixture')),
  }))
  .sort((a, b) => a.st.maxSpeed - b.st.maxSpeed);
const slow = stats[0],
  fast = stats.at(-1);
const mixed = [];
for (const [leaderStats, followerStats, canCatch] of [
  [slow, fast, true],
  [fast, slow, false],
]) {
  const velocity = canCatch
    ? leaderStats.st.maxSpeed * 0.6
    : (fast.st.maxSpeed + slow.st.maxSpeed) / 2;
  const leader = { x: 0, y: 0, a: 0, vx: 0, vy: -velocity };
  const follower = { x: 100, y: 200, a: 0, vx: 0, vy: 0, st: followerStats.st };
  let maxSpeed = 0;
  for (let tick = 0; tick < 30 * 300; tick++) {
    step(leader, leaderStats.st, {});
    steerFormation(follower, leader);
    step(follower, followerStats.st, follower.inp);
    maxSpeed = Math.max(maxSpeed, Math.hypot(follower.vx, follower.vy));
    assert.ok(
      Number.isFinite(follower.x + follower.y + follower.a),
      'mixed-hull controller remains finite',
    );
    assert.ok(
      maxSpeed <= followerStats.st.maxSpeed + 0.01,
      'mixed-hull follower never gets catch-up boosts',
    );
  }
  const error = Math.hypot(follower.x - leader.x, follower.y - leader.y);
  if (canCatch) assert.ok(error < 100, 'faster stock hull acquires slower leader');
  else
    assert.ok(
      error > (velocity - followerStats.st.maxSpeed) * 250,
      'unattainable leader pulls away physically',
    );
  mixed.push({
    leaderHull: leaderStats.hull,
    followerHull: followerStats.hull,
    leaderSpeed: velocity,
    followerCeiling: followerStats.st.maxSpeed,
    maxSpeed,
    finalError: error,
    canCatch,
  });
}
console.log('Mixed stock hull speed mismatch:', mixed);
