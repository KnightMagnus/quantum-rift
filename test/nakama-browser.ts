/** Browser acceptance against the actual disposable Nakama Game runtime. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { sanitizedDiagnostic, NakamaService, repository, until } from './helpers/nakama-service.ts';
import { availablePort, ready, evidenceDir } from './helpers/browser-fixture.ts';

process.umask(0o077);
const privateRoot = path.resolve(repository, '..');
const temporary = path.join(privateRoot, 'temp');
fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
process.env.TMPDIR = process.env.TMP = process.env.TEMP = temporary;
process.env.npm_config_cache = path.join(privateRoot, 'npm-cache');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(privateRoot, 'browsers');
const output = fs.mkdtempSync(path.join(temporary, 'nakama-browser-'));
const service = new NakamaService();
let browser: Browser | undefined;
let server: ChildProcess | undefined;
let page: Page | undefined;
let serverDone: Promise<unknown> | undefined;
const errors: string[] = [];
const consoleMessages: { type: string; text: string }[] = [];
// Only decoded game packets are retained, never websocket URLs/auth envelopes.
type Packet = {
  t: string;
  me?: number[];
  seq?: number;
  th?: number;
  tu?: number;
  [key: string]: unknown;
};
const frames: { direction: string; at: number; packet: Packet }[] = [];
const checks: Record<string, unknown> = {};
const logoutResponses: number[] = [];
let succeeded = false;
const deadline = setTimeout(() => {
  void cleanup().finally(() => process.exit(1));
}, 170000);
let cleanupPromise: Promise<void> | undefined;
function cleanup() {
  return (cleanupPromise ||= (async () => {
    try {
      await Promise.race([browser?.close(), delay(5000)]);
    } finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        server.kill('SIGTERM');
        await Promise.race([serverDone, delay(3000)]);
        if (server.exitCode === null && server.signalCode === null) {
          server.kill('SIGKILL');
          await Promise.race([serverDone, delay(2000)]);
        }
      }
      await service.cleanup();
      clearTimeout(deadline);
    }
  })());
}
const onSignal = () => {
  void cleanup().finally(() => process.exit(143));
};
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
function decode(direction: string, payload: string | Buffer) {
  try {
    const envelope = JSON.parse(String(payload));
    const data = envelope.match_data || envelope.match_data_send;
    if (!data || ![1, 2].includes(Number(data.op_code))) return;
    const packet = JSON.parse(Buffer.from(data.data, 'base64').toString('utf8')) as Packet;
    if (typeof packet.t !== 'string' || packet.t === 'hello') return;
    frames.push({ direction, at: Date.now(), packet });
    if (frames.length > 2000) frames.shift();
  } catch {
    /* Heartbeats and protocol acknowledgements are not game packets. */
  }
}
const latest = (type: string) =>
  frames.filter((frame) => frame.direction === 'received' && frame.packet.t === type).at(-1)
    ?.packet;
