import { launchChromium } from './helpers/chromium.ts';
// Actual Game + WebSocket + production client check; temporary server/data only.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { Game } from '../server/game.ts';
import { DB as Database } from '../server/db.ts';
import { upgrade } from '../server/ws.ts';
import { HAIL_LIMITS } from '../server/hail-service.ts';

const root = path.resolve(new URL('..', import.meta.url).pathname),
  directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-hails-browser-')),
  artifact = process.env.RIFT_BROWSER_ARTIFACT || path.join(directory, 'artifacts');
fileSystem.mkdirSync(artifact, { recursive: true });
const game = new Game(
  JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString()),
  new Database(directory),
);
game.solo = true;
let timeOffset = 0;
game.hails.now = () => Date.now() + timeOffset;
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((request2, response) => {
  const user = new URL(request2.url || '/', 'http://local');
  if (user.pathname === '/api/status') {
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify({ version: '2.9', solo: true, slots: [] }));
  }
  let relativePath = decodeURIComponent(user.pathname);
  if (relativePath === '/') relativePath = '/index.html';
  const file = path.join(
    relativePath.startsWith('/shared/') ? root : path.join(root, 'client'),
    relativePath,
  );
  try {
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(fileSystem.readFileSync(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
server.on('upgrade', (request3, sock) =>
  upgrade(request3, sock as import('node:net').Socket, (webSocket) =>
    game.connect(webSocket, '127.0.0.1'),
  ),
);
await new Promise<void>((resolve2) => server.listen(0, '127.0.0.1', () => resolve2()));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on('pageerror', (event) => errors.push(String(event)));
const closeInbox = async () => {
  if (await page.locator('#hailbox').isVisible())
    await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
};
try {
  await page.goto(origin);
  await page.fill('#lname', 'Hail Persistence');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const session = [...game.sessions.values()].find(
      (candidateSession) => candidateSession.data?.name === 'Hail Persistence',
    ),
    space = game.live[session!.data.sys],
    shipStats = game.hails.state(session!);
  const npcShip = [...space.ships.values()].find(
    (entity) =>
      !entity.player &&
      !entity.owner &&
      !entity.dead &&
      !entity.disabled &&
      !['umbral', 'eclipse', 'swarm'].includes(entity.faction) &&
      !space.isHostile(entity, session!.ent!),
  );
  assert.ok(npcShip, 'real flight system contains a friendly NPC caller');
  npcShip.name = 'Persistence Caller';
  npcShip.life = 1e6;
  assert.ok(
    game.hails.enqueue(
      session!,
      npcShip,
      'beg',
      'Can you spare 100 credits? Persistent original transmission.',
      [{ k: 'gift', label: 'Give 100 cr (within 500 units)' }],
    ),
  );
  const pendingSystemIds = shipStats.queue[0];
  await page.locator('#hailindicator').waitFor({ state: 'visible' });
  await page.click('#optbtn');
  await page.locator('#opts').waitFor({ state: 'visible' });
  await page.click('#optclose');
  await page.click('#hailindicator');
  await page.getByRole('button', { name: /Persistence Caller · NPC/ }).click();
  await page.waitForFunction(() =>
    document
      .querySelector<HTMLElement>('#hailtext')!
      .textContent.includes('Persistent original transmission'),
  );
  assert.ok(
    await page
      .getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true })
      .isVisible(),
  );
  await closeInbox();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => G.paused === true);
  const expiry = pendingSystemIds.expires,
    pauseDuration = HAIL_LIMITS.expires * 2;
  game.pausedAt -= pauseDuration;
  timeOffset += pauseDuration;
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => G.paused === false);
  assert.ok(
    pendingSystemIds.expires >= expiry + pauseDuration,
    'production pause handler extends hail deadline',
  );
  assert.ok(shipStats.queue.includes(pendingSystemIds), 'long paused menu time keeps active hail');
  await page.click('#hailindicator');
  await page.getByRole('button', { name: /Persistence Caller · NPC/ }).click();
  await page.getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true }).waitFor();
  // Expire while the call remains open: stale action buttons must disappear.
  timeOffset += HAIL_LIMITS.expires + 1000;
  game.hails.tick();
  assert.ok(shipStats.history.some((hull) => hull.key === pendingSystemIds.key));
  await page
    .getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true })
    .waitFor({ state: 'detached' });
  assert.ok(
    (await page.locator('#hailtext').innerText()).includes('Persistent original transmission'),
  );
  await closeInbox();
  await page.click('#optbtn');
  await page.click('#optclose');
  await page.click('#hailindicator');
  await page.getByRole('button', { name: /Persistence Caller · archived/ }).click();
  await page.waitForFunction(() =>
    document
      .querySelector<HTMLElement>('#hailtext')!
      .textContent.includes('[Archived transmission:'),
  );
  assert.ok(
    (await page.locator('#hailtext').innerText()).includes('Persistent original transmission'),
  );
  assert.equal(
    await page.getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true }).count(),
    0,
  );
  const credits = session!.data.credits;
  game.hails.request(session!, { op: 'answer', key: pendingSystemIds.key, k: 'gift' });
  assert.equal(session!.data.credits, credits, 'replayed expired action cannot spend credits');
  await page.screenshot({ path: path.join(artifact, 'archived-npc.png') });
  await closeInbox();
  // A real second session provides a private incoming hail; blocking it must erase
  // the call, not turn private player content into retained NPC-style history.
  const peerSock = Object.assign(new EventEmitter(), {
    open: true,
    backlog: 0,
    send: () => {},
    close: () => {},
  });
  peerSock.open = true;
  peerSock.backlog = 0;
  peerSock.send = () => {};
  peerSock.close = () => {};
  game.connect(peerSock as unknown as import('../server/ws.ts').Socket, '127.0.0.2');
  peerSock.emit('message', JSON.stringify({ t: 'hello', name: 'Blocked Caller' }));
  const peer = [...game.sessions.values()].find(
    (peerSession) => peerSession.data?.name === 'Blocked Caller',
  );
  assert.ok(peer?.data);
  assert.equal(peer.data.sys, session!.data.sys, 'both fresh captains start in same system');
  game.depart(peer);
  session!.data.dmAll = true;
  game.hails.player(peer, session!.ent!, 'Private message must not be archived');
  const privateCall = shipStats.queue.find((hull) => hull.kind === 'player');
  assert.ok(privateCall);
  session!.data.blocks.push(peer.data.name);
  game.hails.tick();
  assert.ok(!shipStats.queue.some((hull) => hull.key === privateCall.key));
  assert.ok(!shipStats.history.some((hull) => hull.key === privateCall.key));
  await page.click('#hailindicator');
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('button', { name: /Blocked Caller · captain/ }).count(), 0);
  assert.ok(!(await page.locator('#hailtext').innerText()).includes('Private message'));
  assert.deepEqual(errors, []);
  const result = {
    optionsMenuPreservesCall: true,
    soloPauseMilliseconds: pauseDuration,
    expiryRetainsNpcText: true,
    archivedActions: 0,
    blockedPlayerRetained: false,
    pageErrors: errors,
  };
  fileSystem.writeFileSync(path.join(artifact, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await browser.close();
  server.close();
  fileSystem.rmSync(directory, { recursive: true, force: true });
  process.exit(0);
} catch (error2) {
  await page.screenshot({ path: path.join(artifact, 'failure.png') });
  console.error(error2);
  await browser.close();
  server.close();
  fileSystem.rmSync(directory, { recursive: true, force: true });
  process.exit(1);
}
