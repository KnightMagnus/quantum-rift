import { launchChromium } from './helpers/chromium.ts';
// Grade-specific controls must deliver actual server-side changes, not DOM-only labels.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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
const directory = tempDataDir('rift-cargo-ui-'),
  output = evidenceDir('cargo-ui'),
  assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString());
augmentAssets(assets);
const database = new Database(path.join(directory, 'data')),
  playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
    import('../server/game.ts').Game['fresh']
  > & {
    story?: { done: string[]; active: null; step: number };
  };
playerData.tut = 999;
playerData.story = { done: ['start'], active: null, step: 0 };
playerData.ship = makeLoadout(assets, 704, 'Grade hauler');
addLots(playerData.cargo, playerData.cargoLots, {
  cid: 'ore',
  qty: 6,
  grades: { common: 1, rich: 2, pure: 3 },
});
database.create('Grade Pilot', 'fixture', playerData);
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
let browser;
const errors: string[] = [],
  events: {
    at: number;
    dir: string;
    m?: unknown;
    t?: string;
    cargo?: unknown;
    lots?: unknown;
    msg?: string;
  }[] = [];
let diagnosticPage;
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  diagnosticPage = page;
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.t !== 'input') events.push({ at: Date.now(), dir: 'sent', m: message });
      } catch {}
    });
    socket.on('framereceived', ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.t === 'you')
          events.push({
            at: Date.now(),
            dir: 'received',
            t: message.t,
            cargo: message.d.cargo,
            lots: message.d.cargoLots,
          });
        else if (message.t === 'toast' || message.t === 'rivals')
          events.push({ at: Date.now(), dir: 'received', t: message.t, msg: message.msg });
      } catch {}
    });
  });
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.addInitScript(() => {
    window.pointerTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(
        type,
        (event2) =>
          window.pointerTrace.push({
            at: performance.now(),
            type,
            target: (event2.target! as HTMLElement).outerHTML?.slice(0, 500),
            x: (event2 as MouseEvent).clientX,
            y: (event2 as MouseEvent).clientY,
          }),
        true,
      );
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.fixtureSocket = this;
      }
    };
  });
  await page.goto(origin);
  await page.locator('[data-slot="Grade Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="trade"]').click();
  const pure = page.locator('[data-act="trade"][data-c="ore"][data-grade="pure"][data-q="-1"]');
  await pure.waitFor();
  assert.equal(await page.locator('[data-grade="rich"][data-act="trade"]').count(), 2);
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'market-grades.png') });
  const credits = await page.evaluate(() => G.you!.credits);
  await pure.click();
  await page.waitForFunction(
    () => G.you!.cargo.ore === 5 && G.you!.cargoLots.byCommodity.ore.pure === 2,
  );
  assert.ok(await page.evaluate((previousCredits) => G.you!.credits > previousCredits, credits));
  assert.deepEqual(await page.evaluate(() => G.you!.cargoLots.byCommodity.ore), {
    common: 1,
    rich: 2,
    pure: 2,
  });
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.press('KeyI');
  await page.locator('#infobox').waitFor({ state: 'visible' });
  const dump = page.locator('[data-jet="ore"][data-grade="rich"]').first();
  await dump.waitFor();
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'jettison-grades.png') });
  // Reproduce the asynchronous rivals refresh during a real pointer gesture.
  await dump.hover();
  await page.mouse.down();
  await page.evaluate(() => {
    G.rivals = null as unknown as typeof G.rivals;
    window.fixtureSocket.send(JSON.stringify({ t: 'rivals' }));
  });
  await page.waitForFunction(() => Array.isArray(G.rivals));
  await page.mouse.up();
  await page.waitForFunction(
    () => G.you!.cargo.ore === 3 && G.you!.cargoLots.byCommodity.ore.rich === 0,
  );
  // Keep the stationary real flight running: this must not be a transient pre-scoop update.
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => G.you!.cargo.ore), 3);
  assert.deepEqual(await page.evaluate(() => G.you!.cargoLots.byCommodity.ore), {
    common: 1,
    rich: 0,
    pure: 2,
  });
  // The relevant tab must still update when the same asynchronous reply arrives.
  await page.evaluate(() => {
    G.rivals = [];
  });
  await page.locator('[data-it="captains"]').click();
  assert.equal(await page.locator('#infobody table tr').count(), 1);
  await page.evaluate(() => window.fixtureSocket.send(JSON.stringify({ t: 'rivals' })));
  await page.waitForFunction(
    () => document.querySelectorAll<HTMLElement>('#infobody table tr').length > 1,
  );
  assert.equal(await page.locator('#infobody table tr').count(), 31);
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        gradeSale: true,
        gradeJettison: true,
        rivalsGesture: true,
        captainsRefresh: true,
        serverInventory: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Actual market and in-flight grade buttons preserve unselected grades in authoritative server inventory.',
  );
} catch (error) {
  const state = await diagnosticPage
    ?.evaluate(() => ({
      cargo: G.you?.cargo,
      lots: G.you?.cargoLots,
      itab: G.itab,
      pointers: window.pointerTrace,
    }))
    .catch(() => null);
  fileSystem.writeFileSync(
    path.join(output, 'failure-state.json'),
    JSON.stringify(
      { node: process.version, browser: browser?.version(), errors, events, state },
      null,
      2,
    ),
  );
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
