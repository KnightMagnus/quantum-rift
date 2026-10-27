import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import { type Browser } from 'playwright';
import { miningFixture, until } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('mining-controls');
let browser: Browser | undefined;
const errors: string[] = [];
async function pageFor(
  name: string,
  opts?: {
    v21: boolean;
    keys: { fire1: string; fire2: string; stop: null; externalAction: string };
    presetName: string;
    externalPreset: { label: string; mouseAim: boolean };
    mouseAim: boolean;
    cb: boolean;
    scale: number;
    vol: number;
    shake: boolean;
  },
) {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.addInitScript((opts) => {
    if (opts) localStorage.setItem('rift.opts', JSON.stringify(opts));
    window.wire = [];
    const send = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
    WebSocket.prototype.send = function (packetData) {
      try {
        wire.push(JSON.parse(packetData as string));
      } catch {}
      return send.call(this, packetData);
    };
  }, opts);
  await page.goto(feature.origin);
  await page.locator('#lname').fill(name);
  await page.locator('#lpass').fill('fixture');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  return { context, page };
}
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const firstCaptain = await pageFor('Mining Alpha');
  assert.equal(await firstCaptain.page.evaluate(() => G.opts.keys.surveyPulse), 'KeyV');
  await firstCaptain.page.keyboard.press('v');
  assert.equal(
    await firstCaptain.page.evaluate(() => wire.filter((message) => message.t === 'mining').length),
    0,
    'landed no survey',
  );
  await firstCaptain.page.locator('#depart').click();
  await firstCaptain.page.waitForFunction(() => G.view && !G.landed);
  await firstCaptain.page.keyboard.press('o');
  await firstCaptain.page.keyboard.press('v');
  assert.equal(
    await firstCaptain.page.evaluate(() => wire.filter((message) => message.t === 'mining').length),
    0,
    'options no survey',
  );
  await firstCaptain.page.locator('#optclose').click();
  await firstCaptain.page.locator('#chatin').focus();
  await firstCaptain.page.keyboard.press('v');
  assert.equal(
    await firstCaptain.page.evaluate(() => wire.filter((message) => message.t === 'mining').length),
    0,
    'chat no survey',
  );
  await firstCaptain.page.locator('#chatin').fill('');
  await firstCaptain.page.locator('#chatin').blur();
  await firstCaptain.page.keyboard.press('v');
  await firstCaptain.page.waitForFunction(() => !!G.mining && G.mining.revealUntil > G.mining.now);
  const keyPacket = await firstCaptain.page.evaluate(() =>
    wire.find((message) => message.t === 'mining'),
  );
  assert.deepEqual(keyPacket, { t: 'mining', op: 'survey' });
  await firstCaptain.page.keyboard.down('f');
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Mining Alpha')
        ?.drones.length,
    'F launches real drones',
  );
  await firstCaptain.page.keyboard.up('f');
  await until(
    () =>
      !feature.read()?.pilots.find((player: { name: string }) => player.name === 'Mining Alpha')
        ?.inp?.fire2,
    'F release reaches server',
  );
  await firstCaptain.page.keyboard.down('f');
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Mining Alpha')
        ?.drones.length === 0,
    'F recalls real drones',
  );
  await firstCaptain.page.keyboard.up('f');
  await firstCaptain.page.keyboard.down('ArrowLeft');
  await firstCaptain.page.waitForFunction(() =>
    wire.some((message) => message.t === 'input' && message.tu === -1),
  );
  await firstCaptain.page.keyboard.up('ArrowLeft');
  await firstCaptain.page.keyboard.down('ShiftRight');
  await firstCaptain.page.waitForFunction(() =>
    wire.some((message) => message.t === 'input' && message.ab === 1),
  );
  await firstCaptain.page.keyboard.up('ShiftRight');
  await firstCaptain.page.screenshot({
    path: path.join(feature.out, 'default-survey-controls.png'),
    animations: 'disabled',
  });
  await firstCaptain.context.close();
  const saved = {
    v21: true,
    keys: { fire1: 'KeyV', fire2: 'KeyQ', stop: null, externalAction: 'KeyH' },
    presetName: 'Veteran miner',
    externalPreset: { label: 'custom', mouseAim: true },
    mouseAim: true,
    cb: true,
    scale: 1.4,
    vol: 0.27,
    shake: false,
  };
  const secondCaptain = await pageFor('Mining Bravo', saved);
  assert.deepEqual(
    await secondCaptain.page.evaluate(() => ({
      fire1: G.opts.keys.fire1,
      fire2: G.opts.keys.fire2,
      stop: G.opts.keys.stop,
      survey: G.opts.keys.surveyPulse,
      preset: G.opts.presetName,
      external: G.opts.externalPreset,
      mouse: G.opts.mouseAim,
      cb: G.opts.cb,
      scale: G.opts.scale,
      vol: G.opts.vol,
      shake: G.opts.shake,
    })),
    {
      fire1: 'KeyV',
      fire2: 'KeyQ',
      stop: null,
      survey: null,
      preset: 'Veteran miner',
      external: { label: 'custom', mouseAim: true },
      mouse: true,
      cb: true,
      scale: 1.4,
      vol: 0.27,
      shake: false,
    },
  );
  await secondCaptain.page.locator('#depart').click();
  await secondCaptain.page.waitForFunction(() => G.view && !G.landed);
  await secondCaptain.page.locator('#miningindicator').click();
  await secondCaptain.page.locator('#miningsurvey').click();
  await secondCaptain.page.waitForFunction(() => G.mining!.revealUntil > G.mining!.now);
  assert.deepEqual(
    await secondCaptain.page.evaluate(() => wire.find((message) => message.t === 'mining')),
    keyPacket,
    'context and keyboard same request',
  );
  assert.match((await secondCaptain.page.locator('#miningsurvey').textContent())!, /assign key/);
  await secondCaptain.page.keyboard.press('o');
  await secondCaptain.page.locator('[data-bind="surveyPulse"]').click();
  await secondCaptain.page.keyboard.press('u');
  await secondCaptain.page.waitForFunction(() => G.opts.keys.surveyPulse === 'KeyU');
  await secondCaptain.page.locator('[data-bind="surveyPulse"]').click();
  await secondCaptain.page.keyboard.press('Backspace');
  await secondCaptain.page.waitForFunction(() => G.opts.keys.surveyPulse === null);
  await secondCaptain.page.locator('#optclose').click();
  await secondCaptain.page.reload();
  await secondCaptain.page.locator('#lpass').fill('fixture');
  await secondCaptain.page.locator('#lbtn').click();
  await secondCaptain.page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await secondCaptain.page.evaluate(() => G.opts.keys.surveyPulse),
    null,
    'explicit unbound persists reload',
  );
  assert.equal(await secondCaptain.page.evaluate(() => G.opts.keys.fire2), 'KeyQ');
  await secondCaptain.page.keyboard.press('o');
  await secondCaptain.page.locator('#optreset').click();
  assert.equal(
    await secondCaptain.page.evaluate(() => G.opts.keys.fire2),
    undefined,
    'reset is explicit user choice',
  );
  assert.equal(
    await secondCaptain.page.evaluate(() => G.opts.presetName),
    'Veteran miner',
    'reset keys preserves external metadata',
  );
  await secondCaptain.page.screenshot({
    path: path.join(feature.out, 'custom-bindings.png'),
    animations: 'disabled',
  });
  assert.deepEqual(errors, []);
  console.log(
    'Real browser default/custom/unbound/additive keys, metadata, keyboard/context survey, F drone launch/recall, alternate controls, modal/chat/landed denial, rebind/reset/reload passed.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
