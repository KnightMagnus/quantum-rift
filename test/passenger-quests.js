import { seedCargo } from './helpers/cargo-fixture.js';
// Story jobs use the same finite passenger seating as ordinary board missions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { makeLoadout } from '../shared/rules.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { CHAINS } from '../shared/quests.ts';

process.env.SEEDS_FILE = '/nonexistent';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-passenger-quests-'));
const game = new Game(A, new DB(dir));
const socket = new EventEmitter(),
  messages = [];
socket.open = true;
socket.backlog = 0;
socket.send = (m) => messages.push(m);
socket.close = () => {};
game.connect(socket, '127.0.0.93');
socket.emit(
  'message',
  JSON.stringify({ t: 'hello', name: 'Passenger Quest QA', pass: 'disposable' }),
);
const session = [...game.sessions.values()].pop();
let d = session.data;
d.ship = makeLoadout(A, 820); // one dedicated passenger seat
const origin = STELLARS.concordia;
const destination = Object.values(STELLARS).find(
  (p) => !p.site && p.svc.includes('L') && p.system !== origin.system,
);
d.sys = origin.system;
d.stellar = origin.id;
seedCargo(d, {});
const step = (type) => ({
  type,
  where: 'A',
  title: 'Capacity test',
  brief: 'Transport this group safely.',
  beat: 'The group disembarks.',
  ...(type === 'passenger' ? { pax: 1 } : {}),
});
const story = () => ({
  qid: 'c:seat-test',
  chain: CHAINS[0].id,
  contact: 'c:seat-test',
  giver: 'Capacity Test',
  name: 'Seat Test',
  at: origin.id,
  plan: { W: origin.id, Wsys: origin.system, A: destination.system, X: destination.id },
  steps: [step('passenger'), step('passenger'), step('passenger')],
  step: 0,
  tries: 0,
  started: Date.now(),
});
let Q = story();
game.features.quests.questInit(d).active[Q.qid] = Q;
d.missions = [{ id: 'ordinary', type: 'passenger', pax: 1, dest: destination.id, reward: 100 }];
const credits = d.credits;
assert.equal(game.features.quests.questPush(session, Q, true), false);
assert.equal(d.missions.length, 1, 'full ship cannot receive first story passengers');
assert.equal(Q.awaitingSeats.at, origin.id, 'boarding stays at the origin port');
for (let i = 0; i < 6; i++) game.features.quests.questSweep(session);
assert.equal(Q.tries, 0, 'waiting does not consume failure retries');
assert.equal(d.credits, credits, 'waiting never pays a reward');
assert.equal(
  game.features.quests.questsPayload(d).active[0].awaitingSeats.pax,
  1,
  'pending boarding is published',
);
// Persist and reload through the actual save-file implementation, not a new transient flag.
game.db.touch();
game.db.flush();
const reloaded = new DB(dir);
d = session.data = reloaded.get('Passenger Quest QA');
game.db = reloaded;
Q = d.quests.active[Q.qid];
assert.equal(Q.awaitingSeats.at, origin.id, 'pending boarding survives save/reload');
d.missions = [];
session.ent = {};
game.features.quests.questSweep(session);
assert.equal(
  d.missions.length,
  0,
  'free seats do not teleport waiting passengers aboard in flight',
);
session.ent = null;
d.stellar = destination.id;
d.sys = destination.system;
game.features.quests.questSweep(session);
assert.equal(d.missions.length, 0, 'passengers must be collected at their boarding port');
d.stellar = origin.id;
d.sys = origin.system;
game.features.quests.questSweep(session);
assert.equal(d.missions.length, 1, 'freeing the seat permits boarding at the original port');
assert.equal(Q.awaitingSeats, undefined);
assert.equal(Q.tries, 0);
game.features.quests.questSweep(session);
assert.equal(d.missions.length, 1, 'boarding retries cannot duplicate a story mission');
assert.equal(d.credits, credits, 'boarding alone never pays');
// A paid, delivered passenger record remains in the completion snapshot until its end.
// It must not block the next passenger group boarding on that same landing.
const delivered = d.missions[0],
  reward = delivered.reward;
d.stellar = delivered.dest;
d.sys = STELLARS[delivered.dest].system;
game.completeOnLanding(session, STELLARS[delivered.dest]);
assert.equal(Q.step, 1);
assert.equal(Q.awaitingSeats, undefined, 'already disembarked passengers do not occupy seats');
assert.equal(d.missions.length, 1);
assert.equal(d.missions[0].quest.step, 1);
assert.equal(d.credits, credits + reward, 'only the delivered group is paid');
// Another live passenger reservation can fill the ship before a later story step advances.
d.missions = [
  {
    id: 'prior',
    type: 'survey',
    done: true,
    reward: 123,
    title: 'Survey',
    quest: { qid: Q.qid, step: Q.step },
  },
  { id: 'ordinary2', type: 'passenger', pax: 1, dest: origin.id, reward: 100 },
];
game.completeOnLanding(session, STELLARS[d.stellar]);
assert.equal(Q.step, 2);
assert.equal(
  Q.awaitingSeats.at,
  d.stellar,
  'advancing into a full ship queues at the delivery port',
);
assert.equal(d.missions.length, 1, 'no overbooked mission is generated');
const afterPrior = d.credits;
for (let i = 0; i < 5; i++) game.features.quests.questSweep(session);
assert.equal(Q.tries, 0);
assert.equal(d.credits, afterPrior, 'pending later steps cannot receive duplicate payments');
assert.ok(d.quests.active[Q.qid], 'waiting does not prematurely end the story');
console.log(
  'Passenger story quests passed: full initial/later steps, origin-bound boarding, save/reload, no premature retries or rewards, paid-passenger disembarkation, and duplicate prevention.',
);
process.exit(0);
