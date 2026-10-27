import { launchChromium } from './helpers/chromium.ts';
import { checkPreparedWitness } from './helpers/story-witness.ts';
import { checkStoryReality } from './helpers/story-reality.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STORY } from '../shared/story.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
checkStoryReality();
fileSystem.mkdirSync(path.join(root, '.artifacts'), { recursive: true });
const directory = fileSystem.mkdtempSync(path.join(root, '.artifacts/story-realities-data-'));
const evidence = path.resolve(process.argv[2] || evidenceDir('story-realities'));
fileSystem.mkdirSync(evidence, { recursive: true });
const database = new DB(path.join(directory, 'data'));
const game = new Game(
  JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
  database,
  { ...database.gamePlatform(), automaticClock: false },
);
checkPreparedWitness(game);
for (const [name, system] of [
  ['Reality Base', 'qgate'],
  ['Reality Beyond', 'beyond-rift'],
  ['Reality Breach', 'dimmer'],
  ['Reality Vigil', 'founding-vigil'],
] as const) {
  const player = database.create(name, '', game.fresh());
  player.sys = 'qgate';
  player.stellar = 'qstation';
  if (system === 'beyond-rift') player.ship.outfits[9021] = 1;
  player.tut = 999;
  player.story = {
    step: 0,
    active: null,
    done: ['start'],
    flags:
      system === 'qgate'
        ? {}
        : system === 'dimmer'
          ? { breach_started: true }
          : system === 'founding-vigil'
            ? { founding_vigil: true }
            : { main_ending: 'table' },
  };
}
const choiceCaptain = database.create('Reality Choice', '', game.fresh());
choiceCaptain.sys = 'qgate';
choiceCaptain.stellar = 'qstation';
choiceCaptain.tut = 999;
const choiceIndex = STORY.findIndex((mission) => mission.id === 'choice');
assert.ok(choiceIndex > 0, 'the main story includes its final Choice');
choiceCaptain.story = {
  step: choiceIndex,
  active: null,
  done: STORY.slice(0, choiceIndex).map((mission) => mission.id),
  flags: {
    d1: 'index',
    d2: 'umbral',
    index_ending: 'survey_complete',
    nhal_ending: 'witness',
    breach_started: true,
  },
};
database.touch();
database.flush();
const port = await availablePort(),
  origin = 'http://127.0.0.1:' + port;
