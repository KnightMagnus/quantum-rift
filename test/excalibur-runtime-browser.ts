// Actual production Engine, native entities, physical-pixel camera and input/lifecycle boundaries.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import type { GraphicsGroup, GraphicsGrouping, Sprite } from 'excalibur';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, DT } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const output = evidenceDir('excalibur-runtime');
const directory = tempDataDir('rift-engine-');
const assets = augmentAssets(
  JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
);
const database = new DB(path.join(directory, 'data'));
const captain = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']> & {
  story: { done: string[]; active: null; step: number };
};
captain.tut = 999;
captain.story = { done: ['start'], active: null, step: 0 };
database.create('Engine Pilot', 'fixture', captain);
database.flush();
const port = await availablePort(),
  origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['--import', './test/seed-random.ts', 'server/main.ts'], {
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
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [ratio, renderer] of [
    [1, 'webgl'],
    [2, 'webgl'],
    [1, 'canvas'],
    [2, 'auto'],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: ratio,
    });
    await context.grantPermissions(['local-network-access'], { origin });
    const page = await context.newPage(),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error('pageerror:', error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('console:', message.text());
    });
    page.on('requestfailed', (request) =>
      console.error('requestfailed:', request.url(), request.failure()?.errorText),
    );
    page.on('request', (request) => requests.push(request.url()));
    // No unsafe-eval and no remote engine scripts. Blob images support locally rasterized native Sprites.
    await page.route(
      (url) => url.origin === origin && url.pathname === '/',
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            'Content-Security-Policy': "script-src 'self'; object-src 'none'",
          },
        });
      },
    );
    await page.addInitScript(() => {
      window.fixtureInputs = [];
      const send = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        const message = JSON.parse(data as string);
        if (message.t === 'input') window.fixtureInputs.push(message);
        return send.call(this, data);
      };
    });
    await page.goto(origin + (renderer === 'auto' ? '/' : '/?renderer=' + renderer));
    await page.waitForFunction(
      () => document.querySelector<HTMLCanvasElement>('#view')?.dataset.engine,
    );
    assert.equal(
      await page.locator('#excalibur-play').count(),
      0,
      'no additional mandatory Play action',
    );
    await page.locator('[data-slot="Engine Pilot"]').click();
    await page.waitForFunction(() => G.you && G.landed);
    await page.locator('#depart').click();
    await page.waitForFunction(
      () => G.view && !G.landed && window.RiftEngine.scene.display.actors.has('ship:' + G.myId),
    );
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const native = await page.evaluate(() => {
      const runtime = window.RiftEngine,
        ship = runtime.scene.display.actors.get('ship:' + G.myId)!;
      const group = ship.graphics.current as GraphicsGroup;
      const hullSprite = (group.members[0] as GraphicsGrouping).graphic as Sprite;
      return {
        scene: runtime.engine.currentScene === runtime.scene,
        physics: runtime.engine.physics.enabled,
        velocity: [ship.vel.x, ship.vel.y],
        rotation: ship.rotation,
        graphic: ship.graphics.current?.constructor.name,
        source: hullSprite.sourceView,
        expectedFrame: (() => {
          const hull = G.A!.ships[G.myHull],
            columns = hull.spr?.cols || 6,
            size = hull.spr?.fs || hull.size;
          const entity = G.ents.get(G.myId)!;
          const bank = (entity as typeof entity & { _bank?: { bank: number } })._bank?.bank || 0;
          const frame = (((Math.round(entity.a / (Math.PI / 18)) % 36) + 36) % 36) + bank * 36;
          return { x: (frame % columns) * size, y: Math.floor(frame / columns) * size };
        })(),
        renderer: runtime.engine.graphicsContext.constructor.name,
        selectedBackend: runtime.engine.canvas.dataset.renderer,
      };
    });
    assert.equal(native.scene, true);
    assert.equal(native.physics, false);
    assert.deepEqual(native.velocity, [0, 0]);
    assert.equal(native.rotation, 0, 'heading atlas must not be double-rotated');
    assert.match(native.graphic!, /GraphicsGroup/);
    assert.equal(native.source?.x, native.expectedFrame.x);
    assert.equal(native.source?.y, native.expectedFrame.y);
    assert.match(
      native.renderer,
      (renderer === 'auto' ? native.selectedBackend : renderer) === 'canvas' ? /Canvas/ : /WebGL/,
    );

    // Independent camera expectation, DPR and zoom extremes, plus actual canvas backing size.
    for (const zoom of [0.35, 1, 2]) {
      await page.evaluate((zoom) => {
        G.zoom = zoom;
      }, zoom);
      await page.waitForTimeout(80);
      const projection = await page.evaluate(() => {
        const runtime = window.RiftEngine,
          canvas = document.querySelector<HTMLCanvasElement>('#view')!,
          bounds = canvas.getBoundingClientRect();
        const point = runtime.worldPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        const right = runtime.worldPoint(
          bounds.left + bounds.width / 2 + 40,
          bounds.top + bounds.height / 2,
        );
        return {
          center: point,
          expected: [G.view!.rx + (G.lookX || 0), G.view!.ry + (G.lookY || 0)],
          delta: right[0] - point[0],
          width: canvas.width,
          cssWidth: bounds.width,
        };
      });
      assert.ok(
        Math.hypot(
          projection.center[0] - projection.expected[0],
          projection.center[1] - projection.expected[1],
        ) < 3,
        'camera centers predicted ship',
      );
      assert.ok(Math.abs(projection.delta - (40 * ratio) / zoom) < 0.01);
      assert.ok(Math.abs(projection.width - projection.cssWidth * ratio) <= 1);
    }
    await page.evaluate(() => {
      G.zoom = 1;
      window.fixtureInputs = [];
    });
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.fixtureInputs.some((input) => input.th === 1));
    await page.keyboard.up('w');
    await page.waitForFunction(() =>
      window.fixtureInputs.slice(-2).every((input) => input.th === 0),
    );
    const cadence = await page.evaluate(() =>
      window.fixtureInputs.map((input) => Number(input.seq)),
    );
    assert.ok(cadence.length >= 3);
    assert.ok(
      cadence.every((sequence, index) => index === 0 || sequence === cadence[index - 1] + 1),
      'one sequenced DT input stream',
    );
    assert.ok(DT > 0);
    await page.locator('#chatin').focus();
    await page.keyboard.down('w');
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(() => window.fixtureInputs.slice(-2).some((input) => input.th)),
      false,
      'typing must not steer',
    );
    await page.keyboard.up('w');
    await page.evaluate(() => {
      (document.activeElement as HTMLElement).blur();
      window.fixtureInputs = [];
    });
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.fixtureInputs.some((input) => input.th === 1));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('w');
    await page.waitForFunction(() =>
      window.fixtureInputs.slice(-2).every((input) => input.th === 0),
    );

    // A real down/up while the display clock is stopped survives until exactly one DT tick.
    await page.evaluate(() => {
      window.RiftEngine.engine.stop();
      window.fixtureInputs = [];
    });
    await page.keyboard.press('w');
    await page.evaluate(async () => {
      await window.RiftEngine.engine.start();
    });
    await page.waitForFunction(() => window.fixtureInputs.length >= 3);
    assert.equal(
      await page.evaluate(() => window.fixtureInputs.filter((input) => input.th === 1).length),
      1,
      'short press is consumed once, not lost or repeated across substeps',
    );
    await page.evaluate(() => {
      G.opts.keys.thrust = 'KeyZ';
      window.fixtureInputs = [];
    });
    await page.keyboard.down('z');
    await page.waitForFunction(() => window.fixtureInputs.some((input) => input.th === 1));
    await page.keyboard.up('z');
    await page.waitForFunction(() =>
      window.fixtureInputs.slice(-2).every((input) => input.th === 0),
    );
    await page.evaluate(() => {
      G.opts.keys.thrust = 'KeyW';
    });

    // Uncropped production procedural reference, not another cached native sprite.
    const projectilePixels = await page.evaluate(async () => {
      const runtime = window.RiftEngine,
        scene = runtime.scene,
        engine = runtime.engine;
      const { drawShot } = await import('/render.js');
      const { weaponColor, weaponLook } = await import('/shared/rules.js');
      engine.stop();
      const advance = scene.onPreUpdate.bind(scene);
      scene.onPreUpdate = () => {};
      scene.display.clear();
      const previous = scene.actors.map((actor) => ({ actor, visible: actor.graphics.visible }));
      for (const { actor } of previous) actor.graphics.visible = false;
      const camera = { pos: scene.camera.pos.clone(), zoom: scene.camera.zoom };
      scene.camera.pos.setTo(0, 0);
      scene.camera.zoom = 2;
      const weapon = Object.values(G.A!.weapons).find(
        (weapon) => weaponLook(weapon) === 'bolt' && /^#[0-9a-f]{6}$/i.test(weaponColor(weapon)),
      )!;
      if (!weapon) throw Error('Expected authored colored bolt fixture');
      const results = [];
      try {
        for (const heading of [0, Math.PI / 2, Math.PI / 4]) {
          for (const speeds of [
            [1000, 1600],
            [1600, 1000],
          ]) {
            scene.display.clear();
            const shots = speeds.map((speed, index) => ({
              x: index ? 100 : -100,
              y: 0,
              rx: index ? 100 : -100,
              ry: 0,
              vx: Math.cos(heading) * speed,
              vy: Math.sin(heading) * speed,
              w: weapon.id,
              t: 0,
            }));
            const state = {
              ...G,
              ents: new Map(),
              view: null,
              rocks: [],
              loot: [],
              shots,
              zoom: 2,
            };
            scene.display.update(state, 0);
            await new Promise((resolve) => setTimeout(resolve, 40));
            scene.display.update(state, 0);
            await engine.start();
            await new Promise((resolve) => setTimeout(resolve, 100));
            const image = await engine.screenshot(true);
            engine.stop();
            const capture = document.createElement('canvas');
            capture.width = image.width;
            capture.height = image.height;
            const actual = capture.getContext('2d')!;
            actual.drawImage(image, 0, 0);
            for (const [index, shot] of shots.entries()) {
              const position = scene.camera.pos.clone();
              position.setTo(shot.x, shot.y);
              const point = engine.screen.worldToScreenCoordinates(position);
              const reference = document.createElement('canvas');
              reference.width = reference.height = 256;
              const expected = reference.getContext('2d')!;
              expected.fillStyle = '#000';
              expected.fillRect(0, 0, 256, 256);
              drawShot(
                expected,
                { ...shot, W: weapon, col: weaponColor(weapon), look: weaponLook(weapon) },
                128,
                128,
                2,
                0,
              );
              const wanted = expected.getImageData(0, 0, 256, 256).data;
              const got = actual.getImageData(
                Math.round(point.x) - 128,
                Math.round(point.y) - 128,
                256,
                256,
              ).data;
              let energy = 0,
                error = 0,
                missing = 0,
                excess = 0;
              for (let pixel = 0; pixel < wanted.length; pixel += 4) {
                const brightness = wanted[pixel] + wanted[pixel + 1] + wanted[pixel + 2];
                const present = got[pixel] + got[pixel + 1] + got[pixel + 2];
                energy += brightness;
                error +=
                  Math.abs(wanted[pixel] - got[pixel]) +
                  Math.abs(wanted[pixel + 1] - got[pixel + 1]) +
                  Math.abs(wanted[pixel + 2] - got[pixel + 2]);
                if (brightness >= 12 && present < 3) missing++;
                if (present >= 12 && brightness < 3) excess++;
              }
              results.push({
                heading,
                speed: speeds[index],
                order: speeds.join(','),
                energy,
                error: error / energy,
                missing,
                excess,
              });
            }
          }
        }
      } finally {
        scene.display.clear();
        for (const { actor, visible } of previous) actor.graphics.visible = visible;
        scene.onPreUpdate = advance;
        scene.camera.pos = camera.pos;
        scene.camera.zoom = camera.zoom;
        await engine.start();
      }
      return results;
    });
    fileSystem.writeFileSync(
      path.join(output, 'projectile-pixels-' + renderer + '-dpr' + ratio + '.json'),
      JSON.stringify(projectilePixels, null, 2),
    );
    for (const pixel of projectilePixels) {
      assert.ok(pixel.energy > 1000, 'uncropped reference contains visible authored projectile');
      assert.ok(pixel.error < 0.18, JSON.stringify(pixel));
      assert.ok(
        pixel.excess <= 12,
        'native projectile must not inherit another speed tail: ' + JSON.stringify(pixel),
      );
      assert.ok(
        pixel.missing <= 12,
        'native projectile must retain visible reference tail: ' + JSON.stringify(pixel),
      );
    }

    // Fixture-only entities verify actual registries, Sprite decode and removal, without changing the server.
    const registry = await page.evaluate(async () => {
      const runtime = window.RiftEngine;
      runtime.engine.stop();
      const state = runtime.scene.state;
      const snapshot = {
        ...state,
        ents: new Map(state.ents),
        rocks: [{ id: 987654, x: state.view!.rx, y: state.view!.ry, r: 24, ore: 'ore', hp: 100 }],
        loot: [{ id: 987654, x: state.view!.rx, y: state.view!.ry, kind: 1 }],
        shots: [
          {
            x: 0,
            y: 0,
            rx: 0,
            ry: 0,
            vx: 200,
            vy: 0,
            w: Number(Object.keys(state.A!.weapons)[0]),
            t: performance.now(),
          },
        ],
      };
      runtime.scene.display.update(snapshot, 1000);
      await new Promise((resolve) => setTimeout(resolve, 100));
      runtime.scene.display.update(snapshot, 1000);
      const keys = [...runtime.scene.display.actors.keys()];
      const rock =
        runtime.scene.display.actors.get('rock:987654')?.graphics.current?.constructor.name;
      const loot =
        runtime.scene.display.actors.get('loot:987654')?.graphics.current?.constructor.name;
      const shot = [...runtime.scene.display.actors.entries()].find(([key]) =>
        key.startsWith('shot:'),
      )?.[1].graphics.current?.constructor.name;
      runtime.scene.display.update({ ...snapshot, sys: null }, 1000);
      const remaining = runtime.scene.display.actors.size;
      await runtime.engine.start();
      return { keys, rock, loot, shot, remaining };
    });
    assert.ok(registry.keys.includes('rock:987654'));
    assert.match(registry.rock!, /Sprite/);
    assert.match(registry.loot!, /Sprite/);
    assert.match(registry.shot!, /Sprite/);
    assert.equal(registry.remaining, 0, 'logout/observer registry clears native actors');
    const effectPurity = await page.evaluate(async () => {
      const runtime = window.RiftEngine;
      runtime.engine.stop();
      const { fx, draw, updateEffects } = await import('/render.js');
      fx.length = 0;
      fx.push({ x: 10, y: 20, vx: 30, vy: 40, life: 1, max: 1, smoke: true, r: 3 });
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      const before = JSON.stringify(fx);
      draw(G, context, 300, 200, 0.1, performance.now(), 'foreground');
      draw(G, context, 300, 200, 0.1, performance.now(), 'foreground');
      const afterDraw = JSON.stringify(fx);
      updateEffects({ ...G, ents: new Map(), shots: [] }, 0.1, performance.now());
      const afterUpdate = { life: fx[0].life, x: fx[0].x, y: fx[0].y };
      fx.length = 0;
      await runtime.engine.start();
      return { before, afterDraw, afterUpdate };
    });
    assert.equal(
      effectPurity.before,
      effectPurity.afterDraw,
      'layer rasterization must not advance effects',
    );
    assert.deepEqual(effectPurity.afterUpdate, { life: 0.9, x: 13, y: 24 });
    await page.locator('#chatin').fill('');
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(3500);
    await page.screenshot({
      path: path.join(output, 'flight-' + renderer + '-dpr' + ratio + '.png'),
    });
    await page.setViewportSize({ width: 1050, height: 780 });
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
        return Math.abs(canvas.width - canvas.clientWidth * devicePixelRatio) <= 1;
      }),
      true,
      'engine resize follows responsive cockpit',
    );
    assert.deepEqual(errors, []);
    assert.ok(
      requests.filter((url) => /\.js(?:\?|$)/.test(url)).every((url) => url.startsWith(origin)),
      'offline engine modules are local',
    );
    await context.close();
    console.log('Native Engine/input/camera/lifecycle/CSP:', renderer, 'DPR', ratio, 'PASS');
  }
} catch (error) {
  fileSystem.writeFileSync(
    path.join(output, 'pages.json'),
    JSON.stringify(
      await Promise.all(
        (browser?.contexts() || [])
          .flatMap((context) => context.pages())
          .map(async (page) => ({
            url: page.url(),
            state: await page
              .evaluate(() => ({
                you: !!G.you,
                landed: !!G.landed,
                error: document.getElementById('lerr')?.textContent,
              }))
              .catch(String),
          })),
      ),
      null,
      2,
    ),
  );
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
