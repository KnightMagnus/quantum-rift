// Optional actual Solo browser regression; isolated saves only.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/outfitter-wing-repairs-browser.ts /evidence
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { repairBasis } from '../shared/rules.ts';
import { WING_REPAIR_COST } from '../shared/docks.ts';
const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
  )) as typeof import('playwright'),
  evidence = path.resolve(process.argv[2] || 'artifacts/outfitter-wing-repairs'),
  directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-wing-browser-')),
  assets = JSON.parse(
    fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  ),
  game = new Game(assets, new Database(directory)),
  cases = [
    ['Station Repairs', 'meridian-yards', 1e6],
    ['Planet Repairs', 'concordia', 1e6],
    ['Poor Repairs', 'concordia', 0],
    ['No Outfitter', 'longhaul-depot', 1e6],
  ] as const;
fileSystem.mkdirSync(evidence, { recursive: true });
const expected: Record<string, { uid: string; cost: number; money: number; timer: number }> = {};
for (const [name, port, money] of cases) {
  const playerData = game.db.create(name, '', game.fresh());
  playerData.tut = 999;
  Object.assign(playerData, { story: { done: ['start'], active: null } });
  playerData.station.claimed = true;
  playerData.station.ops = 2;
  playerData.station.site = 'site-qgate';
  playerData.escorts = [751];
  game.features.docks.docksInit(playerData);
  playerData.stellar = port;
  playerData.sys = STELLARS[port].system;
  playerData.credits = money;
  const horizontalCoordinate = playerData.dock[0];
  horizontalCoordinate.repairT = Date.now() + 600000;
  expected[name] = {
    uid: horizontalCoordinate.ship.uid!,
    cost: Math.round(repairBasis(assets, horizontalCoordinate.ship.hull) * WING_REPAIR_COST),
    money,
    timer: horizontalCoordinate.repairT,
  };
}
game.db.touch();
game.db.flush();
const port = Number(process.env.REPAIR_TEST_PORT || 18974),
  origin = `http://127.0.0.1:${port}`,
  server = spawn(process.execPath, ['server/main.ts'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: directory,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
  serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  for (let index = 0; index < 100; index++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];
  for (const [name, portId] of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors: string[] = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args: ConstructorParameters<typeof WebSocket>) {
          super(...args);
          window.__testSocket = this;
        }
      };
    });
    await page.goto(origin);
    await page.locator(`[data-slot="${name}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    const before = await page.evaluate(() => ({
      credits: G.you!.credits,
      timer: G.you!.docks.stored[0].repairT,
    }));
    const button = page.locator('[data-act="outfitterrep"]');
    if (name === 'No Outfitter') {
      assert.equal(await page.locator('[data-lt="outfit"]').count(), 0);
      await page.evaluate(
        (shipUid) =>
          __testSocket.send(JSON.stringify({ t: 'docks', op: 'outfitterRepair', uid: shipUid })),
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
          (firstRepairShipUid) =>
            __testSocket.send(
              JSON.stringify({ t: 'docks', op: 'outfitterRepair', uid: firstRepairShipUid }),
            ),
          expected[name].uid,
        );
        await page.waitForTimeout(250);
        assert.match(await page.locator('body').innerText(), /Rush repairs cost 52,000 credits/);
      } else {
        await page.screenshot({
          path: path.join(evidence, name.split(' ')[0].toLowerCase() + '-before.png'),
        });
        await button.click();
        await page.waitForFunction(() => G.you!.docks.stored[0].repairT === 0);
        await page.waitForFunction(() => !document.querySelector('[data-act="outfitterrep"]'));
        assert.match(await page.locator('#landbody').innerText(), /No disabled wingmates/);
        await page.evaluate(
          (secondRepairShipUid) =>
            __testSocket.send(
              JSON.stringify({ t: 'docks', op: 'outfitterRepair', uid: secondRepairShipUid }),
            ),
          expected[name].uid,
        );
        await page.waitForTimeout(200);
      }
    }
    const after = await page.evaluate(() => ({
      credits: G.you!.credits,
      timer: G.you!.docks.stored[0].repairT,
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
        await page.evaluate(() => G.you!.station.ops),
        2,
        'old saved ops key still loads',
      );
      await page.screenshot({ path: path.join(evidence, 'station-tier.png') });
      stationTier = { savedOps: 2, text };
    }
    results.push({ name, port: portId, before, after, stationTier, errors });
    await page.close();
  }
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  serverLog.end();
}
process.exit(0);
