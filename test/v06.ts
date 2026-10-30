import { mockMission } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.6 tests: Umbral hostility fix, the Armada (2.6: replaced fleets; territory removed), invasions, anomalies, events, goals,
// faction stores and the new job types.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS, SYSTEMS, FACTIONS } from '../shared/galaxy.ts';
import { anomaliesAt, eventAt, eventCalendar, SCAN } from '../shared/fronts.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v06-')));
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
let ipAddress = 1;
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '7.7.7.' + ipAddress++);
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
    all: (messageType2: string) =>
      legacySocket2.out.filter((message) => message.t === messageType2),
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
const toSpace = (
  captain: ReturnType<typeof fake>,
  starSystem: string,
  horizontalPosition = 0,
  verticalPosition = 0,
) => {
  const playerData = requiredFixtureValue(captain.s).data;
  if (requiredFixtureValue(captain.s).ent) {
    const space = game.spaces[playerData.sys];
    space.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent));
    space.players--;
    requiredFixtureValue(captain.s).ent = null;
  }
  playerData.sys = starSystem;
  playerData.stellar = null;
  game.spawnPlayer(captain.s, horizontalPosition, verticalPosition, 0, 0);
  return requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent);
};

// Umbral fix
const firstEntry = fake('Fleet Admiral'),
  secondEntry = fake('Wing Two'),
  playerData = requiredFixtureValue(firstEntry.s).data,
  playerData4 = requiredFixtureValue(secondEntry.s).data;
playerData.credits = playerData4.credits = 5e7;
const umSys = SYSTEMS.find((starSystem3) => starSystem3.faction === 'umbral');
const shipEntity = toSpace(firstEntry, requiredFixtureValue(umSys).id),
  message = game.spaces[requiredFixtureValue(umSys).id];
const shipEntity2 = message.makeShip({ hull: 761, faction: 'umbral', x: 300, y: 0, ai: 'raid' });
assertCondition(
  message.isHostile(shipEntity2, requiredFixtureValue(shipEntity)),
  'Umbral ships now attack captains on sight (they were peaceful before)',
);
const credits = playerData.credits,
  rep0 = playerData.rep.umbral;
message.kill(shipEntity2, shipEntity);
assertCondition(
  playerData.credits > credits && playerData.rep.umbral === rep0,
  'destroying Umbral pays a bounty and costs no standing',
);
// 2.6: the Armada replaces fleets (the full co-op suite is test/v26.ts)
const starSystem = SYSTEMS.find(
  (starSystem3) =>
    starSystem3.faction === 'frontier' &&
    starSystem3.stellars.some((player) => requiredFixtureValue(player.svc).includes('T')),
);
toSpace(firstEntry, 'qgate');
toSpace(secondEntry, 'qgate');
firstEntry.send({ t: 'armada', op: 'form', name: 'Expanse Wardens' });
const armadaState = game.features.coop.armadaOf(playerData);
assertCondition(armadaState && armadaState.name === 'Expanse Wardens', 'formed an Armada');
firstEntry.send({ t: 'armada', op: 'invite', name: 'Wing Two' });
secondEntry.send({ t: 'armada', op: 'accept', id: requiredFixtureValue(armadaState).id });
assertCondition(
  playerData4.armada === requiredFixtureValue(armadaState).id &&
    requiredFixtureValue(armadaState).members.length === 2,
  'a captain in the same system joined by invite',
);
const captain = fake('Outsider');
firstEntry.send({ t: 'chat', msg: 'form up', ch: 'armada' });
assertCondition(
  secondEntry
    .all('chat')
    .some(
      (message2: { msg: string; ch: string }) =>
        message2.msg === 'form up' && message2.ch === 'armada',
    ) && !captain.all('chat').some((message2: { msg: string }) => message2.msg === 'form up'),
  'Armada chat reaches only members',
);
const starSystem2 = SYSTEMS.find(
  (starSystem3) => starSystem3.danger >= 3 && starSystem3.faction === 'frontier',
);
const shipEntity3 = toSpace(firstEntry, requiredFixtureValue(starSystem2).id, 0, 0),
  shipEntity4 = toSpace(secondEntry, requiredFixtureValue(starSystem2).id, 50, 0),
  shipEntity5 = toSpace(captain, requiredFixtureValue(starSystem2).id, 100, 0),
  message2 = game.spaces[requiredFixtureValue(starSystem2).id];
