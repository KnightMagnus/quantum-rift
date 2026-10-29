import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { makeLoadout, augmentAssets } from '../shared/rules.ts';
import { launchChromium } from './helpers/chromium.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const output = evidenceDir('equipped-outfits');
const directory = tempDataDir('equipped-outfits-');
const database = new DB(path.join(directory, 'data'));
const rawAssets = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'),
);
const assets = augmentAssets(rawAssets);
for (const [name, hull] of [
  ['Outfit Pilot', 704],
  ['Built-in Pilot', 716],
] as const) {
  const player = Game.prototype.fresh.call({ A: assets });
  player.ship = makeLoadout(assets, hull, 'Rift Runner');
  if (hull === 704) player.ship.outfits[9017] = 1;
  else player.ship.outfits[9221] = 1;
  player.credits = 500000;
  player.stellar = 'concordia';
  player.sys = STELLARS[player.stellar].system;
  player.tut = 999;
  Object.assign(player, { story: { done: ['start'], active: null, step: 0 } });
  database.create(name, '', player);
}
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: database.dir,
      SEEDS_FILE: path.join(directory, 'no-seeds'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem('rift.opts', JSON.stringify({ mute: true, keys: {} })),
  );
  await page.goto(origin);
  await page.locator('[data-slot="Outfit Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.locator('[data-lt="outfit"]').click();
  await page.locator('[data-act="ocat"][data-k="mining"]').click();
  const miningRows = page
    .locator('#landbody .tbl tr')
    .filter({ has: page.locator('[data-act="outfit"]') });
  const miningNames = await miningRows.allTextContents();
  for (const name of ['Seam Tapper', 'Mining Laser', 'Tow Rig'])
    assert(
      miningNames.some((row) => row.includes(name)),
      name,
    );
  assert(
    miningNames.every((row) => /Seam Tapper|Mining Laser|Tow Rig/.test(row)),
    'mining filter excludes combat weapons',
  );
  await page.screenshot({
    path: path.join(output, 'mining-outfitter.png'),
    animations: 'disabled',
  });
  await page.locator('[data-act="ocat"][data-k="weapons"]').click();
  assert.doesNotMatch(await page.locator('#landbody .tbl').innerText(), /Seam Tapper|Mining Laser/);
  await page.keyboard.press('KeyI');
  assert.equal(await page.locator('#infotitle').textContent(), 'SHIP DETAILS');
  const tapper = page.locator('[data-equipped="9017"]');
  assert.match(await tapper.innerText(), /Seam Tapper ×1/);
  assert.match(await tapper.innerText(), /Mining weapon/);
  assert.equal(
    await tapper
      .locator('img')
      .evaluate(
        (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
      ),
    true,
  );
  await page.screenshot({
    path: path.join(output, 'equipped-outfits.png'),
    animations: 'disabled',
  });
  const creditsBefore = await page.evaluate(() => G.you!.credits);
  await tapper.locator('button').click();
  await page.waitForFunction(() => !G.you!.ship.outfits[9017]);
  assert.equal(await tapper.count(), 0, 'sale refreshes open ship info');
  assert((await page.evaluate(() => G.you!.credits)) > creditsBefore, 'real sale credits refund');
  await page.keyboard.press('KeyO');
  assert.equal(await page.locator('#infotitle').textContent(), 'CAPTAIN');
  assert.equal(await page.locator('#opts').isVisible(), false, 'O does not open Settings');
  await page.keyboard.press('KeyI');
  assert.equal(await page.locator('#infotitle').textContent(), 'SHIP DETAILS');
  await page.keyboard.press('KeyI');
  assert.equal(await page.locator('#infobox').isVisible(), false, 'same shortcut toggles closed');
  await page.locator('#optbtn').click();
  await page.locator('[data-bind="info"]').click();
  await page.keyboard.press('F8');
  await page.locator('[data-bind="captain"]').click();
  await page.keyboard.press('F9');
  await page.locator('#optclose').click();
  await page.keyboard.press('F8');
  assert.equal(await page.locator('#infotitle').textContent(), 'SHIP DETAILS');
  await page.keyboard.press('F9');
  assert.equal(await page.locator('#infotitle').textContent(), 'CAPTAIN');
  await page.keyboard.press('F9');
  assert.equal(await page.locator('#infobox').isVisible(), false, 'custom shortcut closes window');
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.press('F8');
  assert.equal(
    await page.locator('[data-sell-outfit]:enabled').count(),
    0,
    'no equipment sale in flight',
  );
  await page.setViewportSize({ width: 800, height: 650 });
  await page.screenshot({ path: path.join(output, 'equipped-narrow.png'), animations: 'disabled' });
  assert(
    await page.locator('.equipment-card').evaluateAll((cards) =>
      cards.every((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }),
    ),
    'equipment cards stay inside narrow viewport',
  );
  await page.close();

  const builtIn = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await builtIn.goto(origin);
  await builtIn.locator('[data-slot="Built-in Pilot"]').click();
  await builtIn.waitForFunction(() => G.you && G.landed);
  await builtIn.locator('[data-lt="outfit"]').click();
  await builtIn.locator('[data-act="ocat"][data-k="mining"]').click();
  assert.match(await builtIn.locator('#landbody').innerText(), /Ore Crusher Hold/);
  await builtIn.locator('[data-act="ocat"][data-k="weapons"]').click();
  assert.doesNotMatch(await builtIn.locator('#landbody').innerText(), /Ore Crusher Hold/);
  await builtIn.locator('#shipshortcut').click();
  const bank = builtIn.locator('[data-equipped="143"][data-built-in="true"]');
  assert.match(await bank.innerText(), /Spall Driver ×2/);
  await bank.locator('button').click();
  await builtIn.waitForFunction(
    () => G.you!.ship.fixed.find(([identifier]) => identifier === 143)?.[1] === 1,
  );
  assert.match(await bank.innerText(), /Spall Driver ×1/);
  await bank.locator('button').click();
  await builtIn.waitForFunction(() => !G.you!.shipStats!.weapons[143]);
  assert.equal(await bank.count(), 0, 'last built-in removed from preview and weapons');
  await builtIn.reload();
  await builtIn.locator('[data-slot="Built-in Pilot"]').click();
  await builtIn.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await builtIn.evaluate(() => G.you!.shipStats!.weapons[143] || 0),
    0,
    'sale survives reconnect',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Mining filter, equipped previews, modular/built-in sales, flight denial, reconnect, shortcuts/rebinding and narrow layout passed.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
