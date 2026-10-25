import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

declare global {
  interface Window {
    /** Outgoing actions and confirmation calls observed by this isolated fixture. */
    modalProbe: { packets: Record<string, unknown>[]; confirmations: number };
  }
}
const output = evidenceDir('overlay-input');
const directory = tempDataDir('overlay-input-');
const database = new DB(path.join(directory, 'data'));
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
const account = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']>;
account.tut = 999;
Object.assign(account, { story: { done: ['start'], active: null, step: 0 } });
database.create('Modal Pilot', 'fixture', account);
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: database.dir,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('rift.opts', JSON.stringify({ keys: { thrust: 'KeyV' }, mute: true }));
    window.modalProbe = { packets: [], confirmations: 0 };
    window.fixturePad = null;
    window.fixtureInputs = [];
    navigator.getGamepads = () =>
      window.fixturePad ? [window.fixturePad as unknown as Gamepad] : [];
    const original = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        if (typeof data !== 'string') return original.call(this, data);
        const packet = JSON.parse(data);
        window.modalProbe.packets.push(packet);
        if (packet.t === 'input') window.fixtureInputs.push(packet);
      } catch {}
      return original.call(this, data);
    };
  });
  await page.goto(origin);
  await page.locator('[data-slot="Modal Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const ask = async () =>
    page.evaluate(async () => {
      (await import('/ui.js')).ask('A modal fixture', () => window.modalProbe.confirmations++);
    });
  const clearInputs = async () =>
    page.evaluate(() => {
      window.fixtureInputs = [];
    });
  const neutralInputs = async () => {
    await page.waitForFunction(() => window.fixtureInputs.length >= 6);
    assert.equal(
      await page.evaluate(() =>
        window.fixtureInputs.every((p) => !p.th && !p.tu && !p.ab && !p.rv && !p.f1 && !p.f2),
      ),
      true,
    );
  };

  await page.locator('#cbhelp').focus();
  await page.keyboard.press('Escape');
  await page.locator('#quitbox').waitFor({ state: 'visible' });
  await ask();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'askno');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'askyes');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'askno');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#askbox').isVisible(), false);
  assert.equal(
    await page.locator('#quitbox').isVisible(),
    true,
    'One Escape consumes only the top dialog',
  );
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'quitcancel');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !G.paused && !G.quitting);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cbhelp');

  await ask();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => window.modalProbe.confirmations),
    0,
    'Enter preserves native Cancel activation',
  );
  await ask();
  await page.locator('#askyes').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => window.modalProbe.confirmations),
    1,
    'Native Confirm runs exactly once',
  );
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.fixtureInputs.some((p) => p.th === 1));
  await ask();
  await clearInputs();
  await neutralInputs();
  await page.click('#askno');
  await clearInputs();
  await neutralInputs();
  await page.keyboard.up('v');
  await clearInputs();
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.fixtureInputs.some((p) => p.th === 1));
  await page.keyboard.up('v');

  await page.evaluate(() => {
    const own = G.ents.get(G.myId)!;
    G.ents.set(987654, { ...own, fl: 4, rx: G.view!.rx, ry: G.view!.ry });
    G.target = 987654;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }));
  });
  await page.locator('#boardbox').waitFor({ state: 'visible' });
  await ask();
  await page.evaluate(() => {
    window.modalProbe.packets = [];
  });
  await page.keyboard.press('1');
  assert.equal(await page.locator('#askbox').isVisible(), true);
  assert.equal(
    await page.evaluate(() => window.modalProbe.packets.some((p) => p.t === 'board')),
    false,
    'Boarding cannot steal confirmation shortcuts',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#boardbox').isVisible(), true);
  assert.equal(await page.locator('#quitbox').isVisible(), false);
  await page.keyboard.press('2');
  assert.equal(
    await page.locator('#boardbox').isVisible(),
    true,
    'Disabled capture shortcut is denied',
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', code: 'Digit1', repeat: true, bubbles: true }),
    ),
  );
  assert.equal(
    await page.locator('#boardbox').isVisible(),
    true,
    'Repeated boarding key is not an action',
  );
  const creditsBefore = await page.evaluate(() => G.you!.credits);
  await page.keyboard.press('1');
  assert.equal(await page.locator('#boardbox').isVisible(), false);
  assert.equal(
    await page.evaluate(() => window.modalProbe.packets.filter((p) => p.t === 'board').length),
    1,
    'One boarding shortcut sends one command',
  );
  assert.equal(
    await page.evaluate(() => G.you!.credits),
    creditsBefore,
    'Synthetic absent target cannot award value',
  );

  await ask();
  await page.evaluate(() => {
    window.modalProbe.packets = [];
    window.fixtureInputs = [];
    window.fixturePad = {
      axes: [1, -1],
      buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: [0, 3, 12].includes(index) })),
    };
    document
      .querySelector('#tbtns [data-k="fire1"]')!
      .dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    document
      .querySelector('#tbtns [data-tap="jump"]')!
      .dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    document.querySelector('canvas')!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 15,
        clientY: 15,
      }),
    );
  });
  await page.keyboard.press('v');
  await page.keyboard.press('j');
  await page.keyboard.press('l');
  await neutralInputs();
  assert.equal(
    await page.evaluate(() =>
      window.modalProbe.packets.some((p) =>
        ['jump', 'land', 'board', 'target', 'order'].includes(String(p.t)),
      ),
    ),
    false,
  );
  await page.click('#askno');
  await clearInputs();
  await neutralInputs();
  await page.evaluate(() => {
    window.fixturePad = {
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    };
  });
  await clearInputs();
  await neutralInputs();
  await page.evaluate(() => {
    window.fixturePad!.buttons[0].pressed = true;
  });
  await page.waitForFunction(() => window.fixtureInputs.some((p) => p.f1 === 1));
  await page.evaluate(() => {
    window.fixturePad = null;
    window.dispatchEvent(new Event('blur'));
  });
  await clearInputs();
  await neutralInputs();

  await ask();
  await page.evaluate(async () => {
    const oldConfirm = document.getElementById('askyes')!.onclick;
    (await import('/overlay-controller.js')).overlays.reset();
    oldConfirm?.call(document.getElementById('askyes')!, new PointerEvent('click'));
  });
  assert.equal(
    await page.evaluate(() => window.modalProbe.confirmations),
    1,
    'Reset invalidates former-account callbacks',
  );
  assert.equal(await page.locator('#askbox').isVisible(), false);

  await page.keyboard.press('o');
  await page.locator('#opts').waitFor({ state: 'visible' });
  await page.keyboard.down('v');
  await page.evaluate(() => {
    window.fixturePad = {
      axes: [1, -1],
      buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 0 })),
    };
  });
  await clearInputs();
  await neutralInputs();
  await page.click('#optclose');
  await clearInputs();
  await neutralInputs();
  await page.keyboard.up('v');
  await page.evaluate(() => {
    window.fixturePad = null;
  });

  await page.evaluate(() => {
    window.fixturePad = {
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    };
  });
  await clearInputs();
  await neutralInputs();
  await page.evaluate(() => {
    window.fixturePad!.buttons[9].pressed = true;
  });
  await page.locator('#gmap').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.fixturePad!.buttons[9].pressed = false;
  });
  await clearInputs();
  await neutralInputs();
  await page.evaluate(() => {
    window.fixturePad!.buttons[9].pressed = true;
  });
  await page.locator('#gmap').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    window.fixturePad = null;
  });
  for (const state of ['visible', 'hidden'] as const) {
    await page.locator('#tbtns [data-tap="map"]').evaluate((button) => {
      button.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    });
    await page.locator('#gmap').waitFor({ state });
  }

  await page.fill('#chatin', 'v j l');
  assert.equal(
    await page.locator('#chatin').inputValue(),
    'v j l',
    'Typing retains native controls and saved bindings',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#quitbox').isVisible(), false);
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        passed: true,
        nestedEscape: true,
        focusReturn: true,
        nativeButtons: true,
        heldKeyRelease: true,
        customBinding: true,
        manualInputIsolation: true,
        gamepadReleaseLatch: true,
        limits: 'Emulated touch/gamepad API; physical devices not certified.',
      },
      null,
      2,
    ),
  );
  console.log(
    'Nested dialog priority/focus/native activation and blocked keyboard/pointer/touch/gamepad inputs passed.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
