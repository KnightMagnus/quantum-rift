// Real Solo landings, purchase routes and Personal Station store access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { FACTIONS, STELLARS, SYS } from '../shared/galaxy.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const out = evidenceDir('faction-stores');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-store-ui-'));
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
const db = new DB(path.join(dir, 'data'));
const facs = Object.keys(FACTIONS).filter(
  (k) => !FACTIONS[k].region && !FACTIONS[k].hidden && k !== 'umbral',
);
const ports = Object.values(STELLARS).filter((p) => !p.site && p.svc.includes('L'));
const site = Object.values(STELLARS).find((p) => p.site);
const cases = facs.map((fac) => {
  const local = ports.filter((p) => SYS[p.system].faction === fac);
  return { name: `Store ${fac}`, port: local.find((p) => !p.svc.includes('T')) || local[0], fac };
});
cases.push({ name: 'Store Owner', port: site, own: true });
cases.push({ name: 'Store Visitor', port: site });
cases.push({
  name: 'Store Neutral',
  port: ports.find((p) => !facs.includes(SYS[p.system].faction)),
});
for (const c of cases) {
  assert.ok(c.port, c.name + ' has a real landing');
  const d = Game.prototype.fresh.call({ A });
  d.tut = 999;
  d.story = { done: ['start'], active: null };
  d.sys = c.port.system;
  d.stellar = c.port.id;
  d.credits = 1e6;
  d.rep = { ...d.rep, ...Object.fromEntries(facs.map((f) => [f, 100])) };
  d.tokens = Object.fromEntries(facs.map((f) => [f, 100]));
  if (c.own) {
    d.station.site = site.id;
    d.station.ops = 1;
  }
  db.create(c.name, 'fixture', d);
}
db.flush();
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
const results = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(origin);
    await page.locator(`[data-slot="${c.name}"]`).click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    assert.equal(await page.locator('#commsheader .comms-live').count(), 0);
    await page.locator('#traytoggle').click();
    await page.locator('[data-tab="ops"]').click();
    assert.equal(
      await page.locator('#opsview [data-act="stores"]').count(),
      0,
      'Bulletin has no remote store shortcut',
    );
    await page.locator('#traytoggle').click();
    const available = !!(c.own || c.fac);
    assert.equal(await page.locator('#storesbtn').isVisible(), available);
    if (available) {
      assert.equal(
        await page.locator('#storesbtn').innerText(),
        c.own ? 'FACTION STORES' : 'FACTION STORE',
      );
      await page.locator('#storesbtn').click();
      const expected = c.own ? facs : [c.fac];
      assert.deepEqual(
        await page
          .locator('#storein [data-act="sfac"]')
          .evaluateAll((els) => els.map((e) => e.dataset.f)),
        expected,
      );
      for (const fac of expected) {
        await page.locator(`#storein [data-act="sfac"][data-f="${fac}"]`).click();
        const image = page.locator('#faction-insignia');
        await image.evaluate((im) => im.decode());
        assert.equal(await image.getAttribute('data-faction'), fac);
        assert.equal(await image.getAttribute('alt'), `${FACTIONS[fac].name} insignia`);
        assert.ok(await image.evaluate((im) => im.naturalWidth > 0));
        assert.deepEqual(
          await page
            .locator('#storein [data-act="buystore"]')
            .evaluateAll((els) => [...new Set(els.map((e) => e.dataset.f))]),
          [fac],
        );
      }
      const chosen = c.own ? facs.at(-1) : c.fac;
      await page.locator('#storein [data-id="writ"]').click();
      await page.waitForFunction(
        (fac) => G.you.rep[fac] === 110 && G.you.tokens[fac] === 88,
        chosen,
      );
      if (!c.own) {
        // Stale selection cannot expose another faction after opening/re-rendering.
        await page.evaluate(async () => {
          G.storeFac = 'not-local';
          (await import('/ui.js')).refreshStores();
        });
        assert.deepEqual(
          await page
            .locator('#storein [data-act="sfac"]')
            .evaluateAll((els) => els.map((e) => e.dataset.f)),
          [c.fac],
        );
      }
      await page.screenshot({
        path: path.join(out, c.own ? 'personal-station-stores.png' : `local-${c.fac}-store.png`),
      });
      await page.locator('#storein [data-act="sclose"]').click();
    } else {
      await page.evaluate(async () => (await import('/ui.js')).openStores());
      assert.equal(
        await page.locator('#storebox').isVisible(),
        false,
        'Unavailable landing cannot open a stale store',
      );
    }
    assert.deepEqual(errors, []);
    results.push({
      name: c.name,
      stellar: c.port.id,
      available,
      factions: c.own ? facs : c.fac ? [c.fac] : [],
    });
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(
    'PASS all local faction landings, Personal Station selectors, actual purchases, visitor/neutral denials and Bulletin/chat cleanup',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
