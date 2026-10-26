import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import type { GraphicsGroup, GraphicsGrouping, Sprite } from 'excalibur';
import { DB as Database } from '../server/db.ts';
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
for (const solo of [false, true]) {
  const output = evidenceDir('landed-live-' + (solo ? 'solo' : 'online'));
  const directory = tempDataDir('rift-landed-live-'),
    data = path.join(directory, 'data');
  const assets = augmentAssets(
    JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString()),
  );
  const database = new Database(data),
    playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
      import('../server/game.ts').Game['fresh']
    > & { story?: { done: string[]; active: null; step: number } };
  playerData.tut = 999;
  playerData.story = { done: ['start'], active: null, step: 0 };
  database.create('Dock Observer', 'fixture', playerData);
  database.flush();
  const port = await availablePort(),
    origin = 'http://127.0.0.1:' + port;
  const server = spawn(
    process.execPath,
    [
      '--import',
      './test/seed-random.ts',
      '--import',
      './test/fixtures/landed-live-preload.ts',
      'server/local-main.ts',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        SOLO: solo ? '1' : '',
        PORT: String(port),
        DATA_DIR: data,
        SEEDS_FILE: '/nonexistent',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  let browser;
  try {
    await ready(server, origin);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors: string[] = [],
      sent: { t: string; [entryKey: string]: unknown }[] = [],
      scenes: { t: string; [entryKey2: string]: unknown }[] = [];
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('websocket', (webSocket) => {
      webSocket.on('framesent', (feature) => sent.push(JSON.parse(String(feature.payload))));
      webSocket.on('framereceived', (feature2) => {
        const message = JSON.parse(String(feature2.payload));
        if (message.t === 'scene') scenes.push(message);
      });
    });
    await page.addInitScript(() => {
      window.trafficDraws = [];
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector<HTMLElement>('#lver')!.textContent);
    await page.waitForFunction(() => !!window.RiftEngine);
    await page.evaluate(() => {
      const runtime = window.RiftEngine,
        observed = new WeakSet();
      runtime.engine.on('postupdate', () => {
        for (const [key, actor] of runtime.scene.display.actors) {
          if (!key.startsWith('ship:') || observed.has(actor)) continue;
          observed.add(actor);
          actor.graphics.onPostDraw = () => {
            const group = actor.graphics.current as GraphicsGroup;
            const sprite = (group.members[0] as GraphicsGrouping).graphic as Sprite;
            const position = runtime.engine.screen.worldToScreenCoordinates(actor.pos);
            window.trafficDraws.push({
              src: sprite.image.path,
              x: position.x,
              y: position.y,
              t: performance.now(),
            });
            if (window.trafficDraws.length > 2000) window.trafficDraws.shift();
          };
        }
      });
    });
    await page.fill('#lname', 'Dock Observer');
    if (!solo) await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.landed && G.ents.size > 0);
    for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    const sample = () =>
      page.evaluate(async () => {
        const image = await window.RiftEngine.engine.screenshot(true);
        const capture = document.createElement('canvas');
        capture.width = image.width;
        capture.height = image.height;
        const context = capture.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return {
          view: G.view,
          stellar: G.landed?.stellar,
          ships: [...G.ents.values()].map((entity) => ({
            id: entity.id,
            x: entity.x,
            y: entity.y,
            rx: entity.rx,
            ry: entity.ry,
          })),
          draws: window.trafficDraws.filter((drawRecord) => drawRecord.t > performance.now() - 200),
          pixels: Array.from(context.getImageData(0, 0, capture.width, capture.height).data).filter(
            (value, index) => index % 4 !== 3 && value > 20,
          ).length,
        };
      });
    const camera = await page.evaluate(async () => {
      const { cam: camera2 } = await import('/render.js');
      const { STELLARS } = await import('/shared/galaxy.js');
      const player = STELLARS[G.landed!.stellar];
      return { x: camera2.cx, y: camera2.cy, px: player.x, py: player.y };
    });
    assert.equal(camera.x, camera.px);
    assert.equal(camera.y, camera.py);
    const proof = [];
    for (const tabName of ['overview', 'trade', 'outfit']) {
      const button = page.locator('[data-lt="' + tabName + '"]');
      assert.equal(await button.count(), 1);
      await button.click();
      await page.waitForTimeout(350);
      const firstCaptain = await sample();
      assert.equal(firstCaptain.view, null);
      assert.ok(firstCaptain.pixels > 5000, 'real world canvas is not black');
      await page.screenshot({ path: path.join(output, tabName + '-a.png') });
      await page.waitForTimeout(1200);
      const secondCaptain = await sample();
      assert.equal(firstCaptain.stellar, secondCaptain.stellar);
      assert.equal(secondCaptain.view, null);
      const moved = secondCaptain.ships.filter((entity) =>
        firstCaptain.ships.some(
          (player) =>
            player.id === entity.id &&
            Math.hypot(player.x - entity.x, player.y - entity.y) > 3 &&
            Math.hypot(player.rx - entity.rx, player.ry - entity.ry) > 3,
        ),
      );
      assert.ok(
        moved.length,
        'authoritative traffic and interpolated positions advance while ' + tabName,
      );
      await page.screenshot({ path: path.join(output, tabName + '-b.png') });
      assert.ok(
        firstCaptain.draws.some((player) =>
          secondCaptain.draws.some(
            (pendingSystemIds) =>
              player.src === pendingSystemIds.src &&
              Math.hypot(player.x - pendingSystemIds.x, player.y - pendingSystemIds.y) > 2,
          ),
        ),
        'real ship sprites move on the rendered canvas',
      );
      proof.push({
        tab: tabName,
        a: firstCaptain,
        b: secondCaptain,
        moved: moved.map((entity) => entity.id),
      });
    }
    // The real store selection route updates each crest and keeps purchase gates.
    await page.click('#storesbtn');
    const factionIds = await page
      .locator('#storein [data-act="sfac"]')
      .evaluateAll((elements) => elements.map((entity) => entity.dataset.f));
    const { FACTIONS } = await import('../shared/galaxy.ts');
    assert.deepEqual(factionIds, [await page.evaluate(() => G.landed!.store)]);
    for (const identifier of factionIds) {
      await page.locator('#storein [data-f="' + identifier + '"][data-act="sfac"]').click();
      const image = page.locator('#faction-insignia');
      await image.evaluate((image2) => (image2 as HTMLImageElement).decode());
      assert.equal(await image.getAttribute('data-faction'), identifier);
      assert.equal(await image.getAttribute('alt'), FACTIONS[identifier].name + ' insignia');
      assert.ok(await image.evaluate((image3) => (image3 as HTMLImageElement).naturalWidth > 0));
      const source = await (await fetch(origin + '/assets/factions/' + identifier + '.svg')).text();
      assert.ok(
        source.includes(FACTIONS[identifier].color),
        'canonical faction menu color in original image',
      );
      const menuColor = await page
        .locator('#storein .sfac.on b')
        .evaluate((element) => getComputedStyle(element).color);
      const color = FACTIONS[identifier].color;
      assert.equal(
        menuColor,
        'rgb(' +
          [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(', ') +
          ')',
      );
      const inputBox = await image.boundingBox(),
        heading = await page.locator('.store-heading h2').boundingBox();
      assert.ok(
        inputBox!.x + inputBox!.width <= heading!.x,
        'insignia top-left, no heading overlap',
      );
      assert.equal(
        await page.locator('#storein [data-act="buystore"]:not([disabled])').count(),
        0,
        'unearned purchases stay gated',
      );
      if (!solo)
        await page.screenshot({ path: path.join(output, 'faction-' + identifier + '.png') });
    }
    await page.setViewportSize({ width: 640, height: 480 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ui', '1.4');
      document.body.classList.add('scaled');
    });
    await page.locator('#faction-insignia').scrollIntoViewIfNeeded();
    const small = await page.locator('#faction-insignia').boundingBox();
    assert.ok(
      small!.x >= 0 &&
        small!.x + small!.width <= 640 &&
        small!.y >= 0 &&
        small!.y + small!.height <= 480,
    );
    await page.locator('#storein [data-act="sclose"]').click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ui', '1');
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
      sent.slice(before).filter((message) => message.t === 'input').length,
      0,
      'landed keys cannot send flight inputs',
    );
    assert.ok(scenes.length > 10);
    assert.ok(
      scenes.every((message) => !message.me),
      'observers never receive a player entity',
    );
    if (solo) {
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => G.paused);
      await page.waitForTimeout(500);
      const firstTrafficSample = await sample(),
        quantity = scenes.length;
      await page.waitForTimeout(700);
      const secondTrafficSample = await sample();
      assert.deepEqual(
        secondTrafficSample.ships.map((entity) => [entity.id, entity.x, entity.y]),
        firstTrafficSample.ships.map((entity) => [entity.id, entity.x, entity.y]),
      );
      assert.equal(scenes.length, quantity);
      assert.deepEqual(
        secondTrafficSample.ships.map((entity) => [entity.id, entity.rx, entity.ry]),
        firstTrafficSample.ships.map((entity) => [entity.id, entity.rx, entity.ry]),
        'Paused rendered traffic is frozen too',
      );
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => !G.paused);
      await page.waitForTimeout(400);
      assert.ok(scenes.length > quantity);
    }
    fileSystem.writeFileSync(
      path.join(output, 'motion-proof.json'),
      JSON.stringify(proof, null, 2),
    );
    assert.deepEqual(errors, []);
    console.log('PASS live landed ' + (solo ? 'solo' : 'online'));
  } catch (error) {
    await failureEvidence(browser, output, error);
    throw error;
  } finally {
    await cleanup(server, browser, serverLog, directory);
  }
}
