import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.7 tests: colonies, station defense raids, ship mastery, the arena, the exchange, leaderboards and profiles.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game, type PlayerData } from '../server/game.ts';
import { SYS as systemsById, STELLARS, FACTIONS } from '../shared/galaxy.ts';
import { MASTERY } from '../shared/frontier.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v07-')));
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
  game.connect(legacySocket2, '8.8.8.' + ipAddress++);
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
const rich = (playerData: PlayerData) => {
  playerData.credits = 5e8;
  for (const message of ['alloy', 'crystal', 'isotope'])
    playerData.mats[message] = [30, 30, 30, 30, 30];
};
const firstEntry = fake('Settler'),
  playerData = requiredFixtureValue(firstEntry.s).data;
rich(playerData);
// colonies
const planet = Object.values(STELLARS).find((stellarBody) =>
  game.features.frontier.colonizable(stellarBody),
);
assertCondition(
  planet && FACTIONS[systemsById[planet.system].faction].region,
  `${requiredFixtureValue(planet).name} in ${systemsById[requiredFixtureValue(planet).system].name} can be settled`,
);
assertCondition(
  !game.features.frontier.colonizable(STELLARS['meridian-yards']),
  'core worlds cannot be settled',
);
playerData.sys = requiredFixtureValue(planet).system;
playerData.stellar = requiredFixtureValue(planet).id;
firstEntry.send({ t: 'colony', op: 'found' });
const colonyState = game.db.world.colonies[requiredFixtureValue(planet).id];
assertCondition(colonyState && colonyState.lv === 1, 'founded a colony');
assertCondition(
  requiredFixtureValue(firstEntry.last('landed')).colony.own &&
    requiredFixtureValue(firstEntry.last('world')).colonies[requiredFixtureValue(planet).id] ===
      'Settler',
  'the colony shows on landing and on the world map',
);
firstEntry.send({ t: 'colony', op: 'build', kind: 'habitat' });
firstEntry.send({ t: 'colony', op: 'build', kind: 'mine' });
firstEntry.send({ t: 'colony', op: 'build', kind: 'farm' });
assertCondition(colonyState.buildings.length === 2, 'level 1 colonies have two building slots');
firstEntry.send({ t: 'colony', op: 'upgrade' });
firstEntry.send({ t: 'colony', op: 'build', kind: 'shieldgen' });
assertCondition(
  colonyState.lv === 2 && colonyState.buildings.includes('shieldgen'),
  'upgraded to level 2 and built a Shield Array',
);
assertCondition(
  game.features.bonuses.bonus(playerData).shieldPct >= 3,
  'the Shield Array gives a permanent shield bonus',
);
colonyState.t = Date.now() - 3 * 3600000;
const credits = playerData.credits;
firstEntry.send({ t: 'colony', op: 'collect' });
assertCondition(
  playerData.credits - credits >= 2500 * 1.25 * 2.9 && (playerData.cargo.ore || 0) >= 14,
  `collected three hours of production (${playerData.credits - credits} cr, ${playerData.cargo.ore} t ore)`,
);
const stellarBodys = Object.values(STELLARS).filter(
  (stellarBody) =>
    game.features.frontier.colonizable(stellarBody) &&
    stellarBody.id !== requiredFixtureValue(planet).id,
);
playerData.stellar = stellarBodys[0].id;
playerData.sys = stellarBodys[0].system;
firstEntry.send({ t: 'colony', op: 'found' });
playerData.stellar = stellarBodys[1].id;
playerData.sys = stellarBodys[1].system;
firstEntry.send({ t: 'colony', op: 'found' });
assertCondition(
  game.features.frontier.coloniesOf(playerData).length === 2,
  'two colonies until Ops 5',
);
// station defense
Object.assign(playerData.station, { claimed: true, ops: 3, site: 'site-meridian', defense: 0 });
game.db.world.sites['site-meridian'] = game.db.key(playerData.name);
const defenseRating2 = game.features.frontier.defenseRating(playerData);
playerData.stellar = 'site-meridian';
playerData.sys = 'meridian';
firstEntry.send({ t: 'station', op: 'defense' });
assertCondition(
  playerData.station.defense === 1 &&
    game.features.frontier.defenseRating(playerData) > defenseRating2,
  `upgraded the station turrets (defense ${defenseRating2} -> ${game.features.frontier.defenseRating(playerData)})`,
);
playerData.station.raidWin = 0;
playerData.station.refUnits = 3;
game.features.frontier.raidCheck(firstEntry.s);
assertCondition(
  playerData.log.some((linkedSystemId) => /raid/i.test(linkedSystemId.text)) &&
    firstEntry.all('notify').length >= 1,
  'an offline raid resolves against the station defense, with a notification',
);
// live wave: the owner is in the station system
playerData.stellar = null;
game.spawnPlayer(firstEntry.s, 0, 0, 0, 0);
playerData.station.raidWin = 0;
game.features.frontier.raidCheck(firstEntry.s);
const weapon = game.waves[playerData.name],
  space = game.spaces.meridian;
