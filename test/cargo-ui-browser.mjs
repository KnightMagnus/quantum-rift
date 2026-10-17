// Grade-specific controls must deliver actual server-side changes, not DOM-only labels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets, makeLoadout } from '../shared/rules.js';
import { addLots } from '../shared/cargo-lots.js';
import { tempDataDir } from './helpers/temp-data.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const dir = tempDataDir('rift-cargo-ui-'),
  out = evidenceDir('cargo-ui'),
  A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data')),
  d = Game.prototype.fresh.call({ A });
d.tut = 999;
d.story = { done: ['start'], active: null };
d.ship = makeLoadout(A, 704, 'Grade hauler');
addLots(d.cargo, d.cargoLots, { cid: 'ore', qty: 6, grades: { common: 1, rich: 2, pure: 3 } });
db.create('Grade Pilot', 'fixture', d);
db.flush();
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', './test/seed-random.js', 'server/main.js'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(dir, 'data'),
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const errors = [],
  events = [];
let diagnosticPage;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  diagnosticPage = page;
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      try {
        const m = JSON.parse(String(payload));
        if (m.t !== 'input') events.push({ at: Date.now(), dir: 'sent', m });
      } catch {}
    });
    socket.on('framereceived', ({ payload }) => {
      try {
        const m = JSON.parse(String(payload));
        if (m.t === 'you')
          events.push({
            at: Date.now(),
            dir: 'received',
            t: m.t,
            cargo: m.d.cargo,
            lots: m.d.cargoLots,
          });
        else if (m.t === 'toast' || m.t === 'rivals')
          events.push({ at: Date.now(), dir: 'received', t: m.t, msg: m.msg });
      } catch {}
    });
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.pointerTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(
        type,
        (e) =>
          window.pointerTrace.push({
            at: performance.now(),
            type,
            target: e.target.outerHTML?.slice(0, 500),
            x: e.clientX,
            y: e.clientY,
          }),
        true,
      );
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        window.fixtureSocket = this;
      }
    };
  });
  await page.goto(origin);
  await page.locator('[data-slot="Grade Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="trade"]').click();
  const pure = page.locator('[data-act="trade"][data-c="ore"][data-grade="pure"][data-q="-1"]');
  await pure.waitFor();
  assert.equal(await page.locator('[data-grade="rich"][data-act="trade"]').count(), 2);
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'market-grades.png') });
  const credits = await page.evaluate(() => G.you.credits);
  await pure.click();
  await page.waitForFunction(
    () => G.you.cargo.ore === 5 && G.you.cargoLots.byCommodity.ore.pure === 2,
  );
  assert.ok(await page.evaluate((c) => G.you.credits > c, credits));
  assert.deepEqual(await page.evaluate(() => G.you.cargoLots.byCommodity.ore), {
    common: 1,
    rich: 2,
    pure: 2,
  });
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.press('KeyI');
  await page.locator('#infobox').waitFor({ state: 'visible' });
  const dump = page.locator('[data-jet="ore"][data-grade="rich"]').first();
  await dump.waitFor();
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'jettison-grades.png') });
  // Reproduce the asynchronous rivals refresh during a real pointer gesture.
  await dump.hover();
  await page.mouse.down();
  await page.evaluate(() => {
    G.rivals = null;
    window.fixtureSocket.send(JSON.stringify({ t: 'rivals' }));
  });
  await page.waitForFunction(() => Array.isArray(G.rivals));
  await page.mouse.up();
  await page.waitForFunction(
    () => G.you.cargo.ore === 3 && G.you.cargoLots.byCommodity.ore.rich === 0,
  );
  assert.deepEqual(await page.evaluate(() => G.you.cargoLots.byCommodity.ore), {
    common: 1,
    rich: 0,
    pure: 2,
  });
  // The relevant tab must still update when the same asynchronous reply arrives.
  await page.evaluate(() => {
    G.rivals = [];
  });
  await page.locator('[data-it="captains"]').click();
  assert.equal(await page.locator('#infobody table tr').count(), 1);
  await page.evaluate(() => window.fixtureSocket.send(JSON.stringify({ t: 'rivals' })));
  await page.waitForFunction(() => document.querySelectorAll('#infobody table tr').length > 1);
  assert.equal(await page.locator('#infobody table tr').count(), 31);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        gradeSale: true,
        gradeJettison: true,
        rivalsGesture: true,
        captainsRefresh: true,
        serverInventory: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Actual market and in-flight grade buttons preserve unselected grades in authoritative server inventory.',
  );
} catch (error) {
  const state = await diagnosticPage
    ?.evaluate(() => ({
      cargo: G.you?.cargo,
      lots: G.you?.cargoLots,
      itab: G.itab,
      pointers: window.pointerTrace,
    }))
    .catch(() => null);
  fs.writeFileSync(
    path.join(out, 'failure-state.json'),
    JSON.stringify(
      { node: process.version, browser: browser?.version(), errors, events, state },
      null,
      2,
    ),
  );
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
