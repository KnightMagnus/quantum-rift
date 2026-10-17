// Real Solo UI contracts: save round-trip, settings persistence, map input, pause.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets } from '../shared/rules.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';

const out = evidenceDir('client-systems');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-client-systems-'));
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const d = Game.prototype.fresh.call({ A });
d.tut = 999;
d.story = { done: ['start'], active: null };
d.credits = 43210;
d.cargo = { ore: 3 };
db.create('Client Systems', 'fixture', d);
db.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', path.join(root, 'test/helpers/seed-random.mjs'), 'server/main.js'],
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
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const errors = [];
const results = {};
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  const exported = page.waitForEvent('download');
  await page.locator('a[download]').click();
  const downloaded = await exported;
  const savePath = path.join(dir, 'export.rift.json');
  await downloaded.saveAs(savePath);
  const save = JSON.parse(fs.readFileSync(savePath));
  assert.equal(save.save.name, 'Client Systems');
  assert.equal(save.save.credits, 43210);
  assert.deepEqual(save.save.cargo, { ore: 3 });
  assert.equal(save.save.hash, undefined);
  assert.equal(save.save.salt, undefined);
  save.save.name = 'Imported Systems';
  await page.locator('#limport').setInputFiles({
    name: 'clone.rift.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page.locator('[data-slot="Imported Systems"]').waitFor();
  const slotsBefore = await page.locator('[data-slot]').count();
  const invalid = page.waitForResponse((response) => response.url().endsWith('/api/import'));
  await page.locator('#limport').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"save":{"name":"Bad Save"}}'),
  });
  assert.equal((await invalid).status(), 400);
  await page.waitForFunction(() => document.querySelector('#lerr').textContent.length > 0);
  assert.equal(await page.locator('[data-slot]').count(), slotsBefore);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'data/players.json')));
  assert.equal(onDisk['bad save'], undefined);
  assert.equal(onDisk['imported systems'].credits, 43210);
  assert.deepEqual(onDisk['imported systems'].cargo, { ore: 3 });
  results.save = {
    exported: true,
    imported: true,
    invalidRejected: true,
    credentialsExcluded: true,
  };

  async function play() {
    await page.locator('[data-slot="Imported Systems"]').click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    assert.equal(await page.evaluate(() => G.you.credits), 43210);
    await page.locator('#depart').click();
    await page.waitForFunction(() => G.view && !G.landed);
  }
  await play();
  await page.locator('#optbtn').click();
  await page.locator('#opt-cb').check();
  await page.locator('#opt-scale').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.locator('[data-bind="map"]').click();
  await page.keyboard.press('F8');
  assert.equal(await page.evaluate(() => G.opts.keys.map), 'F8');
  assert.equal(await page.evaluate(() => G.opts.scale), 1.1);
  assert.equal(await page.evaluate(() => G.pal.hostile), '#ff9f1a');
  assert.equal(await page.evaluate(() => document.body.classList.contains('scaled')), true);
  await page.locator('#optclose').click();
  await page.keyboard.press('KeyM');
  assert.equal(await page.locator('#gmap').isVisible(), false, 'old map binding is inactive');
  await page.keyboard.press('F8');
  await page.locator('#gmap').waitFor({ state: 'visible' });
  await page.waitForFunction(() => G.mapXform);
  const destination = await page.evaluate(async () => {
    const { SYS } = await import('/shared/galaxy.js');
    const { mapHit } = await import('/render.js');
    const t = G.mapXform;
    const canvas = document.querySelector('#gcanvas');
    const r = canvas.getBoundingClientRect();
    for (const id of SYS[G.sys].links) {
      const s = SYS[id];
      const x = t.W / 2 + (s.x - t.cx) * t.k;
      const y = t.H / 2 + (s.y - t.cy) * t.k;
      if (x > 10 && x < t.W - 10 && y > 10 && y < t.H - 10 && mapHit(G, x, y) === id)
        return {
          id,
          x: r.x + (x * r.width) / canvas.width,
          y: r.y + (y * r.height) / canvas.height,
        };
    }
    throw Error('No visible adjacent map target');
  });
  await page.mouse.click(destination.x, destination.y);
  await page.waitForFunction((id) => G.route.at(-1) === id, destination.id);
  assert.deepEqual(await page.evaluate(() => G.route), [destination.id]);
  await page.keyboard.press('F8');
  await page.locator('#gmap').waitFor({ state: 'hidden' });
  results.map = { remappedOpenClose: true, actualCanvasClickPlotsAdjacentRoute: destination.id };

  // Establish real motion, pause through the normal key handler and assert coordinates freeze.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => G.paused);
  await page.waitForTimeout(100);
  const frozen = await page.evaluate(() => ({ x: G.view.x, y: G.view.y }));
  await page.waitForTimeout(350);
  assert.deepEqual(await page.evaluate(() => ({ x: G.view.x, y: G.view.y })), frozen);
  assert.equal(await page.locator('#pausebox').isVisible(), true);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => !G.paused);
  await page.waitForFunction((p) => Math.hypot(G.view.x - p.x, G.view.y - p.y) > 1, frozen);
  results.pause = { freezesMovingShip: true, resumesMotion: true };

  await page.reload();
  await play();
  assert.deepEqual(
    await page.evaluate(() => ({ map: G.opts.keys.map, scale: G.opts.scale, cb: G.opts.cb })),
    { map: 'F8', scale: 1.1, cb: true },
  );
  assert.equal(await page.evaluate(() => G.pal.hostile), '#ff9f1a');
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui').trim(),
    ),
    '1.1',
  );
  await page.keyboard.press('F8');
  await page.locator('#gmap').waitFor({ state: 'visible' });
  results.options = {
    colourblindPalette: true,
    actualRangeInputScale: 1.1,
    keybindingPersistsAndWorksAfterReload: true,
  };
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
