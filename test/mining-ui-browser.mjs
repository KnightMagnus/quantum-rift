import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture, until } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await miningFixture('mining-ui');
let browser, other;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
      viewport: { width: 1500, height: 1050 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    }),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const sent = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', ({ payload }) => {
      try {
        sent.push(JSON.parse(String(payload)));
      } catch {}
    }),
  );
  await page.addInitScript(() => {
    // Deliver one authentic pre-clear snapshot after the user's clear command.
    // This deterministically models a server snapshot already in flight.
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => {
          const m = JSON.parse(event.data);
          if (m.t === 'snap') {
            this.lastSnapshot = event.data;
            window.lastTargetSnapshot = m.me[10];
          }
        });
      }
      send(raw) {
        super.send(raw);
        const m = JSON.parse(raw);
        if (m.t === 'target' && m.id === 0 && this.lastSnapshot) {
          this.onmessage?.({ data: this.lastSnapshot });
        }
      }
    };
    localStorage.setItem(
      'rift.opts',
      JSON.stringify({ v21: true, keys: {}, cb: true, shake: false, mouseAim: true, scale: 1 }),
    );
  });
  await page.goto(f.origin);
  await page.locator('#lname').fill('Mining Alpha');
  await page.locator('#lpass').fill('fixture');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.locator('#depart').click();
  await page.waitForFunction(
    () => G.view && G.miningRocks?.rocks.some((r) => r.x === 10000 && r.y === 10000),
  );
  await page.locator('#miningindicator').click();
  await page.keyboard.press('v');
  await page.waitForFunction(() => G.mining.revealed.length > 0);
  const rock = await page.evaluate(() =>
    G.miningRocks.rocks.find((r) => r.x === 10000 && r.y === 10000),
  );
  const xy = await page.evaluate(async (r) => {
    const { cam } = await import('/render.js');
    const c = document.querySelector('canvas').getBoundingClientRect();
    return {
      x: c.left + ((r.x - cam.cx) * cam.z + cam.W / 2) / devicePixelRatio,
      y: c.top + ((r.y - cam.cy) * cam.z + cam.H / 2) / devicePixelRatio,
    };
  }, rock);
  other = new WebSocket(f.origin.replace('http', 'ws') + '/ws');
  let otherId = 0;
  other.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'you' && !otherId) other.send(JSON.stringify({ t: 'depart' }));
    if (m.t === 'space') otherId = m.id;
  };
  await new Promise((r) => (other.onopen = r));
  other.send(JSON.stringify({ t: 'hello', name: 'Mining Bravo', pass: 'fixture' }));
  await until(() => otherId, 'second real captain');
  await page.waitForFunction((id) => G.ents.has(id), otherId);
  const shipXY = await page.evaluate(async () => {
    const { cam } = await import('/render.js');
    return {
      x: ((10180 - cam.cx) * cam.z + cam.W / 2) / devicePixelRatio,
      y: ((10200 - cam.cy) * cam.z + cam.H / 2) / devicePixelRatio,
    };
  });
  await page.mouse.click(shipXY.x, shipXY.y);
  await page.waitForFunction((id) => G.target === id, otherId);
  // Real click on a verified empty canvas point clears an actual selected captain.
  const empty = await page.evaluate(async () => {
    const { cam } = await import('/render.js');
    const { SYS } = await import('/shared/galaxy.js');
    const canvas = document.querySelector('#view');
    const r = canvas.getBoundingClientRect();
    for (let y = 180; y < 650; y += 60)
      for (let x = 180; x < 850; x += 60) {
        if (document.elementFromPoint(x, y) !== canvas) continue;
        const wx = ((x - r.left) * devicePixelRatio - cam.W / 2) / cam.z + cam.cx;
        const wy = ((y - r.top) * devicePixelRatio - cam.H / 2) / cam.z + cam.cy;
        if ([...G.ents.values()].some((e) => Math.hypot(e.rx - wx, e.ry - wy) < 150)) continue;
        if (SYS[G.sys].stellars.some((p) => Math.hypot(p.x - wx, p.y - wy) < p.r * 1.15 + 100))
          continue;
        if ((G.rocks || []).some((k) => Math.hypot(k.x - wx, k.y - wy) < k.r + 100)) continue;
        if ((G.towing?.objects || []).some((o) => Math.hypot(o.x - wx, o.y - wy) < 150)) continue;
        return { x, y };
      }
    throw Error('No empty flight point');
  });
  for (const aim of [false, true]) {
    await page.evaluate((v) => {
      G.opts.mouseAim = v;
    }, aim);
    await page.mouse.click(shipXY.x, shipXY.y);
    await page.waitForFunction((id) => G.target === id, otherId);
    await page.waitForFunction((id) => window.lastTargetSnapshot === id, otherId);
    const start = sent.length;
    await page.mouse.click(empty.x, empty.y);
    await page.waitForFunction(() => G.target === 0);
    await until(
      () => sent.slice(start).some((m) => m.t === 'target' && m.id === 0),
      'server target-clear message',
    );
    await page.waitForFunction(() => !G.targetClearPending && window.lastTargetSnapshot === 0);
    assert.equal(
      await page.evaluate(() => G.target),
      0,
      'clear survives stale snapshot and server confirmation',
    );
  }
  await page.mouse.click(shipXY.x, shipXY.y);
  await page.waitForFunction((id) => G.target === id, otherId);
  await page.mouse.move(xy.x, xy.y);
  await page.mouse.down();
  await page.waitForFunction((id) => G.miningTarget === id, rock.id);
  assert.equal(
    await page.evaluate(() => G.target),
    otherId,
    'rock selection does not commandeer combat target',
  );
  await page.waitForFunction(
    (id) => G.miningRocks.rocks.find((r) => r.id === id)?.heat >= 65,
    rock.id,
  );
  await page.waitForFunction((id) => G.miningRocks.rocks.find((r) => r.id === id)?.ready, rock.id);
  // Release before DOM/screenshot evidence: capture latency must not keep the beam firing.
  await page.mouse.up();
  assert.match(await page.locator('#miningmeter').textContent(), /READY/);
  await page.screenshot({
    path: path.join(f.out, 'clean-release-after-mouseup-hidpi.png'),
    animations: 'disabled',
  });
  await until(
    () => f.read()?.rocks.rocks.find((r) => r.id === rock.id)?.lastCut === 'clean',
    'actual mouse aim clean release',
  );
  // Real steering flies into the parcel cloud, accepting exactly the one free tonne.
  await page.keyboard.down('w');
  await until(
    () => f.read()?.pilots.find((p) => p.name === 'Mining Alpha')?.cargo?.ore === 1,
    'capacity-limited real pickup',
  );
  await page.keyboard.up('w');
  await page.keyboard.down('q');
  await page.waitForTimeout(1000);
  await page.keyboard.up('q');
  const state = f.read(),
    pilot = state.pilots.find((p) => p.name === 'Mining Alpha'),
    lots = pilot.cargoLots.byCommodity.ore;
  assert.equal(lots.common + lots.rich + lots.pure, 1);
  assert.ok(
    state.parcels.some(
      (p) => p.it.generationKey === state.rocks.rocks.find((r) => r.id === rock.id)?.key,
    ) || state.parcels.length > 0,
    'floating remainder remains',
  );
  assert.ok(pilot.cargo.food > 0);
  assert.equal(pilot.cargo.ore, 1);
  await page.screenshot({
    path: path.join(f.out, 'partial-hold-pickup.png'),
    animations: 'disabled',
  });
  // Gas selected through the same separate channel: readable vent/pressure label.
  const gas = await page.evaluate(() => G.miningRocks.rocks.find((r) => r.gas));
  assert.ok(gas);
  await page.evaluate((id) => {
    G.miningTarget = id;
  }, gas.id);
  await page.waitForFunction(() =>
    document.querySelector('#miningmeter').textContent.includes('Gas pressure'),
  );
  for (const scale of [0.8, 1, 1.4]) {
    await page.keyboard.press('o');
    await page.locator('#opt-scale').evaluate((input, v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, scale);
    await page.locator('#optclose').click();
    await page.screenshot({
      path: path.join(f.out, `gas-vent-scale-${scale}.png`),
      animations: 'disabled',
    });
    const box = await page.locator('#miningcontrols').boundingBox();
    assert.ok(box.width > 200 && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1501);
  }
  assert.equal(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Real browser mouse-aim→authoritative ready/clean release→one-tonne partial pickup, separate combat/mining selection, gas vent, scales0.8/1/1.4 and2xDPI/reduced-motion passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  other?.close();
  await f.close(browser);
}