assertCondition(
  weapon && weapon.ids.size >= 2,
  `a live raid wave of ${weapon.ids.size} ships attacks while you are there`,
);
const credW = playerData.credits;
// oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
for (const identifier of [...weapon.ids])
  space.kill(
    requiredFixtureValue(space.ships.get(identifier)),
    requiredFixtureValue(firstEntry.s).ent,
  );
assertCondition(
  !game.waves[playerData.name] && playerData.credits > credW,
  'destroying the whole wave wins the raid',
);
// mastery
const hull2 = playerData.ship.hull;
playerData.mastery = { [hull2]: MASTERY.tiers[4] - 1 };
const shield2 = requiredFixtureValue(game.features.shipStats.stats(playerData)).shield;
game.features.frontier.mastery(firstEntry.s, 5);
assertCondition(
  requiredFixtureValue(game.features.shipStats.stats(playerData)).shield > shield2 &&
    requiredFixtureValue(
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).elite,
    ),
  'reaching mastery Tier 5 raises stats and adds the gold trim',
);
assertCondition(
  Number(
    requiredFixtureValue(
      requiredFixtureValue(
        game.spaces.meridian
          .snapshot()
          .ships.find(
            (result) =>
              result[0] ===
              requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).id,
          ),
      )[7],
    ),
  ) & 32,
  'the trim is sent to other players',
);
// arena
const message = game.spaces.meridian;
message.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent));
message.players--;
requiredFixtureValue(firstEntry.s).ent = null;
playerData.stellar = 'meridian-yards';
const secondEntry = fake('Duelist'),
  playerData4 = requiredFixtureValue(secondEntry.s).data;
playerData4.stellar = 'meridian-yards';
playerData4.sys = 'meridian';
firstEntry.send({ t: 'arena', op: 'queue', mode: '1v1' });
assertCondition(game.arenaQ['1v1'].length === 1, 'queued for 1v1');
secondEntry.send({ t: 'arena', op: 'queue', mode: '1v1' });
const match = Object.values(game.matches)[0];
assertCondition(
  match &&
    requiredFixtureValue(firstEntry.s).ent &&
    requiredFixtureValue(secondEntry.s).ent &&
    requiredFixtureValue(
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).team,
    ) !==
      requiredFixtureValue(
        requiredFixtureValue<FixtureEntity>(requiredFixtureValue(secondEntry.s).ent).team,
      ),
  'a match starts when the queue fills: two teams in the Crucible',
);
const message2 = match.sp;
assertCondition(
  message2.isHostile(
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent),
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(secondEntry.s).ent),
  ) && [...message2.ships.values()].every((entity) => entity.player),
  'opponents are hostile; no traffic in the arena',
);
assertCondition(
  requiredFixtureValue(
    requiredFixtureValue(firstEntry.last('arena')).team && systemsById[match.id].arena,
  ),
  'the client is told its team',
);
const rating2 = requiredFixtureValue(playerData.arena).rating,
  rating3 = requiredFixtureValue(playerData4.arena).rating,
  serviceFee = playerData.credits;
