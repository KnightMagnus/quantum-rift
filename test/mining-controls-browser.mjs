import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture, until } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await miningFixture('mining-controls');
let browser;
const errors = [];
async function pageFor(name, opts) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((opts) => {
    if (opts) localStorage.setItem('rift.opts', JSON.stringify(opts));
    window.wire = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (raw) {
      try {
        wire.push(JSON.parse(raw));
      } catch {}
      return send.call(this, raw);
    };
  }, opts);
  await page.goto(f.origin);
  await page.locator('#lname').fill(name);
  await page.locator('#lpass').fill('fixture');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  return { context, page };
}
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const a = await pageFor('Mining Alpha');
  assert.equal(await a.page.evaluate(() => G.opts.keys.surveyPulse), 'KeyV');
  await a.page.keyboard.press('v');
  assert.equal(
    await a.page.evaluate(() => wire.filter((m) => m.t === 'mining').length),
    0,
    'landed no survey',
  );
  await a.page.locator('#depart').click();
  await a.page.waitForFunction(() => G.view && !G.landed);
  await a.page.keyboard.press('o');
  await a.page.keyboard.press('v');
  assert.equal(
    await a.page.evaluate(() => wire.filter((m) => m.t === 'mining').length),
    0,
    'options no survey',
  );
  await a.page.locator('#optclose').click();
  await a.page.locator('#chatin').focus();
  await a.page.keyboard.press('v');
  assert.equal(
    await a.page.evaluate(() => wire.filter((m) => m.t === 'mining').length),
    0,
    'chat no survey',
  );
  await a.page.locator('#chatin').fill('');
  await a.page.locator('#chatin').blur();
  await a.page.keyboard.press('v');
  await a.page.waitForFunction(() => G.mining?.revealUntil > G.mining.now);
  const keyPacket = await a.page.evaluate(() => wire.find((m) => m.t === 'mining'));
  assert.deepEqual(keyPacket, { t: 'mining', op: 'survey' });
  await a.page.keyboard.down('f');
  await until(
    () => f.read()?.pilots.find((p) => p.name === 'Mining Alpha')?.drones.length,
    'F launches real drones',
  );
  await a.page.keyboard.up('f');
  await until(
    () => !f.read()?.pilots.find((p) => p.name === 'Mining Alpha')?.inp?.fire2,
    'F release reaches server',
  );
  await a.page.keyboard.down('f');
  await until(
    () => f.read()?.pilots.find((p) => p.name === 'Mining Alpha')?.drones.length === 0,
    'F recalls real drones',
  );
  await a.page.keyboard.up('f');
  await a.page.keyboard.down('ArrowLeft');
  await a.page.waitForFunction(() => wire.some((m) => m.t === 'input' && m.tu === -1));
  await a.page.keyboard.up('ArrowLeft');
  await a.page.keyboard.down('ShiftRight');
  await a.page.waitForFunction(() => wire.some((m) => m.t === 'input' && m.ab === 1));
  await a.page.keyboard.up('ShiftRight');
  await a.page.screenshot({
    path: path.join(f.out, 'default-survey-controls.png'),
    animations: 'disabled',
  });
  await a.context.close();
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
  const b = await pageFor('Mining Bravo', saved);
  assert.deepEqual(
    await b.page.evaluate(() => ({
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
  await b.page.locator('#depart').click();
  await b.page.waitForFunction(() => G.view && !G.landed);
  await b.page.locator('#miningindicator').click();
  await b.page.locator('#miningsurvey').click();
  await b.page.waitForFunction(() => G.mining.revealUntil > G.mining.now);
  assert.deepEqual(
    await b.page.evaluate(() => wire.find((m) => m.t === 'mining')),
    keyPacket,
    'context and keyboard same request',
  );
  assert.match(await b.page.locator('#miningsurvey').textContent(), /assign key/);
  await b.page.keyboard.press('o');
  await b.page.locator('[data-bind="surveyPulse"]').click();
  await b.page.keyboard.press('u');
  await b.page.waitForFunction(() => G.opts.keys.surveyPulse === 'KeyU');
  await b.page.locator('[data-bind="surveyPulse"]').click();
  await b.page.keyboard.press('Backspace');
  await b.page.waitForFunction(() => G.opts.keys.surveyPulse === null);
  await b.page.locator('#optclose').click();
  await b.page.reload();
  await b.page.locator('#lpass').fill('fixture');
  await b.page.locator('#lbtn').click();
  await b.page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await b.page.evaluate(() => G.opts.keys.surveyPulse),
    null,
    'explicit unbound persists reload',
  );
  assert.equal(await b.page.evaluate(() => G.opts.keys.fire2), 'KeyQ');
  await b.page.keyboard.press('o');
  await b.page.locator('#optreset').click();
  assert.equal(
    await b.page.evaluate(() => G.opts.keys.fire2),
    undefined,
    'reset is explicit user choice',
  );
  assert.equal(
    await b.page.evaluate(() => G.opts.presetName),
    'Veteran miner',
    'reset keys preserves external metadata',
  );
  await b.page.screenshot({
    path: path.join(f.out, 'custom-bindings.png'),
    animations: 'disabled',
  });
  assert.deepEqual(errors, []);
  console.log(
    'Real browser default/custom/unbound/additive keys, metadata, keyboard/context survey, F drone launch/recall, alternate controls, modal/chat/landed denial, rebind/reset/reload passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
