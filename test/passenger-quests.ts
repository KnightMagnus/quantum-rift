import { mockMission } from './helpers/mocks.ts';
import { mockEntity } from './helpers/mocks.ts';
import type { QuestRecord } from '../shared/quests.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
// Story jobs use the same finite passenger seating as ordinary board missions.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { makeLoadout } from '../shared/rules.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { CHAINS } from '../shared/quests.ts';

process.env.SEEDS_FILE = '/nonexistent';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const directory = filesystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-passenger-quests-'),
);
const game = new Game(assets, new Database(directory));
const socket = legacySocket(),
  messages: string[] = [];
socket.open = true;
socket.backlog = 0;
socket.send = (message: string) => messages.push(message);
socket.close = () => {};
game.connect(socket, '127.0.0.93');
socket.emit(
  'message',
  JSON.stringify({ t: 'hello', name: 'Passenger Quest QA', pass: 'disposable' }),
);
const session = requiredFixtureValue([...game.sessions.values()].pop());
let playerData = requiredFixtureValue(session).data;
playerData.ship = makeLoadout(assets, 820); // one dedicated passenger seat
const origin = STELLARS.concordia;
const destination = Object.values(STELLARS).find(
  (player) => !player.site && player.svc.includes('L') && player.system !== origin.system,
);
playerData.sys = origin.system;
playerData.stellar = origin.id;
seedCargo(playerData, {});
const step = (type: string) => ({
  type,
  where: 'A',
  title: 'Capacity test',
  brief: 'Transport this group safely.',
  beat: 'The group disembarks.',
  ...(type === 'passenger' ? { pax: 1 } : {}),
});
const story = (): QuestRecord => ({
  qid: 'c:seat-test',
  chain: CHAINS[0].id,
  contact: 'c:seat-test',
  giver: 'Capacity Test',
  name: 'Seat Test',
  at: origin.id,
  plan: {
    W: origin.id,
    Wsys: origin.system,
    A: requiredFixtureValue(destination).system,
    X: requiredFixtureValue(destination).id,
  },
  steps: [step('passenger'), step('passenger'), step('passenger')],
  step: 0,
  tries: 0,
  started: Date.now(),
});
let questRecord = story();
game.features.quests.questInit(playerData).active[questRecord.qid] = questRecord;
playerData.missions = [
  mockMission({
    id: 'ordinary',
    type: 'passenger',
    pax: 1,
    dest: requiredFixtureValue(destination).id,
    reward: 100,
  }),
];
const credits = playerData.credits;
assert.equal(game.features.quests.questPush(session, questRecord, true), false);
assert.equal(playerData.missions.length, 1, 'full ship cannot receive first story passengers');
assert.equal(
  requiredFixtureValue<NonNullable<QuestRecord['awaitingSeats']>>(questRecord.awaitingSeats).at,
  origin.id,
  'boarding stays at the origin port',
);
for (let index = 0; index < 6; index++) game.features.quests.questSweep(session);
assert.equal(questRecord.tries, 0, 'waiting does not consume failure retries');
assert.equal(playerData.credits, credits, 'waiting never pays a reward');
assert.equal(
  requiredFixtureValue(game.features.quests.questsPayload(playerData).active[0].awaitingSeats).pax,
  1,
  'pending boarding is published',
);
// Persist and reload through the actual save-file implementation, not a new transient flag.
game.db.touch();
game.db.flush();
const reloaded = new Database(directory);
playerData = requiredFixtureValue(session).data = requiredFixtureValue(
  reloaded.get('Passenger Quest QA'),
);
game.db = reloaded;
questRecord = playerData.quests.active[questRecord.qid];
assert.equal(
  requiredFixtureValue<NonNullable<QuestRecord['awaitingSeats']>>(questRecord.awaitingSeats).at,
  origin.id,
  'pending boarding survives save/reload',
);
playerData.missions = [];
requiredFixtureValue(session).ent = mockEntity({});
game.features.quests.questSweep(session);
assert.equal(
  playerData.missions.length,
  0,
  'free seats do not teleport waiting passengers aboard in flight',
);
requiredFixtureValue(session).ent = null;
playerData.stellar = requiredFixtureValue(destination).id;
playerData.sys = requiredFixtureValue(destination).system;
game.features.quests.questSweep(session);
assert.equal(playerData.missions.length, 0, 'passengers must be collected at their boarding port');
playerData.stellar = origin.id;
playerData.sys = origin.system;
game.features.quests.questSweep(session);
assert.equal(
  playerData.missions.length,
  1,
  'freeing the seat permits boarding at the original port',
);
assert.equal(questRecord.awaitingSeats, undefined);
assert.equal(questRecord.tries, 0);
game.features.quests.questSweep(session);
assert.equal(playerData.missions.length, 1, 'boarding retries cannot duplicate a story mission');
assert.equal(playerData.credits, credits, 'boarding alone never pays');
// A paid, delivered passenger record remains in the completion snapshot until its end.
// It must not block the next passenger group boarding on that same landing.
const delivered = playerData.missions[0],
  reward = delivered.reward;
playerData.stellar = requiredFixtureValue(delivered.dest);
playerData.sys = STELLARS[requiredFixtureValue(delivered.dest)].system;
game.completeOnLanding(session, STELLARS[requiredFixtureValue(delivered.dest)]);
assert.equal(questRecord.step, 1);
assert.equal(
  questRecord.awaitingSeats,
  undefined,
  'already disembarked passengers do not occupy seats',
);
assert.equal(playerData.missions.length, 1);
assert.equal(requiredFixtureValue(playerData.missions[0].quest).step, 1);
assert.equal(playerData.credits, credits + reward, 'only the delivered group is paid');
// Another live passenger reservation can fill the ship before a later story step advances.
playerData.missions = [
  mockMission({
    id: 'prior',
    type: 'survey',
    done: true,
    reward: 123,
    title: 'Survey',
    quest: { qid: questRecord.qid, step: questRecord.step },
  }),
  mockMission({ id: 'ordinary2', type: 'passenger', pax: 1, dest: origin.id, reward: 100 }),
];
game.completeOnLanding(session, STELLARS[requiredFixtureValue(playerData.stellar)]);
assert.equal(questRecord.step, 2);
assert.equal(
  requiredFixtureValue<NonNullable<QuestRecord['awaitingSeats']>>(questRecord.awaitingSeats).at,
  playerData.stellar,
  'advancing into a full ship queues at the delivery port',
);
assert.equal(playerData.missions.length, 1, 'no overbooked mission is generated');
const afterPrior = playerData.credits;
for (let index = 0; index < 5; index++) game.features.quests.questSweep(session);
assert.equal(questRecord.tries, 0);
assert.equal(
  playerData.credits,
  afterPrior,
  'pending later steps cannot receive duplicate payments',
);
assert.ok(playerData.quests.active[questRecord.qid], 'waiting does not prematurely end the story');
console.log(
  'Passenger story quests passed: full initial/later steps, origin-bound boarding, save/reload, no premature retries or rewards, paid-passenger disembarkation, and duplicate prevention.',
);
process.exit(0);
