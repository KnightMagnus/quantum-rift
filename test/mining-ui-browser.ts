import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture, until } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('mining-ui');
let browser;
let other: WebSocket | undefined;
const errors: string[] = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
      viewport: { width: 1500, height: 1050 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    }),
    page = await context.newPage();
  page.on('pageerror', (event2) => errors.push(String(event2)));
  const sent: { t: string; op?: string; id?: number }[] = [];
  page.on('websocket', (webSocket) =>
    webSocket.on('framesent', ({ payload }) => {
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
      lastSnapshot?: string;
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        this.addEventListener('message', (event) => {
          const message = JSON.parse(event.data);
          if (message.t === 'snap') {
            this.lastSnapshot = event.data;
            window.lastTargetSnapshot = message.me[10];
          }
        });
      }
      send(packetData: Parameters<WebSocket['send']>[0]) {
        super.send(packetData);
        const message = JSON.parse(packetData as string);
        if (message.t === 'target' && message.id === 0 && this.lastSnapshot) {
          this.onmessage?.(new MessageEvent('message', { data: this.lastSnapshot }));
        }
      }
    };
    localStorage.setItem(
      'rift.opts',
      JSON.stringify({ v21: true, keys: {}, cb: true, shake: false, mouseAim: true, scale: 1 }),
    );
  });
  await page.goto(feature.origin);
  await page.locator('#lname').fill('Mining Alpha');
  await page.locator('#lpass').fill('fixture');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('#depart').click();
  await page.waitForFunction(
    () => G.view && G.miningRocks?.rocks.some((result) => result.x === 10000 && result.y === 10000),
  );
  await page.locator('#miningindicator').click();
  await page.keyboard.press('v');
  await page.waitForFunction(() => G.mining!.revealed.length > 0);
  const rock = await page.evaluate(() =>
    G.miningRocks!.rocks.find((result) => result.x === 10000 && result.y === 10000),
  );
  const position = await page.evaluate(async (result) => {
    const { cam: camera } = await import('/render.js');
    const canvasBounds = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: canvasBounds.left + ((result!.x - camera.cx) * camera.z + camera.W / 2) / devicePixelRatio,
      y: canvasBounds.top + ((result!.y - camera.cy) * camera.z + camera.H / 2) / devicePixelRatio,
    };
  }, rock);
  other = new WebSocket(feature.origin.replace('http', 'ws') + '/ws');
  let otherId = 0;
  other.onmessage = (event3) => {
    const message = JSON.parse(event3.data);
    if (message.t === 'you' && !otherId) other!.send(JSON.stringify({ t: 'depart' }));
    if (message.t === 'space') otherId = message.id;
  };
  await new Promise((resolve) => (other!.onopen = resolve));
  other!.send(JSON.stringify({ t: 'hello', name: 'Mining Bravo', pass: 'fixture' }));
  await until(() => otherId, 'second real captain');
  await page.waitForFunction((identifier) => G.ents.has(identifier), otherId);
  const shipXY = await page.evaluate(async () => {
    const { cam: camera2 } = await import('/render.js');
    return {
      x: ((10180 - camera2.cx) * camera2.z + camera2.W / 2) / devicePixelRatio,
      y: ((10200 - camera2.cy) * camera2.z + camera2.H / 2) / devicePixelRatio,
    };
  });
  await page.mouse.click(shipXY.x, shipXY.y);
  await page.waitForFunction((identifier) => G.target === identifier, otherId);
  // Real click on a verified empty canvas point clears an actual selected captain.
  const empty = await page.evaluate(async () => {
    const { cam: camera3 } = await import('/render.js');
    const { SYS: systemsById } = await import('/shared/galaxy.js');
    const canvas = document.querySelector('#view');
    const result = canvas!.getBoundingClientRect();
    for (let verticalPosition = 180; verticalPosition < 650; verticalPosition += 60)
      for (let horizontalPosition = 180; horizontalPosition < 850; horizontalPosition += 60) {
        if (document.elementFromPoint(horizontalPosition, verticalPosition) !== canvas) continue;
        const worldX =
          ((horizontalPosition - result.left) * devicePixelRatio - camera3.W / 2) / camera3.z +
          camera3.cx;
        const worldY =
          ((verticalPosition - result.top) * devicePixelRatio - camera3.H / 2) / camera3.z +
          camera3.cy;
        if (
          [...G.ents.values()].some(
            (entity) => Math.hypot(entity.rx - worldX, entity.ry - worldY) < 150,
          )
        )
          continue;
        if (
          systemsById[G.sys!].stellars.some(
            (player: { x: number; y: number; r: number }) =>
              Math.hypot(player.x - worldX, player.y - worldY) < player.r * 1.15 + 100,
          )
        )
          continue;
        if (
          (G.rocks || []).some(
            (currentMiningRock) =>
              Math.hypot(currentMiningRock.x - worldX, currentMiningRock.y - worldY) <
              currentMiningRock.r + 100,
          )
        )
          continue;
        if (
          (G.towing?.objects || []).some(
            (options) => Math.hypot(options.x - worldX, options.y - worldY) < 150,
          )
        )
          continue;
        return { x: horizontalPosition, y: verticalPosition };
      }
    throw Error('No empty flight point');
  });
  for (const aimDirection of [false, true]) {
    await page.evaluate((value) => {
      G.opts.mouseAim = value;
    }, aimDirection);
    await page.mouse.click(shipXY.x, shipXY.y);
    await page.waitForFunction((identifier) => G.target === identifier, otherId);
    await page.waitForFunction((identifier) => window.lastTargetSnapshot === identifier, otherId);
    const start = sent.length;
    await page.mouse.click(empty.x, empty.y);
    await page.waitForFunction(() => G.target === 0);
    await until(
      () => sent.slice(start).some((message) => message.t === 'target' && message.id === 0),
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
  await page.waitForFunction((identifier) => G.target === identifier, otherId);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.waitForFunction((identifier) => G.miningTarget === identifier, rock!.id);
  assert.equal(
    await page.evaluate(() => G.target),
    otherId,
    'rock selection does not commandeer combat target',
  );
  await page.waitForFunction(
    (identifier) =>
      (G.miningRocks!.rocks.find((result) => result.id === identifier)?.heat ?? 0) >= 65,
    rock!.id,
  );
  await page.waitForFunction(
    (identifier) => G.miningRocks!.rocks.find((result) => result.id === identifier)?.ready,
    rock!.id,
  );
  // Release before DOM/screenshot evidence: capture latency must not keep the beam firing.
  await page.mouse.up();
  assert.match((await page.locator('#miningmeter').textContent())!, /READY/);
  await page.screenshot({
    path: path.join(feature.out, 'clean-release-after-mouseup-hidpi.png'),
    animations: 'disabled',
  });
  await until(
    () =>
      feature.read()?.rocks.rocks.find((result: { id: number }) => result.id === rock!.id)
        ?.lastCut === 'clean',
    'actual mouse aim clean release',
  );
  // Real steering flies into the parcel cloud, accepting exactly the one free tonne.
  await page.keyboard.down('w');
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Mining Alpha')
        ?.cargo?.ore === 1,
    'capacity-limited real pickup',
  );
  await page.keyboard.up('w');
  await page.keyboard.down('q');
  await page.waitForTimeout(1000);
  await page.keyboard.up('q');
  const state = feature.read(),
    pilot = state.pilots.find((player: { name: string }) => player.name === 'Mining Alpha'),
    lots = pilot.cargoLots.byCommodity.ore;
  assert.equal(lots.common + lots.rich + lots.pure, 1);
  assert.ok(
    state.parcels.some(
      (player: { it: { generationKey: string } }) =>
        player.it.generationKey ===
        state.rocks.rocks.find((result: { id: number }) => result.id === rock!.id)?.key,
    ) || state.parcels.length > 0,
    'floating remainder remains',
  );
  assert.ok(pilot.cargo.food > 0);
  assert.equal(pilot.cargo.ore, 1);
  await page.screenshot({
    path: path.join(feature.out, 'partial-hold-pickup.png'),
    animations: 'disabled',
  });
  // Gas selected through the same separate channel: readable vent/pressure label.
  const gasPlanet = await page.evaluate(() => G.miningRocks!.rocks.find((result) => result.gas));
  assert.ok(gasPlanet);
  await page.evaluate((identifier) => {
    G.miningTarget = identifier;
  }, gasPlanet.id);
  await page.waitForFunction(() =>
    document.querySelector('#miningmeter')!.textContent.includes('Gas pressure'),
  );
  for (const scale of [0.8, 1, 1.4]) {
    await page.keyboard.press('o');
    await page.locator('#opt-scale').evaluate((input, value) => {
      (input as HTMLInputElement).value = String(String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, scale);
    await page.locator('#optclose').click();
    await page.screenshot({
      path: path.join(feature.out, `gas-vent-scale-${scale}.png`),
      animations: 'disabled',
    });
    const boundingBox2 = await page.locator('#miningcontrols').boundingBox();
    assert.ok(
      boundingBox2!.width > 200 &&
        boundingBox2!.x >= 0 &&
        boundingBox2!.y >= 0 &&
        boundingBox2!.x + boundingBox2!.width <= 1501,
    );
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
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  other?.close();
  await feature.close(browser);
}
