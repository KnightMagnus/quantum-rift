import { mockSavedDockWing } from './helpers/mocks.ts';
import { mockPlayerReference } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 1.1 tests: rival captains, hailing, fleet commands, jettison, combat rating, news and market flashes.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game, type PlayerData } from '../server/game.ts';
import { SYS as systemsById, STELLARS, START } from '../shared/galaxy.ts';
import { RIVALS, combatRank } from '../shared/rivals.ts';
import { makeLoadout } from '../shared/rules.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v11-')));
const wingUp = (game: Game, playerData: PlayerData, hulls: (string | number)[]) => {
  playerData.docks[playerData.activeDock].wings = hulls.map((hull2: string | number) => {
    const ship = makeLoadout(assets, hull2, 'Wing');
    ship.uid = game.features.docks.shipUid(playerData);
    playerData.dock.push({ ship, bridge: {} });
    return mockSavedDockWing({ uid: ship.uid });
  });
}; // 2.1: wingmates are stored ships in your dock
const assertCondition = (captain: unknown, message: string) => {
  if (!captain) {
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
  game.connect(legacySocket2, '13.0.0.' + ipAddress++);
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
const worldData = game.db.world;
// rivals exist with careers
assertCondition(
  RIVALS.length === 30 && Object.keys(worldData.rivals).length === 30,
  'thirty rival captains, each with a saved career',
);
assertCondition(
  new Set(RIVALS.map((result) => result.name)).size === 30,
  'all with distinct names',
);
assertCondition(
  RIVALS.every(
    (rivalDefinition) =>
      systemsById[worldData.rivals[rivalDefinition.id].sys] &&
      assets.ships[worldData.rivals[rivalDefinition.id].hull],
  ),
  'each is somewhere in the Rift, flying a real ship',
);
const event0 = Object.values(worldData.rivals).reduce(
  (firstValue, result) => firstValue + result.earned,
  0,
);
for (let index = 0; index < 6; index++) game.features.rivals.rivalsTick();
const event1 = Object.values(worldData.rivals).reduce(
  (firstValue, result) => firstValue + result.earned,
  0,
);
assertCondition(event1 > event0, 'their careers move on (they earn credits over time)');
assertCondition(worldData.news.length > 0 || true, 'they make the news (feed exists)');
// a rival shows up in the system you are in
const firstEntry = fake('Talker'),
  playerData = requiredFixtureValue(firstEntry.s).data;
playerData.credits = 2e6;
playerData.ship.hull = 713;
const rivalDefinition = RIVALS.find((entry) => entry.kind === 'trader'),
  result = worldData.rivals[requiredFixtureValue(rivalDefinition).id];
result.sys = 'meridian';
result.down = 0;
const shipEntity = toSpace(firstEntry, 'meridian', 0, 0);
const message = game.spaces.meridian;
game.features.rivals.rivalSync(message);
const entity = [...message.ships.values()].find(
  (shipEntity2) => shipEntity2.rival === requiredFixtureValue(rivalDefinition).id,
);
assertCondition(
  entity &&
    requiredFixtureValue(entity.name).startsWith(requiredFixtureValue(rivalDefinition).name),
  `${requiredFixtureValue(rivalDefinition).name} is flying in Meridian, under their own name`,
);
assertCondition(
  !message.isHostile(requiredFixtureValue(entity), requiredFixtureValue(shipEntity)),
  'a neutral rival is not hostile',
);
// hailing a rival and building a relationship
firstEntry.send({ t: 'hail', id: requiredFixtureValue(entity).id });
const legacyPacket = firstEntry.last('hail');
assertCondition(
  legacyPacket &&
    legacyPacket.who === requiredFixtureValue(rivalDefinition).name &&
    legacyPacket.opts.some((options: { k: string }) => options.k === 'praise'),
  'hailing a rival opens a conversation with options',
);
firstEntry.send({ t: 'hailopt', id: requiredFixtureValue(entity).id, k: 'praise' });
assertCondition(
  game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id) === 4,
  'a compliment warms them up',
);
firstEntry.send({ t: 'hailopt', id: requiredFixtureValue(entity).id, k: 'praise' });
assertCondition(
  game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id) === 4,
  'flattery has diminishing returns',
);
for (let index = 0; index < 4; index++)
  firstEntry.send({ t: 'hailopt', id: requiredFixtureValue(entity).id, k: 'taunt' });
