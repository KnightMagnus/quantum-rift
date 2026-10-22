// Optional actual Solo browser regression; isolated saves only.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/outfitter-wing-repairs-browser.mjs /evidence
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { repairBasis } from '../shared/rules.ts';
import { WING_REPAIR_COST } from '../shared/docks.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  evidence = path.resolve(process.argv[2] || 'artifacts/outfitter-wing-repairs'),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-wing-browser-')),
  A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
  g = new Game(A, new DB(dir)),
  cases = [
    ['Station Repairs', 'meridian-yards', 1e6],
    ['Planet Repairs', 'concordia', 1e6],
    ['Poor Repairs', 'concordia', 0],
    ['No Outfitter', 'longhaul-depot', 1e6],
  ];
fs.mkdirSync(evidence, { recursive: true });
const expected = {};
for (const [name, port, money] of cases) {
  const d = g.db.create(name, '', g.fresh());
  d.tut = 999;
  d.story = { done: ['start'], active: null };
  d.station.claimed = true;
  d.station.ops = 2;
  d.station.site = 'site-qgate';
  d.escorts = [751];
  g.features.docks.docksInit(d);
  d.stellar = port;
  d.sys = STELLARS[port].system;
  d.credits = money;
  const X = d.dock[0];
  X.repairT = Date.now() + 600000;
  expected[name] = {
    uid: X.ship.uid,
    cost: Math.round(repairBasis(A, X.ship.hull) * WING_REPAIR_COST),
    money,
    timer: X.repairT,
  };
}
g.db.touch();
g.db.flush();
const port = Number(process.env.REPAIR_TEST_PORT || 18974),
  origin = `http://127.0.0.1:${port}`,
  server = spawn(process.execPath, ['server/main.ts'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: dir,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
  log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];
  for (const [name, portId] of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.__testSocket = this;
        }
      };
    });
    await page.goto(origin);
    await page.locator(`[data-slot="${name}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    const before = await page.evaluate(() => ({
      credits: G.you.credits,
      timer: G.you.docks.stored[0].repairT,
    }));
    const button = page.locator('[data-act="outfitterrep"]');
    if (name === 'No Outfitter') {
      assert.equal(await page.locator('[data-lt="outfit"]').count(), 0);
      await page.evaluate(
        (uid) => __testSocket.send(JSON.stringify({ t: 'docks', op: 'outfitterRepair', uid })),
        expected[name].uid,
      );
      await page.waitForTimeout(250);
      assert.match(
        await page.locator('body').innerText(),
        /Land at a planet or station with an outfitter/,
      );
    } else {
      await page.locator('[data-lt="outfit"]').click();
      await button.waitFor();
      assert.match(await button.innerText(), /RUSH REPAIRS 52,000/);
      if (name === 'Poor Repairs') {
        assert.equal(await button.isDisabled(), true);
        await page.evaluate(
          (uid) => __testSocket.send(JSON.stringify({ t: 'docks', op: 'outfitterRepair', uid })),
          expected[name].uid,
        );
        await page.waitForTimeout(250);
        assert.match(await page.locator('body').innerText(), /Rush repairs cost 52,000 credits/);
      } else {
        await page.screenshot({
          path: path.join(evidence, name.split(' ')[0].toLowerCase() + '-before.png'),
        });
        await button.click();
        await page.waitForFunction(() => G.you.docks.stored[0].repairT === 0);
        await page.waitForFunction(() => !document.querySelector('[data-act="outfitterrep"]'));
        assert.match(await page.locator('#landbody').innerText(), /No disabled wingmates/);
        await page.evaluate(
          (uid) => __testSocket.send(JSON.stringify({ t: 'docks', op: 'outfitterRepair', uid })),
          expected[name].uid,
        );
        await page.waitForTimeout(200);
      }
    }
    const after = await page.evaluate(() => ({
      credits: G.you.credits,
      timer: G.you.docks.stored[0].repairT,
    }));
    assert.equal(
      after.credits,
      name === 'Station Repairs' || name === 'Planet Repairs'
        ? before.credits - expected[name].cost
        : before.credits,
    );
    assert.equal(
      after.timer,
      name === 'Station Repairs' || name === 'Planet Repairs' ? 0 : before.timer,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: path.join(evidence, name.toLowerCase().replaceAll(' ', '-') + '.png'),
    });
    let stationTier;
    if (name === 'Station Repairs') {
      if (!(await page.locator('#hud').isVisible())) await page.click('#traytoggle');
      await page.locator('[data-tab="station"]').click();
      await page.locator('[data-act="stab"][data-k="ops"]').waitFor();
      const text = await page.locator('#stview').innerText();
      assert.match(text, /STATION TIER/);
      assert.match(text, /T-2/);
      assert.match(text, /Next: Station Tier 3/);
      assert.doesNotMatch(text, /\bOps\b/);
      assert.equal(
        await page.evaluate(() => G.you.station.ops),
        2,
        'old saved ops key still loads',
      );
      await page.screenshot({ path: path.join(evidence, 'station-tier.png') });
      stationTier = { savedOps: 2, text };
    }
    results.push({ name, port: portId, before, after, stationTier, errors });
    await page.close();
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  log.end();
}
process.exit(0);
