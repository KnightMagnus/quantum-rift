import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

for (const solo of [false, true]) {
  const label = solo ? 'solo' : 'online';
  const output = evidenceDir('logout-' + label);
  const directory = tempDataDir('rift-logout-');
  const data = path.join(directory, 'data');
  const assets = augmentAssets(
    JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString()),
  );
  const database = new Database(data);
  for (const [index, name] of ['Logout Alpha', 'Logout Bravo'].entries()) {
    const playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
      import('../server/game.ts').Game['fresh']
    > & { story?: { done: string[]; active: null; step: number } };
    playerData.tut = 999;
    playerData.story = { done: ['start'], active: null, step: 0 };
    playerData.credits = 123456 + index * 5000;
    database.create(name, 'fixture', playerData);
  }
  database.flush();
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', './test/seed-random.ts', 'server/main.ts'], {
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
  const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  let browser;
  try {
    await ready(server, origin);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('browser console:', message.text());
    });
    page.on('requestfailed', (result) =>
      console.error('request failed:', result.url(), result.failure()),
    );
    page.on('pageerror', (event) => {
      errors.push(String(event));
      console.error(event);
    });
    let hellos: string[] = [];
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        const message = JSON.parse(String(frame.payload));
        if (message.t === 'hello') hellos.push(message.name);
      }),
    );
    await page.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args: ConstructorParameters<typeof WebSocket>) {
          super(...args);
          window.testSocket = this;
        }
      };
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector<HTMLElement>('#lver')!.textContent);
    await page.evaluate(() => {
      (window as unknown as { sameDocument: string }).sameDocument = 'still here';
    });
    const signIn = async (name: string) => {
      await page.fill('#lname', name);
      if (!solo) await page.fill('#lpass', 'fixture');
      await page.click('#lbtn');
      await page.waitForFunction((name) => G.you?.name === name && G.landed, name);
      for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
        await page.locator('#storyb button').first().click();
      await page.locator('#lname').evaluate((element) => element.blur());
    };
    if (!solo) {
      await page.fill('#lname', 'Logout Alpha');
      await page.fill('#lpass', 'wrong password');
      await page.click('#lbtn');
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('#lerr')!.textContent.length > 0,
      );
    }
    await signIn('Logout Alpha');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'gameplay.png') });
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
    assert.equal(await page.evaluate(() => document.activeElement!.id), 'quitcancel');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'confirmation.png') });
    if (solo) await page.waitForFunction(() => G.paused);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#quitbox', { state: 'hidden' });
    if (solo) await page.waitForFunction(() => !G.paused);
    assert.equal(await page.evaluate(() => G.you!.name), 'Logout Alpha');
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
      G.dms = { Secret: [{ msg: 'private message' }] } as unknown as typeof G.dms;
      G.dmWith = 'Secret';
      G.social = { private: true } as unknown as typeof G.social;
      (G as import('../client/main.ts').ClientGameState & { tokens?: { private: number } }).tokens =
        { private: 1 };
      G.route = ['meridian'];
      (
        G as import('../client/main.ts').ClientGameState & { myPrivateFixture?: string }
      ).myPrivateFixture = 'must disappear';
      G.chan = 'armada';
      G.autoRoute = false;
      document.querySelector<HTMLElement>('#chatlog')!.textContent = 'PRIVATE ALPHA CHAT';
      (document.querySelector<HTMLElement>('#towrecipient')! as HTMLInputElement).value =
        'Private transfer recipient';
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
        [
          G._cred,
          G.dmWith,
          G.social,
          (G as import('../client/main.ts').ClientGameState & { tokens?: { private: number } })
            .tokens,
          (G as import('../client/main.ts').ClientGameState & { myPrivateFixture?: string })
            .myPrivateFixture,
        ].map((value) => value ?? null),
      ),
      [null, null, null, null, null],
    );
    assert.deepEqual(await page.evaluate(() => [G.route, G.dms]), [[], {}]);
    const saved = JSON.parse(fileSystem.readFileSync(path.join(data, 'players.json')).toString());
    assert.equal(saved['logout alpha'].credits, 123456, 'captain money persists');
    assert.ok(saved['logout alpha'].stellar, 'flight logout saves docked location');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'login.png') });
    await page.waitForTimeout(1300);
    assert.deepEqual(
      hellos,
      solo ? ['Logout Alpha'] : ['Logout Alpha', 'Logout Alpha'],
      'no automatic relogin',
    );
    if (solo) assert.match((await page.locator('#lslots').textContent())!, /Logout Alpha/);
    await signIn('Logout Bravo');
    assert.equal(await page.evaluate(() => G.you!.credits), 128456);
    assert.equal(await page.evaluate(() => G.dmWith ?? null), null);
    assert.doesNotMatch((await page.locator('#chatlog').textContent())!, /PRIVATE ALPHA CHAT/);
    // Repeated cycles must reuse initialized UI/event handlers and a single socket per login.
    await page.keyboard.press('Escape');
    await page.click('#quitconfirm');
    await page.waitForFunction(() => !G.you);
    await signIn('Logout Alpha');
    assert.equal(await page.evaluate(() => G.you!.credits), 123456);
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
      (
        G as import('../client/main.ts').ClientGameState & { myPrivateFixture?: string }
      ).myPrivateFixture = 'kick must clear this too';
    });
    const peer = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
    await new Promise((resolve, reject) => {
      peer.onopen = resolve;
      peer.onerror = reject;
    });
    peer.send(JSON.stringify({ t: 'hello', name: 'Logout Alpha', pass: solo ? '' : 'fixture' }));
    await page.waitForFunction(
      () =>
        !G.you &&
        document.querySelector<HTMLElement>('#lerr')!.textContent.includes('somewhere else'),
    );
    assert.equal(
      await page.evaluate(
        () =>
          (G as import('../client/main.ts').ClientGameState & { myPrivateFixture?: string })
            .myPrivateFixture ?? null,
      ),
      null,
      'forced logout cleans old captain state',
    );
    peer.close();
    assert.deepEqual(errors, []);
    console.log(
      label + ': Escape/Cancel/confirm, account isolation, persistence and repeated login passed',
    );
  } catch (error) {
    await failureEvidence(browser, output, error);
    throw error;
  } finally {
    await cleanup(server, browser, serverLog, directory);
  }
}
