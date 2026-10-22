import type { PreloadConfig } from './fixtures/preload-landing-autopilot-browser.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
// Actual Solo server, production client input loop and authoritative flight physics.
// Fixture only seeds hull/position/drift, removes ambient combat and records telemetry.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout, shipStats } from '../shared/rules.ts';
import { STELLARS } from '../shared/galaxy.ts';
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-landing-browser-'),
);
const evidence = path.resolve(process.argv[2] || evidenceDir('landing-autopilot'));
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = augmentAssets(JSON.parse(fileSystem.readFileSync('shared/assets.json').toString()));
const database = new Database(path.join(directory, 'data'));
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
for (const landingScenario of cases) {
  const playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
    import('../server/game.ts').Game['fresh']
  > & { story?: { done: string[]; active: null; step: number } };
  playerData.ship = makeLoadout(assets, landingScenario.hull, landingScenario.name);
  playerData.tut = 999;
  playerData.story = { done: ['start'], active: null, step: 0 };
  playerData.sys = STELLARS[landingScenario.port].system;
  playerData.stellar = landingScenario.port;
  playerData.station.claimed = true;
  playerData.station.site = 'site-qgate';
  playerData.station.ops = 1;
  database.create(landingScenario.name, '', playerData);
}
const denied = Game.prototype.fresh.call({ A: assets }) as ReturnType<
  import('../server/game.ts').Game['fresh']
> & { story?: { done: string[]; active: null; step: number } };
denied.tut = 999;
denied.story = { done: ['start'], active: null, step: 0 };
denied.sys = 'sol';
denied.stellar = 'luna';
denied.rep.quantum = -40;
database.create('Landing Denied', '', denied);
database.touch();
database.flush();
const traceFile = path.join(evidence, 'server-telemetry.jsonl');
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-landing-autopilot-browser.ts', import.meta.url),
);

