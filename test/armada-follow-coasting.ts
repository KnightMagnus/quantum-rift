import { fixtureFormationTarget } from './helpers/legacy-fixture.ts';
import { mockEntity } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Actual shared flight physics: a matched follower must coast, not orbit tiny
// velocity errors. Include stock slow-turn and high-acceleration hulls.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { augmentAssets, shipStats, makeLoadout, step, angDiff } from '../shared/rules.ts';
import { steerFormation } from '../server/armada-formation.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
augmentAssets(assets);
const proof = [];
for (const hull of [704, 714, 736, 744, 774, 784, 804]) {
  const shipStats3 = requiredFixtureValue(
    shipStats(assets, makeLoadout(assets, hull, 'Coasting fixture')),
  );
  const velocity = requiredFixtureValue(shipStats3).maxSpeed * 0.7;
  const entity = mockEntity({ x: 10, y: 0, a: 0, vx: 0.3, vy: -velocity, st: shipStats3 });
  let rotation = 0;
  for (let tick = 0; tick < 60 * 30; tick++) {
    const target = { x: 0, y: (-tick / 30) * velocity, vx: 0, vy: -velocity, a: 0 };
    const angle = entity.a;
    steerFormation(entity, fixtureFormationTarget(target));
    step(entity, shipStats3, entity.inp);
    rotation += Math.abs(angDiff(entity.a, angle));
    assert.ok(
      Math.hypot(entity.x - target.x, entity.y - target.y) < 60,
      `${hull} retains moving slot`,
    );
    assert.ok(
      Math.hypot(entity.vx, entity.vy) > velocity * 0.95,
      `${hull} does not stop during coasting`,
    );
  }
  assert.ok(rotation < 0.1, `${hull} coasts facing leader instead of rotating (${rotation})`);
  proof.push({ hull, rotation, x: entity.x, speed: Math.hypot(entity.vx, entity.vy) });
  // Desired velocity must remain achievable at the speed ceiling: a leader
  // running at the follower's own maximum is not a reason to turn sideways.
  const ceiling = mockEntity({
    x: 0,
    y: 0,
    a: 0,
    vx: 0,
    vy: -requiredFixtureValue(shipStats3).maxSpeed,
    st: shipStats3,
  });
  for (let tick = 0; tick < 30 * 20; tick++) {
    const target = {
      x: 0,
      y: -500 - (tick / 30) * requiredFixtureValue(shipStats3).maxSpeed,
      vx: 0,
      vy: -requiredFixtureValue(shipStats3).maxSpeed,
      a: 0,
    };
    steerFormation(ceiling, fixtureFormationTarget(target));
    assert.equal(ceiling.inp.thrust, 0, 'no unreachable acceleration request at maximum speed');
    assert.equal(ceiling.inp.turn, 0, 'ceiling cruise faces leader');
    step(ceiling, shipStats3, ceiling.inp);
  }
}
console.log('Pulse-aware coasting, no circling/stopping and attainable speed ceiling:', proof);
// Reacquisition uses ordinary leader controls and unchanged production physics,
// not target teleportation or catch-up boosts. Every sampled hull has enough
// speed to catch its same-hull leader's attainable cruising speed.
for (const hull of [704, 736, 774]) {
  const shipStats2 = requiredFixtureValue(
    shipStats(assets, makeLoadout(assets, hull, 'Recovery fixture')),
  );
  const leader = mockEntity({
    x: 0,
    y: 0,
    vx: 0,
    vy: -requiredFixtureValue(shipStats2).maxSpeed * 0.6,
    a: 0,
  });
  const follower = mockEntity({ x: 500, y: 200, vx: 0, vy: 0, a: Math.PI, st: shipStats2 });
  const tick = (input: {
    rev?: number | boolean | undefined;
    thrust?: number | boolean | undefined;
    turn?: number | undefined;
    ab?: number | boolean | undefined;
    navigation?: number | boolean | undefined;
  }) => {
    step(leader, shipStats2, input);
    steerFormation(follower, fixtureFormationTarget(leader));
    step(follower, shipStats2, follower.inp);
    assert.ok(
      Math.hypot(follower.vx, follower.vy) <= requiredFixtureValue(shipStats2).maxSpeed + 0.01,
      'no speed boost',
    );
  };
  const settle = (label: string) => {
    for (let quantity = 0; quantity < 30 * 180; quantity++) tick({});
    assert.ok(Math.hypot(follower.x - leader.x, follower.y - leader.y) < 100, `${hull}: ${label}`);
  };
  settle('moving leader acquired');
  for (let quantity = 0; quantity < 30 * 30 && Math.hypot(leader.vx, leader.vy) > 3; quantity++) {
    const turn = angDiff(Math.atan2(-leader.vx, leader.vy), leader.a);
    tick({ rev: 1, thrust: Math.abs(turn) < 0.03 ? 1 : 0 });
  }
  assert.ok(Math.hypot(leader.vx, leader.vy) < 3, 'leader physically stops');
  settle('leader stop acquired');
  for (let quantity = 0; quantity < 30 * 1.2; quantity++) tick({ thrust: 1 });
  settle('leader restart acquired');
  for (
    let quantity = 0;
    quantity < (Math.PI / 2 / requiredFixtureValue(shipStats2).turn) * 30;
    quantity++
  )
    tick({ turn: 1 });
  for (let quantity = 0; quantity < 30; quantity++) tick({ thrust: 1 });
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
    st: requiredFixtureValue(shipStats(assets, makeLoadout(assets, hull, 'Mixed-speed fixture'))),
  }))
  .sort(
    (firstEntry, secondEntry) =>
      requiredFixtureValue(firstEntry.st).maxSpeed - requiredFixtureValue(secondEntry.st).maxSpeed,
  );
