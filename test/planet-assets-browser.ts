// Real Chromium decode/fallback/recovery checks. Does not need accounts or a game server.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STELLARS } from '../shared/galaxy.ts';
import type { PlanetDef } from '../client/planets.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.RIFT_BROWSER_EVIDENCE;
if (evidence) fileSystem.mkdirSync(evidence, { recursive: true });
const { chromium } = (await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
)) as typeof import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const server = http.createServer((request2, response) => {
  const relativePath = new URL(request2.url!, 'http://localhost').pathname.slice(1);
  if (!relativePath) return response.end('<!doctype html><body></body>');
  const file = path.resolve(root, 'client', relativePath);
  if (!file.startsWith(path.join(root, 'client') + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  if (!fileSystem.existsSync(file)) return response.writeHead(404).end();
  response.setHeader(
    'Content-Type',
    file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.json')
        ? 'application/json'
        : 'image/webp',
  );
  response.end(fileSystem.readFileSync(file));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const outcomes = [];
try {
  for (const mode of [
    'healthy',
    'transient-pointer',
    'transient-manifest',
    'permanent-pointer',
    'permanent-404',
  ]) {
    const page = await browser.newPage({ viewport: { width: 960, height: 1050 } });
    const requests = new Map();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.route('**/assets/planets/**', async (route) => {
      const relativePath2 = new URL(route.request().url()).pathname.slice(1);
      const count = (requests.get(relativePath2) || 0) + 1;
      requests.set(relativePath2, count);
      const earth = /\/earth(?:_|\.)/.test(relativePath2);
      const manifest = relativePath2.endsWith('/planets.json');
      if (earth && mode === 'permanent-404')
        return route.fulfill({ status: 404, body: 'Unavailable' });
      if (
        (earth &&
          (mode === 'permanent-pointer' || (mode === 'transient-pointer' && count === 1))) ||
        (manifest && mode === 'transient-manifest' && count === 1)
      )
        return route.fulfill({
          status: 200,
          contentType: manifest ? 'application/json' : 'image/webp',
          body: 'version https://git-lfs.github.com/spec/v1\noid sha256:invalid\nsize 1\n',
        });
      let file = path.join(root, 'client', relativePath2);
      const data = fileSystem.readFileSync(file);
      if (
        data.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1')
      ) {
        assert.equal(earth, false, 'Earth artwork must ship as real image bytes, not LFS pointers');
        assert.ok(
          process.env.RIFT_ASSET_FALLBACK,
          `Provide RIFT_ASSET_FALLBACK for LFS asset ${relativePath2}`,
        );
        file = path.join(process.env.RIFT_ASSET_FALLBACK, relativePath2);
      }
      return route.fulfill({ path: file });
    });
    await page.goto(origin);
    await page.evaluate(
      async (worlds: PlanetDef[]) => {
        const { planetSprite } = await import('/planets.js');
        window.worlds = worlds;
        window.sprites = {};
        const frame = () => {
          for (const player of worlds) {
            const sprite = planetSprite(player, performance.now());
            if (sprite) window.sprites[player.id] = sprite;
          }
          requestAnimationFrame(frame);
        };
        frame();
      },
      [STELLARS.earth, STELLARS.concordia],
    );
    await page.waitForFunction(() => window.sprites.concordia?.T?.tw === 768, null, {
      timeout: 20000,
    });
    if (mode.startsWith('permanent-')) {
      await page.waitForFunction(
        () => window.sprites.earth?.T?.col && !window.sprites.earth.T!.R,
        null,
        { timeout: 20000 },
      );
      await page.waitForTimeout(6000);
      const before = [...requests].filter(([entryKey]) => /\/earth(?:_|\.)/.test(entryKey));
      assert.ok(before.length >= 3);
      for (const [, count] of before)
        assert.equal(count, 3, 'Failed assets stop after three attempts');
      await page.waitForTimeout(1500);
      assert.deepEqual(
        [...requests].filter(([entryKey2]) => /\/earth(?:_|\.)/.test(entryKey2)),
        before,
        'No per-frame retry loop',
      );
      assert.equal(await page.evaluate(() => !!window.sprites.earth.T!.R), false);
    } else {
      await page.waitForFunction(() => window.sprites.earth?.T?.tw === 768, null, {
        timeout: 20000,
      });
      if (mode === 'transient-pointer')
        assert.equal(
          requests.get('assets/planets/earth_tex.webp'),
          2,
          'Failed decode recovers without reload',
        );
      if (mode === 'transient-manifest')
        assert.equal(requests.get('assets/planets/planets.json'), 2);
    }
    if (evidence) {
      await page.evaluate(() => {
        for (const player of window.worlds) {
          const heading = document.createElement('h2');
          heading.textContent = player.name ?? '';
          document.body.append(heading, window.sprites[player.id].canvas);
        }
      });
      await page.screenshot({ path: path.join(evidence, `${mode}.png`) });
    }
    assert.deepEqual(errors, []);
    outcomes.push({ mode, requests: Object.fromEntries(requests), errors });
    await page.close();
  }
  if (evidence)
    fileSystem.writeFileSync(
      path.join(evidence, 'results.json'),
      JSON.stringify(outcomes, null, 2),
    );
  console.log(
    'Planet assets: healthy Earth/Concordia, decode/manifest recovery, bounded pointer/404 fallback passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
