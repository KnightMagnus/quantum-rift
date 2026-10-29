import { launchChromium } from './helpers/chromium.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
import { STELLARS } from '../shared/galaxy.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const directory = fileSystem.mkdtempSync(
    path.join(operatingSystem.tmpdir(), 'rift-radio-browser-'),
  ),
  output = evidenceDir('radio'),
  data = path.join(directory, 'data');
// Seed once without background timers; only the child server owns this temporary save afterwards.
const interval = globalThis.setInterval,
  timeout = globalThis.setTimeout;
let game;
try {
  globalThis.setInterval = Object.assign(() => {
    const timer = interval(() => {}, 2147483647);
    clearInterval(timer);
    return timer;
  }, interval);
  globalThis.setTimeout = Object.assign(() => {
    const timer = timeout(() => {}, 2147483647);
    clearTimeout(timer);
    return timer;
  }, timeout);
  game = new Game(
    JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
    new Database(data),
  );
  for (const [name, systemId, stellar] of [
    ['Radio Explorer', 'brightwater', 'brightwater-iv'],
    ['Radio Lost', 'longreach', 'longreach-prime'],
    ['Radio Playback', 'ninefold', 'ninefold-prime'],
  ]) {
    assert.equal(STELLARS[stellar]?.system, systemId, 'valid seeded port');
    const playerData = game.db.create(name, 'test-only', game.fresh());
    Object.assign(playerData, {
      sys: systemId,
      stellar,
      tut: 999,
      story: { done: ['start'], active: null },
    });
    if (name === 'Radio Playback')
      playerData.radioStations = RADIO_STATIONS.map((station) => station.id);
  }
  game.db.touch();
  game.db.flush();
} finally {
  globalThis.setInterval = interval;
  globalThis.setTimeout = timeout;
}
// Fixture positioning/ambient removal only; real authenticated jump/arrival/discovery code runs.
const preload = resolvePreloadFile(new URL('./fixtures/preload-radio-browser.ts', import.meta.url));

