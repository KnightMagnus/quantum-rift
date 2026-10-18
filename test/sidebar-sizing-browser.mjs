import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { refineryFixture } from './helpers/refinery-play-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await refineryFixture('sidebar-sizing');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const login = async () => {
    await page.fill('#lname', 'Refinery Alpha');
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    await page.click('#traytoggle');
  };
  await page.goto(f.origin);
  await login();
  const radar = page.locator('#radar'),
    menu = page.locator('#cpanel');
  const initial = await radar.boundingBox();
  assert.ok(Math.abs(initial.width - initial.height) < 1, 'Automatic minimap starts square');
  async function drag(id, dy) {
    const grip = page.locator(id);
    await grip.scrollIntoViewIfNeeded();
    const box = await grip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
  }
  await drag('#radarheightgrip', -110);
  const smaller = await radar.boundingBox();
  assert.ok(initial.height - smaller.height > 80, 'Mouse drag changes minimap height');
  assert.ok(
    Math.abs(initial.width - smaller.width) < 2,
    'Vertical sizing does not change sidebar width',
  );
  await page.screenshot({ path: path.join(f.out, 'sidebar-minimap-shorter.png') });
  const backing = await radar.evaluate((el) => ({
    w: el.width,
    h: el.height,
    cw: el.clientWidth,
    ch: el.clientHeight,
    dpr: devicePixelRatio,
  }));
  assert.ok(
    Math.abs(backing.w - backing.cw * backing.dpr) <= 1 &&
      Math.abs(backing.h - backing.ch * backing.dpr) <= 1,
    'Canvas backing follows both dimensions without stretching',
  );
  await page.locator('#menuheightgrip').focus();
  await page.keyboard.press('End');
  const largeMenu = (await menu.boundingBox()).height;
  await drag('#menuheightgrip', -90);
  assert.ok(
    largeMenu - (await menu.boundingBox()).height > 60,
    'The lower menu has its own draggable height',
  );
  const mapHeight = (await radar.boundingBox()).height;
  await page.locator('#menuheightgrip').focus();
  await page.keyboard.press('ArrowUp');
  assert.ok(
    Math.abs((await radar.boundingBox()).height - mapHeight) < 1,
    'Changing the menu does not overwrite the minimap preference',
  );
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rift.hudHeights')));
  assert.ok(saved.radar > 0 && saved.menu > 0);
  await page.reload();
  await login();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('rift.hudHeights'))),
    saved,
    'Both heights survive reload',
  );
  const grip = page.locator('#radarheightgrip');
  await grip.scrollIntoViewIfNeeded();
  const box = await grip.boundingBox();
  const beforeTouch = (await radar.boundingBox()).height;
  const cdp = await context.newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: point.y - 40 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(
    beforeTouch - (await radar.boundingBox()).height > 25,
    'Touch drag resizes the minimap',
  );
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui', '1.4');
    document.body.classList.add('scaled');
  });
  await page.locator('#menuheightgrip').focus();
  const beforeKey = (await menu.boundingBox()).height;
  await page.keyboard.press('ArrowUp');
  assert.ok(beforeKey - (await menu.boundingBox()).height > 15, 'Keyboard sizing respects UI zoom');
  await page.setViewportSize({ width: 760, height: 680 });
  await page.locator('#menuheightgrip').focus();
  await page.keyboard.press('End');
  assert.ok(
    (await menu.boundingBox()).height <= 680 * 0.81,
    'Temporary viewport limits keep custom heights bounded',
  );
  await page.locator('#ctabs [data-tab="missions"]').click();
  assert.ok(
    await page.locator('#mlist').evaluate((el) => el.clientHeight > 35),
    'Tabbed content remains reachable with large map/menu preferences',
  );
  await page.screenshot({ path: path.join(f.out, 'sidebar-custom-heights.png') });
  await page.locator('#radarheightgrip').focus();
  await page.keyboard.press('Enter');
  const reset = await radar.boundingBox();
  assert.ok(Math.abs(reset.width - reset.height) < 1, 'Enter restores the square automatic map');
  await page.locator('#menuheightgrip').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await menu.evaluate((el) => el.classList.contains('custom-height')),
    false,
    'Reset restores automatic menu layout',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Independent mouse/touch/keyboard heights, canvas geometry, reload persistence, UI zoom, viewport limits, reachability and automatic reset passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
