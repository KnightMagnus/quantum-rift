import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('ship-functions');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [],
    sent: {
      t: string;
      op?: string;
      id?: number;
      n?: number;
      on?: boolean;
      o?: string;
      f2?: number;
    }[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('websocket', (webSocket) =>
    webSocket.on('framesent', (entity) => {
      try {
        sent.push(JSON.parse(String(entity.payload)));
      } catch {}
    }),
  );
  await page.goto(feature.origin);
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
    () => !(document.querySelector('#combatindicator')! as HTMLButtonElement).disabled,
  );
  assert.equal(await page.locator('#combatcontrols').isVisible(), false);
  await page.locator('#combatindicator').focus();
  await page.keyboard.press('Enter');
  assert.equal((await page.locator('#combatindicator').getAttribute('aria-expanded'))!, 'true');
  await page.click('#combatdelegate');
  await page.waitForTimeout(100);
  assert.ok(
    sent.some((message) => message.t === 'combat' && message.op === 'delegate' && message.on),
  );
  await page.click('#combatassist');
  await page.click('#combatstop');
  assert.ok(sent.some((message) => message.t === 'combat' && message.op === 'assist'));
  assert.ok(sent.some((message) => message.t === 'combat' && message.op === 'off'));
  await page.locator('#combatstop').focus();
  await page.keyboard.press('Escape');
  assert.equal((await page.locator('#combatindicator').getAttribute('aria-expanded'))!, 'false');
  await page.click('#miningindicator');
  await page.click('#miningsurvey');
  assert.ok(sent.some((message) => message.t === 'mining' && message.op === 'survey'));
  // Explicit UI capability fixture: server action outcomes have separate network suites.
  await page.evaluate(() => {
    window.savedYou = structuredClone(G.you);
    G.you!.ship.hull = 815;
    const dockingBay = Object.values(G.A!.weapons).find((weapon) => weapon.type === 'bay');
    G.you!.shipStats!.weapons[dockingBay!.id] = 1;
    G.you!.shipStats!.towRig = true;
    const playerPayload = G.you;
    Object.defineProperty(G, 'you', {
      configurable: true,
      get: () => playerPayload,
      set: () => {},
    });
    const towing = { rig: true, attached: 0, offers: [], objects: [], ports: [] };
    Object.defineProperty(G, 'towing', { configurable: true, get: () => towing, set: () => {} });
  });
  await page.waitForFunction(
    () => !document.querySelector('#dronesindicator')!.classList.contains('hidden'),
  );
  for (const identifier of ['combat', 'mining', 'towing', 'industrial', 'fleet', 'drones']) {
    const secondCaptain = page.locator('#' + identifier + 'indicator');
    if ((await secondCaptain.getAttribute('aria-expanded'))! !== 'true')
      await secondCaptain.click();
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#functiondock img')].every(
      (image) =>
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
    ),
  );
  assert.equal(
    (await page.locator('#hailindicator img').getAttribute('src'))!,
    'assets/hud/comms.svg',
  );
  assert.equal(
    await page.locator('#functiondock .function-icon:not(#hailindicator) img').count(),
    5,
  );
  await page.locator('[data-order="hold"]').click();
  assert.ok(sent.some((message) => message.t === 'order' && message.o === 'hold'));
  await page.click('#dronetoggle');
  await page.waitForTimeout(220);
  assert.ok(sent.some((message) => message.t === 'input' && message.f2 === 1));
  assert.equal(sent.filter((message) => message.t === 'input').at(-1)!.f2, 0);
  await page.evaluate(() => {
    document
      .querySelectorAll('#functionstack details')
      .forEach((playerData) => ((playerData as HTMLDetailsElement).open = true));
    const serverLog = document.querySelector('#chatlog');
    for (let index = 0; index < 80; index++) {
      const playerData = document.createElement('div');
      playerData.textContent =
        'Captain ' + index + ': long flight message ' + 'navigation '.repeat(15);
      serverLog!.append(playerData);
    }
  });
  const results = [];
  for (const [width, height, scale] of [
    [1440, 1000, 0.8],
    [1024, 768, 1],
    [800, 600, 1.4],
    [640, 480, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((session) => {
      G.opts.scale = session;
      document.documentElement.style.setProperty('--ui', String(session));
      document.body.classList.toggle('scaled', session !== 1);
    }, scale);
    const bounds = await page.evaluate(() => {
      const rect = (identifier: string) => {
        const result = document.getElementById(identifier)!.getBoundingClientRect();
        return {
          x: result.x,
          y: result.y,
          right: result.right,
          bottom: result.bottom,
          width: result.width,
          height: result.height,
        };
      };
      return {
        stack: rect('functionstack'),
        chat: rect('chat'),
        bar: rect('cbar'),
        root: rect('shipfunctions'),
        panels: [...document.querySelectorAll('.function-panel:not(.hidden)')].map((player) => ({
          id: player.id,
          top: player.getBoundingClientRect().top,
          bottom: player.getBoundingClientRect().bottom,
        })),
      };
    });
    assert.ok(bounds.stack.bottom <= bounds.chat.y + 1);
    assert.ok(bounds.chat.bottom <= bounds.bar.y + 1);
    assert.ok(bounds.root.x >= 0 && bounds.root.right <= width && bounds.root.y >= 0);
    for (let index = 1; index < bounds.panels.length; index++)
      assert.ok(
        bounds.panels[index].top >= bounds.panels[index - 1].bottom,
        'panels never overlap',
      );
    await page.locator('#chatin').focus();
    await page.locator('#dronetoggle').focus();
    const visible = await page.locator('#dronetoggle').evaluate((element) => {
      const firstCaptain = element.getBoundingClientRect(),
        functionStackBounds = document.querySelector('#functionstack')!.getBoundingClientRect();
      return (
        firstCaptain.top >= functionStackBounds.top &&
        firstCaptain.bottom <= functionStackBounds.bottom
      );
    });
    assert.ok(visible, 'keyboard reaches final function');
    await page.locator('#functionstack').hover();
    await page.mouse.wheel(0, -5000);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#functionstack').evaluate((entity) => entity.scrollTop), 0);
    await page.locator('#chatlog').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#chatlog')!.scrollTop > 0);
    assert.ok(
      await page.locator('#chatlog').evaluate((entity) => entity.scrollTop > 0),
      'chat history scrolls',
    );
    await page.fill('#chatin', 'HUD regression message');
    assert.equal(await page.inputValue('#chatin'), 'HUD regression message');
    await page.fill('#chatin', '');
    await page.screenshot({
      path: path.join(feature.out, 'layout-' + width + '-' + scale + '.png'),
    });
    results.push({ width, height, scale, ...bounds });
  }
  fileSystem.writeFileSync(path.join(feature.out, 'bounds.json'), JSON.stringify(results, null, 2));
  assert.deepEqual(errors, []);
  console.log(
    'Ship-function keyboard/actions, six-entry stack, chat separation, scroll and responsive bounds passed.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
