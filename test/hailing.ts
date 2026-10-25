import { PLAYER_PORTRAITS } from '../shared/portraits.ts';
import { mockGame, mockSpace, mockSession, mockEntity } from './helpers/mocks.ts';
import type { FixtureShape } from './helpers/mocks.ts';
import type { Entity, Session, Game } from '../server/game.ts';
type CapturedHail = {
  to: number;
  portraitId?: string;
  t?: string;
  key?: string;
  player?: number;
  id?: number;
  x?: number;
  text?: string;
  opts?: unknown[];
};
import { requiredFixtureValue } from './helpers/required.ts';
import { Space } from '../server/space.ts';
import assert from 'node:assert/strict';
import { HailService, HAIL_LIMITS, hailText } from '../server/hail-service.ts';
import { contextualHail } from '../server/hail-dialogue.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
const systemId = Object.keys(systemsById)[0];
let currentTime = 10000000;
const sent: CapturedHail[] = [],
  toasts: string[] = [];
const message = mockSpace({
  id: systemId,
  ships: new Map(),
  root: (entity) => entity,
  isHostile: (shipEntity, _secondValue) => !!(shipEntity as Entity & { hostile?: boolean }).hostile,
});
const player = (identifier: number, name: string) => {
  const session = mockSession({
    id: identifier,
    data: {
      name,
      sys: systemId,
      credits: 2000,
      fuel: 200,
      rep: {},
      dmAll: true,
      blocks: [],
      friends: [],
    },
    ent: {
      id: identifier,
      x: 0,
      y: 0,
      state: 'fly',
      fuel: 200,
      armor: 100,
      st: { armor: 100, fuel: 300 },
      aggro: new Set(),
    },
  }) as Session & { ent: Entity };
  session.ent!.player = { s: session } as NonNullable<Entity['player']>;
  message.ships.set(identifier, session.ent);
  return session;
};
const session = player(1, 'Alpha'),
  session2 = player(2, 'Beta');
