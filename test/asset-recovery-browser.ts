import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const output = evidenceDir('asset-recovery');
const directory = tempDataDir('rift-asset-recovery-');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
const database = new Database(path.join(directory, 'data'));
const player = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']> & {
  story: { done: string[]; active: null; step: number };
};
player.tut = 999;
player.credits = 654321;
player.story = { done: ['start'], active: null, step: 0 };
database.create('Asset Recovery', 'fixture', player);
database.flush();
const hull = player.ship.hull;
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
const log = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({
    headless: true,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.addInitScript(() => {
    window.fixtureInputs = [];
    const original = Reflect.get(WebSocket.prototype, 'send') as typeof WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        const packet = JSON.parse(data as string);
        if (packet.t === 'input') window.fixtureInputs.push(packet);
        if (window.fixtureInputs.length > 300) window.fixtureInputs.shift();
      } catch {}
      return original.call(this, data);
    };
  });
  await page.route(`**/assets/ships/${hull}.*`, (route) =>
    route.fulfill({ status: 404, body: 'Missing fixture image' }),
  );
  const loadingStarted = Date.now();
  await page.goto(`${origin}/?renderer=webgl`);
  await page.waitForFunction(() => window.RiftAudio.debug().music);
  const loginAudioReadyMs = Date.now() - loadingStarted;

  const audio = await page.evaluate(async () => {
    const module = await import('/audio.js');
    const before = module.audioResourceUsage();
    const timeline = module.loginMusicTimeline();
    module.setAudioResourceBudget(0);
    await new Promise((resolve) => setTimeout(resolve, 2300));
    const evicted = module.audioResourceUsage();
    const playing = module.loginMusicTimeline();
    module.setAudioResourceBudget(64 * 1024 * 1024);
    return {
      before,
      evicted,
      activeSurvived: playing.playing && playing.position > timeline.position,
    };
  });
  assert.ok(audio.before.bytes > 0);
  assert.equal(audio.evicted.bytes, 0, 'Idle cache ownership can be released while music plays');
  assert.ok(audio.evicted.activeBytes > 0 && audio.evicted.totalBytes >= audio.evicted.activeBytes);
  assert.equal(audio.activeSurvived, true, 'Eviction never stops a live AudioBufferSourceNode');
  const musicCleanup = await page.evaluate(async () => {
    const audio = await import('/audio.js');
    const until = async (test: () => boolean) => {
      const deadline = performance.now() + 10000;
      while (!test()) {
        if (performance.now() > deadline) throw Error('Music sources did not settle');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    audio.stopMusic(0);
    await until(() => audio.audioResourceUsage().activeSources === 0);
    for (let index = 0; index < 3; index++) {
      audio.startMusic();
      await until(() => audio.debug().music && audio.audioResourceUsage().activeSources === 1);
      audio.stopMusic(0);
      await until(() => audio.audioResourceUsage().activeSources === 0);
    }
    const stopped = audio.audioResourceUsage();
    audio.startMusic();
    await until(() => audio.debug().music && audio.audioResourceUsage().activeSources === 1);
    return { stopped, resumed: audio.audioResourceUsage() };
  });
  assert.equal(
    musicCleanup.stopped.activeBytes,
    0,
    'Stopped loops release all active source ownership',
  );
  assert.equal(
    musicCleanup.resumed.activeSources,
    1,
    'Repeated restarts do not accumulate live music sources',
  );
  await page.route('**/assets/sounds/10100.wav', (route) =>
    route.fulfill({ status: 200, body: 'Corrupt audio' }),
  );
  const audioFailures = await page.evaluate(async () => {
    const audio = await import('/audio.js');
    audio.preload([10100, 'missing_recovery_fixture']);
    const deadline = performance.now() + 10000;
    while (audio.audioResourceUsage().pending && performance.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    audio.preload([10100, 'missing_recovery_fixture']);
    return audio.audioResourceUsage().pending;
  });
  assert.equal(
    audioFailures,
    0,
    'Failed and corrupt decodes release pending promises and use retry backoff',
  );

  await page.locator('[data-slot="Asset Recovery"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.locator('#depart').click();
  await page.waitForFunction(
    () => G.view && !G.landed && window.RiftEngine.scene.display.fallbackShips.has(G.myId),
  );
  const identity = await page.evaluate(() => ({
    id: G.myId,
    credits: G.you!.credits,
    hull: G.myHull,
  }));
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  for (let iteration = 1; iteration <= 2; iteration++) {
    await page.evaluate((iteration) => {
      window.fixtureInputs = [];
      const canvas = document.getElementById('view') as HTMLCanvasElement;
      const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (!extension) throw Error('This Chromium fixture must expose actual WebGL context loss');
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), iteration === 1 ? 1600 : 250);
    }, iteration);
    await page.waitForFunction(
      () =>
        window.RiftEngine.recovering &&
        window.fixtureInputs.some((packet) => !packet.th && !packet.tu && !packet.f1 && !packet.f2),
    );
    if (iteration === 1)
      await page.locator('.graphics-recovery-notice').waitFor({ state: 'visible' });
    await page.waitForFunction(
      (expected) => window.RiftEngine.recoveries === expected && !window.RiftEngine.recovering,
      iteration,
    );
    await page.waitForFunction(() => window.RiftEngine.scene.display.fallbackShips.has(G.myId));
    assert.equal(
      await page.locator('.graphics-recovery-notice').count(),
      0,
      'Recovery notice disappears after rendering resumes',
    );
    const restored = await page.evaluate(async () => {
      const image = await window.RiftEngine.engine.screenshot();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const actor = window.RiftEngine.scene.display.actors.get('ship:' + G.myId)!;
      const center = window.RiftEngine.engine.screen.worldToScreenCoordinates(actor.pos);
      const shipPixels = context.getImageData(
        Math.round(center.x) - 4,
        Math.round(center.y) - 4,
        9,
        9,
      ).data;
      let visibleShip = 0;
      for (let index = 0; index < shipPixels.length; index += 4)
        if (shipPixels[index] + shipPixels[index + 1] + shipPixels[index + 2] > 120) visibleShip++;
      let lit = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 60) lit++;
      return {
        id: G.myId,
        credits: G.you!.credits,
        hull: G.myHull,
        updates: window.RiftEngine.scene.updates,
        lit,
        visibleShip,
      };
    });
    assert.equal(restored.id, identity.id, 'Restoration does not reconnect or replace authority');
    assert.equal(restored.credits, identity.credits);
    assert.equal(restored.hull, identity.hull);
    assert.ok(restored.visibleShip > 10, 'The missing-sheet ship itself remains visibly drawn');
    assert.ok(
      restored.updates > 0 && restored.lit > 100,
      'Fresh display really draws nonblack pixels',
    );
    // Observe only post-restoration packets, not commands already sent before the loss event.
    await page.evaluate(() => {
      window.fixtureInputs = [];
    });
    // Repeated native keydown models autorepeat while the physical key remains held.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(150);
    assert.ok(
      await page.evaluate(
        () => window.fixtureInputs.length > 0 && window.fixtureInputs.every((packet) => !packet.th),
      ),
      'Held controls remain neutral through restoration',
    );
  }
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => {
    window.fixtureInputs = [];
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.keyboard.up('ArrowUp');

  // A release during the stopped clock must count: one fresh press after recovery works.
  await page.evaluate(() => {
    window.fixtureInputs = [];
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.evaluate(() => {
    const extension = (document.getElementById('view') as HTMLCanvasElement)
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 700);
  });
  await page.waitForFunction(() => window.RiftEngine.recovering);
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction(
    () => window.RiftEngine.recoveries === 3 && !window.RiftEngine.recovering,
  );
  await page.evaluate(() => {
    window.fixtureInputs = [];
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.keyboard.up('ArrowUp');

  // A new physical press while the screen is lost must remain blocked until its release.
  await page.evaluate(() => {
    const extension = (document.getElementById('view') as HTMLCanvasElement)
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 700);
  });
  await page.waitForFunction(() => window.RiftEngine.recovering);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(
    () => window.RiftEngine.recoveries === 4 && !window.RiftEngine.recovering,
  );
  await page.evaluate(() => {
    window.fixtureInputs = [];
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(
      () => window.fixtureInputs.length > 0 && window.fixtureInputs.every((packet) => !packet.th),
    ),
    'A key pressed during loss must release before flight resumes',
  );
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => {
    window.fixtureInputs = [];
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.fixtureInputs.some((packet) => packet.th === 1));
  await page.keyboard.up('ArrowUp');
  const flightAudio = await page.evaluate(async () =>
    (await import('/audio.js')).audioResourceUsage(),
  );
  assert.ok(
    flightAudio.activeSources <= 4,
    'Repeated renderer replacement does not accumulate ambience loops',
  );

  const view = await page.locator('#view').boundingBox();
  await page.mouse.move(view!.x + view!.width / 2, view!.y + view!.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(view!.x + view!.width / 2 + 30, view!.y + view!.height / 2 + 20);
  await page.waitForFunction(() => !!G._look && !!G._lookT);
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => !G._look);

  const images = await page.evaluate(async () => {
    const resources = await import('/asset-resources.js');
    // Isolate the eviction working set from unrelated live NPC sheets; the server keeps running.
    window.RiftEngine.engine.clock.stop();
    resources.setImageResourceBudgets(Infinity, Infinity);
    const paths = [704, 705, 706, 707, 708, 709]
      .filter((id) => G.A!.ships[id])
      .map((id) => `ships/${id}.${G.A!.ships[id].spr ? 'webp' : 'png'}`);
    const loadingStarted = performance.now();
    const loaded = await Promise.all(
      paths.map(async (path) => {
        const image = resources.assetImage(path);
        await image.decode();
        return image;
      }),
    );
    const tourLoadMs = performance.now() - loadingStarted;
    const before = resources.imageResourceUsage();
    resources.setImageResourceBudgets(1, 64 * 1024 * 1024);
    const liveTimer = setInterval(() => resources.assetImage(paths[0]), 50);
    await new Promise((resolve) => setTimeout(resolve, 2300));
    clearInterval(liveTimer);
    const after = resources.imageResourceUsage();
    const liveKept = resources.assetImage(paths[0]) === loaded[0];
    const idleNotMutated = loaded.slice(1).every((image) => image.naturalWidth > 0);
    const rebuilt = resources.assetImage(paths[1]) !== loaded[1];
    resources.setImageResourceBudgets(256 * 1024 * 1024, 64 * 1024 * 1024);
    window.RiftEngine.engine.clock.start();
    return {
      before,
      after,
      tourLoadMs,
      liveKept,
      idleNotMutated,
      rebuilt,
      liveBytes: loaded[0].naturalWidth * loaded[0].naturalHeight * 4,
    };
  });
  assert.ok(images.before.ships.bytes > images.after.ships.bytes);
  assert.ok(
    images.after.ships.bytes <= images.liveBytes,
    'Only the protected live working set may exceed the tiny measurement budget',
  );
  assert.equal(images.liveKept && images.idleNotMutated && images.rebuilt, true);

  // Corrupt successful responses need the same visible fallback as a missing file.
  await page.unroute(`**/assets/ships/${hull}.*`);
  await page.route(`**/assets/ships/${hull}.*`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/webp', body: 'Corrupt image' }),
  );
  await page.evaluate(() => {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('.graphics-recovery-notice button').click(),
  ]);
  await page.locator('[data-slot="Asset Recovery"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  await page.locator('#depart').click();
  await page.waitForFunction(() => window.RiftEngine.scene.display.fallbackShips.has(G.myId));
  assert.equal(
    await page.evaluate(() => G.you!.credits),
    identity.credits,
    'Manual reload recovery retains saved progress',
  );
  assert.ok(warnings.some((entry) => entry.includes('missing or corrupt image')));
  assert.ok(warnings.some((entry) => entry.includes('missing or corrupt audio')));
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        loginAudioReadyMs,
        audio,
        musicCleanup,
        flightAudio,
        images,
        recoveries: 4,
        missingAndCorruptFallback: true,
        manualReloadRecovery: true,
        errors,
        limits:
          'Chromium software WebGL and Canvas-backed images; not process/GPU memory, physical-device coverage or audible playback quality.',
      },
      null,
      2,
    ),
  );
  console.log(
    'Assets: bounded decoded caches, live-resource safety, missing/corrupt fallbacks and repeated real graphics restoration pass.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
