// Disposable browser integration check. PLAYWRIGHT_MODULE may point to an installed Playwright.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets, makeLoadout } from '../shared/rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-passenger-browser-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(dir, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const users = [
  { name: 'Seating Retrofit', hull: 709 },
  { name: 'Occupied Charter', hull: 709, occupied: 30, packs: 2 },
  { name: 'Liner Charter', hull: 714 },
];
for (const user of users) {
  const d = Game.prototype.fresh.call({ A });
  d.ship = makeLoadout(A, user.hull, 'Browser Charter');
  d.credits = 1000000;
  d.tut = 999;
  d.stellar = 'qstation';
  if (user.packs) d.ship.outfits[9020] = user.packs;
  if (user.occupied)
    d.missions = [
      {
        id: 'browser-manifest',
        type: 'passenger',
        pax: user.occupied,
        title: 'Existing group charter',
        dest: 'qstation-unused',
        reward: 1000,
      },
    ];
  db.create(user.name, 'browser-seats', d);
}
const port = Number(process.env.RIFT_BROWSER_PORT || 18773);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Disposable server exited ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [],
    results = [];
  for (const user of users) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (process.env.RIFT_ASSET_FALLBACK)
      await page.route('**/assets/**', async (route) => {
        const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
        const local = path.join(root, 'client', relative);
        // Only resolve actual LFS pointer placeholders: never shadow fresh binary imagery.
        if (
          !fs.existsSync(local) ||
          !fs
            .readFileSync(local)
            .subarray(0, 43)
            .toString()
            .startsWith('version https://git-lfs.github.com/spec/v1')
        )
          return route.continue();
        const fallback = path.join(process.env.RIFT_ASSET_FALLBACK, relative);
        return fs.existsSync(fallback) ? route.fulfill({ path: fallback }) : route.continue();
      });
    await page.goto(origin);
    await page.fill('#lname', user.name);
    await page.fill('#lpass', 'browser-seats');
    await page.click('#lbtn');
    await page.waitForFunction(() => window.G?.you && G.landed);
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    await page.locator('[data-lt="outfit"]').click();
    const row = page
      .locator('tr')
      .filter({ has: page.locator('button[data-act="outfit"][data-id="9020"][data-n="1"]') });
    await row.waitFor();
    await row.locator('img').evaluate((img) => img.decode());
    assert.equal(await row.locator('img').evaluate((img) => img.naturalWidth), 256);
    assert.match(await row.innerText(), /Passenger seats \+5/);
    if (user.name === 'Seating Retrofit') {
      assert.equal(await page.evaluate(() => G.you.shipStats.passengerSeats), 24);
      await row.locator('[data-n="1"]').click();
      await page.waitForFunction(() => G.you.shipStats.passengerSeats === 29);
      assert.match(await page.locator('#landcargo').innerText(), /Passengers 0\/29 seats/);
      await page.screenshot({ path: path.join(evidence, 'outfitter-seating.png') });
      await page.locator('[data-lt="yard"]').click();
      const expected = await page.evaluate(async () => {
        const { loadoutValue } = await import('/shared/rules.js');
        return loadoutValue(G.A, G.you.ship);
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
      assert.equal(await page.evaluate(() => G.you.shipStats.passengerSeats), 34);
      const credits = await page.evaluate(() => G.you.credits);
      await row.locator('[data-n="-1"]').click();
      await page
        .getByText('Deliver your passengers before removing their seats.', { exact: true })
        .waitFor();
      assert.equal(await page.evaluate(() => G.you.ship.outfits[9020]), 2);
      assert.equal(await page.evaluate(() => G.you.credits), credits);
      assert.match(await page.locator('#landcargo').innerText(), /Passengers 30\/34 seats/);
      await page.screenshot({ path: path.join(evidence, 'occupied-seats-guard.png') });
      results.push('occupied seat-pack removal refused without refund or capacity change');
    } else {
      await page.locator('[data-lt="jobs"]').click();
      const offer = await page.evaluate(() =>
        G.landed.offers.find((o) => o.type === 'passenger' && /-charter$/.test(o.id)),
      );
      assert.ok(offer.pax >= 20);
      await page.locator(`button[data-act="accept"][data-id="${offer.id}"]`).click();
      await page.waitForFunction(
        (pax) => G.you.missions.some((m) => m.type === 'passenger' && m.pax === pax),
        offer.pax,
      );
      assert.match(
        await page.locator('#landcargo').innerText(),
        new RegExp(`Passengers ${offer.pax}/96 seats`),
      );
      await page.screenshot({ path: path.join(evidence, 'liner-group-missions.png') });
      results.push(`visible ${offer.pax}-passenger charter accepted in 96-seat liner`);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  const result = { results, pageErrors: errors, evidence };
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  log.end();
}
