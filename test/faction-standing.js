// Faction bounds exercised through real rewards, penalties, store messages and save/login.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { FACTIONS, STELLARS } from '../shared/galaxy.ts';
import { repLabel } from '../shared/rules.ts';
import { STORY } from '../shared/story.ts';
import { ARCS } from '../shared/arcs.ts';
import { SIDE_STORIES } from '../shared/quests.ts';
import { STORE_ITEMS, STORE_TIERS } from '../shared/fronts.ts';

process.env.SEEDS_FILE = '/nonexistent';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-standing-'));
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const g = new Game(A, new DB(dir));
function login(game, name = 'Standing Pilot') {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.send = () => {};
  sock.close = () => {};
  game.connect(sock, '127.0.0.1');
  sock.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' }));
  const s = [...game.sessions.values()].at(-1);
  return { s, d: s.data, send: (m) => sock.emit('message', JSON.stringify(m)) };
}
const { s, d, send } = login(g);
d.stellar = 'meridian-yards';
d.sys = STELLARS[d.stellar].system;
s.ent = null;
d.credits = 1e7;
d.tokens = { quantum: 1000 };
const p = STELLARS[d.stellar];
const reward = () => {
  d.missions = [
    { id: 'standing-job', type: 'bounty', done: true, title: 'Standing job', reward: 1000 },
  ];
  g.completeOnLanding(s, p);
};
for (const [initial, expected] of [
  [198, 200],
  [200, 202],
  [250, 252],
  [299, 300],
  [300, 300],
  [100, 102],
]) {
  d.rep.quantum = initial;
  reward();
  assert.equal(
    d.rep.quantum,
    expected,
    'ordinary job reward retains high standing and caps at 300',
  );
}
d.rep.quantum = 199;
send({ t: 'store', fac: 'quantum', id: 'writ' });
assert.equal(d.rep.quantum, 209);
assert.equal(repLabel(d.rep.quantum), 'Exalted');
d.rep.quantum = 299;
send({ t: 'store', fac: 'quantum', id: 'writ' });
assert.equal(d.rep.quantum, 300);
const epic = STORE_ITEMS.find((it) => it.id === 'epic');
assert.deepEqual([epic.rep, epic.tokens, epic.credits], [200, 70, 250000]);
assert.deepEqual(
  STORE_TIERS.map((t) => t.rep),
  [10, 30, 60, 200],
);
for (const initial of [90, 199, 200, 250]) {
  d.rep.quantum = initial;
  const before = [d.officers.length, d.credits, d.tokens.quantum];
  send({ t: 'store', fac: 'quantum', id: 'epic' });
  const eligible = initial >= 200;
  assert.equal(d.officers.length, before[0] + Number(eligible));
  assert.equal(d.credits, before[1] - (eligible ? 250000 : 0));
  assert.equal(d.tokens.quantum, before[2] - (eligible ? 70 : 0));
  if (eligible) assert.equal(d.officers.at(-1).rarity, 3);
  assert.equal(d.rep.quantum, initial, 'purchases do not consume standing');
}
const sp = g.spaces[d.sys];
const npc = () => ({
  faction: 'quantum',
  aggro: new Set(),
  hull: 703,
  name: 'Test patrol',
  strength: 10,
});
for (const [initial, expected] of [
  [250, 249],
  [200, 199],
  [-99, -100],
  [-100, -100],
]) {
  d.rep.quantum = initial;
  g.onHit({ s }, npc(), sp);
  assert.equal(d.rep.quantum, expected, 'ordinary attack penalty preserves buffer and floor');
}
assert.equal(repLabel(249), 'Exalted');
assert.equal(repLabel(199), 'Honored');
for (const [n, label] of [
  [200, 'Exalted'],
  [50, 'Honored'],
  [20, 'Friendly'],
  [0, 'Neutral'],
  [-19, 'Neutral'],
  [-20, 'Wanted'],
  [-30, 'Wanted'],
  [-49, 'Wanted'],
  [-50, 'Hunted'],
  [-100, 'Hunted'],
])
  assert.equal(repLabel(n), label);
d.rep.quantum = 250;
g.onKill({ s }, npc(), sp);
assert.equal(d.rep.quantum, 240, 'lawful kill preserves 10-point penalty');
d.rep.quantum = 199;
d.rep.spacer = 299;
g.onKill({ s }, { ...npc(), faction: 'umbral' }, sp);
assert.equal(d.rep.quantum, 200);
assert.equal(repLabel(d.rep.quantum), 'Exalted', 'actual bounty reward crosses into Exalted');
assert.equal(d.rep.spacer, 300);
d.rep.quevari = 250;
g.features.story.storyComplete(s, STORY[0]);
assert.equal(d.rep.quevari, 250 + STORY[0].rep, 'main story reward does not truncate');
const fac = Object.keys(ARCS)[0];
d.rep[fac] = 250;
g.features.arcs.arcComplete(s, fac);
assert.equal(d.rep[fac], 256, 'faction arc reward does not truncate');
d.rep.quantum = 250;
g.features.fronts.jobDone(s, { reward: 1000, chain: { fac: 'quantum', step: 2 } }, p);
assert.equal(d.rep.quantum, 262, 'commission finale retains high standing');
d.rep.quantum = 250;
const standingSide = {
  qid: 'standing-side',
  side: SIDE_STORIES[0].id,
  at: p.id,
  name: 'Standing side',
  giver: 'Test',
};
// Model an active quest: completion now correctly rejects nonexistent/replayed records.
g.features.quests.questInit(d).active[standingSide.qid] = standingSide;
g.features.quests.questFinish(s, standingSide);
assert.equal(d.rep.quantum, 258, 'quest reward does not truncate high standing');
g.features.quests.questFinish(s, standingSide);
assert.equal(d.rep.quantum, 258, 'replayed quest completion cannot award standing twice');
d.rep.quantum = 250;
g.features.hangar.resolveShuttle(s, {
  kind: 'courier',
  runs: 0,
  outcome: 'success',
  job: {
    reward: { rep: ['quantum', 6] },
    danger: 0,
    jumps: 0,
    sys: d.sys,
    title: 'Standing shuttle',
  },
});
assert.equal(d.rep.quantum, 256, 'shuttle reward does not truncate high standing');
// The serializer and the real login migrations must retain the buffer, without rescaling legacy saves.
d.rep.quantum = 275;
d.rep.quevari = 100;
g.db.touch();
g.db.flush();
const loaded = new Game(A, new DB(dir));
const again = login(loaded);
assert.equal(again.d.rep.quantum, 275);
assert.equal(again.d.rep.quevari, 100);
assert.equal(FACTIONS.quantum.pirate, undefined);
console.log(
  'Faction standing: actual job/story/arc/commission/kill/hit/store/save-login regressions passed.',
);

process.exit(0);
