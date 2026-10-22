// Optional Solo browser check against the actual standing panel and faction store.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROMIUM_EXECUTABLE=/path/to/chrome node test/faction-standing-browser.mjs /evidence
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = path.resolve(process.argv[2] || 'artifacts/faction-standing');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-standing-browser-'));
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const g = new Game(A, new DB(dir));
for (const rep of [199, 200, 250, 300]) {
  const d = g.db.create(`Standing ${rep}`, '', g.fresh());
  d.tut = 999;
  d.stellar = 'meridian-yards';
  d.sys = STELLARS[d.stellar].system;
  d.rep.quantum = rep;
  d.tokens = { quantum: 100 };
  d.credits = 1e6;
}
g.db.touch();
g.db.flush();
fs.mkdirSync(evidence, { recursive: true });
const port = Number(process.env.STANDING_TEST_PORT || 18991);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: dir, SEEDS_FILE: '/nonexistent' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
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
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  const results = [];
  for (const rep of [199, 200, 250, 300]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(origin);
    await page.locator(`[data-slot="Standing ${rep}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    const rank = rep >= 200 ? 'Exalted' : 'Honored';
    assert.ok((await page.locator('#landbody').innerText()).includes(`${rank} (${rep})`));
    await page.locator('#storesbtn').click();
    await page.locator('#storebox').waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    const epic = page.locator('#storein [data-id="epic"]');
    assert.equal(await epic.isDisabled(), rep < 200);
    const row = epic.locator('xpath=ancestor::tr');
    assert.ok((await row.innerText()).includes('200'));
    const text = await page.locator('#storein .sbody').innerText();
    assert.ok(text.includes(`${rep} · ${rank}`));
    await page.screenshot({ path: path.join(evidence, `standing-${rep}.png`) });
    if (rep >= 200) {
      const before = await page.evaluate(() => ({
        credits: G.you.credits,
        officers: G.you.officers.length,
      }));
      await epic.click();
      await page.waitForFunction((n) => G.you.officers.length === n + 1, before.officers);
      assert.equal(await page.evaluate(() => G.you.credits), before.credits - 250000);
      assert.equal(await page.evaluate(() => G.you.rep.quantum), rep);
    }
    assert.deepEqual(errors, []);
    results.push({ standing: rep, rank, epicEnabled: rep >= 200, errors });
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
