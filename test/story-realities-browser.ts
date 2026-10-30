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
    lamps_relit: true,
  },
};
const webglCaptain = database.create('Reality WebGL Choice', '', game.fresh());
Object.assign(webglCaptain, {
  sys: 'qgate',
  stellar: 'qstation',
  tut: 999,
  story: structuredClone(choiceCaptain.story),
});
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
    Reflect.set(window, 'fixtureFilmText', []);
    Reflect.set(window, 'fixtureLightning', 0);
    Reflect.set(window, 'fixtureMovingLightning', 0);
    Reflect.set(window, 'fixtureLampBursts', 0);
    Reflect.set(window, 'fixtureCoreFacing', false);
    // oxlint-disable-next-line typescript/unbound-method -- Reflect.apply preserves the native canvas receiver.
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (
      ...args: Parameters<CanvasRenderingContext2D['fillRect']>
    ) {
      if (
        this.canvas.dataset.scene === 'lamps' &&
        typeof this.fillStyle === 'string' &&
        this.fillStyle.startsWith('rgba(242, 225, 255,')
      )
        Reflect.set(
          window,
          'fixtureLampBursts',
          Number(Reflect.get(window, 'fixtureLampBursts')) + 1,
        );
      Reflect.apply(fillRect, this, args);
    };
    // Record actual canvas output, not copies of the renderer's scene definitions.
    // oxlint-disable-next-line typescript/unbound-method -- Reflect.apply preserves the native canvas receiver.
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      ...args: Parameters<CanvasRenderingContext2D['fillText']>
    ) {
      if (this.canvas.parentElement?.id === 'endingcinematic') {
        const records = Reflect.get(window, 'fixtureFilmText') as string[];
        const entry = this.canvas.dataset.scene + ':' + args[0];
        if (!records.includes(entry)) records.push(entry);
        if (args[0] === 'The Dreamer takes it.')
          Reflect.set(window, 'fixtureLastGuestY', this.getTransform().f);
        if (
          args[0] === 'The Lamplighters relight all ten lamps.' &&
          this.getTransform().f - Number(Reflect.get(window, 'fixtureLastGuestY')) > 150
        )
          Reflect.set(window, 'fixtureClosingGap', true);
      }
      Reflect.apply(fillText, this, args);
    };
    // oxlint-disable-next-line typescript/unbound-method -- Reflect.apply preserves the native canvas receiver.
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      if (this.canvas.dataset.scene === 'rift' && this.strokeStyle === '#a350ff')
        Reflect.set(
          window,
          'fixtureLightning',
          Number(Reflect.get(window, 'fixtureLightning')) + 1,
        );
      if (
        this.canvas.dataset.scene &&
        ['awakening', 'gateway', 'rift'].includes(this.canvas.dataset.scene) &&
        this.strokeStyle === '#b982ff'
      )
        Reflect.set(
          window,
          'fixtureMovingLightning',
          Number(Reflect.get(window, 'fixtureMovingLightning')) + 1,
        );
      Reflect.apply(stroke, this, path ? [path] : []);
    };
    // oxlint-disable-next-line typescript/unbound-method -- The wrapper invokes the original with Reflect.apply and the real canvas receiver.
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
      const image = args[0];
      if (
        this.canvas.dataset.scene === 'core' &&
        image instanceof HTMLImageElement &&
        image.src.includes('/ships/926.webp')
      ) {
        const transform = this.getTransform();
        if (
          args[1] === 4 * 480 &&
          args[2] === 2 * 480 &&
          transform.a === 1 &&
          transform.b === 0 &&
          transform.c === 0 &&
          transform.d === 1
        )
          Reflect.set(window, 'fixtureCoreFacing', true);
      }
      if (image instanceof HTMLImageElement && image.src.includes('/ships/926.webp'))
        Reflect.set(
          window,
          'fixtureArkFrames',
          Number(Reflect.get(window, 'fixtureArkFrames')) + 1,
        );
      Reflect.apply(drawImage, this, args);
    };
  });
  // The real decoder/source runs a short offline cue so natural one-shot completion
  // is covered without adding a full soundtrack-length wait to every browser run.
  const cue = Buffer.alloc(44 + 8000);
  cue.write('RIFF', 0);
  cue.writeUInt32LE(cue.length - 8, 4);
  cue.write('WAVEfmt ', 8);
  cue.writeUInt32LE(16, 16);
  cue.writeUInt16LE(1, 20);
  cue.writeUInt16LE(1, 22);
  cue.writeUInt32LE(8000, 24);
  cue.writeUInt32LE(16000, 28);
  cue.writeUInt16LE(2, 32);
  cue.writeUInt16LE(16, 34);
  cue.write('data', 36);
  cue.writeUInt32LE(8000, 40);
  await choice.route('**/music_login33.mp3', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: cue }),
  );
  await choice.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- The wrapper uses Reflect.apply with the native source receiver.
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<AudioBufferSourceNode['start']>
    ) {
      if (this.buffer?.duration === 0.5) Reflect.set(window, 'fixtureThemeLoop', this.loop);
      Reflect.apply(start, this, args);
    };
  });
  await choice.goto(origin + '/?renderer=canvas');
  await choice.locator('[data-slot="Reality Choice"]').click();
  await choice.waitForFunction(
    () => G.you && G.landed && document.querySelector('#storyt')?.textContent === 'The Choice',
  );
  assert.equal(await choice.locator('#hud').isVisible(), false, 'Choice removes the HUD');
  const choiceBounds = await choice.locator('#storybox').boundingBox();
  assert.equal(choiceBounds?.width, 1440);
  assert.equal(choiceBounds?.height, 1000);
  // The temporary freeze must be present in the same click task, before any
  // authoritative system transfer can render a close-up of the captain's ship.
  await choice.evaluate(() => {
    document.querySelector('#storyb')!.addEventListener(
      'click',
      () => {
        const view = document.querySelector<HTMLCanvasElement>('#view')!;
        const expected = document.createElement('canvas');
        expected.width = view.width;
        expected.height = view.height;
        const context = expected.getContext('2d')!;
        context.fillStyle = '#000';
        context.fillRect(0, 0, expected.width, expected.height);
        context.drawImage(view, 0, 0);
        context.fillStyle = getComputedStyle(document.querySelector('#storybox')!).backgroundColor;
        context.fillRect(0, 0, expected.width, expected.height);
        Reflect.set(window, 'fixtureExpectedDeparture', [
          ...context.getImageData(0, 0, expected.width, expected.height).data,
        ]);
      },
      true,
    );
    document.querySelector('#storyb')!.addEventListener('click', () => {
      const frame = document.querySelector<HTMLCanvasElement>('#endingdeparture');
      Reflect.set(window, 'fixtureFrozenAtClick', !!frame);
      const pixels = frame!.getContext('2d')!.getImageData(0, 0, frame!.width, frame!.height).data;
      Reflect.set(
        window,
        'fixtureOpaqueDeparture',
        pixels.every((value, index) => index % 4 !== 3 || value === 255),
      );
      Reflect.set(
        window,
        'fixtureLiveHidden',
        getComputedStyle(document.querySelector('#view')!).visibility === 'hidden',
      );
      Reflect.set(window, 'fixtureDeparturePixels', [...pixels]);
      const expected = Reflect.get(window, 'fixtureExpectedDeparture') as number[];
      Reflect.set(
        window,
        'fixtureBackdropPreserved',
        pixels.every((value, index) => value === expected[index]),
      );
    });
  });
  await choice.clock.install();
  await choice.getByRole('button', { name: /^The Table —/ }).click();
  await choice.waitForFunction(
    () => G.you?.story.flags.main_ending === 'table' && G.view && !G.landed,
  );
  await choice.waitForFunction(() => document.body.dataset.endingCinematic === 'active');
  assert.equal(await choice.evaluate(() => Reflect.get(window, 'fixtureFrozenAtClick')), true);
  assert.equal(
    await choice
      .locator('#endingcinematic')
      .evaluate((element) => getComputedStyle(element).animationName),
    'none',
    'dialog fade-in must never leak the transferred world',
  );
  assert.equal(
    await choice.locator('#view').evaluate((element) => getComputedStyle(element).visibility),
    'hidden',
    'live world stays hidden behind the opaque cinematic',
  );
  assert.equal(
    await choice.evaluate(() => Reflect.get(window, 'fixtureOpaqueDeparture')),
    true,
    'frozen background never leaks the transferred world',
  );
  assert.equal(
    await choice.evaluate(() => Reflect.get(window, 'fixtureLiveHidden')),
    true,
    'live scenery stays hidden through the transfer',
  );
  await choice.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('#endingcinematic canvas')?.dataset.scene ===
      'fade',
  );
  await choice.clock.runFor(200);
  assert.equal(
    await choice.evaluate(() => Reflect.get(window, 'fixtureBackdropPreserved')),
    true,
    'closing the choice never brightens or replaces its backdrop',
  );
  // Compare the rendered fade to the pre-transfer frame, not just DOM presence.
  const fadeMatches = await choice.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#endingcinematic canvas')!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const frozen = Reflect.get(window, 'fixtureDeparturePixels') as number[];
    const opacity = Number(canvas.dataset.elapsed) / 2;
    return pixels.every(
      (value, index) => index % 4 === 3 || Math.abs(value - frozen[index] * (1 - opacity)) < 3,
    );
  });
  assert.equal(fadeMatches, true, 'fade contains only the frozen pre-click scenery');
  const filmBounds = await choice.locator('#endingcinematic').boundingBox();
  assert.equal(filmBounds?.width, 1440);
  assert.equal(filmBounds?.height, 1000);
  await choice.waitForTimeout(650);
  await choice.clock.fastForward(15000);
  await choice.clock.runFor(40);
  await choice.clock.runFor(29000);
  await choice.clock.runFor(40);
  assert.equal(
    await choice.locator('#endingcinematic canvas').getAttribute('data-scene'),
    'lamps',
    'the Table reveal is the first scene after the crawl',
  );
  const filmTo = async (seconds: number) => {
    const elapsed = Number(
      await choice.locator('#endingcinematic canvas').getAttribute('data-elapsed'),
    );
    await choice.clock.fastForward(Math.max(0, seconds * 1000 - elapsed * 1000));
    await choice.clock.runFor(40);
  };
  await filmTo(48);
  assert.equal(
    await choice.evaluate(() => Number(Reflect.get(window, 'fixtureLampBursts')) > 0),
    false,
    'Table waits for all ten lamps',
  );
  await choice.screenshot({ path: path.join(evidence, 'lamps-before-table.png') });
  await filmTo(50.2);
  assert.ok(await choice.evaluate(() => Number(Reflect.get(window, 'fixtureLampBursts')) > 0));
  await choice.screenshot({ path: path.join(evidence, 'table-light-burst.png') });
  await filmTo(56);
  assert.equal(
    await choice.locator('#endingcinematic canvas').getAttribute('data-scene'),
    'awakening',
  );
  await choice.waitForFunction(() => Number(Reflect.get(window, 'fixtureArkFrames')) >= 2);
  const crawlText = await choice.evaluate(() => Reflect.get(window, 'fixtureFilmText') as string[]);
  assert.ok(crawlText.includes('crawl:A star lights at the centre of the ten dark lamps.'));
  assert.equal(
    await choice.evaluate(() => Reflect.get(window, 'fixtureClosingGap')),
    true,
    'closing crawl pair is separated from the guest roll call',
  );
  assert.ok(
    crawlText.includes('crawl:The Spacers carry everyone to it.'),
    'crawl sentences are standalone lines',
  );
  assert.ok(
    crawlText.includes('crawl:The Sarn draw the terms; the Korrund hold the Table steady.'),
  );
  assert.equal(
    await choice.evaluate(() => Reflect.get(window, 'fixtureThemeLoop')),
    false,
    'cinematic score plays once',
  );
  assert.equal(await choice.evaluate(() => G.you?.story.preparation?.components.length), 5);
  const tuningDenied = await choice.evaluate(async () => {
    const radio = await import('/radio.js');
    await radio.playStation({ id: radio.RADIO_STATIONS[0].id }, document.createElement('div'));
    return radio.radioOn();
  });
  assert.equal(tuningDenied, false, 'radio cannot restart while cinematic owns the music');
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
  for (const [advance, scene] of [
    [12000, 'core'],
    [18000, 'gateway'],
    [10000, 'rift'],
    [18000, 'captain'],
    [8000, 'briefing'],
  ] as const) {
    if (scene === 'captain') {
      await choice.clock.fastForward(5500);
      await choice.clock.runFor(40);
      assert.ok(
        await choice.evaluate(() => Number(Reflect.get(window, 'fixtureLightning')) > 0),
        'purple lightning threads the breaking ark',
      );
      await choice.screenshot({ path: path.join(evidence, 'ark-lightning.png') });
      await choice.clock.fastForward(advance - 5500);
    } else await choice.clock.fastForward(advance);
    if (scene === 'core')
      await choice.screenshot({ path: path.join(evidence, 'core-station-facing.png') });
    if (scene === 'gateway') await choice.clock.runFor(1300);
    await choice.clock.runFor(40);
    assert.equal(await choice.locator('#endingcinematic canvas').getAttribute('data-scene'), scene);
  }
  const renderedText = await choice.evaluate(
    () => Reflect.get(window, 'fixtureFilmText') as string[],
  );
  assert.ok(renderedText.includes('core:The Riftweavers depart for their ancient ark.'));
  assert.equal(
    renderedText.some((line) => line.startsWith('lamps:')),
    false,
    'lamp scene has no labels or captions',
  );
  assert.ok(renderedText.includes('rift:The Quantum Rift'));
  assert.ok(renderedText.includes('rift:The Index record one final word: Present.'));
  assert.equal(
    await choice.evaluate(() => Reflect.get(window, 'fixtureCoreFacing')),
    true,
    'ark uses its upright station-facing yaw frame without rolling the sprite',
  );
  assert.ok(
    await choice.evaluate(() => Number(Reflect.get(window, 'fixtureMovingLightning')) > 0),
    'subtle arcs accompany ark movement',
  );
  assert.ok(renderedText.includes('captain:Welcome Captain, to the Quantum Rift.'));
  assert.equal(renderedText.includes('briefing:Welcome Captain, to the Quantum Rift.'), false);
  assert.equal(
    renderedText.some((line) => line.includes('No ordinary ship survives its crossing.')),
    false,
  );
  assert.equal(await choice.locator('.ending-briefing li').count(), 5);
  await choice.keyboard.press('Escape');
  assert.equal(
    await choice.locator('.ending-briefing').isVisible(),
    true,
    'mandatory briefing cannot be declined',
  );
  assert.equal(
    await choice.locator('.ending-briefing button').isEnabled(),
    true,
    'natural soundtrack end releases Continue',
  );
  await choice.locator('.ending-briefing button').click();
  assert.notEqual(
    await choice.locator('#hud').evaluate((element) => getComputedStyle(element).display),
    'none',
  );
  assert.equal(
    await choice.evaluate(() => document.body.classList.contains('ending-choice')),
    false,
  );
  // Replaying another lamp branch must still tear down through the shared owner.
  await choice.evaluate(async () => {
    const cinematic = await import('/ending-cinematic.js');
    const audio = await import('/audio.js');
    audio.stopMusic(0);
    cinematic.playEndingCinematic({
      text: 'A star lights. In Farside the vast hulk wakes.',
      lampsRelit: true,
      hull: 11,
      complete: () => {},
    });
  });
  await choice.waitForTimeout(650);
  await choice.clock.fastForward(48000);
  await choice.clock.runFor(40);
  assert.equal(await choice.locator('#endingcinematic canvas').getAttribute('data-scene'), 'lamps');
  await choice.evaluate(async () => (await import('/overlay-controller.js')).overlays.reset());
  assert.notEqual(
    await choice.locator('#hud').evaluate((element) => getComputedStyle(element).display),
    'none',
    'account teardown restores the cockpit',
  );
  assert.equal(await choice.locator('#endingcinematic').isVisible(), false);

  assert.deepEqual(choiceErrors, []);
  await choice.close();
  const unavailableAudio = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await unavailableAudio.addInitScript(() => {
    Reflect.set(
      window,
      'AudioContext',
      class {
        constructor() {
          throw Error('offline audio fixture');
        }
      },
    );
    Reflect.set(window, 'webkitAudioContext', undefined);
  });
  await unavailableAudio.goto(origin + '/?renderer=canvas');
  await unavailableAudio.clock.install();
  await unavailableAudio.evaluate(async () => {
    const cinematic = await import('/ending-cinematic.js');
    cinematic.playEndingCinematic({
      text: 'A star lights. In Farside the vast hulk wakes.',
      lampsRelit: false,
      hull: 11,
      complete: () => {},
    });
  });
  await unavailableAudio.clock.fastForward(127000);
  await unavailableAudio.clock.runFor(40);
  assert.equal(
    await unavailableAudio.locator('.ending-briefing button').isEnabled(),
    true,
    'audio failure cannot trap the captain',
  );
  await unavailableAudio.keyboard.press('Escape');
  assert.equal(await unavailableAudio.locator('.ending-briefing').isVisible(), true);
  await unavailableAudio.locator('.ending-briefing button').click();
  await unavailableAudio.close();
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
  const webglChoice = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await webglChoice.goto(origin + '/?renderer=webgl');
  await webglChoice.locator('[data-slot="Reality WebGL Choice"]').click();
  await webglChoice.waitForFunction(
    () => G.landed && document.querySelector('#storyt')?.textContent === 'The Choice',
  );
  await webglChoice.getByRole('button', { name: /^The Table —/ }).click();
  await webglChoice.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('#endingcinematic canvas')?.dataset.scene ===
      'fade',
  );
  const frozenWebgl = await webglChoice.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#endingcinematic canvas')!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4)
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 60) visible++;
    return { visible, renderer: document.querySelector<HTMLElement>('#view')!.dataset.renderer };
  });
  assert.equal(frozenWebgl.renderer, 'webgl');
  assert.ok(
    frozenWebgl.visible > 1000,
    'WebGL fade preserves the scene instead of a cleared drawing buffer',
  );
  await webglChoice.screenshot({ path: path.join(evidence, 'webgl-departure-fade.png') });
  await webglChoice.close();
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
