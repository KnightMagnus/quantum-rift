import { mockPlayerReference } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 1.0.1 tests: respawn at your own station hull or the hub (never at someone else's base or wherever you last landed).
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS, START, SITES } from '../shared/galaxy.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v101-')));
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
  game.connect(legacySocket2, '12.0.0.' + ipAddress++);
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
const destroyShip = (captain: ReturnType<typeof fake>, starSystem: string) => {
  const playerData = requiredFixtureValue(captain.s).data;
  playerData.sys = starSystem;
  playerData.stellar = null;
  game.spawnPlayer(captain.s, 0, 0, 0, 0);
  const space = game.spaces[starSystem];
  game.onPlayerDeath(mockPlayerReference({ s: captain.s }), space, null);
  return playerData;
};
// a captain with no base who last landed at another player's station hull
const owner = fake('Baron'),
  playerData = requiredFixtureValue(owner.s).data,
  site = SITES[0];
playerData.station.site = site.id;
game.db.world.sites[site.id] = game.db.key(playerData.name);
const firstEntry = fake('Drifter'),
  playerData4 = requiredFixtureValue(firstEntry.s).data;
playerData4.lastStellar = site.id;
destroyShip(firstEntry, STELLARS[site.id].system);
assertCondition(
  playerData4.stellar === START.stellar,
  `no base of your own: rebuilt at the hub (${STELLARS[requiredFixtureValue(playerData4.stellar)].name}), not at someone else's station`,
);
assertCondition(
  firstEntry.last('dead') &&
    requiredFixtureValue(firstEntry.last('dead')).at === STELLARS[START.stellar].name,
  'the death notice names the hub',
);
// a captain with their own station hull respawns there
playerData4.lastStellar = 'concordia';
destroyShip(owner, 'meridian');
assertCondition(
  playerData.stellar === site.id,
  'with a station hull of your own you are rebuilt there',
);
// 1.0.2: storing your only ship leaves you with no active ship (no free Gnat), and you cannot depart until you choose one
playerData.station.ops = 4;
seedCargo(playerData, {});
playerData.stellar = site.id;
playerData.sys = STELLARS[site.id].system;
playerData.dock = [];
const hull2 = playerData.ship.hull;
owner.send({ t: 'dock', op: 'store' });
assertCondition(
  playerData.shipless && playerData.dock.length === 1 && playerData.dock[0].ship.hull === hull2,
  'stored the only ship: no active ship, and no free Gnat',
);
owner.send({ t: 'dock', op: 'store' });
owner.send({ t: 'dock', op: 'store' });
assertCondition(playerData.dock.length === 1, 'storing again does nothing');
owner.send({ t: 'depart' });
assertCondition(
  !requiredFixtureValue(owner.s).ent &&
    /no active ship/i.test(requiredFixtureValue(owner.last('toast')).msg),
  'cannot depart without a ship',
);
owner.send({ t: 'dock', op: 'store', i: 0 });
assertCondition(
  !playerData.shipless && playerData.ship.hull === hull2 && playerData.dock.length === 0,
  'FLY THIS takes the stored ship out of its berth',
);
owner.send({ t: 'depart' });
assertCondition(!!requiredFixtureValue(owner.s).ent, 'and now you can depart');
console.log('ALL 1.0.1 TESTS PASSED');
process.exit(0);
