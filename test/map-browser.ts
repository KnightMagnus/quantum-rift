// Actual Solo UI: system-detail hover must not resize the galaxy map.
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
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-map-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(directory, 'evidence');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const fresh = Game.prototype.fresh.call({ A: assets });
fresh.tut = 999;
database.create('Map Layout', 'map-browser', fresh);
const port = Number(process.env.RIFT_BROWSER_PORT || 18894);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(directory, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
const results = [],
  errors: string[] = [];
try {
  for (let index = 0; index < 100; index++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
  )) as typeof import('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.goto(origin);
  await page.locator('[data-slot="Map Layout"]').click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  const measure = () =>
    page.evaluate(() => {
      const rect = (identifier: string) => {
        const entity = document.querySelector(identifier),
          result = entity!.getBoundingClientRect();
        return {
          x: result.x,
          y: result.y,
          width: result.width,
          height: result.height,
          clientHeight: entity!.clientHeight,
          scrollHeight: entity!.scrollHeight,
        };
      };
      return {
        box: rect('#gmap .gbox'),
        canvas: rect('#gcanvas'),
        details: rect('#ginfo'),
        hover: G.hoverSys,
        text: document.getElementById('ginfo')!.textContent,
        canvasSize: [gcanvas.width, gcanvas.height],
      };
    });
  for (const config of [
    { width: 1920, height: 1080, hud: 360, scale: 1 },
    { width: 1600, height: 1050, hud: 600, scale: 1 },
    { width: 1280, height: 800, hud: 280, scale: 1 },
    { width: 1024, height: 768, hud: 400, scale: 1 },
    { width: 1024, height: 768, hud: 600, scale: 1 },
    { width: 1280, height: 800, hud: 360, scale: 1.25 },
  ]) {
    await page.setViewportSize({ width: config.width, height: config.height });
    await page.evaluate(async (config: { hud: number; scale: number }) => {
      const { closeMap } = await import('/ui.js');
      closeMap();
      document.documentElement.style.setProperty('--hud', config.hud + 'px');
      document.documentElement.style.setProperty('--ui', String(config.scale));
      document.body.classList.toggle('scaled', config.scale !== 1);
    }, config);
    for (const mode of ['factions', 'trade', 'services']) {
      const systems = await page.evaluate(async (mode: string | undefined) => {
        const { SYS: systemsById } = await import('/shared/galaxy.js');
        G.you!.explored = Object.keys(systemsById);
        G.mapMode = mode;
        G.hoverSys = null;
        return Object.values(systemsById)
          .filter((session) => !session.arena)
          .sort(
            (firstCaptain, secondCaptain) =>
              secondCaptain.stellars.map((player) => player.name).join('').length -
              firstCaptain.stellars.map((player) => player.name).join('').length,
          )
          .slice(0, 2)
          .map((session) => session.id)
          .concat(
            Object.values(systemsById).find(
              (session) => !session.arena && !session.stellars.length,
            )!.id,
          );
      }, mode);
      for (const identifier of systems) {
        await page.mouse.move(0, 0);
        await page.evaluate(async (destinationSystemId: string | number | undefined) => {
          const { openMap } = await import('/ui.js');
          G.hoverSys = null;
          openMap(destinationSystemId);
        }, identifier);
        await page.waitForTimeout(500); // opening animation must finish before bounding measurements
        const before = await measure();
        const canvasBounds = await page.locator('#gcanvas').boundingBox();
        await page.mouse.move(
          canvasBounds!.x + canvasBounds!.width / 2,
          canvasBounds!.y + canvasBounds!.height / 2,
        );
        await page.waitForFunction(
          (expectedSystemId: string | null | undefined) => G.hoverSys === expectedSystemId,
          identifier,
        );
        const during = await measure();
        await page.screenshot({
          path: path.join(
            evidence,
            `map-${config.width}-${config.hud}-${config.scale}-${mode}-${identifier}.png`,
          ),
        });
        // Find empty map space, not a corner that may contain another star.
        const empty = await page.evaluate(async () => {
          const { mapHit } = await import('/render.js');
          const canvasContext = document.getElementById('gcanvas'),
            result = canvasContext!.getBoundingClientRect();
          for (
            let verticalPosition = 12;
            verticalPosition < (canvasContext! as HTMLCanvasElement).height - 12;
            verticalPosition += 24
          )
            for (
              let horizontalPosition = 12;
              horizontalPosition < (canvasContext! as HTMLCanvasElement).width - 12;
              horizontalPosition += 24
            )
              if (!mapHit(G, horizontalPosition, verticalPosition))
                return {
                  x:
                    result.x +
                    (horizontalPosition * result.width) /
                      (canvasContext! as HTMLCanvasElement).width,
                  y:
                    result.y +
                    (verticalPosition * result.height) /
                      (canvasContext! as HTMLCanvasElement).height,
                };
          throw new Error('No empty map space');
        });
        await page.mouse.move(empty.x, empty.y);
        await page.waitForFunction(() => G.hoverSys === null);
        const after = await measure();
        const deltas: Record<string, number> = {};
        for (const field of ['box', 'canvas', 'details'] as const)
          deltas[field] = Math.max(
            ...[during, after].flatMap((message) =>
              (['y', 'height'] as const).map((entryKey) =>
                Math.abs(message[field][entryKey] - before[field][entryKey]),
              ),
            ),
          );
        results.push({ config, mode, id: identifier, before, during, after, deltas });
      }
    }
  }
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ results, errors, navigation: false }, null, 2),
  );
  const scrollable = results.filter(
    (result) => result.during.details.scrollHeight > result.during.details.clientHeight,
  );
  if (process.env.RIFT_MAP_BASELINE !== '1')
    assert.ok(scrollable.length, 'long system details exercise the bounded scrolling area');
  if (process.env.RIFT_MAP_BASELINE !== '1') {
    assert.equal((await page.locator('#ginfo').getAttribute('tabindex'))!, '0');
    assert.equal((await page.locator('#ginfo').getAttribute('aria-label'))!, 'System details');
    const longest = scrollable.sort(
      (firstMapSample, secondMapSample) =>
        secondMapSample.during.details.scrollHeight - firstMapSample.during.details.scrollHeight,
    )[0];
    await page.setViewportSize({ width: longest.config.width, height: longest.config.height });
    await page.evaluate(async ({ config, id: identifier, mode }) => {
      const { closeMap, openMap } = await import('/ui.js');
      closeMap();
      document.documentElement.style.setProperty('--hud', config.hud + 'px');
      document.documentElement.style.setProperty('--ui', String(config.scale));
      document.body.classList.toggle('scaled', config.scale !== 1);
      G.mapMode = mode;
      G.hoverSys = null;
      openMap(identifier);
    }, longest);
    await page.waitForTimeout(500);
    const rect = await page.locator('#gcanvas').boundingBox();
    await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    await page.locator('#ginfo').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.getElementById('ginfo')!.scrollTop > 0);
  }
  // Navigation still works after hover: click the centered star and use search.
  await page.evaluate(async () => {
    const { openMap } = await import('/ui.js');
    openMap('sol');
  });
  const canvasBounds2 = await page.locator('#gcanvas').boundingBox();
  await page.mouse.click(
    canvasBounds2!.x + canvasBounds2!.width / 2,
    canvasBounds2!.y + canvasBounds2!.height / 2,
  );
  assert.ok(await page.evaluate(() => G.route.at(-1) === 'sol' || G.sys === 'sol'));
  await page.fill('#gsearch', 'Sol');
  await page.locator('#gresults [data-sys="sol"]').first().click();
  assert.ok(await page.evaluate(() => G.route.at(-1) === 'sol' || G.sys === 'sol'));
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ results, errors, navigation: true }, null, 2),
  );
  const unstable = results.filter((result) =>
    Object.values(result.deltas).some((sampleIndex) => sampleIndex > 0.05),
  );
  console.log(
    JSON.stringify(
      {
        cases: results.length,
        unstable: unstable.map((result) => ({
          config: result.config,
          mode: result.mode,
          id: result.id,
          deltas: result.deltas,
        })),
        errors,
        navigation: true,
        evidence,
      },
      null,
      2,
    ),
  );
  if (process.env.RIFT_MAP_BASELINE !== '1')
    assert.equal(unstable.length, 0, 'hover changes map/detail bounding boxes');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve3) => server.once('exit', resolve3));
  serverLog.end();
}
