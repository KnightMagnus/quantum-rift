import assert from 'node:assert/strict';
import { CombatAssist } from '../server/combat-assist.js';
import { Space } from '../server/space.js';
import { winOdds } from '../shared/hostile.js';
let n = 1;
const ship = (pw = 100) => ({
  id: n++,
  pw,
  strength: pw,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  a: 0,
  armor: 100,
  st: { armor: 100, size: 30, maxSpeed: 100, turn: 1, accel: 30, turrets: 0 },
  state: 'fly',
  guns: [],
  aggro: new Set(),
  inp: {},
  target: null,
});
const sessions = new Map();
const armada = { id: 'a', leader: 'Leader', members: ['Leader', 'Follower', 'Independent'] };
const game = {
  sessions,
  spaces: {},
  features: {
    coop: {
      armadaOf: (d) => (d.armada === 'a' ? armada : null),
      sessionOf: (name) => [...sessions.values()].find((s) => s.data.name === name),
    },
  },
};
const sp = {
  id: 's',
  t: 10,
  sys: {},
  ships: new Map(),
  root(e) {
    return e.owner ? this.root(this.ships.get(e.owner)) : e;
  },
  isHostile: (a, b) => !!b.enemy,
  spared: () => false,
};
game.spaces.s = sp;
game.combatAssist = new CombatAssist(game);
const service = game.combatAssist;
function captain(name) {
  const e = ship(),
    s = {
      data: { name, sys: 's', armada: 'a', armadaFollow: true },
      ent: e,
      inputs: [],
      lastInput: null,
    };
  e.player = { s };
  sessions.set(name, s);
  sp.ships.set(e.id, e);
  return s;
}
const leader = captain('Leader'),
  follower = captain('Follower'),
  independent = captain('Independent');
const wing = ship(50);
wing.owner = follower.ent.id;
sp.ships.set(wing.id, wing);
const foe = ship(200),
  stronger = ship(400);
