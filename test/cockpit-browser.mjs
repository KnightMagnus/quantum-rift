import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await miningFixture('cockpit');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: Number(process.env.COCKPIT_TEST_DPR || 1),
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.cockpitText = [];
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (text === 'Mining Alpha' || text === 'Ready to follow.') {
        window.cockpitText.push({ text, font: this.font });
        if (window.cockpitText.length > 200) window.cockpitText.shift();
      }
      return draw.call(this, text, ...args);
    };
  });
  await page.goto(f.origin);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('16px "Pixelify Sans"')), true);
  assert.equal(
    await page.evaluate(
      () => [...document.fonts].find((font) => font.family.includes('Pixelify Sans'))?.status,
    ),
    'loaded',
  );
  assert.match(
    await page.locator('#lname').evaluate((el) => getComputedStyle(el).fontFamily),
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
  await page.locator('.splash-title').evaluate((im) => im.decode());
  for (const [width, height] of [
    [1440, 1000],
    [640, 700],
    [640, 480],
  ]) {
    await page.setViewportSize({ width, height });
    const logo = await page.locator('.splash-title').boundingBox();
    const panel = await page.locator('#login .loginbox').boundingBox();
    assert.ok(logo.x >= 0 && logo.x + logo.width <= width);
    assert.ok(logo.y + logo.height <= panel.y, 'Title is above, outside login HUD');
    assert.equal(await page.locator('#login .loginbox .splash-title').count(), 0);
    const enter = await page.locator('#lbtn').boundingBox();
    assert.ok(enter.y >= 0 && enter.y + enter.height <= height, 'Login action remains in viewport');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.locator('.splash-title').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  assert.equal(
    await page
      .locator('.title-lightning path')
      .evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(
    await page
      .locator('.title-lightning path')
      .evaluate((el) => getComputedStyle(el).animationName),
    'electric-trace',
  );
  const lightning = await page.locator('.title-lightning path').evaluate((el) => {
    const a = el.getAnimations()[0];
    a.pause();
    a.currentTime = 3500;
    const first = getComputedStyle(el).strokeDashoffset;
    a.currentTime = 4100;
    const second = getComputedStyle(el).strokeDashoffset;
    a.play();
    return { first, second };
  });
  assert.notEqual(
    lightning.first,
    lightning.second,
    'Electric accents trace independently of logo',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(f.out, 'login.png') });
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await page
      .locator('.title-lightning path')
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    'paused',
  );
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  const land = await page.locator('#landpic').evaluate((el) => ({
    image: el.style.backgroundImage,
    border: getComputedStyle(el).borderTopWidth,
    scan: getComputedStyle(el, '::after').backgroundImage,
  }));
  assert.ok(
    /assets\/|blob:|data:image/.test(land.image),
    'Landed artwork remains selected by production renderer',
  );
  assert.equal(land.border, '6px');
  assert.match(land.scan, /repeating-linear-gradient/);
  await page.screenshot({ path: path.join(f.out, 'landing.png') });
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const initialPixels = await page.locator('#view').evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
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
  assert.equal(await page.locator('#functiondock > button').count(), 8);
  assert.equal(await page.locator('#cbkeys').count(), 0, 'No redundant Keys button');
  assert.equal(await page.locator('#traytoggle').getAttribute('aria-expanded'), 'false');
  await page.waitForFunction(() => window.cockpitText.some((x) => x.text === 'Mining Alpha'));
  assert.ok(
    await page.evaluate(() =>
      window.cockpitText
        .filter((x) => x.text === 'Mining Alpha')
        .every((x) => x.font.includes('Pixelify Sans')),
    ),
  );
  await page.evaluate(async () => {
    const { receiveShipChat } = await import('/chat_bubbles.js');
    receiveShipChat(G, { ch: 'sys', sys: G.sys, ship: G.myId, msg: 'Ready to follow.' });
  });
  await page.waitForFunction(() => window.cockpitText.some((x) => x.text === 'Ready to follow.'));
  assert.ok(
    await page.evaluate(() =>
      window.cockpitText
        .filter((x) => x.text === 'Ready to follow.')
        .every((x) => x.font.includes('Pixelify Sans')),
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
  const layouts = [];
  for (const [width, height, scale] of [
    [1440, 1000, 1],
    [1024, 768, 1.4],
    [640, 480, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => {
      G.opts.scale = scale;
      document.documentElement.style.setProperty('--ui', scale);
      document.body.classList.toggle('scaled', scale !== 1);
      dispatchEvent(new Event('resize'));
    }, scale);
    const rects = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
      return {
        cockpit: r('cockpit'),
        trim: r('traytrim'),
        chat: r('consolechat'),
        dock: r('functiondock'),
        canvas: r('view'),
        backing: {
          width: document.getElementById('view').width,
          height: document.getElementById('view').height,
          dpr: devicePixelRatio,
        },
      };
    });
    if (width === 1440)
      assert.ok(
        Math.abs((rects.chat.left + rects.chat.right) / 2 - width / 2) < 1,
        'Desktop chat is horizontally centered',
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
    assert.ok(rects.chat.left >= rects.dock.right, 'Dock does not cover chat');
    assert.ok(rects.canvas.bottom <= rects.cockpit.top + 1, 'Console does not cover flight view');
    await page.locator('#traytoggle').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#traytoggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#hud').evaluate((el) => el.inert), false);
    if (width === 1440) {
      const hudBefore = await page.locator('#hud').boundingBox();
      const grip = await page.locator('#hudgrip').boundingBox();
      await page.mouse.move(grip.x + 2, grip.y + 40);
      await page.mouse.down();
      await page.mouse.move(grip.x - 38, grip.y + 40, { steps: 4 });
      await page.mouse.up();
      const hudAfter = await page.locator('#hud').boundingBox();
      assert.ok(
        hudAfter.width >= hudBefore.width + 30,
        'Embedded trim does not block actual sidebar resize drag',
      );
      const savedWidth = await page.evaluate(() => Number(localStorage.getItem('rift.hud')));
      assert.ok(Math.abs(savedWidth - hudAfter.width) < 1, 'Drag persists the actual tray width');
    }
    await page.locator('#ctabs button[data-tab="log"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ctabs button[data-tab="log"]').getAttribute('class'), 'on');
    await page.screenshot({ path: path.join(f.out, `tray-${width}-${scale}.png`) });
    await page.click('#traytoggle');
    assert.equal(await page.locator('#hud').evaluate((el) => el.inert), true);
    await page.locator('#combatindicator').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#combatcontrols').isVisible(), true);
    await page.locator('[aria-label="Close combat controls"]').click();
    assert.equal(await page.locator('#combatcontrols').isVisible(), false);
    await page.screenshot({ path: path.join(f.out, `flight-${width}-${scale}.png`) });
    layouts.push({ width, height, scale, ...rects });
  }
  fs.writeFileSync(path.join(f.out, 'layouts.json'), JSON.stringify(layouts, null, 2));
  assert.deepEqual(errors, []);
  console.log(
    'Cockpit font, original login/landed artwork, ship-name/chat typography, eight icons, connected tray, keyboard/tab/popup reachability and narrow/scaled layout passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