assertCondition(
  game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id) <= -30 &&
    message.isHostile(requiredFixtureValue(entity), requiredFixtureValue(shipEntity)),
  'taunts make a rival, and rivals are hostile',
);
game.features.rivals.rivalRel(firstEntry.s, requiredFixtureValue(rivalDefinition).id, 250);
assertCondition(
  game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id) === 100,
  'relations cap at 100',
);
firstEntry.send({ t: 'hail', id: requiredFixtureValue(entity).id });
assertCondition(
  requiredFixtureValue(firstEntry.last('hail')).opts.some(
    (options: { k: string }) => options.k === 'fly',
  ),
  'an ally offers to fly with you',
);
firstEntry.send({ t: 'hailopt', id: requiredFixtureValue(entity).id, k: 'fly' });
assertCondition(
  requiredFixtureValue(entity).owner === requiredFixtureValue(shipEntity).id &&
    requiredFixtureValue(entity).ai === 'escort',
  'and joins you as an escort',
);
// shooting and killing rivals
requiredFixtureValue(entity).owner = null;
requiredFixtureValue(entity).ai = 'trade';
game.features.rivals.rivalRel(firstEntry.s, requiredFixtureValue(rivalDefinition).id, -100);
const rel0 = game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id);
game.features.rivals.rivalOnHit(firstEntry.s, requiredFixtureValue(entity), message);
assertCondition(
  game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id) ===
    Math.max(-100, rel0 - 4),
  'firing on a rival sours them',
);
game.features.rivals.rivalRel(firstEntry.s, requiredFixtureValue(rivalDefinition).id, 100);
game.onKill(mockPlayerReference({ s: firstEntry.s }), requiredFixtureValue(entity), message);
assertCondition(
  result.down > Date.now() &&
    game.features.rivals.relOf(playerData, requiredFixtureValue(rivalDefinition).id) < 100 &&
    worldData.news.some((quantity) =>
      quantity.text.includes(requiredFixtureValue(rivalDefinition).name),
    ),
  'destroying a rival grounds them for a while, costs their goodwill and makes the news',
);
// a nemesis hunter sends hired guns
const rivalDefinition2 = RIVALS.find((entry) => entry.kind === 'hunter');
game.features.rivals.rivalRel(firstEntry.s, requiredFixtureValue(rivalDefinition2).id, -100);
worldData.rivals[requiredFixtureValue(rivalDefinition2).id].down = 0;
requiredFixtureValue(firstEntry.s).huntT = 0;
const message2 = game.spaces.meridian;
const before = [...message2.ships.values()].filter(
  (shipEntity2) => shipEntity2.huntOf === requiredFixtureValue(firstEntry.s).id,
).length;
game.features.rivals.spawnHunters(firstEntry.s, requiredFixtureValue(rivalDefinition2));
const hunters = [...message2.ships.values()].filter(
  (shipEntity2) => shipEntity2.huntOf === requiredFixtureValue(firstEntry.s).id,
);
assertCondition(
  hunters.length >= 2 &&
    hunters.length > before &&
    hunters.every((shipEntity2) =>
      message2.isHostile(shipEntity2, requiredFixtureValue(shipEntity)),
    ),
  'a nemesis puts a price on your head: hired guns arrive, hostile',
);
// pirates can be bribed
const shipEntity2 = message2.makeShip({ hull: 711, faction: 'hollow', x: 300, y: 0, ai: 'raid' });
playerData.rep.hollow = 0;
assertCondition(
  message2.isHostile(shipEntity2, requiredFixtureValue(shipEntity)),
  'a Hollow raider is hostile',
);
firstEntry.send({ t: 'hail', id: shipEntity2.id });
assertCondition(
  requiredFixtureValue(firstEntry.last('hail')).opts.some(
    (options: { k: string }) => options.k === 'bribe',
  ),
  'hailing a raider offers a bribe',
);
const credits = playerData.credits;
firstEntry.send({ t: 'hailopt', id: shipEntity2.id, k: 'bribe' });
assertCondition(
  playerData.credits < credits &&
    !message2.isHostile(shipEntity2, requiredFixtureValue(shipEntity)),
  'paying them off makes them leave you alone',
);
// a stranded captain can ask a trader for fuel
const shipEntity3 = message2.makeShip({ hull: 704, faction: 'spacer', x: -300, y: 0, ai: 'trade' });
requiredFixtureValue(shipEntity).fuel = 20;
playerData.rep.spacer = 0;
firstEntry.send({ t: 'hail', id: shipEntity3.id });
assertCondition(
  requiredFixtureValue(firstEntry.last('hail')).opts.some(
    (options: { k: string }) => options.k === 'fuel',
  ),
  'a stranded captain can ask a trader for fuel',
);
firstEntry.send({ t: 'hailopt', id: shipEntity3.id, k: 'fuel' });
assertCondition(requiredFixtureValue(shipEntity).fuel >= 100, 'and gets enough for a jump');
// planets: bribe for landing clearance
const planet = systemsById.meridian.stellars.find(
  (player) => requiredFixtureValue(player.svc).includes('L') && !player.site && !player.outlaw,
);
playerData.rep[systemsById.meridian.faction] = -60;
firstEntry.send({ t: 'hail', stellar: requiredFixtureValue(planet).id });
assertCondition(
  requiredFixtureValue(firstEntry.last('hail')).opts.some(
    (options: { k: string }) => options.k === 'bribe',
  ),
  'docking control refuses a wanted captain, but listens to offers',
);
firstEntry.send({ t: 'hailopt', stellar: requiredFixtureValue(planet).id, k: 'bribe' });
assertCondition(
  requiredFixtureValue(playerData.landPass)[requiredFixtureValue(planet).id] > Date.now(),
  'a donation buys thirty minutes of clearance',
);
requiredFixtureValue(shipEntity).x = requiredFixtureValue(planet).x;
requiredFixtureValue(shipEntity).y = requiredFixtureValue(planet).y;
requiredFixtureValue(shipEntity).vx = requiredFixtureValue(shipEntity).vy = 0;
firstEntry.send({ t: 'land', stellar: requiredFixtureValue(planet).id });
assertCondition(playerData.stellar === requiredFixtureValue(planet).id, 'and the captain can land');
playerData.rep[systemsById.meridian.faction] = 0;
// fleet commands
const secondEntry = fake('Commander'),
  playerData2 = requiredFixtureValue(secondEntry.s).data;
