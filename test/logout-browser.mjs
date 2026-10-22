import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';

for (const solo of [false, true]) {
  const label = solo ? 'solo' : 'online';
  const out = evidenceDir('logout-' + label);
  const dir = tempDataDir('rift-logout-');
  const data = path.join(dir, 'data');
  const A = augmentAssets(JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))));
  const db = new DB(data);
  for (const [i, name] of ['Logout Alpha', 'Logout Bravo'].entries()) {
    const d = Game.prototype.fresh.call({ A });
    d.tut = 999;
    d.story = { done: ['start'], active: null };
    d.credits = 123456 + i * 5000;
    db.create(name, 'fixture', d);
  }
  db.flush();
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', './test/seed-random.js', 'server/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      SOLO: solo ? '1' : '',
      PORT: String(port),
      DATA_DIR: data,
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') console.error('browser console:', m.text());
    });
    page.on('requestfailed', (r) => console.error('request failed:', r.url(), r.failure()));
    page.on('pageerror', (e) => {
      errors.push(String(e));
      console.error(e);
    });
    let hellos = [];
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        const m = JSON.parse(String(frame.payload));
        if (m.t === 'hello') hellos.push(m.name);
      }),
    );
    await page.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args) {
          super(...args);
          window.testSocket = this;
        }
      };
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('#lver').textContent);
    await page.evaluate(() => {
      window.sameDocument = 'still here';
    });
    const signIn = async (name) => {
      await page.fill('#lname', name);
      if (!solo) await page.fill('#lpass', 'fixture');
      await page.click('#lbtn');
      await page.waitForFunction((name) => G.you?.name === name && G.landed, name);
      for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
        await page.locator('#storyb button').first().click();
      await page.locator('#lname').evaluate((el) => el.blur());
    };
    if (!solo) {
      await page.fill('#lname', 'Logout Alpha');
      await page.fill('#lpass', 'wrong password');
      await page.click('#lbtn');
      await page.waitForFunction(() => document.querySelector('#lerr').textContent.length > 0);
    }
    await signIn('Logout Alpha');
    await page.screenshot({ animations: 'disabled', path: path.join(out, 'gameplay.png') });
    await page.fill('#chatin', 'private draft');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#quitbox').isVisible(), false, 'Escape blurs chat instead');
    await page.keyboard.press('o');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#quitbox').isVisible(), false, 'options consume Escape');
    await page.keyboard.press('m');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#quitbox').isVisible(), false, 'map consumes Escape');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#quitbox', { state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'quitcancel');
    await page.screenshot({ animations: 'disabled', path: path.join(out, 'confirmation.png') });
    if (solo) await page.waitForFunction(() => G.paused);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#quitbox', { state: 'hidden' });
    if (solo) await page.waitForFunction(() => !G.paused);
    assert.equal(await page.evaluate(() => G.you.name), 'Logout Alpha');
    // Enter on the default Cancel button must not confirm or enter chat.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#quitbox', { state: 'hidden' });
    if (solo) {
      await page.keyboard.press('p');
      await page.waitForFunction(() => G.paused);
      await page.keyboard.press('Escape');
      await page.click('#quitcancel');
      assert.equal(await page.evaluate(() => G.paused), true, 'prior pause survives Cancel');
      await page.keyboard.press('p');
      await page.waitForFunction(() => !G.paused);
    }
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    // Inject deliberately private transient state to detect accidental old-account reuse.
    await page.evaluate(() => {
      G.dms = { Secret: [{ msg: 'private message' }] };
      G.dmWith = 'Secret';
      G.social = { private: true };
      G.tokens = { private: 1 };
      G.route = ['meridian'];
      G.myPrivateFixture = 'must disappear';
      G.chan = 'armada';
      G.autoRoute = false;
      document.querySelector('#chatlog').textContent = 'PRIVATE ALPHA CHAT';
      document.querySelector('#towrecipient').value = 'Private transfer recipient';
    });
    await page.keyboard.down('w');
    await page.keyboard.press('Escape');
    await page.keyboard.up('w');
    await page.click('#quitconfirm');
    await page.waitForSelector('#login', { state: 'visible' });
    await page.waitForFunction(() => !G.you);
    assert.equal(await page.evaluate(() => sameDocument), 'still here', 'no page reload');
    assert.equal(await page.inputValue('#lpass'), '');
    assert.equal(await page.inputValue('#chatin'), '');
    assert.equal(await page.inputValue('#towrecipient'), '', 'persistent transfer draft cleared');
    assert.equal(await page.locator('#chatlog').textContent(), '');
    assert.deepEqual(
      await page.evaluate(() =>
        [G._cred, G.dmWith, G.social, G.tokens, G.myPrivateFixture].map((v) => v ?? null),
      ),
      [null, null, null, null, null],
    );
    assert.deepEqual(await page.evaluate(() => [G.route, G.dms]), [[], {}]);
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'players.json')));
    assert.equal(saved['logout alpha'].credits, 123456, 'captain money persists');
    assert.ok(saved['logout alpha'].stellar, 'flight logout saves docked location');
    await page.screenshot({ animations: 'disabled', path: path.join(out, 'login.png') });
    await page.waitForTimeout(1300);
    assert.deepEqual(
      hellos,
      solo ? ['Logout Alpha'] : ['Logout Alpha', 'Logout Alpha'],
      'no automatic relogin',
    );
    if (solo) assert.match(await page.locator('#lslots').textContent(), /Logout Alpha/);
    await signIn('Logout Bravo');
    assert.equal(await page.evaluate(() => G.you.credits), 128456);
    assert.equal(await page.evaluate(() => G.dmWith ?? null), null);
    assert.doesNotMatch(await page.locator('#chatlog').textContent(), /PRIVATE ALPHA CHAT/);
    // Repeated cycles must reuse initialized UI/event handlers and a single socket per login.
    await page.keyboard.press('Escape');
    await page.click('#quitconfirm');
    await page.waitForFunction(() => !G.you);
    await signIn('Logout Alpha');
    assert.equal(await page.evaluate(() => G.you.credits), 123456);
    assert.equal(await page.evaluate(() => sameDocument), 'still here');
    assert.deepEqual(
      hellos,
      solo
        ? ['Logout Alpha', 'Logout Bravo', 'Logout Alpha']
        : ['Logout Alpha', 'Logout Alpha', 'Logout Bravo', 'Logout Alpha'],
    );
    // A deliberate logout must also cancel an already queued reconnect.
    const beforeDrop = hellos.length;
    await page.evaluate(() => testSocket.close());
    await page.waitForFunction(() => testSocket.readyState === WebSocket.CLOSED);
    await page.keyboard.press('Escape');
    await page.click('#quitconfirm');
    await page.waitForFunction(() => !G.you);
    await page.waitForTimeout(1300);
    assert.equal(hellos.length, beforeDrop, 'queued reconnect invalidated');
    await signIn('Logout Alpha');
    await page.evaluate(() => {
      G.myPrivateFixture = 'kick must clear this too';
    });
    const peer = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
    await new Promise((resolve, reject) => {
      peer.onopen = resolve;
      peer.onerror = reject;
    });
    peer.send(JSON.stringify({ t: 'hello', name: 'Logout Alpha', pass: solo ? '' : 'fixture' }));
    await page.waitForFunction(
      () => !G.you && document.querySelector('#lerr').textContent.includes('somewhere else'),
    );
    assert.equal(
      await page.evaluate(() => G.myPrivateFixture ?? null),
      null,
      'forced logout cleans old captain state',
    );
    peer.close();
    assert.deepEqual(errors, []);
    console.log(
      label + ': Escape/Cancel/confirm, account isolation, persistence and repeated login passed',
    );
  } catch (error) {
    await failureEvidence(browser, out, error);
    throw error;
  } finally {
    await cleanup(server, browser, log, dir);
  }
}
