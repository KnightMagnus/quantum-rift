import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
for (const solo of [false, true]) {
  const out = evidenceDir('landed-live-' + (solo ? 'solo' : 'online'));
  const dir = tempDataDir('rift-landed-live-'),
    data = path.join(dir, 'data');
  const A = augmentAssets(JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))));
  const db = new DB(data),
    d = Game.prototype.fresh.call({ A });
  d.tut = 999;
  d.story = { done: ['start'], active: null };
  db.create('Dock Observer', 'fixture', d);
  db.flush();
  const port = await availablePort(),
    origin = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, ['--import', './test/seed-random.js', 'server/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      SOLO: solo ? '1' : '',
      PORT: String(port),
      DATA_DIR: data,
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
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [],
      sent = [],
      scenes = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('websocket', (ws) => {
      ws.on('framesent', (f) => sent.push(JSON.parse(String(f.payload))));
      ws.on('framereceived', (f) => {
        const m = JSON.parse(String(f.payload));
        if (m.t === 'scene') scenes.push(m);
      });
    });
    await page.addInitScript(() => {
      window.trafficDraws = [];
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.id === 'view' && /ships/.test(image?.src || '')) {
          const m = this.getTransform();
          window.trafficDraws.push({
            src: image.src,
            x: m.e + args[4],
            y: m.f + args[5],
            t: performance.now(),
          });
          if (window.trafficDraws.length > 2000) window.trafficDraws.shift();
        }
        return original.call(this, image, ...args);
      };
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('#lver').textContent);
    await page.fill('#lname', 'Dock Observer');
    if (!solo) await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.landed && G.ents.size > 0);
    for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    const sample = () =>
      page.evaluate(() => ({
        view: G.view,
        stellar: G.landed?.stellar,
        ships: [...G.ents.values()].map((e) => ({ id: e.id, x: e.x, y: e.y, rx: e.rx, ry: e.ry })),
        draws: window.trafficDraws.filter((d) => d.t > performance.now() - 200),
        pixels: Array.from(
          document
            .querySelector('#view')
            .getContext('2d')
            .getImageData(
              0,
              0,
              document.querySelector('#view').width,
              document.querySelector('#view').height,
            ).data,
        ).filter((v, i) => i % 4 !== 3 && v > 20).length,
      }));
    const camera = await page.evaluate(async () => {
      const { cam } = await import('/render.js');
      const { STELLARS } = await import('/shared/galaxy.js');
      const p = STELLARS[G.landed.stellar];
      return { x: cam.cx, y: cam.cy, px: p.x, py: p.y };
    });
    assert.equal(camera.x, camera.px);
    assert.equal(camera.y, camera.py);
    const proof = [];
    for (const tab of ['overview', 'trade', 'outfit']) {
      const button = page.locator('[data-lt="' + tab + '"]');
      assert.equal(await button.count(), 1);
      await button.click();
      await page.waitForTimeout(350);
      const a = await sample();
      assert.equal(a.view, null);
      assert.ok(a.pixels > 5000, 'real world canvas is not black');
      await page.screenshot({ path: path.join(out, tab + '-a.png') });
      await page.waitForTimeout(1200);
      const b = await sample();
      assert.equal(a.stellar, b.stellar);
      assert.equal(b.view, null);
      const moved = b.ships.filter((e) =>
        a.ships.some(
          (p) =>
            p.id === e.id &&
            Math.hypot(p.x - e.x, p.y - e.y) > 3 &&
            Math.hypot(p.rx - e.rx, p.ry - e.ry) > 3,
        ),
      );
      assert.ok(
        moved.length,
        'authoritative traffic and interpolated positions advance while ' + tab,
      );
      await page.screenshot({ path: path.join(out, tab + '-b.png') });
      assert.ok(
        a.draws.some((p) =>
          b.draws.some((q) => p.src === q.src && Math.hypot(p.x - q.x, p.y - q.y) > 2),
        ),
        'real ship sprites move on the rendered canvas',
      );
      proof.push({ tab, a, b, moved: moved.map((e) => e.id) });
    }
    // The real store selection route updates each crest and keeps purchase gates.
    await page.click('#storesbtn');
    const factionIds = await page
      .locator('#storein [data-act="sfac"]')
      .evaluateAll((els) => els.map((e) => e.dataset.f));
    const { FACTIONS } = await import('../shared/galaxy.ts');
    assert.deepEqual(
      factionIds,
      Object.entries(FACTIONS)
        .filter(([k, f]) => !f.region && !f.hidden && k !== 'umbral')
        .map(([k]) => k),
    );
    for (const id of factionIds) {
      await page.locator('#storein [data-f="' + id + '"][data-act="sfac"]').click();
      const image = page.locator('#faction-insignia');
      await image.evaluate((im) => im.decode());
      assert.equal(await image.getAttribute('data-faction'), id);
      assert.equal(await image.getAttribute('alt'), FACTIONS[id].name + ' insignia');
      assert.ok(await image.evaluate((im) => im.naturalWidth > 0));
      const source = await (await fetch(origin + '/assets/factions/' + id + '.svg')).text();
      assert.ok(
        source.includes(FACTIONS[id].color),
        'canonical faction menu color in original image',
      );
      const menuColor = await page
        .locator('#storein .sfac.on b')
        .evaluate((el) => getComputedStyle(el).color);
      const color = FACTIONS[id].color;
      assert.equal(
        menuColor,
        'rgb(' + [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).join(', ') + ')',
      );
      const ib = await image.boundingBox(),
        heading = await page.locator('.store-heading h2').boundingBox();
      assert.ok(ib.x + ib.width <= heading.x, 'insignia top-left, no heading overlap');
      assert.equal(
        await page.locator('#storein [data-act="buystore"]:not([disabled])').count(),
        0,
        'unearned purchases stay gated',
      );
      if (!solo) await page.screenshot({ path: path.join(out, 'faction-' + id + '.png') });
    }
    await page.setViewportSize({ width: 640, height: 480 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ui', 1.4);
      document.body.classList.add('scaled');
    });
    await page.locator('#faction-insignia').scrollIntoViewIfNeeded();
    const small = await page.locator('#faction-insignia').boundingBox();
    assert.ok(
      small.x >= 0 && small.x + small.width <= 640 && small.y >= 0 && small.y + small.height <= 480,
    );
    await page.locator('#storein [data-act="sclose"]').click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ui', 1);
      document.body.classList.remove('scaled');
    });
    // A normal landed service refresh must not leave a stale flight scene behind.
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.keyboard.press('KeyL');
    await page.waitForFunction(() => G.landed && !G.view);
    await page.waitForFunction(() => G.ents.size > 0);
    assert.ok((await sample()).pixels > 5000, 'depart/redock restores the observer scene');
    const before = sent.length;
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');
    await page.mouse.click(20, 200);
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('Space');
    assert.equal(
      sent.slice(before).filter((m) => m.t === 'input').length,
      0,
      'landed keys cannot send flight inputs',
    );
    assert.ok(scenes.length > 10);
    assert.ok(
      scenes.every((m) => !m.me),
      'observers never receive a player entity',
    );
    if (solo) {
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => G.paused);
      await page.waitForTimeout(500);
      const a = await sample(),
        n = scenes.length;
      await page.waitForTimeout(700);
      const b = await sample();
      assert.deepEqual(
        b.ships.map((e) => [e.id, e.x, e.y]),
        a.ships.map((e) => [e.id, e.x, e.y]),
      );
      assert.equal(scenes.length, n);
      assert.deepEqual(
        b.ships.map((e) => [e.id, e.rx, e.ry]),
        a.ships.map((e) => [e.id, e.rx, e.ry]),
        'Paused rendered traffic is frozen too',
      );
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => !G.paused);
      await page.waitForTimeout(400);
      assert.ok(scenes.length > n);
    }
    fs.writeFileSync(path.join(out, 'motion-proof.json'), JSON.stringify(proof, null, 2));
    assert.deepEqual(errors, []);
    console.log('PASS live landed ' + (solo ? 'solo' : 'online'));
  } catch (e) {
    await failureEvidence(browser, out, e);
    throw e;
  } finally {
    await cleanup(server, browser, log, dir);
  }
}
