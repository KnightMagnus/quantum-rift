import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.ts';
import { evidenceDir, failureEvidence } from './helpers/browser-fixture.ts';
const output = evidenceDir('responsive-hud');
const control = path.join(output, 'attention-control.json');
const setAttention = (value: object) => {
  fileSystem.writeFileSync(control + '.next', JSON.stringify(value));
  fileSystem.renameSync(control + '.next', control);
};
setAttention({});
process.env.RIFT_ATTENTION_CONTROL = control;
const fixture = await miningFixture(
  'responsive-hud',
  fileURLToPath(new URL('./fixtures/attention-preload.ts', import.meta.url)),
);
let browser;
const measurements: object[] = [];
const largeSizes = [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [3440, 1440],
  [5120, 1440],
];
async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        right: bounds.right,
        bottom: bounds.bottom,
      };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth,
      font: parseFloat(getComputedStyle(document.body).fontSize),
      cockpit: rect('#cockpit'),
      padding: [
        parseFloat(getComputedStyle(document.querySelector('#cockpit')!).paddingLeft),
        parseFloat(getComputedStyle(document.querySelector('#cockpit')!).paddingRight),
      ],
      left: rect('#functiondock'),
      chat: rect('#consolechat'),
      right: rect('#consoleutilities'),
      view: rect('#view'),
      hud: rect('#hud'),
      buttons: [
        ...document.querySelectorAll('#functiondock .function-icon,#consoleutilities .cb'),
      ].map((element) => ({
        id: element.id,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    };
  });
}
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(fixture.origin);
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await page.evaluate(() => G.pinnedObjective),
    'story',
    'Fresh cockpit pins the disclosed main objective',
  );
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  for (const [width, height] of largeSizes) {
    await page.setViewportSize({ width, height });
    const panel = await page.locator('#land .landbox').boundingBox();
    assert.ok(
      panel && panel.x >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= height,
      'Landed panel contained',
    );
    await page.screenshot({ path: path.join(output, 'landed-' + width + 'x' + height + '.png') });
  }
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  let reference: Awaited<ReturnType<typeof geometry>>['buttons'] | undefined;
  let lastChatWidth = 0;
  for (const [width, height] of [...largeSizes].sort((left, right) => left[0] - right[0])) {
    await page.setViewportSize({ width, height });
    const bounds = await geometry(page);
    measurements.push(bounds);
    assert.equal(bounds.font, 18, '12.5% larger cockpit base');
    assert.ok(bounds.overflow <= width, 'No document overflow');
    assert.ok(
      bounds.left.right <= bounds.chat.x + 1 && bounds.chat.right <= bounds.right.x + 1,
      'Left / center / right never overlap',
    );
    assert.ok(
      Math.abs(bounds.left.x - bounds.cockpit.x - bounds.padding[0]) < 1 &&
        Math.abs(bounds.right.right - bounds.cockpit.right + bounds.padding[1]) < 1,
      'Button groups remain at opposite ends: ' + JSON.stringify(bounds),
    );
    assert.ok(bounds.chat.width > lastChatWidth, 'Chat absorbs extra width');
    lastChatWidth = bounds.chat.width;
    reference ??= bounds.buttons;
    assert.deepEqual(
      bounds.buttons.map(({ id, height }) => ({ id, height })),
      reference.map(({ id, height }) => ({ id, height })),
      'Consistent control heights while key widths adapt to the blue console',
    );
    await page.screenshot({ path: path.join(output, 'flight-' + width + 'x' + height + '.png') });
    await page.click('#captainshortcut');
    await page.locator('#infobox').waitFor({ state: 'visible' });
    assert.ok(
      (await page.locator('#captainprofile').innerText()).length > 20,
      'Captain profile renders',
    );
    await page.screenshot({ path: path.join(output, 'captain-' + width + 'x' + height + '.png') });
    await page.click('[data-it="log"]');
    assert.match(await page.locator('#infobody').innerText(), /CURRENT OBJECTIVE/);
    assert.match(await page.locator('#infobody').innerText(), /PREPARATION/);
    await page.locator('#infobody').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    assert.ok(
      await page
        .locator('#infobody')
        .evaluate(
          (element) => element.scrollHeight <= element.clientHeight || element.scrollTop > 0,
        ),
      'Captain log content is scrollable',
    );
    await page.screenshot({
      path: path.join(output, 'captain-log-' + width + 'x' + height + '.png'),
    });
    await page.click('[data-it="profile"]');

    await page.keyboard.press('Escape');
    await page.locator('#infobox').waitFor({ state: 'hidden' });
    await page.keyboard.press('i');
    await page.locator('#infobox').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.click('#cbmap');
    await page.locator('#gmap').waitFor({ state: 'visible' });
    const map = await page.locator('#gmap .gbox').boundingBox();
    assert.ok(
      map && map.x >= 0 && map.x + map.width <= width && map.y + map.height <= height,
      'Galaxy map contained',
    );
    await page.screenshot({ path: path.join(output, 'map-' + width + 'x' + height + '.png') });
    await page.evaluate(async () => {
      const { closeMap } = await import('/ui.js');
      closeMap();
    });
    await page.click('#traytoggle');
    const expanded = await geometry(page);
    assert.ok(
      expanded.view.right + 10 <= expanded.hud.x,
      'Actual view/sidebar gap protects right-aligned scene text',
    );
    await page.screenshot({ path: path.join(output, 'sidebar-' + width + 'x' + height + '.png') });
    await page.click('#traytoggle');
    await page.click('#miningindicator');
    await page.click('#combatindicator');
    await page.click('#chatexpand');
    assert.equal(await page.locator('#chatexpand').getAttribute('aria-expanded'), 'true');
    await page.screenshot({
      path: path.join(output, 'functions-chat-' + width + 'x' + height + '.png'),
    });
    await page.click('#chatexpand');
    await page.click('#miningindicator');
    await page.click('#combatindicator');
    await page.click('#optbtn');
    await page.locator('#optclose').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#optclose').isEnabled());
    await page.screenshot({ path: path.join(output, 'settings-' + width + 'x' + height + '.png') });
    await page.click('#optclose');
  }
  for (const width of [1100, 1101, 1200, 1250, 1251]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.click('#traytoggle');
    const overlap = await page.evaluate(() => {
      const chat = document.getElementById('consolechat')!.getBoundingClientRect();
      return [...document.querySelectorAll('#consoleutilities .cb')].some((button) => {
        const bounds = button.getBoundingClientRect();
        return (
          bounds.left < chat.right &&
          bounds.right > chat.left &&
          bounds.top < chat.bottom &&
          bounds.bottom > chat.top
        );
      });
    });
    assert.equal(overlap, false, 'Expanded tray reserves its utility track at ' + width);
    await page.locator('#chatin').fill('breakpoint input probe');
    await page.locator('#chatin').fill('');
    await page.screenshot({ path: path.join(output, 'tray-breakpoint-' + width + '.png') });
    await page.click('#traytoggle');
  }
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [640, 700],
    [640, 480],
  ]) {
    await page.setViewportSize({ width, height });
    const bounds = await geometry(page);
    assert.ok(bounds.overflow <= width);
    assert.ok(
      [
        [bounds.left, bounds.chat],
        [bounds.chat, bounds.right],
        [bounds.left, bounds.right],
      ].every(
        ([first, second]) =>
          first.right <= second.x + 1 ||
          second.right <= first.x + 1 ||
          first.bottom <= second.y + 1 ||
          second.bottom <= first.y + 1,
      ),
      'Narrow groups remain disjoint when stacked or side by side',
    );
    await page.locator('#captainshortcut').click();
    await page.locator('#infobox').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(output, 'narrow-' + width + 'x' + height + '.png') });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  setAttention({ targeted: true, scanned: true });
  await page.waitForFunction(
    () => document.getElementById('attentionindicator')!.dataset.state === 'targeted',
  );
  assert.match(
    (await page.locator('#attentionindicator').getAttribute('aria-label')) || '',
    /Combat alert/,
  );
  assert.equal(
    await page
      .locator('#attentionindicator')
      .evaluate((element) => getComputedStyle(element).animationName),
    'attention-blink',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('#attentionindicator')
      .evaluate((element) => getComputedStyle(element).animationName),
    'none',
  );
  assert.equal(
    await page
      .locator('#attentionindicator')
      .evaluate((element) => getComputedStyle(element).color),
    'rgb(255, 85, 76)',
  );
  await page.screenshot({ path: path.join(output, 'attention-red-reduced-motion.png') });
  setAttention({ scanned: true });
  await page.waitForFunction(
    () => document.getElementById('attentionindicator')!.dataset.state === 'scanned',
  );
  assert.equal(
    await page
      .locator('#attentionindicator')
      .evaluate((element) => getComputedStyle(element).color),
    'rgb(255, 174, 66)',
  );
  await page.screenshot({ path: path.join(output, 'attention-orange-reduced-motion.png') });
  await page.waitForFunction(
    () => document.getElementById('attentionindicator')!.dataset.state === 'clear',
    {},
    { timeout: 6000 },
  );
  setAttention({});
  await page.waitForTimeout(150); // Allow the real 30 Hz fixture to retire the previous scan marker.
  for (const mode of ['scanned', 'targeted']) {
    const previousShip = await page.evaluate(() => G.myId);
    setAttention({ [mode]: true });
    await page.waitForFunction(
      (expected) => document.getElementById('attentionindicator')!.dataset.state === expected,
      mode,
    );
    setAttention({ [mode]: true, disconnect: true });
    await page.waitForFunction(
      () => document.getElementById('attentionindicator')!.dataset.state === 'clear',
    );
    assert.match(
      (await page.locator('#attentionindicator').getAttribute('aria-label')) || '',
      /No combat/,
    );
    setAttention({});
    await page.waitForFunction(
      (previous) => !!G.landed || (G.myId !== previous && !!G.view),
      previousShip,
      { timeout: 15000 },
    );
    // Disconnect intentionally docks the captain; reconnect must preserve that existing safety policy.
    if (await page.locator('#land').isVisible()) await page.click('#depart');
    await page.waitForFunction((previous) => G.myId !== previous && !!G.view, previousShip, {
      timeout: 15000,
    });
  }
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'geometry.json'),
    JSON.stringify(measurements, null, 2),
  );
  console.log(
    'Responsive HUD: five large sizes, four narrow, captain/map/sidebar/functions/chat/settings and authoritative attention transitions passed.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await fixture.close(browser);
  delete process.env.RIFT_ATTENTION_CONTROL;
}
