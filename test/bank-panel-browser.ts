import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Browser } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { augmentAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { launchChromium } from './helpers/chromium.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const directory = tempDataDir('rift-bank-panel-');
const output = evidenceDir('bank-panel');
const assets = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new DB(path.join(directory, 'data'));
const unavailable = Object.values(STELLARS).find((body) => !body.site && body.outlaw)!;
for (const name of ['Bank Pilot', 'Second Bank Pilot', 'Remote Pilot']) {
  const player = Game.prototype.fresh.call({ A: assets });
  player.tut = 999;
  Object.assign(player, { story: { done: ['start'], active: null } });
  player.credits = 100000;
  if (name === 'Remote Pilot') {
    player.sys = unavailable.system;
    player.stellar = unavailable.id;
  }
  database.create(name, 'fixture', player);
}
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
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
const log = fs.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser: Browser | undefined;
const errors: string[] = [];
const toasts: string[] = [];
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.__testSocket = this;
      }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.t === 'toast') toasts.push(message.msg);
    }),
  );
  await page.goto(origin);
  await page.locator('[data-slot="Bank Pilot"]').click();
  await page.waitForFunction(() => !!G.you && !!G.landed?.bank);
  assert.equal(await page.locator('[data-lt="bank"]').count(), 0);
  const opener = page.locator('#bankbtn');
  await opener.click();
  assert.equal(
    await page.locator('#bankclose').evaluate((element) => document.activeElement === element),
    true,
  );
  assert.equal(
    await page.evaluate(async () =>
      (await import('/overlay-controller.js')).overlays.blocksFlight(),
    ),
    true,
  );
  await page.keyboard.press('KeyM');
  assert.equal(await page.locator('#gmap').isVisible(), false, 'Bank owns global shortcuts');
  await page.locator('#depart').evaluate((element: HTMLButtonElement) => element.click());
  assert.equal(await page.evaluate(() => !!G.landed), true, 'Modal blocks underlying departure');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.locator('#bankclose').evaluate((element) => document.activeElement === element),
    true,
  );
  const amount = page.locator('#bankamt');
  await amount.fill('30000');
  await page.locator('#bankin [data-op="borrow"]').click();
  await page.waitForFunction(() => G.you!.loan?.bal === 30000 && G.you!.credits === 130000);
  await page.waitForFunction(() =>
    document.querySelector('#bankin')!.textContent!.includes('130,000'),
  );
  await amount.fill('1234');
  await amount.focus();
  await page.evaluate(async () => (await import('/ui.js')).renderLanded());
  assert.equal(await amount.inputValue(), '1234');
  assert.equal(await amount.evaluate((element) => document.activeElement === element), true);
  await amount.fill('1000000000');
  await page.locator('#bankin [data-op="borrow"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#toasts')?.textContent?.includes('at most') ||
      document.body.textContent?.includes('at most'),
  );
  assert.equal(await page.evaluate(() => G.you!.loan!.bal), 30000);
  await amount.fill('1000');
  await page.locator('#bankin [data-op="pay"]').click();
  await page.waitForFunction(() => G.you!.loan?.bal === 29000 && G.you!.credits === 129000);
  await page.waitForFunction(() => !document.querySelector('#toasts')!.children.length, undefined, {
    timeout: 12000,
  });
  for (const [width, height] of [
    [800, 650],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    for (const scale of [1, 1.4]) {
      await page.evaluate((scale) => {
        document.documentElement.style.setProperty('--ui', String(scale));
        document.body.classList.toggle('scaled', scale !== 1);
      }, scale);
      const bounds = await page.locator('.bank-panel').boundingBox();
      assert.ok(
        bounds &&
          bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y + bounds.height <= height,
        JSON.stringify({ width, height, scale, bounds }),
      );
      await page.locator('#bankclose').focus();
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await page
          .locator('[data-op="payall"]')
          .evaluate((element) => document.activeElement === element),
        true,
      );
      const action = await page.locator('[data-op="payall"]').boundingBox();
      assert.ok(action && action.y >= 0 && action.y + action.height <= height);
      await page.locator('#bankin').hover();
      await page.mouse.wheel(0, -10000);
      await page.waitForFunction(() => document.querySelector('#bankin')!.scrollTop === 0);
      await page.screenshot({ path: path.join(output, `bank-${width}-${scale}.png`) });
    }
  }
  await page.setViewportSize({ width: 800, height: 400 });
  await page.locator('#bankin').hover();
  await page.mouse.wheel(0, -10000);
  await page.waitForFunction(() => document.querySelector('#bankin')!.scrollTop === 0);
  assert.ok(
    await page
      .locator('#bankin')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
    'Short viewport loan body scrolls',
  );
  await page.mouse.wheel(0, 10000);
  await page.waitForFunction(() => document.querySelector('#bankin')!.scrollTop > 0);
  await page.screenshot({ path: path.join(output, 'bank-800-short-wheel.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui', '1');
    document.body.classList.remove('scaled');
  });
  await page.locator('[data-op="payall"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !G.you!.loan && G.you!.credits === 100000);
  await page.keyboard.press('Escape');
  assert.equal(await opener.evaluate((element) => document.activeElement === element), true);
  await opener.click();
  await page.evaluate(async () => {
    G.landed!.site = { guest: true } as NonNullable<typeof G.landed>['site'];
    (await import('/ui.js')).renderLanded();
  });
  assert.equal(
    await opener.isVisible(),
    false,
    'Visitor projection cannot expose banking even with stale bank data',
  );
  assert.equal(await page.locator('#bankbox').isVisible(), false);
  await page.reload();
  await page.locator('[data-slot="Bank Pilot"]').click();
  await page.waitForFunction(() => !!G.landed?.bank);
  await page.locator('#bankbtn').click();
  await page.locator('#bankamt').fill('12345');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('#quitconfirm').click();
  await page.waitForFunction(() => !G.you);
  assert.equal(
    await page.locator('#bankamt').count(),
    0,
    'Logout discards the previous captain loan draft',
  );
  await page.locator('[data-slot="Second Bank Pilot"]').click();
  await page.waitForFunction(() => !!G.landed?.bank);
  await page.locator('#bankbtn').click();
  assert.notEqual(
    await page.locator('#bankamt').inputValue(),
    '12345',
    'Loan drafts do not cross captain accounts',
  );
  await page.keyboard.press('Escape');
  await page.locator('#depart').click();
  await page.waitForFunction(() => !G.landed);
  await page.evaluate(async () =>
    __testSocket.send(JSON.stringify({ t: 'bank', op: 'borrow', amt: 1000 })),
  );
  await page.waitForFunction(() =>
    document.body.textContent?.includes('Banking is done at a trade port.'),
  );
  assert.equal(await page.locator('#bankbox').isVisible(), false);
  assert.equal(await page.evaluate(() => G.you!.credits), 100000);
  const remote = await context.newPage();
  await remote.goto(origin);
  await remote.locator('[data-slot="Remote Pilot"]').click();
  await remote.waitForFunction(() => !!G.landed);
  assert.equal(await remote.locator('#bankbtn').isVisible(), false);
  await remote.evaluate(async () =>
    __testSocket.send(JSON.stringify({ t: 'bank', op: 'borrow', amt: 1000 })),
  );
  await remote.waitForFunction(() =>
    document.body.textContent?.includes('Banking is done at a trade port.'),
  );
  assert.equal(await remote.evaluate(() => G.you!.credits), 100000);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ toasts, errors }, null, 2));
  console.log(
    'Compact bank: real borrow/pay/pay-all/denials, refresh, visitor/flight gates, focus/Escape and native scaled keyboard/wheel PASS',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
