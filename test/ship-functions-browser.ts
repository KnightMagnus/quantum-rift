import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';

import { miningFixture, until } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('ship-functions');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
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
    7,
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
      .forEach((element2) => ((element2 as HTMLDetailsElement).open = true));
    const serverLog = document.querySelector('#chatlog');
    for (let index = 0; index < 80; index++) {
      const element3 = document.createElement('div');
      element3.textContent =
        'Captain ' + index + ': long flight message ' + 'navigation '.repeat(15);
      serverLog!.append(element3);
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
  // JUMP shares the left flow slot but remains fixed in its default right corner.
  const jumpBounds = [];
  for (const [width, height, scale] of [
    [1280, 720, 1],
    [1920, 1080, 1],
    [2560, 1080, 1],
    [3440, 1440, 1],
    [5120, 1440, 1],
    [800, 600, 1.4],
    [640, 480, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    for (const left of [false, true]) {
      await page.evaluate(
        ({ left, scale }) => {
          G.opts.jumpLeft = left;
          G.opts.scale = scale;
          document.documentElement.style.setProperty('--ui', String(scale));
          document.body.classList.toggle('scaled', scale !== 1);
          document.body.classList.toggle('jump-left', left);
        },
        { left, scale },
      );
      for (const open of [
        [],
        ['combat'],
        ['combat', 'mining'],
        ['combat', 'mining', 'towing', 'industrial', 'fleet', 'drones'],
      ]) {
        for (const identifier of ['combat', 'mining', 'towing', 'industrial', 'fleet', 'drones']) {
          const button = page.locator('#' + identifier + 'indicator');
          if (
            ((await button.getAttribute('aria-expanded')) === 'true') !==
            open.includes(identifier)
          )
            await button.click();
        }
        const bounds = await page.evaluate(() => {
          const jump = document.getElementById('jumpholo')!.getBoundingClientRect();
          const stack = document.getElementById('functionstack')!.getBoundingClientRect();
          const intersections = [
            ...document.querySelectorAll(
              '#functionstack .function-panel:not(.hidden), #functionstack button, #functionstack input, #functionstack select',
            ),
          ]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              // Only the visible, clipped portion can obscure a pointer target.
              return (
                Math.min(rect.right, stack.right, jump.right) >
                  Math.max(rect.left, stack.left, jump.left) &&
                Math.min(rect.bottom, stack.bottom, jump.bottom) >
                  Math.max(rect.top, stack.top, jump.top)
              );
            })
            .map((element) => element.id);
          return {
            jump: { x: jump.x, y: jump.y, right: jump.right, bottom: jump.bottom },
            stackBottom: stack.bottom,
            intersections,
          };
        });
        assert.deepEqual(
          bounds.intersections,
          [],
          `JUMP clear at ${width}×${height}/${scale}, left=${String(left)}, ${open.join(',')}`,
        );
        assert.ok(
          bounds.jump.x >= 0 &&
            bounds.jump.right <= width &&
            bounds.jump.y >= 0 &&
            bounds.jump.bottom <= height,
        );
        if (left)
          assert.ok(
            bounds.stackBottom + 8 <= bounds.jump.y,
            'one reserved gap beneath the scrolling stack',
          );
        jumpBounds.push({ width, height, scale, left, open, ...bounds });
      }
    }
  }
  // Move only the display view clear of planets; the server still owns jump legality.
  await page.evaluate(() => {
    G.route = ['sol'];
    if (G.view) {
      G.view.x = 1e7;
      G.view.y = 1e7;
    }
  });
  await page.waitForFunction(
    () => !(document.getElementById('jumpholo') as HTMLButtonElement).disabled,
  );
  await page.click('#jumpholo');
  await until(() => sent.some((message) => message.t === 'jump'), 'JUMP dispatch');
  assert.ok(
    sent.some((message) => message.t === 'jump'),
    'real pointer click retains the existing JUMP action',
  );
  fileSystem.writeFileSync(
    path.join(feature.out, 'jump-bounds.json'),
    JSON.stringify(jumpBounds, null, 2),
  );
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
