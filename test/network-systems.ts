// Isolated, bounded real-client protocol regression tests.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import { root, availablePort, evidenceDir, ready, cleanup } from './helpers/browser-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
for (const test of ['combat-network.ts', 'hailing-network.ts', 'bot.ts']) {
  const directory = tempDataDir('rift-network-'),
    output = evidenceDir(test.replace('.js', '')),
    port = await availablePort(),
    origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    ['--import', './test/seed-random.ts', 'server/local-main.ts'],
    {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        SOLO: '',
        DATA_DIR: directory,
        SEEDS_FILE: '/nonexistent',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  let client: ChildProcess | undefined;
  try {
    await ready(server, origin);
    client = spawn(
      process.execPath,
      ['--import', './test/seed-random.ts', 'test/' + test, origin.replace('http', 'ws') + '/ws'],
      { cwd: root, env: { ...process.env, SEEDS_FILE: '/nonexistent' }, stdio: 'inherit' },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      client!.kill('SIGKILL');
    }, 90000);
    let code;
    try {
      code = await new Promise((resolve, reject) => {
        client!.once('error', reject);
        client!.once('exit', resolve);
      });
    } finally {
      clearTimeout(timer);
    }
    assert.equal(timedOut, false, test + ' deadline');
    assert.equal(code, 0, test + ' passed against fresh server');
  } finally {
    client?.kill();
    await cleanup(server, null, serverLog, directory);
  }
}
console.log(
  'Real network regression clients: combat, hailing and core two-captain gameplay passed.',
);
