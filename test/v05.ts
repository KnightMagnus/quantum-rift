import type { PlayerData as LegacyPlayerData } from '../server/game.ts';

import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.5 tests: shuttles, officers (stats, synergy, xp), research queue, refining up, drydock presets, boarding.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS, RESEARCH } from '../shared/galaxy.ts';
import { RARITY } from '../shared/hangar.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v05-')));
const assertCondition = (captain: unknown, message: string) => {
  if (!captain) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '6.6.6.' + Math.floor(Math.random() * 200));
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
    toasts: () =>
      legacySocket2.out
        .filter((message: { t: string }) => message.t === 'toast')
        .map((message) => message.msg),
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
const firstEntry = fake('Hangar Chief'),
  playerData = requiredFixtureValue(firstEntry.s).data;
assertCondition(
  Array.isArray(playerData.shuttles) &&
    Array.isArray(playerData.officers) &&
    playerData.bridge &&
    Array.isArray(playerData.dock) &&
    Array.isArray(playerData.station.queue),
  'saves get hangar, crew and drydock fields',
);
// a station section at Meridian, Ops 2
playerData.credits = 5e7;
for (const message of ['alloy', 'crystal', 'isotope'])
  playerData.mats[message] = [20, 20, 20, 20, 20];
Object.assign(playerData.station, { claimed: true, ops: 2, site: 'site-meridian' });
game.db.world.sites['site-meridian'] = game.db.key(playerData.name);
playerData.sys = 'meridian';
playerData.stellar = 'site-meridian';
assertCondition(
  game.features.hangar.bays(playerData) === 1 && game.features.hangar.dockSlots(playerData) === 5,
  'Ops 2: one shuttle bay, five stored-ship berths',
);
firstEntry.send({ t: 'shuttle', op: 'build', kind: 'salvage' });
assertCondition(playerData.shuttles.length === 0, 'the Salvage Tender needs Ops 3');
firstEntry.send({ t: 'shuttle', op: 'build', kind: 'courier' });
assertCondition(
  playerData.shuttles.length === 1 && playerData.shuttles[0].state === 'idle',
  'built a Courier Shuttle',
);
firstEntry.send({ t: 'shuttle', op: 'build', kind: 'survey' });
assertCondition(playerData.shuttles.length === 1, 'one bay means one shuttle');
// job board
const board = game.features.hangar.shuttleBoard(playerData);
assertCondition(
  board.length >= 5 && new Set(board.map((secondaryIndex) => secondaryIndex.kind)).size >= 5,
  `the hangar board posts ${board.length} jobs of every kind`,
);
assertCondition(
  board.every(
    (secondaryIndex2) =>
      secondaryIndex2.minutes >= 15 &&
      secondaryIndex2.minutes <= 480 &&
      systemsById[secondaryIndex2.sys],
  ),
  'jobs run 15 minutes to 8 hours, to real systems',
);
assertCondition(
  JSON.stringify(
    game.features.hangar.shuttleBoard(playerData).map((secondaryIndex3) => secondaryIndex3.id),
  ) === JSON.stringify(board.map((secondaryIndex4) => secondaryIndex4.id)),
  'the board is stable within its window',
);
const mission = board.find((secondaryIndex5) => secondaryIndex5.kind === 'delivery') || board[0];
const savedShuttle = playerData.shuttles[0],
  credits = playerData.credits;
