import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-save-editor-browser-'));
const out = evidenceDir('save-generator');
const saveFile = path.join(dir, 'custom.rift.json');
const generated = spawnSync(
  'python3',
  [
    'Testing/SaveGenerator/save_generator.py',
    '--output',
    saveFile,
    '--name',
    'Custom Browser',
    '--credits',
    '12345678',
    '--ship',
    '736',
    '--tier',
    '5',
    '--research',
  ],
  { cwd: root },
);
assert.equal(generated.status, 0, String(generated.stderr));
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
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
try {
  await ready(server, origin);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  await page.locator('#limport').setInputFiles(saveFile);
  const slot = page.locator('[data-slot="Custom Browser"]');
  await slot.waitFor();
  const imported = await (await fetch(`${origin}/api/export?name=Custom%20Browser`)).json();
  assert.equal(imported.save.credits, 12345678);
  assert.equal(imported.save.ship.hull, 736);
  assert.equal(imported.save.station.ops, 5);
  await slot.click();
  await page.locator('#landbody').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(out, 'imported-captain.png') });
  assert.match(await page.locator('#land').innerText(), /Custom Browser['’]s Personal Station/i);
  const world = JSON.parse(fs.readFileSync(path.join(dir, 'data/world.json')));
  assert.equal(world.sites[imported.save.station.site], 'custom browser');
  assert.deepEqual(errors, []);
  console.log(
    'PASS generated file selected in Solo UI, slot listed, exported values preserved, station owned and captain playable',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
