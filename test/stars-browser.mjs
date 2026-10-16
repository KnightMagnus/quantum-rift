// Actual SOLO login/depart/render integration with disposable Sol/Earth and Meridian saves.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-stars-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(assets);
const db = new DB(path.join(dir, 'data'));
const pilot = Game.prototype.fresh.call({ A: assets });
const system = process.env.RIFT_STAR_SYSTEM || 'sol';
assert.ok(['sol', 'meridian'].includes(system), 'supported isolated scene fixture');
pilot.sys = system;
pilot.stellar = system === 'sol' ? 'earth' : 'meridian-yards';
pilot.tut = 999;
pilot.explored.push('sol');
db.create('Solar Observer', 'solo', pilot);
const port = Number(process.env.RIFT_BROWSER_PORT || 18837),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Isolated server exited ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__stellarDraws = [];
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (
        image instanceof HTMLCanvasElement &&
        image.width === 256 &&
        image.height === 256 &&
        new Error().stack.includes('drawStar')
      ) {
        if (window.__stellarDraws.length < 10)
          window.__stellarDraws.push({
            size: args.slice(-2),
            canvas: this.canvas.id,
            center: Array.from(image.getContext('2d').getImageData(128, 128, 1, 1).data),
          });
      }
      return original.call(this, image, ...args);
    };
  });
  if (process.env.RIFT_ASSET_FALLBACK)
    await page.route('**/assets/**', async (route) => {
      const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1),
        local = path.join(root, 'client', relative);
      if (
        fs.existsSync(local) &&
        !fs
          .readFileSync(local)
          .subarray(0, 43)
          .toString()
          .startsWith('version https://git-lfs.github.com/spec/v1')
      )
        return route.continue();
      const fallback = path.join(process.env.RIFT_ASSET_FALLBACK, relative);
      return fs.existsSync(fallback) ? route.fulfill({ path: fallback }) : route.continue();
    });
  await page.goto(origin);
  await page.locator('[data-slot="Solar Observer"]').click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction((wanted) => G.view && !G.landed && G.sys === wanted, system);
  await page.waitForFunction(() => window.__stellarDraws.length > 0);
  await page.waitForTimeout(1800);
  const result = await page.evaluate(() => ({
    sys: G.sys,
    landed: !!G.landed,
    draws: window.__stellarDraws,
  }));
  assert.equal(result.sys, system);
  assert.equal(result.landed, false);
  assert.ok(
    result.draws.every((x) =>
      system === 'sol' ? x.center[0] > x.center[2] : x.center[2] > x.center[0],
    ),
    'actual stellar palette matches selected system',
  );
  assert.deepEqual(errors, [], 'no game page errors');
  await page.screenshot({ path: path.join(evidence, `${system}-game.png`) });
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      system: result.sys,
      actualStellarCanvasDraws: result.draws.length,
      errors,
      evidence,
    }),
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = new Promise((r) => server.once('exit', r));
    server.kill();
    await stopped;
  }
  log.end();
}