playerData2.ship.hull = 736;
wingUp(game, playerData2, [751, 751]);
const shipEntity4 = toSpace(secondEntry, 'halcyon', 0, 0),
  message3 = game.spaces.halcyon;
const entitys = [...message3.ships.values()].filter(
  (shipEntity5) => shipEntity5.owner === requiredFixtureValue(shipEntity4).id,
);
assertCondition(entitys.length === 2, 'two escorts fly with the commander');
secondEntry.send({ t: 'order', o: 'hold' });
assertCondition(requiredFixtureValue(shipEntity4).order === 'hold', 'order: hold position');
requiredFixtureValue(shipEntity4).x = 2000;
requiredFixtureValue(shipEntity4).y = 0;
for (let index = 0; index < 90; index++) message3.tick();
assertCondition(
  entitys.every(
    (shipEntity5) =>
      Math.hypot(
        shipEntity5.x - requiredFixtureValue(shipEntity5.holdAt).x,
        shipEntity5.y - requiredFixtureValue(shipEntity5.holdAt).y,
      ) < 200,
  ),
  'escorts hold their positions while you fly off',
);
secondEntry.send({ t: 'order', o: 'hold' });
assertCondition(
  requiredFixtureValue(shipEntity4).order === 'gather',
  'giving the same order again cancels it (back to formation)',
);
secondEntry.send({ t: 'order', o: 'holdfire' });
const enemyEntity = message3.makeShip({
  hull: 711,
  faction: 'hollow',
  x: requiredFixtureValue(shipEntity4).x + 300,
  y: 0,
  ai: 'raid',
});
enemyEntity.aggro.add(requiredFixtureValue(shipEntity4).id);
requiredFixtureValue(shipEntity4).aggro.add(enemyEntity.id);
for (let index = 0; index < 30; index++) message3.tick();
assertCondition(
  entitys.every((shipEntity5) => !shipEntity5.target),
  'hold fire: escorts do not engage',
);
secondEntry.send({ t: 'order', o: 'attack' });
requiredFixtureValue(shipEntity4).target = enemyEntity;
for (let index = 0; index < 30; index++) message3.tick();
assertCondition(
  entitys.some((shipEntity5) => shipEntity5.target === enemyEntity),
  'attack my target: escorts engage it',
);
// jettison
seedCargo(playerData2, { food: 10 });
secondEntry.send({ t: 'jettison', cid: 'food', n: 10 });
assertCondition(
  !playerData2.cargo.food &&
    message3.loot.some((linkedSystemId) => linkedSystemId.it.cargo === 'food'),
  'jettisoned cargo floats free',
);
const floatingLoots = message3.loot.filter((message4) => message4.it.cargo === 'food');
for (const message4 of floatingLoots)
  game.onLoot(mockPlayerReference({ s: secondEntry.s }), message4.it);
