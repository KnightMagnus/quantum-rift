import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
// Disposable actual multiplayer HTTP/WebSocket server + a complete Chromium client.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS } from '../shared/galaxy.js';
import { augmentAssets, makeLoadout } from '../shared/rules.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-v-net-'));
const evidence = process.env.RIFT_FORMATION_DIR || evidenceDir('armada');
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const names = ['V Lead', 'V Left', 'V Right', 'V Rear', 'V Browser'];
for (const [i, name] of names.entries()) {
  const d = Game.prototype.fresh.call({ A });
  d.ship = makeLoadout(A, i === 2 ? 714 : 704, name);
  d.tut = 999;
  db.create(name, 'fixture', d);
}
db.flush();
const url = (f) => pathToFileURL(path.join(root, f)).href;
const telemetry = path.join(evidence, 'telemetry.json');
const fixture = path.join(dir, 'fixture.mjs');
fs.writeFileSync(
  fixture,
  `
import fs from 'node:fs';
import {Game} from ${JSON.stringify(url('server/game.js'))};
const original=Game.prototype.spawnPlayer;let game;
Game.prototype.spawnPlayer=function(s,...args){original.call(this,s,...args);game=this;
 const i=${JSON.stringify(names)}.indexOf(s.data.name);if(i<0)return;
 const e=s.ent,sp=this.spaces[s.data.sys];e.x=10000+i*500;e.y=10000;e.vx=e.vy=e.a=0;
 for(const o of [...sp.ships.values()])if(!o.player && !o.owner)sp.remove(o);sp.spawnT=1e9;
 if(i===2){const w=sp.makeShip({hull:704,faction:'quantum',x:e.x+200,y:e.y+200});w.owner=e.id;w.ai='escort';w.slot=3;}
};
setInterval(()=>{if(!game)return;const s=[...game.sessions.values()].filter(s=>s.ent && ${JSON.stringify(names)}.includes(s.data.name));if(!s.length)return;const sp=game.spaces[s[0].data.sys];
 // Advance the unmodified production Space.tick faster for bounded QA, not altered physics.
 for(let i=0;i<24;i++)sp.tick();
 fs.writeFileSync(${JSON.stringify(telemetry)}+'.tmp',JSON.stringify(s.map(s=>({name:s.data.name,x:s.ent.x,y:s.ent.y,a:s.ent.a,vx:s.ent.vx,vy:s.ent.vy,follow:s.data.armadaFollow,target:s.armadaFormationTarget,inp:s.ent.inp}))));fs.renameSync(${JSON.stringify(telemetry)}+'.tmp',${JSON.stringify(telemetry)});
},20).unref();
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
    'server/main.js',
  ],
  {
    cwd: root,
    env: { ...process.env, SOLO: '', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await wait(50);
  }
  throw Error(label);
}
const read = () => {
  try {
    return JSON.parse(fs.readFileSync(telemetry));
  } catch {
    return [];
  }
};
const peers = [];
let browser;
try {
  await ready(server, origin);
  async function captain(name) {
    const ws = new WebSocket(origin.replace('http', 'ws') + '/ws');
    const c = { ws, name };
    peers.push(c);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'you') c.you = m.d;
      if (m.t === 'snap') c.snap = m;
      if (m.t === 'follow') c.jump = m;
    };
    await new Promise((r) => (ws.onopen = r));
    c.send = (m) => ws.send(JSON.stringify(m));
    c.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => c.you, 'hello');
    return c;
  }
  for (const name of names.slice(0, 4)) await captain(name);
  const lead = peers[0];
  lead.send({ t: 'armada', op: 'form', name: 'V Network' });
  await until(() => lead.you.armada?.id, 'form');
  const id = lead.you.armada.id;
  for (const c of peers.slice(1)) {
    lead.send({ t: 'armada', op: 'invite', name: c.name });
    await wait(80);
    c.send({ t: 'armada', op: 'accept', id });
    await until(() => c.you.armada?.id === id, 'join');
  }
  for (const c of peers) c.send({ t: 'depart' });
  await until(() => read().length === 4, 'depart');
  for (const c of peers.slice(1)) c.send({ t: 'armada', op: 'follow', on: true });
  await until(
    () =>
      read()
        .filter((s) => s.name !== names[0])
        .every((s) => s.target && Math.hypot(s.x - s.target.x, s.y - s.target.y) < 60),
    'WS V convergence',
  );
  const first = read();
  fs.writeFileSync(path.join(evidence, 'ws-stationary.json'), JSON.stringify(first, null, 2));
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin);
  await page.fill('#lname', names[4]);
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  lead.send({ t: 'armada', op: 'invite', name: names[4] });
  await wait(200);

  // Use the real page's existing socket for UI actions, not a second game session.
  await page
    .locator('[data-tab="captains"], [data-ctab="captains"]')
    .count()
    .then(async (n) => {
      if (n) await page.locator('[data-tab="captains"], [data-ctab="captains"]').first().click();
    });
  console.log(
    'browser buttons',
    await page
      .locator('button')
      .allTextContents()
      .then((x) => x.filter((t) => /ALLIES|ARMADA|JOIN/.test(t))),
  );
  await page.getByText('ALLIES', { exact: true }).click();
  await page.locator('#capview [data-cs=armada]').click();
  await page.getByRole('button', { name: 'JOIN', exact: true }).click();
  for (let i = 0; i < 12 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.getByText('ALLIES', { exact: true }).click();
  await page.locator('#capview [data-cs=armada]').click();
  await page.locator('#afollow').check();
  await until(
    () => read().find((s) => s.name === names[4])?.target,
    'browser follow authoritative',
  );
  await page.waitForFunction(() => G.formation === true);
  await page.evaluate(() => {
    G.opts.mouseAim = true;
  });
  await page.mouse.move(300, 250);
  await wait(3000);
  assert.equal(
    await page.evaluate(() => G.you.armada.follow),
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
    read().find((s) => s.name === names[4]).follow,
    true,
    'idle browser does not cancel formation',
  );
  await page.screenshot({ path: path.join(evidence, 'multiplayer-follow.png') });
  await page.evaluate(() => {
    document.activeElement?.blur();
  });
  lead.send({ t: 'input', seq: 1, th: 1 });
  await wait(200);
  lead.send({ t: 'input', seq: 2 });
  await wait(2500);
  const moving = read();
  assert.ok(moving[1].y < first[1].y - 100, 'real WS leader controls move followers');
  peers[1].send({ t: 'input', seq: 1, th: 1, nav: true });
  await until(() => {
    const s = read().find((s) => s.name === names[1]);
    return s?.follow && !s.target;
  }, 'WS navigation yields without revoking consent');
  peers[1].send({ t: 'input', seq: 2 });
  await until(() => read().find((s) => s.name === names[1])?.target, 'WS formation resumes');
  peers[1].send({ t: 'input', seq: 3, th: 1 });
  await until(
    () => read().find((s) => s.name === names[1])?.follow === false,
    'WS manual takeover',
  );
  peers[1].send({ t: 'input', seq: 4 });
  await page.keyboard.down('ArrowUp');
  await wait(100);
  await page.keyboard.up('ArrowUp');
  await until(
    () => read().find((s) => s.name === names[4])?.follow === false,
    'browser keyboard takeover',
  );
  // Real leader jump packet must initiate the complete browser's jump, not merely plot a route.
  await page.locator('#afollow').check();
  await page.waitForFunction(() => G.you.armada.follow && G.formation);
  const jumpOrigin = await page.evaluate(() => G.sys);
  const jumpDestination = SYS[jumpOrigin].links[0];
  lead.send({ t: 'jump', to: jumpDestination });
  await page.waitForFunction((destination) => G.sys === destination, jumpDestination, {
    timeout: 25000,
  });
  await page.waitForFunction(() => G.formation && G.you.armada.follow);
  assert.equal(
    await page.evaluate(() => G.you.armada.follow),
    true,
    'leader jump retains Follow consent and resumes formation',
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
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
  for (const c of peers) c.ws.close();
  await cleanup(server, browser, log, dir);
}
