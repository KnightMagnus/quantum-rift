import {
  mockGame,
  mockSession,
  mockEntity,
  mockMission,
  type FixtureShape,
} from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import type { Entity } from '../server/game.ts';
// Production targeting and damage regression coverage for the main-map newcomer truce.
import assert from 'node:assert/strict';
import { Space } from '../server/space.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';

let next = 1;
const ship = (faction: string, extra: FixtureShape<Entity> = {}) =>
  mockEntity({
    id: next++,
    faction,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    state: 'fly',
    ai: 'patrol',
    shield: 1000,
    armor: 1000,
    st: { armor: 1000, size: 50, maxSpeed: 200 },
    aggro: new Set(),
    target: null,
    think: 0,
    born: 0,
    life: 1000,
    inp: {},
    ...extra,
  });
const game = mockGame({
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  newcomer: Game.prototype.newcomer,
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  onHit: Game.prototype.onHit,
  features: { rivals: { rivalOnHit() {} }, specialists: {}, coop: {} },
});
function fixture(
  systemId: FixtureShape<import('../shared/galaxy.ts').StarSystem> = {
    danger: 5,
    faction: 'umbral',
    stellars: [],
  },
  operations = 2,
) {
  const space = Object.assign(Object.create(Space.prototype) as Space, {
    id: 'trial',
    sys: systemId,
    game,
    t: 10,
    ships: new Map(),
    events: [],
    loot: [],
    // Navigation is not under test: all acquisition, hostility and damage use production code.
    steer(entity: { inp: { thrust: number; turn: number } }) {
      entity.inp = { thrust: 1, turn: 0 };
      return 1000;
    },
    fight(shipEntity: Entity & { fireAt?: Entity }, target: Entity) {
      shipEntity.fireAt = target;
    },
    mayFlee() {
      return false;
    },
  });
  const session = mockSession({
    id: next++,
    data: { station: { ops: operations }, rep: { quantum: -50 } },
  });
  session.ent = ship('quantum', {
    player: { id: session.id, s: session, rep: session.data.rep },
    graceT: 0,
  });
  const nonPlayerShip = ship('umbral', { x: 100, ai: 'raid' });
  space.ships.set(requiredFixtureValue(session.ent).id, session.ent);
  space.ships.set(nonPlayerShip.id, nonPlayerShip);
  space.beginVisit(session);
  return { sp: space, s: session, player: session.ent, npc: nonPlayerShip };
}

let main = 0,
  farLayer = 0;