const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', '--import', preload, 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '',
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
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.radioSocket = this;
        this.addEventListener('message', (event) => {
          const message = JSON.parse(event.data);
          if (message.t === 'toast') (window.radioToasts ||= []).push(message.msg);
        });
      }
    };
    window.radioPlays = [];
    const play = Reflect.get(
      HTMLMediaElement.prototype,
      'play',
    ) as typeof HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.includes('/fixture/radio-')) {
        window.radioPlays.push(this.src);
        window.radioAudio = this;
      }
      return play.apply(this, args);
    };
  });
  const page = await context.newPage(),
    errors: string[] = [],
    external: string[] = [];
  page.on('pageerror', (event2) => errors.push(String(event2)));
  page.on('request', (result) => {
    if (/iheart|ihrhls|cdnjs.*hls/.test(result.url())) external.push(result.url());
  });
  const login = async (name: string) => {
    await page.goto(origin);
    await page.locator('#lname').fill(name);
    await page.locator('#lpass').fill('test-only');
    await page.locator('#lbtn').click();
    await page.waitForFunction(() => G.you && G.landed);
    await page.locator('#traytoggle').click();
    await page.locator('[data-tab="radio"]').click();
    await page.locator('#rres').click();
  };
  const stations = () => page.locator('#rlist .it .n > div:first-child').allTextContents();
  await login('Radio Explorer');
  assert.deepEqual(await stations(), ['Wave Function Collapse']);
  await page.evaluate(() =>
    localStorage.setItem(
      'rift.radio-favs.radio explorer',
      JSON.stringify(['super-idol', 'wave-function-collapse']),
    ),
  );
  await page.locator('#rfav').click();
  assert.deepEqual(
    await stations(),
    ['Wave Function Collapse'],
    'favorites cannot expose a locked station',
  );
  await page.locator('#rres').click();
  // Exercise empty-content fallback in an isolated client fixture only.
  await page.evaluate(async () => {
    const { RADIO_STATIONS } = await import('/shared/radio-stations.js');
    window.originalStarterTracks = RADIO_STATIONS[0].tracks;
    RADIO_STATIONS[0].tracks = [];
  });
  await page.getByRole('button', { name: 'Play Wave Function Collapse', exact: true }).click();
  await page.getByText('No recordings available yet', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const { RADIO_STATIONS } = await import('/shared/radio-stations.js');
    RADIO_STATIONS[0].tracks = window.originalStarterTracks;
  });
  await page.locator('#depart').click();
  await page.waitForFunction(() => !G.landed && G.view);
  await page.evaluate(() => radioSocket.send(JSON.stringify({ t: 'jump', to: 'farmouth' })));
  await page.waitForFunction(
    () => G.you!.sys === 'farmouth' && G.you!.radioStations.includes('qvri'),
    null,
    { timeout: 15000 },
  );
  assert.deepEqual(await stations(), ['Wave Function Collapse', "QVRI Que'vari Radio"]);
  assert.equal(
    await page.evaluate(
      () =>
        radioToasts.filter((toastText) =>
          toastText.includes('Discovered a new radio station: QVRI'),
        ).length,
    ),
    1,
  );
  await page.reload();
  await page.locator('#lpass').fill('test-only');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you?.radioStations?.includes('qvri'));
  assert.equal(
    await page.evaluate(
      () =>
        (window.radioToasts || []).filter((notificationText) =>
          notificationText.includes('Discovered a new radio station'),
        ).length,
    ),
    0,
    'reconnect does not rediscover',
  );
  // Real logout and another login in the SAME storage context.
  const logout = async () => {
    await page.keyboard.press('Escape');
    await page.locator('#quitconfirm').click();
    await page.locator('#lbtn').waitFor({ state: 'visible' });
  };
  await logout();
  await login('Radio Lost');
  assert.deepEqual(await stations(), ['Wave Function Collapse']);
  await page.locator('#rfav').click();
  assert.equal(await page.locator('#rlist .it').count(), 0, 'favorites are per captain');
  await page.locator('#rres').click();
  await page.locator('#depart').click();
  await page.waitForFunction(() => !G.landed && G.view);
  await page.evaluate(() => radioSocket.send(JSON.stringify({ t: 'jump', to: 'lost-signal' })));
  await page.waitForFunction(
    () => G.you!.sys === 'lost-signal' && G.you!.radioStations.includes('signal-superposition'),
    null,
    { timeout: 15000 },
  );
  assert.deepEqual(await stations(), ['Wave Function Collapse', 'Signal Superposition Radio']);
  assert.equal(
    await page.evaluate(
      () =>
        radioToasts.filter((notificationText) =>
          notificationText.includes('Discovered a new radio station: Signal'),
        ).length,
    ),
    1,
  );
  await logout();
  await login('Radio Playback');
  assert.deepEqual(
    await stations(),
    RADIO_STATIONS.map((session) => session.name),
  );
  await page.getByRole('button', { name: 'Play Wave Function Collapse', exact: true }).click();
  await page.locator('#rnow').getByText('ON AIR', { exact: true }).waitFor();
  assert.equal(
    await page.locator('#rtrack b').innerText(),
    'Broadcast',
    'real recording title hidden for station 1',
  );
  await page.getByRole('button', { name: 'Play Super-Idol Radio', exact: true }).click();
  await page.locator('#rnow').getByText('ON AIR', { exact: true }).waitFor();
  assert.equal(
    await page.locator('#rtrack b').innerText(),
    'title' in RADIO_STATIONS[4].tracks[0] ? RADIO_STATIONS[4].tracks[0].title : undefined,
    'published first album track is visible',
  );
  assert.doesNotMatch(await page.locator('#rnow').innerText(), /in order|album loop|shuffle/i);
  assert.equal(await page.locator('#commsheader .comms-live').count(), 0);
  assert.equal(
    await page.locator('#menuheightgrip').count(),
    0,
    'Radio uses automatic menu height',
  );
  await page.locator('#rnow').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'five-stations-playing.png') });
  await page.locator('#rstop').click();
  // Fetch and truly decode every owner recording, including the separate login theme.
  const decoded = await page.evaluate(async () => {
    const { RADIO_STATIONS } = await import('/shared/radio-stations.js');
    const context = new AudioContext({ sampleRate: 22050 }),
      results = [];
    try {
      for (const address of [
        ...RADIO_STATIONS.flatMap((session) => session.tracks.map((audioTrack) => audioTrack.url)),
        '/assets/sfx/music_login33.mp3',
      ]) {
        const response = await fetch(address);
        if (!response.ok) throw Error('Missing recording ' + address);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        const samples = buffer.getChannelData(0);
        let peak = 0;
        for (let index = 22050; index < samples.length; index += 997)
          peak = Math.max(peak, Math.abs(samples[index]));
        if (buffer.duration <= 0 || peak < 0.001)
          throw Error('Silent or invalid recording ' + address);
        results.push({
          url: address,
          duration: buffer.duration,
          channels: buffer.numberOfChannels,
          peak,
        });
      }
    } finally {
      await context.close();
    }
    return results;
  });
  assert.equal(decoded.length, 35);
  fileSystem.writeFileSync(
    path.join(output, 'recording-decodes.json'),
    JSON.stringify(decoded, null, 2) + '\n',
  );
  // Natural ended advancement uses tiny silent WAV fixtures to avoid waiting through a full album.
  const waveSample = Buffer.alloc(44 + 16000);
  waveSample.write('RIFF');
  waveSample.writeUInt32LE(waveSample.length - 8, 4);
  waveSample.write('WAVEfmt ', 8);
  waveSample.writeUInt32LE(16, 16);
  waveSample.writeUInt16LE(1, 20);
  waveSample.writeUInt16LE(1, 22);
  waveSample.writeUInt32LE(8000, 24);
  waveSample.writeUInt32LE(16000, 28);
  waveSample.writeUInt16LE(2, 32);
  waveSample.writeUInt16LE(16, 34);
  waveSample.write('data', 36);
  waveSample.writeUInt32LE(16000, 40);
  await page.route('**/fixture/radio-*.wav', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: waveSample }),
  );
  await page.evaluate(async () => {
    const { RADIO_STATIONS } = await import('/shared/radio-stations.js');
    RADIO_STATIONS[4].tracks = ['A', 'B', 'C'].map((title) => ({
      title: 'Browser fixture ' + title,
      url: '/fixture/radio-' + title + '.wav',
    }));
    const { setRadioLevel } = await import('/radio.js');
    setRadioLevel(0.35);
  });
  await page.getByRole('button', { name: 'Play Super-Idol Radio', exact: true }).click();
  await page.waitForFunction(() => radioPlays.length >= 4, null, { timeout: 10000 });
  assert.deepEqual(
    await page.evaluate(() => radioPlays.slice(0, 4).map((address2) => new URL(address2).pathname)),
    [
      '/fixture/radio-A.wav',
      '/fixture/radio-B.wav',
      '/fixture/radio-C.wav',
      '/fixture/radio-A.wav',
    ],
  );
  await page.locator('#rnow').getByText('ON AIR', { exact: true }).waitFor();
  await page.locator('#rvol').focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => radioAudio.volume === 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => G.opts.radio === 0.05 && Math.abs(radioAudio.volume - G.opts.vol * 0.05) < 0.001,
  );
  await page.locator('#rstop').click();
  const stopped = await page.evaluate(() => radioPlays.length);
  await page.waitForTimeout(1300);
  assert.equal(
    await page.evaluate(() => radioPlays.length),
    stopped,
    'OFF cancels ended advancement',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fileSystem.writeFileSync(
    path.join(output, 'verification.json'),
    JSON.stringify(
      {
        status: 'pass',
        discovery: 'real authenticated jumps, repeat reconnect, same-browser captain isolation',
        screenshot:
          'Fixture captain has saved radio unlocks; real owner album playing in actual HUD',
        playback:
          'all 35 owner recordings really decoded, actual station playback/title hiding; natural ended A B C A exercised with test-only short WAV responses',
        errors,
        external,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS actual jumps/discoveries, reconnect, locked/favorites isolation, saved station unlocks, owner audio/title rules and 35 real decodes, fixture album ended loop and OFF',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
