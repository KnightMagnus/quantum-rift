// Custom quantities exercise actual browser controls and authoritative market settlement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets, makeLoadout } from '../shared/rules.js';
import { addLots } from '../shared/cargo-lots.js';
import { tempDataDir } from './helpers/temp-data.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const dir = tempDataDir('rift-trade-amount-'),
  out = evidenceDir('trade-amount');
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
for (const [name, credits] of [
  ['Trade Pilot', 1000000],
  ['Poor Pilot', 1],
]) {
  const d = Game.prototype.fresh.call({ A });
  d.tut = 999;
  d.story = { done: ['start'], active: null };
  d.ship = makeLoadout(A, 704, 'Trade hauler');
  d.credits = credits;
  addLots(d.cargo, d.cargoLots, { cid: 'ore', qty: 6, grades: { common: 1, rich: 2, pure: 3 } });
  if (name === 'Trade Pilot')
    addLots(d.cargo, d.cargoLots, {
      cid: 'composite_plating',
      qty: 40,
      grades: { common: 40, rich: 0, pure: 0 },
    });
  db.create(name, 'fixture', d);
}
db.flush();
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', './test/seed-random.js', 'server/main.js'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(dir, 'data'),
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const events = [],
  errors = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  async function login(name, width = 1440) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('websocket', (socket) => {
      socket.on('framesent', ({ payload }) => {
        const m = JSON.parse(String(payload));
        if (m.t === 'trade') events.push({ name, dir: 'sent', m });
      });
      socket.on('framereceived', ({ payload }) => {
        const m = JSON.parse(String(payload));
        if (m.t === 'toast') events.push({ name, dir: 'received', m });
      });
    });
    await page.goto(origin);
    await page.locator(`[data-slot="${name}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    await page.locator('[data-lt="trade"]').click();
    return page;
  }
  const page = await login('Trade Pilot');
  const input = page.getByRole('spinbutton', { name: 'Raw Ore trade amount in tons', exact: true });
  const buy = page.locator('[data-act="trade"][data-c="ore"][data-custom="buy"]');
  const sell = page.locator('[data-act="trade"][data-c="ore"][data-custom="sell"]');
  await input.waitFor();
  const style = await input.evaluate((e) => ({
    bg: getComputedStyle(e).backgroundColor,
    fg: getComputedStyle(e).color,
    scheme: getComputedStyle(e).colorScheme,
  }));
  assert.deepEqual(style, { bg: 'rgb(0, 0, 0)', fg: 'rgb(255, 255, 255)', scheme: 'dark' });
  // Invalid amounts never reach the wire or mutate cargo/wallet.
  const before = await page.evaluate(() => ({ cargo: G.you.cargo.ore, credits: G.you.credits }));
  for (const value of ['', '0', '-3', '2.5', '2147483648']) {
    await input.fill(value);
    await buy.click();
    assert.equal(await input.evaluate((e) => e.checkValidity()), false, value);
  }
  assert.equal(events.filter((e) => e.dir === 'sent').length, 0);
  assert.deepEqual(
    await page.evaluate(() => ({ cargo: G.you.cargo.ore, credits: G.you.credits })),
    before,
  );
  // Actual server transactions, including common-first graded cargo accounting.
  await input.fill('7');
  await buy.click();
  await page.waitForFunction((n) => G.you.cargo.ore === n, before.cargo + 7);
  assert.ok(await page.evaluate((n) => G.you.credits < n, before.credits));
  await input.fill('3');
  await sell.click();
  await page.waitForFunction((n) => G.you.cargo.ore === n, before.cargo + 4);
  assert.equal(await input.inputValue(), '3', 'Settlement re-render retains entered quantity');
  // The market can refresh while typing without losing the draft/focus.
  await input.fill('12');
  await input.focus();
  await page.evaluate(async () => (await import('/ui.js')).renderLanded());
  assert.equal(await input.inputValue(), '12');
  assert.equal(await input.evaluate((e) => e === document.activeElement), true);
  await page.screenshot({ path: path.join(out, 'desktop-trade.png') });
  const free = await page.evaluate(
    () => G.you.shipStats.cargo - G.you.cargoUsed - (G.you.jobCargo || 0),
  );
  assert.ok(free > 0);
  await input.fill('2147483647');
  await buy.click();
  await page.waitForFunction(() => G.you.cargoUsed === G.you.shipStats.cargo);
  assert.equal(
    events.filter((e) => e.dir === 'sent').at(-1).m.qty,
    free,
    'No int32 wrap; request capped to hold',
  );
  const sent = events.filter((e) => e.dir === 'sent').length;
  await buy.click();
  assert.equal(
    events.filter((e) => e.dir === 'sent').length,
    sent,
    'Full hold suppresses zero request',
  );
  await sell.click();
  await page.waitForFunction(() => !G.you.cargo.ore);
  assert.ok(events.filter((e) => e.dir === 'sent').at(-1).m.qty < 0);
  const emptySent = events.filter((e) => e.dir === 'sent').length;
  await sell.click();
  assert.equal(
    events.filter((e) => e.dir === 'sent').length,
    emptySent,
    'Empty inventory suppresses zero request',
  );
  // Finite buyer demand caps exact input sales and rejects further attempts.
  const plating = page.getByRole('spinbutton', {
    name: 'Composite Plating trade amount in tons',
    exact: true,
  });
  const plateSell = page.locator('[data-custom="sell"][data-c="composite_plating"]');
  const cap = await page.evaluate(
    () => G.landed.market.find((c) => c.id === 'composite_plating').sellCap,
  );
  assert.ok(cap > 0 && cap < 40);
  await plating.fill('40');
  await plateSell.click();
  await page.waitForFunction((n) => G.you.cargo.composite_plating === n, 40 - cap);
  await page.waitForFunction(
    () => G.landed.market.find((c) => c.id === 'composite_plating').sellCap === 0,
  );
  assert.equal(events.filter((e) => e.dir === 'sent').at(-1).m.qty, -cap);
  const finiteSent = events.filter((e) => e.dir === 'sent').length;
  await plateSell.click();
  assert.equal(
    events.filter((e) => e.dir === 'sent').length,
    finiteSent,
    'Exhausted buyer demand suppresses zero request',
  );
  // Existing quick amounts remain intact.
  await page.locator('[data-act="trade"][data-c="ore"][data-q="10"]').click();
  await page.waitForFunction(() => G.you.cargo.ore === 10);
  await page.locator('[data-act="trade"][data-c="ore"][data-q="-999"]').click();
  await page.waitForFunction(() => !G.you.cargo.ore);
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill('4');
  await buy.click();
  await page.waitForFunction(() => G.you.cargo.ore === 4);
  await page.screenshot({ path: path.join(out, 'mobile-trade.png'), fullPage: true });
  // Insufficient funds are authoritatively denied without pretending listed unit prices
  // include every bulk discount or specialist bonus.
  const poor = await login('Poor Pilot');
  await poor
    .getByRole('spinbutton', { name: 'Raw Ore trade amount in tons', exact: true })
    .fill('10');
  await poor.locator('[data-custom="buy"][data-c="ore"]').click();
  const end = Date.now() + 3000;
  while (
    Date.now() < end &&
    !events.some((e) => e.name === 'Poor Pilot' && e.m.msg?.includes('No room or no money'))
  )
    await new Promise((r) => setTimeout(r, 20));
  assert.ok(
    events.some((e) => e.name === 'Poor Pilot' && e.m.msg?.includes('No room or no money')),
  );
  assert.deepEqual(await poor.evaluate(() => ({ qty: G.you.cargo.ore, credits: G.you.credits })), {
    qty: 6,
    credits: 1,
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify({ events, errors, style }, null, 2),
  );
  console.log(
    'Trade custom amounts: integer validation, wire quantities, actual buy/sell, graded cargo, capacity/funds limits, draft/focus retention, presets, desktop/mobile PASS',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
