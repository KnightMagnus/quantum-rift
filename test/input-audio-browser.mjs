// Device emulation checks actual outgoing controls; audio checks mixer state, not audibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';

const out = evidenceDir('input-audio');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-input-audio-'));
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
const db = new DB(path.join(dir, 'data'));
const d = Game.prototype.fresh.call({ A });
d.tut = 999;
d.story = { done: ['start'], active: null };
db.create('Input Audio', 'fixture', d);
db.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(dir, 'data'),
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    window.fixturePad = null;
    navigator.getGamepads = () => (window.fixturePad ? [window.fixturePad] : []);
    window.fixtureInputs = [];
    const original = WebSocket.prototype.send;
    WebSocket.prototype.send = function (raw) {
      try {
        const value = JSON.parse(raw);
        if (value.t === 'input') window.fixtureInputs.push(value);
        if (window.fixtureInputs.length > 300) window.fixtureInputs.shift();
      } catch {}
      return original.call(this, raw);
    };
  });
  await page.goto(origin);
  await page.locator('[data-slot="Input Audio"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);

  await page.keyboard.press('o');
  for (const [id, value] of [
    ['vol', 0.35],
    ['radio', 0.45],
    ['sfx', 0.25],
  ]) {
    await page.locator('#opt-' + id).evaluate((input, v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  await page.locator('#opt-mute').check();
  assert.deepEqual(
    await page.evaluate(async () => {
      const audio = await import('/audio.js');
      return { mute: G.opts.mute, volume: audio.volume, radio: G.opts.radio, sfx: G.opts.sfx };
    }),
    { mute: true, volume: 0.35, radio: 0.45, sfx: 0.25 },
  );
  await page.locator('#optclose').click();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('n');
  await page.waitForFunction(() => !G.opts.mute);
  await page.reload();
  await page.locator('[data-slot="Input Audio"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  assert.deepEqual(
    await page.evaluate(() => ({
      vol: G.opts.vol,
      radio: G.opts.radio,
      sfx: G.opts.sfx,
      mute: G.opts.mute,
    })),
    { vol: 0.35, radio: 0.45, sfx: 0.25, mute: false },
  );
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);

  await page.evaluate(() => {
    window.fixtureInputs = [];
    window.fixturePad = {
      axes: [0.8, -0.8],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    };
  });
  await page.waitForFunction(() =>
    window.fixtureInputs.some((input) => input.th === 1 && input.tu === 1),
  );
  await page.evaluate(() => {
    window.fixtureInputs = [];
    window.fixturePad.axes = [0.1, 0.1];
  });
  await page.waitForFunction(() => window.fixtureInputs.some((input) => !input.th && !input.tu));
  await page.evaluate(() => {
    window.fixtureInputs = [];
    window.fixturePad.buttons[0].pressed = true;
  });
  await page.waitForFunction(() => window.fixtureInputs.some((input) => input.f1 === 1));
  await page.evaluate(() => {
    window.fixturePad = null;
    window.fixtureInputs = [];
  });

  // Dispatch genuine TouchEvent objects into the production handlers.
  await page.locator('#tbtns [data-k="fire1"]').evaluate((button) => {
    button.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => window.fixtureInputs.some((input) => input.f1 === 1));
  await page.locator('#tbtns [data-k="fire1"]').evaluate((button) => {
    button.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    window.fixtureInputs = [];
  });
  await page.waitForFunction(() => window.fixtureInputs.some((input) => !input.f1));
  await page
    .locator('#tbtns [data-tap="map"]')
    .evaluate((button) =>
      button.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true })),
    );
  await page.waitForFunction(() => !document.querySelector('#gmap').classList.contains('hidden'));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        mixerAndMute: true,
        settingsPersisted: true,
        gamepadAxesDeadzoneFire: true,
        touchFireReleaseMap: true,
        errors,
        limits:
          'Emulated APIs; no physical controller/touch hardware or audible sound verification.',
      },
      null,
      2,
    ),
  );
  console.log(
    'Input/audio: persistent mixer/mute, emulated gamepad axes/deadzone/fire and touch fire/release/map PASS',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
