// Isolated, bounded real-client protocol regression tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, availablePort, evidenceDir, ready, cleanup } from './helpers/browser-fixture.mjs';
import { tempDataDir } from './helpers/temp-data.js';
for (const test of ['combat-network.js', 'hailing-network.js', 'bot.js']) {
  const dir = tempDataDir('rift-network-'),
    out = evidenceDir(test.replace('.js', '')),
    port = await availablePort(),
    origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', './test/seed-random.js', 'server/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      SOLO: '',
      DATA_DIR: dir,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  let client;
  try {
    await ready(server, origin);
    client = spawn(
      process.execPath,
      ['--import', './test/seed-random.js', 'test/' + test, origin.replace('http', 'ws') + '/ws'],
      { cwd: root, env: { ...process.env, SEEDS_FILE: '/nonexistent' }, stdio: 'inherit' },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      client.kill('SIGKILL');
    }, 90000);
    let code;
    try {
      code = await new Promise((resolve, reject) => {
        client.once('error', reject);
        client.once('exit', resolve);
      });
    } finally {
      clearTimeout(timer);
    }
    assert.equal(timedOut, false, test + ' deadline');
    assert.equal(code, 0, test + ' passed against fresh server');
  } finally {
    client?.kill();
    await cleanup(server, null, log, dir);
  }
}
console.log(
  'Real network regression clients: combat, hailing and core two-captain gameplay passed.',
);