assertCondition(
  !message2.isHostile(requiredFixtureValue(shipEntity3), shipEntity4) &&
    !message2.isHostile(requiredFixtureValue(shipEntity3), shipEntity5),
  'Armada members never fight, and there is no open-galaxy PvP even in lawless space',
);
const credits8 = playerData4.credits,
  shipEntity6 = message2.makeShip({ hull: 711, faction: 'hollow', x: 20, y: 20 });
message2.kill(shipEntity6, shipEntity3);
assertCondition(playerData4.credits > credits8, 'Armada members in the same system share bounties');
// invasion
const invSys = SYSTEMS.find(
  (starSystem3) =>
    starSystem3.danger >= 2 &&
    starSystem3.faction !== 'quantum' &&
    starSystem3.stellars.length &&
    starSystem3.id !== requiredFixtureValue(starSystem).id,
);
const boss = game.features.fronts.startInvasion(1, requiredFixtureValue(invSys).id);
assertCondition(
  boss &&
    game.features.fronts.worldPayload().invasion &&
    game.live[requiredFixtureValue(invSys).id].keep,
  `the ${requiredFixtureValue(game.features.fronts.worldPayload().invasion).name} invades ${requiredFixtureValue(invSys).name}`,
);
assertCondition(
  firstEntry.all('chat').some((message3: { msg: string }) => /INVASION/.test(message3.msg)) &&
    requiredFixtureValue(firstEntry.last('world')).invasion.sys === requiredFixtureValue(invSys).id,
  'the invasion is announced and shown on the map',
);
const shipEntity7 = toSpace(firstEntry, requiredFixtureValue(invSys).id, boss.x + 200, boss.y),
  shipEntity8 = toSpace(secondEntry, requiredFixtureValue(invSys).id, boss.x - 200, boss.y),
  message3 = game.spaces[requiredFixtureValue(invSys).id];
assertCondition(
  message3.isHostile(boss, requiredFixtureValue(shipEntity7)),
  'the boss attacks every captain',
);
const credits9 = playerData.credits,
  credits10 = playerData4.credits;
message3.damage(boss, 3000, 3000, shipEntity7);
message3.damage(boss, 1000, 1000, shipEntity8);
boss.shield = 0;
boss.armor = 1;
message3.damage(boss, 10, 10, shipEntity7);
assertCondition(
  !game.features.fronts.worldPayload().invasion &&
    playerData.credits - credits9 > playerData4.credits - credits10 &&
    playerData4.credits > credits10,
  'killing the boss pays everyone by damage share',
);
// anomalies and events
const anomaliesAt2 = anomaliesAt(SYSTEMS);
assertCondition(
  Object.keys(anomaliesAt2).length === 9 &&
    JSON.stringify(anomaliesAt(SYSTEMS)) === JSON.stringify(anomaliesAt2),
  'nine anomalies, the same for everyone in a 6-hour window',
);
const shearSys = Object.entries(anomaliesAt2).find(([, propertyKey]) => propertyKey === 'shear');
if (shearSys)
  assertCondition(
    game.features.fronts.mods(shearSys[0]).jumpFuel === 2,
    'gravity shear doubles jump fuel',
  );
assertCondition(
  eventAt() && eventCalendar().length === 7,
  `server event now: ${requiredFixtureValue(eventAt()).name}`,
);
// goals
const goalsFor2 = game.features.fronts.goalsFor(playerData);
assertCondition(
  goalsFor2.daily.length === 3 && goalsFor2.weekly.length === 3,
  'three daily and three weekly goals',
);
goalsFor2.daily[0].got = goalsFor2.daily[0].n;
const credits11 = playerData.credits;
firstEntry.send({ t: 'goal', period: 'daily', i: 0 });
assertCondition(
  playerData.credits > credits11 &&
    goalsFor2.daily[0].claimed &&
    requiredFixtureValue(playerData.tokens).any >= 2,
  'claimed a daily goal: credits and Rift scrip',
);
const savedGoal =
  goalsFor2.weekly.find((game3) => game3.type === 'jumps') ||
  goalsFor2.daily.find((game2) => game2.type === 'jumps');
