// Actual Game + WebSocket + production client check; temporary server/data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { Game } from '../server/game.js';
import { DB } from '../server/db.js';
import { upgrade } from '../server/ws.js';
import { HAIL_LIMITS } from '../server/hail-service.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-hails-browser-')),
  artifact = process.env.RIFT_BROWSER_ARTIFACT || path.join(dir, 'artifacts');
fs.mkdirSync(artifact, { recursive: true });
const game = new Game(
  JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))),
  new DB(dir),
);
game.solo = true;
let timeOffset = 0;
game.hails.now = () => Date.now() + timeOffset;
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ version: '2.9', solo: true, slots: [] }));
  }
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(rel.startsWith('/shared/') ? root : path.join(root, 'client'), rel);
  try {
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.on('upgrade', (req, sock) => upgrade(req, sock, (ws) => game.connect(ws, '127.0.0.1')));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const closeInbox = async () => {
  if (await page.locator('#hailbox').isVisible())
    await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
};
try {
  await page.goto(origin);
  await page.fill('#lname', 'Hail Persistence');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const s = [...game.sessions.values()].find((s) => s.data?.name === 'Hail Persistence'),
    sp = game.live[s.data.sys],
    st = game.hails.state(s);
  const npc = [...sp.ships.values()].find(
    (e) =>
      !e.player &&
      !e.owner &&
      !e.dead &&
      !e.disabled &&
      !['umbral', 'eclipse', 'swarm'].includes(e.faction) &&
      !sp.isHostile(e, s.ent),
  );
  assert.ok(npc, 'real flight system contains a friendly NPC caller');
  npc.name = 'Persistence Caller';
  npc.life = 1e6;
  assert.ok(
    game.hails.enqueue(
      s,
      npc,
      'beg',
      'Can you spare 100 credits? Persistent original transmission.',
      [{ k: 'gift', label: 'Give 100 cr (within 500 units)' }],
    ),
  );
  const q = st.queue[0];
  await page.locator('#hailindicator').waitFor({ state: 'visible' });
  await page.click('#optbtn');
  await page.locator('#opts').waitFor({ state: 'visible' });
  await page.click('#optclose');
  await page.click('#hailindicator');
  await page.getByRole('button', { name: /Persistence Caller · NPC/ }).click();
  await page.waitForFunction(() =>
    document.querySelector('#hailtext').textContent.includes('Persistent original transmission'),
  );
  assert.ok(
    await page
      .getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true })
      .isVisible(),
  );
  await closeInbox();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => G.paused === true);
  const expiry = q.expires,
    pauseDuration = HAIL_LIMITS.expires * 2;
  game.pausedAt -= pauseDuration;
  timeOffset += pauseDuration;
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => G.paused === false);
  assert.ok(q.expires >= expiry + pauseDuration, 'production pause handler extends hail deadline');
  assert.ok(st.queue.includes(q), 'long paused menu time keeps active hail');
  await page.click('#hailindicator');
  await page.getByRole('button', { name: /Persistence Caller · NPC/ }).click();
  await page.getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true }).waitFor();
  // Expire while the call remains open: stale action buttons must disappear.
  timeOffset += HAIL_LIMITS.expires + 1000;
  game.hails.tick();
  assert.ok(st.history.some((h) => h.key === q.key));
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
    document.querySelector('#hailtext').textContent.includes('[Archived transmission:'),
  );
  assert.ok(
    (await page.locator('#hailtext').innerText()).includes('Persistent original transmission'),
  );
  assert.equal(
    await page.getByRole('button', { name: 'Give 100 cr (within 500 units)', exact: true }).count(),
    0,
  );
  const credits = s.data.credits;
  game.hails.request(s, { op: 'answer', key: q.key, k: 'gift' });
  assert.equal(s.data.credits, credits, 'replayed expired action cannot spend credits');
  await page.screenshot({ path: path.join(artifact, 'archived-npc.png') });
  await closeInbox();
  // A real second session provides a private incoming hail; blocking it must erase
  // the call, not turn private player content into retained NPC-style history.
  const peerSock = new EventEmitter();
  peerSock.open = true;
  peerSock.backlog = 0;
  peerSock.send = () => {};
  peerSock.close = () => {};
  game.connect(peerSock, '127.0.0.2');
  peerSock.emit('message', JSON.stringify({ t: 'hello', name: 'Blocked Caller' }));
  const peer = [...game.sessions.values()].find((s) => s.data?.name === 'Blocked Caller');
  assert.ok(peer?.data);
  assert.equal(peer.data.sys, s.data.sys, 'both fresh captains start in same system');
  game.depart(peer);
  s.data.dmAll = true;
  game.hails.player(peer, s.ent, 'Private message must not be archived');
  const privateCall = st.queue.find((h) => h.kind === 'player');
  assert.ok(privateCall);
  s.data.blocks.push(peer.data.name);
  game.hails.tick();
  assert.ok(!st.queue.some((h) => h.key === privateCall.key));
  assert.ok(!st.history.some((h) => h.key === privateCall.key));
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
  fs.writeFileSync(path.join(artifact, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
} catch (e) {
  await page.screenshot({ path: path.join(artifact, 'failure.png') });
  console.error(e);
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