for (const systemId of Object.values(systemsById)) {
  const { sp: message, player, npc: nonPlayerShip } = fixture(systemId);
  if (systemId.arena) continue;
  assert.equal(message.newcomerTruce(nonPlayerShip, player), !systemId.farside, systemId.name);
  assert.equal(message.spared(nonPlayerShip, player), !systemId.farside, systemId.name);
  if (systemId.farside) farLayer++;
  else main++;
}
assert.ok(main > 0 && farLayer > 0);
for (const danger of [0, 1, 2, 3, 4, 5]) {
  for (const faction of ['quantum', 'hollow', 'umbral', 'deep']) {
    const { sp: message, player, npc: nonPlayerShip } = fixture({ danger, faction, stellars: [] });
    assert.equal(message.newcomerTruce(nonPlayerShip, player), true, `${faction} danger ${danger}`);
  }
}
for (const operations of [0, 1, 2, 3, 4]) {
  const { sp: message, player, npc: nonPlayerShip } = fixture(undefined, operations);
  assert.equal(message.newcomerTruce(nonPlayerShip, player), operations < 3);
  assert.equal(message.findTarget(nonPlayerShip), operations < 3 ? null : player);
}
for (const faction of ['quantum', 'hollow', 'umbral', 'deep']) {
  const { sp: message, player, npc: nonPlayerShip } = fixture();
  nonPlayerShip.faction = faction;
  Object.assign(nonPlayerShip, { boss: true });
  assert.equal(
    message.newcomerTruce(nonPlayerShip, player),
    true,
    `${faction} boss respects truce`,
  );
  assert.equal(message.findTarget(nonPlayerShip), null, `${faction} cannot acquire newcomer`);
}
for (const systemId of [
  { danger: 5, faction: 'umbral', farside: true, stellars: [] },
  { danger: 1, faction: 'quantum', arena: true, stellars: [] },
]) {
  const { sp: message, player, npc: nonPlayerShip } = fixture(systemId);
  assert.equal(message.newcomerTruce(nonPlayerShip, player), false);
}
{
  const { sp: message, player, npc: nonPlayerShip, s: session } = fixture();
  session.data.noShield = true;
  assert.equal(
    message.newcomerTruce(nonPlayerShip, player),
    false,
    'existing protection opt-out remains effective',
  );
}
{
  const { sp: message, player, npc: nonPlayerShip } = fixture();
  const patrol = ship('quantum', { x: 300 });
  const wing = ship('quantum', { owner: player.id, ai: 'escort' });
  message.ships.set(patrol.id, patrol);
  message.ships.set(wing.id, wing);
  assert.equal(
    message.newcomerTruce(nonPlayerShip, wing),
    true,
    'player-owned escorts inherit protection',
  );
  assert.equal(
    message.findTarget(nonPlayerShip),
    patrol,
    'ordinary NPC-versus-NPC fighting continues',
  );
}
{
  const {
    sp: message,
    player,
    npc: nonPlayerShip,
  } = fixture({
    danger: 5,
    faction: 'umbral',
    farside: true,
    stellars: [],
  });
  assert.equal(message.findTarget(nonPlayerShip), player, 'Farside NPCs still acquire newcomers');
  assert.equal(message.canHit(nonPlayerShip, player), true);
  player.graceT = 100;
  assert.equal(message.spared(nonPlayerShip, player), true, 'Farside arrival grace is preserved');
  assert.equal(
    message.canHit(nonPlayerShip, player),
    false,
    'arrival grace still blocks physical damage',
  );
  assert.equal(message.findTarget(nonPlayerShip), null);
}

// Mission danger is scoped to the participant, not every newcomer sharing the system.
for (const owned of [
  (systemId: number) => ({ mission: { owner: systemId } }),
  (systemId: number) => ({ storyKill: true, story: systemId }),
  (systemId: number) => ({ arcOf: { sid: systemId, fac: 'umbral' } }),
  (systemId: number) => ({ huntOf: systemId }),
  (systemId: number) => ({ combatOwners: [systemId] }),
]) {
  const { sp: message, player, npc: nonPlayerShip, s: session } = fixture();
  Object.assign(nonPlayerShip, owned(session.id));
  assert.equal(
    message.newcomerTruce(nonPlayerShip, player),
    false,
    'own mission remains dangerous',
  );
  assert.equal(
    message.findTarget(nonPlayerShip),
    player,
    'own mission NPC may actually acquire captain',
  );
  Object.assign(nonPlayerShip, owned(session.id + 10000));
  assert.equal(
    message.newcomerTruce(nonPlayerShip, player),
    true,
    'another captain mission does not void truce',
  );
  assert.equal(
    message.findTarget(nonPlayerShip),
    null,
    'another captain mission NPC cannot acquire protected bystander',
  );
}

// All accepting Armada contract members remain participants, not only its spawner.
{
  const { sp: message, player, npc: nonPlayerShip, s: session } = fixture();
  nonPlayerShip.kingpin = 'contract-1';
  Object.assign(nonPlayerShip, { mission: { owner: session.id + 10000 } });
  session.data.missions = [mockMission({ type: 'warband', id: 'contract-1', done: false })];
  assert.equal(message.newcomerTruce(nonPlayerShip, player), false);
  assert.equal(message.findTarget(nonPlayerShip), player);
  session.data.missions = [];
  assert.equal(message.newcomerTruce(nonPlayerShip, player), true);
}

