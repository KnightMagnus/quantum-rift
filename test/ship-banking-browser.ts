import { launchChromium } from './helpers/chromium.ts';
import type { PreloadConfig } from './fixtures/preload-ship-banking-browser.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
import type { RenderEntity } from '../client/render.ts';
// Real NPC trade/landing AI, server snapshots and browser render frames: bank roll regression.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-banking-browser-'),
);
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(directory, 'evidence');
fileSystem.mkdirSync(evidence, { recursive: true });
fileSystem.writeFileSync(path.join(evidence, 'server-samples.jsonl'), '');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const fresh = Game.prototype.fresh.call({ A: assets });
fresh.ship = makeLoadout(assets, 703, 'Banking Observer');
fresh.tut = 999;
// Deliberately retain normal Ops 0 newcomer protection and an inner-system location.
assert.equal(fresh.station.ops, 0);
database.create('Banking Observer', 'browser-banking', fresh);
const telemetry = path.join(evidence, 'telemetry.json');
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-ship-banking-browser.ts', import.meta.url),
);

const port = Number(process.env.RIFT_BROWSER_PORT || 18776);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', fixture, 'server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    RIFT_PRELOAD_CONFIGURATION: JSON.stringify({
      telemetryPath: telemetry,
      samplesPath: path.join(evidence, 'server-samples.jsonl'),
    } satisfies PreloadConfig),
    PORT: String(port),
    DATA_DIR: path.join(directory, 'data'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
const read = () => {
  try {
    return JSON.parse(fileSystem.readFileSync(telemetry, 'utf8'));
  } catch {
    return null;
  }
};
const until = async (
  check: (value: { id: number; turn: number }) => unknown,
  label: string,
  timeout = 15000,
) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const bankingProbe = read();
    if (bankingProbe && check(bankingProbe)) return bankingProbe;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`${label}: ${JSON.stringify(read())}`);
};
let browser;
try {
  for (let index = 0; index < 100; index++) {
    if (server.exitCode !== null) throw new Error(`Server exited ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors: string[] = [],
    messages = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('websocket', (webSocket) =>
    webSocket.on('framesent', (feature) => {
      try {
        messages.push(JSON.parse(String(feature.payload)));
      } catch {}
    }),
  );
  if (process.env.RIFT_ASSET_FALLBACK)
    await page.route('**/assets/**', async (route) => {
      const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
      const local = path.join(root, 'client', relative);
      if (
        !fileSystem.existsSync(local) ||
        !fileSystem
          .readFileSync(local)
          .subarray(0, 43)
          .toString()
          .startsWith('version https://git-lfs.github.com/spec/v1')
      )
        return route.continue();
      const fallback = path.join(process.env.RIFT_ASSET_FALLBACK!, relative);
      return fileSystem.existsSync(fallback) ? route.fulfill({ path: fallback }) : route.continue();
    });
  await page.goto(origin);
  await page.fill('#lname', 'Banking Observer');
  await page.fill('#lpass', 'browser-banking');
  await page.click('#lbtn');
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const initial = await until((shipTelemetry) => shipTelemetry.id, 'trader spawned');
  await page.waitForFunction((identifier: number) => G.ents.has(identifier), initial.id);
  const recording = page.evaluate(async (identifier: number) => {
    const samples: {
      time: number;
      bank: number;
      rate: number;
      angle: number;
      snapshotAt: number;
    }[] = [];
    await new Promise<void>((resolve) => {
      const deadline2 = performance.now() + 13000;
      const collect = () => {
        const entity = G.ents.get(identifier) as
          | (RenderEntity & { _bank?: { bank: number; rate: number } })
          | undefined;
        if (entity?._bank)
          samples.push({
            time: performance.timeOrigin + performance.now(),
            bank: entity._bank.bank,
            rate: entity._bank.rate,
            angle: entity.a,
            snapshotAt: performance.timeOrigin + entity.t!,
          });
        if (performance.now() < deadline2) requestAnimationFrame(collect);
        else resolve();
      };
      requestAnimationFrame(collect);
    });
    return samples;
  }, initial.id);
  await until(
    (turnTelemetry: { turn: number }) => Math.abs(turnTelemetry.turn) > 0,
    'real trader steering',
  );
  await new Promise((resolve) => setTimeout(resolve, 550));
  await page.screenshot({ path: path.join(evidence, 'trader-turn.png') });
  const banks = await recording;
  const serverSamples = fileSystem
    .readFileSync(path.join(evidence, 'server-samples.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  // Locate sustained real steering runs, then skip filter startup and steering endpoints.
  const runs = [];
  for (const sample of serverSamples.filter((session) => !session.dead)) {
    let runScenario: { turn: number; start: number; end: number; samples: number } | undefined =
      runs.at(-1);
    if (!runScenario || runScenario.turn !== sample.turn) {
      runScenario = { turn: sample.turn, start: sample.time, end: sample.time, samples: 0 };
      runs.push(runScenario);
    }
    runScenario.end = sample.time;
    runScenario.samples++;
  }
  const turning = runs.filter(
    (runScenario2) =>
      Math.abs(runScenario2.turn) > 0 && runScenario2.end - runScenario2.start >= 600,
  );
  assert.ok(turning.length > 0, 'real NPC trade AI produced a sustained turn');
  const verifiedTurns = [];
  for (const runScenario3 of turning) {
    const frames = banks.filter(
      (sample: { time: number }) =>
        sample.time >= runScenario3.start + 300 && sample.time <= runScenario3.end - 100,
    );
    if (frames.length < 8) continue;
    const expected = runScenario3.turn > 0 ? 1 : 2;
    assert.ok(
      frames.every((sample: { bank: number }) => sample.bank === expected),
      `bank must stay ${expected} across display frames during actual steering: ${JSON.stringify(frames.filter((sample: { bank: number }) => sample.bank !== expected).slice(0, 5))}`,
    );
    verifiedTurns.push({
      turn: runScenario3.turn,
      frames: frames.length,
      durationMs: runScenario3.end - runScenario3.start,
    });
  }
  assert.ok(verifiedTurns.length > 0, 'visible turn frames were recorded');
  const straight = runs.filter(
    (runScenario4) =>
      runScenario4.turn === 0 &&
      runScenario4.end - runScenario4.start >= 1000 &&
      runScenario4.start > turning[0].start,
  );
  const levelFrames = straight.flatMap((runScenario5) =>
    banks.filter(
      (sample: { time: number }) =>
        sample.time >= runScenario5.start + 600 && sample.time <= runScenario5.end - 100,
    ),
  );
  assert.ok(levelFrames.length >= 8, 'a visible settled-heading run was recorded');
  assert.ok(
    levelFrames.every((sample) => sample.bank === 0),
    'settled heading returns to and holds level',
  );
  assert.ok(
    serverSamples.every((sample) => sample.ai === 'trade' && sample.target === 0),
    'fixture used normal noncombat trade AI throughout',
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidence, 'trader-landed.png') });
  fileSystem.writeFileSync(
    path.join(evidence, 'browser-frames.json'),
    JSON.stringify(banks, null, 2),
  );
  const result = {
    pass: true,
    verifiedTurns,
    levelFrames: levelFrames.length,
    serverSamples: serverSamples.length,
    browserFrames: banks.length,
    pageErrors: errors,
    evidence,
  };
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  serverLog.end();
}
