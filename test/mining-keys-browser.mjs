import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { towingFixture } from './helpers/towing-play-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await towingFixture('mining-keys');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    if (!localStorage.getItem('rift.opts'))
      localStorage.setItem(
        'rift.opts',
        JSON.stringify({
          v21: true,
          keys: { dredgeSweep: null, dredgeHarvest: null, dredgeSmelter: null, towToggle: null },
          mute: true,
        }),
      );
    window.wire = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (raw) {
      try {
        wire.push(JSON.parse(raw));
      } catch {}
      return send.call(this, raw);
    };
  });
  await page.goto(f.origin);
  await page.fill('#lname', 'Tow Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.keyboard.press('BracketLeft');
  assert.equal(
    await page.evaluate(() => wire.filter((x) => x.t === 'industrial').length),
    0,
    'landed keys blocked',
  );
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.press('Backquote');
  await page.waitForSelector('#miningcontrols:not(.hidden)');
  await page.waitForFunction(() => document.getElementById('towtoggle').textContent.includes(','));
  assert.match(await page.locator('#towtoggle').textContent(), /,/);
  assert.match(await page.locator('#dredgeSweep').textContent(), /\[/);
  // Real keyboard dispatch for every industrial action; no direct UI invocation.
  for (const [key, op] of [
    ['BracketLeft', 'sweep'],
    ['BracketRight', 'harvest'],
    ['Semicolon', 'smelter'],
    ['Backslash', 'off'],
    ['Equal', 'recipe'],
  ]) {
    await page.keyboard.press(key);
    await page.waitForFunction((op) => wire.some((x) => x.t === 'industrial' && x.op === op), op);
  }
  await page.keyboard.press('Minus');
  await page.waitForFunction(() => wire.some((x) => x.t === 'miningPressure' && x.op === 'join'));
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => G.towing.objects[0].revealed);
  await page.keyboard.down('Comma');
  await page.waitForFunction(() => G.towing.attached);
  await page.keyboard.down('Comma'); // repeat flag: do not detach again
  await page.waitForTimeout(120);
  await page.keyboard.up('Comma');
  assert.equal(
    await page.evaluate(
      () => wire.filter((x) => x.t === 'towing' && ['attach', 'detach'].includes(x.op)).length,
    ),
    1,
    'repeat is edge-triggered',
  );
  await page.keyboard.press('Period');
  await page.waitForFunction(() => wire.some((x) => x.t === 'towing' && x.op === 'deliver'));
  await page.screenshot({
    path: path.join(f.out, 'mining-default-shortcuts.png'),
    animations: 'disabled',
  });
  // Text/select editing and modal keys must never invoke mining operations.
  await page.locator('#towingindicator').click();
  await page.getByText('Transfer & towing help', { exact: true }).click();
  await page.fill('#towrecipient', 'Pilot');
  const count = () =>
    page.evaluate(
      () =>
        wire.filter((x) => ['towing', 'industrial', 'mining', 'miningPressure'].includes(x.t))
          .length,
    );
  let before = await count();
  await page.keyboard.press('Comma');
  await page.keyboard.press('BracketLeft');
  assert.equal(await count(), before, 'typing blocks actions');
  await page.locator('#towrecipient').blur();
  await page.keyboard.press('KeyO');
  before = await count();
  await page.keyboard.press('Comma');
  await page.keyboard.press('BracketLeft');
  assert.equal(await count(), before, 'options block actions');
  await page.locator('[data-bind="towToggle"]').click();
  await page.keyboard.press('F8');
  await page.locator('#optclose').click();
  await page.waitForFunction(() => document.getElementById('towtoggle').textContent.includes('F8'));
  before = await count();
  await page.keyboard.press('Comma');
  assert.equal(await count(), before, 'old binding no longer dispatches');
  await page.keyboard.press('F8');
  await page.waitForFunction(() => !G.towing.attached);
  await page.keyboard.press('KeyO');
  await page.locator('[data-bind="towToggle"]').click();
  await page.keyboard.press('Backspace');
  await page.click('#optclose');
  await page.waitForFunction(() =>
    document.getElementById('towtoggle').textContent.includes('assign key'),
  );
  await page.keyboard.press('KeyI');
  before = await count();
  await page.keyboard.press('BracketLeft');
  assert.equal(await count(), before, 'ship information overlay blocks mining shortcuts');
  await page.keyboard.press('KeyI');
  // No action sends for unavailable offers or industrial-only actions on other hulls.
  before = await count();
  await page.keyboard.press('End');
  assert.equal(await count(), before, 'no phantom accept');
  await page.screenshot({
    path: path.join(f.out, 'mining-keyboard-controls.png'),
    animations: 'disabled',
  });
  await page.reload();
  await page.waitForFunction(() => G.opts?.miningKeysVersion === 1);
  assert.equal(
    await page.evaluate(() => G.opts.keys.towToggle),
    null,
    'explicit unbind survives reload',
  );
  assert.equal(await page.evaluate(() => G.opts.keys.dredgeSweep), 'BracketLeft');
  assert.deepEqual(errors, []);
  console.log(
    'Mining real default/legacy keys, one-shot repeats, typing/modal/landed denial, shared dispatch, rebind/unbind and effective labels passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
