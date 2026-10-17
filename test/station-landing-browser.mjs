// Real Solo login, landing UI, departure and complete production flight renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { augmentAssets } from '../shared/rules.js';
import { SYS, STELLARS } from '../shared/galaxy.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-exotic-solo-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || '/tmp/rift-station-landing';
fs.mkdirSync(evidence, { recursive: true });
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
augmentAssets(A);
const db = new DB(path.join(dir, 'data'));
const ports = [
  'qstation',
  'site-qgate',
  'site-meridian',
  'site-halcyon',
  'lanternfall',
  'threshold',
  'aureole-ring',
  'twins-exchange',
  'reliquary-watch',
  'nightjar-refuge',
  'glasswake-foundry',
  'palinode-observatory',
  'meridian-yards',
  'luna',
];
const captain = (id) => 'Art ' + ports.indexOf(id);
for (const id of ports) {
  const p = STELLARS[id],
    d = Game.prototype.fresh.call({ A });
  d.sys = p.system;
  d.stellar = id;
  d.tut = 999;
  d.explored = Object.keys(SYS);
  if (p.site && id !== 'site-qgate') {
    d.station = { ...d.station, claimed: true, site: id, ops: id === 'site-meridian' ? 3 : 5 };
    db.world.sites[id] = db.key(captain(id));
  }
  db.create(captain(id), 'solo', d);
}
db.touch();
db.flush();
const port = Number(process.env.RIFT_BROWSER_PORT || 18806),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.js'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(dir, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox'],
});
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  // Record the actual former startup landing: hub was outside the station branch.
  if (!process.env.RIFT_STATION_SKIP_BASELINE) {
    const baseline = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await baseline.route('**/ui.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: execFileSync('git', ['show', 'HEAD:client/ui.js'], { cwd: root }),
      }),
    );
    await baseline.goto(origin);
    await baseline.locator(`[data-slot="${captain('qstation')}"]`).click();
    await baseline.waitForFunction(() => window.G?.you && G.landed);
    const before = await baseline.locator('#landpic').evaluate((el) => el.style.backgroundImage);
    assert.ok(before.includes('10955.jpg'), 'baseline hub reused legacy personal-station image');
    await baseline.screenshot({ path: path.join(evidence, 'qstation-before.png') });
    await baseline.close();
  }
  const results = [];
  for (const id of process.env.RIFT_STATION_QUICK ? ['qstation'] : ports) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin);
    await page.locator(`[data-slot="${captain(id)}"]`).click();
    await page.waitForFunction(() => window.G?.you && G.landed);
    if (STELLARS[id].kind === 'station' || STELLARS[id].hub || STELLARS[id].site)
      await page.waitForFunction(() =>
        document.getElementById('landpic').style.backgroundImage.includes('data:image/png'),
      );
    for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    // CSS background failures do not raise pageerror: decode EVERY selected landing URL.
    const landingImages = await page.evaluate(async () => {
      const css = document.getElementById('landpic').style.backgroundImage;
      const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
      return await Promise.all(
        urls.map(async (src) => {
          const image = new Image();
          image.src = src;
          try {
            await image.decode();
            return { src: src.startsWith('data:') ? 'generated-station-scene' : src, ok: true };
          } catch {
            return { src, ok: false };
          }
        }),
      );
    });
    assert.ok(
      landingImages.length && landingImages.every((x) => x.ok),
      id + ' landed pictures decode',
    );
    await page.screenshot({ path: path.join(evidence, id + '-landed.png') });
    const state = await page.evaluate(() => ({
      solo: G.solo,
      sys: G.sys,
      stellar: G.landed.stellar,
      name: document.getElementById('landname').textContent,
      landArt: document
        .getElementById('landpic')
        .style.backgroundImage.startsWith('url("data:image/png'),
    }));
    assert.equal(state.solo, true);
    assert.equal(state.stellar, id);
    if (STELLARS[id].kind === 'station' || STELLARS[id].hub || STELLARS[id].site)
      assert.equal(state.landArt, true);
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(evidence, id + '-flight.png') });
    assert.deepEqual(errors, []);
    results.push({ ...state, landingImages, errors });
    if (id === 'qstation') {
      let failed = false;
      await page.route('**/s_cross.webp?v=station-retry', (route) => {
        if (!failed) {
          failed = true;
          return route.abort();
        }
        return route.continue();
      });
      const retry = await page.evaluate(async () => {
        const { stationLanding } = await import('/exotic_scenery.js');
        const { setArtworkVersion } = await import('/artwork.js');
        setArtworkVersion('station-retry');
        const p = { id: 'retry-audit', name: 'Retry fixture' };
        const first = await stationLanding(p, {}, 'cross');
        const second = await stationLanding(p, {}, 'cross');
        setArtworkVersion('2.9.1');
        return { first, second: !!second };
      });
      assert.equal(retry.first, null);
      assert.equal(retry.second, true, 'transient station-art failures can recover');
      const audit = await page.evaluate(async () => {
        const { STELLARS, SYS } = await import('/shared/galaxy.js');
        const { stationDesign } = await import('/render.js');
        const { stationLanding, stationLandingSource } = await import('/exotic_scenery.js');
        const stations = Object.values(STELLARS).filter(
          (p) => p.svc?.includes('L') && (p.hub || p.site || p.kind === 'station'),
        );
        const rows = [];
        const unique = new Map();
        for (const p of stations) {
          for (const tier of p.site ? [0, 1, 2, 3, 4, 5] : [null]) {
            const site = p.site ? { ops: tier } : undefined;
            const design = stationDesign(p);
            const source = stationLandingSource(p, design, site);
            const url = await stationLanding(p, SYS[p.system], design, site);
            if (!url) throw new Error('Failed artwork: ' + p.id);
            const im = new Image();
            im.src = url;
            await im.decode();
            rows.push({
              id: p.id,
              kind: p.kind,
              tier,
              design,
              source,
              width: im.naturalWidth,
              height: im.naturalHeight,
            });
            if (!unique.has(source)) unique.set(source, { p, source, im, tier, design });
          }
        }
        const contact = document.createElement('canvas');
        contact.width = 1200;
        contact.height = Math.ceil(unique.size / 3) * 240;
        const cx = contact.getContext('2d');
        cx.fillStyle = '#030712';
        cx.fillRect(0, 0, contact.width, contact.height);
        let i = 0;
        for (const { p, im, tier, design } of unique.values()) {
          const x = (i % 3) * 400,
            y = Math.floor(i / 3) * 240;
          cx.drawImage(im, x, y, 400, 217);
          cx.fillStyle = 'white';
          cx.font = '12px sans-serif';
          cx.fillText(
            p.name + ' / ' + (p.hub ? 'unique hub' : p.site ? 'T-' + tier : design),
            x + 8,
            y + 232,
          );
          i++;
        }
        return {
          rows,
          unique: unique.size,
          contact: contact.toDataURL(),
          stations: stations.length,
        };
      });
      fs.writeFileSync(
        path.join(evidence, 'all-station-audit.json'),
        JSON.stringify({ ...audit, contact: undefined }, null, 2),
      );
      fs.writeFileSync(
        path.join(evidence, 'all-designs.png'),
        Buffer.from(audit.contact.split(',')[1], 'base64'),
      );
      assert.equal(audit.stations, 110);
      assert.equal(audit.rows.length, 245);
      assert.ok(
        audit.rows.filter((x) => x.kind === 'hub').every((x) => x.source.includes('hub.png')),
      );
      assert.ok(
        audit.rows
          .filter((x) => x.kind === 'site')
          .every((x) => x.source.includes('/stations/' + x.tier + '.png')),
      );
    }
    await page.close();
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, evidence }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
