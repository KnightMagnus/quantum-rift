// 2.0.2 tests: retiring the KNIGHT showcase account frees its station hull; prototype-safe names and lookups.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
const dir = '/tmp/rift-v202-' + Date.now();
process.env.SEEDS_FILE = decodeURIComponent(
  new URL('./seeds_knight.json', import.meta.url).pathname,
);
const g1 = new Game(JSON.parse(JSON.stringify(A)), new DB(dir));
ok(
  g1.db.get('KNIGHT') && g1.db.world.sites['site-qgate'] === 'knight',
  'an old world with the KNIGHT showcase account and his Ops 5 station',
);
g1.db.flush();
process.env.SEEDS_FILE = decodeURIComponent(
  new URL('../server/seeds.json', import.meta.url).pathname,
);
const g2 = new Game(JSON.parse(JSON.stringify(A)), new DB(dir));
ok(!g2.db.get('KNIGHT'), 'starting the new version retires KNIGHT');
ok(
  !g2.db.world.sites['site-qgate'] && !g2.siteOwner('site-qgate'),
  'and the Quantum Gate station hull is an unclaimed derelict again',
);
ok(
  JSON.parse(fs.readFileSync(dir + '/players.json', 'utf8')).knight === undefined,
  'the save file no longer holds the account',
);
// prototype-safe names
const sock = new EventEmitter();
sock.open = true;
sock.backlog = 0;
const out = [];
sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m);
sock.close = () => {};
g2.connect(sock, '17.0.0.1');
sock.emit('message', JSON.stringify({ t: 'hello', name: '__proto__', pass: 'secret' }));
ok(
  out.some((m) => m.t === 'error') &&
    !Object.prototype.hasOwnProperty.call(g2.db.players, '__proto__'),
  'names like __proto__ are refused',
);
ok(
  g2.db.get('constructor') === null && g2.features.frontier.profile('constructor') === null,
  'lookups never reach object internals',
);
ok(
  Array.isArray(g2.features.frontier.leaderboard('constructor')) &&
    g2.features.frontier.leaderboard('constructor').length === 0,
  'unknown leaderboard categories are empty, not errors',
);
console.log('ALL 2.0.2 TESTS PASSED');
process.exit(0);
