// Real browser -> target packet -> assist button -> server steering/fire regression.
// Isolated Solo server: inert target control or real ordinary/named trader AI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets, makeLoadout } from '../shared/rules.js';

const neutral = process.env.RIFT_BROWSER_TARGET === 'neutral';
const drift = process.env.RIFT_BROWSER_DRIFT === '1';
const named = process.env.RIFT_BROWSER_NAMED === '1';
const live = named || process.env.RIFT_BROWSER_LIVE === '1';
const scenery = process.env.RIFT_BROWSER_SCENERY === '1';
const playerHull = Number(process.env.RIFT_BROWSER_PLAYER_HULL || 820);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-combat-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const fresh = Game.prototype.fresh.call({ A });
fresh.ship = makeLoadout(A, playerHull, 'Browser Assist');
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
import { RIVALS } from ${JSON.stringify(moduleUrl('shared/rivals.js'))};
let active, foe, space, shots = 0, previousWrite = 0;
const spawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function(s, ...args) {
  spawnPlayer.call(this, s, ...args);
  if (s.data.name !== 'Browser Assist') return;
  active = s; space = this.spaces[s.data.sys];
  for (const e of [...space.ships.values()]) if (!e.player) space.remove(e);
  s.ent.x = 0; s.ent.y = 0; s.ent.vx = ${drift ? 80 : 0}; s.ent.vy = ${drift ? 40 : 0}; s.ent.a = ${drift ? Math.PI / 2 : 0};
  foe = space.makeShip({hull: 704, faction: ${JSON.stringify(neutral ? 'quantum' : 'hollow')}, name: 'Idle Selected Browser Fixture', x: 0, y: -1100});
  if (${named}) {
    space.remove(foe);
    const R = RIVALS.find(r => r.fac === 'quantum' && r.kind === 'trader') || RIVALS.find(r => r.fac === 'spacer' && r.kind === 'trader');
    for (const r of Object.values(this.db.world.rivals)) r.sys = -999;
    const r = this.db.world.rivals[R.id]; r.sys = space.id; r.hull = 704; r.down = 0; r.dockT = 0;
    this.rivalEnts.clear();
    this.features.rivals.rivalSync(space);
    foe = space.ships.get(this.rivalEnts.get(R.id).id);
    foe.x = 0; foe.y = -1100; foe.a = 0; foe.vx = 0; foe.vy = 0;
    foe.dest = {x: 0, y: -10000};
  } else if (${live}) {
    foe.ai = 'trade'; foe.dest = {x: 6000, y: -1100, out: true};
  } else foe._browserInert = true;
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
      state: active.ent.state, player: {hull: active.ent.hull, a: active.ent.a, vx: active.ent.vx, vy: active.ent.vy, inp: active.ent.inp, x: active.ent.x, y: active.ent.y, target: active.ent.target?.id || 0},
      foe: {id: foe.id, state: foe.state, hull: foe.hull, name: foe.name, rival: foe.rival, ai: foe.ai, x: foe.x, y: foe.y, shield: foe.shield, armor: foe.armor, target: foe.target?.id || 0, aggro: [...foe.aggro]},
      distance: Math.hypot(active.ent.x-foe.x, active.ent.y-foe.y), shots,
      combat: this.combatAssist.payload(active, space),
      hostile: space.isHostile(active.ent, foe), canHit: space.canHit(active.ent, foe), reverseSpared: space.spared(foe, active.ent)
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
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
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
  if (scenery)
    await page.route('**/render.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + '\nexport { decorFor };',
      });
    });
  await page.goto(origin);
  await page.locator('[data-slot="Browser Assist"]').click();
  assert.equal(await page.evaluate(() => G.solo), true, 'actual Solo launch path');
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
  assert.equal(initial.hostile, !neutral, 'fixture uses requested relationship');
  assert.equal(initial.reverseSpared, !neutral, 'hostile fixture exercises newcomer protection');
  assert.equal(initial.canHit, true, 'normal player primary fire could legally hit this hostile');
  // A passive enable must not hunt an idle hostile merely because it exists nearby.
  await page.click('#combatassist');
  await page.waitForFunction(() => G.combat.on && G.combat.status === 'READY');
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(read().shots, 0);
  if (!drift && !named) assert.ok(read().distance > 1090);
  await page.click('#combatstop');
  await page.waitForFunction(() => !G.combat.on);
  // Click the visible radar blip, exercising the user's real target-selection UI.
  const blip = await page.evaluate((id) => {
    const e = G.ents.get(id),
      me = G.view,
      radar = document.getElementById('radar');
    const rect = radar.getBoundingClientRect();
    const k = (radar.height / 2 / (G.radarR || 4200)) * 1.15;
    return {
      x: rect.left + ((radar.width / 2 + (e.rx - me.rx) * k) * rect.width) / radar.width,
      y: rect.top + ((radar.height / 2 + (e.ry - me.ry) * k) * rect.height) / radar.height,
    };
  }, initial.foe.id);
  await page.mouse.click(blip.x, blip.y);
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
  const approached = await until(
    (t) => t.distance < 900 && t.combat.status === 'ENGAGING' && t.combat.target === initial.foe.id,
    'automatic approach',
  );
  if (drift) {
    assert.ok(
      Math.abs(approached.player.a - initial.player.a) > 0.2,
      'Assist changes initial off-target heading',
    );
    assert.ok(
      Math.hypot(
        approached.player.vx - initial.player.vx,
        approached.player.vy - initial.player.vy,
      ) > 20,
      'Assist changes initial drift vector',
    );
  }
  assert.equal(approached.combat.target, initial.foe.id);
  assert.equal(approached.player.inp.thrust, 1, 'Assist applies actual thrust');
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
  let sceneryResult;
  if (scenery) {
    sceneryResult = await page.evaluate(async () => {
      const { decorFor } = await import('/render.js');
      const { SYS } = await import('/shared/galaxy.js');
      const { cometPose, cometScreen, cometTailAngle } = await import('/comet.js');
      const D = decorFor(SYS[G.sys]);
      // Inspect the naturally generated comet in the running game's complete
      // flight renderer, retaining all worlds/ships/UI and its actual sun.
      if (!D.comet) throw new Error('Scenery fixture system must contain a natural comet');
      const canvas = document.getElementById('view');
      const W = canvas.width,
        H = canvas.height,
        z = G.zoom;
      const now = performance.now(),
        pose = cometPose(D.comet, now);
      const cx = (pose.x + (W * 0.15) / z ** 0.25) / 0.12;
      const cy = (pose.y + (H * 0.2) / z ** 0.25) / 0.12;
      G._look = {};
      G._lookT = [cx - G.view.rx, cy - G.view.ry];
      G.lookX = G._lookT[0];
      G.lookY = G._lookT[1];
      const p = cometScreen(D.comet, W, H, z, cx, cy, now);
      const next = cometScreen(D.comet, W, H, z, cx, cy, now + 30000);
      const sun = {
        x: W / 2 + (D.sun.x - cx * D.sun.depth) * z ** 0.25,
        y: H / 2 + (D.sun.y - cy * D.sun.depth) * z ** 0.25,
      };
      return {
        sys: G.sys,
        landed: G.landed,
        naturalComet: true,
        p,
        next,
        sun,
        tailAngle: cometTailAngle(p, sun),
        bgPlanets: D.bgp.length,
        canvas: { W, H },
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await page.screenshot({ path: path.join(evidence, 'comet-integrated-flight.png') });
    assert.equal(sceneryResult.landed, null);
    assert.ok(
      Math.hypot(
        sceneryResult.next.x - sceneryResult.p.x,
        sceneryResult.next.y - sceneryResult.p.y,
      ) > 20,
    );
  }
  assert.deepEqual(errors, []);
  const result = {
    scenery: sceneryResult,
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
        targetRelationship: neutral ? 'neutral' : 'hostile',
        drift,
        named,
        live,
        playerHull,
        targetName: initial.foe.name,
        targetRival: initial.foe.rival,
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