for (const e of [foe, stronger]) {
  e.enemy = true;
  e.target = wing;
  sp.ships.set(e.id, e);
}
service.command(leader, { op: 'assist', on: true });
assert.equal(service.power(sp, [leader]), 100);
assert.equal(
  service.power(sp, [follower]),
  130,
  'live wing strength counted at existing escort weight',
);
service.command(leader, { op: 'coordinate', on: true });
service.command(follower, { op: 'delegate', on: true });
service.resolve(sp);
assert.equal(leader.ent.combatTarget, stronger, 'highest danger uses lowest odds');
assert.equal(follower.ent.combatTarget, stronger);
assert.equal(wing.target, stronger);
assert.equal(independent.ent.autoCombat, false, 'nonconsenting member stays manual');
service.manual(leader);
service.resolve(sp);
assert.equal(leader.ent.autoCombat, false);
assert.equal(follower.ent.autoCombat, true, 'manual leader still coordinates followers');
assert.equal(
  service.payload(leader, sp).power,
  230,
  'lead and following fleet counted exactly once',
);
assert.equal(service.payload(follower, sp).power, 230, 'follower HUD uses same command power');
assert.ok(winOdds(230, 400) > winOdds(100, 400));
stronger.disabled = true;
service.resolve(sp);
assert.equal(leader.ent.combatTarget, foe, 'handoff ignores disabled ship');
wing.disabled = true;
assert.equal(service.payload(leader, sp).power, 200, 'disabled wing excluded');
wing.disabled = false;
foe.target = null;
stronger.disabled = false;
stronger.target = null;
leader.combat.target = 0;
foe.aggro.add(leader.ent.id);
service.resolve(sp);
assert.equal(
  leader.ent.combatTarget,
  null,
  'stale aggression and nonattacking hostiles are not acquired',
);
foe.target = follower.ent;
service.resolve(sp);
assert.equal(leader.ent.combatTarget, foe);
stronger.target = leader.ent;
service.resolve(sp);
assert.equal(leader.ent.combatTarget, foe, 'valid target remains stable');
// An explicit follower Attack must leave coordination without changing the group's target.
follower.ent.target = stronger;
service.attack(follower, sp);
service.resolve(sp);
assert.equal(follower.combat.consent, null, 'local Attack revokes delegated consent');
assert.equal(follower.ent.autoCombat, false, 'local Attack returns lead ship to manual flight');
assert.equal(follower.ent.target, stronger, 'manual selection is preserved');
assert.equal(follower.ent.combatTarget, stronger, 'local fleet focuses its explicit target');
assert.equal(wing.target, stronger);
assert.equal(leader.ent.combatTarget, foe, 'leader target is not changed by follower takeover');
assert.equal(independent.ent.autoCombat, false);
service.command(follower, { op: 'delegate', on: true });
service.resolve(sp);
follower.data.armadaFollow = false;
service.resolve(sp);
assert.equal(follower.combat.consent, null);
assert.equal(follower.ent.autoCombat, false);
assert.equal(service.payload(leader, sp).power, 100);
follower.data.armadaFollow = true;
service.resolve(sp);
assert.equal(follower.ent.autoCombat, false, 'follow alone does not rearm');
service.command(follower, { op: 'delegate', on: true });
service.resolve(sp);
armada.leader = 'Independent';
service.resolve(sp);
assert.equal(follower.combat.consent, null, 'leader transfer revokes consent');
armada.leader = 'Leader';
service.command(follower, { op: 'delegate', on: true });
service.resolve(sp);
service.stop(follower);
service.resolve(sp);
assert.equal(follower.ent.autoCombat, false, 'manual takeover remains manual');
service.command(follower, { op: 'delegate', on: true });
service.resolve(sp);
follower.ent.order = 'holdfire';
service.resolve(sp);
assert.equal(follower.combat.consent, null, 'local Hold Fire wins');
follower.ent.order = 'gather';
for (const [name, change, restore] of [
  [
    'system separation',
    () => {
      follower.data.sys = 'elsewhere';
    },
    () => {
      follower.data.sys = 's';
    },
  ],
  [
    'kick',
    () => {
      armada.members = armada.members.filter((n) => n !== 'Follower');
    },
    () => {
      armada.members.push('Follower');
    },
  ],
  [
    'leader disconnect',
    () => {
      sessions.delete('Leader');
    },
    () => {
      sessions.set('Leader', leader);
    },
  ],
]) {
  service.command(leader, { op: 'coordinate', on: true });
  service.command(follower, { op: 'delegate', on: true });
  service.resolve(sp);
  change();
  if (name === 'system separation') service.delegation(follower, sp);
  else service.resolve(sp);
  assert.equal(follower.combat.consent, null, name + ' revokes delegation');
  restore();
}
service.command(leader, { op: 'assist', on: true });
leader.ent.state = 'jumpout';
service.resolve(sp);
assert.equal(leader.combat.on, false, 'travel cancels assist');
leader.ent.state = 'fly';
// Exercise the actual weapon step, not a duplicate firing implementation.
const shooter = ship();
shooter.player = {};
shooter.autoCombat = true;
shooter.combatTarget = foe;
shooter.inp = { fire1: 1, fire2: 1 };
shooter.guns = [
  { p: { range: 100, speed: 600, reload: 1 }, ammo: Infinity, cd: 0, sec: false },
  { p: { range: 1000, rocket: true }, ammo: 10, cd: 0, sec: true },
  { p: { bay: true }, ammo: 3, cd: 0, sec: true },
];
foe.x = 500;
const fired = [];
const weaponSpace = {
  ...sp,
  game,
  shots: [],
  A: { weapons: {} },
  fire: (...args) => fired.push(args),
  toggleDrones: () => assert.fail('automation toggled bays'),
};
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 0, 'automated primary respects range and secondaries remain unused');
foe.x = 50;
shooter.a = Math.PI;
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 0, 'fixed guns respect firing arc');
shooter.a = Math.PI / 2;
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 1, 'in-range aligned primary fires');
foe.disabled = true;
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 1, 'disabled target gets no new intentional shot');
console.log(
  'Combat assist: fleet/group power, focus/handoff, authority revocation, stop orders, stale aggression, range/arc and primary-only firing passed.',
);
