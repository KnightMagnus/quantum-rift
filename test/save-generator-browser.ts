import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-save-editor-browser-'),
);
const output = evidenceDir('save-generator');
const saveFile = path.join(directory, 'custom.rift.json');
const generated = spawnSync(
  'python3',
  [
    'test/Save Generator/save_generator.py',
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
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(directory, 'data'),
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  const publicVersion = JSON.parse(
    fileSystem.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).publicVersion;
  await page.waitForFunction(
    (expected) => document.querySelector('#lver')?.textContent === 'Quantum Rift v' + expected,
    publicVersion,
  );
  await page.locator('#limport').setInputFiles(saveFile);
  const slot = page.locator('[data-slot="Custom Browser"]');
  await slot.waitFor();
  const imported = await (await fetch(`${origin}/api/export?name=Custom%20Browser`)).json();
  assert.equal(imported.rift, publicVersion, 'Solo HTTP exports match the displayed beta label');
  assert.equal(imported.save.credits, 12345678);
  assert.equal(imported.save.ship.hull, 736);
  assert.equal(imported.save.station.ops, 5);
  await slot.click();
  await page.locator('#landbody').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(output, 'imported-captain.png') });
  assert.match(await page.locator('#land').innerText(), /Custom Browser['’]s Personal Station/i);
  const world = JSON.parse(
    fileSystem.readFileSync(path.join(directory, 'data/world.json'), 'utf8'),
  );
  assert.equal(world.sites[imported.save.station.site], 'custom browser');
  assert.deepEqual(errors, []);
  console.log(
    'PASS generated file selected in Solo UI, slot listed, exported values preserved, station owned and captain playable',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
