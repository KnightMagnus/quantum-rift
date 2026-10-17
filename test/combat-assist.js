import assert from 'node:assert/strict';
import { CombatAssist } from '../server/combat-assist.js';
import { Space } from '../server/space.js';
import { Game } from '../server/game.js';
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
  canHit: Space.prototype.canHit,
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
// A target selected BEFORE enabling assist must initiate combat without being an attacker.
const selectedLead = ship(),
  selectedFoe = ship();
selectedLead.a = 0;
selectedFoe.y = -1000;
selectedFoe.enemy = true;
selectedFoe.target = null;
selectedLead.target = selectedFoe;
selectedLead.shield = selectedFoe.shield = 100;
selectedLead.st.shield = selectedFoe.st.shield = 100;
selectedLead.st.shieldRe = selectedFoe.st.shieldRe = 0;
selectedLead.guns = [
  { p: { range: 300, speed: 600, reload: 1 }, ammo: Infinity, cd: 0, sec: false },
];
const selectedSession = {
  data: { name: 'Selected', sys: 'selected' },
  ent: selectedLead,
  inputs: [],
  lastInput: null,
};
selectedLead.player = selectedSession;
const selectedGame = {
  sessions: new Map([['Selected', selectedSession]]),
  spaces: {},
  features: {
    fronts: { mods: () => null },
    coop: { armadaOf: () => null },
    mining: { endTick() {} },
  },
};
const selectedSpace = Object.assign(Object.create(Space.prototype), {
  game: selectedGame,
  id: 'selected',
  sys: { stellars: [] },
  ships: new Map([
    [selectedLead.id, selectedLead],
    [selectedFoe.id, selectedFoe],
  ]),
  t: 0,
  players: 0,
  m: { shieldRe: 1 },
  mT: 1,
  shots: [],
  beams: [],
  rocks: [],
  loot: [],
  events: [],
  isHostile: (a, b) => !!b.enemy,
  spared: () => false,
  ai() {},
});
selectedGame.spaces.selected = selectedSpace;
const selectionAssist = (selectedGame.combatAssist = new CombatAssist(selectedGame));
selectionAssist.selected(selectedSession, selectedFoe, selectedSpace);
assert.equal(
  selectionAssist.state(selectedSession).target,
  0,
  'ordinary selection alone does not arm combat',
);
selectionAssist.command(selectedSession, { op: 'assist', on: true });
assert.equal(
  selectedSession.combat.target,
  selectedFoe.id,
  'explicit enable adopts valid existing selection',
);
const selectedShots = [];
selectedSpace.fire = (...args) => selectedShots.push(args);
selectedSpace.tick();
assert.equal(
  selectedLead.combatTarget,
  selectedFoe,
  'nonattacking selected hostile becomes combat target',
);
assert.ok(
  selectedLead.inp.thrust && selectedLead.vy < 0,
  'actual Space tick pursues the selected hostile',
);
assert.equal(selectedShots.length, 0, 'pursuit does not fire beyond primary range');
selectedFoe.y = selectedLead.y - 200;
selectedSpace.tick();
assert.equal(
  selectedShots.length,
  1,
  'actual Space tick fires an aligned in-range primary without a prior attack order',
);
selectionAssist.manual(selectedSession);
assert.equal(
  selectedSession.combat.on,
  false,
  'manual takeover still disarms selection-started assist',
);
// Invalid preselection cannot override a valid existing handoff or bypass target safeguards.
const handoffFoe = ship();
handoffFoe.enemy = true;
handoffFoe.y = selectedLead.y - 200;
selectedSpace.ships.set(handoffFoe.id, handoffFoe);
for (const [label, apply, undo] of [
  [
    'own wing',
    () => {
      selectedFoe.owner = selectedLead.id;
    },
    () => {
      delete selectedFoe.owner;
    },
  ],
  [
    'disabled',
    () => {
      selectedFoe.disabled = true;
    },
    () => {
      selectedFoe.disabled = false;
    },
  ],
  [
    'destroyed',
    () => {
      selectedFoe.dead = true;
    },
    () => {
      selectedFoe.dead = false;
    },
  ],
  [
    'protected',
    () => {
      selectedSpace.spared = (a, b) => a === selectedFoe || b === selectedFoe;
    },
    () => {
      selectedSpace.spared = () => false;
    },
  ],
  [
    'out of range',
    () => {
      selectedFoe.y = selectedLead.y - 2201;
    },
    () => {
      selectedFoe.y = selectedLead.y - 200;
    },
  ],
  [
    'player',
    () => {
      selectedFoe.player = {};
    },
    () => {
      delete selectedFoe.player;
    },
  ],
]) {
  selectedSession.combat.target = handoffFoe.id;
  apply();
  selectionAssist.command(selectedSession, { op: 'assist', on: true });
  assert.equal(
    selectedSession.combat.target,
    handoffFoe.id,
    label + ' preselection does not replace existing handoff',
  );
  selectionAssist.resolve(selectedSpace);
  assert.equal(
    selectedLead.combatTarget,
    handoffFoe,
    label + ' preselection preserves valid handoff on resolve',
  );
  selectedSession.combat.target = 0;
  selectionAssist.command(selectedSession, { op: 'assist', on: true });
  selectionAssist.resolve(selectedSpace);
  assert.equal(
    selectedLead.combatTarget,
    null,
    label + ' preselection does not start a new engagement',
  );
  undo();
}
// Use actual Space hostility/protection methods: a player's own newcomer/jump truce
// protects them from NPC initiation, not from deliberately returning fire first.
delete selectedSpace.isHostile;
delete selectedSpace.spared;
selectedSpace.sys.faction = 'quantum';
selectedSpace.sys.danger = 1;
selectedGame.newcomer = Game.prototype.newcomer;
selectedGame.features.rivals = {};
selectedLead.player = { id: 1, rep: {}, inputs: [], lastInput: null, s: selectedSession };
selectedFoe.faction = 'hollow';
selectedLead.faction = 'quantum';
selectedFoe.target = null;
handoffFoe.target = null;
for (const scenario of ['newcomer', 'jump grace']) {
  selectedSession.data.station = { ops: scenario === 'newcomer' ? 0 : 3 };
  selectedLead.graceT = scenario === 'jump grace' ? selectedSpace.t + 5 : 0;
  assert.equal(
    selectedSpace.isHostile(selectedLead, selectedFoe),
    true,
    scenario + ': genuine faction hostility',
  );
  assert.equal(
    selectedSpace.spared(selectedFoe, selectedLead),
    true,
    scenario + ': NPC cannot initiate',
  );
  assert.equal(
    selectedSpace.canHit(selectedFoe, selectedLead),
    scenario === 'newcomer',
    scenario + ': only arrival grace blocks incidental damage',
  );
  assert.equal(
    selectedSpace.canHit(selectedLead, selectedFoe),
    true,
    scenario + ': manual player fire is legal',
  );
  selectionAssist.stop(selectedSession);
  selectedLead.target = selectedFoe;
  selectionAssist.command(selectedSession, { op: 'assist', on: true });
  assert.equal(
    selectedSession.combat.target,
    selectedFoe.id,
    scenario + ': explicit assist honors the same legal attack',
  );
  const beforeShots = selectedShots.length;
  selectedSpace.tick();
  assert.equal(selectedLead.combatTarget, selectedFoe);
  assert.equal(
    selectedShots.length,
    beforeShots + 1,
    scenario + ': actual tick fires primary without prior NPC aggression',
  );
  selectionAssist.stop(selectedSession);
  selectedLead.target = null;
  selectionAssist.command(selectedSession, { op: 'assist', on: true });
  selectionAssist.resolve(selectedSpace);
  assert.equal(
    selectedLead.combatTarget,
    null,
    scenario + ': passive enable does not hunt nonattacking hostiles',
  );
}
// Accidental crossfire while protected must not silently opt passive Assist in.
selectedLead.graceT = 0;
selectedSession.data.station = { ops: 2 };
selectedSpace.sys.faction = 'umbral';
selectedSpace.sys.danger = 5;
selectedFoe.faction = 'umbral';
selectedFoe.target = null;
selectedLead.lastHitBy = selectedFoe.id;
selectedLead.hitT = selectedSpace.t;
selectionAssist.stop(selectedSession);
selectedLead.target = null;
selectionAssist.command(selectedSession, { op: 'assist', on: true });
selectionAssist.resolve(selectedSpace);
assert.equal(
  selectedLead.combatTarget,
  null,
  'passive Assist does not escalate incidental crossfire',
);
selectedFoe.mission = { owner: selectedLead.player.id };
selectionAssist.resolve(selectedSpace);
assert.equal(selectedLead.combatTarget, selectedFoe, 'own accepted bounty remains a real fight');
delete selectedFoe.mission;
selectedLead.lastHitBy = 0;
// Inner neutral traffic is a deliberate, legal target, not an automatic enemy.
selectedLead.graceT = 0;
selectedFoe.faction = 'quantum';
selectedSession.data.station = { ops: 0 };
selectedFoe.target = selectedLead;
assert.equal(selectedSpace.isHostile(selectedLead, selectedFoe), false);
assert.equal(selectedSpace.canHit(selectedLead, selectedFoe), true);
selectionAssist.stop(selectedSession);
selectedLead.target = null;
selectionAssist.command(selectedSession, { op: 'assist', on: true });
selectionAssist.resolve(selectedSpace);
assert.equal(selectedLead.combatTarget, null, 'passive assist does not acquire neutral traffic');
selectionAssist.stop(selectedSession);
selectedLead.target = selectedFoe;
selectedFoe.target = null;
selectedFoe.y = selectedLead.y - 1000;
selectionAssist.command(selectedSession, { op: 'assist', on: true });
selectedSpace.tick();
assert.equal(
  selectedLead.combatTarget,
  selectedFoe,
  'explicit assist adopts preselected neutral NPC',
);
assert.ok(selectedLead.inp.thrust, 'explicit neutral attack pursues');
selectedFoe.y = selectedLead.y - 200;
for (const g of selectedLead.guns) g.cd = 0;
const beforeNeutralShots = selectedShots.length;
selectedSpace.tick();
assert.equal(
  selectedShots.length,
  beforeNeutralShots + 1,
  'explicit neutral attack fires primaries',
);
selectionAssist.stop(selectedSession);
assert.equal(selectedLead.autoCombat, false);
console.log(
  'Combat assist: fleet/group power, focus/handoff, authority revocation, stop orders, stale aggression, range/arc, preselected-target pursuit and primary-only firing passed.',
);
