// Disposable browser integration check. PLAYWRIGHT_MODULE may point to an installed Playwright.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-passenger-browser-'),
);
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(directory, 'evidence');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const users = [
  { name: 'Seating Retrofit', hull: 709 },
  { name: 'Occupied Charter', hull: 709, occupied: 30, packs: 2 },
  { name: 'Liner Charter', hull: 714 },
];
for (const user of users) {
  const playerData = Game.prototype.fresh.call({ A: assets });
  playerData.ship = makeLoadout(assets, user.hull, 'Browser Charter');
  playerData.credits = 1000000;
  playerData.tut = 999;
  playerData.stellar = 'qstation';
  if (user.packs) playerData.ship.outfits[9020] = user.packs;
  if (user.occupied)
    playerData.missions = [
      {
        id: 'browser-manifest',
        type: 'passenger',
        pax: user.occupied,
        title: 'Existing group charter',
        sys: 'meridian',
        text: 'Existing group charter',
        dest: 'qstation-unused',
        reward: 1000,
      },
    ];
  database.create(user.name, 'browser-seats', playerData);
}
const port = Number(process.env.RIFT_BROWSER_PORT || 18773);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: path.join(directory, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  for (let index = 0; index < 100; index++) {
    if (server.exitCode !== null) throw new Error(`Disposable server exited ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
  )) as typeof import('playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors: string[] = [],
    results = [];
  for (const user of users) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    page.on('pageerror', (event) => errors.push(String(event)));
    if (process.env.RIFT_ASSET_FALLBACK)
      await page.route('**/assets/**', async (route) => {
        const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        const local = path.join(root, 'client', relative);
        // Only resolve actual LFS pointer placeholders: never shadow fresh binary imagery.
        if (
          !fileSystem.existsSync(local) ||
          !fileSystem
            .readFileSync(local)
            .subarray(0, 43)
            .toString()
            .startsWith('version https://git-lfs.github.com/spec/v1')
        )
          return route.continue();
        const fallback = path.join(process.env.RIFT_ASSET_FALLBACK!, relative);
        return fileSystem.existsSync(fallback)
          ? route.fulfill({ path: fallback })
          : route.continue();
      });
    await page.goto(origin);
    await page.fill('#lname', user.name);
    await page.fill('#lpass', 'browser-seats');
    await page.click('#lbtn');
    await page.waitForFunction(() => window.G?.you && G.landed);
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.locator('[data-lt="outfit"]').click();
    const record = page
      .locator('tr')
      .filter({ has: page.locator('button[data-act="outfit"][data-id="9020"][data-n="1"]') });
    await record.waitFor();
    await record.locator('img').evaluate((image) => (image as HTMLImageElement).decode());
    assert.equal(
      await record.locator('img').evaluate((image2) => (image2 as HTMLImageElement).naturalWidth),
      256,
    );
    assert.match(await record.innerText(), /Passenger seats \+5/);
    if (user.name === 'Seating Retrofit') {
      assert.equal(await page.evaluate(() => G.you!.shipStats!.passengerSeats), 24);
      await record.locator('[data-n="1"]').click();
      await page.waitForFunction(() => G.you!.shipStats!.passengerSeats === 29);
      assert.match(await page.locator('#landcargo').innerText(), /Passengers 0\/29 seats/);
      await page.screenshot({ path: path.join(evidence, 'outfitter-seating.png') });
      await page.locator('[data-lt="yard"]').click();
      const expected = await page.evaluate(async () => {
        const { loadoutValue } = await import('/shared/rules.js');
        return loadoutValue(G.A!, G.you!.ship);
      });
      const trade = page.locator('.kv').filter({ hasText: 'Trade-in of your' });
      assert.match(
        await trade.innerText(),
        new RegExp(expected.toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
      results.push(
        '256px seating icon, +5-seat purchase, occupancy display and server-matched trade-in preview',
      );
    } else if (user.occupied) {
      assert.equal(await page.evaluate(() => G.you!.shipStats!.passengerSeats), 34);
      const credits = await page.evaluate(() => G.you!.credits);
      await record.locator('[data-n="-1"]').click();
      await page
        .getByText('Deliver your passengers before removing their seats.', { exact: true })
        .waitFor();
      assert.equal(await page.evaluate(() => G.you!.ship.outfits[9020]), 2);
      assert.equal(await page.evaluate(() => G.you!.credits), credits);
      assert.match(await page.locator('#landcargo').innerText(), /Passengers 30\/34 seats/);
      await page.screenshot({ path: path.join(evidence, 'occupied-seats-guard.png') });
      results.push('occupied seat-pack removal refused without refund or capacity change');
    } else {
      await page.locator('[data-lt="jobs"]').click();
      const offer = await page.evaluate(() =>
        G.landed!.offers.find(
          (options) => options.type === 'passenger' && options.id.endsWith('-charter'),
        ),
      );
      assert.ok(offer!.pax! >= 20);
      await page.locator(`button[data-act="accept"][data-id="${offer!.id}"]`).click();
      await page.waitForFunction(
        (passengers: number | undefined) =>
          G.you!.missions.some(
            (message) => message.type === 'passenger' && message.pax === passengers,
          ),
        offer!.pax,
      );
      assert.match(
        await page.locator('#landcargo').innerText(),
        new RegExp(`Passengers ${offer!.pax}/96 seats`),
      );
      await page.screenshot({ path: path.join(evidence, 'liner-group-missions.png') });
      results.push(`visible ${offer!.pax}-passenger charter accepted in 96-seat liner`);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  const result = { results, pageErrors: errors, evidence };
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  serverLog.end();
}
