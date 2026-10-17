// Actual DB files and Game login/import paths; only disposable fixture captains.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { tempDataDir } from './helpers/temp-data.js';
const dir = tempDataDir('rift-persistence-');
const db = new DB(dir);
const account = db.create(' Mixed Captain ', 'fixture-pass', { credits: 42 });
const other = db.create('Other Captain', 'fixture-pass', { credits: 9 });
assert.equal(db.get(' MIXED CAPTAIN '), account);
assert.equal(db.get('toString'), null);
assert.equal(Object.getPrototypeOf(db.players), null);
assert.notEqual(account.salt, other.salt, 'same password receives independent salt');
assert.notEqual(account.hash, other.hash);
assert.equal(db.check(account, 'fixture-pass'), true);
assert.equal(db.check(account, 'wrong-pass'), false);
assert.ok(
  !fs.readFileSync(db.file, 'utf8').includes('fixture-pass'),
  'plaintext passwords never saved',
);
db.world.sites['fixture-site'] = 'mixed captain';
account.credits = 1234;
db.touch();
db.flush();
assert.ok(!fs.existsSync(db.file + '.tmp') && !fs.existsSync(db.wfile + '.tmp'));
const restored = new DB(dir);
assert.equal(restored.get('mixed captain').credits, 1234);
assert.equal(restored.world.sites['fixture-site'], 'mixed captain');
assert.equal(restored.check(restored.get('mixed captain'), 'fixture-pass'), true);
account.credits = 88;
db.flush();
assert.equal(
  new DB(dir).get('mixed captain').credits,
  1234,
  'clean flush cannot rewrite unmarked state',
);
db.touch();
db.flush();
const RealDate = Date;
let stamp = Date.UTC(2026, 0, 1);
try {
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [stamp]));
    }
    static now() {
      return stamp;
    }
  };
  for (let i = 0; i < 14; i++) {
    account.credits = i;
    db.touch();
    db.flush();
    db.backup();
    stamp += 1000;
  }
} finally {
  globalThis.Date = RealDate;
}
const backups = fs.readdirSync(path.join(dir, 'backups')).sort();
assert.equal(backups.length, 12, 'rolling backups retain latest twelve snapshots');
assert.equal(
  JSON.parse(fs.readFileSync(path.join(dir, 'backups', backups[0], 'players.json')))[
    'mixed captain'
  ].credits,
  2,
);
assert.equal(
  JSON.parse(fs.readFileSync(path.join(dir, 'backups', backups.at(-1), 'players.json')))[
    'mixed captain'
  ].credits,
  13,
);
assert.equal(
  JSON.parse(fs.readFileSync(path.join(dir, 'backups', backups.at(-1), 'world.json'))).sites[
    'fixture-site'
  ],
  'mixed captain',
);
const corrupt = tempDataDir('rift-corrupt-');
fs.writeFileSync(path.join(corrupt, 'players.json'), '{broken');
fs.writeFileSync(path.join(corrupt, 'world.json'), '{broken');
const recover = new DB(corrupt);
assert.equal(Object.keys(recover.players).length, 0);
assert.deepEqual(recover.world, { sites: {} });

