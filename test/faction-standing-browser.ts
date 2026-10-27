import { launchChromium } from './helpers/chromium.ts';
// Optional Solo browser check against the actual standing panel and faction store.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome node test/faction-standing-browser.ts /evidence
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';

const evidence = path.resolve(process.argv[2] || 'artifacts/faction-standing');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-standing-browser-'),
);
const assets = JSON.parse(
  fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url)).toString(),
);
const game = new Game(assets, new Database(directory));
for (const reputation of [199, 200, 250, 300]) {
  const playerData = game.db.create(`Standing ${reputation}`, '', game.fresh());
  playerData.tut = 999;
  playerData.stellar = 'meridian-yards';
  playerData.sys = STELLARS[playerData.stellar].system;
  playerData.rep.quantum = reputation;
  playerData.tokens = { quantum: 100 };
  playerData.credits = 1e6;
}
game.db.touch();
game.db.flush();
fileSystem.mkdirSync(evidence, { recursive: true });
const port = Number(process.env.STANDING_TEST_PORT || 18991);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: directory,
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
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
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox'],
  });
  const results = [];
  for (const reputation2 of [199, 200, 250, 300]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    await page.goto(origin);
    await page.locator(`[data-slot="Standing ${reputation2}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    const rank = reputation2 >= 200 ? 'Exalted' : 'Honored';
    assert.ok((await page.locator('#landbody').innerText()).includes(`${rank} (${reputation2})`));
    await page.locator('#storesbtn').click();
    await page.locator('#storebox').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    const epic = page.locator('#storein [data-id="epic"]');
    assert.equal(await epic.isDisabled(), reputation2 < 200);
    const record = epic.locator('xpath=ancestor::tr');
    assert.ok((await record.innerText()).includes('200'));
    const text = await page.locator('#storein .sbody').innerText();
    assert.ok(text.includes(`${reputation2} · ${rank}`));
    await page.screenshot({ path: path.join(evidence, `standing-${reputation2}.png`) });
    if (reputation2 >= 200) {
      const before = await page.evaluate(() => ({
        credits: G.you!.credits,
        officers: G.you!.officers.length,
      }));
      await epic.click();
      await page.waitForFunction(
        (quantity: number) => G.you!.officers.length === quantity + 1,
        before.officers,
      );
      assert.equal(await page.evaluate(() => G.you!.credits), before.credits - 250000);
      assert.equal(await page.evaluate(() => G.you!.rep.quantum), reputation2);
    }
    assert.deepEqual(errors, []);
    results.push({ standing: reputation2, rank, epicEnabled: reputation2 >= 200, errors });
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
