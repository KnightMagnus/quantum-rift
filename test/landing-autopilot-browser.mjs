import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
// Actual Solo server, production client input loop and authoritative flight physics.
// Fixture only seeds hull/position/drift, removes ambient combat and records telemetry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout, shipStats } from '../shared/rules.ts';
import { STELLARS } from '../shared/galaxy.ts';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-landing-browser-'));
const evidence = path.resolve(process.argv[2] || evidenceDir('landing-autopilot'));
fs.mkdirSync(evidence, { recursive: true });
const A = augmentAssets(JSON.parse(fs.readFileSync('shared/assets.json')));
const db = new DB(path.join(dir, 'data'));
const cases = [
  {
    name: 'Cruise Skiff',
    hull: 703,
    port: 'meridian-yards',
    x: 0,
    y: 2200,
    vx: 1,
    vy: -153.9,
    a: Math.PI / 2,
    cruise: true,
  },
  {
    name: 'Cruise Liner',
    hull: 714,
    port: 'meridian-yards',
    x: 0,
    y: 1700,
    vx: 1,
    vy: -117,
    a: Math.PI / 2,
    cruise: true,
  },
  {
    name: 'Skiff Station',
    hull: 703,
    port: 'site-qgate',
    x: 450,
    y: 500,
    vx: 100,
    vy: -80,
    a: 2.5,
  },
  { name: 'Courier Luna', hull: 821, port: 'luna', x: 700, y: 400, vx: -170, vy: 60, a: -1.57 },
  { name: 'Liner Planet', hull: 714, port: 'concordia', x: -1000, y: 550, vx: 100, vy: 50, a: 0 },
  {
    name: 'Hauler Yards',
    hull: 704,
    port: 'meridian-yards',
    x: 800,
    y: 450,
    vx: -80,
    vy: 30,
    a: 2.4,
  },
  { name: 'Near Fast', hull: 821, port: 'luna', x: 110, y: 20, vx: -180, vy: -80, a: -0.4 },
  // Borderline near/slow direct clicks raced server authority on the former path.
  { name: 'Edge Drift', hull: 704, port: 'meridian-yards', x: 117, y: 0, vx: 65, vy: 10, a: 1.57 },
];
for (const c of cases) {
  const d = Game.prototype.fresh.call({ A });
  d.ship = makeLoadout(A, c.hull, c.name);
  d.tut = 999;
  d.story = { done: ['start'], active: null };
  d.sys = STELLARS[c.port].system;
  d.stellar = c.port;
  d.station.claimed = true;
  d.station.site = 'site-qgate';
  d.station.ops = 1;
  db.create(c.name, '', d);
}
const denied = Game.prototype.fresh.call({ A });
denied.tut = 999;
denied.story = { done: ['start'], active: null };
denied.sys = 'sol';
denied.stellar = 'luna';
denied.rep.quantum = -40;
db.create('Landing Denied', '', denied);
db.touch();
db.flush();
const traceFile = path.join(evidence, 'server-telemetry.jsonl');
const fixture = path.join(dir, 'fixture.mjs');
const url = (p) => pathToFileURL(path.join(root, p)).href;
fs.writeFileSync(
  fixture,
  `
import fs from 'node:fs';
import { Game } from ${JSON.stringify(url('server/game.ts'))};
import { STELLARS } from ${JSON.stringify(url('shared/galaxy.ts'))};
const cases = ${JSON.stringify(cases)}, active = new Map();
const write = row => fs.appendFileSync(${JSON.stringify(traceFile)}, JSON.stringify({...row,time:Date.now()})+'\\n');
const spawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function(s,...args) {
 spawnPlayer.call(this,s,...args);
 const c=cases.find(c=>c.name===s.data.name); if(!c)return;
 const p=STELLARS[c.port], e=s.ent;
 Object.assign(e,{x:p.x+c.x,y:p.y+c.y,vx:c.vx,vy:c.vy,a:c.a});
 const space=this.spaces[s.data.sys];
 for(const other of [...space.ships.values()])if(!other.player)space.remove(other);
 active.set(s.data.name,{s,p,last:0});
 write({kind:'spawn',name:s.data.name,hull:e.hull,port:p.id,r:p.r});
};
const land=Game.prototype.land;
Game.prototype.land=function(s,id) {
 const e=s.ent, p=STELLARS[id];
 if(e)write({kind:'request',name:s.data.name,port:id,distance:Math.hypot(e.x-p.x,e.y-p.y),speed:Math.hypot(e.vx,e.vy),a:e.a});
 const result=land.call(this,s,id);
 write({kind:'result',name:s.data.name,landed:!!s.data.stellar});return result;
};
const tick=Game.prototype.tick;
Game.prototype.tick=function(...args) {
 const result=tick.apply(this,args);
 for(const [name,c] of active) {
  const e=c.s.ent;if(!e)continue;
  const now=Date.now();if(now-c.last<30)continue;c.last=now;
  write({kind:'tick',name,distance:Math.hypot(e.x-c.p.x,e.y-c.p.y),speed:Math.hypot(e.vx,e.vy),x:e.x,y:e.y,vx:e.vx,vy:e.vy,a:e.a,inp:e.inp,fuel:e.fuel});
 }return result;
};
`,
);
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    '--import',
    path.join(root, 'test/helpers/seed-random.mjs'),
    '--import',
    fixture,
    'server/main.ts',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: path.join(dir, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const { chromium } = await import('playwright');
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: [
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  const results = [];
  for (const c of cases.filter(
    (c) => !process.env.RIFT_LANDING_CASE || c.name === process.env.RIFT_LANDING_CASE,
  )) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [],
      sent = [],
      received = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('websocket', (socket) => {
      socket.on('framesent', (f) => {
        try {
          sent.push(JSON.parse(f.payload));
        } catch {}
      });
      socket.on('framereceived', (f) => {
        try {
          received.push(JSON.parse(f.payload));
        } catch {}
      });
    });
    // 180ms upstream delay exercises a modest network path, not altered flight physics.
    await page.addInitScript(() => {
      const original = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        setTimeout(() => {
          if (this.readyState === 1) original.call(this, data);
        }, 180);
      };
    });
    await page.goto(origin);
    await page.locator(`[data-slot="${c.name}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.evaluate((id) => {
      G.navStellar = id;
      G.opts.mouseAim = false;
    }, c.port);
    const start = Date.now(),
      traceStart = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').length : 0;
    await page.keyboard.press('l');
    await page.waitForFunction((id) => G.auto?.id === id, c.port);
    if (c.cruise) {
      await page.waitForTimeout(3500);
      const cruise = await page.evaluate(async () => {
        const { STELLARS } = await import('/shared/galaxy.js');
        const p = STELLARS[G.auto.id],
          s = G.ents.get(G.myId);
        const bearing = Math.atan2(p.x - s.x, -(p.y - s.y));
        return {
          heading: s.a,
          bearing,
          error: Math.abs(Math.atan2(Math.sin(s.a - bearing), Math.cos(s.a - bearing))),
          speed: Math.hypot(s.vx, s.vy),
          phase: G.auto.phase,
        };
      });
      fs.writeFileSync(
        path.join(evidence, c.name + '-cruise.json'),
        JSON.stringify(cruise, null, 2),
      );
      await page.screenshot({ path: path.join(evidence, c.name + '-cruise.png') });
      assert.ok(cruise.error < 0.2, 'authoritative targetward cruise: ' + JSON.stringify(cruise));
    }
    {
      await page.waitForFunction(() => G.auto?.phase === 'brake', {}, { timeout: 30000 });
      await page.screenshot({
        path: path.join(evidence, 'braking-' + c.name.replaceAll(' ', '-') + '.png'),
      });
    }
    let landed = true;
    try {
      await page.waitForFunction(() => !!G.landed, {}, { timeout: 45000 });
    } catch {
      landed = false;
    }
    const trace = fs
      .readFileSync(traceFile, 'utf8')
      .slice(traceStart)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((x) => JSON.parse(x));
    const requests = trace.filter((x) => x.name === c.name && x.kind === 'request');
    const ticks = trace.filter((x) => x.name === c.name && x.kind === 'tick');
    const warnings = received.filter((m) => m.t === 'toast' && /Too far|Slow down/.test(m.msg));
    let reversals = 0,
      lastDirection = 0,
      lastA;
    for (const t of ticks.filter((t) => t.distance < STELLARS[c.port].r + 160)) {
      if (lastA !== undefined) {
        const da = Math.atan2(Math.sin(t.a - lastA), Math.cos(t.a - lastA)),
          direction = Math.abs(da) > 0.008 ? Math.sign(da) : 0;
        if (direction && lastDirection && direction !== lastDirection) reversals++;
        if (direction) lastDirection = direction;
      }
      lastA = t.a;
    }
    const brakeStart = ticks.findIndex((t) => t.inp?.rev);
    // Near/fast entries can safely stop outside the port and re-approach.
    // Bound rotation within each committed retrograde pass, not the intervening
    // approach turn (which is deliberately allowed by landingGuidance).
    let brakeHeadingTravel = 0,
      passTravel = 0;
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].inp?.rev && ticks[i - 1].inp?.rev) {
        const da = ticks[i].a - ticks[i - 1].a;
        passTravel += Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
        brakeHeadingTravel = Math.max(brakeHeadingTravel, passTravel);
      } else passTravel = 0;
    }
    const row = {
      name: c.name,
      hull: c.hull,
      port: c.port,
      initial: c,
      stats: shipStats(A, makeLoadout(A, c.hull)),
      landed,
      seconds: (Date.now() - start) / 1000,
      requests,
      warnings,
      nearTurnReversals: reversals,
      brakeHeadingTravel,
      pageErrors: errors,
    };
    results.push(row);
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({
        name: c.name,
        landed,
        seconds: row.seconds,
        requests,
        warnings,
        reversals,
        errors,
      }),
    );
    await page.screenshot({
      path: path.join(evidence, `fixed-${c.name.replaceAll(' ', '-')}.png`),
    });
    {
      assert.ok(landed, `${c.name} lands`);
      assert.equal(requests.length, 1, `${c.name} one request`);
      assert.equal(requests[0].port, c.port, `${c.name} lands at intended nearest port`);
      assert.ok(brakeStart >= 0, `${c.name} uses real retrograde control`);
      assert.ok(brakeHeadingTravel < Math.PI + 0.3, `${c.name} no repeated braking rotations`);
      assert.equal(warnings.length, 0, `${c.name} no premature server landing warnings`);
      assert.ok(requests[0].distance <= STELLARS[c.port].r + 30);
      assert.ok(requests[0].speed <= Math.max(2, (row.stats.accel / 30) * 0.55) + 2);
      assert.deepEqual(errors, []);
    }
    await page.close();
  }
  // Override a live approach using actual steering input; no server command injection.
  const page = await browser.newPage();
  await page.goto(origin);
  await page.locator('[data-slot="Skiff Station"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.evaluate(() => {
    G.navStellar = 'site-qgate';
    G.opts.mouseAim = false;
  });
  await page.keyboard.press('l');
  await page.waitForFunction(() => G.auto?.mode === 'land');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => !G.auto);
  await page.keyboard.up('ArrowLeft');
  assert.equal(await page.evaluate(() => G.auto), null);
  fs.writeFileSync(
    path.join(evidence, 'manual-override.json'),
    JSON.stringify({ autopilotCancelled: true }),
  );
  await page.close();
  const deniedPage = await browser.newPage();
  await deniedPage.goto(origin);
  await deniedPage.locator('[data-slot="Landing Denied"]').click();
  await deniedPage.waitForFunction(() => G.you && G.landed);
  await deniedPage.click('#depart');
  await deniedPage.waitForFunction(() => G.view && !G.landed);
  await deniedPage.keyboard.press('l');
  await deniedPage.waitForFunction(() => !!G.auto);
  await deniedPage.waitForFunction(() => !G.auto, {}, { timeout: 15000 });
  assert.equal(await deniedPage.evaluate(() => G.landed), null);
  assert.match(await deniedPage.locator('body').innerText(), /refuses you permission to land/);
  fs.writeFileSync(
    path.join(evidence, 'permission-denial.json'),
    JSON.stringify({ landed: false, autopilotCancelled: true }),
  );
  await deniedPage.close();
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
process.exit(0);
