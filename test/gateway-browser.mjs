import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-gate-browser-'));
const evidence = path.resolve(process.argv[2] || evidenceDir('gateway'));
fs.mkdirSync(evidence, { recursive: true });
const db = new DB(path.join(dir, 'data')),
  g = new Game(JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))), db);
for (const sys of ['sol', 'coldharbor']) {
  const d = db.create('Gate ' + sys, '', g.fresh());
  d.sys = sys;
  d.stellar = sys === 'sol' ? 'luna' : 'coldharbor';
  d.tut = 999;
  d.story = { done: ['start'], active: null };
}
db.touch();
db.flush();
const fixture = path.join(dir, 'fixture.mjs');
fs.writeFileSync(
  fixture,
  'import {Game} from ' +
    JSON.stringify(pathToFileURL(path.join(root, 'server/game.js')).href) +
    ';' +
    'import {SYS} from ' +
    JSON.stringify(pathToFileURL(path.join(root, 'shared/galaxy.js')).href) +
    ';' +
    'const orig=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(s,...args){orig.call(this,s,...args);if(!s._gatewayFixturePlaced){const p=SYS[s.data.sys].stellars.find(p=>p.wormhole);s._gatewayFixturePlaced=true;Object.assign(s.ent,{x:p.x+250,y:p.y,vx:0,vy:0,a:-Math.PI/2});}for(const e of [...this.spaces[s.data.sys].ships.values()])if(!e.player)this.spaces[s.data.sys].remove(e);};',
);
const port = await availablePort(),
  origin = 'http://127.0.0.1:' + port;
const server = spawn(
  process.execPath,
  [
    '--import',
    path.join(root, 'test/helpers/seed-random.mjs'),
    '--import',
    fixture,
    'server/main.js',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: path.join(dir, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const { chromium } = await import('playwright');
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  const results = [];
  for (const sys of ['sol', 'coldharbor']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [],
      sent = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('websocket', (ws) =>
      ws.on('framesent', (f) => {
        try {
          sent.push(JSON.parse(f.payload));
        } catch {}
      }),
    );
    await page.goto(origin);
    await page.locator('[data-slot="Gate ' + sys + '"]').click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.evaluate(() => {
      G.opts.mouseAim = false;
    });
    await page.waitForTimeout(800);
    // Production screen transform and real double-click listener, not direct autopilot state.
    const pt = await page.evaluate(async () => {
      const { SYS } = await import('/shared/galaxy.js');
      const { cam } = await import('/render.js');
      const p = SYS[G.sys].stellars.find((p) => p.wormhole);
      const c = document.querySelector('canvas'),
        r = c.getBoundingClientRect(),
        d = devicePixelRatio || 1;
      return {
        x: r.left + ((p.x - cam.cx) * cam.z + cam.W / 2) / d,
        y: r.top + ((p.y - cam.cy) * cam.z + cam.H / 2) / d,
      };
    });
    await page.mouse.dblclick(pt.x, pt.y);
    await page.waitForFunction(() => G.auto?.mode === 'gateway');
    await page.waitForFunction((old) => G.sys !== old, sys, { timeout: 45000 });
    const dest = await page.evaluate(() => G.sys);
    await page.waitForTimeout(6500);
    assert.equal(await page.evaluate(() => G.sys), dest);
    assert.equal(sent.filter((m) => m.t === 'land').length, 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(evidence, sys + '-transit.png') });
    results.push({ origin: sys, destination: dest, noBounce: true, landRequests: 0, errors });
    await page.close();
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(results);
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
process.exit(0);
