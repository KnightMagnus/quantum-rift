// Real NPC trade/landing AI, server snapshots and browser render frames: bank roll regression.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-banking-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(evidence, 'server-samples.jsonl'), '');
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const fresh = Game.prototype.fresh.call({ A });
fresh.ship = makeLoadout(A, 703, 'Banking Observer');
fresh.tut = 999;
// Deliberately retain normal Ops 0 newcomer protection and an inner-system location.
assert.equal(fresh.station.ops, 0);
db.create('Banking Observer', 'browser-banking', fresh);
const telemetry = path.join(evidence, 'telemetry.json');
const fixture = path.join(dir, 'fixture.mjs');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
fs.writeFileSync(
  fixture,
  `
import fs from 'node:fs';
import { Game } from ${JSON.stringify(moduleUrl('server/game.js'))};
import { STELLARS } from ${JSON.stringify(moduleUrl('shared/galaxy.js'))};
let active, trader, space, previousWrite = 0;
const spawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function(s, ...args) {
  spawnPlayer.call(this, s, ...args);
  if(s.data.name !== 'Banking Observer') return;
  active = s; space = this.spaces[s.data.sys];
  for(const e of [...space.ships.values()]) if(!e.player) space.remove(e);
  const port = STELLARS.qstation, x = port.x-500, y = port.y+450;
  s.ent.x = x+120; s.ent.y = y+80; s.ent.vx = 0; s.ent.vy = 0;
  trader = space.makeShip({hull:704, faction:'quantum', name:'Banking Trader Fixture', ai:'trade', x,y, a:Math.atan2(port.x-x,-(port.y-y))+Math.PI});
  trader.dest = port;
};
const tick=Game.prototype.tick;
Game.prototype.tick=function(...args) {
  const result=tick.apply(this,args);
  if(active?.ent && trader && Date.now()-previousWrite>40) {
    previousWrite=Date.now();
    const sample={time:Date.now(), id:trader.id, angle:trader.a, x:trader.x,y:trader.y, turn:trader.inp.turn||0, ai:trader.ai, dead:trader.dead, target:trader.target?.id||0};
    fs.writeFileSync(${JSON.stringify(telemetry)},JSON.stringify(sample));
    fs.appendFileSync(${JSON.stringify(path.join(evidence, 'server-samples.jsonl'))},JSON.stringify(sample)+String.fromCharCode(10));
  }
  return result;
};
`,
);

const port = Number(process.env.RIFT_BROWSER_PORT || 18776);
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
  await page.fill('#lname', 'Banking Observer');
  await page.fill('#lpass', 'browser-banking');
  await page.click('#lbtn');
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const initial = await until((t) => t.id, 'trader spawned');
  await page.waitForFunction((id) => G.ents.has(id), initial.id);
  const recording = page.evaluate(async (id) => {
    const samples = [];
    await new Promise((resolve) => {
      const end = performance.now() + 13000;
      const collect = () => {
        const e = G.ents.get(id);
        if (e?._bank)
          samples.push({
            time: performance.timeOrigin + performance.now(),
            bank: e._bank.bank,
            rate: e._bank.rate,
            angle: e.a,
            snapshotAt: performance.timeOrigin + e.t,
          });
        if (performance.now() < end) requestAnimationFrame(collect);
        else resolve();
      };
      requestAnimationFrame(collect);
    });
    return samples;
  }, initial.id);
  await until((t) => Math.abs(t.turn) > 0, 'real trader steering');
  await new Promise((resolve) => setTimeout(resolve, 550));
  await page.screenshot({ path: path.join(evidence, 'trader-turn.png') });
  const banks = await recording;
  const serverSamples = fs
    .readFileSync(path.join(evidence, 'server-samples.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  // Locate sustained real steering runs, then skip filter startup and steering endpoints.
  const runs = [];
  for (const sample of serverSamples.filter((s) => !s.dead)) {
    let run = runs.at(-1);
    if (!run || run.turn !== sample.turn) {
      run = { turn: sample.turn, start: sample.time, end: sample.time, samples: 0 };
      runs.push(run);
    }
    run.end = sample.time;
    run.samples++;
  }
  const turning = runs.filter((run) => Math.abs(run.turn) > 0 && run.end - run.start >= 600);
  assert.ok(turning.length > 0, 'real NPC trade AI produced a sustained turn');
  const verifiedTurns = [];
  for (const run of turning) {
    const frames = banks.filter(
      (sample) => sample.time >= run.start + 300 && sample.time <= run.end - 100,
    );
    if (frames.length < 8) continue;
    const expected = run.turn > 0 ? 1 : 2;
    assert.ok(
      frames.every((sample) => sample.bank === expected),
      `bank must stay ${expected} across display frames during actual steering: ${JSON.stringify(frames.filter((sample) => sample.bank !== expected).slice(0, 5))}`,
    );
    verifiedTurns.push({ turn: run.turn, frames: frames.length, durationMs: run.end - run.start });
  }
  assert.ok(verifiedTurns.length > 0, 'visible turn frames were recorded');
  const straight = runs.filter(
    (run) => run.turn === 0 && run.end - run.start >= 1000 && run.start > turning[0].start,
  );
  const levelFrames = straight.flatMap((run) =>
    banks.filter((sample) => sample.time >= run.start + 600 && sample.time <= run.end - 100),
  );
  assert.ok(levelFrames.length >= 8, 'a visible settled-heading run was recorded');
  assert.ok(
    levelFrames.every((sample) => sample.bank === 0),
    'settled heading returns to and holds level',
  );
  assert.ok(
    serverSamples.every((sample) => sample.ai === 'trade' && sample.target === 0),
    'fixture used normal noncombat trade AI throughout',
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidence, 'trader-landed.png') });
  fs.writeFileSync(path.join(evidence, 'browser-frames.json'), JSON.stringify(banks, null, 2));
  const result = {
    pass: true,
    verifiedTurns,
    levelFrames: levelFrames.length,
    serverSamples: serverSamples.length,
    browserFrames: banks.length,
    pageErrors: errors,
    evidence,
  };
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  log.end();
}
