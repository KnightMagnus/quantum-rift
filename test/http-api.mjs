// Real HTTP boundary; retired radio routes cannot call an upstream provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.mjs';
import { tempDataDir } from './helpers/temp-data.js';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
for (const solo of [false, true]) {
  const dir = tempDataDir('rift-http-'),
    out = evidenceDir(solo ? 'http-solo' : 'http-online');
  const db = new DB(path.join(dir, 'data')),
    g = new Game(JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))), db);
  const d = db.create('HTTP Captain', 'fixture-pass', g.fresh());
  d.credits = 54321;
  db.touch();
  db.flush();
  const fixture = path.join(dir, 'upstream.mjs'),
    trace = path.join(dir, 'upstream.json');
  fs.writeFileSync(
    fixture,
    "import fs from 'node:fs';globalThis.fetch=async()=>{fs.writeFileSync(" +
      JSON.stringify(trace) +
      ", 'unexpected');throw Error('No provider requests allowed');};",
  );
  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', fixture, 'server/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      SOLO: solo ? '1' : '',
      DATA_DIR: path.join(dir, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  try {
    await ready(server, origin);
    const request = (url, options) =>
      fetch(origin + url, { ...options, signal: AbortSignal.timeout(5000) });
    const status = await (await request('/api/status')).json();
    assert.equal(status.version, version);
    assert.equal(status.solo, solo);
    assert.equal(status.players, 0);
    assert.equal(Array.isArray(status.slots), solo);
    const index = await request('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
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
    assert.equal(fs.existsSync(trace), false, 'No upstream provider fetches');
    const mp3 = '/assets/sfx/music_login31.mp3';
    const bytes = fs.readFileSync(path.join(root, 'client', mp3));
    const range = await request(mp3, { headers: { Range: 'bytes=100-199' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-type'), 'audio/mpeg');
    assert.equal(range.headers.get('content-range'), 'bytes 100-199/' + bytes.length);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(100, 200));
    const suffix = await request(mp3, { headers: { Range: 'bytes=-20' } });
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-20));
    for (const value of ['bytes=999999999-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,3-4'])
      assert.equal((await request(mp3, { headers: { Range: value } })).status, 416);
    const exported = await request('/api/export?name=HTTP%20Captain');
    if (solo) {
      assert.equal(exported.status, 200);
      assert.match(exported.headers.get('content-disposition'), /HTTP_Captain.rift.json/);
      const j = await exported.json();
      assert.equal(j.rift, version);
      assert.equal(j.save.credits, 54321);
      assert.ok(!Object.hasOwn(j.save, 'hash') && !Object.hasOwn(j.save, 'salt'));
      assert.equal((await request('/api/export?name=Missing')).status, 404);
      const bad = await request('/api/import', { method: 'POST', body: '{broken' });
      assert.equal(bad.status, 400);
      assert.equal((await bad.json()).ok, false);
      j.save.name = 'Imported HTTP';
      j.save.credits = 321;
      const imported = await request('/api/import', { method: 'POST', body: JSON.stringify(j) });
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
    await cleanup(server, null, log, dir);
  }
}
console.log(
  'Real HTTP: static/MIME/cache/traversal, online-vs-solo status/save permissions and roundtrip, retired radio endpoints without upstream access passed.',
);
process.exit(0);