message2.kill(
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(secondEntry.s).ent),
  requiredFixtureValue(firstEntry.s).ent,
);
assertCondition(
  !game.matches[match.id] &&
    requiredFixtureValue(playerData.arena).rating > rating2 &&
    requiredFixtureValue(playerData4.arena).rating < rating3 &&
    requiredFixtureValue(playerData.arena).w === 1 &&
    requiredFixtureValue(playerData4.arena).l === 1,
  `match over: ratings ${requiredFixtureValue(playerData.arena).rating} / ${requiredFixtureValue(playerData4.arena).rating}`,
);
assertCondition(
  playerData.stellar === 'meridian-yards' &&
    playerData4.stellar === 'meridian-yards' &&
    !requiredFixtureValue(firstEntry.s).ent &&
    !requiredFixtureValue(secondEntry.s).ent,
  'both captains are back where they queued, ships repaired',
);
assertCondition(
  playerData.credits > serviceFee && playerData4.credits > 0,
  'the arena pays both sides, no insurance fee',
);
// exchange
playerData.stellar = 'meridian-yards';
playerData4.stellar = 'meridian-yards';
rich(playerData4);
playerData4.mats.crystal[2] = 0;
const alloy = playerData.mats.alloy[2],
  credits5 = playerData4.credits,
  credits6 = playerData.credits;
firstEntry.send({
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'mat',
  mat: 'alloy',
  grade: 2,
  qty: 5,
  price: 40000,
});
assertCondition(
  playerData.mats.alloy[2] === alloy - 5 && game.db.world.orders.length === 1,
  'a sell order escrows the crates',
);
secondEntry.send({
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'mat',
  mat: 'alloy',
  grade: 2,
  qty: 3,
  price: 45000,
});
assertCondition(
  playerData4.mats.alloy[2] === 33 &&
    playerData4.credits === credits5 - 3 * 40000 &&
    playerData.credits === credits6 + Math.round(3 * 40000 * 0.98),
  'a crossing buy fills at the resting price, minus a 2% fee for the seller',
);
assertCondition(game.db.world.orders[0].qty === 2, 'the rest of the sell order stays on the book');
firstEntry.send({ t: 'exchange', op: 'cancel', id: game.db.world.orders[0].id });
assertCondition(
  !game.db.world.orders.length && playerData.mats.alloy[2] === alloy - 3,
  'cancelling returns the escrow',
);
seedCargo(playerData, { food: 20 });
firstEntry.send({
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'food',
  qty: 20,
  price: 100,
});
secondEntry.send({
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'food',
  qty: 20,
  price: 100,
});
assertCondition(playerData4.storage.food === 20, 'bought commodities wait in exchange storage');
seedCargo(playerData4, {});
secondEntry.send({ t: 'exchange', op: 'collect' });
assertCondition(
  playerData4.cargo.food > 0 && (playerData4.storage.food || 0) + playerData4.cargo.food === 20,
  'collected into the hold (what fits)',
);
firstEntry.send({ t: 'exchange', op: 'transfer', to: 'Duelist', n: 5000 });
assertCondition(
  firstEntry
    .all('toast')
    .some((messageType3: { msg: string }) => /Sent 5,000/.test(messageType3.msg)),
  'sent credits to another captain',
);
// boards and profiles
firstEntry.send({ t: 'boards', cat: 'arena' });
const legacyPacket = firstEntry.last('boards');
assertCondition(
  requiredFixtureValue(legacyPacket).list[0].name === 'Settler',
  'the arena leaderboard ranks the winner first',
);
firstEntry.send({ t: 'profile', name: 'Duelist' });
const profile = requiredFixtureValue(firstEntry.last('profile')).p;
assertCondition(
  profile && profile.name === 'Duelist' && profile.arena.l === 1,
  'captain profiles show records',
);
console.log('ALL 0.7 TESTS PASSED');
process.exit(0);
