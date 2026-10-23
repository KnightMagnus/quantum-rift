import type { NetworkMessage } from '../server/message-registry.ts';
import type { Socket } from '../server/ws.ts';
import type { LegacyPacket } from './helpers/legacy-fixture.ts';
import { mockMission, mockEntity } from './helpers/mocks.ts';
type ActionPacket = Omit<LegacyPacket, 'list'> & { list: { name: string }[] };
type ActionSocket = Socket & { backlog: number; out: ActionPacket[] };
import { requiredFixtureValue } from './helpers/required.ts';
// Gameplay action route regression tests.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { type GradeLots } from '../shared/cargo-contracts.ts';
const game = new Game(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  new Database(tempDataDir('rift-actions-')),
);
const sock = new EventEmitter() as ActionSocket;
sock.open = true;
sock.backlog = 0;
sock.out = [];
sock.send = (message: string) =>
  sock.out.push(typeof message === 'string' ? JSON.parse(message) : message);
sock.close = () => {};
game.connect(sock, 'fixture-actions');
const session = requiredFixtureValue([...game.sessions.values()].at(-1));
const send = (message: {
  t: string | undefined;
  name?: string | undefined;
  pass?: string | undefined;
  text?: string | number | undefined;
  c?: string | number | undefined;
  mat?: string | undefined;
  grade?: string | number | undefined;
  n?: number | undefined;
  qid?: string | number | undefined;
  op?: string | undefined;
  id?: string | number | undefined;
  fac?: string | undefined;
  msg?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  o?: string | undefined;
  dest?: string | undefined;
  target?: number | undefined;
  slot?: string | number | undefined;
  hull?: number | undefined;
  uid?: string | null | undefined;
  val?: number | undefined;
  share?: number | undefined;
  ok?: boolean | undefined;
  th?: number | undefined;
  tu?: number | undefined;
  ab?: number | boolean | undefined;
  rv?: number | boolean | undefined;
  f1?: number | boolean | undefined;
  f2?: number | boolean | undefined;
  nav?: boolean | undefined;
  seq?: number | undefined;
  stellar?: string | undefined;
  cid?: string | undefined;
  qty?: number | undefined;
  lots?: GradeLots | undefined;
  store?: boolean | undefined;
  cat?: string | undefined;
  ch?: string | undefined;
  k?: string | number | undefined;
  revision?: number | undefined;
  port?: string | undefined;
  recipe?: string | undefined;
  on?: boolean | undefined;
  dmAll?: boolean | undefined;
  armada?: boolean | undefined;
  give?:
    | {
        items?: Record<string, number>;
        lots?: Record<string, import('../shared/cargo-contracts.ts').GradeLots>;
        credits?: number;
        mats?: Record<string, number[]>;
      }
    | undefined;
  site?: string | undefined;
  all?: number | boolean | undefined;
  kind?: string | undefined;
  period?: 'daily' | 'weekly' | undefined;
  side?: string | undefined;
  g?: number | undefined;
  crew?: number | null | undefined;
  cap?: number | null | undefined;
  hideSys?: boolean | undefined;
  w?: number | undefined;
  role?: string | undefined;
  price?: number | undefined;
  job?: string | undefined;
  mode?: string | undefined;
  i?: number | undefined;
  act?: string | undefined;
  oid?: string | number | null | undefined;
  sid?: string | number | undefined;
  amt?: number | undefined;
  data?: Record<string, string | number | boolean | null> | undefined;
}) => game.onMessage(session, message as NetworkMessage);
send({ t: 'hello', name: 'Action Captain', pass: 'fixture-pass' });
const playerData = requiredFixtureValue(session).data;
let before = playerData.log.length;
send({ t: 'note', text: '   ' });
send({ t: 'note', text: 42 });
assert.equal(playerData.log.length, before);
send({ t: 'note', text: 'N'.repeat(900) });
assert.equal(
  requiredFixtureValue(playerData.log.at(-1)).text,
  'N'.repeat(500),
  'log notes bounded to 500 characters',
);
const active = requiredFixtureValue(session).actT;
send({ t: 'ping', c: 123456 });
assert.deepEqual(sock.out.at(-1), { t: 'pong', c: 123456 });
assert.equal(
  requiredFixtureValue(session).actT,
  active,
  'latency heartbeat never resets idle activity',
);
send({ t: 'rivals' });
const payload = requiredFixtureValue(sock.out.at(-1));
assert.equal(payload.t, 'rivals');
assert.ok(Array.isArray(payload.list) && payload.list.length > 0);
assert.equal(new Set(payload.list.map((result) => result.name)).size, payload.list.length);
const player = STELLARS[requiredFixtureValue(playerData.stellar)],
  offer = game.matsFor(player, playerData)[0];
assert.ok(offer, 'starting hub sells crafting materials');
const initial = playerData.mats[offer.mat][offer.grade];
playerData.credits = offer.price * 10;
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: 3 });
assert.equal(playerData.credits, offer.price * 7);
assert.equal(playerData.mats[offer.mat][offer.grade], initial + 3);
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: -999 });
assert.equal(playerData.mats[offer.mat][offer.grade], 0);
assert.equal(
  playerData.credits,
  offer.price * 7 + Math.round((initial + 3) * offer.price * 0.6),
  'sale clamps to owned amount and pays sell price',
);
const balance = playerData.credits;
send({ t: 'buymat', mat: 'invalid', grade: 99, n: 3 });
assert.equal(playerData.credits, balance);
requiredFixtureValue(session).ent = mockEntity({});
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: 1 });
assert.equal(playerData.credits, balance, 'cannot buy station materials while flying');
requiredFixtureValue(session).ent = null;
playerData.credits = 0;
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: 1 });
assert.equal(playerData.mats[offer.mat][offer.grade], 0, 'cannot buy materials without credits');
const fixtureState = game.features.quests.questInit(playerData);
Object.assign(fixtureState.active, {
  fixture: {
    qid: 'fixture',
    name: 'Fixture story',
    contact: 'fixture-contact',
    steps: [{ kind: 'patrol' }],
    step: 0,
  },
});
playerData.missions = [
  mockMission({ id: 'fixture-job', quest: { qid: 'fixture' } }),
  mockMission(
    Object.assign(
      { id: 'keep-job', title: 'Unrelated job', sys: playerData.sys },
      { kind: 'patrol' },
    ),
  ),
];
send({ t: 'questdrop', qid: 17 });
assert.ok(fixtureState.active.fixture, 'nonstring quest id ignored');
send({ t: 'questdrop', qid: 'missing' });
assert.ok(fixtureState.active.fixture, 'unknown quest id does not abandon other stories');
send({ t: 'questdrop', qid: 'fixture' });
assert.equal(fixtureState.active.fixture, undefined);
assert.deepEqual(
  playerData.missions.map((mission) => mission.id),
  ['keep-job'],
);
assert.ok(
  requiredFixtureValue(fixtureState.contacts['fixture-contact'].cool) > Date.now(),
  'abandon applies contact cooldown',
);
assert.ok(playerData.log.some((message) => message.text.includes('Fixture story (abandoned)')));
console.log(
  'Core action routes: bounded notes, idle-preserving ping, rival status, material trading guards and quest abandonment isolation passed.',
);
process.exit(0);
