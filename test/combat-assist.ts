import { requiredFixtureValue } from './helpers/required.ts';
import {
  mockGame,
  mockSpace,
  mockEntity,
  mockSession,
  mockWeaponMount,
  mockPlayerReference,
  mockStation,
  mockMission,
  mockRivals,
} from './helpers/mocks.ts';
import type { Entity } from '../server/space.ts';
import type { CombatState } from '../server/combat-assist.ts';
import type { Session } from '../server/game.ts';
type CombatFixtureEntity = Entity & {
  /** Test or hostile flag. */
  enemy?: boolean;
};
import assert from 'node:assert/strict';
import { CombatAssist } from '../server/combat-assist.ts';
import { Space } from '../server/space.ts';
import { Game } from '../server/game.ts';
import { winOdds } from '../shared/hostile.ts';
let quantity = 1;
const ship = (combatPower = 100) =>
  mockEntity({
    id: quantity++,
    pw: combatPower,
    strength: combatPower,
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
  }) as CombatFixtureEntity;
const sessions = new Map<number, Session>();
const armada = { id: 'a', leader: 'Leader', members: ['Leader', 'Follower', 'Independent'] };
const game = mockGame({
  sessions,
  spaces: {},
  features: {
    coop: {
      armadaOf: (playerData) => (playerData?.armada === 'a' ? armada : null),
      sessionOf: (name: string) =>
        [...sessions.values()].find((session) => session.data.name === name) || null,
    },
  },
});
const space = mockSpace({
  id: 's',
  t: 10,
  sys: {},
  ships: new Map(),
  root(entity: Entity | null): Entity | null {
    if (!entity) return null;
    return entity.owner ? space.root(requiredFixtureValue(space.ships.get(entity.owner))) : entity;
  },
  isHostile: (shipEntity: Entity, shipEntity2: Entity) =>
    'enemy' in shipEntity2 && Boolean(shipEntity2.enemy),
  // oxlint-disable-next-line typescript/unbound-method -- Invoke this production method with the explicit fixture receiver.
  canHit: Space.prototype.canHit,
  spared: () => false,
});
game.spaces.s = space;
game.combatAssist = new CombatAssist(game);
const service = game.combatAssist;
function captain(name: string) {
  const shipEntity = ship(),
    session = mockSession({
      data: { name, sys: 's', armada: 'a', armadaFollow: true },
      ent: shipEntity,
      inputs: [],
      lastInput: null,
    });
  shipEntity.player = mockPlayerReference({ s: session });
  sessions.set(shipEntity.id, session);
  space.ships.set(shipEntity.id, shipEntity);
  return session as Session & { ent: CombatFixtureEntity; combat: CombatState };
}
const leader = captain('Leader'),
  follower = captain('Follower'),
  independent = captain('Independent');
const wing = ship(50);
wing.owner = follower.ent.id;
space.ships.set(wing.id, wing);
const enemyEntity = ship(200),
  stronger = ship(400);
