// Real DB and child-server behavior; Windows directory semantics are simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { tempDataDir } from './helpers/temp-data.js';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.mjs';

const platform = Object.getOwnPropertyDescriptor(process, 'platform');
const original = {
  openSync: fs.openSync,
  writeFileSync: fs.writeFileSync,
  fsyncSync: fs.fsyncSync,
  renameSync: fs.renameSync,
};
const denied = Object.assign(new Error('fixture EPERM: permission denied'), { code: 'EPERM' });
let fileSyncs = 0;
try {
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  fs.fsyncSync = (fd) => {
    if (fs.fstatSync(fd).isDirectory()) throw denied;
    fileSyncs++;
    return original.fsyncSync(fd);
  };
  const dir = tempDataDir('rift-win-persistence-');
  const db = new DB(dir);
  db.world.sites.fixture = 'persisted';
  db.touch();
  db.flush();
  assert.equal(fileSyncs, 3, 'checkpoint, players and world files still fsynced');
  assert.equal(db.dirty, false);
  assert.equal(db.economicFrozen, false);
  assert.equal(fs.existsSync(db.journal), false);
  assert.equal(new DB(dir).world.sites.fixture, 'persisted');

  // Exact original failure point: committed journal exists, before either snapshot.
  const recoveryDir = tempDataDir('rift-win-recovery-');
  fs.writeFileSync(path.join(recoveryDir, 'players.json'), '{}');
  fs.writeFileSync(path.join(recoveryDir, 'world.json'), '{"sites":{"old":"stale"}}');
  fs.writeFileSync(
    path.join(recoveryDir, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      players: JSON.stringify({ fixture: { name: 'Fixture', credits: 123 } }),
      world: JSON.stringify({ sites: { fixture: 'committed' } }),
    }),
  );
  const recovered = new DB(recoveryDir);
  assert.equal(recovered.get('fixture').credits, 123);
  assert.deepEqual(recovered.world.sites, { fixture: 'committed' });
  assert.equal(fs.existsSync(recovered.journal), false);
  const reopened = new DB(recoveryDir);
  assert.equal(reopened.get('fixture').credits, 123);
  assert.deepEqual(reopened.world.sites, recovered.world.sites);

  for (const operation of ['openSync', 'writeFileSync', 'fsyncSync', 'renameSync']) {
    const blocked = new DB(tempDataDir('rift-win-denied-'));
    blocked.touch();
    const saved = fs[operation];
    fs[operation] = () => {
      throw denied;
    };
    try {
      assert.throws(
        () => blocked.flush(),
        (error) => error === denied,
        operation,
      );
      assert.equal(blocked.dirty, true, 'failed checkpoint must not be marked saved');
      assert.equal(blocked.economicFrozen, operation === 'renameSync');
    } finally {
      fs[operation] = saved;
    }
  }
  // A real filesystem write rejection also escapes the production writer.
  const blocked = new DB(tempDataDir('rift-win-path-denied-'));
  fs.mkdirSync(blocked.journal + '.tmp');
  blocked.touch();
  assert.throws(() => blocked.flush(), /EISDIR|EACCES|EPERM/);
  assert.equal(blocked.dirty, true);

  // POSIX directory handles cannot be opened on native Windows.
  if (platform.value !== 'win32') {
    // POSIX directory failures are not silenced by the Windows capability gate.
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
    const posix = new DB(tempDataDir('rift-posix-directory-'));
    posix.touch();
    assert.throws(
      () => posix.flush(),
      (error) => error === denied,
    );
    assert.equal(posix.economicFrozen, true);
    assert.equal(fs.existsSync(posix.journal), true);
  }
} finally {
  Object.assign(fs, original);
  Object.defineProperty(process, 'platform', platform);
}

// Launch the same production entry point as each .bat, without touching real saves.
for (const solo of [false, true]) {
  const dir = tempDataDir('rift-win-startup-');
  const preload = path.join(dir, 'windows-fsync.mjs');
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';
Object.defineProperty(process, 'platform', {value: 'win32', configurable: true});
const sync = fs.fsyncSync;
fs.fsyncSync = (fd) => {
  if (fs.fstatSync(fd).isDirectory()) throw Object.assign(new Error('Windows directory fsync'), {code: 'EPERM'});
  return sync(fd);
};`,
  );
  const seeds = path.join(dir, 'seeds.json');
  fs.writeFileSync(seeds, '[]');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const out = evidenceDir(solo ? 'windows-solo' : 'windows-online');
  const server = spawn(process.execPath, ['--import', preload, 'server/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      SOLO: solo ? '1' : '',
      DATA_DIR: path.join(dir, 'data'),
      SEEDS_FILE: seeds,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  try {
    await ready(server, origin);
    const response = await fetch(origin + '/api/status', { signal: AbortSignal.timeout(5000) });
    const status = await response.json();
    assert.equal(status.solo, solo);
    const login = await fetch(origin, { signal: AbortSignal.timeout(5000) });
    assert.equal(login.status, 200);
    assert.match(await login.text(), /Quantum Rift/);
    assert.equal(fs.existsSync(path.join(dir, 'data', 'world.json')), true);
    assert.equal(fs.existsSync(path.join(dir, 'data', 'checkpoint.json')), false);
  } finally {
    await cleanup(server, null, log, dir);
  }
}
console.log(
  'PASS platform persistence, pending-journal recovery, denied writes, online/Solo startup',
);
