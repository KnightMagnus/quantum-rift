// Blue-HUD login console, landed service strip, guest dock and viewscreen JUMP button.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Page } from 'playwright';
import {
  availablePort,
  cleanup,
  evidenceDir,
  failureEvidence,
  ready,
  root,
} from './helpers/browser-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { augmentAssets } from '../shared/rules.ts';
const { chromium } = await import('playwright');

const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-hud-controls-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || evidenceDir('hud-controls');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const siteId = 'site-meridian';
const addCaptain = (name: string, stellar: string) => {
  const playerData = Game.prototype.fresh.call({ A: assets });
  playerData.sys = STELLARS[stellar].system;
  playerData.stellar = stellar;
  playerData.tut = 999;
  playerData.explored = Object.keys(systemsById);
  return database.create(name, 'solo', playerData);
};
addCaptain('Port Pilot', 'meridian-yards');
const owner = addCaptain('Station Owner', siteId);
owner.station = { ...owner.station, claimed: true, site: siteId, ops: 5 };
database.world.sites[siteId] = database.key('Station Owner');
addCaptain('Station Guest', siteId);
database.touch();
database.flush();

const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', path.join(root, 'test/helpers/seed-random.ts'), 'server/local-main.ts'],
  {
    cwd: root,
    env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(directory, 'data') },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);

async function playAs(page: Page, name: string) {
  await page.goto(origin);
  await page.locator(`[data-slot="${name}"]`).click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
}
const tabLabels = (page: Page) =>
  page
    .locator('#ltabs button')
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.lt));

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  await ready(server, origin);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(event.message));

  // Login console wears the blue hull frame, not the old grey panel with a red LED.
  await page.goto(origin);
  await page.locator('[data-slot="Port Pilot"]').waitFor();
  const login = await page.evaluate(() => {
    const box = document.querySelector('#login .loginbox')!;
    const style = getComputedStyle(box);
    return {
      frame: style.borderImageSource,
      header: getComputedStyle(box, '::before').backgroundImage,
      led: getComputedStyle(box, '::after').backgroundColor,
    };
  });
  assert.match(login.frame, /sculpted-frame\.svg/, 'login console uses the HUD hull frame');
  assert.match(login.header, /rgb\(18, 81, 123\)/, 'login header uses the blue HUD bar');
  assert.equal(login.led, 'rgb(104, 204, 255)', 'login status light is HUD blue');
  await page.screenshot({ path: path.join(evidence, 'login.png') });

  // Landed service strip starts at the panel's left edge. Below 2100px wide the
  // buttons were 12px; they are now 1.5x that.
  await playAs(page, 'Port Pilot');
  const strip = await page.evaluate(() => {
    const panel = document.querySelector('#land .landbox')!.getBoundingClientRect();
    const tabs = document.getElementById('ltabs')!.getBoundingClientRect();
    const head = document.querySelector('#land .landhead')!.getBoundingClientRect();
    const first = document.querySelector('#ltabs button')!;
    return {
      fromLeft: tabs.left - panel.left,
      headLeft: head.left - panel.left,
      aboveHead: tabs.bottom <= head.top,
      fontSize: parseFloat(getComputedStyle(first).fontSize),
    };
  });
  assert.ok(Math.abs(strip.fromLeft - strip.headLeft) <= 2, 'strip lines up with the panel edge');
  assert.ok(strip.aboveHead, 'strip runs along the top of the landed panel');
  assert.equal(strip.fontSize, 18, 'service buttons are 1.5x larger');
  await page.screenshot({ path: path.join(evidence, 'landed-strip.png') });

  // J stays the jump key; the gold JUMP button joins it, faded until a route is plotted.
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const jump = page.locator('#jumpholo');
  await jump.waitFor({ state: 'visible' });
  assert.equal(await jump.isDisabled(), true, 'JUMP is inactive without a plotted system');
  assert.ok(
    Number(await jump.evaluate((button) => getComputedStyle(button).opacity)) < 0.5,
    'JUMP fades without a plotted system',
  );
  assert.equal(await page.locator('#jumpholokey').textContent(), 'J', 'J is shown as the key');
  const viewport = page.viewportSize()!;
  const rightCorner = (await jump.boundingBox())!;
  assert.ok(rightCorner.x > viewport.width / 2, 'JUMP defaults to the bottom-right corner');
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#toasts *')].some((node) =>
      /Plot a course/.test(node.textContent || ''),
    ),
  );
  await page.evaluate(() => {
    const ship = G.view!;
    ship.x += 6000;
    ship.y += 6000;
  });
  await page.evaluate(async () => {
    const { SYS } = await import('/shared/galaxy.js');
    G.route = [SYS[G.sys!].links[0]];
  });
  // Lights up (opacity transitions back to 1) once a system is plotted.
  await page.waitForFunction(() => {
    const button = document.getElementById('jumpholo') as HTMLButtonElement;
    return !button.disabled && getComputedStyle(button).opacity === '1';
  });
  assert.match(String(await jump.getAttribute('title')), /\(J\)/, 'tooltip names the J key');
  await page.screenshot({ path: path.join(evidence, 'jump-right.png') });

  await page.evaluate(() => document.getElementById('opt-jumpLeft')!.click());
  await page.waitForFunction(() => document.body.classList.contains('jump-left'));
  const leftCorner = (await jump.boundingBox())!;
  assert.ok(leftCorner.x < viewport.width / 4, 'the setting moves JUMP to the bottom-left');
  assert.ok(Math.abs(leftCorner.y - rightCorner.y) < 2, 'both corners share the same baseline');
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('rift.opts') || '{}').jumpLeft),
    true,
    'the corner choice is saved with the other settings',
  );
  await page.screenshot({ path: path.join(evidence, 'jump-left.png') });
  const startSystem = await page.evaluate(() => G.sys);
  await jump.click();
  await page.waitForFunction(
    (start) => G._jumping || G.auto?.mode === 'jump' || G.sys !== start,
    startSystem,
    { timeout: 10000 },
  );

  // The owner sees their station; a visitor gets the guest dock only.
  const ownerPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  ownerPage.on('pageerror', (event) => errors.push(event.message));
  await playAs(ownerPage, 'Station Owner');
  assert.ok((await tabLabels(ownerPage)).includes('station'), 'the owner sees STATION');
  await ownerPage.close();
  const guestPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  guestPage.on('pageerror', (event) => errors.push(event.message));
  await playAs(guestPage, 'Station Guest');
  const guestTabs = await tabLabels(guestPage);
  assert.ok(
    guestTabs.every((tab) => ['overview', 'trade', 'jobs', 'crew'].includes(tab!)),
    `guests only get limited services: ${guestTabs.join(', ')}`,
  );
  assert.match(
    String(await guestPage.locator('#landname').textContent()),
    /Guest Dock/,
    'the visitor is told they are on the guest dock',
  );
  assert.equal(
    await guestPage.locator('#dockchips').innerHTML(),
    '',
    'no dock switcher for guests',
  );
  await guestPage.screenshot({ path: path.join(evidence, 'guest-dock.png') });
  await guestPage.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, evidence }, null, 2));
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