const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    '--import',
    path.join(root, 'test/helpers/seed-random.ts'),
    '--import',
    fixture,
    'server/local-main.ts',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      RIFT_PRELOAD_CONFIGURATION: JSON.stringify({
        cases: cases,
        tracePath: traceFile,
      } satisfies PreloadConfig),
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: path.join(directory, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
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
  for (const landingScenario2 of cases.filter(
    (selectedLandingCase) =>
      !process.env.RIFT_LANDING_CASE || selectedLandingCase.name === process.env.RIFT_LANDING_CASE,
  )) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [],
      sent: { t: string; [entryKey: string]: unknown }[] = [],
      received: { t: string; [entryKey2: string]: unknown }[] = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('websocket', (socket) => {
      socket.on('framesent', (feature) => {
        try {
          sent.push(JSON.parse(String(feature.payload)));
        } catch {}
      });
      socket.on('framereceived', (feature2) => {
        try {
          received.push(JSON.parse(String(feature2.payload)));
        } catch {}
      });
    });
    // 180ms upstream delay exercises a modest network path, not altered flight physics.
    await page.addInitScript(() => {
      const original = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        setTimeout(() => {
          if (this.readyState === 1) original.call(this, data);
        }, 180);
      };
    });
    await page.goto(origin);
    await page.locator(`[data-slot="${landingScenario2.name}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.evaluate((identifier) => {
      G.navStellar = identifier;
      G.opts.mouseAim = false;
    }, landingScenario2.port);
    const start = Date.now(),
      traceStart = fileSystem.existsSync(traceFile)
        ? fileSystem.readFileSync(traceFile, 'utf8').length
        : 0;
    await page.keyboard.press('l');
    await page.waitForFunction((identifier) => G.auto?.id === identifier, landingScenario2.port);
    if (landingScenario2.cruise) {
      await page.waitForTimeout(3500);
      const cruise = await page.evaluate(async () => {
        const { STELLARS } = await import('/shared/galaxy.js');
        const player = STELLARS[G.auto!.id!],
          session = G.ents.get(G.myId);
        const bearing = Math.atan2(player.x - session!.x, -(player.y - session!.y));
        return {
          heading: session!.a,
          bearing,
          error: Math.abs(
            Math.atan2(Math.sin(session!.a - bearing), Math.cos(session!.a - bearing)),
          ),
          speed: Math.hypot(session!.vx, session!.vy),
          phase: G.auto!.phase,
        };
      });
      fileSystem.writeFileSync(
        path.join(evidence, landingScenario2.name + '-cruise.json'),
        JSON.stringify(cruise, null, 2),
      );
      await page.screenshot({ path: path.join(evidence, landingScenario2.name + '-cruise.png') });
      assert.ok(cruise.error < 0.2, 'authoritative targetward cruise: ' + JSON.stringify(cruise));
    }
    {
      await page.waitForFunction(() => G.auto?.phase === 'brake', {}, { timeout: 30000 });
      await page.screenshot({
        path: path.join(evidence, 'braking-' + landingScenario2.name.replaceAll(' ', '-') + '.png'),
      });
    }
    let landed = true;
    try {
      await page.waitForFunction(() => !!G.landed, {}, { timeout: 45000 });
    } catch {
      landed = false;
    }
    const trace = fileSystem
      .readFileSync(traceFile, 'utf8')
      .slice(traceStart)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((scenarioName) => JSON.parse(scenarioName));
    const requests = trace.filter(
      (scenarioResult) =>
        scenarioResult.name === landingScenario2.name && scenarioResult.kind === 'request',
    );
    const ticks = trace.filter(
      (scenarioResult2) =>
        scenarioResult2.name === landingScenario2.name && scenarioResult2.kind === 'tick',
    );
    const warnings = received.filter(
      (message) => message.t === 'toast' && /Too far|Slow down/.test(String(message.msg)),
    );
    let reversals = 0,
      lastDirection = 0,
      lastA;
    for (const flightSample of ticks.filter(
      (flightTelemetry) => flightTelemetry.distance < STELLARS[landingScenario2.port].r + 160,
    )) {
      if (lastA !== undefined) {
        const deltaAngle = Math.atan2(
            Math.sin(flightSample.a - lastA),
            Math.cos(flightSample.a - lastA),
          ),
          direction = Math.abs(deltaAngle) > 0.008 ? Math.sign(deltaAngle) : 0;
        if (direction && lastDirection && direction !== lastDirection) reversals++;
        if (direction) lastDirection = direction;
      }
      lastA = flightSample.a;
    }
    const brakeStart = ticks.findIndex((flightTelemetry) => flightTelemetry.inp?.rev);
    // Near/fast entries can safely stop outside the port and re-approach.
    // Bound rotation within each committed retrograde pass, not the intervening
    // approach turn (which is deliberately allowed by landingGuidance).
    let brakeHeadingTravel = 0,
      passTravel = 0;
    for (let index = 1; index < ticks.length; index++) {
      if (ticks[index].inp?.rev && ticks[index - 1].inp?.rev) {
        const deltaAngle2 = ticks[index].a - ticks[index - 1].a;
        passTravel += Math.abs(Math.atan2(Math.sin(deltaAngle2), Math.cos(deltaAngle2)));
        brakeHeadingTravel = Math.max(brakeHeadingTravel, passTravel);
      } else passTravel = 0;
    }
    const record = {
      name: landingScenario2.name,
      hull: landingScenario2.hull,
      port: landingScenario2.port,
      initial: landingScenario2,
      stats: shipStats(assets, makeLoadout(assets, landingScenario2.hull)),
      landed,
      seconds: (Date.now() - start) / 1000,
      requests,
      warnings,
      nearTurnReversals: reversals,
      brakeHeadingTravel,
      pageErrors: errors,
    };
    results.push(record);
    fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({
        name: landingScenario2.name,
        landed,
        seconds: record.seconds,
        requests,
        warnings,
        reversals,
        errors,
      }),
    );
    await page.screenshot({
      path: path.join(evidence, `fixed-${landingScenario2.name.replaceAll(' ', '-')}.png`),
    });
    {
      assert.ok(landed, `${landingScenario2.name} lands`);
      assert.equal(requests.length, 1, `${landingScenario2.name} one request`);
      assert.equal(
        requests[0].port,
        landingScenario2.port,
        `${landingScenario2.name} lands at intended nearest port`,
      );
      assert.ok(brakeStart >= 0, `${landingScenario2.name} uses real retrograde control`);
      assert.ok(
        brakeHeadingTravel < Math.PI + 0.3,
        `${landingScenario2.name} no repeated braking rotations`,
      );
      assert.equal(
        warnings.length,
        0,
        `${landingScenario2.name} no premature server landing warnings`,
      );
      assert.ok(requests[0].distance <= STELLARS[landingScenario2.port].r + 30);
      assert.ok(requests[0].speed <= Math.max(2, (record.stats!.accel / 30) * 0.55) + 2);
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
  fileSystem.writeFileSync(
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
  fileSystem.writeFileSync(
    path.join(evidence, 'permission-denial.json'),
    JSON.stringify({ landed: false, autopilotCancelled: true }),
  );
  await deniedPage.close();
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
process.exit(0);
