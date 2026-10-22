import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.mjs';

assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(root, 'dist/server/seeds.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'server/seeds.json'), 'utf8')),
  'compiled default seed catalog must be shipped unchanged',
);

for (const entry of ['server/main.ts', 'dist/server/main.js', 'tools/start.mjs']) {
  for (const solo of [false, true]) {
    const port = await availablePort();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-compiled-'));
    const evidence = evidenceDir(`compiled-${entry.replaceAll('/', '-')}-${solo}`);
    const log = fs.createWriteStream(path.join(evidence, 'server.log'));
    const server = spawn(process.execPath, [entry], {
      cwd: root,
      env: { ...process.env, PORT: String(port), DATA_DIR: directory, SOLO: solo ? '1' : '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.pipe(log, { end: false });
    server.stderr.pipe(log, { end: false });
    const origin = `http://127.0.0.1:${port}`;
    try {
      await ready(server, origin);
      const status = await (await fetch(origin + '/api/status')).json();
      assert.equal(status.solo, solo, `${entry}: Solo mode is preserved`);
      assert.equal(
        status.version,
        JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
      );
      const page = await fetch(origin + '/');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /main\.js/);
      const client = await fetch(origin + '/mining-panel-state.js');
      assert.match(client.headers.get('content-type'), /javascript/);
      assert.match(await client.text(), /shared\/ship-capacity\.js/);
      const capacity = await fetch(origin + '/shared/ship-capacity.js');
      assert.equal(capacity.status, 200);
      assert.match(capacity.headers.get('content-type'), /javascript/);
      const capacityModule = await import(
        'data:text/javascript;base64,' + Buffer.from(await capacity.text()).toString('base64')
      );
      assert.equal(new capacityModule.ShipCapacity(10, 4, 3).available, 3);
      assert.equal((await fetch(origin + '/shared/ship-capacity.ts')).status, 404);
      assert.equal((await fetch(origin + '/style.css')).status, 200);
      const catalog = await (await fetch(origin + '/shared/assets.json')).json();
      assert.ok(Object.keys(catalog).length > 0, 'source JSON assets remain available');
      const imported = await fetch(origin + '/api/import', { method: 'POST', body: '{}' });
      assert.equal(imported.status, solo ? 400 : 404, 'online save imports remain unavailable');
    } catch (error) {
      fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
      throw error;
    } finally {
      await cleanup(server, null, log, directory);
    }
  }
}
console.log(
  'Source and compiled online/Solo servers deliver executable JavaScript and original assets.',
);