for (const shipEntity of [enemyEntity, stronger]) {
  shipEntity.enemy = true;
  shipEntity.target = wing;
  space.ships.set(shipEntity.id, shipEntity);
}
service.command(leader, { op: 'assist', on: true });
assert.equal(service.power(space, [leader]), 100);
assert.equal(
  service.power(space, [follower]),
  130,
  'live wing strength counted at existing escort weight',
);
service.command(leader, { op: 'coordinate', on: true });
service.command(follower, { op: 'delegate', on: true });
service.resolve(space);
assert.equal(leader.ent.combatTarget, stronger, 'highest danger uses lowest odds');
assert.equal(follower.ent.combatTarget, stronger);
assert.equal(wing.target, stronger);
assert.equal(independent.ent.autoCombat, false, 'nonconsenting member stays manual');
service.manual(leader);
service.resolve(space);
assert.equal(leader.ent.autoCombat, false);
assert.equal(follower.ent.autoCombat, true, 'manual leader still coordinates followers');
assert.equal(
  service.payload(leader, space).power,
  230,
  'lead and following fleet counted exactly once',
);
assert.equal(service.payload(follower, space).power, 230, 'follower HUD uses same command power');
assert.ok(winOdds(230, 400) > winOdds(100, 400));
stronger.disabled = true;
service.resolve(space);
assert.equal(leader.ent.combatTarget, enemyEntity, 'handoff ignores disabled ship');
wing.disabled = true;
assert.equal(service.payload(leader, space).power, 200, 'disabled wing excluded');
wing.disabled = false;
enemyEntity.target = null;
stronger.disabled = false;
stronger.target = null;
leader.combat.target = 0;
enemyEntity.aggro.add(leader.ent.id);
service.resolve(space);
assert.equal(
  leader.ent.combatTarget,
  null,
  'stale aggression and nonattacking hostiles are not acquired',
);
enemyEntity.target = follower.ent;
service.resolve(space);
assert.equal(leader.ent.combatTarget, enemyEntity);
stronger.target = leader.ent;
service.resolve(space);
assert.equal(leader.ent.combatTarget, enemyEntity, 'valid target remains stable');
// An explicit follower Attack must leave coordination without changing the group's target.
follower.ent.target = stronger;
service.attack(follower, space);
service.resolve(space);
assert.equal(follower.combat.consent, null, 'local Attack revokes delegated consent');
assert.equal(follower.ent.autoCombat, false, 'local Attack returns lead ship to manual flight');
assert.equal(follower.ent.target, stronger, 'manual selection is preserved');
assert.equal(follower.ent.combatTarget, stronger, 'local fleet focuses its explicit target');
assert.equal(wing.target, stronger);
assert.equal(
  leader.ent.combatTarget,
  enemyEntity,
  'leader target is not changed by follower takeover',
);
assert.equal(independent.ent.autoCombat, false);
service.command(follower, { op: 'delegate', on: true });
service.resolve(space);
follower.data.armadaFollow = false;
service.resolve(space);
assert.equal(follower.combat.consent, null);
assert.equal(follower.ent.autoCombat, false);
assert.equal(service.payload(leader, space).power, 100);
follower.data.armadaFollow = true;
service.resolve(space);
assert.equal(follower.ent.autoCombat, false, 'follow alone does not rearm');
service.command(follower, { op: 'delegate', on: true });
service.resolve(space);
armada.leader = 'Independent';
service.resolve(space);
assert.equal(follower.combat.consent, null, 'leader transfer revokes consent');
armada.leader = 'Leader';
service.command(follower, { op: 'delegate', on: true });
service.resolve(space);
service.stop(follower);
service.resolve(space);
assert.equal(follower.ent.autoCombat, false, 'manual takeover remains manual');
service.command(follower, { op: 'delegate', on: true });
service.resolve(space);
follower.ent.order = 'holdfire';
service.resolve(space);
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
      armada.members = armada.members.filter((quantity3) => quantity3 !== 'Follower');
    },
    () => {
      armada.members.push('Follower');
    },
  ],
  [
    'leader disconnect',
    () => {
      sessions.delete(leader.ent.id);
    },
    () => {
      sessions.set(leader.ent.id, leader);
    },
  ],
] as const) {
  service.command(leader, { op: 'coordinate', on: true });
  service.command(follower, { op: 'delegate', on: true });
  service.resolve(space);
  change();
  if (name === 'system separation') service.delegation(follower, space);
  else service.resolve(space);
  assert.equal(follower.combat.consent, null, name + ' revokes delegation');
  restore();
}
service.command(leader, { op: 'assist', on: true });
leader.ent.state = 'jumpout';
service.resolve(space);
assert.equal(leader.combat.on, false, 'travel cancels assist');
leader.ent.state = 'fly';
// Exercise the actual weapon step, not a duplicate firing implementation.
const shooter = ship();
shooter.player = mockPlayerReference({});
shooter.autoCombat = true;
shooter.combatTarget = enemyEntity;
shooter.inp = { fire1: 1, fire2: 1 };
shooter.guns = [
  { p: { range: 100, speed: 600, reload: 1 }, ammo: Infinity, cd: 0, sec: false },
  { p: { range: 1000, rocket: true }, ammo: 10, cd: 0, sec: true },
  { p: { bay: true }, ammo: 3, cd: 0, sec: true },
].map(mockWeaponMount);
enemyEntity.x = 500;
const fired: Parameters<Space['fire']>[] = [];
const weaponSpace = mockSpace(
  Object.assign({}, space, {
    game,
    shots: [],
    A: { weapons: {} },
    fire: (...args: Parameters<Space['fire']>) => fired.push(args),
    toggleDrones: () => assert.fail('automation toggled bays'),
  }),
);
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 0, 'automated primary respects range and secondaries remain unused');
enemyEntity.x = 50;
shooter.a = Math.PI;
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 0, 'fixed guns respect firing arc');
shooter.a = Math.PI / 2;
Space.prototype.weapons.call(weaponSpace, shooter);
assert.equal(fired.length, 1, 'in-range aligned primary fires');
enemyEntity.disabled = true;
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
].map(mockWeaponMount);
const selectedSession = mockSession({
  data: { name: 'Selected', sys: 'selected' },
  ent: selectedLead,
  inputs: [],
  lastInput: null,
});
// This truthy marker intentionally omits a live player-reference wrapper.
selectedLead.player = selectedSession as unknown as NonNullable<Entity['player']>;
const selectedGame = mockGame({
  sessions: new Map([[selectedLead.id, selectedSession]]),
  spaces: {},
  features: {
    fronts: { mods: () => ({}) },
    coop: { armadaOf: () => null },
    mining: { endTick() {} },
    // This combat-only Space fixture has no persisted motherlodes.
    towing: { towingTick() {} },
    pressure: { pressureTick() {} },
  },
});
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
  isHostile: (shipEntity: Entity, shipEntity2: Entity) =>
    'enemy' in shipEntity2 && Boolean(shipEntity2.enemy),
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
  requiredFixtureValue(selectedSession.combat).target,
  selectedFoe.id,
  'explicit enable adopts valid existing selection',
);
const selectedShots: Parameters<Space['fire']>[] = [];
selectedSpace.fire = (...args: Parameters<Space['fire']>) => selectedShots.push(args);
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
  requiredFixtureValue(selectedSession.combat).on,
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
      Reflect.deleteProperty(selectedFoe, 'owner');
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
      selectedSpace.spared = (shipEntity: Entity, shipEntity2: Entity) =>
        shipEntity === selectedFoe || shipEntity2 === selectedFoe;
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
      selectedFoe.player = mockPlayerReference({});
    },
    () => {
      Reflect.deleteProperty(selectedFoe, 'player');
    },
  ],
] as const) {
  requiredFixtureValue(selectedSession.combat).target = handoffFoe.id;
  apply();
  selectionAssist.command(selectedSession, { op: 'assist', on: true });
  assert.equal(
    requiredFixtureValue(selectedSession.combat).target,
    handoffFoe.id,
    label + ' preselection does not replace existing handoff',
  );
  selectionAssist.resolve(selectedSpace);
  assert.equal(
    selectedLead.combatTarget,
    handoffFoe,
    label + ' preselection preserves valid handoff on resolve',
  );
  requiredFixtureValue(selectedSession.combat).target = 0;
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
Reflect.deleteProperty(selectedSpace, 'isHostile');
Reflect.deleteProperty(selectedSpace, 'spared');
selectedSpace.sys.faction = 'quantum';
selectedSpace.sys.danger = 1;
// oxlint-disable-next-line typescript/unbound-method -- Invoke this production method with the explicit fixture receiver.
selectedGame.newcomer = Game.prototype.newcomer;
selectedGame.features.rivals = mockRivals({});
selectedLead.player = mockPlayerReference({
  id: 1,
  rep: {},
  inputs: [],
  lastInput: null,
  s: selectedSession,
});
selectedFoe.faction = 'hollow';
selectedLead.faction = 'quantum';
selectedFoe.target = null;
handoffFoe.target = null;
for (const scenario of ['newcomer', 'jump grace']) {
  selectedSession.data.station = mockStation({ ops: scenario === 'newcomer' ? 0 : 3 });
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
    requiredFixtureValue(selectedSession.combat).target,
    selectedFoe.id,
    scenario + ': explicit assist honors the same legal attack',
  );
  const beforeShots: number = selectedShots.length;
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
selectedSession.data.station = mockStation({ ops: 2 });
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
selectedFoe.mission = mockMission({ owner: requiredFixtureValue(selectedLead.player).id });
selectionAssist.resolve(selectedSpace);
assert.equal(selectedLead.combatTarget, selectedFoe, 'own accepted bounty remains a real fight');
Reflect.deleteProperty(selectedFoe, 'mission');
selectedLead.lastHitBy = 0;
// Inner neutral traffic is a deliberate, legal target, not an automatic enemy.
selectedLead.graceT = 0;
selectedFoe.faction = 'quantum';
selectedSession.data.station = mockStation({ ops: 0 });
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
for (const game3 of selectedLead.guns) game3.cd = 0;
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
