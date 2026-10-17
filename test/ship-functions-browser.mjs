import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await miningFixture('ship-functions');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [],
    sent = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('websocket', (ws) =>
    ws.on('framesent', (e) => {
      try {
        sent.push(JSON.parse(e.payload));
      } catch {}
    }),
  );
  await page.goto(f.origin);
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.waitForSelector('#miningindicator', { state: 'visible' });
  assert.equal(await page.locator('#miningindicator').isDisabled(), true);
  await page.click('#depart');
  await page.waitForFunction(() => !document.querySelector('#combatindicator').disabled);
  assert.equal(await page.locator('#combatcontrols').isVisible(), false);
  await page.locator('#combatindicator').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#combatindicator').getAttribute('aria-expanded'), 'true');
  await page.click('#combatdelegate');
  await page.waitForTimeout(100);
  assert.ok(sent.some((m) => m.t === 'combat' && m.op === 'delegate' && m.on));
  await page.click('#combatassist');
  await page.click('#combatstop');
  assert.ok(sent.some((m) => m.t === 'combat' && m.op === 'assist'));
  assert.ok(sent.some((m) => m.t === 'combat' && m.op === 'off'));
  await page.locator('#combatstop').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#combatindicator').getAttribute('aria-expanded'), 'false');
  await page.click('#miningindicator');
  await page.click('#miningsurvey');
  assert.ok(sent.some((m) => m.t === 'mining' && m.op === 'survey'));
  // Explicit UI capability fixture: server action outcomes have separate network suites.
  await page.evaluate(() => {
    window.savedYou = structuredClone(G.you);
    G.you.ship.hull = 815;
    const bay = Object.values(G.A.weapons).find((w) => w.type === 'bay');
    G.you.shipStats.weapons[bay.id] = 1;
    G.you.shipStats.towRig = true;
    const you = G.you;
    Object.defineProperty(G, 'you', { configurable: true, get: () => you, set: () => {} });
    const towing = { rig: true, attached: 0, offers: [], objects: [], ports: [] };
    Object.defineProperty(G, 'towing', { configurable: true, get: () => towing, set: () => {} });
  });
  await page.waitForFunction(
    () => !document.querySelector('#dronesindicator').classList.contains('hidden'),
  );
  for (const id of ['combat', 'mining', 'towing', 'industrial', 'fleet', 'drones']) {
    const b = page.locator('#' + id + 'indicator');
    if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#functionstack img, #hailindicator img')].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  assert.equal(
    await page.locator('#hailindicator img').getAttribute('src'),
    'assets/hud/comms.svg',
  );
  assert.equal(await page.locator('#functionstack img').count(), 5);
  await page.locator('[data-order="hold"]').click();
  assert.ok(sent.some((m) => m.t === 'order' && m.o === 'hold'));
  await page.click('#dronetoggle');
  await page.waitForTimeout(220);
  assert.ok(sent.some((m) => m.t === 'input' && m.f2 === 1));
  assert.equal(sent.filter((m) => m.t === 'input').at(-1).f2, 0);
  await page.evaluate(() => {
    document.querySelectorAll('#functionstack details').forEach((d) => (d.open = true));
    const log = document.querySelector('#chatlog');
    for (let i = 0; i < 80; i++) {
      const d = document.createElement('div');
      d.textContent = 'Captain ' + i + ': long flight message ' + 'navigation '.repeat(15);
      log.append(d);
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
    await page.evaluate((s) => {
      G.opts.scale = s;
      document.documentElement.style.setProperty('--ui', s);
      document.body.classList.toggle('scaled', s !== 1);
    }, scale);
    const bounds = await page.evaluate(() => {
      const rect = (id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      return {
        stack: rect('functionstack'),
        chat: rect('chat'),
        bar: rect('cbar'),
        root: rect('shipfunctions'),
        panels: [...document.querySelectorAll('.function-panel:not(.hidden)')].map((p) => ({
          id: p.id,
          top: p.getBoundingClientRect().top,
          bottom: p.getBoundingClientRect().bottom,
        })),
      };
    });
    assert.ok(bounds.stack.bottom <= bounds.chat.y + 1);
    assert.ok(bounds.chat.bottom <= bounds.bar.y + 1);
    assert.ok(bounds.root.x >= 0 && bounds.root.right <= width && bounds.root.y >= 0);
    for (let i = 1; i < bounds.panels.length; i++)
      assert.ok(bounds.panels[i].top >= bounds.panels[i - 1].bottom, 'panels never overlap');
    await page.locator('#chatin').focus();
    await page.locator('#dronetoggle').focus();
    const visible = await page.locator('#dronetoggle').evaluate((el) => {
      const a = el.getBoundingClientRect(),
        b = document.querySelector('#functionstack').getBoundingClientRect();
      return a.top >= b.top && a.bottom <= b.bottom;
    });
    assert.ok(visible, 'keyboard reaches final function');
    await page.locator('#functionstack').hover();
    await page.mouse.wheel(0, -5000);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#functionstack').evaluate((e) => e.scrollTop), 0);
    await page.locator('#chatlog').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#chatlog').scrollTop > 0);
    assert.ok(
      await page.locator('#chatlog').evaluate((e) => e.scrollTop > 0),
      'chat history scrolls',
    );
    await page.fill('#chatin', 'HUD regression message');
    assert.equal(await page.inputValue('#chatin'), 'HUD regression message');
    await page.fill('#chatin', '');
    await page.screenshot({ path: path.join(f.out, 'layout-' + width + '-' + scale + '.png') });
    results.push({ width, height, scale, ...bounds });
  }
  fs.writeFileSync(path.join(f.out, 'bounds.json'), JSON.stringify(results, null, 2));
  assert.deepEqual(errors, []);
  console.log(
    'Ship-function keyboard/actions, six-entry stack, chat separation, scroll and responsive bounds passed.',
  );
} catch (e) {
  await failureEvidence(browser, f.out, e);
  throw e;
} finally {
  await f.close(browser);
}
