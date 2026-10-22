import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';

const out = evidenceDir('login-scene'),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-login-scene-')),
  port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
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
    window.sceneTest = {
      draws: 0,
      planetFrames: [],
      hubFrames: [],
      lightAlpha: [],
      lightBrightness: [],
      planetSizes: [],
      ships: {},
      motion: [],
      suppressReduceChange: false,
      suppressedEvents: 0,
      deliveredReduceEvents: 0,
    };
    window.loginMotionQueries = [];
    // Bounded causal evidence and a controlled reduced-motion delivery-loss fixture.
    const trace = (event, media = null) => {
      const canvas = document.querySelector('.login-scene');
      window.sceneTest.motion.push({
        event,
        now: performance.now(),
        matches: media?.matches,
        hidden: document.hidden,
        width: innerWidth,
        height: innerHeight,
        renderer: canvas ? { ...canvas.dataset } : null,
        draws: window.sceneTest.draws,
      });
      if (window.sceneTest.motion.length > 128) window.sceneTest.motion.shift();
    };
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = matchMedia(query);
      if (query.includes('prefers-reduced-motion')) {
        trace('query-created', media);
        window.loginMotionQueries.push(media);
        const add = media.addEventListener;
        add.call(media, 'change', () => {
          trace('media-change-before', media);
          setTimeout(() => trace('media-change-next-task', media), 0);
        });
        media.addEventListener = function (type, callback, options) {
          if (type === 'change') trace('change-listener-added', media);
          const observed =
            type === 'change'
              ? function (event) {
                  // Deterministic delivery-loss fixture: real media state/animation remain untouched.
                  if (event.matches && window.sceneTest.suppressReduceChange) {
                    window.sceneTest.suppressedEvents++;
                    trace('fixture-suppressed-reduce-change', media);
                    return;
                  }
                  if (event.matches) window.sceneTest.deliveredReduceEvents++;
                  return typeof callback === 'function'
                    ? callback.call(this, event)
                    : callback.handleEvent(event);
                }
              : callback;
          return add.call(this, type, observed, options);
        };
      }
      return media;
    };
    window.addEventListener('resize', () => trace('resize'));
    document.addEventListener('visibilitychange', () => trace('visibility'));

    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      let beaconPoint;
      if (this.canvas.classList.contains('login-scene')) {
        window.sceneTest.draws++;
        const source = args[0];
        if (
          source?.tagName === 'CANVAS' &&
          source !== document.querySelector('.login-scene') &&
          source.width === source.height &&
          args.length === 5
        ) {
          // Shared planet renderer produces a square canvas; sky fills the viewport.
          const pixels = source
            .getContext('2d')
            .getImageData(0, 0, source.width, source.height).data;
          let data = 2166136261;
          for (let i = 0; i < pixels.length; i += 13)
            data = Math.imul(data ^ pixels[i], 16777619) >>> 0;
          if (
            window.sceneTest.planetFrames.at(-1) !== data &&
            window.sceneTest.planetFrames.length < 8
          )
            window.sceneTest.planetFrames.push(data);
          window.sceneTest.planetHash = data;
          window.sceneTest.planetSizes.push(args[3]);
          if (window.sceneTest.planetSizes.length > 20) window.sceneTest.planetSizes.shift();
        }
        if (source?.src?.endsWith('/hub.png')) {
          window.sceneTest.hubFrames.push([args[1], args[2], this.globalAlpha]);
          if (window.sceneTest.hubFrames.length > 100) window.sceneTest.hubFrames.shift();
        }
        if (
          source?.tagName === 'CANVAS' &&
          source.width === 2160 &&
          this.globalCompositeOperation === 'lighter'
        ) {
          if (window.sceneTest.lightPixels === undefined) {
            const pixels = source
              .getContext('2d')
              .getImageData(0, 0, source.width, source.height).data;
            let count = 0;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
            window.sceneTest.lightPixels = count;
            const fs = source.width / 6;
            for (let y = 1; y < fs - 1 && !window.sceneTest.beacon; y++)
              for (let x = 1; x < fs - 1; x++) {
                const i = (y * source.width + x) * 4;
                if (
                  pixels[i] > 230 &&
                  pixels[i + 1] < 130 &&
                  pixels[i + 3] === 255 &&
                  pixels[i - 1] === 255 &&
                  pixels[i + 7] === 255
                ) {
                  window.sceneTest.beacon = { x, y };
                  break;
                }
              }
          }
          if (args[1] === 0 && args[2] === 0 && window.sceneTest.beacon) {
            const p = window.sceneTest.beacon;
            beaconPoint = this.getTransform().transformPoint({
              x: args[5] + ((p.x + 0.5) / args[3]) * args[7],
              y: args[6] + ((p.y + 0.5) / args[4]) * args[8],
            });
          }
          window.sceneTest.lightAlpha.push(this.globalAlpha);
          if (window.sceneTest.lightAlpha.length > 100) window.sceneTest.lightAlpha.shift();
        }
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
      const result = draw.apply(this, args);
      if (
        beaconPoint &&
        beaconPoint.x >= 0 &&
        beaconPoint.x < this.canvas.width &&
        beaconPoint.y >= 0 &&
        beaconPoint.y < this.canvas.height
      ) {
        const p = this.getImageData(
          Math.floor(beaconPoint.x),
          Math.floor(beaconPoint.y),
          1,
          1,
        ).data;
        window.sceneTest.lightBrightness.push(p[0] + p[1] + p[2]);
        if (window.sceneTest.lightBrightness.length > 100) window.sceneTest.lightBrightness.shift();
      }
      return result;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400 && /\/assets\//.test(r.url()))
      failedAssets.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(origin);
  assert.equal(await page.locator('#login .login-location').count(), 0);
  assert.doesNotMatch(
    await page.locator('#login').innerText(),
    /QUANTUM GATE|QUANTUM STATION · CONCORDIA/,
  );
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
  const animated = await page.evaluate(() => ({
    planetFrames: window.sceneTest.planetFrames.length,
    hubFrames: window.sceneTest.hubFrames,
    lightAlpha: window.sceneTest.lightAlpha,
    lightPixels: window.sceneTest.lightPixels,
    lightBrightness: window.sceneTest.lightBrightness,
    planetSizes: window.sceneTest.planetSizes,
  }));
  assert.ok(
    animated.planetFrames > 1,
    'Shared planet surface/cloud rendering changes, not just traffic',
  );
  assert.ok(
    new Set(animated.hubFrames.map((f) => f[2])).size > 2,
    'Actual hub animation cross-fades frames',
  );
  assert.ok(
    Math.max(...animated.lightAlpha) - Math.min(...animated.lightAlpha) > 0.1,
    'Actual asset beacon pixels pulse',
  );
  assert.ok(animated.lightPixels > 100, 'Pulse mask contains actual nontransparent station lamps');
  assert.ok(
    Math.max(...animated.lightBrightness) - Math.min(...animated.lightBrightness) > 20,
    'Actual displayed station lamp brightness changes',
  );
  // Compare disk diameter using the shared sprite geometry, independent of halo size.
  const planetGeometry = await page.evaluate(async () => {
    const { planetSprite } = await import('/planets.js');
    const { STELLARS } = await import('/shared/galaxy.js');
    const sprite = planetSprite(STELLARS.concordia, 0);
    const rect = document.querySelector('.login-scene').getBoundingClientRect();
    return { S: sprite.S, D: sprite.D, width: rect.width, height: rect.height };
  });
  const disk = (animated.planetSizes.at(-1) * planetGeometry.D) / planetGeometry.S;
  assert.ok(
    Math.abs(
      disk / (2 * Math.min(planetGeometry.width * 0.32, planetGeometry.height * 0.57)) - 0.7,
    ) < 0.001,
    `Planet disk is exactly 30% smaller: ${JSON.stringify({ disk, planetGeometry, sizes: animated.planetSizes })}`,
  );
  results.push({
    check:
      'Animated shared planet, animated hub asset, pulsing asset beacons, 30% smaller planet disk',
    status: 'pass',
    animated,
    disk,
  });
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
    const banner = await page.evaluate(() => {
      const box = document.querySelector('#login .loginbox');
      const s = getComputedStyle(box, '::before');
      // Pseudo-elements have no DOM rect: mirror the computed text style into a
      // measured inline probe, then compare its line box to the actual banner.
      const probe = document.createElement('span');
      probe.textContent = 'CAPTAIN’S LOG-IN';
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      probe.style.font = s.font;
      probe.style.letterSpacing = s.letterSpacing;
      box.append(probe);
      const text = probe.getBoundingClientRect();
      probe.remove();
      return {
        display: s.display,
        align: s.alignItems,
        height: parseFloat(s.height),
        paddingLeft: parseFloat(s.paddingLeft),
        textHeight: text.height,
        textWidth: text.width,
        width: box.clientWidth,
      };
    });
    assert.equal(banner.display, 'flex');
    assert.equal(banner.align, 'center');
    assert.equal(banner.height, 26);
    assert.equal(banner.paddingLeft, 30, 'horizontal title position unchanged');
    assert.ok(banner.textHeight < banner.height - 1, 'text fits banner vertically');
    assert.ok(banner.textWidth + banner.paddingLeft < banner.width, 'text not clipped');
    results.push({ check: 'centered login banner', status: 'pass', banner });
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
  for (const scale of [0.8, 1.4]) {
    await page.evaluate((scale) => {
      document.body.classList.add('scaled');
      document.documentElement.style.setProperty('--ui', scale);
    }, scale);
    const scaled = await page.locator('#login .loginbox').evaluate((e) => {
      const s = getComputedStyle(e, '::before'),
        r = e.getBoundingClientRect();
      return {
        center: s.alignItems,
        height: s.height,
        visible: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      };
    });
    assert.equal(scaled.center, 'center');
    assert.equal(scaled.visible, true);
    assert.ok(Math.abs(parseFloat(scaled.height) - 26) < 0.02, 'zoom subpixel rounding only');
    await page.screenshot({ path: path.join(out, 'banner-scale-' + scale + '.png') });
  }
  await page.evaluate(() => {
    document.body.classList.remove('scaled');
    document.documentElement.style.removeProperty('--ui');
  });
  await page.evaluate(() => {
    window.sceneTest.suppressReduceChange = true;
  });
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
  const fallback = await page.evaluate(() => ({
    matches: window.loginMotionQueries[0].matches,
    deliveries: window.sceneTest.deliveredReduceEvents,
    suppressed: window.sceneTest.suppressedEvents,
    width: document.querySelector('.login-scene').getBoundingClientRect().width,
    x: window.sceneTest.ships[703].last,
  }));
  assert.equal(fallback.matches, true, 'Actual production media query changed');
  assert.equal(fallback.deliveries, 0, 'No reduce callback was forwarded to production');
  const expectedX =
    0.12 * (fallback.width + 240) - 120 - 30 * Math.min(1.25, Math.max(0.6, fallback.width / 1440));
  assert.ok(
    Math.abs(fallback.x - expectedX) < 0.01,
    'Lost-event fallback repaints the independent phase-zero traffic pose',
  );
  results.push({
    check:
      'Reduced motion disables traffic and login CSS animation despite suppressed change delivery',
    fallback,
    status: 'pass',
  });
  await page.evaluate(() => {
    window.sceneTest.suppressReduceChange = false;
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
  // Shared planet caches/budgets must also animate after the gameplay renderer used them.
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.locator('#lname').evaluate((e) => e.blur());
  await page.keyboard.press('Escape');
  await page.locator('#quitconfirm').click();
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'true',
  );
  const returnedPlanet = await page.evaluate(() => window.sceneTest.planetHash);
  await page.waitForFunction((hash) => window.sceneTest.planetHash !== hash, returnedPlanet);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => document.querySelector('.login-scene').dataset.running === 'false',
  );
  await page.waitForTimeout(1700);
  const returnedStatic = await canvas.evaluate((c) => c.toDataURL());
  await page.waitForTimeout(500);
  assert.equal(
    await canvas.evaluate((c) => c.toDataURL()),
    returnedStatic,
    'Reduced motion also stable after gameplay',
  );
  results.push({
    check:
      'Actual logout resumes animated shared planet; reduced motion still static after gameplay',
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
} catch (error) {
  const pages = [];
  for (const context of browser?.contexts() || []) {
    for (const page of context.pages()) {
      pages.push(
        await page
          .evaluate(() => ({
            url: location.href,
            visibility: document.visibilityState,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            originalQueries: window.loginMotionQueries?.map((q) => ({
              media: q.media,
              matches: q.matches,
            })),
            renderer: { ...document.querySelector('.login-scene')?.dataset },
            scene: window.sceneTest,
          }))
          .catch((snapshotError) => ({ snapshotError: String(snapshotError) })),
      );
    }
  }
  fs.writeFileSync(
    path.join(out, 'failure-state.json'),
    JSON.stringify(
      {
        error: String(error?.stack || error),
        node: process.version,
        browser: browser?.version(),
        errors,
        failedAssets,
        completed: results,
        pages,
      },
      null,
      2,
    ),
  );
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
