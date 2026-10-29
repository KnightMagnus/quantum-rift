import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LocalLoginQueue, localLoginConnection, preparedLogin } from '../server/local-login.ts';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const queue = new LocalLoginQueue();
const database = new DB(tempDataDir('local-login-'));
const game = new Game(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  database,
);
let timerRan = false;
setTimeout(() => {
  timerRan = true;
}, 0);
await queue.run(database, 'Async Pilot', 'local-fixture-pass', '127.0.0.1', () => {
  assert.equal(timerRan, true, 'scrypt yields the Node event loop before dispatch');
  assert.ok(preparedLogin(database, 'Async Pilot', 'local-fixture-pass'));
  database.create('Async Pilot', 'local-fixture-pass', game.fresh());
  assert.ok(
    new DB(database.dir).get('Async Pilot')?.ship,
    'registration is complete and durable before admission resolves',
  );
});
assert.equal(
  preparedLogin(database, 'Async Pilot', 'local-fixture-pass'),
  undefined,
  'derived context is not retained after dispatch',
);
await queue.run(database, 'Async Pilot', 'local-fixture-pass', '127.0.0.1', () => {
  assert.equal(database.check(database.get('Async Pilot')!, 'local-fixture-pass'), true);
});
await queue.run(database, 'Async Pilot', 'wrong-password', '127.0.0.1', () => {
  assert.equal(database.check(database.get('Async Pilot')!, 'wrong-password'), false);
});
await assert.rejects(
  queue.run(database, 'Async Pilot', 'local-fixture-pass', '127.0.0.1', () => {
    throw Error('dispatch failed');
  }),
  /dispatch failed/,
);
assert.equal(
  preparedLogin(database, 'Async Pilot', 'local-fixture-pass'),
  undefined,
  'failed dispatch clears its derived context',
);

const socket = legacySocket();
socket.open = true;
socket.backlog = 0;
const packets: { t: string; msg?: string }[] = [];
socket.send = (data: string | object) =>
  packets.push(typeof data === 'string' ? JSON.parse(data) : (data as { t: string }));
socket.close = () => {
  socket.open = false;
  socket.emit('close');
};
const wrapped = localLoginConnection(database, socket, queue, '127.0.0.2');
game.connect(wrapped, '127.0.0.2');
socket.emit('message', JSON.stringify({ t: 'hello', name: 'Closed Pilot', pass: 'fixture-pass' }));
socket.close();
await new Promise((resolve) => setTimeout(resolve, 150));
assert.equal(
  database.get('Closed Pilot'),
  null,
  'closing during derivation cannot create a phantom account',
);
assert.equal(
  packets.some((packet) => packet.t === 'welcome'),
  false,
);

const releases: (() => void)[] = [];
for (let index = 0; index < 32; index++) releases.push(queue.reserve('shared-nat')!);
assert.equal(queue.reserve('shared-nat'), undefined, 'per-address connection bound is enforced');
releases[0]();
releases[0]();
assert.ok(queue.reserve('shared-nat'), 'idempotent release frees exactly one slot');
for (const release of releases) release();

const burstQueue = new LocalLoginQueue();
const admitted: string[] = [];
const results = await Promise.allSettled(
  Array.from({ length: 10 }, (_, index) =>
    burstQueue.run(database, 'Burst Pilot ' + index, 'fixture-pass', 'one-origin', () => {
      admitted.push(String(index));
    }),
  ),
);
assert.equal(
  results.filter((result) => result.status === 'fulfilled').length,
  8,
  'new-account budget applies before expensive work',
);
assert.equal(admitted.length, 8);
assert.ok(
  results
    .filter((result) => result.status === 'rejected')
    .every((result) => /Too many new captains/.test(String(result.reason))),
);
console.log(
  'Local login: background scrypt, scoped credentials, durable admission, denied passwords, close cancellation and bounded registration/socket admission.',
);
process.exit(0);
