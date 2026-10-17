import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await miningFixture('mining-panel');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(f.origin);
  assert.equal(await page.locator('#miningindicator').isVisible(), false);
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  assert.equal(await page.locator('#miningindicator').isVisible(), false);
  await page.click('#depart');
  await page.waitForSelector('#miningindicator', { state: 'visible' });
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  const icon = await page.locator('#miningindicator').boundingBox();
  assert.equal(icon.x, 12);
  assert.equal(1000 - icon.y - icon.height, 170);
  await page.screenshot({ path: path.join(f.out, 'after-collapsed.png') });
  await page.click('#miningindicator');
  assert.equal(await page.locator('#miningindicator').getAttribute('aria-expanded'), 'true');
  assert.match(await page.locator('#miningsurvey').textContent(), /Scan nearby rocks/);
  assert.equal(
    await page.locator('#towcontrols').isVisible(),
    false,
    'no irrelevant towing controls without rig',
  );
  await page.screenshot({ path: path.join(f.out, 'after-open.png') });
  await page.click('#miningindicator');
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  await page.locator('#miningindicator').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#miningcontrols').isVisible(),
    true,
    'Enter opens drill toggle without chat',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  await page.click('#miningindicator');
  // UI-only fixtures isolate transient state transitions; server gameplay is exercised by other registered suites.
  await page.evaluate(() => {
    window.savedYou = structuredClone(G.you);
    G.you.cargoUsed = G.you.shipStats.cargo;
  });
  await page.waitForFunction(() =>
    document.querySelector('#miningcargo').textContent.includes('Hold full'),
  );
  assert.equal(await page.locator('#miningsurvey').isEnabled(), true);
  await page.screenshot({ path: path.join(f.out, 'after-full-hold.png') });
  await page.evaluate(() => {
    G.you.shipStats.cargo = 0;
  });
  await page.waitForSelector('#miningindicator', { state: 'hidden' });
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  await page.evaluate(() => {
    G.you = structuredClone(savedYou);
    const h = Object.values(G.A.ships).find((h) => h.role === 'interceptor');
    G.you.ship.hull = h.id;
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#miningindicator').isVisible(), false);
  await page.screenshot({ path: path.join(f.out, 'after-ineligible.png') });
  await page.evaluate(() => {
    G.you = structuredClone(savedYou);
  });
  await page.waitForSelector('#miningindicator', { state: 'visible' });
  assert.equal(
    await page.locator('#miningcontrols').isVisible(),
    false,
    'ship change resets expansion',
  );
  await page.click('#miningindicator');
  await page.evaluate(() => {
    G.landed = 'fixture';
  });
  await page.waitForSelector('#miningindicator', { state: 'hidden' });
  await page.evaluate(() => {
    G.landed = null;
  });
  await page.waitForSelector('#miningindicator', { state: 'visible' });
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  await page.click('#miningindicator');
  await page.evaluate(() => {
    window.pressureDescriptor = Object.getOwnPropertyDescriptor(G, 'miningPressure');
    const pressure = { ...G.miningPressure, warn: true };
    Object.defineProperty(G, 'miningPressure', {
      configurable: true,
      get: () => pressure,
      set: () => {},
    });
  });
  await page.waitForFunction(() =>
    document.querySelector('#miningindicator').classList.contains('warning'),
  );
  assert.match(await page.locator('#miningcargo').textContent(), /noise is high/);
  await page.evaluate(() => {
    Object.defineProperty(G, 'miningPressure', pressureDescriptor);
  });
  await page.keyboard.press('u');
  await page.waitForSelector('#hailbox', { state: 'visible' });
  assert.equal(await page.locator('#miningindicator').getAttribute('aria-expanded'), 'true');
  await page.locator('#hailopts').getByText('CLOSE', { exact: true }).click();
  assert.equal(await page.locator('#miningcontrols').isVisible(), true);
  await page.evaluate(() => {
    G.miningTarget = 0;
  });
  await page.waitForFunction(() =>
    document.querySelector('#miningmeter').textContent.includes('Scan to reveal'),
  );
  for (const [width, height, scale] of [
    [1440, 1000, 0.8],
    [1024, 768, 1],
    [800, 600, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.keyboard.press('o');
    await page.locator('#opt-scale').evaluate((input, v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, scale);
    await page.click('#optclose');
    const box = await page.locator('#miningcontrols').boundingBox();
    assert.ok(
      box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
    );
    await page.getByText('Group mining & help', { exact: true }).click();
    await page.locator('#miningconsent').focus();
    const visible = await page.locator('#miningconsent').evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = document.querySelector('#miningcontrols').getBoundingClientRect();
      return a.top >= b.top && a.bottom <= b.bottom;
    });
    assert.ok(visible, 'keyboard can reach final control');
    await page.screenshot({ path: path.join(f.out, 'layout-' + width + '-' + scale + '.png') });
    await page.getByText('Group mining & help', { exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Real browser drill placement, default collapse, click/keyboard, eligibility/full hold/transitions, hail isolation and responsive reachability passed.',
  );
} catch (e) {
  await failureEvidence(browser, f.out, e);
  throw e;
} finally {
  await f.close(browser);
}
