import assert from 'node:assert/strict';
import { Space } from '../server/space.ts';
import type { Entity } from '../server/space.ts';
import { mockEntity, mockSpace, mockWeaponMount } from './helpers/mocks.ts';

const mount = (
  range: number,
  options: { sec?: boolean; ammo?: number; pd?: boolean; bay?: boolean } = {},
) =>
  mockWeaponMount({
    w: 1,
    n: 1,
    ammo: options.ammo ?? Infinity,
    sec: options.sec ?? false,
    p: { range, turret: true, pd: options.pd, bay: options.bay },
  });
const traces: object[] = [];
function fixture(
  distance: number,
  options: { size?: number; turrets?: number; speed?: number; id?: number } = {},
) {
  const attacker = mockEntity({
    id: options.id ?? 2,
    x: 0,
    y: 0,
    vx: options.speed ?? 0,
    vy: 0,
    st: { size: options.size ?? 50, turrets: options.turrets ?? 0, maxSpeed: 100 },
    guns: [mount(600)],
    inp: { thrust: 0, turn: 0.25, fire1: 1 },
  });
  const target = mockEntity({ id: 90, x: distance, y: 0, vx: 0, vy: 0 });
  const calls: number[][] = [];
  const space = mockSpace({});
  space.steer = (entity, x, y, brake) => {
    assert.equal(entity, attacker, 'steering retains the live attacker');
    assert.equal(brake, false);
    assert.equal(entity.fireAt, undefined, 'fire target is assigned after steering');
    calls.push([x, y]);
    entity.inp.thrust = 1;
    return 0;
  };
  const run = (label: string) => {
    const input = attacker.inp,
      guns = attacker.guns;
    const targetBefore = JSON.stringify(target);
    Space.prototype.fight.call(space, attacker, target);
    assert.equal(calls.length, 1);
    assert.equal(attacker.fireAt, target, 'fire target retains identity');
    assert.equal(attacker.inp, input);
    assert.equal(attacker.guns, guns);
    assert.equal(attacker.inp.turn, 0.25);
    assert.equal(attacker.inp.fire1, 1, 'maneuvering does not own trigger policy');
    assert.equal(JSON.stringify(target), targetBefore, 'target is never mutated');
    traces.push({ label, calls, input: attacker.inp, fireAt: attacker.fireAt.id });
    return calls[0];
  };
  return { attacker, target, space, run };
}

for (const player of [false, true]) {
  const current = fixture(600, { speed: 75 });
  if (player) current.attacker.player = { id: 1 } as Entity['player'];
  current.attacker.guns = [mount(400), mount(1600, { sec: true })];
  assert.deepEqual(current.run(player ? 'Assist mixed battery' : 'NPC mixed battery'), [525, 0]);
  assert.equal(current.attacker.inp.thrust, 1, 'available primary closes despite long secondary');
}
for (const guns of [
  [mount(400, { ammo: 0 }), mount(1600, { sec: true })],
  [mount(400, { pd: true }), mount(1600, { sec: true })],
  [mount(400, { bay: true }), mount(1600, { sec: true })],
  [mount(1600, { sec: true })],
]) {
  const current = fixture(600, { speed: 75 });
  current.attacker.guns = guns;
  assert.deepEqual(current.run('secondary fallback'), [525, 0]);
  assert.equal(current.attacker.inp.thrust, 0, 'secondary range holds an already fast ship');
}
for (const guns of [
  [],
  [mount(1600, { ammo: 0 })],
  [mount(1600, { pd: true })],
  [mount(1600, { bay: true })],
]) {
  const current = fixture(300, { speed: 75 });
  current.attacker.guns = guns;
  assert.deepEqual(current.run('unarmed fallback'), [262.5, 0]);
  assert.equal(current.attacker.inp.thrust, 1, 'unusable batteries retain 300-unit fallback');
}
for (const distance of [449, 450, 451]) {
  const current = fixture(distance, { speed: 50 });
  current.run('three-quarter range ' + distance);
  assert.equal(current.attacker.inp.thrust, distance > 450 ? 1 : 0);
}
const lead = fixture(1200, { speed: 20 });
lead.target.vx = 40;
lead.target.vy = -30;
assert.deepEqual(lead.run('capped relative velocity lead'), [1224, -36]);
const close = fixture(119);
const away = close.run('close retreat');
assert.ok(Math.abs(away[0] - Math.sin(-Math.PI / 2 + 0.8) * 300) < 1e-10);
assert.ok(Math.abs(away[1] + Math.cos(-Math.PI / 2 + 0.8) * 300) < 1e-10);
assert.deepEqual(fixture(120).run('exact retreat threshold'), [120, 0]);
for (const id of [2, 3]) {
  for (const speed of [59, 60]) {
    const current = fixture(400, { id, size: 110, turrets: 2, speed });
    const point = current.run('capital parity ' + id + ' speed ' + speed);
    assert.ok(Math.abs(point[0]) < 1e-10);
    assert.equal(point[1], id === 2 ? -300 : 300);
    assert.equal(current.attacker.inp.thrust, speed < 60 ? 1 : 0);
  }
}
for (const distance of [140, 141, 299, 300, 480, 481, 659, 660]) {
  const current = fixture(distance, { size: 110, turrets: 2 });
  const point = current.run('capital threshold ' + distance);
  if (distance === 140 || distance === 660) assert.deepEqual(point, [distance, 0]);
  else assert.ok(Math.abs(point[1]) > 200, 'capital circles strictly inside its range window');
}
for (const options of [
  { size: 109, turrets: 2 },
  { size: 110, turrets: 1 },
]) {
  assert.deepEqual(fixture(400, options).run('non-capital fallback'), [400, 0]);
}
console.log(JSON.stringify(traces));
console.log(
  `Combat maneuver compatibility: ${traces.length} deterministic steering/input/identity traces pass.`,
);

for (const player of [false, true]) {
  const current = fixture(425, { size: 110, turrets: 2 });
  if (player) current.attacker.player = { id: 1 } as Entity['player'];
  current.attacker.autoCombat = true;
  current.attacker.combatManeuverTarget = current.target.id;
  current.attacker.combatLastHitT = 0;
  current.space.t = 6;
  const front = mount(1260);
  front.p.turret = false;
  current.attacker.guns = [mount(360), front];
  assert.deepEqual(current.run('mixed capital faces forward battery'), [425, 0]);
  assert.equal(current.attacker.inp.thrust, 1);
}
const fleeing = fixture(400, { size: 110, turrets: 2 });
fleeing.attacker.autoCombat = true;
fleeing.attacker.combatManeuverTarget = fleeing.target.id;
fleeing.attacker.combatLastHitT = 0;
fleeing.space.t = 6;
fleeing.target.vx = 60;
assert.deepEqual(fleeing.run('moving capital target prevents parallel chase'), [440, 0]);

const retargeted = fixture(400, { size: 110, turrets: 2 });
retargeted.attacker.autoCombat = true;
retargeted.attacker.combatForward = true;
retargeted.attacker.combatManeuverTarget = -1;
retargeted.run('new target clears stale recovery');
assert.equal(retargeted.attacker.combatForward, false);
