import type { PreloadConfig } from './fixtures/preload-http-api.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
// Real HTTP boundary; retired radio routes cannot call an upstream provider.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
const version = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
for (const solo of [false, true]) {
  const directory = tempDataDir('rift-http-'),
    output = evidenceDir(solo ? 'http-solo' : 'http-online');
  const database = new Database(path.join(directory, 'data')),
    game = new Game(
      JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
      database,
    );
  const playerData = database.create('HTTP Captain', 'fixture-pass', game.fresh());
  playerData.credits = 54321;
  database.touch();
  database.flush();
  const fixture = resolvePreloadFile(new URL('./fixtures/preload-http-api.ts', import.meta.url)),
    trace = path.join(directory, 'upstream.json');

  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', fixture, 'server/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      RIFT_PRELOAD_CONFIGURATION: JSON.stringify({ tracePath: trace } satisfies PreloadConfig),
      PORT: String(port),
      SOLO: solo ? '1' : '',
      DATA_DIR: path.join(directory, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  try {
    await ready(server, origin);
    const request = (address: string, options?: RequestInit) =>
      fetch(origin + address, { ...options, signal: AbortSignal.timeout(5000) });
    const status = await (await request('/api/status')).json();
    assert.equal(status.version, version);
    assert.equal(status.solo, solo);
    assert.equal(status.players, solo ? 0 : null);
    assert.equal(Array.isArray(status.slots), solo);
    const index = await request('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type')!, /text\/html/);
    assert.equal(index.headers.get('cache-control'), 'no-cache');
    assert.match(await index.text(), /Quantum Rift/);
    const asset = await request('/assets/hub.png');
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('content-type'), 'image/png');
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=86400');
    await asset.arrayBuffer();
    assert.equal((await request('/does-not-exist')).status, 404);
    assert.equal(
      (await request('/%2e%2e%2fpackage.json')).status,
      403,
      'encoded traversal cannot escape client root',
    );
    for (const route of ['/api/radio?q=calm', '/api/radio/station?id=17', '/api/radio/meta?id=17'])
      assert.equal((await request(route)).status, 404, 'Retired provider route');
    assert.equal(fileSystem.existsSync(trace), false, 'No upstream provider fetches');
    const audioFilename = '/assets/sfx/music_login31.mp3';
    const bytes = fileSystem.readFileSync(path.join(root, 'client', audioFilename));
    const range = await request(audioFilename, { headers: { Range: 'bytes=100-199' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-type'), 'audio/mpeg');
    assert.equal(range.headers.get('content-range'), 'bytes 100-199/' + bytes.length);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(100, 200));
    const suffix = await request(audioFilename, { headers: { Range: 'bytes=-20' } });
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-20));
    for (const value of ['bytes=999999999-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,3-4'])
      assert.equal((await request(audioFilename, { headers: { Range: value } })).status, 416);
    const exported = await request('/api/export?name=HTTP%20Captain');
    if (solo) {
      assert.equal(exported.status, 200);
      assert.match(exported.headers.get('content-disposition')!, /HTTP_Captain.rift.json/);
      const secondaryIndex = await exported.json();
      assert.equal(secondaryIndex.rift, version);
      assert.equal(secondaryIndex.save.credits, 54321);
      assert.ok(
        !Object.hasOwn(secondaryIndex.save, 'hash') && !Object.hasOwn(secondaryIndex.save, 'salt'),
      );
      assert.equal((await request('/api/export?name=Missing')).status, 404);
      const malformedFixture = await request('/api/import', { method: 'POST', body: '{broken' });
      assert.equal(malformedFixture.status, 400);
      assert.equal((await malformedFixture.json()).ok, false);
      secondaryIndex.save.name = 'Imported HTTP';
      secondaryIndex.save.credits = 321;
      const imported = await request('/api/import', {
        method: 'POST',
        body: JSON.stringify(secondaryIndex),
      });
      assert.equal(imported.status, 200);
      assert.deepEqual(await imported.json(), { ok: true, name: 'Imported HTTP' });
      assert.equal(
        (await (await request('/api/export?name=Imported%20HTTP')).json()).save.credits,
        321,
      );
    } else {
      assert.equal(exported.status, 404);
      assert.equal((await request('/api/import', { method: 'POST', body: '{}' })).status, 404);
    }
  } finally {
    await cleanup(server, null, serverLog, directory);
  }
}
console.log(
  'Real HTTP: static/MIME/cache/traversal, online-vs-solo status/save permissions and roundtrip, retired radio endpoints without upstream access passed.',
);
process.exit(0);
