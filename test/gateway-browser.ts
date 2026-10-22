import { fileURLToPath as resolvePreloadFile } from 'node:url';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-gate-browser-'));
const evidence = path.resolve(process.argv[2] || evidenceDir('gateway'));
fileSystem.mkdirSync(evidence, { recursive: true });
const database = new Database(path.join(directory, 'data')),
  game = new Game(
    JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString()),
    database,
  );
for (const systemId of ['sol', 'coldharbor']) {
  const playerData = database.create('Gate ' + systemId, '', game.fresh());
  playerData.sys = systemId;
  playerData.stellar = systemId === 'sol' ? 'luna' : 'coldharbor';
  playerData.tut = 999;
  playerData.story = { done: ['start'], active: null, step: 0 };
}
database.touch();
database.flush();
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-gateway-browser.ts', import.meta.url),
);

const port = await availablePort(),
  origin = 'http://127.0.0.1:' + port;
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
    args: ['--no-sandbox'],
  });
  const results = [];
  for (const systemId2 of ['sol', 'coldharbor']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors: string[] = [],
      sent: { t: string; [entryKey: string]: unknown }[] = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('websocket', (webSocket) =>
      webSocket.on('framesent', (feature) => {
        try {
          sent.push(JSON.parse(String(feature.payload)));
        } catch {}
      }),
    );
    await page.goto(origin);
    await page.locator('[data-slot="Gate ' + systemId2 + '"]').click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.evaluate(() => {
      G.opts.mouseAim = false;
    });
    await page.waitForTimeout(800);
    // Production screen transform and real double-click listener, not direct autopilot state.
    const point = await page.evaluate(async () => {
      const { SYS: systemsById } = await import('/shared/galaxy.js');
      const { cam: camera } = await import('/render.js');
      const player = systemsById[G.sys!].stellars.find((gatewayBody) => gatewayBody.wormhole);
      const canvasElement = document.querySelector<HTMLCanvasElement>('canvas'),
        result = canvasElement!.getBoundingClientRect(),
        pixelRatio = devicePixelRatio || 1;
      return {
        x: result.left + ((player!.x - camera.cx) * camera.z + camera.W / 2) / pixelRatio,
        y: result.top + ((player!.y - camera.cy) * camera.z + camera.H / 2) / pixelRatio,
      };
    });
    await page.mouse.dblclick(point.x, point.y);
    await page.waitForFunction(() => G.auto?.mode === 'gateway');
    await page.waitForFunction((baseline) => G.sys !== baseline, systemId2, { timeout: 45000 });
    const dest = await page.evaluate(() => G.sys);
    await page.waitForTimeout(6500);
    assert.equal(await page.evaluate(() => G.sys), dest);
    assert.equal(sent.filter((message) => message.t === 'land').length, 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(evidence, systemId2 + '-transit.png') });
    results.push({ origin: systemId2, destination: dest, noBounce: true, landRequests: 0, errors });
    await page.close();
  }
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(results);
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
process.exit(0);
