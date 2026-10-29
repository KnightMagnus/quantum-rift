import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import path from 'node:path';

import { towingFixture } from './helpers/towing-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await towingFixture('mining-keys');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
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
    const send = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
    WebSocket.prototype.send = function (packetData) {
      try {
        wire.push(JSON.parse(packetData as string));
      } catch {}
      return send.call(this, packetData);
    };
  });
  await page.goto(feature.origin);
  await page.fill('#lname', 'Tow Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.keyboard.press('BracketLeft');
  assert.equal(
    await page.evaluate(
      () => wire.filter((recordedInput) => recordedInput.t === 'industrial').length,
    ),
    0,
    'landed keys blocked',
  );
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.press('Backquote');
  await page.waitForSelector('#miningcontrols:not(.hidden)');
  await page.waitForFunction(() => document.getElementById('towtoggle')!.textContent.includes(','));
  assert.match((await page.locator('#towtoggle').textContent())!, /,/);
  assert.match((await page.locator('#dredgeSweep').textContent())!, /\[/);
  // Real keyboard dispatch for every industrial action; no direct UI invocation.
  for (const [entryKey, operation] of [
    ['BracketLeft', 'sweep'],
    ['BracketRight', 'harvest'],
    ['Semicolon', 'smelter'],
    ['Backslash', 'off'],
    ['Equal', 'recipe'],
  ]) {
    await page.keyboard.press(entryKey);
    await page.waitForFunction(
      (operation2) =>
        wire.some(
          (recordedInput2) => recordedInput2.t === 'industrial' && recordedInput2.op === operation2,
        ),
      operation,
    );
  }
  await page.keyboard.press('Minus');
  await page.waitForFunction(() =>
    wire.some(
      (recordedInput3) => recordedInput3.t === 'miningPressure' && recordedInput3.op === 'join',
    ),
  );
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => G.towing!.objects[0].revealed);
  await page.keyboard.down('Comma');
  await page.waitForFunction(() => G.towing!.attached);
  await page.keyboard.down('Comma'); // repeat flag: do not detach again
  await page.waitForTimeout(120);
  await page.keyboard.up('Comma');
  assert.equal(
    await page.evaluate(
      () =>
        wire.filter(
          (recordedInput4) =>
            recordedInput4.t === 'towing' &&
            ['attach', 'detach'].includes(String(recordedInput4.op)),
        ).length,
    ),
    1,
    'repeat is edge-triggered',
  );
  await page.keyboard.press('Period');
  await page.waitForFunction(() =>
    wire.some((recordedInput5) => recordedInput5.t === 'towing' && recordedInput5.op === 'deliver'),
  );
  await page.screenshot({
    path: path.join(feature.out, 'mining-default-shortcuts.png'),
    animations: 'disabled',
  });
  // Text/select editing and modal keys must never invoke mining operations.
  await page.locator('#towingindicator').click();
  await page.getByText('Transfer & towing help', { exact: true }).click();
  await page.fill('#towrecipient', 'Pilot');
  const count = () =>
    page.evaluate(
      () =>
        wire.filter((recordedInput6) =>
          ['towing', 'industrial', 'mining', 'miningPressure'].includes(recordedInput6.t),
        ).length,
    );
  let before = await count();
  await page.keyboard.press('Comma');
  await page.keyboard.press('BracketLeft');
  assert.equal(await count(), before, 'typing blocks actions');
  await page.locator('#towrecipient').blur();
  await page.locator('#optbtn').click();
  before = await count();
  await page.keyboard.press('Comma');
  await page.keyboard.press('BracketLeft');
  assert.equal(await count(), before, 'options block actions');
  await page.locator('[data-bind="towToggle"]').click();
  await page.keyboard.press('F8');
  await page.locator('#optclose').click();
  await page.waitForFunction(() =>
    document.getElementById('towtoggle')!.textContent.includes('F8'),
  );
  before = await count();
  await page.keyboard.press('Comma');
  assert.equal(await count(), before, 'old binding no longer dispatches');
  await page.keyboard.press('F8');
  await page.waitForFunction(() => !G.towing!.attached);
  await page.locator('#optbtn').click();
  await page.locator('[data-bind="towToggle"]').click();
  await page.keyboard.press('Backspace');
  await page.click('#optclose');
  await page.waitForFunction(() =>
    document.getElementById('towtoggle')!.textContent.includes('assign key'),
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
    path: path.join(feature.out, 'mining-keyboard-controls.png'),
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
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