const slow = stats[0],
  fast = stats.at(-1);
const mixed = [];
for (const [leaderStats, followerStats, canCatch] of [
  [slow, fast, true],
  [fast, slow, false],
] as const) {
  const velocity = canCatch
    ? requiredFixtureValue(leaderStats).st.maxSpeed * 0.6
    : (requiredFixtureValue(fast).st.maxSpeed + requiredFixtureValue(slow.st).maxSpeed) / 2;
  const leader = mockEntity({ x: 0, y: 0, a: 0, vx: 0, vy: -velocity });
  const follower = mockEntity({
    x: 100,
    y: 200,
    a: 0,
    vx: 0,
    vy: 0,
    st: requiredFixtureValue(followerStats).st,
  });
  let maxSpeed = 0;
  for (let tick = 0; tick < 30 * 300; tick++) {
    step(leader, requiredFixtureValue(leaderStats).st, {});
    steerFormation(follower, fixtureFormationTarget(leader));
    step(follower, requiredFixtureValue(followerStats).st, follower.inp);
    maxSpeed = Math.max(maxSpeed, Math.hypot(follower.vx, follower.vy));
    assert.ok(
      Number.isFinite(follower.x + follower.y + follower.a),
      'mixed-hull controller remains finite',
    );
    assert.ok(
      maxSpeed <= requiredFixtureValue(followerStats).st.maxSpeed + 0.01,
      'mixed-hull follower never gets catch-up boosts',
    );
  }
  const error = Math.hypot(follower.x - leader.x, follower.y - leader.y);
  if (canCatch) assert.ok(error < 100, 'faster stock hull acquires slower leader');
  else
    assert.ok(
      error > (velocity - requiredFixtureValue(followerStats).st.maxSpeed) * 250,
      'unattainable leader pulls away physically',
    );
  mixed.push({
    leaderHull: requiredFixtureValue(leaderStats).hull,
    followerHull: requiredFixtureValue(followerStats).hull,
    leaderSpeed: velocity,
    followerCeiling: requiredFixtureValue(followerStats).st.maxSpeed,
    maxSpeed,
    finalError: error,
    canCatch,
  });
}
console.log('Mixed stock hull speed mismatch:', mixed);
