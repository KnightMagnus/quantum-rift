import { launchChromium } from './helpers/chromium.ts';
// Production browser timers and UI over a real TCP link that loses server replies.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

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

const friends = process.env.RIFT_LIVENESS_MODE === 'friends';
const password = 'synthetic-liveness-password';
const output = evidenceDir(friends ? 'browser-friend-liveness' : 'browser-server-liveness');
const directory = tempDataDir('rift-browser-liveness-');
const data = path.join(directory, 'data');
const assets = augmentAssets(
  JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
);
const database = new Database(data);
const captain = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']> & {
  story: { done: string[]; active: null; step: number };
};
captain.tut = 999;
captain.story = { done: ['start'], active: null, step: 0 };
database.create('Liveness Captain', friends ? password : '', captain);
database.flush();
const port = await availablePort();
const backend = 'http://127.0.0.1:' + port;
const proxyPort = await availablePort();
const origin = 'http://127.0.0.1:' + proxyPort;
const server = spawn(
  process.execPath,
  friends ? ['server/main.ts'] : ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      HOST_BIND: '127.0.0.1',
      HOST_FRIENDS: friends ? '1' : '',
      HOST_PUBLIC_ORIGIN: origin,
      SOLO: friends ? '' : '1',
      PORT: String(port),
      DATA_DIR: friends ? '' : data,
      FRIEND_DATA_DIR: friends ? data : '',
      SEEDS_FILE: friends ? '' : '/nonexistent',
      INVASION_NOW: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const sockets = new Set<net.Socket>();
const links: { websocket: boolean; replies: boolean }[] = [];
const proxy = net.createServer((client) => {
  const upstream = net.connect(port, '127.0.0.1');
  sockets.add(client).add(upstream);
  const link = { websocket: false, replies: true };
  links.push(link);
  client.once('data', (bytes) => {
    link.websocket = bytes.toString().startsWith('GET /ws ');
  });
  client.on('data', (bytes) => {
    if (!upstream.destroyed) upstream.write(bytes);
  });
  upstream.on('data', (bytes) => {
    if (link.replies && !client.destroyed) client.write(bytes);
  });
  client.on('end', () => upstream.end());
  // Withhold FIN as well as data: the browser gets no server close/error event.
  upstream.on('end', () => {
    if (link.replies) client.end();
  });
  for (const socket of [client, upstream]) {
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  }
});
let browser;
try {
  await ready(server, backend);
  await new Promise<void>((resolve) => proxy.listen(proxyPort, '127.0.0.1', resolve));
  const status = await (await fetch(origin + '/api/status')).json();
  if (friends) assert.equal(status.mode, 'friends');
  assert.equal(status.solo, !friends);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const sent: { socket: number; t: string; th?: number; qty?: number; at?: number }[] = [];
  const received: { socket: number; t: string; name?: string; at?: number }[] = [];
  const errors: string[] = [];
  let connections = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('websocket', (socket) => {
    const id = ++connections;
    socket.on('framesent', (frame) => {
      const packet = JSON.parse(String(frame.payload));
      if (packet.t !== 'hello') sent.push({ socket: id, ...packet, at: Date.now() });
    });
    socket.on('framereceived', (frame) =>
      received.push({ socket: id, ...JSON.parse(String(frame.payload)), at: Date.now() }),
    );
  });
  await page.addInitScript(() => {
    const OriginalSocket = window.WebSocket;
    let count = 0;
    window.WebSocket = class extends OriginalSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.testSocket = this;
        const id = ++count;
        this.addEventListener('message', (event) => {
          if (JSON.parse(event.data).t === 'welcome')
            document.body.dataset.livenessWelcome = String(id);
        });
      }
    };
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#lver')?.textContent);
  await page.fill('#lname', 'Liveness Captain');
  if (friends) {
    assert.equal(await page.locator('#lpass').isVisible(), true);
    await page.fill('#lpass', password);
  }
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you?.name === 'Liveness Captain' && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  if (!friends) {
    await page.evaluate(() => {
      const banner = document.querySelector('#connectionstatus')!;
      new MutationObserver(() => {
        if (!banner.classList.contains('hidden')) {
          document.body.dataset.idleConnectionWarning = 'true';
          document.body.dataset.idleWarningTrace = JSON.stringify({
            at: Date.now(),
            text: banner.textContent,
          });
        }
      }).observe(banner, { attributes: true });
    });
    // Paused Solo remains healthy without simulation snapshots.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#quitbox', { state: 'visible' });
    await page.waitForTimeout(27000);
    fileSystem.writeFileSync(
      path.join(output, 'idle-health.json'),
      JSON.stringify(
        {
          sent: sent.filter((packet) => packet.t === 'ping'),
          received: received.filter((packet) => packet.t === 'pong'),
          warning: await page.locator('body').getAttribute('data-idle-warning-trace'),
        },
        null,
        2,
      ),
    );
    assert.equal(connections, 1, 'paused Solo does not falsely reconnect');
    assert.equal(
      await page.locator('body').getAttribute('data-idle-connection-warning'),
      null,
      'healthy paused Solo does not flash a silence warning',
    );
    assert.ok(sent.some((packet) => packet.t === 'ping'));
    assert.ok(received.some((packet) => packet.t === 'pong'));
    await page.keyboard.press('Escape');
  }
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);
  assert.ok(
    sent.some((packet) => packet.t === 'input' && packet.th === 1),
    'real held flight control reaches the server',
  );
  const link = links.find((entry) => entry.websocket)!;
  assert.ok(link);
  link.replies = false;
  const lostAt = Date.now();
  await page.waitForFunction(
    () => !document.querySelector('#connectionstatus')?.classList.contains('hidden'),
    undefined,
    { timeout: 8500 },
  );
  assert.ok(Date.now() - lostAt < 8500, 'silence feedback appears before tolerant timeout');
  assert.match(
    (await page.locator('#connectionstatus').textContent()) || '',
    /Connection interrupted/,
  );
  assert.equal(connections, 1, 'early warning does not reconnect a merely slow link');
  assert.ok(
    await page.locator('#connectionstatus').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        getComputedStyle(element).pointerEvents === 'none'
      );
    }),
    'persistent feedback is visible and does not swallow input',
  );
  await page.waitForFunction(
    () => document.querySelector('#lstat')?.textContent === 'Reconnecting to the server...',
    undefined,
    { timeout: 32000 },
  );
  // Let the production reconnect create a fresh transport. The old link remains
  // black-holed, including its close handshake, throughout recovery.
  await page.waitForFunction(
    () =>
      document.body.dataset.livenessWelcome === '2' &&
      G.you?.name === 'Liveness Captain' &&
      G.landed,
    undefined,
    { timeout: 15000 },
  );
  assert.equal(connections, 2, 'one replacement connection restores the captain');
  assert.equal(
    await page.locator('#connectionstatus').isVisible(),
    false,
    'authoritative welcome clears recovery feedback',
  );
  assert.ok(Date.now() - lostAt < 40000, 'foreground loss detection and recovery are bounded');
  assert.ok(
    sent.some((packet) => packet.socket === 1 && packet.t === 'ping'),
    'old connection actively probes',
  );
  assert.ok(
    received.some((packet) => packet.socket === 2 && packet.t === 'welcome'),
    'fresh authoritative welcome arrives',
  );
  assert.ok(
    !sent.some((packet) => packet.socket === 2 && packet.t === 'input' && packet.th === 1),
    'held controls are cleared before replacement login',
  );
  await page.keyboard.up('ArrowUp');
  // Feedback must remain above the highest ordinary confirmation modal too.
  await page.evaluate(async () => (await import('/ui.js')).ask('Connection test', () => {}));
  const replacementLink = links.filter((entry) => entry.websocket).at(-1)!;
  replacementLink.replies = false;
  await page.waitForFunction(
    () => !document.querySelector('#connectionstatus')?.classList.contains('hidden'),
    undefined,
    { timeout: 8500 },
  );
  assert.ok(
    await page.evaluate(
      () =>
        Number(getComputedStyle(document.querySelector('#connectionstatus')!).zIndex) >
        Number(getComputedStyle(document.querySelector('#askbox')!).zIndex),
    ),
    'connection feedback stays above confirmation dialogs',
  );
  await page.screenshot({ path: path.join(output, 'connection-feedback-modal.png') });
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        mode: friends ? 'friends' : 'solo',
        connections,
        elapsedMs: Date.now() - lostAt,
        sent,
        receivedTypes: received.map(({ socket, t }) => ({ socket, t })),
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${friends ? 'friend' : 'Solo'} browser silent TCP reply loss, bounded reconnect and held-input reset`,
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await cleanup(server, browser, log, directory);
}
