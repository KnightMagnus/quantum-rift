import { mockMission, mockPlayerReference, mockEntity } from './helpers/mocks.ts';
import { fixtureQuest, fixtureShuttle } from './helpers/legacy-fixture.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Faction bounds exercised through real rewards, penalties, store messages and save/login.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { FACTIONS, STELLARS, SYS } from '../shared/galaxy.ts';
import { repLabel } from '../shared/rules.ts';
import { STORY } from '../shared/story.ts';
import { ARCS } from '../shared/arcs.ts';
import { SIDE_STORIES } from '../shared/quests.ts';
import { STORE_ITEMS, STORE_TIERS } from '../shared/fronts.ts';

process.env.SEEDS_FILE = '/nonexistent';
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-standing-'));
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(directory));
function login(game: Game, name = 'Standing Pilot') {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.send = () => {};
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '127.0.0.1');
  legacySocket2.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' }));
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  return {
    s: session,
    d: requiredFixtureValue(session).data,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
  };
}
const { s: session, d: playerData, send } = login(game);
playerData.stellar = 'meridian-yards';
playerData.sys = STELLARS[playerData.stellar].system;
requiredFixtureValue(session).ent = null;
playerData.credits = 1e7;
playerData.tokens = { quantum: 1000 };
const player = STELLARS[playerData.stellar];
const reward = () => {
  playerData.missions = [
    mockMission({
      id: 'standing-job',
      type: 'bounty',
      done: true,
      title: 'Standing job',
      reward: 1000,
    }),
  ];
  game.completeOnLanding(session, player);
};
for (const [initial, expected] of [
  [198, 200],
  [200, 202],
  [250, 252],
  [299, 300],
  [300, 300],
  [100, 102],
]) {
  playerData.rep.quantum = initial;
  reward();
  assert.equal(
    playerData.rep.quantum,
    expected,
    'ordinary job reward retains high standing and caps at 300',
  );
}
playerData.rep.quantum = 199;
send({ t: 'store', fac: 'quantum', id: 'writ' });
assert.equal(playerData.rep.quantum, 209);
assert.equal(repLabel(playerData.rep.quantum), 'Exalted');
playerData.rep.quantum = 299;
send({ t: 'store', fac: 'quantum', id: 'writ' });
assert.equal(playerData.rep.quantum, 300);
const epic = STORE_ITEMS.find((factionStoreItem) => factionStoreItem.id === 'epic');
assert.deepEqual(
  [
    requiredFixtureValue(epic).rep,
    requiredFixtureValue(epic).tokens,
    requiredFixtureValue(epic).credits,
  ],
  [200, 70, 250000],
);
assert.deepEqual(
  STORE_TIERS.map((storeTier) => storeTier.rep),
  [10, 30, 60, 200],
);
for (const initial of [90, 199, 200, 250]) {
  playerData.rep.quantum = initial;
  const before: number[] = [
    playerData.officers.length,
    playerData.credits,
    playerData.tokens.quantum,
  ];
  send({ t: 'store', fac: 'quantum', id: 'epic' });
  const eligible = initial >= 200;
  assert.equal(playerData.officers.length, before[0] + Number(eligible));
  assert.equal(playerData.credits, before[1] - (eligible ? 250000 : 0));
  assert.equal(playerData.tokens.quantum, before[2] - (eligible ? 70 : 0));
  if (eligible) assert.equal(requiredFixtureValue(playerData.officers.at(-1)).rarity, 3);
  assert.equal(playerData.rep.quantum, initial, 'purchases do not consume standing');
}
const space = game.spaces[playerData.sys];
const nonPlayerShip = () =>
  mockEntity({
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
  playerData.rep.quantum = initial;
  game.onHit(mockPlayerReference({ s: session }), nonPlayerShip(), space);
  assert.equal(
    playerData.rep.quantum,
    expected,
    'ordinary attack penalty preserves buffer and floor',
  );
}
assert.equal(repLabel(249), 'Exalted');
assert.equal(repLabel(199), 'Honored');
for (const [quantity, label] of [
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
  assert.equal(repLabel(Number(quantity)), label);
playerData.rep.quantum = 250;
game.onKill(mockPlayerReference({ s: session }), nonPlayerShip(), space);
assert.equal(playerData.rep.quantum, 240, 'lawful kill preserves 10-point penalty');
playerData.rep.quantum = 199;
playerData.rep.spacer = 299;
game.onKill(
  mockPlayerReference({ s: session }),
  mockEntity({ ...nonPlayerShip(), faction: 'umbral' }),
  space,
);
assert.equal(playerData.rep.quantum, 200);
assert.equal(
  repLabel(playerData.rep.quantum),
  'Exalted',
  'actual bounty reward crosses into Exalted',
);
assert.equal(playerData.rep.spacer, 300);
playerData.rep.quevari = 250;
game.features.story.storyComplete(session, STORY[0]);
assert.equal(playerData.rep.quevari, 250 + STORY[0].rep, 'main story reward does not truncate');
const faction = Object.keys(ARCS)[0];
playerData.rep[faction] = 250;
game.features.arcs.arcComplete(session, faction);
assert.equal(playerData.rep[faction], 256, 'faction arc reward does not truncate');
playerData.rep.quantum = 250;
game.features.fronts.jobDone(
  session,
  mockMission({ reward: 1000, chain: { fac: 'quantum', step: 2 } }),
  player,
);
assert.equal(playerData.rep.quantum, 262, 'commission finale retains high standing');
playerData.rep.quantum = 250;
const standingSide = fixtureQuest({
  qid: 'standing-side',
  side: SIDE_STORIES[0].id,
  at: player.id,
  name: 'Standing side',
  giver: 'Test',
});
// Model an active quest: completion now correctly rejects nonexistent/replayed records.
game.features.quests.questInit(playerData).active[standingSide.qid] = standingSide;
game.features.quests.questFinish(session, standingSide);
assert.equal(playerData.rep.quantum, 258, 'quest reward does not truncate high standing');
game.features.quests.questFinish(session, standingSide);
assert.equal(playerData.rep.quantum, 258, 'replayed quest completion cannot award standing twice');
playerData.rep.quantum = 250;
game.features.hangar.resolveShuttle(
  session,
  fixtureShuttle({
    kind: 'courier',
    runs: 0,
    outcome: 'success',
    job: {
      reward: { rep: ['quantum', 6] },
      danger: 0,
      jumps: 0,
      sys: playerData.sys,
      title: 'Standing shuttle',
    },
  }),
);
assert.equal(playerData.rep.quantum, 256, 'shuttle reward does not truncate high standing');
// The serializer and the real login migrations must retain the buffer, without rescaling legacy saves.
playerData.rep.quantum = 275;
playerData.rep.quevari = 100;
game.db.touch();
game.db.flush();
const loaded = new Game(assets, new Database(directory));
const again = login(loaded);
assert.equal(again.d.rep.quantum, 275);
assert.equal(again.d.rep.quevari, 100);
assert.equal(FACTIONS.quantum.pirate, undefined);
// Location authority: every landable public faction port, even without a trade service.
const storeFacs = Object.keys(FACTIONS).filter(
  (k) => !FACTIONS[k].region && !FACTIONS[k].hidden && k !== 'umbral',
);
for (const port of Object.values(STELLARS)) {
  if (port.site || !port.svc.includes('L')) continue;
  const fac = SYS[port.system].faction;
  assert.equal(game.features.fronts.storeFor(port), storeFacs.includes(fac) ? fac : null);
}
for (const fac of storeFacs) {
  const ports = Object.values(STELLARS).filter(
    (p) => !p.site && p.svc.includes('L') && SYS[p.system].faction === fac,
  );
  const port = ports.find((p) => !p.svc.includes('T')) || ports[0];
  assert.ok(port, `Landable port for ${fac}`);
  playerData.sys = port.system;
  playerData.stellar = port.id;
  playerData.rep[fac] = 100;
  playerData.tokens = Object.fromEntries(storeFacs.map((k) => [k, 100]));
  const other = requiredFixtureValue(storeFacs.find((k) => k !== fac));
  const before = JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]);
  send({ t: 'store', fac: other, id: 'writ' });
  assert.equal(
    JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]),
    before,
    'Foreign store cannot be purchased at a public port',
  );
  send({ t: 'store', fac, id: 'writ' });
  assert.equal(playerData.rep[fac], 110, `Local ${fac} store works`);
  assert.equal(playerData.tokens[fac], 88);
}
const site = requiredFixtureValue(Object.values(STELLARS).find((p) => p.site));
playerData.sys = site.system;
playerData.stellar = site.id;
playerData.station.site = site.id;
for (const fac of storeFacs) {
  playerData.rep[fac] = 100;
  playerData.tokens[fac] = 100;
  send({ t: 'store', fac, id: 'writ' });
  assert.equal(playerData.rep[fac], 110, 'Own Personal Station retains every faction store');
}
const beforeMalformed = JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]);
for (const fac of ['__proto__', 'constructor', 'toString', 'unknown', {}, [], 3, null]) {
  send({ t: 'store', fac, id: 'writ' });
  assert.equal(
    JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]),
    beforeMalformed,
    'Invalid faction cannot corrupt station purchases',
  );
}
send({ t: 'store', fac: 'quantum', id: {} });
assert.equal(
  JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]),
  beforeMalformed,
);
playerData.station.site = undefined;
const beforeDenied = JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]);
send({ t: 'store', fac: 'quantum', id: 'writ' });
assert.equal(
  JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]),
  beforeDenied,
  'Other or unclaimed Personal Station does not grant remote stores',
);
playerData.stellar = null;
send({ t: 'store', fac: 'quantum', id: 'writ' });
assert.equal(
  JSON.stringify([playerData.rep, playerData.tokens, playerData.credits]),
  beforeDenied,
  'No purchases in flight',
);
console.log(
  'Faction standing: actual job/story/arc/commission/kill/hit/store/save-login regressions passed.',
);

process.exit(0);
