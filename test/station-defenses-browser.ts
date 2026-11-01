import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { launchChromium } from './helpers/chromium.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const directory = tempDataDir('station-defense-browser-');
const output = evidenceDir('station-defenses');
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
);
const database = new DB(path.join(directory, 'data'));
const player = Game.prototype.fresh.call({ A: assets });
player.ship = makeLoadout(assets, 704, 'Station Tender');
player.tut = 999;
player.station.site = 'site-meridian';
player.station.claimed = true;
player.station.ops = 3;
player.station.defense = 2;
player.stellar = player.station.site;
player.sys = STELLARS[player.stellar].system;
database.create('Station Keeper', 'fixture', player);
database.world.sites[player.stellar] = database.key('Station Keeper');
database.touch();
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
      DATA_DIR: path.join(directory, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = filesystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  await page.locator('[data-slot="Station Keeper"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('#depart').click();
  await page.waitForFunction(
    () =>
      G.view &&
      !G.landed &&
      [...G.ents.values()].filter((entity) => entity.hull === 940).length === 3,
  );
  const sprite = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/assets/ships/940.webp';
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.deepEqual(sprite, { width: 2112, height: 528 }, 'all 36 native platform headings decode');
  const positions = await page.evaluate(() =>
    [...G.ents.values()]
      .filter((entity) => entity.hull === 940)
      .map((entity) => [entity.id, entity.x, entity.y]),
  );
  await page.waitForTimeout(500);
  assert.deepEqual(
    await page.evaluate(() =>
      [...G.ents.values()]
        .filter((entity) => entity.hull === 940)
        .map((entity) => [entity.id, entity.x, entity.y]),
    ),
    positions,
    'actual world snapshots retain anchored platforms',
  );
  await page.keyboard.press('q');
  await page.waitForTimeout(5500);
  await page.screenshot({
    path: path.join(output, 'triad-sentinels-flight.png'),
    animations: 'disabled',
  });
  assert.deepEqual(errors, []);
  console.log(
    'Actual Solo station departure displays three permanent Triad Sentinels with decoded native sprites and stable authoritative positions.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
