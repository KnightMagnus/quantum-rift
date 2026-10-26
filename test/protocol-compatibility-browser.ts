import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const evidence = evidenceDir('protocol-compatibility');
const directory = tempDataDir('rift-protocol-browser-');
const data = path.join(directory, 'data');
const assets = augmentAssets(
  JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
);
const database = new DB(data);
const captain = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']> & {
  story: { done: string[]; active: null; step: number };
};
captain.credits = 654321;
captain.tut = 999;
captain.story = { done: ['start'], active: null, step: 0 };
database.create('Protocol Captain', 'fixture', captain);
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
      DATA_DIR: data,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  let protocol: number | undefined = 2;
  let statusReads = 0;
  let sockets = 0;
  let documents = 0;
  page.on('websocket', () => sockets++);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documents++;
  });
  await page.route('**/api/status', async (route) => {
    statusReads++;
    const response = await route.fetch();
    const status = await response.json();
    // Package labels are not compatibility identifiers; even a different label may work.
    await route.fulfill({
      response,
      json: { ...status, version: 'fixture-other-build', protocol },
    });
  });
  await page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.testSocket = this;
      }
    };
  });
  const login = async () => {
    await page.fill('#lname', 'Protocol Captain');
    await page.click('#lbtn');
  };
  await page.goto(origin);
  await page.waitForFunction(() =>
    document.querySelector('#lver')!.textContent!.includes('fixture-other-build'),
  );
  await login();
  await page.waitForSelector('#compatibility-refresh', { state: 'visible' });
  assert.match(await page.locator('#lerr').innerText(), /Refresh this page/);
  assert.equal(sockets, 0, 'stale page cannot open gameplay transport');
  assert(statusReads >= 2, 'login must fetch status again rather than reuse startup response');
  await page.screenshot({
    path: path.join(evidence, 'update-required.png'),
    animations: 'disabled',
  });
  const firstDocuments = documents;
  await page.waitForTimeout(1500);
  assert.equal(documents, firstDocuments, 'no automatic refresh loop');
  protocol = undefined;
  await page.click('#compatibility-refresh');
  await page.waitForFunction(() =>
    document.querySelector('#lver')!.textContent!.includes('fixture-other-build'),
  );
  await login();
  await page.waitForFunction(() => G.you?.name === 'Protocol Captain' && G.landed);
  assert.equal(
    await page.evaluate(() => G.you!.credits),
    654321,
    'legacy server and different build label are supported',
  );
  assert.equal(await page.locator('#compatibility-refresh').isVisible(), false);
  protocol = 2;
  await page.evaluate(() => window.testSocket!.close());
  await page.waitForSelector('#login', { state: 'visible' });
  await page.waitForSelector('#compatibility-refresh', { state: 'visible' });
  assert.match(await page.locator('#lerr').innerText(), /Refresh this page/);
  const stoppedReads = statusReads;
  const stoppedSockets = sockets;
  await page.waitForTimeout(2500);
  assert.equal(statusReads, stoppedReads, 'mismatch stops reconnect attempts');
  assert.equal(sockets, stoppedSockets);
  assert.equal(
    await page.evaluate(() => Boolean(G.you)),
    false,
    'old controls and account projection are cleared',
  );
  assert.equal(
    new DB(data).get('Protocol Captain')!.credits,
    654321,
    'committed save survives mismatch',
  );
  protocol = 1;
  await page.click('#compatibility-refresh');
  await page.waitForFunction(() =>
    document.querySelector('#lver')!.textContent!.includes('fixture-other-build'),
  );
  await login();
  await page.waitForFunction(() => G.you?.name === 'Protocol Captain' && G.landed);
  assert.equal(
    await page.evaluate(() => G.you!.credits),
    654321,
    'manual refresh resumes the committed captain',
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(evidence, 'summary.json'),
    JSON.stringify(
      {
        statusReads,
        sockets,
        documents,
        checks: [
          'cached-page denial',
          'manual-refresh only',
          'legacy and different-build acceptance',
          'terminal reconnect mismatch',
          'committed-save recovery',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Browser compatibility: cached page, legacy/current protocol, reconnect stop, manual refresh and committed save recovery passed.',
  );
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
