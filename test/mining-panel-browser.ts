import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import path from 'node:path';

import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('mining-panel');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.goto(feature.origin);
  assert.equal(await page.locator('#miningindicator').isVisible(), false);
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.waitForSelector('#miningindicator', { state: 'visible' });
  assert.equal(await page.locator('#miningindicator').isDisabled(), true);
  await page.click('#depart');
  await page.waitForFunction(
    () => !(document.querySelector('#miningindicator')! as HTMLButtonElement).disabled,
  );
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  const icon = await page.locator('#miningindicator').boundingBox();
  const dock = await page.locator('#functiondock').boundingBox();
  assert.ok(icon!.x >= dock!.x && icon!.x + icon!.width <= dock!.x + dock!.width);
  assert.ok(icon!.y >= dock!.y && icon!.y + icon!.height <= dock!.y + dock!.height);
  const combatIcon = await page.locator('#combatindicator').boundingBox();
  assert.equal(icon!.y, combatIcon!.y, 'Mining shares the compact grid row with Combat');
  assert.ok(icon!.x >= combatIcon!.x + combatIcon!.width, 'Mining follows Combat without overlap');
  await page.screenshot({ path: path.join(feature.out, 'after-collapsed.png') });
  await page.click('#miningindicator');
  assert.equal((await page.locator('#miningindicator').getAttribute('aria-expanded'))!, 'true');
  assert.match((await page.locator('#miningsurvey').textContent())!, /Scan nearby rocks/);
  assert.equal(
    await page.locator('#towcontrols').isVisible(),
    false,
    'no irrelevant towing controls without rig',
  );
  await page.screenshot({ path: path.join(feature.out, 'after-open.png') });
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
    G.you!.cargoUsed = G.you!.shipStats!.cargo;
  });
  await page.waitForFunction(() =>
    document.querySelector('#miningcargo')!.textContent.includes('Hold full'),
  );
  assert.equal(await page.locator('#miningsurvey').isEnabled(), true);
  await page.screenshot({ path: path.join(feature.out, 'after-full-hold.png') });
  await page.evaluate(() => {
    G.you!.shipStats!.cargo = 0;
  });
  await page.waitForFunction(
    () => (document.querySelector('#miningindicator')! as HTMLButtonElement).disabled,
  );
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  await page.evaluate(() => {
    G.you = structuredClone(savedYou);
    const hull = Object.values(G.A!.ships).find(
      (interceptorHull) => interceptorHull.role === 'interceptor',
    );
    G.you!.ship.hull = hull!.id;
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#miningindicator').isVisible(), true);
  assert.equal(await page.locator('#miningindicator').isDisabled(), true);
  await page.screenshot({ path: path.join(feature.out, 'after-ineligible.png') });
  await page.evaluate(() => {
    G.you = structuredClone(savedYou);
  });
  await page.waitForFunction(
    () => !(document.querySelector('#miningindicator')! as HTMLButtonElement).disabled,
  );
  assert.equal(
    await page.locator('#miningcontrols').isVisible(),
    false,
    'ship change resets expansion',
  );
  await page.click('#miningindicator');
  await page.evaluate(() => {
    // Only the truthy landed gate is under test; preserve the live payload shape.
    G.landed = { ...G.landed!, stellar: 'fixture' };
  });
  await page.waitForFunction(
    () => (document.querySelector('#miningindicator')! as HTMLButtonElement).disabled,
  );
  await page.evaluate(() => {
    G.landed = null;
  });
  await page.waitForFunction(
    () => !(document.querySelector('#miningindicator')! as HTMLButtonElement).disabled,
  );
  assert.equal(await page.locator('#miningcontrols').isVisible(), false);
  await page.click('#miningindicator');
  await page.evaluate(() => {
    window.pressureDescriptor = Object.getOwnPropertyDescriptor(G, 'miningPressure')!;
    const pressure = { ...G.miningPressure, warn: true };
    Object.defineProperty(G, 'miningPressure', {
      configurable: true,
      get: () => pressure,
      set: () => {},
    });
  });
  await page.waitForFunction(() =>
    document.querySelector('#miningindicator')!.classList.contains('warning'),
  );
  assert.match((await page.locator('#miningcargo').textContent())!, /noise is high/);
  await page.evaluate(() => {
    Object.defineProperty(G, 'miningPressure', pressureDescriptor);
  });
  await page.keyboard.press('u');
  await page.waitForSelector('#hailbox', { state: 'visible' });
  assert.equal((await page.locator('#miningindicator').getAttribute('aria-expanded'))!, 'true');
  await page.locator('#hailopts').getByText('CLOSE', { exact: true }).click();
  assert.equal(await page.locator('#miningcontrols').isVisible(), true);
  await page.evaluate(() => {
    G.miningTarget = 0;
  });
  await page.waitForFunction(() =>
    document.querySelector('#miningmeter')!.textContent.includes('Scan to reveal'),
  );
  for (const [width, height, scale] of [
    [1440, 1000, 0.8],
    [1024, 768, 1],
    [800, 600, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.keyboard.press('o');
    await page.locator('#opt-scale').evaluate((input, value) => {
      (input as HTMLInputElement).value = String(String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, scale);
    await page.click('#optclose');
    const boundingBox2 = await page.locator('#miningcontrols').boundingBox();
    assert.ok(
      boundingBox2!.x >= 0 &&
        boundingBox2!.y >= 0 &&
        boundingBox2!.x + boundingBox2!.width <= width &&
        boundingBox2!.y + boundingBox2!.height <= height,
    );
    await page.getByText('Group mining & help', { exact: true }).click();
    await page.locator('#miningconsent').focus();
    const visible = await page.locator('#miningconsent').evaluate((element) => {
      const firstCaptain = element.getBoundingClientRect(),
        secondCaptain = document.querySelector('#miningcontrols')!.getBoundingClientRect();
      return firstCaptain.top >= secondCaptain.top && firstCaptain.bottom <= secondCaptain.bottom;
    });
    assert.ok(visible, 'keyboard can reach final control');
    await page.screenshot({
      path: path.join(feature.out, 'layout-' + width + '-' + scale + '.png'),
    });
    await page.getByText('Group mining & help', { exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Real browser drill placement, default collapse, click/keyboard, eligibility/full hold/transitions, hail isolation and responsive reachability passed.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
