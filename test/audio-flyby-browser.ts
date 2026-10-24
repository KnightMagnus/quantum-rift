import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  availablePort,
  cleanup,
  evidenceDir,
  failureEvidence,
  ready,
  root,
} from './helpers/browser-fixture.ts';
type AudioProbe = {
  context?: AudioContext;
  sources: { duration: number; peak: number; loop: boolean }[];
  hulls: number[];
};
const directory = tempDataDir('rift-audio-flyby-');
const seeds = path.join(directory, 'seeds.json');
filesystem.writeFileSync(
  seeds,
  JSON.stringify([
    {
      name: 'Audio Captain',
      pass: 'fixture',
      credits: 1e8,
      ship: 704,
      system: 'meridian',
      stellar: 'meridian-yards',
      station: { site: 'site-qgate', ops: 5 },
      storyPass: true,
    },
  ]),
);
const fixture = {
  origin: `http://127.0.0.1:${await availablePort()}`,
  out: evidenceDir('audio-flyby'),
};
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '',
    PORT: new URL(fixture.origin).port,
    DATA_DIR: path.join(directory, 'data'),
    SEEDS_FILE: seeds,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = filesystem.createWriteStream(path.join(fixture.out, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  await ready(server, fixture.origin);
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  // A short decoded score fixture advances the real WebAudio source/context.
  // No scene or media clock is replaced, and production theme bytes are unchanged.
  const wav = Buffer.alloc(44 + 96000 * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(192000, 40);
  await page.route('**/music_login33.mp3*', (route) =>
    route.fulfill({ body: wav, contentType: 'audio/wav' }),
  );
  await page.addInitScript(() => {
    const state: AudioProbe = { sources: [], hulls: [] };
    (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe = state;
    const NativeContext = AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        state.context = this;
      }
    };
    const start = Reflect.get(
      AudioBufferSourceNode.prototype,
      'start',
    ) as typeof AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...argumentsList) {
      if (this.buffer) {
        const samples = this.buffer.getChannelData(0);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        state.sources.push({ duration: this.buffer.duration, peak, loop: this.loop });
      }
      return start.apply(this, argumentsList);
    };
    const draw = Reflect.get(
      CanvasRenderingContext2D.prototype,
      'drawImage',
    ) as typeof CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      ...argumentsList: [CanvasImageSource, ...number[]]
    ) {
      const image = argumentsList[0];
      if (this.canvas.classList.contains('login-scene') && image instanceof HTMLImageElement) {
        const hull = image.src.match(/ships\/(\d+)\.webp/);
        const left = argumentsList[5] as number;
        const size = argumentsList[7] as number;
        if (
          hull &&
          left < this.canvas.clientWidth &&
          left + size > 0 &&
          !state.hulls.includes(Number(hull[1]))
        )
          state.hulls.push(Number(hull[1]));
      }
      return Reflect.apply(draw, this, argumentsList);
    };
  });
  await page.goto(fixture.origin);
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.login-scene')?.dataset.ready === 'true',
  );
  await page.waitForFunction(() => window.RiftAudio.loginMusicTimeline().duration === 12);
  const initial = await page.evaluate(async () => (await import('/audio.js')).loginMusicTimeline());
  assert.equal(initial.duration, 12, 'Actual decoded fixture duration, not a separate wall clock');
  await page.waitForFunction(
    () =>
      (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.hulls.includes(713),
    undefined,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.hulls.includes(736),
    undefined,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const position = window.RiftAudio.loginMusicTimeline().position;
      return position > 10.9 && position < 11.4;
    },
    undefined,
    { timeout: 15000 },
  );
  await page.screenshot({ path: path.join(fixture.out, 'late-capital-formation.png') });
  const suspended = await page.evaluate(async () => {
    const probe = (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe;
    await probe.context!.suspend();
    return (await import('/audio.js')).loginMusicTimeline();
  });
  await page.waitForTimeout(350);
  const paused = await page.evaluate(async () => (await import('/audio.js')).loginMusicTimeline());
  assert.equal(paused.playing, false);
  assert.equal(
    paused.position,
    suspended.position,
    'Suspended audio does not accumulate scene time',
  );
  await page.evaluate(async () => {
    await (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.context!.resume();
  });
  await page.waitForFunction(() => window.RiftAudio.loginMusicTimeline().position < 2, undefined, {
    timeout: 15000,
  });
  const looped = await page.evaluate(async () => (await import('/audio.js')).loginMusicTimeline());
  assert.equal(looped.epoch, initial.epoch, 'Natural looping does not create another source');
  await page.fill('#lname', 'Audio Captain');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await page.evaluate(async () => (await import('/audio.js')).loginMusicTimeline().playing),
    false,
    'Login theme stops on successful login',
  );
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#ltabs [data-lt="trade"]');
  const buy = page.locator('[data-act="trade"][data-q="1"]:not(:disabled)').first();
  const before = await page.evaluate(
    () =>
      (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.sources.filter(
        (source) => Math.abs(source.duration - 0.32) < 0.001,
      ).length,
  );
  const retiredCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.sources.filter(
          (source) => Math.abs(source.duration - 1.7) < 0.00001,
        ).length,
    );
  const commodity = await buy.getAttribute('data-c');
  const cargoBefore = await page.evaluate((id) => G.you!.cargo[id!] || 0, commodity);
  const creditsBefore = await page.evaluate(() => G.you!.credits);
  const retiredBeforePurchase = await retiredCount();
  await buy.click();
  await page.waitForFunction(
    (count) =>
      (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.sources.filter(
        (source) => Math.abs(source.duration - 0.32) < 0.001,
      ).length > count,
    before,
  );
  await page.waitForFunction(({ id, quantity }) => (G.you!.cargo[id!] || 0) === quantity + 1, {
    id: commodity,
    quantity: cargoBefore,
  });
  assert.ok(
    (await page.evaluate(() => G.you!.credits)) < creditsBefore,
    'Authoritative purchase settles credits',
  );
  await page.waitForTimeout(300);
  const retiredAfterPurchase = await retiredCount();
  console.log('Retired upgrade cue on actual purchase:', {
    retiredBeforePurchase,
    retiredAfterPurchase,
  });
  assert.equal(
    retiredAfterPurchase,
    retiredBeforePurchase,
    'Buying cargo must not replay the legacy upgrade cue through landed refresh',
  );
  const purchase = await page.evaluate(async () => ({
    sources: (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.sources.filter(
      (source) => Math.abs(source.duration - 0.32) < 0.001,
    ),
    audio: (await import('/audio.js')).debug(),
  }));
  assert.ok(
    purchase.sources.at(-1)!.peak <= 0.105,
    'Real trade control uses the newly decoded gentle signal',
  );
  assert.equal(purchase.audio.mix.sfx, 0.5);
  assert.equal(purchase.audio.mix.ui, 0.55);
  assert.equal(purchase.audio.mix.music, 0.45);
  assert.equal(purchase.audio.master, 0.35);
  for (const [bus, expected] of Object.entries({ sfx: 0.5, ui: 0.55, music: 0.45 }))
    assert.ok(
      Math.abs(purchase.audio.gains[bus] - expected) < 0.0001,
      `${bus} WebAudio bus retains its independent gain`,
    );
  assert.equal(
    filesystem.existsSync(path.join(root, 'client/assets/sounds/10110.wav')),
    false,
    'Retired cue is not shipped',
  );
  assert.equal(
    JSON.parse(filesystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')).sounds[
      '10110'
    ],
    undefined,
    'Retired cue is absent from the catalog',
  );
  const retiredRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/sounds/10110.wav')) retiredRequests.push(request.url());
  });
  await page.evaluate(async () => {
    const audio = await import('/audio.js');
    audio.preload([10110, '10110']);
    audio.play(10110);
    audio.play('10110');
  });
  await page.waitForTimeout(150);
  assert.deepEqual(
    retiredRequests,
    [],
    'Retired cue cannot load through numeric/string/preload paths',
  );
  assert.equal(await retiredCount(), 0, 'Retired cue never plays during login or purchase');
  const purchaseCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { audioFlybyProbe: AudioProbe }).audioFlybyProbe.sources.filter(
          (source) => Math.abs(source.duration - 0.32) < 0.001,
        ).length,
    );
  const beforeSell = await purchaseCount();
  await page.locator('[data-act="trade"][data-q="-1"]').first().click();
  await page.waitForTimeout(150);
  assert.equal(await purchaseCount(), beforeSell, 'Selling does not play the purchase signal');

  await page.click('#ltabs [data-lt="yard"]');
  const hangarBuy = page.locator('[data-act="buyhangar"]');
  await hangarBuy.waitFor();
  assert.equal(await hangarBuy.isEnabled(), true, 'Real owned station has hangar capacity');
  const beforeHangar = await purchaseCount();
  const storedBefore = await page.evaluate(() => G.you!.docks!.stored.length);
  await hangarBuy.click();
  await page.locator('#askbox:not(.hidden)').waitFor();
  assert.equal(await purchaseCount(), beforeHangar, 'Opening confirmation is not a purchase');
  await page.click('#askno');
  await page.waitForTimeout(150);
  assert.equal(await purchaseCount(), beforeHangar, 'Cancelled hangar purchase stays quiet');
  assert.equal(await page.evaluate(() => G.you!.docks!.stored.length), storedBefore);
  await hangarBuy.click();
  await page.click('#askyes');
  await page.waitForFunction((count) => G.you!.docks!.stored.length === count + 1, storedBefore);
  assert.equal(
    await purchaseCount(),
    beforeHangar + 1,
    'Confirmed and settled hangar buy plays once',
  );
  // Native disabled controls must not dispatch either action or confirmation audio.
  await hangarBuy.evaluate((button) => {
    (button as HTMLButtonElement).disabled = true;
    (button as HTMLButtonElement).click();
  });
  await page.waitForTimeout(150);
  assert.equal(await purchaseCount(), beforeHangar + 1);
  assert.equal(await page.locator('#askbox').isVisible(), false);
  assert.equal(
    await retiredCount(),
    0,
    'Trade, sale and hangar refreshes never replay retired cue',
  );
  assert.deepEqual(errors, []);
  filesystem.writeFileSync(
    path.join(fixture.out, 'playback.json'),
    JSON.stringify({ initial, suspended, paused, looped, purchase }, null, 2),
  );
  console.log(
    'Real source progression/loop/suspension, login stop, trade and confirmed hangar playback, cancelled/disabled/sell denials and independent mixer buses passed.',
  );
} catch (error) {
  await failureEvidence(browser, fixture.out, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
