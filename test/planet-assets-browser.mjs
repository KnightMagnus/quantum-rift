// Real Chromium decode/fallback/recovery checks. Does not need accounts or a game server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STELLARS } from '../shared/galaxy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.RIFT_BROWSER_EVIDENCE;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const server = http.createServer((req, res) => {
  const rel = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (!rel) return res.end('<!doctype html><body></body>');
  const file = path.resolve(root, 'client', rel);
  if (!file.startsWith(path.join(root, 'client') + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader(
    'Content-Type',
    file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.json')
        ? 'application/json'
        : 'image/webp',
  );
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
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
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.route('**/assets/planets/**', async (route) => {
      const rel = new URL(route.request().url()).pathname.slice(1);
      const count = (requests.get(rel) || 0) + 1;
      requests.set(rel, count);
      const earth = /\/earth(?:_|\.)/.test(rel);
      const manifest = rel.endsWith('/planets.json');
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
      let file = path.join(root, 'client', rel);
      const data = fs.readFileSync(file);
      if (
        data.subarray(0, 43).toString().startsWith('version https://git-lfs.github.com/spec/v1')
      ) {
        assert.equal(earth, false, 'Earth artwork must ship as real image bytes, not LFS pointers');
        assert.ok(
          process.env.RIFT_ASSET_FALLBACK,
          `Provide RIFT_ASSET_FALLBACK for LFS asset ${rel}`,
        );
        file = path.join(process.env.RIFT_ASSET_FALLBACK, rel);
      }
      return route.fulfill({ path: file });
    });
    await page.goto(origin);
    await page.evaluate(
      async (worlds) => {
        const { planetSprite } = await import('/planets.js');
        window.worlds = worlds;
        window.sprites = {};
        const frame = () => {
          for (const p of worlds) {
            const sprite = planetSprite(p, performance.now());
            if (sprite) window.sprites[p.id] = sprite;
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
        () => window.sprites.earth?.T?.col && !window.sprites.earth.T.R,
        null,
        { timeout: 20000 },
      );
      await page.waitForTimeout(6000);
      const before = [...requests].filter(([key]) => /\/earth(?:_|\.)/.test(key));
      assert.ok(before.length >= 3);
      for (const [, count] of before)
        assert.equal(count, 3, 'Failed assets stop after three attempts');
      await page.waitForTimeout(1500);
      assert.deepEqual(
        [...requests].filter(([key]) => /\/earth(?:_|\.)/.test(key)),
        before,
        'No per-frame retry loop',
      );
      assert.equal(await page.evaluate(() => !!window.sprites.earth.T.R), false);
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
        for (const p of window.worlds) {
          const heading = document.createElement('h2');
          heading.textContent = p.name;
          document.body.append(heading, window.sprites[p.id].canvas);
        }
      });
      await page.screenshot({ path: path.join(evidence, `${mode}.png`) });
    }
    assert.deepEqual(errors, []);
    outcomes.push({ mode, requests: Object.fromEntries(requests), errors });
    await page.close();
  }
  if (evidence)
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(outcomes, null, 2));
  console.log(
    'Planet assets: healthy Earth/Concordia, decode/manifest recovery, bounded pointer/404 fallback passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