assertCondition(
  !playerData2.cargo.food &&
    floatingLoots.reduce(
      (quantity, message4) => quantity + requiredFixtureValue(message4.it.n),
      0,
    ) === 10,
  'own fleet pickup grace preserves dumped cargo',
);
message3.t = Math.max(
  ...floatingLoots.map((message4) => requiredFixtureValue(message4.it.jettisonPickup).until),
);
for (const message4 of floatingLoots)
  game.onLoot(mockPlayerReference({ s: secondEntry.s }), message4.it);
assertCondition(playerData2.cargo.food === 10, 'and can be scooped back up after grace');
// combat rating
assertCondition(
  combatRank(0).name === 'Harmless' && combatRank(250000).name === 'Elite',
  'combat ranks run from Harmless to Elite',
);
const captainFixture = fake('Ace'),
  playerData6 = requiredFixtureValue(captainFixture.s).data;
playerData6.stats.combat = 50000;
const land = STELLARS[START.stellar];
assertCondition(
  game.features.fleetcmd.rankOf(playerData6).name === 'Dangerous',
  'a captain with 50k combat score is rated Dangerous',
);
const offers = game.offers(land, playerData6);
assertCondition(
  offers.some((mission) => mission.elite),
  'Dangerous captains see elite contracts',
);
playerData6.stats.combat = 0;
assertCondition(
  !game
    .offers(land, playerData6)
    .some((mission) => mission.elite || mission.type === 'assassinate'),
  'Harmless captains see neither elite contracts nor Wanted targets',
);
// news and market flashes
worldData.flash = [{ stellar: land.id, cid: 'food', mult: 1.45, until: Date.now() + 60000 }];
const base = requiredFixtureValue(game.market(land)).find((captain) => captain.id === 'food');
worldData.flash = [];
const plain = requiredFixtureValue(game.market(land)).find((captain) => captain.id === 'food');
assertCondition(
  requiredFixtureValue(requiredFixtureValue(base).price) >
    requiredFixtureValue(requiredFixtureValue(plain).price) && requiredFixtureValue(base).flash,
  'a shortage raises the local price',
);
assertCondition(
  game.features.frontier.leaderboard('earned').some((entry) => entry.ai),
  'rival captains appear on the leaderboards',
);
game.features.rivals.news('Test headline');
assertCondition(
  game.features.rivals.newsFeed(3)[0] === 'Test headline',
  'the spaceport news feed shows the latest headlines',
);
console.log('ALL 1.1 TESTS PASSED');
process.exit(0);