const game = mockGame({
  A: { ships: { 1: { name: 'Transport' } } },
  spaces: { [systemId]: message },
  live: { [systemId]: message },
  sessions: new Map([
    [1, session],
    [2, session2],
  ]),
  send: (session3, message) =>
    sent.push({
      to: (session3 as Session).id,
      ...(typeof message === 'string' ? JSON.parse(message) : message),
    }),
  toast: (session4, message3) => toasts.push(message3),
  you() {},
  db: { touch() {} },
  features: {
    nhal: { ai: () => false },
    indexFleet: { ai: () => false },
    index: { ai: () => false },
    coop: {
      blocked: (playerData, quantity) => playerData!.blocks.includes(quantity), // This fixture has no armadas; retain its saved-ID sentinel boundary.
      armadaOf: ((playerData: { armada?: unknown }) =>
        playerData.armada) as unknown as Game['features']['coop']['armadaOf'],
    },
    rivals: { relOf: () => 40, rivalRel() {} },
  },
});
message.game = game;
const service = (game.hails = new HailService(
  game,
  () => currentTime,
  () => 0.5,
));
const nonPlayerShip = (
  identifier: number,
  more: FixtureShape<Entity> & { hostile?: boolean } = {},
) => {
  const shipEntity = mockEntity({
    id: identifier,
    hull: 1,
    faction: 'spacer',
    x: 100,
    y: 0,
    ai: 'trade',
    state: 'fly',
    armor: 80,
    shield: 100,
    fuel: 20,
    st: { armor: 100, shield: 100, fuel: 200 },
    life: 300,
    ...more,
  });
  message.ships.set(identifier, shipEntity);
  return shipEntity;
};
const silentNhal = nonPlayerShip(983, { faction: 'nhal' });
assert.equal(
  service.offer(session, silentNhal, 'beg'),
  false,
  'Nhal never receive generic organic dialogue even when the fixture is nonhostile',
);
message.ships.delete(silentNhal.id);
assert.equal(hailText('😀'.repeat(100)), '😀'.repeat(100));
assert.equal(hailText('😀'.repeat(101)), null);
for (const entry of ['', '  ', {}, '\u0000']) assert.equal(hailText(entry), null);
session.data.portraitId = PLAYER_PORTRAITS.at(-1)!.id;
service.player(session, session2.ent, '<img onerror=bad>');
let shipStats = service.state(session2);
assert.equal(shipStats.queue.length, 1);
assert.equal(shipStats.queue[0].text, '<img onerror=bad>');
assert.equal(shipStats.queue[0].portraitId, session.data.portraitId);
const propertyKey = shipStats.queue[0].key;
assert.ok(
  !sent.some((message2) => message2.to === session2.id && message2.t === 'hail'),
  'arrival never opens popup',
);
service.request(session, { op: 'open', key: propertyKey });
assert.ok(
  !sent.some((message2) => message2.to === session.id && message2.key === propertyKey),
  'foreign key cannot open call',
);
service.request(session2, { op: 'open', key: propertyKey });
assert.equal(requiredFixtureValue(sent.at(-1)).player, session.ent.id);
assert.equal(requiredFixtureValue(sent.at(-1)).portraitId, session.data.portraitId);
service.player(session, session2.ent, 'flood');
assert.equal(shipStats.queue[0].text, '<img onerror=bad>');
currentTime += 11000;
service.player(session, session2.ent, 'second');
assert.equal(shipStats.queue.length, 1);
assert.equal(shipStats.queue[0].text, 'second');
session2.data.blocks.push(session.data.name);
currentTime += 11000;
service.player(session, session2.ent, 'blocked');
assert.equal(shipStats.queue[0].text, 'second');
service.tick();
assert.equal(shipStats.queue.length, 0);
assert.equal(shipStats.history.length, 0, 'blocked player messages never enter archive');
session2.data.blocks = [];
session.data.blocks.push(session2.data.name);
assert.equal(service.canContact(session, session2), false);
session.data.blocks = [];
session2.data.playerHails = false;
assert.equal(service.canContact(session, session2), false);
session2.data.playerHails = true;
session2.data.dmAll = false;
assert.equal(service.canContact(session, session2), false);
session2.data.friends = ['Alpha'];
assert.equal(service.canContact(session, session2), true);
session2.data.dmAll = true;
session2.data.sys = 'elsewhere';
assert.equal(service.canContact(session, session2), false);
session2.data.sys = systemId;
const firstNonPlayerShip = nonPlayerShip(10),
  secondNonPlayerShip = nonPlayerShip(11);
assert.notEqual(
  contextualHail(session, firstNonPlayerShip, message),
  contextualHail(session, secondNonPlayerShip, message),
);
firstNonPlayerShip.target = session2.ent;
assert.match(
  contextualHail(session, firstNonPlayerShip, message),
  /Weapons hot|live target|hostile contact|Combat channel|under fire|Contact engaged|firing arc|not quiet/,
);
firstNonPlayerShip.target = null;
assert.ok(service.offer(session, firstNonPlayerShip, 'fuel'));
const station = service.state(session),
  call = station.queue[0];