firstEntry.send({ t: 'shuttle', op: 'send', sid: savedShuttle.id, job: mission.id });
assertCondition(
  savedShuttle.state === 'out' &&
    requiredFixtureValue(savedShuttle.ends) > Date.now() &&
    requiredFixtureValue(savedShuttle.chance) > 0.15,
  `launched on "${mission.title}" (${Math.round(requiredFixtureValue(savedShuttle.chance) * 100)}% odds)`,
);
assertCondition(
  !game.features.hangar
    .shuttleBoard(playerData)
    .some((secondaryIndex6) => secondaryIndex6.id === mission.id),
  'a taken job leaves the board',
);
savedShuttle.outcome = 'success';
savedShuttle.ends = Date.now() - 1;
game.idleCheck(firstEntry.s);
assertCondition(
  savedShuttle.state === 'idle' && playerData.credits > credits && savedShuttle.runs === 1,
  `the shuttle came home and paid out (${playerData.credits - credits} cr)`,
);
// a lost shuttle disappears, a damaged one needs repairs
firstEntry.send({
  t: 'shuttle',
  op: 'send',
  sid: savedShuttle.id,
  job: game.features.hangar.shuttleBoard(playerData)[0].id,
});
savedShuttle.outcome = 'damaged';
savedShuttle.ends = Date.now() - 1;
game.idleCheck(firstEntry.s);
assertCondition(
  savedShuttle.state === 'damaged',
  'a failed run can bring the shuttle home damaged',
);
firstEntry.send({ t: 'shuttle', op: 'repair', sid: savedShuttle.id });
assertCondition(savedShuttle.state === 'idle', 'repaired at the station');
firstEntry.send({
  t: 'shuttle',
  op: 'send',
  sid: savedShuttle.id,
  job: game.features.hangar.shuttleBoard(playerData)[0].id,
});
savedShuttle.outcome = 'lost';
savedShuttle.ends = Date.now() - 1;
game.idleCheck(firstEntry.s);
assertCondition(playerData.shuttles.length === 0, 'a lost shuttle is gone');
// officers at a bar
playerData.stellar = 'meridian-yards';
const barOffers = game.features.hangar.barOffers(STELLARS['meridian-yards'], playerData);
assertCondition(
  barOffers.length === 3 &&
    barOffers.every((options) => options.race && options.role && RARITY[options.rarity]),
  `the bar at Meridian Yards has three officers (${barOffers.map((options) => options.name).join(', ')})`,
);
const computedShipStats = game.features.shipStats.stats(playerData);
firstEntry.send({ t: 'officer', op: 'hire', id: barOffers[0].id });
assertCondition(playerData.officers.length === 1, `hired ${playerData.officers[0].name}`);
assertCondition(
  !game.features.hangar
    .barOffers(STELLARS['meridian-yards'], playerData)
    .some((options) => options.id === barOffers[0].id),
  'a hired officer leaves the bar',
);
// force a known officer for the stat check
const officerRecord = playerData.officers[0];
Object.assign(officerRecord, { role: 'captain', rarity: 2, lv: 1, race: 'quantum' });
firstEntry.send({ t: 'officer', op: 'assign', oid: officerRecord.id, slot: 'captain' });
const computedShipStats2 = game.features.shipStats.stats(playerData);
assertCondition(
  requiredFixtureValue(computedShipStats2).shield >
    requiredFixtureValue(computedShipStats).shield &&
    requiredFixtureValue(computedShipStats2).damageMul >
      requiredFixtureValue(computedShipStats).damageMul,
  `a Rare captain raises shields ${requiredFixtureValue(computedShipStats).shield} -> ${requiredFixtureValue(computedShipStats2).shield} and damage x${requiredFixtureValue(computedShipStats2).damageMul.toFixed(3)}`,
);
playerData.officers.push({
  id: game.features.hangar.uid(playerData),
  name: 'Test Two',
  race: 'quantum',
  role: 'engineer',
  rarity: 0,
  lv: 1,
  xp: 0,
});
const before = game.features.bonuses.bonus(playerData).shieldPct || 0;
firstEntry.send({ t: 'officer', op: 'assign', oid: playerData.officers[1].id, slot: 'bridge1' });
assertCondition(
  (game.features.bonuses.bonus(playerData).shieldPct || 0) >= before + 5,
  'two Concord officers on the bridge unlock the Concord synergy (+5% shields)',
);
const level0 = officerRecord.lv;
game.features.hangar.officerXp(firstEntry.s, 5000);
assertCondition(
  officerRecord.lv > level0,
  `bridge officers level up with experience (level ${officerRecord.lv})`,
);
assertCondition(
  requiredFixtureValue(firstEntry.last('you')).d.officers.length === 2 &&
    requiredFixtureValue(firstEntry.last('you')).d.bonus.shieldPct > 0,
  'the client receives the roster and bonuses',
);
// research queue with prerequisites
playerData.stellar = 'site-meridian';
playerData.station.ops = 5;
playerData.station.done = [];
playerData.station.active = null;
playerData.station.queue = [];
firstEntry.send({ t: 'station', op: 'research', id: 'shield3' });
assertCondition(
  playerData.station.active &&
    requiredFixtureValue<NonNullable<LegacyPlayerData['station']['active']>>(
      playerData.station.active,
    ).id === 'shield1' &&
    playerData.station.queue.join() === 'shield2,shield3',
  'queueing Shield Harmonics III queues I and II first and starts I',
);
requiredFixtureValue<NonNullable<LegacyPlayerData['station']['active']>>(
  playerData.station.active,
).ends = Date.now() - 1;
game.idleCheck(firstEntry.s);
assertCondition(
  playerData.station.done.includes('shield1') &&
    requiredFixtureValue<NonNullable<LegacyPlayerData['station']['active']>>(
      playerData.station.active,
    ).id === 'shield2',
  'finished research hands over to the next queued project',
);
firstEntry.send({ t: 'station', op: 'unqueue', id: 'shield3' });
assertCondition(!playerData.station.queue.length, 'projects can be removed from the queue');
assertCondition(
  RESEARCH.length >= 25 && new Set(RESEARCH.map((result) => result.tree)).size === 4,
  `${RESEARCH.length} research projects in four trees`,
);
// refining
playerData.mats.crystal[0] = 9;
firstEntry.send({ t: 'station', op: 'refine', mat: 'crystal', g: 0, n: 3 });
assertCondition(
  playerData.mats.crystal[0] === 0 && playerData.mats.crystal[1] === 23,
  'refined 9 crystal I into 3 crystal II',
);
// stored ships (2.1: the drydock became docks; FLY THIS / STORE still work through the old messages)
playerData.station.ops = 4;
assertCondition(
  game.features.hangar.dockSlots(playerData) === 11,
  'Ops 4: eleven stored-ship berths',
);
seedCargo(playerData, {});
if (playerData.ship.hull === 703) playerData.ship.hull = 708;
const hull0 = playerData.ship.hull;
firstEntry.send({ t: 'dock', op: 'store' });
assertCondition(
  playerData.dock.length === 1 &&
    playerData.dock[0].ship.hull === hull0 &&
    requiredFixtureValue(playerData.dock[0].bridge).captain === officerRecord.id &&
    playerData.shipless,
  'stored the ship with its bridge crew; no active ship until you choose one',
);
firstEntry.send({ t: 'dock', op: 'store', i: 0 });
assertCondition(
  playerData.ship.hull === hull0 &&
    playerData.bridge.captain === officerRecord.id &&
    playerData.dock.length === 0,
  'flying her again restores the bridge crew',
);
firstEntry.send({ t: 'dock', op: 'store' });
firstEntry.send({ t: 'dock', op: 'store' });
firstEntry.send({ t: 'dock', op: 'store' });
assertCondition(
  playerData.dock.length === 1 && playerData.shipless,
  'spam-storing does nothing once you have no active ship',
);
firstEntry.send({ t: 'dock', op: 'store', i: 0 });
// boarding
playerData.stellar = null;
playerData.sys = 'meridian';
game.spawnPlayer(firstEntry.s, 0, 0, 0, 0);
const space = game.spaces.meridian,
  entity = requiredFixtureValue(firstEntry.s).ent;
