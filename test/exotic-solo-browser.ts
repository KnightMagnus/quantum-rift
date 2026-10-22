// Real Solo login, landing UI, departure and complete production flight renderer.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
const { chromium } = (await import(
  process.env.PLAYWRIGHT_MODULE || ('playwright' as string)
)) as typeof import('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-exotic-solo-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || '/tmp/rift-exotic-solo';
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString(),
);
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const ports = [
  'aureole-ring',
  'twins-exchange',
  'reliquary-watch',
  'nightjar-refuge',
  'glasswake-foundry',
  'palinode-observatory',
  'meridian-yards',
  'luna',
];
const captain = (identifier: string) => 'Art ' + ports.indexOf(identifier);
for (const identifier of ports) {
  const player = STELLARS[identifier],
    playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
      import('../server/game.ts').Game['fresh']
    > & { story?: { done: string[]; active: null; step: number } };
  playerData.sys = player.system;
  playerData.stellar = identifier;
  playerData.tut = 999;
  playerData.explored = Object.keys(systemsById);
  database.create(captain(identifier), 'solo', playerData);
}
const port = Number(process.env.RIFT_BROWSER_PORT || 18798),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(directory, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (let index = 0; index < 100; index++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  const results = [];
  for (const identifier of ports) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors: string[] = [];
    page.on('pageerror', (event) => errors.push(event.message));
    await page.goto(origin);
    await page.locator(`[data-slot="${captain(identifier)}"]`).click();
    await page.waitForFunction(() => window.G?.you && G.landed);
    if (STELLARS[identifier].kind === 'station')
      await page.waitForFunction(() =>
        document.getElementById('landpic')!.style.backgroundImage.includes('data:image/png'),
      );
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    // CSS background failures do not raise pageerror: decode EVERY selected landing URL.
    const landingImages = await page.evaluate(async () => {
      const cssRule = document.getElementById('landpic')!.style.backgroundImage;
      const urls = [...cssRule.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(
        (message) => message[1],
      );
      return await Promise.all(
        urls.map(async (source) => {
          const image = new Image();
          image.src = source;
          try {
            await image.decode();
            return {
              src: source.startsWith('data:') ? 'generated-station-scene' : source,
              ok: true,
            };
          } catch {
            return { src: source, ok: false };
          }
        }),
      );
    });
    assert.ok(
      landingImages.length && landingImages.every((imageProbe) => imageProbe.ok),
      identifier + ' landed pictures decode',
    );
    await page.screenshot({ path: path.join(evidence, identifier + '-landed.png') });
    const state = await page.evaluate(() => ({
      solo: G.solo,
      sys: G.sys,
      stellar: G.landed!.stellar,
      name: document.getElementById('landname')!.textContent,
      landArt: document
        .getElementById('landpic')!
        .style.backgroundImage.startsWith('url("data:image/png'),
    }));
    assert.equal(state.solo, true);
    assert.equal(state.stellar, identifier);
    if (STELLARS[identifier].kind === 'station') assert.equal(state.landArt, true);
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(evidence, identifier + '-flight.png') });
    assert.deepEqual(errors, []);
    results.push({ ...state, landingImages, errors });
    await page.close();
  }
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, evidence }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
