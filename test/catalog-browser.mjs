// Optional real Chromium regression (Playwright supplied separately).
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs POISON_CACHE=1 EXPECT_FIXED=1 \
//   node test/catalog-browser.mjs "$PWD" /absolute/evidence/directory
// Omit EXPECT_FIXED to assert the v2.8.2 negative control instead.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.argv[2],
  evidence = process.argv[3];
fs.mkdirSync(evidence, { recursive: true });
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { DB } = await load('server/db.js'),
  { Game } = await load('server/game.js');
const { augmentAssets } = await load('shared/rules.js');
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-282-download-smoke-'));
const db = new DB(dir),
  fresh = Game.prototype.fresh.call({ A });
fresh.tut = 999;
db.create('Release Smoke', 'isolated-smoke', fresh);
const port = Number(process.env.CATALOG_TEST_PORT || 18896),
  upstream = `http://127.0.0.1:${port}`,
  origin = `http://127.0.0.1:${port + 1}`;
let poison = false,
  served = [];
const proxy = http.createServer((req, res) => {
  if (poison && req.url.startsWith('/assets/')) {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    res.end('version https://git-lfs.github.com/spec/v1\noid sha256:unavailable\nsize 12345\n');
    return;
  }
  served.push(req.url);
  const upstreamReq = http.request(
    upstream + req.url,
    { method: req.method, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  upstreamReq.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstreamReq);
});
proxy.on('upgrade', (req, socket, head) => {
  const r = http.request(upstream + req.url, { headers: req.headers });
  r.on('upgrade', (res, sock, h) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(res.headers)
          .map(([k, v]) => k + ': ' + v)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (head.length) sock.write(head);
    if (h.length) socket.write(h);
    socket.pipe(sock);
    sock.pipe(socket);
  });
  r.end();
});
await new Promise((r) => proxy.listen(port + 1, '127.0.0.1', r));
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: dir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  let status;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error(`Server exited ${server.exitCode}`);
    try {
      const r = await fetch(origin + '/api/status');
      if (r.ok) {
        status = await r.json();
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(
    status.version,
    process.env.EXPECT_VERSION ||
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
  );
  assert.equal(status.solo, true);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (process.env.POISON_CACHE) {
    await page.goto(origin);
    poison = true;
    const poisoned = await page.evaluate(async () => {
      const { augmentAssets, allOutfits } = await import('/shared/rules.js');
      const A = augmentAssets(await (await fetch('/shared/assets.json')).json());
      const ships = Object.values(A.ships)
          .filter((x) => ![703, 704, 708, 714, 821, 823, 827].includes(x.id))
          .map((x) => x.img),
        outfits = Object.values(allOutfits(A))
          .filter((x) => ![564, 569, 602, 603, 9020].includes(x.id))
          .map((x) => x.icon);
      return await Promise.all(
        [...ships, ...outfits].map(async (path) => {
          await (await fetch('/assets/' + path)).arrayBuffer();
          const im = new Image();
          im.src = '/assets/' + path;
          try {
            await im.decode();
            return { path, ok: true };
          } catch {
            return { path, ok: false };
          }
        }),
      );
    });
    fs.writeFileSync(path.join(evidence, 'primed.json'), JSON.stringify(poisoned, null, 2));
    poison = false;
    served = [];
  }
  await page.goto(origin);

  await page.locator('[data-slot="Release Smoke"]').click();
  await page.waitForFunction(() => G.you && G.landed && G.solo);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('[data-tab="codex"]');
  await page.waitForTimeout(1000);
  const assets = await page.evaluate(async () => {
    const { allOutfits } = await import('/shared/rules.js');
    const list = [
      ...Object.values(G.A.ships).map((x) => ({ kind: 'ship', id: x.id, path: x.img })),
      ...Object.values(allOutfits(G.A)).map((x) => ({ kind: 'outfit', id: x.id, path: x.icon })),
    ];
    return await Promise.all(
      list.map(async (x) => {
        const img = new Image();
        img.src =
          '/' +
          (
            await import('/artwork.js').catch(() => ({ artworkUrl: (f) => 'assets/' + f }))
          ).artworkUrl(x.path);
        try {
          await img.decode();
          return { ...x, ok: true, width: img.naturalWidth, height: img.naturalHeight };
        } catch (e) {
          return { ...x, ok: false, error: String(e) };
        }
      }),
    );
  });
  const surfaces = {};
  const inspect = async (name) => {
    await page.waitForTimeout(600);
    await page.locator(name.startsWith('codex') ? '#clist' : '#landbody').evaluate((x) => {
      x.scrollTop = 0;
    });
    surfaces[name] = await page
      .locator(name.startsWith('codex') ? '#clist img' : '#landbody img')
      .evaluateAll((xs) =>
        xs.map((x) => ({
          src: x.getAttribute('src'),
          ok: x.complete && x.naturalWidth > 0,
          width: x.naturalWidth,
          visible: !!(x.offsetWidth && x.offsetHeight),
        })),
      );
    await page.screenshot({ path: path.join(evidence, name + '.png') });
  };
  await inspect('codex-ships');
  await page.locator('#clist [data-k="s706"]').click();
  await inspect('codex-missing-detail');
  await page.click('#cback');
  await page.click('[data-lt="yard"]');
  await inspect('shipyard');
  const yardIds = await page
    .locator('#landbody .card[data-h]')
    .evaluateAll((xs) => xs.map((x) => x.dataset.h));
  const yardDetails = [];
  for (const id of yardIds) {
    await page.locator(`#landbody .card[data-h="${id}"]`).click();
    const ok = await page.locator('#landbody .detail img').evaluate((x) =>
      x.decode().then(
        () => true,
        () => false,
      ),
    );
    yardDetails.push({ id, ok });
    if (process.env.EXPECT_FIXED) assert.ok(ok, `Shipyard detail ${id} decodes`);
  }
  await page.click('[data-lt="outfit"]');
  await inspect('outfitter');
  fs.writeFileSync(
    path.join(evidence, 'surfaces.json'),
    JSON.stringify({ surfaces, yardIds, yardDetails, served }, null, 2),
  );

  await page.click('#cchips [data-c="Outfits"]');
  await page.waitForTimeout(300);
  await inspect('codex-outfits');
  await page.click('#cchips [data-c="Weapons"]');
  await inspect('codex-weapons');
  fs.writeFileSync(
    path.join(evidence, 'surfaces.json'),
    JSON.stringify({ surfaces, yardIds, yardDetails, served }, null, 2),
  );
  if (process.env.EXPECT_FIXED)
    for (const [surface, images] of Object.entries(surfaces)) {
      assert.ok(images.length, surface + ' has images');
      assert.ok(
        images.every((x) => x.ok),
        surface + ' all images decoded',
      );
    }

  if (process.env.POISON_CACHE && !process.env.EXPECT_FIXED) {
    assert.equal(surfaces['codex-ships'].filter((x) => x.ok).length, 7);
    assert.equal(surfaces.outfitter.filter((x) => x.ok).length, 5);
    const failedCodex = new Set(surfaces['codex-ships'].filter((x) => !x.ok).map((x) => x.src));
    assert.ok(surfaces.shipyard.filter((x) => !x.ok).every((x) => failedCodex.has(x.src)));
    assert.equal(surfaces['codex-missing-detail'][0].ok, false);
    assert.equal(surfaces.shipyard.filter((x) => x.ok).length, 8);
  }
  if (process.env.EXPECT_FIXED) {
    assert.ok(
      assets.every((x) => x.ok),
      'All 194 catalog assets decode',
    );
    const sprite = await fetch(origin + '/assets/ships/704.webp');
    assert.equal(sprite.headers.get('cache-control'), 'public, max-age=86400');
    const bare = await fetch(origin + '/assets/icons/9001.png');
    assert.equal(bare.headers.get('cache-control'), 'no-cache');
    const versioned = await fetch(origin + '/assets/icons/9001.png?v=' + status.version);
    assert.equal(versioned.headers.get('cache-control'), 'public, max-age=86400');
  }
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  console.log(
    JSON.stringify({ decoded: assets.length, failed: assets.filter((x) => !x.ok) }, null, 2),
  );
  fs.writeFileSync(path.join(evidence, 'decode.json'), JSON.stringify(assets, null, 2));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidence, 'downloaded-release-flight.png') });
  const result = {
    pass: true,
    status: { version: status.version, solo: status.solo },
    root,
    decoded: assets.length,
    soloFlight: await page.evaluate(() => ({
      solo: G.solo,
      sys: G.sys,
      landed: !!G.landed,
      hull: G.myHull,
      ship: !!G.view,
    })),
    errors,
  };
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
  }
  proxy.closeAllConnections();
  proxy.close();
  log.end();
}