const makeElement = (faction: string) => {
  const shipEntity = space.makeShip({ hull: 711, faction: faction, x: 40, y: 0 });
  shipEntity.disabled = true;
  shipEntity.armor = 1;
  return shipEntity;
};
let shipEntity = makeElement('hollow');
const credits4 = playerData.credits;
firstEntry.send({ t: 'board', id: shipEntity.id, act: 'plunder' });
if (!(playerData.credits > credits4))
  console.log(
    'DBG',
    firstEntry.toasts().slice(-3),
    requiredFixtureValue(entity).x,
    requiredFixtureValue(entity).y,
    shipEntity.x,
    shipEntity.y,
    requiredFixtureValue(entity).st.size,
    shipEntity.st.size,
    requiredFixtureValue(entity).vx,
    shipEntity.vx,
  );
assertCondition(
  playerData.credits > credits4 && !space.ships.has(shipEntity.id),
  'plundered a disabled Hollow gunboat',
);
shipEntity = makeElement('spacer');
const rep0 = playerData.rep.spacer;
firstEntry.send({ t: 'board', id: shipEntity.id, act: 'rescue' });
assertCondition(playerData.rep.spacer === rep0 + 6, 'rescuing a Spacer crew earns standing');
shipEntity = makeElement('hollow');
shipEntity.strength = 1;
Object.assign(requiredFixtureValue(entity).st, { strength: 9999 });
let caught = false;
for (let index = 0; index < 12 && !caught; index++) {
  const length2 = playerData.dock.length;
  shipEntity = makeElement('hollow');
  shipEntity.strength = 1;
  firstEntry.send({ t: 'board', id: shipEntity.id, act: 'capture' });
  caught = playerData.dock.length > length2;
}
assertCondition(
  caught && playerData.dock.some((entry) => entry.ship.hull === 711),
  'captured a gunboat into the drydock',
);
shipEntity = space.makeShip({ hull: 711, faction: 'hollow', x: 900, y: 0 });
shipEntity.disabled = true;
firstEntry.send({ t: 'board', id: shipEntity.id, act: 'plunder' });
assertCondition(space.ships.has(shipEntity.id), 'boarding needs you alongside');
// mining yield bonus
const _bonus2 = game.features.bonuses.bonus(playerData);
playerData.station.done.push('mining1', 'mining2');
assertCondition(
  game.features.bonuses.bonus(playerData).miningPct >= 60,
  'mining research raises ore yield',
);
console.log('ALL 0.5 TESTS PASSED');
process.exit(0);
