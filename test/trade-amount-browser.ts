// Custom quantities exercise actual browser controls and authoritative market settlement.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { type Browser, chromium } from 'playwright';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';
import { addLots } from '../shared/cargo-lots.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const directory = tempDataDir('rift-trade-amount-'),
  output = evidenceDir('trade-amount');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
for (const [name, credits] of [
  ['Trade Pilot', 1000000],
  ['Poor Pilot', 1],
] as const) {
  const playerData = Game.prototype.fresh.call({ A: assets });
  playerData.tut = 999;
  Object.assign(playerData, { story: { done: ['start'], active: null } });
  playerData.ship = makeLoadout(assets, 704, 'Trade hauler');
  playerData.credits = credits;
  addLots(playerData.cargo, playerData.cargoLots, {
    cid: 'ore',
    qty: 6,
    grades: { common: 1, rich: 2, pure: 3 },
  });
  if (name === 'Trade Pilot')
    addLots(playerData.cargo, playerData.cargoLots, {
      cid: 'composite_plating',
      qty: 40,
      grades: { common: 40, rich: 0, pure: 0 },
    });
  database.create(name, 'fixture', playerData);
}
database.flush();
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
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
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser: Browser | undefined;
const events: {
    name: string;
    dir: string;
    m: { t: string; cid?: string; qty?: number; n?: number; msg?: string; op?: string };
  }[] = [],
  errors: string[] = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  async function login(name: string, width = 1440) {
    const page = await browser!.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('websocket', (socket) => {
      socket.on('framesent', ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.t === 'trade') events.push({ name, dir: 'sent', m: message });
      });
      socket.on('framereceived', ({ payload }) => {
        const message = JSON.parse(String(payload));
        if (message.t === 'toast') events.push({ name, dir: 'received', m: message });
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
  const purchaseButton = page.locator('[data-act="trade"][data-c="ore"][data-custom="buy"]');
  const sell = page.locator('[data-act="trade"][data-c="ore"][data-custom="sell"]');
  await input.waitFor();
  const style = await input.evaluate((entity: Element) => ({
    bg: getComputedStyle(entity).backgroundColor,
    fg: getComputedStyle(entity).color,
    scheme: getComputedStyle(entity).colorScheme,
  }));
  assert.deepEqual(style, { bg: 'rgb(0, 0, 0)', fg: 'rgb(255, 255, 255)', scheme: 'dark' });
  // Invalid amounts never reach the wire or mutate cargo/wallet.
  const before = await page.evaluate(() => ({ cargo: G.you!.cargo.ore, credits: G.you!.credits }));
  for (const value of ['', '0', '-3', '2.5', '2147483648']) {
    await input.fill(value);
    await purchaseButton.click();
    assert.equal(
      await input.evaluate((entity: HTMLInputElement) => entity.checkValidity()),
      false,
      value,
    );
  }
  assert.equal(events.filter((entity) => entity.dir === 'sent').length, 0);
  assert.deepEqual(
    await page.evaluate(() => ({ cargo: G.you!.cargo.ore, credits: G.you!.credits })),
    before,
  );
  // Actual server transactions, including common-first graded cargo accounting.
  await input.fill('7');
  await page
    .locator('[data-trade-estimate="ore"]')
    .getByText('Buy 7 t:', { exact: false })
    .waitFor();
  await purchaseButton.click();
  await page.waitForFunction((quantity: number) => G.you!.cargo.ore === quantity, before.cargo + 7);
  assert.ok(await page.evaluate((quantity: number) => G.you!.credits < quantity, before.credits));
  await page.locator('.trip-receipt').waitFor();
  assert.match(await page.locator('.trip-receipt summary').innerText(), /goods and refining only/);
  await input.fill('3');
  await sell.click();
  await page.waitForFunction((quantity: number) => G.you!.cargo.ore === quantity, before.cargo + 4);
  assert.equal(await input.inputValue(), '3', 'Settlement re-render retains entered quantity');
  // The market can refresh while typing without losing the draft/focus.
  await input.fill('12');
  await input.focus();
  await page.evaluate(async () => (await import('/ui.js')).renderLanded());
  assert.equal(await input.inputValue(), '12');
  assert.equal(
    await input.evaluate((entity: Element | null) => entity === document.activeElement),
    true,
  );
  await page.locator('[data-trade-estimate="ore"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'desktop-trade.png') });
  const free = await page.evaluate(
    () => G.you!.shipStats!.cargo - G.you!.cargoUsed - (G.you!.jobCargo || 0),
  );
  assert.ok(free > 0);
  await input.fill('2147483647');
  await purchaseButton.click();
  await page.waitForFunction(() => G.you!.cargoUsed === G.you!.shipStats!.cargo);
  assert.equal(
    events.filter((entity) => entity.dir === 'sent').at(-1)!.m.qty,
    free,
    'No int32 wrap; request capped to hold',
  );
  const sent = events.filter((entity) => entity.dir === 'sent').length;
  await purchaseButton.click();
  assert.equal(
    events.filter((entity) => entity.dir === 'sent').length,
    sent,
    'Full hold suppresses zero request',
  );
  await sell.click();
  await page.waitForFunction(() => !G.you!.cargo.ore);
  assert.ok(events.filter((entity) => entity.dir === 'sent').at(-1)!.m.qty! < 0);
  const emptySent = events.filter((entity) => entity.dir === 'sent').length;
  await sell.click();
  assert.equal(
    events.filter((tradeEvent) => tradeEvent.dir === 'sent').length,
    emptySent,
    'Empty inventory suppresses zero request',
  );
  // Finite buyer demand caps exact input sales and rejects further attempts.
  const plating = page.getByRole('spinbutton', {
    name: 'Composite Plating trade amount in tons',
    exact: true,
  });
  const plateSell = page.locator('[data-custom="sell"][data-c="composite_plating"]');
  const capacity = await page.evaluate(
    () => G.landed!.market!.find((marketItem) => marketItem.id === 'composite_plating')!.sellCap,
  );
  assert.ok(capacity! > 0 && capacity! < 40);
  await plating.fill('40');
  await plateSell.click();
  await page.waitForFunction(
    (quantity: number) => G.you!.cargo.composite_plating === quantity,
    40 - capacity!,
  );
  await page.waitForFunction(
    () =>
      G.landed!.market!.find((marketItem2) => marketItem2.id === 'composite_plating')!.sellCap ===
      0,
  );
  assert.equal(events.filter((tradeEvent) => tradeEvent.dir === 'sent').at(-1)!.m.qty, -capacity!);
  const finiteSent = events.filter((tradeEvent) => tradeEvent.dir === 'sent').length;
  await plateSell.click();
  assert.equal(
    events.filter((tradeEvent) => tradeEvent.dir === 'sent').length,
    finiteSent,
    'Exhausted buyer demand suppresses zero request',
  );
  // Existing quick amounts remain intact.
  await page.locator('[data-act="trade"][data-c="ore"][data-q="10"]').click();
  await page.waitForFunction(() => G.you!.cargo.ore === 10);
  await page.locator('[data-act="trade"][data-c="ore"][data-q="-999"]').click();
  await page.waitForFunction(() => !G.you!.cargo.ore);
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill('4');
  await purchaseButton.click();
  await page.waitForFunction(() => G.you!.cargo.ore === 4);
  await page.screenshot({ path: path.join(output, 'mobile-trade.png'), fullPage: true });
  // Insufficient funds are authoritatively denied without pretending listed unit prices
  // include every bulk discount or specialist bonus.
  const poor = await login('Poor Pilot');
  await poor
    .getByRole('spinbutton', { name: 'Raw Ore trade amount in tons', exact: true })
    .fill('10');
  await poor.locator('[data-custom="buy"][data-c="ore"]').click();
  const deadline = Date.now() + 3000;
  while (
    Date.now() < deadline &&
    !events.some(
      (denialEvent) =>
        denialEvent.name === 'Poor Pilot' && denialEvent.m.msg?.includes('No room or no money'),
    )
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    events.some(
      (denialEvent) =>
        denialEvent.name === 'Poor Pilot' && denialEvent.m.msg?.includes('No room or no money'),
    ),
  );
  assert.deepEqual(
    await poor.evaluate(() => ({ qty: G.you!.cargo.ore, credits: G.you!.credits })),
    {
      qty: 6,
      credits: 1,
    },
  );
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ events, errors, style }, null, 2),
  );
  console.log(
    'Trade custom amounts: integer validation, wire quantities, actual buy/sell, graded cargo, capacity/funds limits, draft/focus retention, presets, desktop/mobile PASS',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
