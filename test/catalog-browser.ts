import { launchChromium } from './helpers/chromium.ts';
// Optional real Chromium regression (Playwright supplied separately).
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs POISON_CACHE=1 EXPECT_FIXED=1 \
//   node test/catalog-browser.ts "$PWD" /absolute/evidence/directory
// Omit EXPECT_FIXED to assert the v2.8.2 negative control instead.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import operatingSystem from 'node:os';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';

const root = process.argv[2],
  evidence = process.argv[3];
fileSystem.mkdirSync(evidence, { recursive: true });
const load = (player: string) => import(pathToFileURL(path.join(root, player)).href);
const { DB: Database } = await load('server/db.ts'),
  { Game } = await load('server/game.ts');
const { augmentAssets } = await load('shared/rules.ts');
const assets2 = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString(),
);
augmentAssets(assets2);
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-282-download-smoke-'),
);
const database = new Database(directory),
  fresh = Game.prototype.fresh.call({ A: assets2 }) as ReturnType<
    import('../server/game.ts').Game['fresh']
  > & { story?: { done: string[]; active: null; step: number } };
fresh.tut = 999;
database.create('Release Smoke', 'isolated-smoke', fresh);
const port = Number(process.env.CATALOG_TEST_PORT || 18896),
  upstream = `http://127.0.0.1:${port}`,
  origin = `http://127.0.0.1:${port + 1}`;
let poison = false,
  served: (string | undefined)[] = [];
