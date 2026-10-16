// Actual Solo UI: system-detail hover must not resize the galaxy map.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets } from '../shared/rules.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-map-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const fresh = Game.prototype.fresh.call({ A });
fresh.tut = 999;
db.create('Map Layout', 'map-browser', fresh);
const port = Number(process.env.RIFT_BROWSER_PORT || 18894);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const results = [],
  errors = [];
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin);
  await page.locator('[data-slot="Map Layout"]').click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  const measure = () =>
    page.evaluate(() => {
      const rect = (id) => {
        const e = document.querySelector(id),
          r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          clientHeight: e.clientHeight,
          scrollHeight: e.scrollHeight,
        };
      };
      return {
        box: rect('#gmap .gbox'),
        canvas: rect('#gcanvas'),
        details: rect('#ginfo'),
        hover: G.hoverSys,
        text: document.getElementById('ginfo').textContent,
        canvasSize: [gcanvas.width, gcanvas.height],
      };
    });
  for (const config of [
    { width: 1920, height: 1080, hud: 360, scale: 1 },
    { width: 1600, height: 1050, hud: 600, scale: 1 },
    { width: 1280, height: 800, hud: 280, scale: 1 },
    { width: 1024, height: 768, hud: 400, scale: 1 },
    { width: 1024, height: 768, hud: 600, scale: 1 },
    { width: 1280, height: 800, hud: 360, scale: 1.25 },
  ]) {
    await page.setViewportSize({ width: config.width, height: config.height });
    await page.evaluate(async (config) => {
      const { closeMap } = await import('/ui.js');
      closeMap();
      document.documentElement.style.setProperty('--hud', config.hud + 'px');
      document.documentElement.style.setProperty('--ui', config.scale);
      document.body.classList.toggle('scaled', config.scale !== 1);
    }, config);
    for (const mode of ['factions', 'trade', 'services']) {
      const systems = await page.evaluate(async (mode) => {
        const { SYS } = await import('/shared/galaxy.js');
        G.you.explored = Object.keys(SYS);
        G.mapMode = mode;
        G.hoverSys = null;
        return [...Object.values(SYS)]
          .filter((s) => !s.arena)
          .sort(
            (a, b) =>
              b.stellars.map((p) => p.name).join('').length -
              a.stellars.map((p) => p.name).join('').length,
          )
          .slice(0, 2)
          .map((s) => s.id)
          .concat(Object.values(SYS).find((s) => !s.arena && !s.stellars.length).id);
      }, mode);
      for (const id of systems) {
        await page.mouse.move(0, 0);
        await page.evaluate(async (id) => {
          const { openMap } = await import('/ui.js');
          G.hoverSys = null;
          openMap(id);
        }, id);
        await page.waitForTimeout(500); // opening animation must finish before bounding measurements
        const before = await measure();
        const c = await page.locator('#gcanvas').boundingBox();
        await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
        await page.waitForFunction((id) => G.hoverSys === id, id);
        const during = await measure();
        await page.screenshot({
          path: path.join(
            evidence,
            `map-${config.width}-${config.hud}-${config.scale}-${mode}-${id}.png`,
          ),
        });
        // Find empty map space, not a corner that may contain another star.
        const empty = await page.evaluate(async () => {
          const { mapHit } = await import('/render.js');
          const gc = document.getElementById('gcanvas'),
            r = gc.getBoundingClientRect();
          for (let y = 12; y < gc.height - 12; y += 24)
            for (let x = 12; x < gc.width - 12; x += 24)
              if (!mapHit(G, x, y))
                return { x: r.x + (x * r.width) / gc.width, y: r.y + (y * r.height) / gc.height };
          throw new Error('No empty map space');
        });
        await page.mouse.move(empty.x, empty.y);
        await page.waitForFunction(() => G.hoverSys === null);
        const after = await measure();
        const deltas = {};
        for (const field of ['box', 'canvas', 'details'])
          deltas[field] = Math.max(
            ...[during, after].flatMap((m) =>
              ['y', 'height'].map((k) => Math.abs(m[field][k] - before[field][k])),
            ),
          );
        results.push({ config, mode, id, before, during, after, deltas });
      }
    }
  }
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ results, errors, navigation: false }, null, 2),
  );
  const scrollable = results.filter(
    (r) => r.during.details.scrollHeight > r.during.details.clientHeight,
  );
  if (process.env.RIFT_MAP_BASELINE !== '1')
    assert.ok(scrollable.length, 'long system details exercise the bounded scrolling area');
  if (process.env.RIFT_MAP_BASELINE !== '1') {
    assert.equal(await page.locator('#ginfo').getAttribute('tabindex'), '0');
    assert.equal(await page.locator('#ginfo').getAttribute('aria-label'), 'System details');
    const longest = scrollable.sort(
      (a, b) => b.during.details.scrollHeight - a.during.details.scrollHeight,
    )[0];
    await page.setViewportSize({ width: longest.config.width, height: longest.config.height });
    await page.evaluate(async ({ config, id, mode }) => {
      const { closeMap, openMap } = await import('/ui.js');
      closeMap();
      document.documentElement.style.setProperty('--hud', config.hud + 'px');
      document.documentElement.style.setProperty('--ui', config.scale);
      document.body.classList.toggle('scaled', config.scale !== 1);
      G.mapMode = mode;
      G.hoverSys = null;
      openMap(id);
    }, longest);
    await page.waitForTimeout(500);
    const rect = await page.locator('#gcanvas').boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.locator('#ginfo').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.getElementById('ginfo').scrollTop > 0);
  }
  // Navigation still works after hover: click the centered star and use search.
  await page.evaluate(async () => {
    const { openMap } = await import('/ui.js');
    openMap('sol');
  });
  const c = await page.locator('#gcanvas').boundingBox();
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  assert.ok(await page.evaluate(() => G.route.at(-1) === 'sol' || G.sys === 'sol'));
  await page.fill('#gsearch', 'Sol');
  await page.locator('#gresults [data-sys="sol"]').first().click();
  assert.ok(await page.evaluate(() => G.route.at(-1) === 'sol' || G.sys === 'sol'));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ results, errors, navigation: true }, null, 2),
  );
  const unstable = results.filter((r) => Object.values(r.deltas).some((d) => d > 0.05));
  console.log(
    JSON.stringify(
      {
        cases: results.length,
        unstable: unstable.map((r) => ({
          config: r.config,
          mode: r.mode,
          id: r.id,
          deltas: r.deltas,
        })),
        errors,
        navigation: true,
        evidence,
      },
      null,
      2,
    ),
  );
  if (process.env.RIFT_MAP_BASELINE !== '1')
    assert.equal(unstable.length, 0, 'hover changes map/detail bounding boxes');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  log.end();
}
