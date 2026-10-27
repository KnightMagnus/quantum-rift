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

const output = evidenceDir('browser-server-liveness');
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
database.create('Liveness Captain', '', captain);
database.flush();
const port = await availablePort();
const backend = 'http://127.0.0.1:' + port;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: data,
      SEEDS_FILE: '/nonexistent',
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
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (proxy.address() as net.AddressInfo).port;
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const sent: { socket: number; t: string; th?: number; qty?: number }[] = [];
  const received: { socket: number; t: string; name?: string }[] = [];
  const errors: string[] = [];
  let connections = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('websocket', (socket) => {
    const id = ++connections;
    socket.on('framesent', (frame) => {
      const packet = JSON.parse(String(frame.payload));
      if (packet.t !== 'hello') sent.push({ socket: id, ...packet });
    });
    socket.on('framereceived', (frame) =>
      received.push({ socket: id, ...JSON.parse(String(frame.payload)) }),
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
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you?.name === 'Liveness Captain' && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  // Pause simulation through the ordinary Solo quit dialog. A healthy idle peer
  // must answer the application probe even when no new snapshot is being sent.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#quitbox', { state: 'visible' });
  await page.waitForTimeout(27000);
  assert.equal(connections, 1, 'paused Solo does not falsely reconnect');
  assert.ok(sent.some((packet) => packet.t === 'ping'));
  assert.ok(received.some((packet) => packet.t === 'pong'));
  await page.keyboard.press('Escape');
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
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
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
    'PASS browser idle/pause probes, silent TCP reply loss, bounded reconnect and held-input reset',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await cleanup(server, browser, log, directory);
}
