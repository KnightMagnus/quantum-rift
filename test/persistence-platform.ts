import { fileURLToPath as resolvePreloadFile } from 'node:url';
import { requiredFixtureValue } from './helpers/required.ts';
// Real DB and child-server behavior; Windows directory semantics are simulated.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.ts';

const platform = Object.getOwnPropertyDescriptor(process, 'platform');
const original = {
  openSync: fileSystem.openSync,
  writeFileSync: fileSystem.writeFileSync,
  fsyncSync: fileSystem.fsyncSync,
  renameSync: fileSystem.renameSync,
};
const denied = Object.assign(new Error('fixture EPERM: permission denied'), { code: 'EPERM' });
let fileSyncs = 0;
try {
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  fileSystem.fsyncSync = (fileDescriptor) => {
    if (fileSystem.fstatSync(fileDescriptor).isDirectory()) throw denied;
    fileSyncs++;
    return original.fsyncSync(fileDescriptor);
  };
  const directory = tempDataDir('rift-win-persistence-');
  const database = new Database(directory);
  database.world.sites.fixture = 'persisted';
  database.touch();
  database.flush();
  assert.equal(fileSyncs, 3, 'checkpoint, players and world files still fsynced');
  assert.equal(database.dirty, false);
  assert.equal(database.economicFrozen, false);
  assert.equal(fileSystem.existsSync(database.journal), false);
  assert.equal(new Database(directory).world.sites.fixture, 'persisted');

  // Exact original failure point: committed journal exists, before either snapshot.
  const recoveryDir = tempDataDir('rift-win-recovery-');
  fileSystem.writeFileSync(path.join(recoveryDir, 'players.json'), '{}');
  fileSystem.writeFileSync(path.join(recoveryDir, 'world.json'), '{"sites":{"old":"stale"}}');
  fileSystem.writeFileSync(
    path.join(recoveryDir, 'checkpoint.json'),
    JSON.stringify({
      version: 1,
      players: JSON.stringify({ fixture: { name: 'Fixture', credits: 123 } }),
      world: JSON.stringify({ sites: { fixture: 'committed' } }),
    }),
  );
  const recovered = new Database(recoveryDir);
  assert.equal(requiredFixtureValue(recovered.get('fixture')).credits, 123);
  assert.deepEqual(recovered.world.sites, { fixture: 'committed' });
  assert.equal(fileSystem.existsSync(recovered.journal), false);
  const reopened = new Database(recoveryDir);
  assert.equal(requiredFixtureValue(reopened.get('fixture')).credits, 123);
  assert.deepEqual(reopened.world.sites, recovered.world.sites);

  for (const operation of ['openSync', 'writeFileSync', 'fsyncSync', 'renameSync'] as const) {
    const blocked = new Database(tempDataDir('rift-win-denied-'));
    blocked.touch();
    const saved = Object.getOwnPropertyDescriptor(fileSystem, operation)!;
    Object.defineProperty(fileSystem, operation, {
      value: () => {
        throw denied;
      },
    });
    try {
      assert.throws(
        () => blocked.flush(),
        (error) => error === denied,
        operation,
      );
      assert.equal(blocked.dirty, true, 'failed checkpoint must not be marked saved');
      assert.equal(blocked.economicFrozen, operation === 'renameSync');
    } finally {
      Object.defineProperty(fileSystem, operation, saved);
    }
  }
  // A real filesystem write rejection also escapes the production writer.
  const blocked = new Database(tempDataDir('rift-win-path-denied-'));
  fileSystem.mkdirSync(blocked.journal + '.tmp');
  blocked.touch();
  assert.throws(() => blocked.flush(), /EISDIR|EACCES|EPERM/);
  assert.equal(blocked.dirty, true);

  // POSIX directory handles cannot be opened on native Windows.
  if (requiredFixtureValue(platform).value !== 'win32') {
    // POSIX directory failures are not silenced by the Windows capability gate.
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
    const posix = new Database(tempDataDir('rift-posix-directory-'));
    posix.touch();
    assert.throws(
      () => posix.flush(),
      (error) => error === denied,
    );
    assert.equal(posix.economicFrozen, true);
    assert.equal(fileSystem.existsSync(posix.journal), true);
  }
} finally {
  Object.assign(fileSystem, original);
  Object.defineProperty(process, 'platform', platform!);
}

// Launch the same production entry point as each .bat, without touching real saves.
for (const solo of [false, true]) {
  const directory2 = tempDataDir('rift-win-startup-');
  const preload = resolvePreloadFile(
    new URL('./fixtures/preload-persistence-platform.ts', import.meta.url),
  );

  const seeds = path.join(directory2, 'seeds.json');
  fileSystem.writeFileSync(seeds, '[]');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const output = evidenceDir(solo ? 'windows-solo' : 'windows-online');
  const server = spawn(
    process.execPath,
    ['--import', pathToFileURL(preload).href, 'server/local-main.ts'],
    {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        SOLO: solo ? '1' : '',
        DATA_DIR: path.join(directory2, 'data'),
        SEEDS_FILE: seeds,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  try {
    await ready(server, origin);
    const response = await fetch(origin + '/api/status', { signal: AbortSignal.timeout(5000) });
    const status = await response.json();
    assert.equal(status.solo, solo);
    const login = await fetch(origin, { signal: AbortSignal.timeout(5000) });
    assert.equal(login.status, 200);
    assert.match(await login.text(), /Quantum Rift/);
    assert.equal(fileSystem.existsSync(path.join(directory2, 'data', 'world.json')), true);
    assert.equal(fileSystem.existsSync(path.join(directory2, 'data', 'checkpoint.json')), false);
  } finally {
    await cleanup(server, null, serverLog, directory2);
  }
}
console.log(
  'PASS platform persistence, pending-journal recovery, denied writes, online/Solo startup',
);
