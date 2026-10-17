// Real HTTP boundary; radio upstream is deterministic/offline in a child-only preload.
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
    `import fs from 'node:fs';const calls=[];globalThis.fetch=async(input)=>{const url=String(input);calls.push(url);fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify(calls));if(!url.startsWith('https://api.iheart.com/'))throw Error('Unexpected external request');if(url.includes('FAIL')||url.includes('/999'))throw Error('fixture outage');if(url.includes('/search/'))return new Response(JSON.stringify({hits:[{id:17,name:'Fixture Radio'}]}));if(url.includes('/liveStations/'))return new Response(JSON.stringify({hits:[{name:'Fixture Radio',description:'Offline fixture',callLetters:'TEST',streams:{secure_shoutcast_stream:'https://invalid.example/audio'}}]}));if(url.includes('/currentTrackMeta'))return new Response(JSON.stringify({artist:'Fixture Artist',title:'Fixture Track',album:'Fixture Album'}),{status:url.includes('/404/')?404:200});throw Error('Unhandled fixture upstream');};`,
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
    const search = await request('/api/radio?q=' + encodeURIComponent('A'.repeat(100)));
    assert.deepEqual(await search.json(), { hits: [{ id: 17, name: 'Fixture Radio' }] });
    const calls = JSON.parse(fs.readFileSync(trace));
    assert.equal(
      new URL(calls.at(-1)).searchParams.get('keywords').length,
      80,
      'radio search is bounded',
    );
    assert.equal((await request('/api/radio/station?id=letters-only')).status, 400);
    const station = await (await request('/api/radio/station?id=abc123456789012345')).json();
    assert.equal(station.name, 'Fixture Radio');
    assert.ok(station.streams.secure_shoutcast_stream);
    assert.match(
      JSON.parse(fs.readFileSync(trace)).at(-1),
      /liveStations\/123456789012$/,
      'station id digits-only and bounded',
    );
    assert.deepEqual(await (await request('/api/radio/meta?id=17')).json(), {
      artist: 'Fixture Artist',
      title: 'Fixture Track',
      album: 'Fixture Album',
    });
    assert.deepEqual(await (await request('/api/radio/meta?id=404')).json(), {
      artist: '',
      title: '',
      album: '',
    });
    assert.equal((await request('/api/radio?q=FAIL')).status, 502);
    assert.equal((await request('/api/radio/station?id=999')).status, 502);
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
  'Real HTTP: static/MIME/cache/traversal, online-vs-solo status/save permissions and roundtrip, offline radio search/station/meta/outage passed.',
);
process.exit(0);
