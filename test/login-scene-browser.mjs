import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { root, availablePort, evidenceDir, ready, cleanup } from './helpers/browser-fixture.mjs';

const out = evidenceDir('login-scene'),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-login-scene-')),
  port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: { ...process.env, SOLO: '', PORT: String(port), DATA_DIR: dir, SEEDS_FILE: '/nonexistent' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const errors = [],
  failedAssets = [],
  results = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  // Observe actual canvas drawing, without adding production-only test APIs.
  await context.addInitScript(() => {
    window.sceneTest = { draws: 0, ships: {} };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.classList.contains('login-scene')) {
        window.sceneTest.draws++;
        const src = args[0]?.src || '',
          match = src.match(/ships\/(\d+)\.webp/);
        if (match) {
          const id = match[1],
            x = args[5],
            y = args[6];
          const seen = (window.sceneTest.ships[id] ||= { first: x, last: x, visible: false });
          seen.last = x;
          seen.visible ||=
            x >= 0 && y >= 0 && x + args[7] <= innerWidth && y + args[8] <= innerHeight;
        }
      }
      return draw.apply(this, args);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400 && /\/assets\//.test(r.url()))
      failedAssets.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(origin);
  const canvas = page.locator('.login-scene');
  await page.waitForFunction(
    () => document.querySelector('.login-scene')?.dataset.ready === 'true',
  );
  await page.waitForFunction(
    () => document.querySelector('.login-scene')?.dataset.planetReady === 'true',
  );
  const identity = await canvas.evaluate((c) => ({ ...c.dataset }));
  assert.equal(identity.system, 'qgate');
  assert.equal(identity.station, 'qstation');
  assert.equal(identity.planet, 'concordia');
  assert.equal(identity.running, 'true');
  await page.screenshot({ path: path.join(out, 'desktop-start.png') });
  const first = await canvas.evaluate((c) => c.toDataURL());
  await page.waitForTimeout(1400);
  assert.notEqual(
    await canvas.evaluate((c) => c.toDataURL()),
    first,
    'Traffic changes actual scene pixels',
  );
  const traffic = await page.evaluate(() => window.sceneTest.ships);
  assert.equal(Object.keys(traffic).length, 6, 'Six distinct actual ship sheets are drawn');
  for (const [hull, ship] of Object.entries(traffic)) {
    assert.ok(ship.visible, `${hull} is drawn inside the window`);
    assert.ok(Math.abs(ship.last - ship.first) > 3, `${hull} travels across the window`);
  }
  await page.screenshot({ path: path.join(out, 'desktop-traffic.png') });
  results.push({
    check: 'Actual starting landmarks; six loaded and visibly moving hulls',
    status: 'pass',
    traffic,
  });

  for (const [width, height] of [
    [1920, 1080],
    [1280, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => {
      const c = document.querySelector('.login-scene');
      return (
        c.width === Math.round(c.getBoundingClientRect().width * Math.min(devicePixelRatio, 2))
      );
    });
    const layout = await page.evaluate(() => {
      const c = document.querySelector('.login-scene'),
        r = c.getBoundingClientRect(),
        b = document.querySelector('#lbtn').getBoundingClientRect();
      return {
        width: c.width,
        height: c.height,
        cssWidth: r.width,
        cssHeight: r.height,
        overflow: document.documentElement.scrollWidth > innerWidth,
        formOnscreen: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight,
        clickable: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.id === 'lbtn',
      };
    });
    assert.equal(layout.width, width * 2);
    assert.equal(layout.height, height * 2);
    assert.equal(layout.overflow, false);
    assert.equal(layout.formOnscreen, true);
    assert.equal(layout.clickable, true, 'Decorative canvas never intercepts login input');
    await page.screenshot({ path: path.join(out, `viewport-${width}.png`) });
    results.push({
      check: `DPR 2 resize and usable form ${width}x${height}`,
      status: 'pass',
      layout,
    });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'false',
  );
  await page.waitForTimeout(1700); // bounded initial texture settling has completed
  const stationary = await canvas.evaluate((c) => c.toDataURL()),
    count = await page.evaluate(() => window.sceneTest.draws);
  await page.waitForTimeout(500);
  assert.equal(
    await canvas.evaluate((c) => c.toDataURL()),
    stationary,
    'Reduced motion has a static scene',
  );
  assert.equal(
    await page.evaluate(() => window.sceneTest.draws),
    count,
    'Reduced motion has no recurring canvas work',
  );
  assert.equal(
    await page
      .locator('#login .loginbox')
      .evaluate((el) => getComputedStyle(el, '::after').animationName),
    'none',
  );
  results.push({
    check: 'Reduced motion disables traffic and login CSS animation',
    status: 'pass',
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'true',
  );
  await page.evaluate(() => document.querySelector('#login').classList.add('hidden'));
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'false',
  );
  const hiddenCount = await page.evaluate(() => window.sceneTest.draws);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.sceneTest.draws), hiddenCount);
  await page.evaluate(() => document.querySelector('#login').classList.remove('hidden'));
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'true',
  );
  await page.waitForFunction((n) => window.sceneTest.draws > n, hiddenCount);
  results.push({ check: 'Hidden login stops rendering; returning login resumes', status: 'pass' });

  // An idle login must survive the pre-existing ten-second mission UI timer.
  await page.waitForTimeout(10200);
  assert.deepEqual(errors, [], 'Staying at login never calls uninitialized game UI');
  results.push({ check: 'Idle login survives mission countdown refresh', status: 'pass' });

  await page.locator('#lname').fill('Scene QA');
  await page.locator('#lpass').fill('test-only');
  await page.locator('#lbtn').click();
  await page.waitForFunction(
    () => window.G?.you && document.querySelector('#login').classList.contains('hidden'),
  );
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'false',
  );
  const gameCount = await page.evaluate(() => window.sceneTest.draws);
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(() => window.sceneTest.draws),
    gameCount,
    'Entering game leaves no running login renderer',
  );
  results.push({
    check: 'Real server registration/login and scene stopped during gameplay',
    status: 'pass',
  });
  assert.deepEqual(errors, [], 'No browser exceptions');
  assert.deepEqual(failedAssets, [], 'No failed artwork requests');
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify({ results, errors, failedAssets }, null, 2),
  );
  console.log(
    'Login scene: landmarks, six traffic variants/motion, DPR/resize, form interaction, reduced motion and lifecycle PASS',
  );
} finally {
  await cleanup(server, browser, log, dir);
}
