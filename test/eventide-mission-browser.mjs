// Actual Solo board acceptance, exported save/reload, jump authority and delivery payout.
// A test-only server preload positions the disposable captain clear of departure mass-lock,
// then beside the destination after a REAL server jump. It never changes missions/rewards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-eventide-ui-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data')),
  d = Game.prototype.fresh.call({ A });
d.sys = 'lantern-twins';
d.stellar = 'twins-exchange';
d.tut = 999;
d.credits = 1000000;
db.create('Eventide Supply', 'solo', d);
const fixture = path.join(dir, 'fixture.mjs');
fs.writeFileSync(
  fixture,
  `import {Game} from ${JSON.stringify(pathToFileURL(path.join(root, 'server/game.ts')).href)};\nconst spawn=Game.prototype.spawnPlayer,finish=Game.prototype.finishJump;Game.prototype.spawnPlayer=function(s,...args){spawn.call(this,s,...args);if(s.data.name==='Eventide Supply'&&s.data.sys==='lantern-twins'){s.ent.x=0;s.ent.y=-2400;s.ent.vx=s.ent.vy=0;}};Game.prototype.finishJump=function(e,sp){const s=e.player?.s;finish.call(this,e,sp);if(s?.data.name==='Eventide Supply'&&s.data.sys==='aureole'){s.ent.x=-540;s.ent.y=410;s.ent.vx=s.ent.vy=0;}};`,
);
const port = Number(process.env.RIFT_BROWSER_PORT || 18844),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', fixture, 'server/main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const W = window.WebSocket;
    window.WebSocket = class extends W {
      constructor(...args) {
        super(...args);
        window.testSocket = this;
      }
    };
  });
  const login = async () => {
    await page.goto(origin);
    await page.locator('[data-slot="Eventide Supply"]').click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
  };
  await login();
  await page.click('[data-lt="jobs"]');
  const accept = page.locator(
    '[data-act="accept"][data-id^="eventide-twins-exchange-"][data-id$="-supply"]',
  );
  await accept.click();
  await page.waitForFunction(() =>
    G.you.missions.some((m) => m.id.startsWith('eventide-') && m.type === 'cargo'),
  );
  const job = await page.evaluate(() =>
    G.you.missions.find((m) => m.id.startsWith('eventide-') && m.type === 'cargo'),
  );
  const save1 = await (await fetch(origin + '/api/export?name=Eventide%20Supply')).json();
  assert.ok(save1.save.missions.some((m) => m.id === job.id));
  fs.writeFileSync(path.join(evidence, 'accepted-save.json'), JSON.stringify(save1, null, 2));
  await page.screenshot({ path: path.join(evidence, 'accepted-board.png') });
  await page.reload();
  await page.locator('[data-slot="Eventide Supply"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  assert.ok(await page.evaluate((id) => G.you.missions.some((m) => m.id === id), job.id));
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  const credits = await page.evaluate(() => G.you.credits);
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.evaluate(() => testSocket.send(JSON.stringify({ t: 'jump', to: 'aureole' })));
  await page.waitForFunction(() => G.sys === 'aureole' && G.view, { timeout: 15000 });
  await page.evaluate(() =>
    testSocket.send(JSON.stringify({ t: 'land', stellar: 'aureole-ring' })),
  );
  await page.waitForFunction(() => G.landed?.stellar === 'aureole-ring');
  assert.equal(await page.evaluate((id) => G.you.missions.some((m) => m.id === id), job.id), false);
  const paid = await page.evaluate(() => G.you.credits);
  assert.ok(paid >= credits + job.reward);
  const save2 = await (await fetch(origin + '/api/export?name=Eventide%20Supply')).json();
  assert.ok(!save2.save.missions.some((m) => m.id === job.id));
  await page.screenshot({ path: path.join(evidence, 'delivered-aureole.png') });
  assert.deepEqual(errors, []);
  const results = {
    pass: true,
    job: job.title,
    destination: job.dest,
    saveRetainedAfterReload: true,
    normalServerJump: true,
    reward: job.reward,
    creditsBefore: credits,
    creditsAfter: paid,
    errors,
    testOnlyPositionFixture: true,
  };
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  server.kill();
}
