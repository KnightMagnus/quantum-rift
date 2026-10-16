// Real browser -> target packet -> assist button -> server steering/fire regression.
// Starts an isolated server and replaces only one NPC's AI with an inert target fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets, makeLoadout } from '../shared/rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-combat-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const fresh = Game.prototype.fresh.call({ A });
fresh.ship = makeLoadout(A, 820, 'Browser Assist');
fresh.tut = 999;
// Deliberately retain normal Ops 0 newcomer protection and an inner-system location.
assert.equal(fresh.station.ops, 0);
db.create('Browser Assist', 'browser-combat', fresh);
const telemetry = path.join(evidence, 'telemetry.json');
const fixture = path.join(dir, 'fixture.mjs');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
fs.writeFileSync(
  fixture,
  `
import fs from 'node:fs';
import { Game } from ${JSON.stringify(moduleUrl('server/game.js'))};
import { Space } from ${JSON.stringify(moduleUrl('server/space.js'))};
let active, foe, space, shots = 0, previousWrite = 0;
const spawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function(s, ...args) {
  spawnPlayer.call(this, s, ...args);
  if (s.data.name !== 'Browser Assist') return;
  active = s; space = this.spaces[s.data.sys];
  for (const e of [...space.ships.values()]) if (!e.player) space.remove(e);
  s.ent.x = 0; s.ent.y = 0; s.ent.vx = 0; s.ent.vy = 0; s.ent.a = 0;
  foe = space.makeShip({hull: 704, faction: 'hollow', name: 'Idle Hostile Browser Fixture', x: 0, y: -1100});
  foe._browserInert = true;
  foe.st.shield = 1000; foe.shield = 1000; foe.st.armor = 2000; foe.armor = 2000;
  foe.st.shieldRe = 0; foe.st.armorRe = 0;
};
const ai = Space.prototype.ai;
Space.prototype.ai = function(e) { if (e._browserInert) { e.inp = {}; return; } return ai.call(this, e); };
const fire = Space.prototype.fire;
Space.prototype.fire = function(e, ...args) { if (active && e === active.ent) shots++; return fire.call(this, e, ...args); };
const tick = Game.prototype.tick;
Game.prototype.tick = function(...args) {
  const result = tick.apply(this, args);
  if (active?.ent && foe && Date.now() - previousWrite > 75) {
    previousWrite = Date.now();
    fs.writeFileSync(${JSON.stringify(telemetry)}, JSON.stringify({
      time: Date.now(), newcomer: this.newcomer(active.data), ops: active.data.station.ops,
      state: active.ent.state, player: {x: active.ent.x, y: active.ent.y, target: active.ent.target?.id || 0},
      foe: {id: foe.id, x: foe.x, y: foe.y, shield: foe.shield, armor: foe.armor, target: foe.target?.id || 0, aggro: [...foe.aggro]},
      distance: Math.hypot(active.ent.x-foe.x, active.ent.y-foe.y), shots,
      combat: this.combatAssist.payload(active, space),
      canHit: space.canHit(active.ent, foe), reverseSpared: space.spared(foe, active.ent)
    }));
  }
  return result;
};
`,
);
const port = Number(process.env.RIFT_BROWSER_PORT || 18775);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', fixture, 'server/main.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const read = () => {
  try {
    return JSON.parse(fs.readFileSync(telemetry));
  } catch {
    return null;
  }
};
const until = async (check, label, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const t = read();
    if (t && check(t)) return t;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`${label}: ${JSON.stringify(read())}`);
};
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = [],
    messages = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      try {
        messages.push(JSON.parse(f.payload));
      } catch {}
    }),
  );
  if (process.env.RIFT_ASSET_FALLBACK)
    await page.route('**/assets/**', async (route) => {
      const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
      const local = path.join(root, 'client', relative);
      if (
        !fs.existsSync(local) ||
        !fs
          .readFileSync(local)
          .subarray(0, 43)
          .toString()
          .startsWith('version https://git-lfs.github.com/spec/v1')
      )
        return route.continue();
      const fallback = path.join(process.env.RIFT_ASSET_FALLBACK, relative);
      return fs.existsSync(fallback) ? route.fulfill({ path: fallback }) : route.continue();
    });
  await page.goto(origin);
  await page.fill('#lname', 'Browser Assist');
  await page.fill('#lpass', 'browser-combat');
  await page.click('#lbtn');
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const initial = await until((t) => t.foe.id && t.player.target === 0, 'spawn fixture');
  assert.equal(initial.newcomer, true);
  assert.equal(initial.ops, 0);
  assert.equal(initial.foe.target, 0);
  assert.deepEqual(initial.foe.aggro, []);
  assert.equal(initial.reverseSpared, true, 'fixture actually exercises newcomer protection');
  assert.equal(initial.canHit, true, 'normal player primary fire could legally hit this hostile');
  // A passive enable must not hunt an idle hostile merely because it exists nearby.
  await page.click('#combatassist');
  await page.waitForFunction(() => G.combat.on && G.combat.status === 'READY');
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(read().shots, 0);
  assert.ok(read().distance > 1090);
  await page.click('#combatstop');
  await page.waitForFunction(() => !G.combat.on);
  // Tab invokes the normal client target handler and sends its real target packet.
  await page.keyboard.press('Tab');
  await page.waitForFunction((id) => G.target === id, initial.foe.id);
  await until((t) => t.player.target === initial.foe.id, 'server received selected target');
  assert.ok(messages.some((m) => m.t === 'target' && m.id === initial.foe.id));
  assert.equal(
    messages.some((m) => m.t === 'order' && m.o === 'attack'),
    false,
    'no prior Attack command',
  );
  await page.click('#combatassist');
  await page.waitForFunction(() => G.combat.status === 'ENGAGING', null, { timeout: 5000 });
  const approached = await until((t) => t.distance < 900, 'automatic approach');
  assert.equal(approached.combat.target, initial.foe.id);
  const fired = await until(
    (t) => t.shots > 0 && t.foe.shield < 1000,
    'primary fire damages selected hostile',
    20000,
  );
  assert.equal(fired.combat.status, 'ENGAGING');
  assert.ok(fired.distance < initial.distance - 200);
  await page.screenshot({ path: path.join(evidence, 'combat-assist-engaging.png') });
  await page.keyboard.down('w');
  await page.waitForFunction(() => G.combat.status === 'SUSPENDED');
  await page.keyboard.up('w');
  await page.screenshot({ path: path.join(evidence, 'combat-assist-manual-takeover.png') });
  assert.deepEqual(errors, []);
  const result = {
    initial,
    approached,
    fired,
    final: read(),
    pageErrors: errors,
    targetPackets: messages.filter((m) => m.t === 'target'),
    combatPackets: messages.filter((m) => m.t === 'combat'),
    evidence,
  };
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: true,
        initialDistance: initial.distance,
        approachDistance: approached.distance,
        firingDistance: fired.distance,
        primaryShots: fired.shots,
        targetShield: fired.foe.shield,
        manualStatus: await page.locator('#combatstatus').innerText(),
        pageErrors: errors,
        evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  log.end();
}
