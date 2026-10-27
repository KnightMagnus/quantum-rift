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
    modalProbe: { packets: Record<string, unknown>[]; confirmations: number; socket?: WebSocket };
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
      window.modalProbe.socket = this;
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

  await page.locator('#optbtn').focus();
  await page.keyboard.press('Enter');
  await page.locator('#opts').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'optclose');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'opt-dmg');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'optclose');

  await page.evaluate(() => {
    const transient = document.createElement('button');
    transient.id = 'transient-option-trigger';
    transient.textContent = 'Transient fixture trigger';
    document.querySelector('#opts .options-body')!.append(transient);
    transient.focus();
  });
  await ask();
  await page.evaluate(() => document.getElementById('transient-option-trigger')!.remove());
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'optclose',
    'A surviving managed dialog restores its initial focus when the opener disappears',
  );

  await ask();
  await page.evaluate(async () =>
    (await import('/overlay-controller.js')).overlays.open('ctrlbox'),
  );
  await page.locator('#askyes').focus();
  await page.evaluate(async () =>
    (await import('/overlay-controller.js')).overlays.close('ctrlbox'),
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'askyes',
    'Closing an underlay preserves valid focus in the surviving top dialog',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'optclose');

  const damageChecked = await page.locator('#opt-dmg').isChecked();
  await page.locator('#opt-dmg').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#opt-dmg').isChecked(), !damageChecked);
  assert.equal(await page.locator('#opts').isVisible(), true);
  await page.locator('#opt-vol').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#opt-vol').inputValue(), '0.05');
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#opts').isVisible(),
    true,
    'Range Enter is not dialog dismissal',
  );

  const thrustBinding = page.locator('#optkeys [data-bind="thrust"]');
  const bindingValue = (action: string) => page.evaluate((name) => G.opts.keys[name], action);
  await thrustBinding.focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-bind')),
    'thrust',
  );
  await ask();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#opts').isVisible(), true);
  assert.equal(await page.locator('#quitbox').isVisible(), false);
  assert.equal(await thrustBinding.textContent(), 'press a key…');
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-bind')),
    'thrust',
  );
  await page.keyboard.press('Escape');
  assert.equal(await bindingValue('thrust'), 'KeyV', 'Escape cancels capture without rebinding');
  assert.equal(
    await page.locator('#opts').isVisible(),
    true,
    'Capture cancellation keeps Options open',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#opts').isVisible(), false);
  assert.equal(await page.locator('#quitbox').isVisible(), false, 'One Escape does not open quit');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'optbtn');

  await page.keyboard.press('Enter');
  await thrustBinding.click();
  await page.keyboard.press('ArrowUp');
  assert.equal(await bindingValue('thrust'), 'KeyV', 'Reserved steering key is denied');
  assert.equal(await thrustBinding.textContent(), 'V');
  const jumpBefore = await page.locator('#optkeys [data-bind="jump"]').textContent();
  await thrustBinding.click();
  await page.keyboard.press('j');
  assert.equal(await bindingValue('thrust'), 'KeyJ');
  assert.equal(await bindingValue('jump'), 'KeyV', 'Duplicate binding swaps the previous key');
  await thrustBinding.click();
  await page.keyboard.press('Delete');
  assert.equal(await bindingValue('thrust'), null);
  await thrustBinding.click();
  await page.keyboard.press('v');
  assert.equal(await bindingValue('jump'), null, 'Swap preserves explicit unbound state');
  await page.locator('#optkeys [data-bind="jump"]').click();
  await page.keyboard.press('j');
  assert.equal(await page.locator('#optkeys [data-bind="jump"]').textContent(), jumpBefore);
  await thrustBinding.click();
  await page.keyboard.press('Backspace');
  assert.equal(await bindingValue('thrust'), null);
  await thrustBinding.click();
  await page.keyboard.press('v');
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('rift.opts')!).keys.thrust),
    'KeyV',
    'Custom binding is saved',
  );
  await page.locator('#optreset').focus();
  await page.keyboard.press('Enter');
  assert.equal(await thrustBinding.textContent(), 'W', 'Native Reset button runs its own action');
  assert.equal(await page.locator('#opts').isVisible(), true, 'Enter on Reset does not also close');
  await thrustBinding.click();
  await page.keyboard.press('v');
  await page.locator('#optclose').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#opts').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'optbtn');

  await page.keyboard.press('m');
  await page.locator('#gmap').waitFor({ state: 'visible' });
  await page.click('#cbhelp');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ctrlclose');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ctrlkeys');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ctrlclose');
  await ask();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ctrlbox').isVisible(), true);
  assert.equal(await page.locator('#gmap').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ctrlclose');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ctrlbox').isVisible(), false);
  assert.equal(
    await page.locator('#gmap').isVisible(),
    true,
    'Controls consumes Escape before map',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'gmap',
    'A surviving unmanaged overlay receives safe container focus, not hidden Controls focus',
  );
  await page.keyboard.press('Escape');
  await page.locator('#gmap').waitFor({ state: 'hidden' });

  await page.locator('#cbhelp').focus();
  await page.keyboard.press('Enter');
  await page.locator('#ctrlkeys').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ctrlbox').isVisible(), false);
  assert.equal(await page.locator('#opts').isVisible(), true, 'Native Change Keys opens Options');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'optclose');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cbhelp');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.modalProbe.packets = [];
  });
  await page.keyboard.down('v');
  await page.evaluate(() => {
    window.fixturePad = {
      axes: [1, -1],
      buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 0 })),
    };
  });
  await clearInputs();
  await neutralInputs();
  await page.locator('#optbtn').evaluate((button) => (button as HTMLButtonElement).click());
  assert.equal(
    await page.locator('#opts').isVisible(),
    false,
    'Controls blocks outside HUD activation',
  );
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#ctrlbox').isVisible(),
    false,
    'Native Controls Close activates',
  );
  await clearInputs();
  await neutralInputs();
  assert.equal(await page.evaluate(() => G.paused), false, 'Controls does not pause Solo');
  assert.equal(
    await page.evaluate(() => window.modalProbe.packets.some((packet) => packet.t === 'pause')),
    false,
  );
  await page.keyboard.up('v');
  await page.evaluate(() => {
    window.fixturePad = null;
  });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cbhelp');

  await page.evaluate(() => {
    window.modalProbe.packets = [];
  });
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
  assert.equal(await page.evaluate(() => G.paused), false, 'Options does not pause Solo');
  assert.equal(
    await page.evaluate(() => window.modalProbe.packets.some((packet) => packet.t === 'pause')),
    false,
    'Options sends no temporary quit-pause action',
  );
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

  // Seed an existing navigation intent, then exercise actual guidance while manual input is blocked.
  await page.evaluate(async () => {
    const { SYS: systemsById } = await import('/shared/galaxy.js');
    const destination = [...systemsById[G.sys!].stellars]
      .filter((body) => !body.wormhole)
      .sort(
        (left, right) =>
          Math.hypot(right.x - G.view!.x, right.y - G.view!.y) -
          Math.hypot(left.x - G.view!.x, left.y - G.view!.y),
      )[0];
    G.auto = { mode: 'land', id: destination.id, sys: G.sys };
    window.fixtureInputs = [];
    document.getElementById('optbtn')!.click();
  });
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th || packet.tu));
  assert.equal(
    await page.evaluate(() => G.auto?.mode),
    'land',
    'Options preserves navigation guidance',
  );
  assert.equal(await page.locator('#opts').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.click('#cbhelp');
  await clearInputs();
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th || packet.tu));
  assert.equal(
    await page.evaluate(() => G.auto?.mode),
    'land',
    'Controls preserves navigation guidance',
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    G.auto = null;
  });
  await page.click('#optbtn');
  await thrustBinding.click();
  await page.evaluate(async () => (await import('/overlay-controller.js')).overlays.reset());
  assert.equal(await page.locator('#opts').isVisible(), false);
  await page.click('#optbtn');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('#opts').isVisible(),
    false,
    'Reset clears former-account binding capture',
  );
  assert.equal(await bindingValue('thrust'), 'KeyV');

  // These are synthetic receive packets through the real connection and dialog owners,
  // not evidence of server-side story rewards or storage settlement.
  const receive = async (packet: Record<string, unknown>) =>
    page.evaluate((packet) => {
      window.modalProbe.socket!.dispatchEvent(
        new MessageEvent('message', { data: JSON.stringify(packet) }),
      );
    }, packet);
  await page.locator('#captainshortcut').focus();
  await page.keyboard.press('Enter');
  await page.locator('#infobox').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-it')), 'ship');
  await page.click('[data-it="profile"]');
  await page.locator('[data-it="ship"]').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'portraitsave');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-it')), 'ship');
  await receive({
    t: 'hail',
    player: 987654,
    who: 'Fixture caller',
    text: 'Fixture conversation',
    opts: [],
  });
  await page.locator('#hailbox').waitFor({ state: 'visible' });
  await ask();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hailbox').isVisible(), true);
  assert.equal(await page.locator('#infobox').isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.getElementById('infobox')!.contains(document.activeElement)),
    true,
    'Incoming hails do not steal focus from the visually higher captain panel',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#infobox').isVisible(), false);
  assert.equal(await page.locator('#hailbox').isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.getElementById('hailbox')!.contains(document.activeElement)),
    true,
    'Closing Captain restores focus to the surviving hail',
  );
  await page.fill('#hailcompose', 'typing t i m');
  assert.equal(
    await page.locator('#hailbox').isVisible(),
    true,
    'Typing does not run close shortcuts',
  );
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(
      () =>
        window.modalProbe.packets.filter(
          (p) => p.t === 'hailin' && p.op === 'send' && p.text === 'typing t i m',
        ).length,
    ),
    1,
    'Compose Enter submits exactly once through its owner',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#infobox').isVisible(), false);
  assert.equal(await page.locator('#hailbox').isVisible(), false);
  assert.equal(await page.locator('#quitbox').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'captainshortcut');

  await page.keyboard.press('m');
  await page.fill('#gsearch', 'Meridian');
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#gsearch').inputValue(),
    '',
    'Map search keeps native text and Enter selection',
  );
  await page.fill('#gsearch', 'm');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('#gmap').isVisible(),
    true,
    'First Escape leaves map search, not its overlay',
  );
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'gmap');
  await page.keyboard.press('Escape');
  await page.locator('#gmap').waitFor({ state: 'hidden' });

  await page.locator('#cbhelp').focus();
  await receive({
    t: 'story',
    id: 'fixture-choice',
    title: 'Fixture offer',
    text: 'Choose later or accept.',
    choices: [{ value: 'yes', label: 'Accept fixture' }],
  });
  assert.equal(await page.locator('#storyb button:focus').textContent(), 'Decide later');
  await ask();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#storybox').isVisible(), true);
  await clearInputs();
  await page.keyboard.down('v');
  await neutralInputs();
  await page.keyboard.up('v');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#storybox').isVisible(), false);
  assert.equal(
    await page.evaluate(() =>
      window.modalProbe.packets.some((p) => p.t === 'storyacc' && p.id === 'fixture-choice'),
    ),
    false,
    'Escape defers without accepting a reward',
  );
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cbhelp');
  await receive({ t: 'story', title: 'Fixture notice', text: 'A harmless notice.', done: true });
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('#storybox').isVisible(),
    false,
    'Focused native Continue closes once',
  );
  await page.evaluate(async () =>
    (await import('/ui.js')).showDead({ at: 'Fixture port', fee: 1 }),
  );
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'deadok');
  await ask();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#deadbox').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#deadbox').isVisible(), false);

  await page.keyboard.down('v');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await clearInputs();
  await neutralInputs();
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await clearInputs();
  await neutralInputs();
  await page.keyboard.up('v');
  await page.keyboard.down('v');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.keyboard.up('v');

  // Storage needs a landed authorization; use an isolated presentation payload only.
  await page.evaluate(async () => {
    const oldLanded = G.landed;
    G.landed = { ...G.landed, stellar: G.you!.stellar, site: { own: true } } as typeof G.landed;
    (await import('/ui.js')).openStores();
    G.landed = oldLanded;
  });
  await page.locator('#storebox').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-act')),
    'sclose',
    'Storage focuses its safe Close control',
  );
  await ask();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#storebox').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#storebox').isVisible(), false);
  assert.equal(await page.locator('#quitbox').isVisible(), false);

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
        optionsRebinding: true,
        optionsControlsFocus: true,
        nativeSettingsControls: true,
        controlsMapPriority: true,
        remainingOverlayOwners: true,
        safeStoryDeferral: true,
        hailComposeAndMapSearch: true,
        survivingOverlayFocusFallback: true,
        navigationContinues: true,
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
    'Dialog priority/focus, Options capture/native settings, Controls navigation and blocked keyboard/pointer/touch/gamepad inputs passed.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