service.request(session, { op: 'answer', key: call.key, k: 'donateFuel' });
assert.equal(session.ent.fuel, 200, 'must open actual offer');
service.request(session, { op: 'open', key: call.key });
service.request(session, { op: 'answer', key: call.key, k: 'gift' });
assert.equal(session.data.credits, 2000, 'forged action rejected');
service.request(session, { op: 'answer', key: call.key, k: 'donateFuel' });
assert.equal(session.ent.fuel, 150);
assert.equal(firstNonPlayerShip.fuel, 70);
service.request(session, { op: 'answer', key: call.key, k: 'donateFuel' });
assert.equal(session.ent.fuel, 150, 'cannot resolve twice');
const poor = nonPlayerShip(12);
assert.ok(service.offer(session, poor, 'beg'));
let fixtureState = station.queue.at(-1);
service.request(session, { op: 'open', key: requiredFixtureValue(fixtureState).key });
session.data.credits = 0;
service.request(session, { op: 'answer', key: requiredFixtureValue(fixtureState).key, k: 'gift' });
assert.equal(session.data.credits, 0);
session.data.credits = 2000;
service.request(session, { op: 'answer', key: requiredFixtureValue(fixtureState).key, k: 'gift' });
assert.equal(session.data.credits, 1900);
const damaged = nonPlayerShip(13, { armor: 20, disabled: true });
assert.ok(service.offer(session, damaged, 'distress'));
fixtureState = station.queue.at(-1);
service.request(session, { op: 'open', key: requiredFixtureValue(fixtureState).key });
service.request(session, {
  op: 'answer',
  key: requiredFixtureValue(fixtureState).key,
  k: 'rendezvous',
});
assert.ok(sent.some((message2) => message2.t === 'hailmark' && message2.id === damaged.id));
service.request(session, {
  op: 'answer',
  key: requiredFixtureValue(fixtureState).key,
  k: 'repair',
});
assert.equal(damaged.disabled, false);
assert.equal(damaged.armor, 55.00000000000001);
assert.equal(session.data.credits, 1650);
// Exercise the real disable path: Space.ai deliberately retains its old target.
const survivor = nonPlayerShip(34, { armor: 10, target: session2.ent, think: 1 });
Space.prototype.ai.call(mockSpace(Object.assign({}, message, { t: 5 })), survivor);
assert.equal(survivor.disabled, true);
assert.equal(survivor.target, session2.ent, 'real disable flow retains combat pointer');
assert.ok(
  service.offer(session, survivor, 'distress'),
  'friendly disabled survivor can ask for help',
);
service.request(session, { op: 'dismiss', key: requiredFixtureValue(station.queue.at(-1)).key });
const hostileSurvivor = nonPlayerShip(35, {
  armor: 10,
  target: session2.ent,
  think: 1,
  hostile: true,
});
Space.prototype.ai.call(mockSpace(Object.assign({}, message, { t: 5 })), hostileSurvivor);
assert.equal(hostileSurvivor.disabled, true);
assert.equal(
  service.offer(session, hostileSurvivor, 'distress'),
  false,
  'hostile survivors cannot bypass hostility',
);
const hauler = nonPlayerShip(14, { dest: { id: 'port', name: 'Port', x: 100, y: 0 } });
assert.ok(service.offer(session, hauler, 'escort'));
fixtureState = station.queue.at(-1);
service.request(session, { op: 'open', key: requiredFixtureValue(fixtureState).key });
service.request(session, {
  op: 'answer',
  key: requiredFixtureValue(fixtureState).key,
  k: 'escort',
});
assert.equal(session.data.credits, 1650, 'no reward on accepting');
service.landed(hauler, message);
assert.equal(session.data.credits, 2400);
service.landed(hauler, message);
assert.equal(session.data.credits, 2400, 'landing reward once');
const lost = nonPlayerShip(15, { dest: { id: 'port', name: 'Port', x: 100, y: 0 } });
service.offer(session, lost, 'escort');
fixtureState = station.queue.at(-1);
service.request(session, { op: 'open', key: requiredFixtureValue(fixtureState).key });
service.request(session, {
  op: 'answer',
  key: requiredFixtureValue(fixtureState).key,
  k: 'escort',
});
lost.x = 4000;
service.tick();
service.landed(lost, message);
assert.equal(session.data.credits, 2400, 'separation fails escort');
const scout = nonPlayerShip(16),
  hostile = nonPlayerShip(17, { hostile: true, x: 1400 });
assert.ok(service.offer(session, scout, 'intel'));
fixtureState = station.queue.at(-1);
service.request(session, { op: 'open', key: requiredFixtureValue(fixtureState).key });
service.request(session, { op: 'answer', key: requiredFixtureValue(fixtureState).key, k: 'intel' });
assert.ok(
  sent.some((message2) => message2.t === 'hailmark' && message2.x === 1500 && !message2.id),
  'intel is rounded point, not tracking',
);
message.ships.delete(hostile.id);
for (let index = 20; index < 25; index++)
  service.enqueue(session, nonPlayerShip(index), 'greeting', 'Hello');
