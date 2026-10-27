import { launchChromium } from './helpers/chromium.ts';
// Device emulation checks actual outgoing controls; audio checks mixer state, not audibility.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

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
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const autoplayPage = await browser.newPage();
  const autoplayErrors: string[] = [];
  autoplayPage.on('pageerror', (error) => autoplayErrors.push(String(error)));
  await autoplayPage.goto(origin);
  // Playwright evaluations can grant user activation. Read via CDP with gestures disabled.
  const autoplaySession = await autoplayPage.context().newCDPSession(autoplayPage);
  const autoplayState = await autoplaySession.send('Runtime.evaluate', {
    expression: `(async () => {
      const audio = await import('/audio.js');
      const end = performance.now() + 15000;
      while (performance.now() < end) {
        if (audio.debug().ctx === 'running' && audio.debug().music)
          return { ...audio.debug(), activated: navigator.userActivation.hasBeenActive };
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error('Login music did not autoplay');
    })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  assert.equal(autoplayState.exceptionDetails, undefined);
  assert.equal(
    autoplayState.result.value.activated,
    false,
    'Login music starts with a running audio context before any user gesture',
  );
  assert.deepEqual(autoplayErrors, []);
  await browser.close();
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'],
  });
  const keyboardPage = await browser.newPage();
  await keyboardPage.goto(origin);
  const keyboardSession = await keyboardPage.context().newCDPSession(keyboardPage);
  const keyboardInitial = await keyboardSession.send('Runtime.evaluate', {
    expression: `(async () => ({ ...(await import('/audio.js')).debug(), activated: navigator.userActivation.hasBeenActive }))()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  assert.equal(keyboardInitial.exceptionDetails, undefined);
  assert.equal(keyboardInitial.result.value.activated, false);
  assert.equal(keyboardInitial.result.value.ctx, 'suspended');
  await keyboardPage.keyboard.press('Tab');
  // Poll synchronously: an async predicate returns a truthy Promise before decode finishes.
  await keyboardPage.waitForFunction(() => {
    const audio = window.RiftAudio.debug();
    return audio.ctx === 'running' && audio.music;
  });
  assert.equal(
    await keyboardPage.evaluate(async () => (await import('/audio.js')).debug().music),
    true,
  );
  await keyboardPage.close();
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
  const blockedSession = await context.newCDPSession(page);
  const blockedState = await blockedSession.send('Runtime.evaluate', {
    expression: `(async () => {
      const audio = await import('/audio.js');
      const end = performance.now() + 15000;
      while (!audio.debug().music && performance.now() < end)
        await new Promise(resolve => setTimeout(resolve, 50));
      return { ...audio.debug(), activated: navigator.userActivation.hasBeenActive };
    })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  assert.equal(blockedState.exceptionDetails, undefined);
  assert.equal(blockedState.result.value.music, true, 'Blocked theme is queued');
  assert.equal(blockedState.result.value.activated, false);
  assert.equal(
    blockedState.result.value.ctx,
    'suspended',
    'Blocked autoplay queues the theme without bypassing browser policy',
  );
  await page.locator('#lname').click();
  await page.waitForFunction(() => window.RiftAudio.debug().ctx === 'running');
  await page.locator('[data-slot="Input Audio"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await page.evaluate(async () => (await import('/audio.js')).debug().music),
    false,
    'Entering the game stops the login theme',
  );
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
  const noticeTiming = await page.evaluate(async () => {
    const { toast } = await import('/ui.js');
    const container = document.querySelector('#toasts')!;
    container.replaceChildren();
    const started = performance.now();
    toast('Newcomer protection: timing fixture; the message should last ten seconds.');
    const notice = container.querySelector('.newcomer-protection')!;
    const animation = getComputedStyle(notice).animationDuration;
    let ordinaryAnimation;
    for (let i = 0; i < 5; i++) {
      toast(`Ordinary timing fixture ${i}`);
      ordinaryAnimation = getComputedStyle(container.lastElementChild!).animationDuration;
    }
    const survivedBurst = notice.isConnected && container.children.length === 4;
    const observed = (delay: number) =>
      new Promise<{ connected: boolean; opacity: number; count: number }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              connected: notice.isConnected,
              opacity: Number(getComputedStyle(notice).opacity),
              count: container.children.length,
            }),
          delay,
        ),
      );
    const removed = new Promise<number>((resolve) => {
      const watcher = new MutationObserver(() => {
        if (!notice.isConnected) {
          watcher.disconnect();
          resolve(performance.now() - started);
        }
      });
      watcher.observe(container, { childList: true });
    });
    const [midway, nearEnd, removedAt] = await Promise.all([
      observed(5400),
      observed(9700),
      removed,
    ]);
    return { animation, ordinaryAnimation, survivedBurst, midway, nearEnd, removedAt };
  });
  assert.equal(noticeTiming.animation, '10s');
  assert.equal(noticeTiming.ordinaryAnimation, '5s', 'Other notice animations are unchanged');
  assert.ok(noticeTiming.survivedBurst, 'Newcomer notice survives a burst of ordinary notices');
  assert.ok(noticeTiming.midway.connected && noticeTiming.midway.opacity > 0.9);
  assert.equal(noticeTiming.midway.count, 1, 'Ordinary notices still expire normally');
  assert.ok(noticeTiming.nearEnd.connected && noticeTiming.nearEnd.opacity > 0);
  assert.ok(noticeTiming.removedAt >= 9900 && noticeTiming.removedAt <= 12000);
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        loginAutoplay: true,
        blockedAutoplayGestureFallback: true,
        loginMusicStopsInGame: true,
        newcomerNoticeTiming: noticeTiming,
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
