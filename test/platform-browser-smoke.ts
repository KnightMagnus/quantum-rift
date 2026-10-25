// Narrow engine smoke, not the complete Chromium gameplay suite or real Safari/device proof.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';
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

const engine = process.env.RIFT_BROWSER || 'chromium';
assert(['chromium', 'firefox', 'webkit'].includes(engine), 'Unknown browser engine');
const browserType = { chromium, firefox, webkit }[engine]!;
const evidence = evidenceDir('platform-' + engine);
const directory = tempDataDir('rift-platform-browser-');
const assets = augmentAssets(
  JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
);
const database = new DB(path.join(directory, 'data'));
const saved = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']> & {
  story: { done: string[]; active: null; step: number };
};
saved.tut = 999;
saved.story = { done: ['start'], active: null, step: 0 };
database.create('Platform Pilot', 'fixture', saved);
database.flush();
const port = await availablePort();
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(directory, 'data'),
    SEEDS_FILE: path.join(directory, 'missing.json'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await browserType.launch({
    headless: true,
    executablePath: process.env.RIFT_BROWSER_EXECUTABLE,
    ...(engine === 'chromium' ? { args: ['--no-sandbox'] } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.fixtureInputs = [];
    const original = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if (typeof data === 'string') {
        const packet = JSON.parse(data);
        if (packet.t === 'input') window.fixtureInputs.push(packet);
      }
      return original.call(this, data);
    };
  });
  // Force the production fallback path; no shader assumptions hide canvas-only failures.
  await page.goto(origin + '/?renderer=canvas');
  await page.locator('[data-slot="Platform Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  const exported = await (await fetch(origin + '/api/export?name=Platform%20Pilot')).json();
  assert.equal(exported.save.name, 'Platform Pilot');
  const imported = await fetch(origin + '/api/import', {
    method: 'POST',
    body: JSON.stringify({ ...exported, save: { ...exported.save, name: 'Restored Pilot' } }),
  });
  assert.equal(imported.status, 200);
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);
  assert.equal(await page.locator('#view').getAttribute('data-renderer'), 'canvas');
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.keyboard.up('w');
  await page.waitForFunction(() =>
    window.fixtureInputs.slice(-2).every((packet) => packet.th === 0),
  );
  await page.keyboard.press('o');
  await page.locator('#opts').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.fixtureInputs = [];
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.fixtureInputs.some((packet) => packet.th === 1)),
    false,
    'Settings owns keyboard input',
  );
  await page.keyboard.press('Escape');
  await page.locator('#opts').waitFor({ state: 'hidden' });
  await page.locator('#chatin').focus();
  await page.keyboard.type('w');
  assert.equal(
    await page.evaluate(() => window.fixtureInputs.some((packet) => packet.th === 1)),
    false,
    'Chat typing does not steer',
  );
  await page.screenshot({ path: path.join(evidence, 'flight-canvas.png') });
  await page.reload();
  await page.locator('[data-slot="Restored Pilot"]').click();
  await page.waitForFunction(() => G.you?.name === 'Restored Pilot');
  assert.equal(await page.evaluate(() => G.you!.credits), exported.save.credits);
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify(
      {
        engine,
        browserVersion: browser.version(),
        login: true,
        physicalKeyboard: true,
        modalAndTypingIsolation: true,
        canvasFallback: true,
        exportedImportedSavePlayable: true,
        errors,
        limits:
          'Headless Linux browser engines only; not physical-device, audible, accessibility or full gameplay coverage.',
      },
      null,
      2,
    ),
  );
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
