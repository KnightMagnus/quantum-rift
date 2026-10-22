import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { RADIO_STATIONS } from '../shared/radio-stations.js';
import { STELLARS } from '../shared/galaxy.js';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-radio-browser-')),
  out = evidenceDir('radio'),
  data = path.join(dir, 'data');
// Seed once without background timers; only the child server owns this temporary save afterwards.
const interval = globalThis.setInterval,
  timeout = globalThis.setTimeout;
let game;
try {
  globalThis.setInterval = globalThis.setTimeout = () => ({ unref() {} });
  game = new Game(JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))), new DB(data));
  for (const [name, sys, stellar] of [
    ['Radio Explorer', 'brightwater', 'brightwater-iv'],
    ['Radio Lost', 'longreach', 'longreach-prime'],
    ['Knight', 'ninefold', 'ninefold-prime'],
  ]) {
    assert.equal(STELLARS[stellar]?.system, sys, 'valid seeded port');
    const d = game.db.create(name, 'test-only', game.fresh());
    Object.assign(d, { sys, stellar, tut: 999, story: { done: ['start'], active: null } });
  }
  game.db.touch();
  game.db.flush();
} finally {
  globalThis.setInterval = interval;
  globalThis.setTimeout = timeout;
}
// Fixture positioning/ambient removal only; real authenticated jump/arrival/discovery code runs.
const preload = path.join(dir, 'preload.mjs');
fs.writeFileSync(
  preload,
  `import {Game} from ${JSON.stringify(pathToFileURL(path.join(root, 'server/game.js')).href)};
const spawn=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(s,...args){spawn.call(this,s,...args);if(!s.data.name.startsWith('Radio '))return;const sp=this.spaces[s.data.sys];for(const e of [...sp.ships.values()])if(!e.player&&!e.owner)sp.remove(e);sp.spawnT=1e9;Object.assign(s.ent,{x:20000,y:20000,vx:0,vy:0,fuel:1000});};`,
);
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.js', '--import', preload, 'server/main.js'],
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
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        window.radioSocket = this;
        this.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (m.t === 'toast') (window.radioToasts ||= []).push(m.msg);
        });
      }
    };
    window.radioPlays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.includes('/fixture/radio-')) {
        window.radioPlays.push(this.src);
        window.radioAudio = this;
      }
      return play.apply(this, args);
    };
  });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (/iheart|ihrhls|cdnjs.*hls/.test(r.url())) external.push(r.url());
  });
  const login = async (name) => {
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
    () => G.you.sys === 'farmouth' && G.you.radioStations.includes('qvri'),
    null,
    { timeout: 15000 },
  );
  assert.deepEqual(await stations(), ['Wave Function Collapse', "QVRI Que'vari Radio"]);
  assert.equal(
    await page.evaluate(
      () => radioToasts.filter((t) => t.includes('Discovered a new radio station: QVRI')).length,
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
        (window.radioToasts || []).filter((t) => t.includes('Discovered a new radio station'))
          .length,
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
    () => G.you.sys === 'lost-signal' && G.you.radioStations.includes('signal-superposition'),
    null,
    { timeout: 15000 },
  );
  assert.deepEqual(await stations(), ['Wave Function Collapse', 'Signal Superposition Radio']);
  assert.equal(
    await page.evaluate(
      () => radioToasts.filter((t) => t.includes('Discovered a new radio station: Signal')).length,
    ),
    1,
  );
  await logout();
  await login('Knight');
  assert.deepEqual(
    await stations(),
    RADIO_STATIONS.map((s) => s.name),
  );
  await page.getByRole('button', { name: 'Play Wave Function Collapse', exact: true }).click();
  await page.locator('#rnow').getByText('ON AIR · SHUFFLE', { exact: true }).waitFor();
  assert.equal(
    await page.locator('#rtrack b').innerText(),
    'Broadcast',
    'real recording title hidden for station 1',
  );
  await page.getByRole('button', { name: 'Play Super-Idol Radio', exact: true }).click();
  await page.locator('#rnow').getByText('ON AIR · ALBUM LOOP', { exact: true }).waitFor();
  assert.equal(
    await page.locator('#rtrack b').innerText(),
    RADIO_STATIONS[4].tracks[0].title,
    'published first album track is visible',
  );
  // Use the actual QoL keyboard handles for a readable five-station screenshot.
  await page.locator('#radarheightgrip').focus();
  await page.keyboard.press('Home');
  await page.locator('#menuheightgrip').focus();
  for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowDown');
  await page.locator('#rnow').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'five-stations-playing.png') });
  await page.locator('#rstop').click();
  // Fetch and truly decode every owner recording, including the separate login theme.
  const decoded = await page.evaluate(async () => {
    const { RADIO_STATIONS } = await import('/shared/radio-stations.js');
    const context = new AudioContext({ sampleRate: 22050 }),
      results = [];
    try {
      for (const url of [
        ...RADIO_STATIONS.flatMap((s) => s.tracks.map((t) => t.url)),
        '/assets/sfx/music_login33.mp3',
      ]) {
        const response = await fetch(url);
        if (!response.ok) throw Error('Missing recording ' + url);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        const samples = buffer.getChannelData(0);
        let peak = 0;
        for (let i = 22050; i < samples.length; i += 997)
          peak = Math.max(peak, Math.abs(samples[i]));
        if (buffer.duration <= 0 || peak < 0.001) throw Error('Silent or invalid recording ' + url);
        results.push({ url, duration: buffer.duration, channels: buffer.numberOfChannels, peak });
      }
    } finally {
      await context.close();
    }
    return results;
  });
  assert.equal(decoded.length, 33);
  fs.writeFileSync(
    path.join(out, 'recording-decodes.json'),
    JSON.stringify(decoded, null, 2) + '\n',
  );
  // Natural ended advancement uses tiny silent WAV fixtures to avoid waiting through a full album.
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF');
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
  wav.writeUInt32LE(16000, 40);
  await page.route('**/fixture/radio-*.wav', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }),
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
    await page.evaluate(() => radioPlays.slice(0, 4).map((url) => new URL(url).pathname)),
    [
      '/fixture/radio-A.wav',
      '/fixture/radio-B.wav',
      '/fixture/radio-C.wav',
      '/fixture/radio-A.wav',
    ],
  );
  await page.locator('#rnow').getByText('ON AIR · ALBUM LOOP', { exact: true }).waitFor();
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
  fs.writeFileSync(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        status: 'pass',
        discovery: 'real authenticated jumps, repeat reconnect, same-browser captain isolation',
        screenshot:
          'Knight receives all stations without seeded unlocks; real owner album playing in actual HUD',
        playback:
          'all 33 owner recordings really decoded, actual station playback/title hiding; natural ended A B C A exercised with test-only short WAV responses',
        errors,
        external,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS actual jumps/discoveries, reconnect, locked/favorites isolation, Knight access, owner audio/title rules and 33 real decodes, fixture album ended loop and OFF',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
