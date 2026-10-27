import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';

import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('cockpit');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: Number(process.env.COCKPIT_TEST_DPR || 1),
  });
  const errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.cockpitSocket = this;
      }
    };
    window.cockpitText = [];
    const draw = Reflect.get(
      CanvasRenderingContext2D.prototype,
      'fillText',
    ) as typeof CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (text === 'Mining Alpha' || text === 'Ready to follow.') {
        window.cockpitText.push({ text, font: this.font });
        if (window.cockpitText.length > 200) window.cockpitText.shift();
      }
      return draw.call(this, text, ...args);
    };
  });
  await page.goto(feature.origin);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('16px "Pixelify Sans"')), true);
  assert.equal(
    await page.evaluate(
      () => [...document.fonts].find((font) => font.family.includes('Pixelify Sans'))?.status,
    ),
    'loaded',
  );
  assert.match(
    await page.locator('#lname').evaluate((element) => getComputedStyle(element).fontFamily),
    /Pixelify Sans/,
  );
  assert.equal(
    await page.locator('#login .login-scene').count(),
    1,
    'Original animated login scene remains',
  );
  assert.equal(
    await page.locator('#login .splash-title').getAttribute('src'),
    'assets/ui/title-31.png',
  );
  await page.locator('.splash-title').evaluate((image2) => (image2 as HTMLImageElement).decode());
  for (const [width, height] of [
    [1440, 1000],
    [640, 700],
    [640, 480],
  ]) {
    await page.setViewportSize({ width, height });
    const logo = await page.locator('.splash-title').boundingBox();
    const panel = await page.locator('#login .loginbox').boundingBox();
    assert.ok(logo!.x >= 0 && logo!.x + logo!.width <= width);
    assert.ok(logo!.y + logo!.height <= panel!.y, 'Title is above, outside login HUD');
    assert.equal(await page.locator('#login .loginbox .splash-title').count(), 0);
    const enter = await page.locator('#lbtn').boundingBox();
    assert.ok(
      enter!.y >= 0 && enter!.y + enter!.height <= height,
      'Login action remains in viewport',
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('.splash-title')
      .evaluate((element2) => getComputedStyle(element2).animationName),
    'none',
  );
  assert.equal(
    await page
      .locator('.title-lightning path')
      .evaluate((element3) => getComputedStyle(element3).animationName),
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(
    await page
      .locator('.title-lightning path')
      .evaluate((element4) => getComputedStyle(element4).animationName),
    'electric-trace',
  );
  const lightning = await page.locator('.title-lightning path').evaluate((element5) => {
    const firstCaptain = element5.getAnimations()[0];
    firstCaptain.pause();
    firstCaptain.currentTime = 3500;
    const first = getComputedStyle(element5).strokeDashoffset;
    firstCaptain.currentTime = 4100;
    const second = getComputedStyle(element5).strokeDashoffset;
    firstCaptain.play();
    return { first, second };
  });
  assert.notEqual(
    lightning.first,
    lightning.second,
    'Electric accents trace independently of logo',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(feature.out, 'login.png') });
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await page
      .locator('.title-lightning path')
      .evaluate((element6) => getComputedStyle(element6).animationPlayState),
    'paused',
  );
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  const land = await page.locator('#landpic').evaluate((element7) => ({
    image: element7.style.backgroundImage,
    border: getComputedStyle(element7).borderTopWidth,
    scan: getComputedStyle(element7, '::after').backgroundImage,
  }));
  assert.ok(
    /assets\/|blob:|data:image/.test(land.image),
    'Landed artwork remains selected by production renderer',
  );
  assert.equal(land.border, '3px');
  assert.match(land.scan, /repeating-linear-gradient/);
  await page.screenshot({ path: path.join(feature.out, 'landing.png') });
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const initialPixels = await page.locator('#view').evaluate((canvas) => ({
    width: (canvas as HTMLCanvasElement).width,
    height: (canvas as HTMLCanvasElement).height,
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    dpr: devicePixelRatio,
  }));
  assert.equal(
    initialPixels.width,
    initialPixels.cssWidth * initialPixels.dpr,
    'First login has correct backing width before any resize event',
  );
  assert.equal(
    initialPixels.height,
    initialPixels.cssHeight * initialPixels.dpr,
    'First login has correct backing height before any resize event',
  );
  assert.equal(await page.locator('#functiondock > button').count(), 9);
  assert.equal(await page.locator('#cbkeys').count(), 0, 'No redundant Keys button');
  assert.equal(await page.locator('#traytoggle').getAttribute('aria-expanded'), 'false');
  await page.waitForFunction(() =>
    window.cockpitText.some((textCall) => textCall.text === 'Mining Alpha'),
  );
  assert.ok(
    await page.evaluate(() =>
      window.cockpitText
        .filter((textCall2) => textCall2.text === 'Mining Alpha')
        .every((textCall3) => textCall3.font.includes('Pixelify Sans')),
    ),
  );
  await page.evaluate(async () => {
    const { receiveShipChat } = await import('/chat_bubbles.js');
    receiveShipChat(G, { ch: 'sys', sys: G.sys, ship: G.myId, msg: 'Ready to follow.' });
  });
  await page.waitForFunction(() =>
    window.cockpitText.some((textCall4) => textCall4.text === 'Ready to follow.'),
  );
  assert.ok(
    await page.evaluate(() =>
      window.cockpitText
        .filter((textCall5) => textCall5.text === 'Ready to follow.')
        .every((textCall6) => textCall6.font.includes('Pixelify Sans')),
    ),
  );
  await page.click('#cbmap');
  assert.equal(
    await page.locator('#gmap').isVisible(),
    true,
    'Dock Map icon opens the real galaxy map',
  );
  await page.click('#cbmap');
  assert.equal(await page.locator('#gmap').isVisible(), false);
  await page.click('#hailindicator');
  assert.equal(
    await page.locator('#hailbox').isVisible(),
    true,
    'Dock Hail icon opens the real inbox even when empty',
  );
  await page.locator('#hailopts').getByText('CLOSE', { exact: true }).click();
  // Actual pointer drag, persisted preference, scale-invariant maximum and temporary viewport shrink.
  await page.click('#traytoggle');
  assert.equal(Math.round((await page.locator('#hud').boundingBox())!.width), 520);
  assert.match(await page.locator('#commsheader').innerText(), /COMMS \/ MERIDIAN SECTOR/);
  assert.equal(await page.locator('#consoleutilities .utility-label').count(), 3);
  for (const scale of [0.8, 1, 1.4]) {
    await page.evaluate((session) => {
      document.documentElement.style.setProperty('--ui', String(session));
      document.body.classList.toggle('scaled', session !== 1);
    }, scale);
    const grip = await page.locator('#hudgrip').boundingBox();
    await page.mouse.move(grip!.x + 2, grip!.y + 40);
    await page.mouse.down();
    await page.mouse.move(200, grip!.y + 40, { steps: 6 });
    await page.mouse.up();
    assert.ok(
      Math.abs((await page.locator('#hud').boundingBox())!.width - 760) < 1,
      'Live drag reaches the original maximum at every UI scale',
    );
  }
  // The expanded Tray owns the lower-right corner at every supported scale.
  for (const width of [1600, 1440, 1024, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const scale of [0.8, 1, 1.4])
      for (const tray of [
        Math.min(520 * Math.max(1, scale), width * 0.6),
        Math.min(760, width * 0.6),
      ]) {
        await page.evaluate(
          ({ scale, tray }) => {
            document.documentElement.style.setProperty('--ui', String(scale));
            document.documentElement.style.setProperty('--tray-width', tray + 'px');
            document.body.classList.toggle('scaled', scale !== 1);
          },
          { scale, tray },
        );
        const flightHud = await page.locator('#hud').boundingBox();
        const cockpit = await page.locator('#cockpit').boundingBox();
        assert.ok(
          Math.abs(flightHud!.y + flightHud!.height - 1000) < 1,
          'Tray extends to the bottom',
        );
        assert.ok(
          cockpit!.x + cockpit!.width <= flightHud!.x + 1,
          'Cockpit excludes actual Tray width',
        );
        for (const identifier of ['cbvol', 'optbtn', 'cbhelp']) {
          const target = page.locator('#' + identifier);
          assert.equal(await target.count(), 1);
          await target.scrollIntoViewIfNeeded();
          const secondCaptain = await target.boundingBox();
          assert.ok(
            secondCaptain!.x >= 0 &&
              secondCaptain!.x + secondCaptain!.width <= flightHud!.x + 1 &&
              secondCaptain!.y >= cockpit!.y &&
              secondCaptain!.y + secondCaptain!.height <= 1001,
            identifier + ' reachable outside Tray',
          );
        }
        const chat = await page.locator('#consolechat').boundingBox(),
          utility = await page.locator('#consoleutilities').boundingBox();
        assert.ok(
          (utility!.x >= chat!.x + chat!.width - 1 && utility!.x - chat!.x - chat!.width <= 100) ||
            utility!.y >= chat!.y + chat!.height - 1,
          'Utilities occupy their own track beside or below chat without overlap',
        );
        const dock = await page.locator('#functiondock').boundingBox();
        if (width <= 1250)
          assert.ok(
            [chat!, utility!].every(
              (group) =>
                dock!.y >= group.y + group.height - 1 || group.y >= dock!.y + dock!.height - 1,
            ),
            'Stacked function housing cannot overlap COMMS or utilities: ' +
              JSON.stringify({ width, scale, tray, dock, chat, utility }),
          );
        await page.locator('#functiondock').scrollIntoViewIfNeeded();
        if (scale === 1 && tray === Math.min(520, width * 0.6))
          await page.screenshot({
            path: path.join(feature.out, 'expanded-column-' + width + '.png'),
          });
      }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.style.setProperty('--tray-width', '760px'));
  // Reload in a fresh context seeded only with the captured saved settings.
  const storage = await page.context().storageState();
  const restored = await browser.newContext({
    storageState: storage,
    viewport: { width: 1440, height: 1000 },
  });
  const restoredPage = await restored.newPage();
  await restoredPage.goto(feature.origin);
  assert.equal(
    await restoredPage.evaluate(() =>
      document.documentElement.style.getPropertyValue('--tray-width'),
    ),
    '760px',
  );
  await restored.close();
  await page.setViewportSize({ width: 800, height: 700 });
  assert.ok(
    Math.abs((await page.locator('#hud').boundingBox())!.width - 480) < 1,
    'Viewport shrink bounds existing preference to 60vw',
  );
  assert.equal(
    await page.evaluate(() => Number(localStorage.getItem('rift.hud'))),
    760,
    'Temporary shrink preserves preferred width',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.ok(Math.abs((await page.locator('#hud').boundingBox())!.width - 760) < 1);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--tray-width');
    document.documentElement.style.setProperty('--ui', '1');
    document.body.classList.remove('scaled');
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(
    Math.round((await page.locator('#hud').boundingBox())!.width),
    520,
    'Compact default fits the complete menu row',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#traytoggle');
  // The normal inbound marker renderer remains literal and fits the real flight viewport.
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() =>
      cockpitSocket.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            t: 'hailmark',
            x: G.view!.rx + 1e6,
            y: G.view!.ry + 1e6,
            label: '<b>Wing Two</b> ready',
            until: Date.now() + 5000,
          }),
        }),
      ),
    );
    await page.waitForSelector('#hailmarker:not(.hidden)');
    // Marker layout runs in its animation frame; a previous visible marker is
    // not evidence that the resized viewport has been processed yet.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const marker = await page.locator('#hailmarker').boundingBox();
    const view = await page.locator('#view').boundingBox();
    assert.ok(
      marker!.x >= 0 &&
        marker!.y >= 0 &&
        marker!.x + marker!.width <= view!.width &&
        marker!.y + marker!.height <= view!.height,
      'Framed incoming hail stays within the visible flight area even at offscreen coordinates: ' +
        JSON.stringify({ marker, view, width }),
    );
    assert.equal(await page.locator('#hailmarker b').count(), 0, 'Marker labels stay plain text');
    if (width === 1440) {
      await page.click('#cbmap');
      assert.equal(
        await page.locator('#hailmarker').isVisible(),
        false,
        'Flight marker cannot cover the galaxy-map modal',
      );
      await page.click('#cbmap');
      assert.equal(
        await page.locator('#hailmarker').isVisible(),
        true,
        'Unexpired marker returns when the modal closes',
      );
    }
    assert.match(
      await page.locator('#hailmarker .hail-marker-body').innerText(),
      /<b>Wing Two<\/b>/,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const layouts = [];
  for (const [width, height, scale] of [
    [1440, 1000, 1],
    [1024, 768, 1.4],
    [640, 480, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => {
      G.opts.scale = scale;
      document.documentElement.style.setProperty('--ui', String(scale));
      document.body.classList.toggle('scaled', scale !== 1);
      dispatchEvent(new Event('resize'));
    }, scale);
    const rects = await page.evaluate(() => {
      const resolve2 = (identifier: string) =>
        document.getElementById(identifier)!.getBoundingClientRect().toJSON();
      return {
        cockpit: resolve2('cockpit'),
        trim: resolve2('traytrim'),
        chat: resolve2('consolechat'),
        dock: resolve2('functiondock'),
        canvas: resolve2('view'),
        backing: {
          width: (document.getElementById('view')! as HTMLCanvasElement).width,
          height: (document.getElementById('view')! as HTMLCanvasElement).height,
          dpr: devicePixelRatio,
        },
      };
    });
    if (width === 1440)
      assert.ok(
        rects.chat.left >= rects.dock.right && rects.chat.right <= rects.cockpit.right,
        'Desktop chat occupies the available center track beside the function dock',
      );
    assert.ok(
      Math.abs(rects.backing.width - rects.canvas.width * rects.backing.dpr) < 1,
      'Flight backing width matches CSS pixels',
    );
    assert.ok(
      Math.abs(rects.backing.height - rects.canvas.height * rects.backing.dpr) < 1,
      'Flight backing height matches CSS pixels without stretching original sprites',
    );
    assert.equal(rects.trim.right, width);
    assert.equal(rects.trim.height, height);
    assert.equal(rects.cockpit.bottom, height);
    assert.ok(
      rects.chat.left >= rects.dock.right ||
        rects.chat.bottom <= rects.dock.top ||
        rects.dock.bottom <= rects.chat.top,
      'Dock does not cover chat',
    );
    assert.ok(rects.canvas.bottom <= rects.cockpit.top + 1, 'Console does not cover flight view');
    await page.locator('#traytoggle').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#traytoggle').getAttribute('aria-expanded'), 'true');
    assert.equal(
      await page.locator('#hud').evaluate((element8) => (element8 as HTMLElement).inert),
      false,
    );
    if (width === 1440) {
      await page.evaluate(() =>
        document.documentElement.style.setProperty('--tray-width', '520px'),
      );
      const hudBefore = await page.locator('#hud').boundingBox();
      const grip = await page.locator('#hudgrip').boundingBox();
      await page.mouse.move(grip!.x + 2, grip!.y + 40);
      await page.mouse.down();
      await page.mouse.move(grip!.x - 38, grip!.y + 40, { steps: 4 });
      await page.mouse.up();
      const hudAfter = await page.locator('#hud').boundingBox();
      assert.ok(
        hudAfter!.width >= hudBefore!.width + 30,
        'Embedded trim does not block actual sidebar resize drag: ' +
          JSON.stringify({
            hudBefore,
            hudAfter,
            grip,
            drag: await page.locator('#hudgrip').getAttribute('class'),
            hit: await page.evaluate(
              ({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 150),
              { x: grip!.x + 2, y: grip!.y + 40 },
            ),
          }),
      );
      const savedWidth = await page.evaluate(() => Number(localStorage.getItem('rift.hud')));
      assert.ok(Math.abs(savedWidth - hudAfter!.width) < 1, 'Drag persists the actual tray width');
    }
    await page.locator('#ctabs button[data-tab="log"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ctabs button[data-tab="log"]').getAttribute('class'), 'on');
    await page.screenshot({ path: path.join(feature.out, `tray-${width}-${scale}.png`) });
    await page.click('#traytoggle');
    assert.equal(
      await page.locator('#hud').evaluate((element9) => (element9 as HTMLElement).inert),
      true,
    );
    await page.locator('#combatindicator').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#combatcontrols').isVisible(), true);
    await page.locator('[aria-label="Close combat controls"]').click();
    assert.equal(await page.locator('#combatcontrols').isVisible(), false);
    await page.screenshot({ path: path.join(feature.out, `flight-${width}-${scale}.png`) });
    layouts.push({ width, height, scale, ...rects });
  }
  fileSystem.writeFileSync(
    path.join(feature.out, 'layouts.json'),
    JSON.stringify(layouts, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    'Cockpit font, original login/landed artwork, ship-name/chat typography, nine buttons plus attention status, connected tray, keyboard/tab/popup reachability and narrow/scaled layout passed.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
