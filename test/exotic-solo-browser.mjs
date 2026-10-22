// Real Solo login, landing UI, departure and complete production flight renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { SYS, STELLARS } from '../shared/galaxy.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-exotic-solo-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || '/tmp/rift-exotic-solo';
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const ports = [
  'aureole-ring',
  'twins-exchange',
  'reliquary-watch',
  'nightjar-refuge',
  'glasswake-foundry',
  'palinode-observatory',
  'meridian-yards',
  'luna',
];
const captain = (id) => 'Art ' + ports.indexOf(id);
for (const id of ports) {
  const p = STELLARS[id],
    d = Game.prototype.fresh.call({ A });
  d.sys = p.system;
  d.stellar = id;
  d.tut = 999;
  d.explored = Object.keys(SYS);
  db.create(captain(id), 'solo', d);
}
const port = Number(process.env.RIFT_BROWSER_PORT || 18798),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const results = [];
  for (const id of ports) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin);
    await page.locator(`[data-slot="${captain(id)}"]`).click();
    await page.waitForFunction(() => window.G?.you && G.landed);
    if (STELLARS[id].kind === 'station')
      await page.waitForFunction(() =>
        document.getElementById('landpic').style.backgroundImage.includes('data:image/png'),
      );
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    // CSS background failures do not raise pageerror: decode EVERY selected landing URL.
    const landingImages = await page.evaluate(async () => {
      const css = document.getElementById('landpic').style.backgroundImage;
      const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
      return await Promise.all(
        urls.map(async (src) => {
          const image = new Image();
          image.src = src;
          try {
            await image.decode();
            return { src: src.startsWith('data:') ? 'generated-station-scene' : src, ok: true };
          } catch {
            return { src, ok: false };
          }
        }),
      );
    });
    assert.ok(
      landingImages.length && landingImages.every((x) => x.ok),
      id + ' landed pictures decode',
    );
    await page.screenshot({ path: path.join(evidence, id + '-landed.png') });
    const state = await page.evaluate(() => ({
      solo: G.solo,
      sys: G.sys,
      stellar: G.landed.stellar,
      name: document.getElementById('landname').textContent,
      landArt: document
        .getElementById('landpic')
        .style.backgroundImage.startsWith('url("data:image/png'),
    }));
    assert.equal(state.solo, true);
    assert.equal(state.stellar, id);
    if (STELLARS[id].kind === 'station') assert.equal(state.landArt, true);
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(evidence, id + '-flight.png') });
    assert.deepEqual(errors, []);
    results.push({ ...state, landingImages, errors });
    await page.close();
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, evidence }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
