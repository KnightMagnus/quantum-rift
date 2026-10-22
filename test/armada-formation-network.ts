import type { PreloadConfig } from './fixtures/preload-armada-formation-network.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
// Disposable actual multiplayer HTTP/WebSocket server + a complete Chromium client.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-v-net-'));
const evidence = process.env.RIFT_FORMATION_DIR || evidenceDir('armada');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const names = ['V Lead', 'V Left', 'V Right', 'V Rear', 'V Browser'];
for (const [index, name] of names.entries()) {
  const playerData = Game.prototype.fresh.call({ A: assets });
  playerData.ship = makeLoadout(assets, index === 2 ? 714 : 704, name);
  playerData.tut = 999;
  database.create(name, 'fixture', playerData);
}
database.flush();
const telemetry = path.join(evidence, 'telemetry.json');
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-armada-formation-network.ts', import.meta.url),
);

const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    '--import',
    path.join(root, 'test/helpers/seed-random.ts'),
    '--import',
    fixture,
    'server/local-main.ts',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      RIFT_PRELOAD_CONFIGURATION: JSON.stringify({
        captainNames: names,
        telemetryPath: telemetry,
      } satisfies PreloadConfig),
      SOLO: '',
      PORT: String(port),
      DATA_DIR: path.join(directory, 'data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
const wait = (milliseconds: number | undefined) =>
  new Promise((result) => setTimeout(result, milliseconds));
async function until<Value>(
  callback: () => Value | Promise<Value>,
  label: string,
  milliseconds2 = 15000,
) {
  const deadline = Date.now() + milliseconds2;
  while (Date.now() < deadline) {
    const value = await callback();
    if (value) return value;
    await wait(50);
  }
  throw Error(label);
}
const read = () => {
  try {
    return JSON.parse(fileSystem.readFileSync(telemetry).toString());
  } catch {
    return [];
  }
};
const peers: NetworkClient[] = [];
let browser;
try {
  await ready(server, origin);
  async function captain(name: string) {
    const webSocket = new WebSocket(origin.replace('http', 'ws') + '/ws');
    const connectedClient = { ws: webSocket, name } as unknown as NetworkClient;
    peers.push(connectedClient);
    webSocket.onmessage = (entity) => {
      const message = JSON.parse(String(entity.data)) as ServerMessage;
      if (message.t === 'you') connectedClient.you = message.d;
      if (message.t === 'snap') connectedClient.snap = message;
      if (message.t === 'follow') connectedClient.jump = message;
    };
    await new Promise((result) => (webSocket.onopen = result));
    connectedClient.send = (message: object) => webSocket.send(JSON.stringify(message));
    connectedClient.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => connectedClient.you, 'hello');
    return connectedClient;
  }
  for (const name of names.slice(0, 4)) await captain(name);
  const lead = peers[0];
  lead.send({ t: 'armada', op: 'form', name: 'V Network' });
  await until(() => lead.you.armada?.id, 'form');
  const identifier = lead.you.armada!.id;
  for (const invitedClient of peers.slice(1)) {
    lead.send({ t: 'armada', op: 'invite', name: invitedClient.name });
    await wait(80);
    invitedClient.send({ t: 'armada', op: 'accept', id: identifier });
    await until(() => invitedClient.you.armada?.id === identifier, 'join');
  }
  for (const departingClient of peers) departingClient.send({ t: 'depart' });
  await until(() => read().length === 4, 'depart');
  for (const followingClient of peers.slice(1))
    followingClient.send({ t: 'armada', op: 'follow', on: true });
  await until(
    () =>
      read()
        .filter((session: { name: string }) => session.name !== names[0])
        .every(
          (session: { target: { x: number; y: number }; x: number; y: number }) =>
            session.target &&
            Math.hypot(session.x - session.target.x, session.y - session.target.y) < 60,
        ),
    'WS V convergence',
  );
  const first = read();
  fileSystem.writeFileSync(
    path.join(evidence, 'ws-stationary.json'),
    JSON.stringify(first, null, 2),
  );
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors: string[] = [];
  page.on('pageerror', (entity) => errors.push(String(entity)));
  await page.goto(origin);
  await page.fill('#lname', names[4]);
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  lead.send({ t: 'armada', op: 'invite', name: names[4] });
  await wait(200);

  await page.click('#traytoggle');
  // Use the real page's existing socket for UI actions, not a second game session.
  await page
    .locator('[data-tab="captains"], [data-ctab="captains"]')
    .count()
    .then(async (quantity) => {
      if (quantity)
        await page.locator('[data-tab="captains"], [data-ctab="captains"]').first().click();
    });
  console.log(
    'browser buttons',
    await page
      .locator('button')
      .allTextContents()
      .then((overlayLabels) =>
        overlayLabels.filter((toastText) => /ALLIES|ARMADA|JOIN/.test(toastText)),
      ),
  );
  await page.getByText('ALLIES', { exact: true }).click();
  await page.locator('#capview [data-cs=armada]').click();
  await page.getByRole('button', { name: 'JOIN', exact: true }).click();
  for (let index = 0; index < 12 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.getByText('ALLIES', { exact: true }).click();
  await page.locator('#capview [data-cs=armada]').click();
  await page.locator('#afollow').check();
  await until(
    () => read().find((session: { name: string }) => session.name === names[4])?.target,
    'browser follow authoritative',
  );
  await page.waitForFunction(() => G.formation === true);
  await page.evaluate(() => {
    G.opts.mouseAim = true;
  });
  await page.mouse.move(300, 250);
  await wait(3000);
  assert.equal(
    await page.evaluate(() => G.you!.armada!.follow),
    true,
    'idle mouse aim retains consent',
  );
  assert.equal(
    await page.evaluate(() => G.formation),
    true,
    'snapshot grants authoritative formation',
  );
  await page.setViewportSize({ width: 3840, height: 1800 });
  await page.evaluate(() => {
    G.zoom = 0.35;
  });
  await wait(200);
  assert.equal(
    read().find((session: { name: string }) => session.name === names[4]).follow,
    true,
    'idle browser does not cancel formation',
  );
  await page.screenshot({ path: path.join(evidence, 'multiplayer-follow.png') });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  lead.send({ t: 'input', seq: 1, th: 1 });
  await wait(200);
  lead.send({ t: 'input', seq: 2 });
  await wait(2500);
  const moving = read();
  assert.ok(moving[1].y < first[1].y - 100, 'real WS leader controls move followers');
  peers[1].send({ t: 'input', seq: 1, th: 1, nav: true });
  await until(() => {
    const session = read().find(
      (followerTelemetry: { name: string }) => followerTelemetry.name === names[1],
    );
    return session?.follow && !session.target;
  }, 'WS navigation yields without revoking consent');
  peers[1].send({ t: 'input', seq: 2 });
  await until(
    () => read().find((session: { name: string }) => session.name === names[1])?.target,
    'WS formation resumes',
  );
  peers[1].send({ t: 'input', seq: 3, th: 1 });
  await until(
    () => read().find((session: { name: string }) => session.name === names[1])?.follow === false,
    'WS manual takeover',
  );
  peers[1].send({ t: 'input', seq: 4 });
  await page.keyboard.down('ArrowUp');
  await wait(100);
  await page.keyboard.up('ArrowUp');
  await until(
    () => read().find((session: { name: string }) => session.name === names[4])?.follow === false,
    'browser keyboard takeover',
  );
  // Real leader jump packet must initiate the complete browser's jump, not merely plot a route.
  await page.locator('#afollow').check();
  await page.waitForFunction(() => G.you!.armada!.follow && G.formation);
  const jumpOrigin = await page.evaluate(() => G.sys);
  const jumpDestination = systemsById[jumpOrigin!].links[0];
  lead.send({ t: 'jump', to: jumpDestination });
  await page.waitForFunction((destination) => G.sys === destination, jumpDestination, {
    timeout: 25000,
  });
  await page.waitForFunction(() => G.formation && G.you!.armada!.follow);
  assert.equal(
    await page.evaluate(() => G.you!.armada!.follow),
    true,
    'leader jump retains Follow consent and resumes formation',
  );
  // The elected human root actually disconnects and rejoins through a fresh
  // WebSocket session. Followers suspend, never select some other member as root.
  lead.ws.close();
  await page.waitForFunction(() => G.you!.armada!.follow && !G.formation);
  assert.equal(await page.evaluate(() => G.you!.armada!.leader), names[0]);
  const reconnected = await captain(names[0]);
  assert.equal(reconnected.you.armada!.id, identifier, 'reconnected leader keeps membership');
  assert.equal(
    reconnected.you.armada!.follow,
    false,
    'leader reconnect never grants new flight consent',
  );
  assert.equal(
    await page.evaluate(() => G.formation),
    false,
    'landed reconnected leader cannot steer followers',
  );
  reconnected.send({ t: 'depart' });
  await page.waitForFunction(() => G.formation && G.you!.armada!.follow);
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(evidence, 'network-result.json'),
    JSON.stringify(
      {
        stationary: first,
        moving,
        final: read(),
        pageErrors: errors,
        jump: {
          origin: jumpOrigin,
          destination: jumpDestination,
          automaticBrowserArrival: true,
          formationResumed: true,
          leaderDisconnectSuspends: true,
          sameLeaderReconnectAndDepartResumes: true,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    'Actual multiplayer WS movement + manual takeover; Chromium Armada UI toggle and keyboard takeover passed. Evidence:',
    evidence,
  );
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  for (const captain of peers) captain.ws.close();
  await cleanup(server, browser, serverLog, directory);
}
