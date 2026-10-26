import type { PreloadConfig } from './fixtures/preload-armada-follow-two-clients.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
  delay,
} from './helpers/browser-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-follow-two-'));
const evidence = process.env.RIFT_TWO_FOLLOW_DIR || evidenceDir('armada-two-clients');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const names = ['Cruising Leader', 'Cruising Follower'];
for (const name of names) {
  const playerData = Game.prototype.fresh.call({ A: assets });
  playerData.ship = makeLoadout(assets, 704, name);
  playerData.tut = 999;
  database.create(name, 'fixture', playerData);
}
database.flush();
const telemetry = path.join(evidence, 'telemetry.json');
const gestureControlPath = path.join(evidence, 'gesture-control.json');
function nativeGestures(enabled: boolean) {
  fileSystem.writeFileSync(
    gestureControlPath + '.next',
    JSON.stringify({ nativeGestures: enabled }),
  );
  fileSystem.renameSync(gestureControlPath + '.next', gestureControlPath);
}
nativeGestures(false);
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-armada-follow-two-clients.ts', import.meta.url),
);
// Disclosed reachable initial cruise: matched forward velocity with 0.3 units/s
// residual lateral drift, inside the normal V slot. Thereafter only production
// tick/input handling changes movement; no teleports or boosted flight stats.

const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    '--import',
    path.join(root, 'test/helpers/seed-random.ts'),
    '--import',
    fixture,
    'server/local-main.ts',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      RIFT_PRELOAD_CONFIGURATION: JSON.stringify({
        captainNames: names,
        leaderName: names[0],
        telemetryPath: telemetry,
        gestureControlPath,
      } satisfies PreloadConfig),
      SOLO: '',
      PORT: String(port),
      DATA_DIR: path.join(directory, 'data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
const read = () => {
  try {
    return JSON.parse(fileSystem.readFileSync(telemetry).toString());
  } catch {
    return { t: 0, trace: [] };
  }
};
async function until<Value>(
  callback: () => Value | Promise<Value>,
  label: string,
  milliseconds = 15000,
) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const result = await callback();
    if (result) return result;
    await delay(30);
  }
  throw Error(label);
}
let browser;
const pages = [],
  errors: string[] = [];
