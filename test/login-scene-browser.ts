import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
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
} from './helpers/browser-fixture.ts';

const output = evidenceDir('login-scene'),
  directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-login-scene-')),
  port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '',
    PORT: String(port),
    DATA_DIR: directory,
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
const errors: string[] = [],
  failedAssets: string[] = [],
  results = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'],
  });
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
    const trace = (event: string, media: MediaQueryList | null = null) => {
      const canvas = document.querySelector<HTMLElement>('.login-scene');
      window.sceneTest.motion.push({
        event,
        now: performance.now(),
        matches: media?.matches,
        hidden: document.hidden,
        width: innerWidth,
        height: innerHeight,
        renderer: canvas ? Object.assign({}, canvas.dataset) : null,
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
        const addListener = Reflect.get(media, 'addEventListener') as typeof media.addEventListener;
        addListener.call(media, 'change', () => {
          trace('media-change-before', media);
          setTimeout(() => trace('media-change-next-task', media), 0);
        });
        media.addEventListener = function (
          this: MediaQueryList,
          type: string,
          callback: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions,
        ) {
          if (type === 'change') trace('change-listener-added', media);
          const observed =
            type === 'change'
              ? function (this: MediaQueryList, event: Event) {
                  // Deterministic delivery-loss fixture: real media state/animation remain untouched.
                  if (
                    (event as MediaQueryListEvent).matches &&
                    window.sceneTest.suppressReduceChange
                  ) {
                    window.sceneTest.suppressedEvents++;
                    trace('fixture-suppressed-reduce-change', media);
                    return;
                  }
                  if ((event as MediaQueryListEvent).matches)
                    window.sceneTest.deliveredReduceEvents++;
                  return typeof callback === 'function'
                    ? callback.call(this, event)
                    : callback.handleEvent(event);
                }
              : callback;
          return addListener.call(this, type, observed, options);
        };
      }
      return media;
    };
    window.addEventListener('resize', () => trace('resize'));
    document.addEventListener('visibilitychange', () => trace('visibility'));

    const draw = Reflect.get(
      CanvasRenderingContext2D.prototype,
      'drawImage',
    ) as typeof CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      ...args: [CanvasImageSource, ...number[]]
    ) {
      let beaconPoint;
      if (this.canvas.classList.contains('login-scene')) {
        window.sceneTest.draws++;
        const source = args[0];
        if (
          (source as HTMLCanvasElement)?.tagName === 'CANVAS' &&
          source !== document.querySelector<HTMLElement>('.login-scene') &&
          (source as HTMLCanvasElement).width === (source as HTMLCanvasElement).height &&
          args.length === 5
        ) {
          // Shared planet renderer produces a square canvas; sky fills the viewport.
          const pixels = (source as HTMLCanvasElement)
            .getContext('2d')!
            .getImageData(
              0,
              0,
              (source as HTMLCanvasElement).width,
              (source as HTMLCanvasElement).height,
            ).data;
          let data = 2166136261;
          for (let index = 0; index < pixels.length; index += 13)
            data = Math.imul(data ^ pixels[index], 16777619) >>> 0;
          if (
            window.sceneTest.planetFrames.at(-1) !== data &&
            window.sceneTest.planetFrames.length < 8
          )
            window.sceneTest.planetFrames.push(data);
          window.sceneTest.planetHash = data;
          window.sceneTest.planetSizes.push(args[3]);
          if (window.sceneTest.planetSizes.length > 20) window.sceneTest.planetSizes.shift();
        }
        if ((source as HTMLImageElement)?.src?.endsWith('/hub.png')) {
          window.sceneTest.hubFrames.push([args[1], args[2], this.globalAlpha]);
          if (window.sceneTest.hubFrames.length > 100) window.sceneTest.hubFrames.shift();
        }
        if (
          (source as HTMLCanvasElement)?.tagName === 'CANVAS' &&
          (source as HTMLCanvasElement).width === 2160 &&
          this.globalCompositeOperation === 'lighter'
        ) {
          if (window.sceneTest.lightPixels === undefined) {
            const pixels = (source as HTMLCanvasElement)
              .getContext('2d')!
              .getImageData(
                0,
                0,
                (source as HTMLCanvasElement).width,
                (source as HTMLCanvasElement).height,
              ).data;
            let count = 0;
            for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) count++;
            window.sceneTest.lightPixels = count;
            const frameSize = (source as HTMLCanvasElement).width / 6;
            for (
              let verticalPosition = 1;
              verticalPosition < frameSize - 1 && !window.sceneTest.beacon;
              verticalPosition++
            )
              for (
                let horizontalPosition = 1;
                horizontalPosition < frameSize - 1;
                horizontalPosition++
              ) {
                const index =
                  (verticalPosition * (source as HTMLCanvasElement).width + horizontalPosition) * 4;
                if (
                  pixels[index] > 230 &&
                  pixels[index + 1] < 130 &&
                  pixels[index + 3] === 255 &&
                  pixels[index - 1] === 255 &&
                  pixels[index + 7] === 255
                ) {
                  window.sceneTest.beacon = { x: horizontalPosition, y: verticalPosition };
                  break;
                }
              }
          }
          if (args[1] === 0 && args[2] === 0 && window.sceneTest.beacon) {
            const player = window.sceneTest.beacon;
            beaconPoint = this.getTransform().transformPoint({
              x: args[5] + ((player.x + 0.5) / args[3]) * args[7],
              y: args[6] + ((player.y + 0.5) / args[4]) * args[8],
            });
          }
          window.sceneTest.lightAlpha.push(this.globalAlpha);
          if (window.sceneTest.lightAlpha.length > 100) window.sceneTest.lightAlpha.shift();
        }
        const source2 = (args[0] as HTMLImageElement)?.src || '',
          match = source2.match(/ships\/(\d+)\.webp/);
        if (match) {
          const identifier = match[1],
            horizontalPosition2 = args[5],
            verticalPosition2 = args[6];
          const seen = (window.sceneTest.ships[identifier] ||= {
            first: horizontalPosition2,
            last: horizontalPosition2,
            visible: false,
          });
          seen.last = horizontalPosition2;
          seen.visible ||=
            horizontalPosition2 >= 0 &&
            verticalPosition2 >= 0 &&
            horizontalPosition2 + args[7] <= innerWidth &&
            verticalPosition2 + args[8] <= innerHeight;
        }
      }
      const result = Reflect.apply(draw, this, args);
      if (
        beaconPoint &&
        beaconPoint.x >= 0 &&
        beaconPoint.x < this.canvas.width &&
        beaconPoint.y >= 0 &&
        beaconPoint.y < this.canvas.height
      ) {
        const player = this.getImageData(
          Math.floor(beaconPoint.x),
          Math.floor(beaconPoint.y),
          1,
          1,
        ).data;
        window.sceneTest.lightBrightness.push(player[0] + player[1] + player[2]);
        if (window.sceneTest.lightBrightness.length > 100) window.sceneTest.lightBrightness.shift();
      }
      return result;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (event2) => errors.push(event2.stack || String(event2)));
  page.on('response', (result) => {
    if (result.status() >= 400 && /\/assets\//.test(result.url()))
      failedAssets.push(`${result.status()} ${result.url()}`);
  });
  await page.goto(origin);
  // Read without Playwright's evaluation gesture: blocked music must hold traffic still.
  const session = await context.newCDPSession(page);
  const blocked = await session.send('Runtime.evaluate', {
    expression: `(async () => {
      const audio = await import('/audio.js');
      const deadline = performance.now() + 15000;
      while (document.querySelector('.login-scene')?.dataset.ready !== 'true') {
        if (performance.now() >= deadline) throw Error('Login artwork did not become ready');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const before = Object.fromEntries(Object.entries(window.sceneTest.ships)
        .map(([hull, ship]) => [hull, ship.last]));
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        activated: navigator.userActivation.hasBeenActive,
        timeline: audio.loginMusicTimeline(),
        before,
        after: Object.fromEntries(Object.entries(window.sceneTest.ships)
          .map(([hull, ship]) => [hull, ship.last])),
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  assert.equal(blocked.exceptionDetails, undefined, 'Blocked-autoplay observation completed');
  const blockedState = blocked.result.value;
  assert.equal(blockedState.activated, false, 'No gesture before the blocked-autoplay check');
  assert.equal(blockedState.timeline.playing, false);
  assert.equal(blockedState.timeline.position, 0);
  assert.equal(Object.keys(blockedState.before).length, 6);
  assert.deepEqual(blockedState.after, blockedState.before, 'Blocked music holds traffic still');
  results.push({ check: 'Blocked autoplay holds traffic at its initial pose', status: 'pass' });
  await session.detach();
  await page.locator('#lname').click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLElement>('.login-scene');
    return canvas?.dataset.trackPlaying === 'true' && Number(canvas.dataset.trackPosition) > 0;
  });
  assert.equal(await page.locator('#login .login-location').count(), 0);
  assert.doesNotMatch(
    await page.locator('#login').innerText(),
    /QUANTUM GATE|QUANTUM STATION · CONCORDIA/,
  );
  const canvas = page.locator('.login-scene');
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')?.dataset.ready === 'true',
  );
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')?.dataset.planetReady === 'true',
  );
  const identity = await canvas.evaluate((element2) => Object.assign({}, element2.dataset));
  assert.equal(identity.system, 'qgate');
  assert.equal(identity.station, 'qstation');
  assert.equal(identity.planet, 'concordia');
  assert.equal(identity.running, 'true');
  await page.screenshot({ path: path.join(output, 'desktop-start.png') });
  const first = await canvas.evaluate((element3) => (element3 as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(1400);
  assert.notEqual(
    await canvas.evaluate((element4) => (element4 as HTMLCanvasElement).toDataURL()),
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
    new Set(animated.hubFrames.map((feature) => feature[2])).size > 2,
    'Actual hub animation cross-fades frames',
  );
  assert.ok(
    Math.max(...animated.lightAlpha) - Math.min(...animated.lightAlpha) > 0.1,
    'Actual asset beacon pixels pulse',
  );
  assert.ok(animated.lightPixels! > 100, 'Pulse mask contains actual nontransparent station lamps');
  assert.ok(
    Math.max(...animated.lightBrightness) - Math.min(...animated.lightBrightness) > 20,
    'Actual displayed station lamp brightness changes',
  );
  // Compare disk diameter using the shared sprite geometry, independent of halo size.
  const planetGeometry = await page.evaluate(async () => {
    const { planetSprite } = await import('/planets.js');
    const { STELLARS } = await import('/shared/galaxy.js');
    const sprite = planetSprite(STELLARS.concordia, 0);
    const rect = document.querySelector<HTMLElement>('.login-scene')!.getBoundingClientRect();
    return { S: sprite!.S, D: sprite!.D, width: rect.width, height: rect.height };
  });
  const disk = (animated.planetSizes.at(-1)! * planetGeometry.D) / planetGeometry.S;
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
  await page.screenshot({ path: path.join(output, 'desktop-traffic.png') });
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
      const element5 = document.querySelector<HTMLElement>('.login-scene');
      return (
        (element5! as HTMLCanvasElement).width ===
        Math.round(element5!.getBoundingClientRect().width * Math.min(devicePixelRatio, 2))
      );
    });
    const layout = await page.evaluate(() => {
      const element6 = document.querySelector<HTMLElement>('.login-scene'),
        result = element6!.getBoundingClientRect(),
        secondCaptain = document.querySelector<HTMLElement>('#lbtn')!.getBoundingClientRect();
      return {
        width: (element6! as HTMLCanvasElement).width,
        height: (element6! as HTMLCanvasElement).height,
        cssWidth: result.width,
        cssHeight: result.height,
        overflow: document.documentElement.scrollWidth > innerWidth,
        formOnscreen:
          secondCaptain.left >= 0 &&
          secondCaptain.right <= innerWidth &&
          secondCaptain.top >= 0 &&
          secondCaptain.bottom <= innerHeight,
        clickable:
          document.elementFromPoint(
            secondCaptain.x + secondCaptain.width / 2,
            secondCaptain.y + secondCaptain.height / 2,
          )?.id === 'lbtn',
      };
    });
    const banner = await page.evaluate(() => {
      const boundingBox = document.querySelector<HTMLElement>('#login .loginbox');
      const session = getComputedStyle(boundingBox!, '::before');
      // Pseudo-elements have no DOM rect: mirror the computed text style into a
      // measured inline probe, then compare its line box to the actual banner.
      const probe = document.createElement('span');
      probe.textContent = 'CAPTAIN’S LOG-IN';
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      probe.style.font = session.font;
      probe.style.letterSpacing = session.letterSpacing;
      boundingBox!.append(probe);
      const text = probe.getBoundingClientRect();
      probe.remove();
      return {
        display: session.display,
        align: session.alignItems,
        height: parseFloat(session.height),
        paddingLeft: parseFloat(session.paddingLeft),
        textHeight: text.height,
        textWidth: text.width,
        width: boundingBox!.clientWidth,
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
    await page.screenshot({ path: path.join(output, `viewport-${width}.png`) });
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
      document.documentElement.style.setProperty('--ui', String(scale));
    }, scale);
    const scaled = await page.locator('#login .loginbox').evaluate((entity) => {
      const session = getComputedStyle(entity, '::before'),
        result = entity.getBoundingClientRect();
      return {
        center: session.alignItems,
        height: session.height,
        visible:
          result.left >= 0 &&
          result.right <= innerWidth &&
          result.top >= 0 &&
          result.bottom <= innerHeight,
      };
    });
    assert.equal(scaled.center, 'center');
    assert.equal(scaled.visible, true);
    assert.ok(Math.abs(parseFloat(scaled.height) - 26) < 0.02, 'zoom subpixel rounding only');
    await page.screenshot({ path: path.join(output, 'banner-scale-' + scale + '.png') });
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
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'false',
  );
  await page.waitForTimeout(1700); // bounded initial texture settling has completed
  const stationary = await canvas.evaluate((element7) =>
      (element7 as HTMLCanvasElement).toDataURL(),
    ),
    count = await page.evaluate(() => window.sceneTest.draws);
  await page.waitForTimeout(500);
  assert.equal(
    await canvas.evaluate((element8) => (element8 as HTMLCanvasElement).toDataURL()),
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
      .evaluate((element) => getComputedStyle(element, '::after').animationName),
    'none',
  );
  const fallback = await page.evaluate(() => ({
    matches: window.loginMotionQueries[0].matches,
    deliveries: window.sceneTest.deliveredReduceEvents,
    suppressed: window.sceneTest.suppressedEvents,
    width: document.querySelector<HTMLElement>('.login-scene')!.getBoundingClientRect().width,
    x: window.sceneTest.ships[703].last,
  }));
  assert.equal(fallback.matches, true, 'Actual production media query changed');
  assert.equal(fallback.deliveries, 0, 'No reduce callback was forwarded to production');
  const expectedX =
    0.12 * (fallback.width + 240) - 120 - 16 * Math.min(1.25, Math.max(0.6, fallback.width / 1440));
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
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'true',
  );
  await page.evaluate(() => document.querySelector<HTMLElement>('#login')!.classList.add('hidden'));
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'false',
  );
  const hiddenCount = await page.evaluate(() => window.sceneTest.draws);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.sceneTest.draws), hiddenCount);
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#login')!.classList.remove('hidden'),
  );
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'true',
  );
  await page.waitForFunction((quantity) => window.sceneTest.draws > quantity, hiddenCount);
  results.push({ check: 'Hidden login stops rendering; returning login resumes', status: 'pass' });

  // An idle login must survive the pre-existing ten-second mission UI timer.
  await page.waitForTimeout(10200);
  assert.deepEqual(errors, [], 'Staying at login never calls uninitialized game UI');
  results.push({ check: 'Idle login survives mission countdown refresh', status: 'pass' });

  await page.locator('#lname').fill('Scene QA');
  await page.locator('#lpass').fill('test-only');
  await page.locator('#lbtn').click();
  await page.waitForFunction(
    () =>
      window.G?.you && document.querySelector<HTMLElement>('#login')!.classList.contains('hidden'),
  );
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'false',
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
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('#lname').evaluate((entity) => entity.blur());
  await page.keyboard.press('Escape');
  await page.locator('#quitconfirm').click();
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'true',
  );
  const returnedPlanet = await page.evaluate(() => window.sceneTest.planetHash);
  await page.waitForFunction((hash) => window.sceneTest.planetHash !== hash, returnedPlanet);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')!.dataset.running === 'false',
  );
  await page.waitForTimeout(1700);
  const returnedStatic = await canvas.evaluate((element9) =>
    (element9 as HTMLCanvasElement).toDataURL(),
  );
  await page.waitForTimeout(500);
  assert.equal(
    await canvas.evaluate((element10) => (element10 as HTMLCanvasElement).toDataURL()),
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
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
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
            originalQueries: window.loginMotionQueries?.map((pendingSystemIds) => ({
              media: pendingSystemIds.media,
              matches: pendingSystemIds.matches,
            })),
            renderer: Object.assign(
              {},
              document.querySelector<HTMLElement>('.login-scene')?.dataset,
            ),
            scene: window.sceneTest,
          }))
          .catch((snapshotError) => ({ snapshotError: String(snapshotError) })),
      );
    }
  }
  fileSystem.writeFileSync(
    path.join(output, 'failure-state.json'),
    JSON.stringify(
      {
        error: String((error as Error)?.stack || error),
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
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
