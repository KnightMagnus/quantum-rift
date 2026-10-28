import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import path from 'node:path';

import { refineryFixture } from './helpers/refinery-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await refineryFixture('sidebar-sizing');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1440 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  const login = async (name = 'Refinery Alpha') => {
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.click('#traytoggle');
    await page.evaluate(() => document.fonts.ready);
  };
  await page.goto(feature.origin);
  await login();
  const radar = page.locator('#radar'),
    menu = page.locator('#cpanel'),
    grip = page.locator('#menuheightgrip');
  assert.equal(await page.locator('#radarheightgrip').count(), 0, 'No minimap height control');
  assert.equal(
    await page.getByRole('separator', { name: 'Resize minimap height' }).count(),
    0,
    'No keyboard or accessibility route remains for resizing minimap height',
  );
  async function assertSquareRadar() {
    await page.waitForFunction(
      () => {
        const sidebar = document.getElementById('hud')!;
        const style = getComputedStyle(sidebar);
        const scale = sidebar.getBoundingClientRect().width / parseFloat(style.width);
        const available =
          sidebar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const frame = document.getElementById('radarwrap')!.getBoundingClientRect();
        const canvas = document.getElementById('radar')!.getBoundingClientRect();
        const backing = document.getElementById('radar') as HTMLCanvasElement;
        return (
          frame.width > 90 &&
          Math.abs(frame.width - available * scale) < 1 &&
          Math.abs(frame.width - frame.height) < 1 &&
          Math.abs(canvas.width - canvas.height) < 1 &&
          Math.abs(backing.width - backing.clientWidth * devicePixelRatio) <= 1 &&
          Math.abs(backing.height - backing.clientHeight * devicePixelRatio) <= 1
        );
      },
      undefined,
      { timeout: 3000 },
    );
  }
  for (const [width, height, zoom] of [
    [1920, 1080, 1],
    [3440, 1440, 1],
    [760, 680, 1],
    [1920, 1080, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((zoom) => {
      document.documentElement.style.setProperty('--ui', String(zoom));
      document.body.classList.toggle('scaled', zoom !== 1);
    }, zoom);
    await assertSquareRadar();
    assert((await menu.boundingBox())!.height >= 180, 'Square map preserves a usable lower menu');
    const menuRange = await grip.evaluate((element) => ({
      minimum: Number(element.getAttribute('aria-valuemin')),
      maximum: Number(element.getAttribute('aria-valuemax')),
      current: Number(element.getAttribute('aria-valuenow')),
    }));
    assert(
      menuRange.current >= menuRange.minimum && menuRange.current <= menuRange.maximum,
      'Menu height remains inside its accessible range even when the sidebar must scroll',
    );
    if (width === 1920 && zoom === 1) {
      await page.screenshot({ path: path.join(feature.out, 'sidebar-minimap-default.png') });
      await page
        .locator('#hud')
        .screenshot({ path: path.join(feature.out, 'sidebar-minimap-detail.png') });
    }
    assert.equal(
      await page.evaluate(() => localStorage.getItem('rift.hudHeights')),
      null,
      'Automatic allocation does not save a height preference',
    );
  }
  await page.setViewportSize({ width: 1440, height: 1440 });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--ui');
    document.body.classList.remove('scaled');
  });
  await assertSquareRadar();
  const defaultWidth = (await radar.boundingBox())!.width;
  for (const width of [280, 650, 520]) {
    await page.evaluate(
      (width) => document.documentElement.style.setProperty('--tray-width', width + 'px'),
      width,
    );
    await assertSquareRadar();
    if (width === 650) {
      assert(
        (await radar.boundingBox())!.width > defaultWidth + 80,
        'Square map grows with sidebar width',
      );
    }
  }
  await page.evaluate(() => document.documentElement.style.removeProperty('--tray-width'));
  await assertSquareRadar();
  for (const legacyRadarHeight of [96, 1200]) {
    await page.evaluate((radar) => {
      localStorage.setItem('rift.hudHeights', JSON.stringify({ radar, menu: 220 }));
    }, legacyRadarHeight);
    await page.reload();
    await login(legacyRadarHeight === 96 ? 'Refinery Alpha' : 'Refinery Bravo');
    await assertSquareRadar();
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('rift.hudHeights')!)),
      { menu: 220 },
      'Legacy map height is discarded across captains without changing saved menu height',
    );
  }
  await grip.focus();
  await page.keyboard.press('Enter');
  async function drag(verticalDelta: number) {
    await grip.scrollIntoViewIfNeeded();
    const bounds = (await grip.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    assert(
      await grip.evaluate((element) => element.classList.contains('drag')),
      'Menu captures pointer',
    );
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2 + verticalDelta,
      { steps: 8 },
    );
    await page.mouse.up();
  }
  await grip.focus();
  await page.keyboard.press('End');
  const largeMenu = (await menu.boundingBox())!.height;
  const initialRadar = (await radar.boundingBox())!;
  await drag(90);
  assert(
    largeMenu - (await menu.boundingBox())!.height > 60,
    'Mouse drag changes lower menu height',
  );
  await assertSquareRadar();
  assert(
    Math.abs((await radar.boundingBox())!.height - initialRadar.height) < 1,
    'Menu sizing never resizes the map',
  );
  await grip.focus();
  await page.keyboard.press('ArrowUp');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rift.hudHeights')!));
  assert(saved.menu > 0 && !('radar' in saved), 'Only lower-menu height is saved');
  await page.reload();
  await login('Refinery Bravo');
  await assertSquareRadar();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('rift.hudHeights')!)),
    saved,
    'Menu height survives reload',
  );
  await grip.scrollIntoViewIfNeeded();
  const touchBounds = (await grip.boundingBox())!;
  const beforeTouch = (await menu.boundingBox())!.height;
  const devtools = await context.newCDPSession(page);
  const point = {
    x: touchBounds.x + touchBounds.width / 2,
    y: touchBounds.y + touchBounds.height / 2,
  };
  await devtools.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await devtools.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: point.y + 40 }],
  });
  await devtools.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert(beforeTouch - (await menu.boundingBox())!.height > 25, 'Touch drag resizes only the menu');
  await assertSquareRadar();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui', '1.4');
    document.body.classList.add('scaled');
  });
  await assertSquareRadar();
  await grip.focus();
  const beforeKey = (await menu.boundingBox())!.height;
  await page.keyboard.press('ArrowDown');
  assert(
    beforeKey - (await menu.boundingBox())!.height > 15,
    'Keyboard menu sizing respects UI zoom',
  );
  await page.setViewportSize({ width: 760, height: 680 });
  await assertSquareRadar();
  await grip.focus();
  await page.keyboard.press('End');
  assert(
    (await menu.boundingBox())!.height <= 680 * 0.81,
    'Temporary viewport limits bound menu height',
  );
  await page.locator('#ctabs [data-tab="missions"]').click();
  await page.locator('#mlist').scrollIntoViewIfNeeded();
  assert(
    await page.locator('#mlist').evaluate((element) => element.clientHeight > 35),
    'Mission content remains reachable on short screens',
  );
  assert(
    await page
      .locator('#hud')
      .evaluate((element) => element.scrollHeight > element.clientHeight && element.scrollTop > 0),
    'Short screens scroll instead of shrinking the map',
  );
  await assertSquareRadar();
  await page.screenshot({ path: path.join(feature.out, 'sidebar-short-screen-menu.png') });
  await page.setViewportSize({ width: 1440, height: 1440 });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--ui');
    document.body.classList.remove('scaled');
    document.getElementById('hud')!.scrollTop = 0;
  });
  await assertSquareRadar();
  await grip.focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(
    () => {
      const sidebar = document.getElementById('hud')!;
      const style = getComputedStyle(sidebar);
      const floor =
        sidebar.getBoundingClientRect().bottom -
        parseFloat(style.paddingBottom) -
        parseFloat(style.borderBottomWidth);
      return (
        Math.abs(document.getElementById('cpanel')!.getBoundingClientRect().bottom - floor) < 2
      );
    },
    undefined,
    { timeout: 3000 },
  );
  assert.equal(
    await menu.evaluate((element) => (element as HTMLElement).offsetHeight),
    180,
    'Small saved menu stays attached to sidebar floor',
  );
  await assertSquareRadar();
  await grip.focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await menu.evaluate((element) => element.classList.contains('custom-height')),
    false,
    'Enter resets the menu',
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('rift.hudHeights')),
    null,
    'Reset clears menu preference',
  );
  await page.screenshot({ path: path.join(feature.out, 'sidebar-fixed-square.png') });
  assert.deepEqual(errors, []);
  console.log(
    'Fixed full-width square map, removed upper control, legacy-height migration, captain switching, mouse/touch/keyboard menu sizing, canvas geometry, reload, zoom and short-screen scrolling passed.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
