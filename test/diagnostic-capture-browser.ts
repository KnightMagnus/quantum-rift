// Options support controls record real trade estimates only after opt-in and export a replayable file.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { type Browser, chromium } from 'playwright';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';
import { addLots } from '../shared/cargo-lots.ts';
import { parseDiagnosticCapture } from '../shared/diagnostic-capture.ts';
import { replayDiagnosticCapture } from '../shared/diagnostic-replay.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const directory = tempDataDir('rift-diagnostic-capture-'),
  output = evidenceDir('diagnostic-capture');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const playerData = Game.prototype.fresh.call({ A: assets });
playerData.tut = 999;
Object.assign(playerData, { story: { done: ['start'], active: null } });
playerData.ship = makeLoadout(assets, 704, 'Support hauler');
playerData.credits = 100000;
addLots(playerData.cargo, playerData.cargoLots, {
  cid: 'ore',
  qty: 6,
  grades: { common: 1, rich: 2, pure: 3 },
});
database.create('Support Pilot', 'fixture', playerData);
database.create('Other Support Pilot', 'fixture', structuredClone(playerData));
database.flush();
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
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
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser: Browser | undefined;
const errors: string[] = [],
  requests: string[] = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('request', (request) => {
    if (request.method() !== 'GET' || !request.url().startsWith(origin))
      requests.push(request.method() + ' ' + request.url());
  });
  await page.goto(origin);
  await page.locator('[data-slot="Support Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="trade"]').click();
  const amount = page.getByRole('spinbutton', {
    name: 'Raw Ore trade amount in tons',
    exact: true,
  });
  const estimate = page.locator('[data-trade-estimate="ore"]');
  const recorded = () =>
    page.evaluate(async () => (await import('/diagnostics.js')).diagnostics.size);
  const openOptions = async () => {
    await page.locator('#optbtn').click();
    await page.locator('#opts').waitFor({ state: 'visible' });
  };
  const closeOptions = async () => {
    await page.locator('#optclose').click();
    await page.locator('#opts').waitFor({ state: 'hidden' });
  };

  // Off by default: real estimates are not recorded.
  await amount.fill('7');
  await estimate.getByText('Buy 7 t:', { exact: false }).waitFor();
  assert.equal(await recorded(), 0);
  await openOptions();
  const toggle = page.getByRole('checkbox', {
    name: 'Record trade estimates for a support report',
  });
  const status = page.locator('#diagstatus');
  const exportButton = page.locator('#diagexport');
  const clearButton = page.locator('#diagclear');
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await status.innerText(), 'Off. Nothing is being recorded.');
  assert.equal(await exportButton.isDisabled(), true);
  assert.equal(await clearButton.isDisabled(), true);
  await page.locator('#opts .optbox').screenshot({ path: path.join(output, 'options-off.png') });

  // Opt in, then exercise the actual market estimate.
  requests.length = 0;
  await toggle.check();
  assert.equal(await status.innerText(), 'Recording trade estimates: 0 of 50 kept.');
  await closeOptions();
  await amount.fill('5');
  await estimate.getByText('Buy 5 t:', { exact: false }).waitFor();
  await amount.fill('2');
  await estimate.getByText('Buy 2 t:', { exact: false }).waitFor();
  const kept = await recorded();
  assert.ok(kept >= 2, `expected recorded estimates, got ${kept}`);
  // Market re-renders recompute every estimate but record nothing extra.
  await page.evaluate(async () => (await import('/ui.js')).renderLanded());
  assert.equal(await recorded(), kept);
  await openOptions();
  assert.equal(await status.innerText(), `Recording trade estimates: ${kept} of 50 kept.`);
  await page
    .locator('#opts .optbox')
    .screenshot({ path: path.join(output, 'options-recording.png') });

  // Export saves a local file that replays offline and holds no captain identity.
  const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
  assert.equal(download.suggestedFilename(), 'quantum-rift-diagnostics-v1.json');
  const exportedPath = path.join(output, 'exported-capture.json');
  await download.saveAs(exportedPath);
  const exportedText = fileSystem.readFileSync(exportedPath, 'utf8');
  assert.equal(exportedText.includes('Support Pilot'), false);
  assert.equal(exportedText.includes('fixture'), false);
  const parsed = parseDiagnosticCapture(exportedText);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.detail);
  assert.match(parsed.capture.build.game, /^\d+\.\d+\.\d+/);
  assert.equal(parsed.capture.entries.length, kept);
  const amounts = parsed.capture.entries.map((entry) => entry.input.amount);
  assert.ok(amounts.includes(5) && amounts.includes(2));
  assert.deepEqual(replayDiagnosticCapture(parsed.capture).mismatches, []);

  // Stopping keeps entries for export but records nothing new.
  await toggle.uncheck();
  assert.equal(await status.innerText(), `Stopped: ${kept} of 50 kept, ready to export.`);
  await closeOptions();
  await amount.fill('3');
  await estimate.getByText('Buy 3 t:', { exact: false }).waitFor();
  assert.equal(await recorded(), kept);

  // Clear discards everything.
  await openOptions();
  await clearButton.click();
  assert.equal(await recorded(), 0);
  assert.equal(await status.innerText(), 'Off. Nothing is being recorded.');
  assert.equal(await exportButton.isDisabled(), true);
  await closeOptions();

  // Opt-in and retained previews belong to one captain session, not the next sign-in.
  await openOptions();
  await toggle.check();
  await closeOptions();
  await amount.fill('4');
  await estimate.getByText('Buy 4 t:', { exact: false }).waitFor();
  assert.ok((await recorded()) > 0);
  await amount.blur();
  await page.keyboard.press('Escape');
  await page.locator('#quitconfirm').click();
  await page.waitForFunction(() => !G.you);
  assert.equal(await recorded(), 0, 'logout clears retained account projections');
  await page.locator('[data-slot="Other Support Pilot"]').click();
  await page.waitForFunction(() => G.you?.name === 'Other Support Pilot' && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await openOptions();
  assert.equal(await toggle.isChecked(), false, 'another captain must opt in separately');
  assert.equal(await exportButton.isDisabled(), true);
  assert.equal(await status.innerText(), 'Off. Nothing is being recorded.');
  await closeOptions();

  // Nothing persists in browser storage and nothing was uploaded.
  const stored = await page.evaluate(() =>
    JSON.stringify(
      [localStorage, sessionStorage].flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) => {
          const key = storage.key(index)!;
          return [key, storage.getItem(key)];
        }),
      ),
    ),
  );
  assert.equal(/diagnostic|trade-preview/i.test(stored), false);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ kept, amounts, requests, errors }, null, 2),
  );
  console.log(
    'Diagnostic capture controls: off by default, opt-in recording of real estimates, local export, offline replay, stop and clear PASS',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
