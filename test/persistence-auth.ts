import { legacySocket } from './helpers/legacy-fixture.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Actual DB files and Game login/import paths; only disposable fixture captains.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { tempDataDir } from './helpers/temp-data.ts';
const directory = tempDataDir('rift-persistence-');
const database = new Database(directory);
const account = database.create(' Mixed Captain ', 'fixture-pass', { credits: 42 });
const other = database.create('Other Captain', 'fixture-pass', { credits: 9 });
assert.equal(database.get(' MIXED CAPTAIN '), account);
assert.equal(database.get('toString'), null);
assert.equal(Object.getPrototypeOf(database.players), null);
assert.notEqual(account.salt, other.salt, 'same password receives independent salt');
assert.notEqual(account.hash, other.hash);
assert.equal(database.check(account, 'fixture-pass'), true);
assert.equal(database.check(account, 'wrong-pass'), false);
assert.ok(
  !fileSystem.readFileSync(database.file, 'utf8').includes('fixture-pass'),
  'plaintext passwords never saved',
);
database.world.sites['fixture-site'] = 'mixed captain';
account.credits = 1234;
database.touch();
database.flush();
assert.ok(
  !fileSystem.existsSync(database.file + '.tmp') && !fileSystem.existsSync(database.wfile + '.tmp'),
);
const restored = new Database(directory);
assert.equal(requiredFixtureValue(restored.get('mixed captain')).credits, 1234);
assert.equal(restored.world.sites['fixture-site'], 'mixed captain');
assert.equal(restored.check(restored.get('mixed captain')!, 'fixture-pass'), true);
account.credits = 88;
database.flush();
assert.equal(
  requiredFixtureValue(new Database(directory).get('mixed captain')).credits,
  1234,
  'clean flush cannot rewrite unmarked state',
);
database.touch();
database.flush();
const RealDate = Date;
let stamp = Date.UTC(2026, 0, 1);
try {
  globalThis.Date = class extends RealDate {
    constructor(value?: string | number) {
      super(value === undefined ? stamp : value);
    }
    static now() {
      return stamp;
    }
  } as DateConstructor;
  for (let index = 0; index < 14; index++) {
    account.credits = index;
    database.touch();
    database.flush();
    database.backup();
    stamp += 1000;
  }
} finally {
  globalThis.Date = RealDate;
}
const backups = fileSystem.readdirSync(path.join(directory, 'backups')).sort();
assert.equal(backups.length, 12, 'rolling backups retain latest twelve snapshots');
assert.equal(
  JSON.parse(
    fileSystem.readFileSync(path.join(directory, 'backups', backups[0], 'players.json'), 'utf8'),
  )['mixed captain'].credits,
  2,
);
assert.equal(
  JSON.parse(
    fileSystem.readFileSync(
      path.join(directory, 'backups', backups.at(-1)!, 'players.json'),
      'utf8',
    ),
  )['mixed captain'].credits,
  13,
);
assert.equal(
  JSON.parse(
    fileSystem.readFileSync(path.join(directory, 'backups', backups.at(-1)!, 'world.json'), 'utf8'),
  ).sites['fixture-site'],
  'mixed captain',
);
const corrupt = tempDataDir('rift-corrupt-');
fileSystem.writeFileSync(path.join(corrupt, 'players.json'), '{broken');
fileSystem.writeFileSync(path.join(corrupt, 'world.json'), '{broken');
assert.throws(() => new Database(corrupt), SyntaxError);
assert.equal(fileSystem.readFileSync(path.join(corrupt, 'players.json'), 'utf8'), '{broken');
assert.equal(fileSystem.readFileSync(path.join(corrupt, 'world.json'), 'utf8'), '{broken');