if (savedGoal) {
  // Date rotation can select the daily goal claimed above; isolate jump progress.
  savedGoal.claimed = false;
  savedGoal.got = 0;
  const count0 = savedGoal.got;
  game.features.fronts.goal(firstEntry.s, 'jumps');
  assertCondition(savedGoal.got === count0 + 1, 'jumps count toward goals');
}
// stores
const stellarBody = STELLARS['meridian-yards'];
playerData.sys = 'meridian';
if (requiredFixtureValue(firstEntry.s).ent) {
  game.spaces[requiredFixtureValue(invSys).id].remove(
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent),
  );
  game.spaces[requiredFixtureValue(invSys).id].players--;
  requiredFixtureValue(firstEntry.s).ent = null;
}
playerData.stellar = stellarBody.id;
assertCondition(
  game.features.fronts.storeFor(stellarBody) === 'quantum',
  'Concord worlds run a Concord store',
);
playerData.tokens = { quantum: 3, any: 20 };
playerData.rep.quantum = 35;
const alloy2 = playerData.mats.alloy[2];
firstEntry.send({ t: 'store', id: 'crate3' });
assertCondition(
  playerData.mats.alloy[2] === alloy2 + 1 &&
    playerData.tokens.quantum === 0 &&
    playerData.tokens.any === 9,
  'bought a grade III crate with tokens topped up by scrip',
);
firstEntry.send({ t: 'store', id: 'epic' });
assertCondition(
  !playerData.officers.some((options) => options.rarity === 3),
  'Epic contracts need Exalted standing',
);
// jobs: broad inventory uses a suitably armed, experienced captain rather than a starter.
playerData.stats.combat = 50000;
game.seedFleet(playerData, { docks: [{ lead: 736, wings: [717, 717] }] });
const offers = SYSTEMS.flatMap((starSystem3) =>
  starSystem3.stellars
    .filter(
      (stellarBody3) => requiredFixtureValue(stellarBody3.svc).includes('B') && !stellarBody3.site,
    )
    .slice(0, 1),
)
  .slice(0, 25)
  .flatMap((stellarBody3) => game.offers(STELLARS[stellarBody3.id], playerData));
const kinds = new Set(offers.map((mission7) => mission7.type));
assertCondition(
  ['bounty', 'convoy', 'smuggle', 'rescue', 'survey', 'assassinate'].every((propertyKey2) =>
    kinds.has(propertyKey2),
  ),
  `job boards post the new jobs: ${[...kinds].join(', ')}`,
);
assertCondition(
  offers.some((mission7) => mission7.chain),
  'faction commissions (job chains) are offered',
);
// convoy: accept, arrive, the freighter lands
const mission = offers.find((mission7) => mission7.type === 'convoy');
playerData.missions = [mockMission({ ...mission, owner: requiredFixtureValue(firstEntry.s).id })];
toSpace(firstEntry, requiredFixtureValue(mission).sys, 0, 0);
const message4 = game.spaces[requiredFixtureValue(mission).sys],
  conv = [...message4.ships.values()].find((entity) => entity.convoyOf);
assertCondition(
  conv && conv.name === requiredFixtureValue(mission).convoyName,
  `the convoy ${requiredFixtureValue(mission).convoyName} joins you on arrival`,
);
const stellarBody3 = STELLARS[requiredFixtureValue(requiredFixtureValue(mission).dest)];
requiredFixtureValue(conv).x = stellarBody3.x;
requiredFixtureValue(conv).y = stellarBody3.y;
requiredFixtureValue(conv).vx = requiredFixtureValue(conv).vy = 0;
for (let index = 0; index < 40; index++) message4.tick();
assertCondition(playerData.missions[0].done, 'the convoy landed: job done');
const mission7 = offers.filter((mission8) => mission8.type === 'convoy')[1] || mission;
playerData.missions = [
  mockMission({
    ...mission7,
    id: 'cv2',
    owner: requiredFixtureValue(firstEntry.s).id,
    spawned: false,
  }),
];
toSpace(firstEntry, mission7.sys, 0, 0);
const conv2 = [...game.spaces[mission7.sys].ships.values()].find(
  (shipEntity9) => shipEntity9.convoyOf && shipEntity9.convoyOf.id === 'cv2',
);
game.spaces[mission7.sys].kill(requiredFixtureValue(conv2), null);
assertCondition(!playerData.missions.length, 'a destroyed convoy fails the job');
// rescue
const mission3 = offers.find((mission8) => mission8.type === 'rescue');
playerData.missions = [mockMission({ ...mission3, owner: requiredFixtureValue(firstEntry.s).id })];
const shipEntity9 = toSpace(firstEntry, requiredFixtureValue(mission3).sys, 0, 0),
  message5 = game.spaces[requiredFixtureValue(mission3).sys],
  wreck = [...message5.ships.values()].find((shipEntity10) => shipEntity10.rescueOf);
