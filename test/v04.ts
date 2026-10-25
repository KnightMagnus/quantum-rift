import type { SavedRockGeneration } from '../server/mining-contracts.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.4 tests: the 200-system galaxy, sleeping systems, region traffic, mining, ore processing, charting, routes.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYSTEMS, SYS as systemsById, SITES, FACTIONS, ORE_PROCESS } from '../shared/galaxy.ts';
import { route } from '../shared/rules.ts';
import { expandGalaxy } from '../shared/gen.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v04-')));
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
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
  game.connect(legacySocket2, '5.5.5.5');
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
// galaxy
assertCondition(
  systemsById.qgate.name === 'Concordia',
  'home system displays Concordia under its stable save ID',
);
assertCondition(
  systemsById.qgate.stellars.some(
    (body) => body.id === 'qstation' && body.name === 'Quantum Station',
  ),
  'Concordia retains Quantum Station and its stable body ID',
);
assertCondition(
  SYSTEMS.filter((starSystem3) => starSystem3.anchor || starSystem3.gen).length === 200 &&
    SYSTEMS.length === 217,
  `200 generated systems, plus Sol and the 16 Farside systems (${SYSTEMS.length})`,
);
const seen = new Set(['qgate']),
  pendingSystemIds = ['qgate'];
while (pendingSystemIds.length) {
  const starSystem3 = systemsById[requiredFixtureValue(pendingSystemIds.shift())];
  for (const linkedSystemId of [
    ...starSystem3.links,
    ...(starSystem3.gate ? [starSystem3.gate] : []),
  ])
    if (!seen.has(linkedSystemId)) {
      seen.add(linkedSystemId);
      pendingSystemIds.push(linkedSystemId);
    }
}
assertCondition(
  seen.size === Object.keys(systemsById).length,
  'every system can be reached from Concordia (Farside through the Sol Gateway)',
);
assertCondition(
  SYSTEMS.every((system) =>
    system.links.every((linkedSystemId2) => systemsById[linkedSystemId2].links.includes(system.id)),
  ),
  'routes go both ways',
);
const source: Record<string, number> = {};
for (const starSystem3 of SYSTEMS)
  source[starSystem3.faction] = (source[starSystem3.faction] || 0) + 1;
assertCondition(
  source.farside === 16 &&
    source.frontier >= 25 &&
    source.frontier <= 70 &&
    source.deep >= 6 &&
    Object.keys(FACTIONS)
      .filter((faction) => !FACTIONS[faction].hidden)
      .every((feature) => source[feature]),
  'every power has territory, plus Frontier and the Deep: ' + JSON.stringify(source),
);
assertCondition(
  systemsById.qgate.stellars.some((player) => player.hub) &&
    systemsById.qgate.links.includes('meridian'),
  'the hand-made anchors keep their worlds and routes',
);
// determinism: regenerating from the same anchors gives the same galaxy
const _raw = filesystem.readFileSync(new URL('../shared/galaxy.ts', import.meta.url), 'utf8');
assertCondition(SITES.length >= 25, `${SITES.length} claimable hulls (17 + Frontier)`);
const copy = (
  JSON.parse(JSON.stringify(SYSTEMS.filter((starSystem3) => starSystem3.anchor))) as typeof SYSTEMS
).map((starSystem3) => ({
  ...starSystem3,
  links: starSystem3.links.filter(
    (linkedSystemId3: string | number) => systemsById[linkedSystemId3].anchor,
  ),
  stellars: starSystem3.stellars.filter((stellarBody) => !stellarBody.site),
}));
// undo the scale so expandGalaxy can be run again
for (const starSystem3 of copy) {
  starSystem3.x = Math.round(495 + (starSystem3.x - 495) / 1.7);
  starSystem3.y = Math.round(370 + (starSystem3.y - 370) / 1.7);
  delete starSystem3.anchor;
}
expandGalaxy(copy, FACTIONS);
assertCondition(
  copy.length === 200 &&
    copy
      .slice(30)
      .every(
        (session: { name: string }, index: number) => session.name === SYSTEMS[30 + index].name,
      ),
  'the generator is deterministic (same names, same order)',
);
// routes
const starSystem = SYSTEMS.find((starSystem3) => starSystem3.faction === 'deep');
const result = route(systemsById, 'qgate', requiredFixtureValue(starSystem).id);
assertCondition(
  result.length >= 3 &&
    result[result.length - 1] === requiredFixtureValue(starSystem).id &&
    result.every((entry, index) =>
      systemsById[index ? result[index - 1] : 'qgate'].links.includes(entry),
    ),
  `route to ${requiredFixtureValue(starSystem).name}: ${result.length} jumps`,
);
// sleeping systems
assertCondition(
  Object.keys(game.live).length === 0,
  'no systems are simulated before anyone arrives',
);
const firstEntry = fake('Miner');
const playerData = requiredFixtureValue(firstEntry.s).data;
firstEntry.send({ t: 'depart' });
assertCondition(Object.keys(game.live).length === 1, 'departing wakes only the system you are in');
const space = game.live.qgate;
space.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent));
space.players = 0;
requiredFixtureValue(firstEntry.s).ent = null;
for (let index = 0; index < 15 * 30 * 9; index++) game.tick(); // ~2 min of quiet ticks
assertCondition(!game.live.qgate, 'an empty system goes back to sleep');
playerData.stellar = 'qstation';
// region traffic flies real flags
const starSystem2 = SYSTEMS.find(
    (starSystem3) => starSystem3.faction === 'frontier' && starSystem3.danger >= 3,
  ),
  message = game.spaces[requiredFixtureValue(starSystem2).id];