assert.equal(
  station.queue.filter((fixtureState2) => fixtureState2.kind === 'npc').length,
  HAIL_LIMITS.npc,
);
currentTime += HAIL_LIMITS.expires + 1;
service.tick();
assert.equal(station.queue.length, 0);
assert.ok(station.history.length > 0, 'expired incoming transmissions stay readable');
const archived = station.history[0],
  creditsBeforeArchive = session.data.credits;
service.request(session, { op: 'open', key: archived.key });
assert.ok(
  requiredFixtureValue(sent.at(-1)).text!.includes(archived.text),
  'opening inbox recovers original text',
);
assert.deepEqual(requiredFixtureValue(sent.at(-1)).opts, [], 'archive has no actionable offers');
assert.ok(archived.portraitId);
assert.equal(
  requiredFixtureValue(sent.at(-1)).portraitId,
  archived.portraitId,
  'despawned caller keeps captured face',
);
service.request(session, { op: 'answer', key: archived.key, k: 'gift' });
assert.equal(session.data.credits, creditsBeforeArchive, 'expired actions cannot spend credits');
service.request(session, { op: 'dismiss', key: archived.key });
assert.ok(
  !station.history.some((fixtureState2) => fixtureState2.key === archived.key),
  'archive can be dismissed',
);
for (let index = 0; index < HAIL_LIMITS.history + 2; index++)
  service.archive(station, { key: `old-${index}`, text: 'Archived', kind: 'npc' } as Parameters<
    HailService['archive']
  >[1]);
assert.equal(station.history.length, HAIL_LIMITS.history, 'archived history stays bounded');
service.enqueue(session, nonPlayerShip(30), 'greeting', 'Hello');
const pendingBeforePause = station.queue[0],
  expiryBeforePause = pendingBeforePause.expires;
currentTime += HAIL_LIMITS.expires * 2;
service.resume(HAIL_LIMITS.expires * 2);
assert.equal(pendingBeforePause.expires, expiryBeforePause + HAIL_LIMITS.expires * 2);
service.tick();
assert.ok(station.queue.includes(pendingBeforePause), 'long solo pause preserves pending call');
session.ent = { ...session.ent, id: 31 };
service.state(session);
assert.equal(station.queue.length, 0, 'respawn resets calls');
assert.equal(station.history.length, 0, 'respawn clears archive');
assert.ok(!service.offer(session, nonPlayerShip(32, { owner: 10 }), 'beg'));
assert.ok(!service.offer(session, nonPlayerShip(33, { mission: {} }), 'beg'));
// Selecting a friendly ship to hail is not combat and must not suppress ordinary calls.
const attempted: string[] = [];
service.offer = (session3, shipEntity, reason) => {
  attempted.push(reason);
  return false;
};
session.ent.target = session2.ent;
station.next = 0;
service.tick();
assert.ok(attempted.includes('beg'), 'friendly selected target permits routine opportunities');
attempted.length = 0;
const attacker = nonPlayerShip(40, { target: session.ent });
station.next = 0;
service.tick();
assert.ok(attempted.length > 0);
assert.ok(
  attempted.every((reason) => ['security', 'distress'].includes(reason)),
  'attackers suppress routine opportunities',
);
message.ships.delete(attacker.id);
// A docked captain must not reactivate an empty system through the lazy proxy.
let lazyReads = 0;
game.spaces = new Proxy(
  {},
  {
    get() {
      lazyReads++;
      throw new Error('unexpected lazy system wake');
    },
  },
);
Object.assign(session, { ent: null });
Object.assign(session2, { ent: null });
delete game.live[systemId];
service.tick();
assert.equal(lazyReads, 0, 'hailing uses live systems, never the waking proxy');
assert.equal(station.space, null);
assert.equal(station.queue.length, 0, 'landing clears pending calls');
assert.equal(service.state(session).space, null);
service.request(session, { op: 'send', id: 2, text: 'docked' });
assert.equal(lazyReads, 0, 'docked requests cannot wake sleeping space');
console.log(
  'Hailing: Unicode/escaping wire text, contextual variance/combat precedence, same-system privacy/blocks, no focus packet, sender ownership, rate limits/coalescing, once-only resource aid, distress repair/marker, actual landing escort/replay/separation, real rounded intel, queue cap/expiry/respawn and protected-source exclusions passed.',
);