assertCondition(wreck && wreck.disabled, 'the stranded ship is waiting, disabled');
requiredFixtureValue(shipEntity9).x = requiredFixtureValue(wreck).x + 30;
requiredFixtureValue(shipEntity9).y = requiredFixtureValue(wreck).y;
requiredFixtureValue(shipEntity9).vx = requiredFixtureValue(wreck).vx;
requiredFixtureValue(shipEntity9).vy = requiredFixtureValue(wreck).vy;
firstEntry.send({ t: 'board', id: requiredFixtureValue(wreck).id, act: 'rescue' });
assertCondition(playerData.missions[0].done, 'boarding and rescuing completes the job');
// survey
const mission4 = offers.find((mission8) => mission8.type === 'survey' && !mission8.chain);
playerData.missions = [mockMission({ ...mission4, owner: requiredFixtureValue(firstEntry.s).id })];
const shipEntity10 = toSpace(firstEntry, requiredFixtureValue(mission4).sys, 0, 0);
for (const player of requiredFixtureValue(requiredFixtureValue(mission4).points)) {
  requiredFixtureValue(shipEntity10).x = player[0];
  requiredFixtureValue(shipEntity10).y = player[1];
  game.features.fronts.missionIdle(firstEntry.s);
}
assertCondition(playerData.missions[0].done, 'flew over every survey point');
const land =
  systemsById[requiredFixtureValue(mission4).sys].stellars.find((stellarBody4) =>
    requiredFixtureValue(stellarBody4.svc).includes('L'),
  ) || STELLARS['meridian-yards'];
const credits12 = playerData.credits;
game.completeOnLanding(firstEntry.s, STELLARS[land.id]);
assertCondition(
  playerData.credits > credits12 && !playerData.missions.length,
  'paid on landing, with faction tokens',
);
// smuggling scan
const mission5 = offers.find((mission8) => mission8.type === 'smuggle');
playerData.missions = [mockMission({ ...mission5, owner: requiredFixtureValue(firstEntry.s).id })];
const lawSys = SYSTEMS.find(
  (starSystem3) =>
    !FACTIONS[starSystem3.faction].region &&
    !FACTIONS[starSystem3.faction].pirate &&
    starSystem3.danger <= 2 &&
    starSystem3.faction !== 'umbral',
);
const _shipEntity11 = toSpace(firstEntry, requiredFixtureValue(lawSys).id, 0, 0),
  _cop = game.spaces[requiredFixtureValue(lawSys).id].makeShip({
    hull: 711,
    faction: requiredFixtureValue(lawSys).faction,
    x: 60,
    y: 0,
    ai: 'patrol',
  });
SCAN.chance = 1;
const reputationBefore = playerData.rep[requiredFixtureValue(lawSys).faction];
game.features.fronts.missionIdle(firstEntry.s);
assertCondition(
  !playerData.missions.length &&
    playerData.rep[requiredFixtureValue(lawSys).faction] === reputationBefore - 5,
  'a patrol scan catches smugglers: fined, cargo seized, standing lost',
);
// chain
const mission6 = offers.find((mission8) => mission8.chain);
playerData.missions = [
  mockMission({ ...mission6, owner: requiredFixtureValue(firstEntry.s).id, done: true }),
];
playerData.chains = {};
game.completeOnLanding(firstEntry.s, STELLARS['meridian-yards']);
assertCondition(
  playerData.chains[requiredFixtureValue(requiredFixtureValue(mission6).chain).fac] === 1,
  'finishing a commission step unlocks the next',
);
console.log('ALL 0.6 TESTS PASSED');
process.exit(0);
