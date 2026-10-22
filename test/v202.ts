import type { GameAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.0.2 tests: retiring the KNIGHT showcase account frees its station hull; prototype-safe names and lookups.
import filesystem from 'node:fs';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
const directory = tempDataDir('rift-v202-');
process.env.SEEDS_FILE = decodeURIComponent(
  new URL('./seeds_knight.json', import.meta.url).pathname,
);
const game = new Game(JSON.parse(JSON.stringify(assets)), new Database(directory));
assertCondition(
  game.db.get('KNIGHT') && game.db.world.sites['site-qgate'] === 'knight',
  'an old world with the KNIGHT showcase account and his Ops 5 station',
);
game.db.flush();
// Retirement remains supported for explicit operator-supplied seed definitions.
const retiredSeeds = directory + '/retired-seeds.json';
filesystem.writeFileSync(retiredSeeds, JSON.stringify([{ name: 'KNIGHT', retire: true }]));
process.env.SEEDS_FILE = retiredSeeds;
const game3 = new Game(JSON.parse(JSON.stringify(assets)), new Database(directory));
assertCondition(!game3.db.get('KNIGHT'), 'starting the new version retires KNIGHT');
assertCondition(
  !game3.db.world.sites['site-qgate'] && !game3.siteOwner('site-qgate'),
  'and the Quantum Gate station hull is an unclaimed derelict again',
);
assertCondition(
  JSON.parse(filesystem.readFileSync(directory + '/players.json', 'utf8')).knight === undefined,
  'the save file no longer holds the account',
);
// prototype-safe names
const legacySocket2 = legacySocket();
legacySocket2.open = true;
legacySocket2.backlog = 0;
const output: LegacyPacket[] = [];
legacySocket2.send = (message: string) =>
  output.push(typeof message === 'string' ? JSON.parse(message) : message);
legacySocket2.close = () => {};
game3.connect(legacySocket2, '17.0.0.1');
legacySocket2.emit('message', JSON.stringify({ t: 'hello', name: '__proto__', pass: 'secret' }));
assertCondition(
  output.some((message) => message.t === 'error') &&
    !Object.prototype.hasOwnProperty.call(game3.db.players, '__proto__'),
  'names like __proto__ are refused',
);
assertCondition(
  game3.db.get('constructor') === null && game3.features.frontier.profile('constructor') === null,
  'lookups never reach object internals',
);
assertCondition(
  Array.isArray(game3.features.frontier.leaderboard('constructor')) &&
    game3.features.frontier.leaderboard('constructor').length === 0,
  'unknown leaderboard categories are empty, not errors',
);
console.log('ALL 2.0.2 TESTS PASSED');
process.exit(0);