// A missing save file restores the player/world pair from the newest valid backup.
const backupPlayers = JSON.stringify({
  veteran: { name: 'Veteran', salt: '00', hash: '00', created: 1, credits: 2_500_000 },
});
const backupWorld = JSON.stringify({ sites: { 'fixture-site': 'veteran' } });
function savesWithBackups(prefix: string) {
  const saves = tempDataDir(prefix);
  const older = path.join(saves, 'backups', '2026-01-01T00-00-00');
  const newerDamaged = path.join(saves, 'backups', '2026-01-01T00-30-00');
  fileSystem.mkdirSync(older, { recursive: true });
  fileSystem.mkdirSync(newerDamaged, { recursive: true });
  fileSystem.writeFileSync(path.join(older, 'players.json'), backupPlayers);
  fileSystem.writeFileSync(path.join(older, 'world.json'), backupWorld);
  fileSystem.writeFileSync(path.join(newerDamaged, 'players.json'), '{broken');
  fileSystem.writeFileSync(path.join(newerDamaged, 'world.json'), backupWorld);
  return saves;
}
const warnings: string[] = [];
const realWarn = console.warn;
const realError = console.error;
console.warn = (...parts: unknown[]) => void warnings.push(parts.join(' '));
console.error = (...parts: unknown[]) => void warnings.push(parts.join(' '));
try {
  for (const kept of [undefined, 'players.json', 'world.json'] as const) {
    warnings.length = 0;
    const saves = savesWithBackups('rift-restore-');
    const keptText =
      kept === 'players.json'
        ? '{"newer":{"name":"Newer","salt":"00","hash":"00","created":2}}'
        : '{"sites":{}}';
    if (kept) fileSystem.writeFileSync(path.join(saves, kept), keptText);
    const reopened = new Database(saves);
    assert.equal(
      requiredFixtureValue(reopened.get('veteran')).credits,
      2_500_000,
      'returning captain keeps backed-up credits, kept=' + kept,
    );
    assert.equal(reopened.get('newer'), null, 'players and world come from one backup');
    assert.deepEqual(reopened.world.sites, { 'fixture-site': 'veteran' }, 'station claim restored');
    assert.equal(fileSystem.readFileSync(reopened.file, 'utf8'), backupPlayers);
    assert.equal(fileSystem.readFileSync(reopened.wfile, 'utf8'), backupWorld);
    const asideFiles = fileSystem.readdirSync(saves).filter((name) => name.includes('.unpaired-'));
    if (kept) {
      assert.equal(asideFiles.length, 1, 'present file is kept, not overwritten');
      assert.ok(asideFiles[0].startsWith(kept + '.unpaired-'));
      assert.equal(fileSystem.readFileSync(path.join(saves, asideFiles[0]), 'utf8'), keptText);
    } else assert.deepEqual(asideFiles, []);
    assert.ok(warnings.some((line) => line.includes('Skipping save backup 2026-01-01T00-30-00')));
    assert.ok(warnings.some((line) => line.includes('from backup 2026-01-01T00-00-00')));
    assert.equal(
      requiredFixtureValue(new Database(saves).get('veteran')).credits,
      2_500_000,
      'second start loads the restored files without restoring again',
    );
    assert.equal(
      fileSystem.readdirSync(saves).filter((name) => name.includes('.unpaired-')).length,
      asideFiles.length,
    );
  }

  // A committed journal holds both halves and wins over any backup.
  const journaled = savesWithBackups('rift-restore-journal-');
  fileSystem.writeFileSync(
    path.join(journaled, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      players: JSON.stringify({ fixture: { name: 'Fixture', credits: 123 } }),
      world: JSON.stringify({ sites: { other: 'fixture' } }),
    }),
  );
  const fromJournal = new Database(journaled);
  assert.equal(requiredFixtureValue(fromJournal.get('fixture')).credits, 123);
  assert.equal(fromJournal.get('veteran'), null);

  // Without a usable backup, the missing file still starts fresh and says so.
  warnings.length = 0;
  const unbacked = tempDataDir('rift-restore-none-');
  fileSystem.writeFileSync(path.join(unbacked, 'players.json'), backupPlayers);
  const partial = new Database(unbacked);
  assert.equal(requiredFixtureValue(partial.get('veteran')).credits, 2_500_000);
  assert.deepEqual(partial.world.sites, {});
  assert.ok(warnings.some((line) => line.includes('world.json is missing and no usable backup')));

  // A new save folder stays quiet and empty.
  warnings.length = 0;
  const fresh = tempDataDir('rift-restore-fresh-');
  assert.deepEqual(Object.keys(new Database(fresh).players), []);
  assert.deepEqual(fileSystem.readdirSync(fresh), []);
  assert.deepEqual(warnings, []);
} finally {
  console.warn = realWarn;
  console.error = realError;
}

