import { launchChromium } from './helpers/chromium.ts';
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
import { SYS } from '../shared/galaxy.ts';
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-gate-browser-'));
const evidence = path.resolve(process.argv[2] || evidenceDir('gateway'));
fileSystem.mkdirSync(evidence, { recursive: true });
// Seed synchronously, then leave the spawned server as the only save/clock owner.
// A second Game keeps ticking and dirties this same database after the handoff.
const nativeInterval = globalThis.setInterval,
  nativeTimeout = globalThis.setTimeout;
let database: Database;
let game: Game;
try {
  globalThis.setInterval = Object.assign(() => {
    const timer = nativeInterval(() => {}, 2147483647);
    clearInterval(timer);
    return timer;
  }, nativeInterval);
  globalThis.setTimeout = Object.assign(() => {
    const timer = nativeTimeout(() => {}, 2147483647);
    clearTimeout(timer);
    return timer;
  }, nativeTimeout);
  database = new Database(path.join(directory, 'data'));
  game = new Game(
    JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString()),
    database,
  );
} finally {
  globalThis.setInterval = nativeInterval;
  globalThis.setTimeout = nativeTimeout;
}
for (const systemId of ['qgate', 'coldharbor', 'aureole', 'glasswake']) {
  const playerData = database.create('Gate ' + systemId, '', game.fresh());
  playerData.sys = systemId;
  playerData.stellar =
    systemId === 'qgate'
      ? 'qstation'
      : systemId === 'glasswake'
        ? 'glasswake-foundry'
        : systemId === 'aureole'
          ? SYS.aureole.stellars.find((stellar) => stellar.svc?.includes('L'))!.id
          : 'coldharbor';
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

let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox'],
  });
  const results = [];
  for (const systemId2 of ['qgate', 'coldharbor']) {
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
    await page.screenshot({ path: path.join(evidence, systemId2 + '-gateway.png') });
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
  const indexPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const indexErrors: string[] = [];
  indexPage.on('pageerror', (error) => indexErrors.push(String(error)));
  await indexPage.goto(origin);
  await indexPage.locator('[data-slot="Gate glasswake"]').click();
  await indexPage.waitForFunction(() => G.you && G.landed);
  await indexPage.click('#depart');
  await indexPage.waitForFunction(
    () => G.view && !G.landed && G.miningRocks?.rocks.some((rock) => rock.indexClaim),
  );
  await indexPage.waitForFunction(() => [...G.ents.values()].some((entity) => entity.hull === 910));
  const art = await indexPage.evaluate(async () => {
    const images = await Promise.all(
      [909, 910, 911, 914, 915].map(async (id) => {
        const image = new Image();
        image.src = `/assets/ships/${id}.webp`;
        await image.decode();
        return { id, width: image.naturalWidth, height: image.naturalHeight };
      }),
    );
    G.opts.mouseAim = false;
    return images;
  });
  assert.ok(
    art.every((image) => image.width > 0 && image.height > 0),
    'approved live sprite sheets decode',
  );
  await indexPage.keyboard.press('x');
  await indexPage.keyboard.press('x');
  await indexPage.waitForTimeout(6500);
  await indexPage.screenshot({ path: path.join(evidence, 'index-worksite.png') });
  await indexPage.evaluate(() => {
    const quarry = [...G.ents.values()].find((entity) => entity.hull === 910)!;
    G.target = quarry.id;
  });
  await indexPage.keyboard.press('t');
  await indexPage.waitForSelector('#hailbox:not(.hidden)');
  assert.match(
    await indexPage.locator('#hailtext').innerText(),
    /Transit and unmarked resources are unrestricted/,
  );
  assert.match(
    await indexPage.locator('#hailopts').innerText(),
    /Take nearby claimed salvage.*Index will attack/,
  );
  assert.match(
    (await indexPage.locator('#hailportrait').getAttribute('src')) || '',
    /910_yard\.png/,
  );
  assert.equal(
    await indexPage
      .locator('#hailportrait')
      .evaluate(
        (element) =>
          (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
      ),
    true,
  );
  assert.deepEqual(indexErrors, []);
  await indexPage.screenshot({ path: path.join(evidence, 'index-worksite-hail.png') });
  await indexPage.close();
  results.push({ index: true, art, errors: indexErrors });
  const hulkPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await hulkPage.route('**/render.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + '\nexport { decorFor };' });
  });
  await hulkPage.goto(origin);
  await hulkPage.locator('[data-slot="Gate aureole"]').click();
  await hulkPage.waitForFunction(() => G.you && G.landed);
  await hulkPage.click('#depart');
  await hulkPage.waitForFunction(() => G.view && !G.landed);
  const hulk = await hulkPage.evaluate(async () => {
    const { SYS } = await import('/shared/galaxy.js');
    const { decorFor } = (await import('/render.js')) as typeof import('./helpers/render-probe.ts');
    return decorFor(SYS.aureole).derelict;
  });
  assert.equal(hulk.length, 1, 'one permanent hulk, not a new random wreck each visit');
  assert.equal(hulk[0].spin, 0, 'the dormant hulk never moves');
  assert.equal(hulk[0].size, 1800);
  for (let index = 0; index < 6; index++) await hulkPage.keyboard.press('x');
  await hulkPage.waitForFunction(() => G.zoom < 0.45);
  await hulkPage.waitForTimeout(250);
  await hulkPage.screenshot({ path: path.join(evidence, 'aureole-hulk.png') });
  await hulkPage.close();
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(results);
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
process.exit(0);