// Ambient AI must drop old targets and reject both direct and inherited fleet targets.
{
  const { sp: message, player, npc: nonPlayerShip } = fixture();
  nonPlayerShip.target = player;
  message.ai(nonPlayerShip);
  assert.equal(nonPlayerShip.target, null, 'retained ambient target is cleared');
  assert.equal(message.findTarget(nonPlayerShip), null);
  const escort = ship('umbral', { ai: 'escort', owner: nonPlayerShip.id });
  message.ships.set(escort.id, escort);
  nonPlayerShip.target = player;
  message.ai(escort);
  assert.equal(escort.target, null, 'NPC escort cannot inherit protected captain target');
  const wing = ship('quantum', { ai: 'escort', owner: player.id });
  message.ships.set(wing.id, wing);
  nonPlayerShip.target = null;
  message.ai(wing);
  assert.equal(wing.target, null, 'passive player wing does not start ambient fight');
  assert.equal(message.findTarget(wing), null, 'passive wing acquisition respects truce');
  player.order = 'attack';
  player.target = nonPlayerShip;
  wing.think = 0;
  message.ai(wing);
  assert.equal(wing.target, nonPlayerShip, 'explicit wing attack remains available');
}

// The truce is targeting policy, not invulnerability. Crossing an NPC beam still hurts,
// without accidentally treating the victim captain as an aggressor.
{
  const { sp: message, player, npc: nonPlayerShip, s: session } = fixture();
  nonPlayerShip.x = 0;
  nonPlayerShip.y = 100;
  assert.equal(message.canHit(nonPlayerShip, player), true, 'incidental hostile fire can connect');
  assert.equal(
    message.ray(nonPlayerShip, 0, 500)?.s,
    player,
    'production beam collision sees protected captain',
  );
  const shield = player.shield;
  message.damage(player, 10, 10, nonPlayerShip);
  assert.equal(player.shield, shield - 10);
  assert.equal(
    player.aggro.size,
    0,
    'incidental damage does not authorize retaliatory auto-acquisition',
  );
  assert.equal(requiredFixtureValue(session.retaliationVisit).factions.size, 0);
  assert.equal(message.newcomerTruce(nonPlayerShip, player), true);
  assert.equal(message.findTarget(nonPlayerShip), null);
}

// Real captain/wing damage opts into a faction fight; zero damage and selection do not.
for (const byWing of [false, true]) {
  const { sp: message, player, npc: nonPlayerShip, s: session } = fixture();
  const outsider = ship('hollow', { x: 200 });
  const ally = ship('umbral', { x: 300 });
  const wing = ship('quantum', { owner: player.id, ai: 'escort' });
  for (const shipEntity of [outsider, ally, wing]) message.ships.set(shipEntity.id, shipEntity);
  player.target = nonPlayerShip;
  const source = byWing ? wing : player;
  message.damage(nonPlayerShip, 0, 0, source);
  assert.equal(message.newcomerTruce(nonPlayerShip, player), true);
  message.damage(nonPlayerShip, 10, 10, source);
  assert.equal(requiredFixtureValue(session.retaliationVisit).factions.has('umbral'), true);
  assert.equal(message.newcomerTruce(nonPlayerShip, player), false);
  assert.equal(message.newcomerTruce(ally, player), false);
  assert.equal(message.newcomerTruce(outsider, player), true);
  assert.equal(ally.target, player, 'faction help remains functional');
  player.graceT = 100;
  assert.equal(
    message.spared(nonPlayerShip, player),
    false,
    'voluntary aggression still overrides arrival grace',
  );
}

console.log(
  `Main-map protection passed: ${main} main-map and ${farLayer} Farside systems; danger/faction matrix, Ops threshold, owner-scoped missions, production AI, crossfire and voluntary retaliation.`,
);
