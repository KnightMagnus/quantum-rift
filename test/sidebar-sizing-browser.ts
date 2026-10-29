import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';

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
  const radar = page.locator('#radar');
  for (const id of ['radarheightgrip', 'menuheightgrip'])
    assert.equal(await page.locator('#' + id).count(), 0, 'Retired height slider is absent');
  assert.equal(await page.getByRole('separator').count(), 0, 'No height-resize keyboard route');
  async function assertMapLayout() {
    await page.waitForFunction(
      () => {
        const sidebar = document.getElementById('hud')!;
        const style = getComputedStyle(sidebar);
        const scale = sidebar.getBoundingClientRect().width / parseFloat(style.width);
        const available =
          sidebar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const frame = document.getElementById('radarwrap')!.getBoundingClientRect();
        const canvas = document.getElementById('radar') as HTMLCanvasElement;
        const bounds = canvas.getBoundingClientRect();
        const menu = document.getElementById('cpanel')!;
        return (
          frame.width > 90 &&
          Math.abs(frame.width - Math.min(350, available) * scale) < 1 &&
          Math.abs(frame.width - frame.height) < 1 &&
          Math.abs(bounds.width - bounds.height) < 1 &&
          Math.abs(canvas.width - canvas.clientWidth * devicePixelRatio) <= 1 &&
          Math.abs(canvas.height - canvas.clientHeight * devicePixelRatio) <= 1 &&
          menu.offsetHeight >= 200
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
    [480, 650, 1],
    [1920, 1080, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((zoom) => {
      document.documentElement.style.setProperty('--ui', String(zoom));
      document.body.classList.toggle('scaled', zoom !== 1);
    }, zoom);
    for (const sidebarWidth of [280, 520, 650, 760]) {
      await page.evaluate(
        (width) => document.documentElement.style.setProperty('--tray-width', width + 'px'),
        sidebarWidth,
      );
      await assertMapLayout();
    }
    await page.locator('[data-tab="codex"]').click();
    await page.locator('#cpanel').scrollIntoViewIfNeeded();
    assert(await page.locator('#cpanel').isVisible(), 'Menu remains reachable on short screens');
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--ui');
    document.body.classList.remove('scaled');
    document.documentElement.style.setProperty('--tray-width', '760px');
  });
  await assertMapLayout();
  const capped = (await radar.boundingBox())!.width;
  for (const name of ['Refinery Alpha', 'Refinery Bravo']) {
    await page.evaluate(() =>
      localStorage.setItem('rift.hudHeights', JSON.stringify({ radar: 1200, menu: 1200 })),
    );
    await page.reload();
    await login(name);
    await assertMapLayout();
    assert.equal(
      await page.evaluate(() => localStorage.getItem('rift.hudHeights')),
      null,
      'Retired sizes cannot restore giant map/menu',
    );
    assert(
      Math.abs((await radar.boundingBox())!.width - capped) < 1,
      'Cap survives reload and captain changes',
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS capped square system map, automatic menu, removed sliders, scaling, reload and captain changes',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
