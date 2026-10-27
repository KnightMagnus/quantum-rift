import { launchChromium } from './helpers/chromium.ts';
/** Real host/join UI and physical flight controls against the production friends host. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { Browser, Page } from 'playwright';
import type { SnapshotMessage } from '../client/protocol.ts';
import { FriendHost, until, password } from './helpers/friend-host.ts';
const host = new FriendHost('friend-host-browser');
let browser: Browser | undefined;
const pages: Page[] = [];
const errors: string[] = [];
const checks: Record<string, unknown> = {};
const frames: { direction: string; at: number; packet: Record<string, unknown> }[] = [];
let cleanupPromise: Promise<void> | undefined;
const cleanup = () =>
  (cleanupPromise ||= (async () => {
    try {
      await browser?.close();
    } finally {
      await host.stop();
    }
  })());
const deadline = setTimeout(() => {
  void cleanup().finally(() => process.exit(1));
}, 150000);
const onSignal = () => {
  void cleanup().finally(() => process.exit(143));
};
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
const latestSnapshot = () =>
  frames.filter((frame) => frame.direction === 'received' && frame.packet.t === 'snap').at(-1)
    ?.packet as unknown as SnapshotMessage | undefined;
try {
  checks.status = await host.start();
  const friends = await Promise.all(
    ['Browser Friend One', 'Browser Friend Two'].map((name) => host.connect(name)),
  );
  for (const friend of friends) friend.send({ t: 'depart' });
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  let socketCount = 0;
  page.on('websocket', (socket) => {
    socketCount++;
    const endpoint = new URL(socket.url());
    assert.equal(endpoint.host, new URL(page.url()).host, 'Raw game socket remains same origin');
    assert.equal(endpoint.pathname, '/ws');
    const recordFrame = (direction: string, event: { payload: string | Buffer }) => {
      const packet = JSON.parse(String(event.payload)) as Record<string, unknown>;
      if (packet.t !== 'hello') frames.push({ direction, at: Date.now(), packet });
    };
    socket.on('framesent', (event) => recordFrame('sent', event));
    socket.on('framereceived', (event) => recordFrame('received', event));
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
  // localhost exercises a hostname distinct from the listener's numeric loopback bind.
  const origin = host.origin.replace('127.0.0.1', 'localhost');
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#lver')?.textContent);
  assert.equal(await page.locator('#lpass').isVisible(), true, 'Friends asks for a password');
  await page.fill('#lname', 'Browser Host Pilot');
  await page.fill('#lpass', password);
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you?.name === 'Browser Host Pilot' && G.landed);
  for (let index = 0; index < 20 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('#lname').evaluate((element) => element.blur());
  checks.login = { origin, captain: await page.evaluate(() => G.you!.name), socketCount };
  await page.click('#depart');
  await page.waitForFunction(
    () => G.view && !G.landed && window.RiftEngine.scene.display.actors.has('ship:' + G.myId),
  );
  await until(
    () =>
      latestSnapshot()?.me &&
      friends.every((friend) =>
        friend.snap?.ships.some((ship) => ship[11] === 'Browser Host Pilot'),
      ),
    'browser host observed by both friends',
  );
  const before = latestSnapshot()!.me!;
  const start = frames.length;
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  try {
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await until(() => {
      const me = latestSnapshot()?.me;
      return (
        me &&
        me[1] > before[1] + 4 &&
        Math.hypot(me[2] - before[2], me[3] - before[3]) > 15 &&
        Math.abs(me[6] - before[6]) > 0.05
      );
    }, 'physical keyboard authoritative thrust and turning');
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('d');
  }
  await until(
    () =>
      frames
        .slice(start)
        .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input')
        .slice(-2).length === 2 &&
      frames
        .slice(start)
        .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input')
        .slice(-2)
        .every((frame) => frame.packet.th === 0 && frame.packet.tu === 0),
    'released keyboard input',
  );
  const after = latestSnapshot()!.me!;
  await until(
    () =>
      friends.every((friend) => {
        const ship = friend.snap?.ships.find((ship) => ship[11] === 'Browser Host Pilot');
        return ship && Math.hypot(ship[2] - after[2], ship[3] - after[3]) < 150;
      }),
    'friends observe browser host movement',
  );
  // A short initial flight can batch several socket events into one host turn.
  // Observe the same sustained interval used after reconnect before measuring Hz.
  await until(() => {
    const commands = frames
      .slice(start)
      .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input');
    return commands.length >= 5 && commands.at(-1)!.at - commands[0].at >= 1800;
  }, 'sustained initial input measurement');
  const inputs = frames
    .slice(start)
    .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input');
  assert(inputs.length >= 5);
  assert(
    inputs.every(
      (frame, index) =>
        !index || Number(frame.packet.seq) === Number(inputs[index - 1].packet.seq) + 1,
    ),
    'Single contiguous physical input sequence',
  );
  const inputMs = inputs.at(-1)!.at - inputs[0].at;
  const inputHz = (inputs.length - 1) / (inputMs / 1000);
  checks.flight = {
    before,
    after,
    commands: inputs.length,
    inputMs,
    inputHz,
    observedByFriends: 2,
  };
  assert(inputHz >= 15 && inputHz <= 45, 'No duplicated input clock: ' + inputHz);
  friends[0].send({ t: 'chat', ch: 'sys', msg: 'Friends are flying together.' });
  await page.waitForFunction(() =>
    document.body.textContent?.includes('Friends are flying together.'),
  );
  await page.screenshot({
    path: path.join(host.output, 'friends-host-flight.png'),
    animations: 'disabled',
  });
  // The screenshot contains only synthetic names/game UI, no credentials, paths or browser chrome.
  checks.screenshot = 'friends-host-flight.png';
  const priorSockets = socketCount;
  const reconnectStart = frames.length;
  await page.evaluate(() => window.testSocket.close());
  await until(
    () =>
      socketCount > priorSockets &&
      frames
        .slice(reconnectStart)
        .some((frame) => frame.direction === 'received' && frame.packet.t === 'welcome'),
    'browser reconnect',
  );
  await page.waitForFunction(() => G.you?.name === 'Browser Host Pilot' && G.landed && !G.view);
  const redepartStart = frames.length;
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await until(
    () =>
      frames
        .slice(redepartStart)
        .some((frame) => frame.direction === 'received' && frame.packet.t === 'snap'),
    'fresh reconnected flight',
  );
  const commandStart = frames.length;
  const measuredAt = Date.now();
  await until(() => Date.now() - measuredAt >= 1800, 'reconnected input measurement');
  const reconnectedInputs = frames
    .slice(commandStart)
    .filter((frame) => frame.direction === 'sent' && frame.packet.t === 'input');
  const reconnectHz = reconnectedInputs.length / ((Date.now() - measuredAt) / 1000);
  assert(
    reconnectHz >= 15 && reconnectHz <= 45,
    'Reconnect must not duplicate command clock: ' + reconnectHz,
  );
  assert(
    reconnectedInputs.every(
      (frame, index) =>
        !index || Number(frame.packet.seq) === Number(reconnectedInputs[index - 1].packet.seq) + 1,
    ),
  );
  checks.reconnectedClock = { commands: reconnectedInputs.length, inputHz: reconnectHz };
  checks.reconnect = { sockets: socketCount, captain: await page.evaluate(() => G.you!.name) };
  assert.deepEqual(errors, [], 'No browser runtime errors');
  host.save('result.json', { passed: true, checks });
  console.log(
    'Friends actual browser login, departure, flight, peer visibility and reconnect passed; evidence: ' +
      host.output,
  );
} catch (error) {
  host.save('result.json', {
    passed: false,
    checks,
    errors,
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  for (let index = 0; index < pages.length; index++)
    await pages[index]
      .screenshot({ path: path.join(host.output, 'failure-' + index + '.png'), timeout: 3000 })
      .catch(() => {});
  throw error;
} finally {
  clearTimeout(deadline);
  await cleanup();
  process.removeListener('SIGTERM', onSignal);
  process.removeListener('SIGINT', onSignal);
}