const proxy = http.createServer((request2, response) => {
  if (poison && request2.url!.startsWith('/assets/')) {
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    response.end(
      'version https://git-lfs.github.com/spec/v1\noid sha256:unavailable\nsize 12345\n',
    );
    return;
  }
  served.push(request2.url);
  const upstreamReq = http.request(
    upstream + request2.url || '/',
    { method: request2.method, headers: request2.headers },
    (result) => {
      response.writeHead(result.statusCode!, result.headers);
      result.pipe(response);
    },
  );
  upstreamReq.on('error', () => {
    response.writeHead(502);
    response.end();
  });
  request2.pipe(upstreamReq);
});
proxy.on('upgrade', (request3, socket, head) => {
  const result = http.request(upstream + request3.url || '/', { headers: request3.headers });
  result.on('upgrade', (response2, sock, hull) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(response2.headers)
          .map(([entryKey, value]) => entryKey + ': ' + value)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (head.length) sock.write(head);
    if (hull.length) socket.write(hull);
    socket.pipe(sock);
    sock.pipe(socket);
  });
  result.end();
});
await new Promise<void>((resolve) => proxy.listen(port + 1, '127.0.0.1', () => resolve()));
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: directory },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  let status;
  for (let index = 0; index < 100; index++) {
    if (server.exitCode !== null) throw Error(`Server exited ${server.exitCode}`);
    try {
      const statusResponse = await fetch(origin + '/api/status');
      if (statusResponse.ok) {
        status = await statusResponse.json();
        break;
      }
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  assert.equal(
    status.version,
    process.env.EXPECT_VERSION ||
      JSON.parse(fileSystem.readFileSync(path.join(root, 'package.json')).toString()).version,
  );
  assert.equal(status.solo, true);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  if (process.env.POISON_CACHE) {
    await page.goto(origin);
    poison = true;
    const poisoned = await page.evaluate(async () => {
      const { augmentAssets, allOutfits } = await import('/shared/rules.js');
      const assets3 = augmentAssets(await (await fetch('/shared/assets.json')).json());
      const ships = Object.values(assets3.ships)
          .filter((hullAsset) => ![703, 704, 708, 714, 821, 823, 827].includes(hullAsset.id))
          .map((hullAsset2) => hullAsset2.img),
        outfits = Object.values(allOutfits(assets3))
          .filter((outfitAsset) => ![564, 569, 602, 603, 9020].includes(outfitAsset.id))
          .map((outfitAsset2) => outfitAsset2.icon);
      return await Promise.all(
        [...ships, ...outfits].map(async (path) => {
          await (await fetch('/assets/' + path)).arrayBuffer();
          const image = new Image();
          image.src = '/assets/' + path;
          try {
            await image.decode();
            return { path, ok: true };
          } catch {
            return { path, ok: false };
          }
        }),
      );
    });
    fileSystem.writeFileSync(path.join(evidence, 'primed.json'), JSON.stringify(poisoned, null, 2));
    poison = false;
    served = [];
  }
  await page.goto(origin);

  await page.locator('[data-slot="Release Smoke"]').click();
  await page.waitForFunction(() => G.you && G.landed && G.solo);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  if (!(await page.locator('#hud').isVisible())) await page.click('#traytoggle');
  await page.click('[data-tab="codex"]');
  await page.waitForTimeout(1000);
  const assets = await page.evaluate(async () => {
    const { allOutfits } = await import('/shared/rules.js');
    const list = [
      ...Object.values(G.A!.ships).map((hullAsset3) => ({
        kind: 'ship',
        id: hullAsset3.id,
        path: hullAsset3.img,
      })),
      ...Object.values(allOutfits(G.A!)).map((outfitAsset3) => ({
        kind: 'outfit',
        id: outfitAsset3.id,
        path: outfitAsset3.icon,
      })),
    ];
    return await Promise.all(
      list.map(async (assetProbe) => {
        const image2 = new Image();
        image2.src =
          '/' +
          (
            await import('/artwork.js').catch(() => ({
              artworkUrl: (feature: string) => 'assets/' + feature,
            }))
          ).artworkUrl(assetProbe.path!);
        try {
          await image2.decode();
          return {
            ...assetProbe,
            ok: true,
            width: image2.naturalWidth,
            height: image2.naturalHeight,
          };
        } catch (error2) {
          return { ...assetProbe, ok: false, error: String(error2) };
        }
      }),
    );
  });
  const surfaces: Record<
    string,
    { src: string | null; ok: boolean; width: number; visible: boolean }[]
  > = {};
  const inspect = async (name: string) => {
    await page.waitForTimeout(600);
    await page
      .locator(name.startsWith('codex') ? '#clist' : '#landbody')
      .evaluate((scrollState: { scrollTop: number }) => {
        scrollState.scrollTop = 0;
      });
    surfaces[name] = await page
      .locator(name.startsWith('codex') ? '#clist img' : '#landbody img')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          src: element.getAttribute('src'),
          ok:
            (element as HTMLImageElement).complete &&
            (element as HTMLImageElement).naturalWidth > 0,
          width: (element as HTMLImageElement).naturalWidth,
          visible: !!(
            (element as HTMLElement).offsetWidth && (element as HTMLElement).offsetHeight
          ),
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
    .evaluateAll((elements2) => elements2.map((element2) => element2.dataset.h));
  const yardDetails = [];
  for (const identifier of yardIds) {
    await page.locator(`#landbody .card[data-h="${identifier}"]`).click();
    const assertCondition = await page.locator('#landbody .detail img').evaluate((element3) =>
      (element3 as HTMLImageElement).decode().then(
        () => true,
        () => false,
      ),
    );
    yardDetails.push({ id: identifier, ok: assertCondition });
    if (process.env.EXPECT_FIXED)
      assert.ok(assertCondition, `Shipyard detail ${identifier} decodes`);
  }
  await page.click('[data-lt="outfit"]');
  await inspect('outfitter');
  fileSystem.writeFileSync(
    path.join(evidence, 'surfaces.json'),
    JSON.stringify({ surfaces, yardIds, yardDetails, served }, null, 2),
  );

  await page.click('#cchips [data-c="Outfits"]');
  await page.waitForTimeout(300);
  await inspect('codex-outfits');
  await page.click('#cchips [data-c="Weapons"]');
  await inspect('codex-weapons');
  fileSystem.writeFileSync(
    path.join(evidence, 'surfaces.json'),
    JSON.stringify({ surfaces, yardIds, yardDetails, served }, null, 2),
  );
  if (process.env.EXPECT_FIXED)
    for (const [surface, images] of Object.entries(surfaces)) {
      assert.ok(images.length, surface + ' has images');
      assert.ok(
        images.every((imageProbe) => imageProbe.ok),
        surface + ' all images decoded',
      );
    }

  if (process.env.POISON_CACHE && !process.env.EXPECT_FIXED) {
    assert.equal(surfaces['codex-ships'].filter((imageProbe2) => imageProbe2.ok).length, 7);
    assert.equal(surfaces.outfitter.filter((imageProbe3) => imageProbe3.ok).length, 5);
    const failedCodex = new Set(
      surfaces['codex-ships']
        .filter((imageProbe4) => !imageProbe4.ok)
        .map((imageProbe5) => imageProbe5.src),
    );
    assert.ok(
      surfaces.shipyard
        .filter((imageProbe6) => !imageProbe6.ok)
        .every((imageProbe7) => failedCodex.has(imageProbe7.src)),
    );
    assert.equal(surfaces['codex-missing-detail'][0].ok, false);
    assert.equal(surfaces.shipyard.filter((imageProbe8) => imageProbe8.ok).length, 8);
  }
  if (process.env.EXPECT_FIXED) {
    assert.ok(
      assets.every((assetProbe2) => assetProbe2.ok),
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
    JSON.stringify(
      {
        decoded: assets.length,
        failed: assets.filter((assetProbe3) => !assetProbe3.ok),
      },
      null,
      2,
    ),
  );
  fileSystem.writeFileSync(path.join(evidence, 'decode.json'), JSON.stringify(assets, null, 2));
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
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve3) => server.once('exit', resolve3));
  }
  proxy.closeAllConnections();
  proxy.close();
  serverLog.end();
}