try {
  await ready(server, origin);
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  for (const name of names) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (entity) => errors.push(String(entity)));
    await page.goto(origin);
    await page.waitForFunction(
      () => typeof G !== 'undefined' && !!document.getElementById('lver')!.textContent,
    );
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => typeof G !== 'undefined' && G.you && G.landed);
  }
  const [leader, follower] = pages;
  // Exercise the shortest actual player setup: direct INVITE auto-forms the
  // Armada. No friend request, separate FORM step or raw-socket setup shortcuts.
  for (const page of pages) {
    for (
      let quantity = 0;
      quantity < 12 && (await page.locator('#storybox').isVisible());
      quantity++
    )
      await page.locator('#storyb button').first().click();
    await page.click('#traytoggle');
    await page.getByText('ALLIES', { exact: true }).click();
    await page.locator('#capview [data-cs=armada]').click();
  }
  await leader.fill('#ainv', names[1]);
  await leader.locator('[data-cact=ainv2]').click();
  await leader.waitForFunction(() => G.you!.armada?.id);
  const identifier = await leader.evaluate(() => G.you!.armada!.id);
  assert.equal(await leader.locator('#afollow').count(), 0, 'leader does not follow itself');
  await leader.screenshot({ path: path.join(evidence, 'setup-01-leader.png') });
  await follower.getByRole('button', { name: 'JOIN', exact: true }).waitFor();
  await follower.screenshot({ path: path.join(evidence, 'setup-02-invitation.png') });
  await follower.getByRole('button', { name: 'JOIN', exact: true }).click();
  await follower.waitForFunction(
    (expectedArmadaId) => G.you!.armada?.id === expectedArmadaId,
    identifier,
  );
  assert.equal(
    await follower.locator('#afollow').isChecked(),
    false,
    'joining is not flight consent',
  );
  await follower.screenshot({ path: path.join(evidence, 'setup-03-joined.png') });
  for (const page of pages) {
    for (
      let quantity = 0;
      quantity < 12 && (await page.locator('#storybox').isVisible());
      quantity++
    )
      await page.locator('#storyb button').first().click();
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
  }
  await follower.getByText('ALLIES', { exact: true }).click();
  await follower.locator('#capview [data-cs=armada]').click();
  assert.equal(
    await follower.evaluate(() => G.you!.armada!.follow),
    false,
    'departure does not opt in',
  );
  await follower.locator('#afollow').check();
  await follower.waitForFunction(() => G.formation);
  await follower.screenshot({ path: path.join(evidence, 'setup-04-follow-active.png') });
  await follower.locator('#afollow').uncheck();
  await follower.waitForFunction(() => !G.you!.armada!.follow && !G.formation);
  await follower.locator('#afollow').check();
  await follower.waitForFunction(() => G.formation);
  const start = read().t;
  await until(() => read().t > start + 60, 'sixty seconds authoritative cruise');
  const cruise = read().trace.filter(
    (result: { t: number }) => result.t > start + 1 && result.t < start + 60,
  );
  let rotation = 0,
    maxError = 0,
    minSpeed = Infinity;
  for (let index = 1; index < cruise.length; index++) {
    const entity = cruise[index].ships.find(
        (session: { name: string }) => session.name === names[1],
      ),
      prev = cruise[index - 1].ships.find((session: { name: string }) => session.name === names[1]);
    rotation += Math.abs(Math.atan2(Math.sin(entity.a - prev.a), Math.cos(entity.a - prev.a)));
    maxError = Math.max(
      maxError,
      Math.hypot(entity.x - entity.target.x, entity.y - entity.target.y),
    );
    minSpeed = Math.min(minSpeed, Math.hypot(entity.vx, entity.vy));
  }
  const cruiseResult = { rotation, maxError, minSpeed, samples: cruise.length };
  fileSystem.writeFileSync(
    path.join(evidence, 'cruise.json'),
    JSON.stringify({ summary: cruiseResult, trace: cruise }, null, 2),
  );
  assert.ok(rotation < 0.2, `matched cruising must not circle: ${rotation}rad`);
  assert.ok(maxError < 65, `maintains formation: ${maxError}`);
  assert.ok(minSpeed > 76, 'does not stop during leader cruise');
  await follower.screenshot({ path: path.join(evidence, 'matched-cruise.png') });
  // Keep key gestures on the native Game timer. Accelerated wall-clock holds varied
  // by runner and could drive the leader to the identical follower speed ceiling.
  nativeGestures(true);
  await until(() => read().ticksPerInterval === 0, 'native gesture clock acknowledged');
  // Real browser keys, not a second socket/session, drive sharp turn and restart.
  const beforeKeys = read()
    .trace.at(-1)
    .ships.find((session: { name: string }) => session.name === names[0]);
  await leader.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await leader.keyboard.down('ArrowRight');
  await until(() => {
    const ship = read()
      .trace.at(-1)
      .ships.find((session: { name: string }) => session.name === names[0]);
    return (
      Math.abs(Math.atan2(Math.sin(ship.a - beforeKeys.a), Math.cos(ship.a - beforeKeys.a))) > 0.7
    );
  }, 'real keyboard changes leader heading');
  await leader.keyboard.up('ArrowRight');
  await until(
    () =>
      read()
        .trace.at(-1)
        .ships.find((ship: { name: string }) => ship.name === names[0]).inp.turn === 0,
    'turn release acknowledged',
  );
  await leader.keyboard.down('ArrowUp');
  await until(() => {
    const ship = read()
      .trace.at(-1)
      .ships.find((session: { name: string }) => session.name === names[0]);
    return Math.hypot(ship.vx - beforeKeys.vx, ship.vy - beforeKeys.vy) > 10;
  }, 'real keyboard changes leader velocity');
  await leader.keyboard.up('ArrowUp');
  await until(
    () =>
      read()
        .trace.at(-1)
        .ships.find((ship: { name: string }) => ship.name === names[0]).inp.thrust === 0,
    'thrust release acknowledged',
  );
  const turnedLeader = read()
    .trace.at(-1)
    .ships.find((ship: { name: string }) => ship.name === names[0]);
  assert.ok(
    Math.hypot(turnedLeader.vx, turnedLeader.vy) < turnedLeader.maxSpeed * 0.9,
    'leader leaves physical catch-up speed headroom',
  );
  nativeGestures(false);
  await until(() => read().ticksPerInterval === 8, 'accelerated coast clock acknowledged');
  const turnStart = read().t;
  // 180 simulated seconds need 13.5s even at the ideal accelerated tick rate.
  // Leave scheduling headroom on hosted runners; retain the same simulated
  // duration and formation bounds, plus the enclosing 180s process deadline.
  await until(() => read().t > turnStart + 180, 'reacquisition after leader turn', 30000);
  const afterTurn = read().trace.at(-1),
    follow = afterTurn.ships.find((session: { name: string }) => session.name === names[1]);
  assert.equal(follow.follow, true, 'turn preserves Follow');
  assert.ok(
    Math.hypot(follow.x - follow.target.x, follow.y - follow.target.y) < 100,
    'recovers slot after sharp leader turn',
  );
  // Follower manual takeover must still revoke consent and reach normal physics.
  await follower.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await follower.keyboard.down('ArrowUp');
  await delay(100);
  await follower.keyboard.up('ArrowUp');
  await until(
    () =>
      read()
        .trace.at(-1)
        .ships.find((session: { name: string }) => session.name === names[1]).follow === false,
    'manual follower takeover',
  );
  // Consent is transient: reconnecting while actively following must require
  // another explicit opt-in, while preserving the Armada membership itself.
  await follower.locator('#afollow').check();
  await follower.waitForFunction(() => G.you!.armada!.follow && G.formation);
  await follower.reload();
  await follower.locator('#lname').waitFor();
  if (await follower.locator('#lname').isVisible()) {
    await follower.fill('#lname', names[1]);
    await follower.fill('#lpass', 'fixture');
    await follower.click('#lbtn');
  }
  await follower.waitForFunction(
    (expectedArmadaId) => G.you?.armada?.id === expectedArmadaId,
    identifier,
  );
  assert.equal(
    await follower.evaluate(() => G.you!.armada!.follow),
    false,
    'reconnect revokes flight consent',
  );
  await follower.click('#traytoggle');
  await follower.getByText('ALLIES', { exact: true }).click();
  await follower.locator('#capview [data-cs=armada]').click();
  assert.equal(await follower.locator('#afollow').isChecked(), false);
  await follower.screenshot({ path: path.join(evidence, 'setup-05-reconnect-opt-in.png') });
  await Promise.all(
    pages.map((player, index) =>
      player.screenshot({ path: path.join(evidence, `client-${index}.png`) }),
    ),
  );
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(evidence, 'RESULTS.json'),
    JSON.stringify(
      {
        accounts: names,
        browserContexts: 2,
        setup: {
          directInviteAutoForms: true,
          joinedThroughUI: true,
          joinPreservesNoConsent: true,
          checkboxOffAndOn: true,
          activeReconnectRevokesConsent: true,
        },
        cruise: cruiseResult,
        turnGesture: turnedLeader,
        afterTurn,
        manualTakeover: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Two independent Chromium multiplayer accounts: sustained coasting without circling/stopping, sharp-turn reacquisition, real-key manual takeover passed.',
    cruiseResult,
  );
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