const game = new Game(
  JSON.parse(fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  new Database(tempDataDir('rift-auth-')),
);
function client(ipAddress: string | undefined) {
  const sock = legacySocket() as unknown as Omit<
    import('./helpers/legacy-fixture.ts').LegacySocket,
    'closed'
  > & { closed: boolean };
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.closed = false;
  sock.send = (message: string) =>
    sock.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  sock.close = () => {
    sock.closed = true;
  };
  game.connect(sock as unknown as import('../server/ws.ts').Socket, ipAddress);
  return { sock, s: [...game.sessions.values()].at(-1) };
}
const login = (captain: ReturnType<typeof client>, name: string, pass: string) =>
  game.onMessage(captain.s!, { t: 'hello', name, pass });
const first = client('fixture-1');
for (const name of ['__proto__', 'constructor', 'x', 'bad<script>']) {
  login(first, name, 'fixture-pass');
  assert.equal(requiredFixtureValue(first.s).data, null);
  assert.equal(game.db.get(name), null);
}
login(first, 'Auth Captain', 'x');
assert.equal(game.db.get('Auth Captain'), null, 'short password cannot create online account');
login(first, 'Auth Captain', 'fixture-pass');
assert.ok(requiredFixtureValue(first.s).data);
requiredFixtureValue(first.s).data.credits = 98765;
game.db.touch();
const wrong = client('fixture-2');
login(wrong, 'Auth Captain', 'wrong-pass');
assert.equal(requiredFixtureValue(wrong.s).data, null);
assert.equal(first.sock.closed, false);
const replacement = client('fixture-3');
login(replacement, 'auth captain', 'fixture-pass');
assert.ok(first.sock.closed, 'same account new login evicts old session');
assert.equal(
  requiredFixtureValue(replacement.s).data.credits,
  98765,
  'relogin preserves existing progress',
);
assert.ok(!game.sessions.has(requiredFixtureValue(first.s).id));
game.fails.clear(); // Isolate the six-miss name/address window from the earlier password check.
const locked = client('fixture-lock');
for (let index = 0; index < 6; index++) login(locked, 'Auth Captain', 'wrong-pass');
login(locked, 'Auth Captain', 'fixture-pass');
assert.equal(requiredFixtureValue(locked.s).data, null);
assert.match(locked.sock.out.at(-1)!.msg, /Too many failed/);
const elsewhere = client('fixture-elsewhere');
login(elsewhere, 'Auth Captain', 'fixture-pass');
assert.equal(
  requiredFixtureValue(elsewhere.s).data,
  null,
  'name throttle applies across addresses',
);
login(locked, 'Another Captain', 'fixture-pass');
assert.equal(game.db.get('Another Captain'), null, 'address throttle protects other names');
for (const value of game.fails.values()) value.t = Date.now() - 600001;
login(elsewhere, 'Auth Captain', 'fixture-pass');
assert.ok(requiredFixtureValue(elsewhere.s).data, 'expired throttle permits correct login');
for (const invalidValue of [
  null,
  {},
  { name: 'Save Captain', ship: {} },
  { name: 'bad!', ship: {}, station: {} },
])
  assert.throws(() =>
    game.importSave(invalidValue as unknown as import('../server/game.ts').PlayerData),
  );
const save = {
  ...game.fresh(),
  name: 'Imported Captain',
  credits: 54321,
  salt: 'forged',
  hash: 'forged',
};
Object.defineProperty(save, '__proto__', { value: { polluted: true }, enumerable: true });
(save as unknown as { constructor: object }).constructor = { polluted: true };
(save as typeof save & { prototype: object }).prototype = { polluted: true };
assert.equal(game.importSave(mockPlayerData(save)), 'Imported Captain');
const imported = game.db.get('imported captain');
assert.equal(requiredFixtureValue(imported).credits, 54321);
assert.equal(game.db.check(imported!, 'solo'), true);
assert.notEqual(requiredFixtureValue(imported).hash, 'forged');
assert.equal(Object.getPrototypeOf(imported), Object.prototype);
assert.equal(
  (requiredFixtureValue(imported) as typeof imported & { polluted?: boolean }).polluted,
  undefined,
);
assert.ok(!Object.hasOwn(imported!, 'constructor') && !Object.hasOwn(imported!, 'prototype'));
const liveSave = { ...game.fresh(), name: 'Auth Captain' };
assert.throws(() => game.importSave(mockPlayerData(liveSave)), /playing right now/);
const reloaded = new Database(game.db.dir);
assert.equal(requiredFixtureValue(reloaded.get('Imported Captain')).credits, 54321);
// Logout must release a Solo pause synchronously, not on a later world tick:
// an immediate account switch must not inherit the former captain's pause.
const soloGame = new Game(
  JSON.parse(fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  new Database(tempDataDir('rift-solo-disconnect-')),
);
soloGame.solo = true;
const soloSocket = legacySocket();
Object.assign(soloSocket, { open: true, backlog: 0, send() {}, close() {} });
soloGame.connect(soloSocket, 'solo-logout-fixture');
const soloSession = [...soloGame.sessions.values()].at(-1);
soloGame.onMessage(soloSession!, { t: 'hello', name: 'Solo Logout', pass: '' });
assert.ok(requiredFixtureValue(soloSession).data);
requiredFixtureValue(soloSession).data.credits = 765432;
soloGame.setPaused(true);
soloGame.disconnect(soloSession!);
assert.equal(soloGame.paused, false, 'last Solo logout releases pause before another login');
assert.equal(soloGame.sessions.has(requiredFixtureValue(soloSession).id), false);
assert.equal(
  JSON.parse(fileSystem.readFileSync(soloGame.db.file, 'utf8'))['solo logout'].credits,
  765432,
  'disconnect commits progress immediately without waiting for autosave',
);
console.log(
  'Persistence/auth: password salts/checks, atomic roundtrip, rolling backups, malformed recovery, missing-file backup restore, registration/relogin/throttle and safe save import passed.',
);
process.exit(0);
