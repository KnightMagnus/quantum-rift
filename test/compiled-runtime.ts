import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.ts';

assert.deepEqual(
  JSON.parse(fileSystem.readFileSync(path.join(root, 'dist/server/seeds.json'), 'utf8')),
  JSON.parse(fileSystem.readFileSync(path.join(root, 'server/seeds.json'), 'utf8')),
  'compiled default seed catalog must be shipped unchanged',
);

for (const entry of ['server/main.ts', 'dist/server/main.js', 'tools/start.ts']) {
  for (const solo of [false, true]) {
    const port = await availablePort();
    const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-compiled-'));
    const evidence = evidenceDir(`compiled-${entry.replaceAll('/', '-')}-${solo}`);
    const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
    const server = spawn(process.execPath, [entry], {
      cwd: root,
      env: { ...process.env, PORT: String(port), DATA_DIR: directory, SOLO: solo ? '1' : '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.pipe(serverLog, { end: false });
    server.stderr.pipe(serverLog, { end: false });
    const origin = `http://127.0.0.1:${port}`;
    try {
      await ready(server, origin);
      const status = await (await fetch(origin + '/api/status')).json();
      assert.equal(status.solo, solo, `${entry}: Solo mode is preserved`);
      if (!solo) {
        assert.equal(
          status.localAuthority,
          undefined,
          'production online never advertises a raw local transport',
        );
        assert.equal(typeof status.nakama?.serverKey, 'string');
        assert.equal(typeof status.nakama?.host, 'string');
        assert.equal(status.players, null, 'unknown native population is never reported as zero');
        assert.deepEqual(
          fileSystem.readdirSync(directory),
          [],
          'online web host never creates a Node game database',
        );
      }
      assert.equal(
        status.version,
        JSON.parse(fileSystem.readFileSync(path.join(root, 'package.json'), 'utf8')).publicVersion,
      );
      const page = await fetch(origin + '/');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /main\.js/);
      const client = await fetch(origin + '/mining-panel-state.js');
      assert.match(client.headers.get('content-type')!, /javascript/);
      assert.match(await client.text(), /shared\/ship-capacity\.js/);
      const capacity = await fetch(origin + '/shared/ship-capacity.js');
      assert.equal(capacity.status, 200);
      assert.match(capacity.headers.get('content-type')!, /javascript/);
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
      fileSystem.writeFileSync(
        path.join(evidence, 'failure.txt'),
        String((error as Error).stack || error),
      );
      throw error;
    } finally {
      await cleanup(server, null, serverLog, directory);
      assert.equal(server.exitCode, 0, `${entry}: shutdown exits cleanly`);
      assert.equal(server.signalCode, null, `${entry}: shutdown needs no forced kill`);
    }
  }
}
console.log(
  'Source and compiled online/Solo servers deliver executable JavaScript and original assets.',
);
