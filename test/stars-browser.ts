// Actual SOLO login/depart/render integration with disposable Sol/Earth and Meridian saves.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-stars-browser-'),
);
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(directory, 'evidence');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const pilot = Game.prototype.fresh.call({ A: assets });
const system = process.env.RIFT_STAR_SYSTEM || 'sol';
assert.ok(['sol', 'meridian'].includes(system), 'supported isolated scene fixture');
pilot.sys = system;
pilot.stellar = system === 'sol' ? 'earth' : 'meridian-yards';
pilot.tut = 999;
pilot.explored.push('sol');
database.create('Solar Observer', 'solo', pilot);
const port = Number(process.env.RIFT_BROWSER_PORT || 18837),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(directory, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  for (let index = 0; index < 100; index++) {
    if (server.exitCode !== null) throw new Error(`Isolated server exited ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
  )) as typeof import('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.addInitScript(() => {
    window.__stellarDraws = [];
    const original = Reflect.get(
      CanvasRenderingContext2D.prototype,
      'drawImage',
    ) as typeof CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      image: CanvasImageSource,
      ...args: number[]
    ) {
      if (
        image instanceof HTMLCanvasElement &&
        image.width === 256 &&
        image.height === 256 &&
        new Error().stack!.includes('drawStar')
      ) {
        if (window.__stellarDraws.length < 10)
          window.__stellarDraws.push({
            size: args.slice(-2),
            canvas: this.canvas.id,
            center: Array.from(image.getContext('2d')!.getImageData(128, 128, 1, 1).data),
          });
      }
      return Reflect.apply(original, this, [image, ...args]);
    };
  });
  if (process.env.RIFT_ASSET_FALLBACK)
    await page.route('**/assets/**', async (route) => {
      const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1),
        local = path.join(root, 'client', relative);
      if (
        fileSystem.existsSync(local) &&
        !fileSystem
          .readFileSync(local)
          .subarray(0, 43)
          .toString()
          .startsWith('version https://git-lfs.github.com/spec/v1')
      )
        return route.continue();
      const fallback = path.join(process.env.RIFT_ASSET_FALLBACK!, relative);
      return fileSystem.existsSync(fallback) ? route.fulfill({ path: fallback }) : route.continue();
    });
  await page.goto(origin);
  await page.locator('[data-slot="Solar Observer"]').click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(
    (wanted: string | null) => G.view && !G.landed && G.sys === wanted,
    system,
  );
  await page.waitForFunction(() => window.__stellarDraws.length > 0);
  await page.waitForTimeout(1800);
  const result = await page.evaluate(() => ({
    sys: G.sys,
    landed: !!G.landed,
    draws: window.__stellarDraws,
  }));
  assert.equal(result.sys, system);
  assert.equal(result.landed, false);
  assert.ok(
    result.draws.every((starSample: { center: number[] }) =>
      system === 'sol'
        ? starSample.center[0] > starSample.center[2]
        : starSample.center[2] > starSample.center[0],
    ),
    'actual stellar palette matches selected system',
  );
  assert.deepEqual(errors, [], 'no game page errors');
  await page.screenshot({ path: path.join(evidence, `${system}-game.png`) });
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      system: result.sys,
      actualStellarCanvasDraws: result.draws.length,
      errors,
      evidence,
    }),
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = new Promise((resolve3) => server.once('exit', resolve3));
    server.kill();
    await stopped;
  }
  serverLog.end();
}