try {
  await service.initialize();
  const port = await availablePort();
  const origin = 'http://127.0.0.1:' + port;
  const log = fs.openSync(path.join(output, 'static-host.log'), 'a', 0o600);
  server = spawn(process.execPath, ['server/main.ts'], {
    cwd: repository,
    env: {
      ...process.env,
      SOLO: '',
      HOST: '127.0.0.1',
      PORT: String(port),
      NAKAMA_HOST: '127.0.0.1',
      NAKAMA_PORT: String(service.apiPort),
      NAKAMA_SERVER_KEY: service.client.serverkey,
    },
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  serverDone = new Promise((resolve) => server!.once('exit', resolve));
  await ready(server, origin);
  const status = await (await fetch(origin + '/api/status')).json();
  assert.equal(status.solo, false);
  assert.equal(Number(status.nakama.port), service.apiPort);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['local-network-access'], { origin });
  page = await context.newPage();
  // Seed only a long-lived counter, not physics or an extra input loop. The actual browser then sends physical controls.
  await page.route('**/main.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        "\nObject.defineProperty(window, 'testSequence', {get: () => sequence, set: (value) => { sequence = value; }});\n",
    });
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/v2/session/logout')
      logoutResponses.push(response.status());
  });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', async (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      const body = url.pathname.startsWith('/v2/account/authenticate/')
        ? await response.text().catch(() => '')
        : '';
      consoleMessages.push({
        type: 'http-error',
        text: response.status() + ' ' + url.pathname + ' ' + body,
      });
    }
  });
  page.on('console', (message) =>
    consoleMessages.push({ type: message.type(), text: message.text() }),
  );
  let socketCount = 0;
  page.on('websocket', (socket) => {
    socketCount++;
    assert.equal(
      new URL(socket.url()).port,
      String(service.apiPort),
      'browser connects directly to native Nakama',
    );
    socket.on('framesent', (frame) => decode('sent', frame.payload));
    socket.on('framereceived', (frame) => decode('received', frame.payload));
  });
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
  await page.waitForFunction(() => document.querySelector('#lver')?.textContent);
  const password = 'synthetic-local-only-' + Date.now();
  const signIn = async (name: string) => {
    await page!.fill('#lname', name);
    await page!.fill('#lpass', password);
    await page!.click('#lbtn');
    await page!.waitForFunction((name) => G.you?.name === name && G.landed, name);
    for (let index = 0; index < 20 && (await page!.locator('#storybox').isVisible()); index++)
      await page!.locator('#storyb button').first().click();
    await page!.locator('#lname').evaluate((element) => element.blur());
  };
  const logout = async () => {
    await page!.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page!.keyboard.press('Escape');
    await page!.waitForSelector('#quitbox', { state: 'visible' });
    await page!.click('#quitconfirm');
    await page!.waitForFunction(() => !G.you);
    await page!.waitForSelector('#login', { state: 'visible' });
    assert.equal(await page!.inputValue('#lpass'), '');
    assert.deepEqual(
      await page!.evaluate(() => [G._cred ?? null, G.dmWith ?? null, G.route, G.dms]),
      [null, null, [], {}],
    );
  };
  await signIn('Native Alpha Pilot');
  const alpha = await page.evaluate(() => ({ name: G.you!.name, credits: G.you!.credits }));
  assert.equal(alpha.name, 'Native Alpha Pilot');
  checks.alpha = alpha;
  await page.waitForFunction(() => window.RiftAudio.debug().ctx === 'running');
  assert.equal(await page.locator('#view').getAttribute('data-engine'), 'excalibur-0.32.0');
  await page.click('#depart');
  await page.waitForFunction(
    () => G.view && !G.landed && window.RiftEngine.scene.display.actors.has('ship:' + G.myId),
  );
  await until(() => latest('snap')?.me, 'authoritative initial snapshot');
  const before = latest('snap')!.me!;
  assert(before.slice(0, 7).every(Number.isFinite));
  // Real network shaping, no replacement authority or input loop.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 70,
    downloadThroughput: 1000000,
    uploadThroughput: 1000000,
  });
  const renderedBefore = await page.evaluate(() => {
    const actor = window.RiftEngine.scene.display.actors.get('ship:' + G.myId)!;
    return [actor.pos.x, actor.pos.y, G.view!.rx, G.view!.ry];
  });
  const firstInput = frames.length;
  await page.evaluate(() => Reflect.set(window, 'testSequence', 4090));
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  try {
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await until(
      () => {
        const me = latest('snap')?.me;
        return (
          me &&
          me[1] > 4096 &&
          Math.hypot(me[2] - before[2], me[3] - before[3]) > 12 &&
          Math.abs(me[6] - before[6]) > 0.05
        );
      },
      'authoritative thrust/turn and sequence acknowledgement',
      12000,
    );
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('d');
  }
  await until(() => {
    const inputs = frames
      .slice(firstInput)
      .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input');
    return (
      inputs.length >= 2 &&
      inputs.slice(-2).every((frame) => frame.packet.th === 0 && frame.packet.tu === 0)
    );
  }, 'released physical input');
  const after = latest('snap')!.me!;
  const renderedAfter = await page.evaluate(() => {
    const actor = window.RiftEngine.scene.display.actors.get('ship:' + G.myId)!;
    return [actor.pos.x, actor.pos.y, G.view!.rx, G.view!.ry];
  });
  assert(renderedAfter.every(Number.isFinite));
  assert(
    Math.hypot(renderedAfter[0] - renderedBefore[0], renderedAfter[1] - renderedBefore[1]) > 5,
    'native actor rendered authoritative movement',
  );
  assert(
    Math.hypot(renderedAfter[2] - after[2], renderedAfter[3] - after[3]) < 500,
    'prediction remains bounded to authoritative position',
  );
  const inputs = frames
    .slice(firstInput)
    .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input');
  assert(inputs.length >= 3);
  assert(
    inputs.every(
      (frame, index) => !index || frame.packet.seq === Number(inputs[index - 1].packet.seq) + 1,
    ),
    'single contiguous input sequence',
  );
  checks.flight = {
    before,
    after,
    renderedBefore,
    renderedAfter,
    inputs: inputs.length,
    cdpLatency: 70,
  };
  await page.screenshot({
    path: path.join(output, 'native-flight-released.png'),
    animations: 'disabled',
  });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const priorSockets = socketCount;
  const reconnectFrom = frames.length;
  await page.evaluate(() => window.testSocket.close());
  await until(() => socketCount > priorSockets, 'native reconnect');
  await until(
    () =>
      frames
        .slice(reconnectFrom)
        .some((frame) => frame.direction === 'received' && frame.packet.t === 'welcome'),
    'fresh authenticated welcome after reconnect',
  );
  await page.waitForFunction(() => G.you?.name === 'Native Alpha Pilot' && G.landed && !G.view);
  assert.equal(await page.evaluate(() => G.you!.credits), alpha.credits);
  assert.equal(
    await page.evaluate(() => Number(Reflect.get(window, 'testSequence'))),
    0,
    'replacement presence starts a fresh sequence epoch',
  );
  await page.click('#depart');
  await until(
    () =>
      frames
        .slice(reconnectFrom)
        .some((frame) => frame.direction === 'received' && frame.packet.t === 'snap'),
    'fresh reconnected flight snapshot',
  );
  const reconnectBefore = latest('snap')!.me!;
  assert.equal(reconnectBefore[1], 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  try {
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await until(
      () => {
        const me = latest('snap')?.me;
        return (
          me &&
          me[1] > 0 &&
          me[1] < 100 &&
          Math.hypot(me[2] - reconnectBefore[2], me[3] - reconnectBefore[3]) > 3 &&
          Math.abs(me[6] - reconnectBefore[6]) > 0.03
        );
      },
      'fresh controls acknowledge and move after reconnect beyond sequence 4096',
      12000,
    );
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('d');
  }
  checks.reconnect = {
    sequenceBefore: after[1],
    sequenceAfter: latest('snap')!.me![1],
    movement: Math.hypot(
      latest('snap')!.me![2] - reconnectBefore[2],
      latest('snap')!.me![3] - reconnectBefore[3],
    ),
  };
  await page.fill('#chatin', 'private alpha draft');
  await logout();
  assert.equal(await page.inputValue('#chatin'), '');
  const loggedOutSockets = socketCount;
  await delay(1400);
  assert.equal(socketCount, loggedOutSockets, 'logout does not reconnect');
  assert.equal(logoutResponses.at(-1), 200, 'native session logout API succeeded');
  assert(
    !frames.some((frame) => frame.direction === 'sent' && frame.packet.t === 'logout'),
    'logout is not an unhandled game action',
  );
  await signIn('Native Bravo Pilot');
  checks.bravo = await page.evaluate(() => ({ name: G.you!.name, credits: G.you!.credits }));
  assert.equal(await page.evaluate(() => G.dmWith ?? null), null);
  await logout();
  await signIn('Native Alpha Pilot');
  assert.equal(
    await page.evaluate(() => G.you!.credits),
    alpha.credits,
    'original captain balance survives switching',
  );
  await page.screenshot({
    path: path.join(output, 'native-alpha-return.png'),
    animations: 'disabled',
  });
  assert.deepEqual(errors, []);
  checks.directNativeSockets = socketCount;
  succeeded = true;
  console.log('PASS native Nakama browser acceptance; evidence: ' + output);
} catch (error) {
  fs.writeFileSync(
    path.join(output, 'failure.txt'),
    error instanceof Error ? error.stack || error.message : String(error),
  );
  fs.writeFileSync(path.join(output, 'network-game-frames.json'), JSON.stringify(frames, null, 2));
  if (page) {
    await page.keyboard.up('w').catch(() => {});
    await page.keyboard.up('d').catch(() => {});
    await page
      .screenshot({ path: path.join(output, 'failure.png'), timeout: 3000 })
      .catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      { succeeded, serviceRun: service.run, checks, errors, consoleMessages },
      null,
      2,
    ),
  );
  console.log('Browser evidence: ' + output + '; native service logs: ' + service.run);
  try {
    await cleanup();
  } catch (error) {
    succeeded = false;
    process.exitCode = 1;
    checks.cleanupError = sanitizedDiagnostic(String(error));
  }
  const diagnostic = evidenceDir('nakama-browser');
  fs.writeFileSync(
    path.join(diagnostic, 'result.json'),
    JSON.stringify({ succeeded, checks, errors: errors.map(sanitizedDiagnostic) }, null, 2),
    { mode: 0o600 },
  );
  for (const filename of ['native-flight-released.png', 'native-alpha-return.png', 'failure.png']) {
    const source = path.join(output, filename);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(diagnostic, filename));
  }

  process.removeListener('SIGTERM', onSignal);
  process.removeListener('SIGINT', onSignal);
}