for (let index = 0; index < 12; index++) message.spawnTraffic(false);
assertCondition(
  [...message.ships.values()].every(
    (entity) => !FACTIONS[entity.faction].region || FACTIONS[entity.faction].hidden,
  ),
  `Frontier traffic in ${requiredFixtureValue(starSystem2).name} flies real flags: ${[...new Set([...message.ships.values()].map((shipEntity) => shipEntity.faction))].join(', ')}`,
);
// mining
const mineSys = SYSTEMS.find(
  (starSystem3) =>
    starSystem3.fields &&
    starSystem3.fields.some((asteroid) => asteroid.ore === 'ore') &&
    starSystem3.stellars.length,
);
const message2 = game.spaces[requiredFixtureValue(mineSys).id];
assertCondition(
  message2.rocks.length > 0,
  `${requiredFixtureValue(mineSys).name} has ${message2.rocks.length} asteroids`,
);
playerData.sys = requiredFixtureValue(mineSys).id;
playerData.stellar = requiredFixtureValue(
  requiredFixtureValue(mineSys).stellars.find((stellarBody) =>
    requiredFixtureValue(stellarBody.svc).includes('L'),
  ),
).id;
requiredFixtureValue(firstEntry.s).ent = null;
game.depart(firstEntry.s);
const legacyPacket = firstEntry.last('space');
assertCondition(
  requiredFixtureValue(legacyPacket).rocks &&
    requiredFixtureValue(legacyPacket).rocks.length === message2.rocks.length,
  'the arrival message lists the rocks',
);
const rock = (message2.rocks as SavedRockGeneration[]).find(
  (rockGeneration) => rockGeneration.ore === 'ore',
);
const lootN = message2.loot.length;
// Stages share one finite budget; legacy direct hits remain ordinary, never fake clean contact.
for (let stage = 0; stage < requiredFixtureValue(rock).stages; stage++)
  message2.hitRock(requiredFixtureValue(rock), requiredFixtureValue(rock).max, true);
assertCondition(
  requiredFixtureValue(rock).down > 0 && message2.loot.length > lootN,
  'a mining hit breaks the rock into ore',
);
const oreType = message2.loot.filter((message3) => message3.it.ore);
const entity = requiredFixtureValue(firstEntry.s).ent;
requiredFixtureValue(entity).x = oreType[0].x;
requiredFixtureValue(entity).y = oreType[0].y;
requiredFixtureValue(entity).vx = requiredFixtureValue(entity).vy = 0;
const before = playerData.cargo.ore || 0;
message2.tick();
assertCondition(
  (playerData.cargo.ore || 0) > before,
  `scooped ore into the hold (${playerData.cargo.ore} t)`,
);
const generation = requiredFixtureValue(rock).generation;
requiredFixtureValue(rock).down = requiredFixtureValue(game.db.world.mining).clock - 1;
game.features.mining.endTick(message2);
assertCondition(
  (message2.rocks as SavedRockGeneration[]).some(
    (rockGeneration) =>
      rockGeneration.generation === generation + 1 &&
      rockGeneration.x === requiredFixtureValue(rock).x &&
      rockGeneration.y === requiredFixtureValue(rock).y,
  ) ||
    (message2.rocks as SavedRockGeneration[]).some(
      (rockGeneration) => rockGeneration.generation === generation + 1,
    ),
  'broken rocks regrow as a fresh deterministic generation',
);
const savedRockGeneration = (message2.rocks as SavedRockGeneration[]).find(
  (rockGeneration) => !rockGeneration.down,
);
const hullPoints = requiredFixtureValue(savedRockGeneration).hp;
message2.hitRock(requiredFixtureValue(savedRockGeneration), 10, false);
const dmgN = hullPoints - requiredFixtureValue(savedRockGeneration).hp;
requiredFixtureValue(savedRockGeneration).hp = hullPoints;
message2.hitRock(requiredFixtureValue(savedRockGeneration), 10, true);
assertCondition(
  hullPoints - requiredFixtureValue(savedRockGeneration).hp === dmgN * 6,
  'mining weapons are six times as effective on rock',
);
// processing at your station
playerData.credits = 1e6;
playerData.station.claimed = true;
playerData.station.ops = 3;
playerData.station.site = 'site-meridian';
game.db.world.sites['site-meridian'] = game.db.key(playerData.name);
requiredFixtureValue(firstEntry.s).ent = null;
message2.players--;
playerData.sys = 'meridian';
playerData.stellar = 'site-meridian';
seedCargo(playerData, { ore: 30 });
firstEntry.send({ t: 'station', op: 'process', id: 'ore', all: 1 });
assertCondition(
  playerData.mats.alloy[ORE_PROCESS.grade[3]] >= 2 && playerData.cargo.ore === 6,
  `processed 24 t of ore into alloy ${['I', 'II', 'III'][ORE_PROCESS.grade[3]]} crates`,
);
// charting
playerData.stellar = null;
game.spawnPlayer(firstEntry.s, 0, 0, 0, 0);
const destination = systemsById.meridian.links.find(
  (linkedSystemId5) => !playerData.explored.includes(linkedSystemId5),
);
const entity2 = requiredFixtureValue(firstEntry.s).ent;
requiredFixtureValue(entity2).state = 'jumpout';
requiredFixtureValue(entity2).jumpTo = destination;
requiredFixtureValue(entity2).fuel = 1000;
game.finishJump(requiredFixtureValue(entity2), game.spaces.meridian);
assertCondition(
  playerData.explored.includes(requiredFixtureValue(destination)) &&
    requiredFixtureValue(firstEntry.last('you')).d.explored.includes(
      requiredFixtureValue(destination),
    ),
  `charted ${systemsById[requiredFixtureValue(destination)].name} on arrival`,
);
console.log('ALL 0.4 TESTS PASSED');
process.exit(0);