const game = new Game(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
  new DB(tempDataDir('rift-auth-')),
);
function client(ip) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.closed = false;
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {
    sock.closed = true;
  };
  game.connect(sock, ip);
  return { sock, s: [...game.sessions.values()].at(-1) };
}
const login = (c, name, pass) => game.onMessage(c.s, { t: 'hello', name, pass });
const first = client('fixture-1');
for (const name of ['__proto__', 'constructor', 'x', 'bad<script>']) {
  login(first, name, 'fixture-pass');
  assert.equal(first.s.data, null);
  assert.equal(game.db.get(name), null);
}
login(first, 'Auth Captain', 'x');
assert.equal(game.db.get('Auth Captain'), null, 'short password cannot create online account');
login(first, 'Auth Captain', 'fixture-pass');
assert.ok(first.s.data);
first.s.data.credits = 98765;
game.db.touch();
const wrong = client('fixture-2');
login(wrong, 'Auth Captain', 'wrong-pass');
assert.equal(wrong.s.data, null);
assert.equal(first.sock.closed, false);
const replacement = client('fixture-3');
login(replacement, 'auth captain', 'fixture-pass');
assert.ok(first.sock.closed, 'same account new login evicts old session');
assert.equal(replacement.s.data.credits, 98765, 'relogin preserves existing progress');
assert.ok(!game.sessions.has(first.s.id));
game.fails.clear(); // Isolate the six-miss name/address window from the earlier password check.
const locked = client('fixture-lock');
for (let i = 0; i < 6; i++) login(locked, 'Auth Captain', 'wrong-pass');
login(locked, 'Auth Captain', 'fixture-pass');
assert.equal(locked.s.data, null);
assert.match(locked.sock.out.at(-1).msg, /Too many failed/);
const elsewhere = client('fixture-elsewhere');
login(elsewhere, 'Auth Captain', 'fixture-pass');
assert.equal(elsewhere.s.data, null, 'name throttle applies across addresses');
login(locked, 'Another Captain', 'fixture-pass');
assert.equal(game.db.get('Another Captain'), null, 'address throttle protects other names');
for (const value of game.fails.values()) value.t = Date.now() - 600001;
login(elsewhere, 'Auth Captain', 'fixture-pass');
assert.ok(elsewhere.s.data, 'expired throttle permits correct login');
for (const bad of [
  null,
  {},
  { name: 'Save Captain', ship: {} },
  { name: 'bad!', ship: {}, station: {} },
])
  assert.throws(() => game.importSave(bad));
const save = {
  ...game.fresh(),
  name: 'Imported Captain',
  credits: 54321,
  salt: 'forged',
  hash: 'forged',
};
Object.defineProperty(save, '__proto__', { value: { polluted: true }, enumerable: true });
save.constructor = { polluted: true };
save.prototype = { polluted: true };
assert.equal(game.importSave(save), 'Imported Captain');
const imported = game.db.get('imported captain');
assert.equal(imported.credits, 54321);
assert.equal(game.db.check(imported, 'solo'), true);
assert.notEqual(imported.hash, 'forged');
assert.equal(Object.getPrototypeOf(imported), Object.prototype);
assert.equal(imported.polluted, undefined);
assert.ok(!Object.hasOwn(imported, 'constructor') && !Object.hasOwn(imported, 'prototype'));
const liveSave = { ...game.fresh(), name: 'Auth Captain' };
assert.throws(() => game.importSave(liveSave), /playing right now/);
const reloaded = new DB(game.db.dir);
assert.equal(reloaded.get('Imported Captain').credits, 54321);
// Logout must release a Solo pause synchronously, not on a later world tick:
// an immediate account switch must not inherit the former captain's pause.
const soloGame = new Game(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
  new DB(tempDataDir('rift-solo-disconnect-')),
);
soloGame.solo = true;
const soloSocket = new EventEmitter();
Object.assign(soloSocket, { open: true, backlog: 0, send() {}, close() {} });
soloGame.connect(soloSocket, 'solo-logout-fixture');
const soloSession = [...soloGame.sessions.values()].at(-1);
soloGame.onMessage(soloSession, { t: 'hello', name: 'Solo Logout', pass: '' });
assert.ok(soloSession.data);
soloSession.data.credits = 765432;
soloGame.setPaused(true);
soloGame.disconnect(soloSession);
assert.equal(soloGame.paused, false, 'last Solo logout releases pause before another login');
assert.equal(soloGame.sessions.has(soloSession.id), false);
assert.equal(
  JSON.parse(fs.readFileSync(soloGame.db.file))['solo logout'].credits,
  765432,
  'disconnect commits progress immediately without waiting for autosave',
);
console.log(
  'Persistence/auth: password salts/checks, atomic roundtrip, rolling backups, malformed recovery, registration/relogin/throttle and safe save import passed.',
);
process.exit(0);
