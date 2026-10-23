// Device emulation checks actual outgoing controls; audio checks mixer state, not audibility.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const output = evidenceDir('input-audio');
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-input-audio-'));
const assets = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString(),
);
const database = new Database(path.join(directory, 'data'));
const playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
  import('../server/game.ts').Game['fresh']
> & { story?: { done: string[]; active: null; step: number } };
playerData.tut = 999;
playerData.story = { done: ['start'], active: null, step: 0 };
database.create('Input Audio', 'fixture', playerData);
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(directory, 'data'),
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    window.fixturePad = null;
    navigator.getGamepads = () =>
      window.fixturePad ? [window.fixturePad as unknown as Gamepad] : [];
    window.fixtureInputs = [];
    const original = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
    WebSocket.prototype.send = function (packetData) {
      try {
        const value = JSON.parse(packetData as string);
        if (value.t === 'input') window.fixtureInputs.push(value);
        if (window.fixtureInputs.length > 300) window.fixtureInputs.shift();
      } catch {}
      return original.call(this, packetData);
    };
  });
  await page.goto(origin);
  await page.locator('[data-slot="Input Audio"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);

  await page.keyboard.press('o');
  for (const [identifier, value] of [
    ['vol', 0.35],
    ['radio', 0.45],
    ['sfx', 0.25],
  ]) {
    await page.locator('#opt-' + identifier).evaluate((input, volumeSetting) => {
      (input as HTMLInputElement).value = String(volumeSetting);
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
  await page.evaluate(() => (document.activeElement! as HTMLElement).blur());
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
    window.fixturePad!.axes = [0.1, 0.1];
  });
  await page.waitForFunction(() => window.fixtureInputs.some((input) => !input.th && !input.tu));
  await page.evaluate(() => {
    window.fixtureInputs = [];
    window.fixturePad!.buttons[0].pressed = true;
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
  await page.waitForFunction(
    () => !document.querySelector<HTMLElement>('#gmap')!.classList.contains('hidden'),
  );
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
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
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
