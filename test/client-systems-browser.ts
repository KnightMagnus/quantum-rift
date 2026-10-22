import { seedCargo } from './helpers/cargo-fixture.ts';
// Real Solo UI contracts: save round-trip, settings persistence, map input, pause.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const output = evidenceDir('client-systems');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-client-systems-'),
);
const assets = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString(),
);
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
  import('../server/game.ts').Game['fresh']
> & { story?: { done: string[]; active: null; step: number } };
playerData.tut = 999;
playerData.story = { done: ['start'], active: null, step: 0 };
playerData.credits = 43210;
seedCargo(playerData, { ore: 3 });
database.create('Client Systems', 'fixture', playerData);
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', path.join(root, 'test/helpers/seed-random.ts'), 'server/local-main.ts'],
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
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
const errors: string[] = [];
const results: Record<string, unknown> = {};
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  const banner = await page.locator('#login .loginbox').evaluate((entity) => {
    const session = getComputedStyle(entity, '::before');
    return {
      display: session.display,
      align: session.alignItems,
      height: session.height,
      padding: session.paddingLeft,
    };
  });
  assert.deepEqual(banner, { display: 'flex', align: 'center', height: '26px', padding: '30px' });
  assert.equal(await page.locator('#login .login-location').count(), 0);
  await page.screenshot({ path: path.join(output, 'solo-login-centered-banner.png') });
  const exported = page.waitForEvent('download');
  await page.locator('a[download]').click();
  const downloaded = await exported;
  const savePath = path.join(directory, 'export.rift.json');
  await downloaded.saveAs(savePath);
  const save = JSON.parse(fileSystem.readFileSync(savePath).toString());
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
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#lerr')!.textContent.length > 0,
  );
  assert.equal(await page.locator('[data-slot]').count(), slotsBefore);
  const onDisk = JSON.parse(
    fileSystem.readFileSync(path.join(directory, 'data/players.json')).toString(),
  );
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
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    assert.equal(await page.evaluate(() => G.you!.credits), 43210);
    await page.locator('#depart').click();
    await page.waitForFunction(() => G.view && !G.landed);
  }
  await play();
  await page.locator('#optbtn').click();
  await page.locator('#opt-cb').check();
  await page.locator('#opt-scale').focus();
  await page.keyboard.press('Home');
  for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowRight');
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
    const { SYS: systemsById } = await import('/shared/galaxy.js');
    const { mapHit } = await import('/render.js');
    const mapTransform = G.mapXform;
    const canvas = document.querySelector<HTMLCanvasElement>('#gcanvas');
    const result = canvas!.getBoundingClientRect();
    for (const identifier of systemsById[G.sys!].links) {
      const session = systemsById[identifier];
      const horizontalPosition =
        mapTransform!.W / 2 + (session.x - mapTransform!.cx) * mapTransform!.k;
      const verticalPosition =
        mapTransform!.H / 2 + (session.y - mapTransform!.cy) * mapTransform!.k;
      if (
        horizontalPosition > 10 &&
        horizontalPosition < mapTransform!.W - 10 &&
        verticalPosition > 10 &&
        verticalPosition < mapTransform!.H - 10 &&
        mapHit(G, horizontalPosition, verticalPosition) === identifier
      )
        return {
          id: identifier,
          x: result.x + (horizontalPosition * result.width) / canvas!.width,
          y: result.y + (verticalPosition * result.height) / canvas!.height,
        };
    }
    throw Error('No visible adjacent map target');
  });
  await page.mouse.click(destination.x, destination.y);
  await page.waitForFunction((identifier) => G.route.at(-1) === identifier, destination.id);
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
  const frozen = await page.evaluate(() => ({ x: G.view!.x, y: G.view!.y }));
  await page.waitForTimeout(350);
  assert.deepEqual(await page.evaluate(() => ({ x: G.view!.x, y: G.view!.y })), frozen);
  assert.equal(await page.locator('#pausebox').isVisible(), true);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => !G.paused);
  await page.waitForFunction(
    (player) => Math.hypot(G.view!.x - player.x, G.view!.y - player.y) > 1,
    frozen,
  );
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
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify(results));
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