const server = spawn(
  process.execPath,
  [
    '--import',
    fileURLToPath(new URL('./fixtures/preload-story-browser.ts', import.meta.url)),
    'server/local-main.ts',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: path.join(directory, 'data'),
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);

let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('browser:', message.text());
  });
  await page.goto(origin + '/?renderer=canvas');
  await page.locator('[data-slot="Reality Base"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(
    () => G.view && !G.landed && window.RiftEngine.scene.display.actors.has('ship:' + G.myId),
  );
  await page.click('#optbtn');
  await page.locator('#opt-reducedEffects').check();
  assert.equal(
    await page.evaluate(async () => {
      const { reducedStoryEffects } = await import('/story-reality.js');
      return (
        reducedStoryEffects(G) && JSON.parse(localStorage.getItem('rift.opts')!).reducedEffects
      );
    }),
    true,
    'the real reduced-effects setting controls rendering and persists',
  );
  await page.click('#optclose');
  await page.click('#optbtn');
  assert.equal(await page.locator('#opt-reducedEffects').isChecked(), true);
  await page.locator('#opt-reducedEffects').uncheck();
  await page.click('#optclose');
  const visual = await page.evaluate(async () => {
    const { storyShipOpacity } = await import('/story-reality.js');
    const { mapHit, mapFit, drawShip } = await import('/render.js');
    const { SYS } = await import('/shared/galaxy.js');
    const state: typeof G & { friendGame?: boolean } = {
      ...G,
      solo: false,
      friendGame: false,
      you: { ...G.you!, story: { ...G.you!.story, flags: { breach_started: true } } },
      ents: new Map(G.ents),
    };
    const own = state.ents.get(G.myId)!;
    const remote: typeof own = {
      ...own,
      id: 987651,
      fl: 17,
      owner: 0,
      name: 'Other captain',
      rx: own.rx + 250,
      storyEnding: 'table' as const,
    };
    state.ents.set(remote.id, remote);
    const scene = window.RiftEngine.scene;
    scene.display.update(state, 1000);
    const ghost = scene.display.actors.get('ship:' + remote.id)!.graphics.opacity;
    const glow = scene.display.actors.get('glow:' + remote.id)?.graphics.opacity;
    state.friendGame = true;
    scene.display.update(state, 1000);
    const friend = scene.display.actors.get('ship:' + remote.id)!.graphics.opacity;
    state.friendGame = false;
    state.target = remote.id;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 500;
    const context = canvas.getContext('2d')!;
    const outlines: number[] = [],
      names: number[] = [];
    const stroke = context.stroke.bind(context),
      text = context.fillText.bind(context);
    context.stroke = () => {
      outlines.push(context.globalAlpha);
      stroke();
    };
    context.fillText = (value, x, y) => {
      names.push(context.globalAlpha);
      text(value, x, y);
    };
    drawShip(state, context, remote, 250, 250, 1, 1000, true);
    state.friendGame = false;
    state.you!.story.flags = { main_ending: 'table' };
    remote.storyEnding = 'long_dream';
    scene.display.update(state, 1000);
    const otherEnding = scene.display.actors.get('ship:' + remote.id)!.graphics.opacity;
    const reduced = storyShipOpacity({ ...state, opts: { reducedEffects: true } }, remote, 1000);
    const baseFit = mapFit(800, 600, {}),
      fullFit = mapFit(800, 600, { main_ending: 'table', crossed_quantum_rift: true });
    const transform = { ...baseFit, W: 800, H: 600 };
    G.mapXform = transform;
    const hidden = SYS['quantum-rift'];
    const hiddenHit = mapHit(
      G,
      400 + (hidden.x - transform.cx) * transform.k,
      300 + (hidden.y - transform.cy) * transform.k,
    );
    const vigil = SYS['founding-vigil'];
    const vigilX = 400 + (vigil.x - transform.cx) * transform.k,
      vigilY = 300 + (vigil.y - transform.cy) * transform.k;
    const shownVigil = mapHit(
      { ...G, you: { ...G.you!, story: { ...G.you!.story, flags: { founding_vigil: true } } } },
      vigilX,
      vigilY,
    );
    const hiddenVigil = mapHit(G, vigilX, vigilY);
    scene.display.update(G, performance.now());
    return {
      ghost,
      glow,
      friend,
      outlines,
      names,
      otherEnding,
      reduced,
      hiddenHit,
      shownVigil,
      hiddenVigil,
      baseFit,
      fullFit,
    };
  });
  assert.ok(visual.ghost >= 0.3 && visual.ghost <= 0.5);
  if (visual.glow !== undefined) assert.equal(visual.glow, visual.ghost);
  assert.equal(visual.friend, 1);
  assert.ok(
    visual.outlines.length >= 4 && visual.outlines.every((alpha) => alpha === 1),
    'target outlines stay opaque',
  );
  assert.equal(visual.names[0], visual.ghost, 'nameplate follows ghost opacity');
  assert.equal(visual.otherEnding, 0.75);
  assert.equal(visual.reduced, 1);
  assert.notEqual(visual.hiddenHit, 'quantum-rift');
  assert.equal(
    visual.shownVigil,
    'founding-vigil',
    'temporary mission bearing is selectable only when available',
  );
  assert.notEqual(visual.hiddenVigil, 'founding-vigil');
  await page.close();
  const choice = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const choiceErrors: string[] = [];
  choice.on('pageerror', (error) => choiceErrors.push(error.message));
  await choice.addInitScript(() => {
    Reflect.set(window, 'fixtureArkFrames', 0);
    // oxlint-disable-next-line typescript/unbound-method -- The wrapper invokes the original with Reflect.apply and the real canvas receiver.
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
      const image = args[0];
      if (image instanceof HTMLImageElement && image.src.includes('/ships/926.webp'))
        Reflect.set(
          window,
          'fixtureArkFrames',
          Number(Reflect.get(window, 'fixtureArkFrames')) + 1,
        );
      Reflect.apply(drawImage, this, args);
    };
  });
  await choice.goto(origin + '/?renderer=canvas');
  await choice.locator('[data-slot="Reality Choice"]').click();
  await choice.waitForFunction(
    () => G.you && G.landed && document.querySelector('#storyt')?.textContent === 'The Choice',
  );
  await choice.getByRole('button', { name: /^The Table —/ }).click();
  await choice.waitForFunction(
    () => G.you?.story.flags.main_ending === 'table' && G.view && !G.landed,
  );
  await choice.locator('#storyok').click();
  await choice.waitForFunction(() => Number(Reflect.get(window, 'fixtureArkFrames')) >= 2);
  const finale = await choice.evaluate(() => ({
    ending: G.you!.story.flags.main_ending,
    completed: G.you!.story.done.includes('choice'),
    ownShip: !!G.view && window.RiftEngine.scene.display.actors.has('ship:' + G.myId),
    arkFrames: Number(Reflect.get(window, 'fixtureArkFrames')),
    interactiveArk: [...G.ents.values()].some((ship) => ship.hull === 925 || ship.hull === 926),
  }));
  assert.equal(finale.ending, 'table');
  assert.equal(finale.completed, true);
  assert.equal(finale.ownShip, true);
  assert.ok(
    finale.arkFrames >= 2,
    'the supplied awake ark is being rendered during the live sequence',
  );
  assert.equal(
    finale.interactiveArk,
    false,
    'cinematic ark never enters the combat entity registry',
  );
  await choice.screenshot({ path: path.join(evidence, 'table-ark-departure.png') });
  assert.deepEqual(choiceErrors, []);
  await choice.close();
  const arrival = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await arrival.goto(origin + '/?renderer=canvas');
  await arrival.locator('[data-slot="Reality Beyond"]').click();
  await arrival.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await arrival.locator('#storybox').isVisible()); index++)
    await arrival.locator('#storyb button').first().click();
  await arrival.click('#depart');
  await arrival.waitForFunction(() => G.sys === 'beyond-rift' && G.view && !G.landed);
  for (let index = 0; index < 8 && (await arrival.locator('#storybox').isVisible()); index++)
    await arrival.locator('#storyb button').first().click();
  await arrival.evaluate(() =>
    Promise.all(
      ['assets/quantum_rift.png', 'assets/milky_way_arrival_backdrop.jpg'].map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => reject(Error(src));
            image.src = src;
          }),
      ),
    ),
  );
  for (let index = 0; index < 7; index++) await arrival.keyboard.press('x');
  await arrival.waitForTimeout(500);
  await arrival.screenshot({ path: path.join(evidence, 'beyond-rift.png') });
  const breach = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await breach.goto(origin + '/?renderer=canvas');
  await breach.locator('[data-slot="Reality Breach"]').click();
  await breach.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await breach.locator('#storybox').isVisible()); index++)
    await breach.locator('#storyb button').first().click();
  await breach.click('#depart');
  await breach.waitForFunction(() => G.sys === 'dimmer' && G.view && !G.landed);
  await breach.waitForTimeout(500);
  await breach.screenshot({ path: path.join(evidence, 'breach-disputed-station.png') });
  await breach.close();
  const vigilPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await vigilPage.goto(origin + '/?renderer=canvas');
  await vigilPage.locator('[data-slot="Reality Vigil"]').click();
  await vigilPage.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await vigilPage.locator('#storybox').isVisible()); index++)
    await vigilPage.locator('#storyb button').first().click();
  await vigilPage.click('#depart');
  await vigilPage.waitForFunction(() => G.sys === 'founding-vigil' && G.view && !G.landed);
  await vigilPage.waitForTimeout(400);
  await vigilPage.screenshot({ path: path.join(evidence, 'founding-vigil.png') });
  await vigilPage.close();
  const images = await arrival.evaluate(async () => {
    const files = [
      'assets/quantum_rift.png',
      'assets/milky_way_arrival_backdrop.jpg',
      'assets/ships/925.webp',
      'assets/ships/926.webp',
    ];
    return Promise.all(
      files.map(
        (src) =>
          new Promise<{ src: string; width: number; height: number }>((resolve, reject) => {
            const image = new Image();
            image.onload = () =>
              resolve({ src, width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = () => reject(Error(src));
            image.src = src;
          }),
      ),
    );
  });
  assert.deepEqual(
    images.slice(0, 2).map((image) => [image.width, image.height]),
    [
      [2560, 1280],
      [2560, 1440],
    ],
  );
  assert.equal(errors.length, 0, errors.join('\n'));
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ visual, finale, images }, null, 2),
  );
  console.log(
    'PASS native reality ghost/glow/group/reduced-effects, hidden chart picking and authored Beyond the Rift arrival',
  );
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}

process.exit(0);
