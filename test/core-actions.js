// Gameplay action routes previously exercised only indirectly (or not at all).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { STELLARS } from '../shared/galaxy.js';
import { tempDataDir } from './helpers/temp-data.js';
const game = new Game(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
  new DB(tempDataDir('rift-actions-')),
);
const sock = new EventEmitter();
sock.open = true;
sock.backlog = 0;
sock.out = [];
sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
sock.close = () => {};
game.connect(sock, 'fixture-actions');
const s = [...game.sessions.values()].at(-1);
const send = (m) => game.onMessage(s, m);
send({ t: 'hello', name: 'Action Captain', pass: 'fixture-pass' });
const d = s.data;
let before = d.log.length;
send({ t: 'note', text: '   ' });
send({ t: 'note', text: 42 });
assert.equal(d.log.length, before);
send({ t: 'note', text: 'N'.repeat(900) });
assert.equal(d.log.at(-1).text, 'N'.repeat(500), 'log notes bounded to 500 characters');
const active = s.actT;
send({ t: 'ping', c: 123456 });
assert.deepEqual(sock.out.at(-1), { t: 'pong', c: 123456 });
assert.equal(s.actT, active, 'latency heartbeat never resets idle activity');
send({ t: 'rivals' });
const payload = sock.out.at(-1);
assert.equal(payload.t, 'rivals');
assert.ok(Array.isArray(payload.list) && payload.list.length > 0);
assert.equal(new Set(payload.list.map((r) => r.name)).size, payload.list.length);
const p = STELLARS[d.stellar],
  offer = game.matsFor(p, d)[0];
assert.ok(offer, 'starting hub sells crafting materials');
const initial = d.mats[offer.mat][offer.grade];
d.credits = offer.price * 10;
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: 3 });
assert.equal(d.credits, offer.price * 7);
assert.equal(d.mats[offer.mat][offer.grade], initial + 3);
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: -999 });
assert.equal(d.mats[offer.mat][offer.grade], 0);
assert.equal(
  d.credits,
  offer.price * 7 + Math.round((initial + 3) * offer.price * 0.6),
  'sale clamps to owned amount and pays sell price',
);
const balance = d.credits;
send({ t: 'buymat', mat: 'invalid', grade: 99, n: 3 });
assert.equal(d.credits, balance);
s.ent = {};
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: 1 });
assert.equal(d.credits, balance, 'cannot buy station materials while flying');
s.ent = null;
d.credits = 0;
send({ t: 'buymat', mat: offer.mat, grade: offer.grade, n: 1 });
assert.equal(d.mats[offer.mat][offer.grade], 0, 'cannot buy materials without credits');
const q = game.features.quests.questInit(d);
q.active.fixture = {
  qid: 'fixture',
  name: 'Fixture story',
  contact: 'fixture-contact',
  steps: [{ kind: 'patrol' }],
  step: 0,
};
d.missions = [
  { id: 'fixture-job', quest: { qid: 'fixture' } },
  { id: 'keep-job', title: 'Unrelated job', kind: 'patrol', sys: d.sys },
];
send({ t: 'questdrop', qid: 17 });
assert.ok(q.active.fixture, 'nonstring quest id ignored');
send({ t: 'questdrop', qid: 'missing' });
assert.ok(q.active.fixture, 'unknown quest id does not abandon other stories');
send({ t: 'questdrop', qid: 'fixture' });
assert.equal(q.active.fixture, undefined);
assert.deepEqual(
  d.missions.map((m) => m.id),
  ['keep-job'],
);
assert.ok(q.contacts['fixture-contact'].cool > Date.now(), 'abandon applies contact cooldown');
assert.ok(d.log.some((x) => x.text.includes('Fixture story (abandoned)')));
console.log(
  'Core action routes: bounded notes, idle-preserving ping, rival status, material trading guards and quest abandonment isolation passed.',
);
process.exit(0);
