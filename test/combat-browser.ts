import { launchChromium } from './helpers/chromium.ts';
import type { PreloadConfig } from './fixtures/preload-combat-browser.ts';
import { fileURLToPath as resolvePreloadFile } from 'node:url';
// Real browser -> target packet -> assist button -> server steering/fire regression.
// Isolated Solo server: inert target control or real ordinary/named trader AI.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets, makeLoadout } from '../shared/rules.ts';

const protection = process.env.RIFT_BROWSER_PROTECTION === '1';
const neutral = process.env.RIFT_BROWSER_TARGET === 'neutral';
const drift = process.env.RIFT_BROWSER_DRIFT === '1';
const named = process.env.RIFT_BROWSER_NAMED === '1';
const live = named || process.env.RIFT_BROWSER_LIVE === '1';
const scenery = process.env.RIFT_BROWSER_SCENERY === '1';
const playerHull = Number(process.env.RIFT_BROWSER_PLAYER_HULL || 820);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-combat-browser-'),
);
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(directory, 'evidence');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString(),
);
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const fresh = Game.prototype.fresh.call({ A: assets }) as ReturnType<
  import('../server/game.ts').Game['fresh']
> & { story?: { done: string[]; active: null; step: number } };
fresh.ship = makeLoadout(assets, playerHull, 'Browser Assist');
fresh.tut = 999;
// Deliberately retain normal Ops 0 newcomer protection and an inner-system location.
assert.equal(fresh.station.ops, 0);
database.create('Browser Assist', 'browser-combat', fresh);
const telemetry = path.join(evidence, 'telemetry.json');
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-combat-browser.ts', import.meta.url),
);

const port = Number(process.env.RIFT_BROWSER_PORT || 18775);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', fixture, 'server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    RIFT_PRELOAD_CONFIGURATION: JSON.stringify({
      protection: protection,
      initialVelocityX: drift ? 80 : 0,
      initialVelocityY: drift ? 40 : 0,
      initialAngle: drift ? Math.PI / 2 : 0,
      targetFaction: neutral ? 'quantum' : 'hollow',
      namedTarget: named,
      movingTarget: live,
      telemetryPath: telemetry,
    } satisfies PreloadConfig),
    SOLO: '1',
    PORT: String(port),
    DATA_DIR: path.join(directory, 'data'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
interface CombatTelemetry {
  time: number;
  sys: string;
  newcomer: boolean;
  ops: number;
  state: string;
  player: {
    hull: number;
    a: number;
    vx: number;
    vy: number;
    inp: { thrust?: number };
    x: number;
    y: number;
    id: number;
    target: number;
  };
  foe: {
    id: number;
    state: string;
    hull: number;
    name: string;
    rival: string;
    ai: string;
    x: number;
    y: number;
    shield: number;
    armor: number;
    target: number;
    aggro: number[];
  };
  distance: number;
  shots: number;
  combat: import('../server/combat-assist.ts').CombatPayload;
  playerHealth: { shield: number; armor: number };
  retaliating: string[];
  npcTargets: [string, number][];
  hostile: boolean;
  canHit: boolean;
  reverseSpared: boolean;
}
const read = (): CombatTelemetry | null => {
  try {
    return JSON.parse(fileSystem.readFileSync(telemetry).toString());
  } catch {
    return null;
  }
};
const until = async (
  check: (telemetry: CombatTelemetry) => unknown,
  label: string,
  timeout = 15000,
) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const telemetry2 = read();
    if (telemetry2 && check(telemetry2)) return telemetry2;
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
    messages: { t: string; [entryKey: string]: unknown }[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('websocket', (webSocket) =>
    webSocket.on('framesent', (feature: { payload: string | import('node:buffer').Buffer }) => {
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
  if (scenery)
    await page.route('**/render.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + '\nexport { decorFor };',
      });
    });
  await page.goto(origin);
  await page.locator('[data-slot="Browser Assist"]').click();
  assert.equal(await page.evaluate(() => G.solo), true, 'actual Solo launch path');
  await page.waitForFunction(() => window.G?.you && G.landed);
  await page.click('#optbtn');
  assert.equal(
    await page.locator('#opt-assistMissiles').isChecked(),
    true,
    'legacy default permits missiles',
  );
  await page.locator('#opt-assistMissiles').uncheck();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('rift.opts') || '{}').assistMissiles),
    false,
  );
  await page.click('#optclose');
  await page.reload();
  await page.locator('[data-slot="Browser Assist"]').click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  await page.click('#optbtn');
  assert.equal(
    await page.locator('#opt-assistMissiles').isChecked(),
    false,
    'missile preference survives reload',
  );
  await page.locator('#opt-assistMissiles').check();
  await page.click('#optclose');

  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const initial = await until(
    (telemetry3) => telemetry3.foe.id && telemetry3.player.target === 0,
    'spawn fixture',
  );
  assert.equal(initial.newcomer, true);
  assert.equal(initial.ops, 0);
  assert.equal(initial.foe.target, 0);
  assert.deepEqual(initial.foe.aggro, []);
  assert.equal(initial.hostile, !neutral, 'fixture uses requested relationship');
  assert.equal(initial.reverseSpared, true, 'ambient NPC fixture exercises newcomer truce');
  let passive: CombatTelemetry | undefined;
  if (protection) {
    assert.equal(initial.sys, 'dimmer');
    await new Promise((resolve) => setTimeout(resolve, 8000));
    passive = read()!;
    assert.ok(
      passive.npcTargets.every(([, identifier]) => identifier !== passive!.player.id),
      'ambient NPCs ignore passive captain after arrival grace',
    );
    assert.equal(passive.foe.target, 0);
    assert.equal(passive.playerHealth.armor, initial.playerHealth.armor);
    assert.deepEqual(passive.retaliating, []);
    assert.match(await page.locator('#prot').innerText(), /NEWCOMER TRUCE/);
    await page.screenshot({ path: path.join(evidence, 'dimmer-passive.png') });
  }
  assert.equal(initial.canHit, true, 'normal player primary fire could legally hit this hostile');
  // Open the production function panel before exercising its authoritative action.
  await page.locator('#combatindicator').click();
  assert.equal(await page.locator('#combatcontrols').isVisible(), true);
  // A passive enable must not hunt an idle hostile merely because it exists nearby.
  await page.click('#combatassist');
  await page.waitForFunction(() => G.combat.on && G.combat.status === 'READY');
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(read()!.shots, 0);
  if (!drift && !named && !protection) assert.ok(read()!.distance > 1090);
  await page.click('#combatstop');
  await page.waitForFunction(() => !G.combat.on);
  // Click the visible radar blip, exercising the user's real target-selection UI.
  if (!(await page.locator('#radar').isVisible())) await page.locator('#traytoggle').click();
  await page.locator('#radar').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const radarCanvas = document.querySelector<HTMLCanvasElement>('#radar')!;
    return radarCanvas.width > 0 && radarCanvas.height > 0;
  });
  const blip = await page.evaluate((identifier: number) => {
    const entity = G.ents.get(identifier),
      localPlayer = G.view,
      radar = document.getElementById('radar');
    const rect = radar!.getBoundingClientRect();
    const radarScale = ((radar! as HTMLCanvasElement).height / 2 / (G.radarR || 4200)) * 1.15;
    return {
      entityPosition: { x: entity!.rx, y: entity!.ry },
      playerPosition: { x: localPlayer!.rx, y: localPlayer!.ry },
      radarRange: G.radarR,
      canvasDimensions: {
        width: (radar as HTMLCanvasElement).width,
        height: (radar as HTMLCanvasElement).height,
      },
      x:
        rect.left +
        (((radar! as HTMLCanvasElement).width / 2 + (entity!.rx - localPlayer!.rx) * radarScale) *
          rect.width) /
          (radar! as HTMLCanvasElement).width,
      y:
        rect.top +
        (((radar! as HTMLCanvasElement).height / 2 + (entity!.ry - localPlayer!.ry) * radarScale) *
          rect.height) /
          (radar! as HTMLCanvasElement).height,
    };
  }, initial.foe.id);
  assert.ok(Number.isFinite(blip.x) && Number.isFinite(blip.y), JSON.stringify(blip));
  await page.mouse.click(blip.x, blip.y);
  await page.waitForFunction((identifier: number) => G.target === identifier, initial.foe.id);
  await until(
    (telemetry4) => telemetry4.player.target === initial.foe.id,
    'server received selected target',
  );
  assert.ok(messages.some((message) => message.t === 'target' && message.id === initial.foe.id));
  assert.equal(
    messages.some((message) => message.t === 'order' && message.o === 'attack'),
    false,
    'no prior Attack command',
  );
  await page.click('#combatassist');
  await page.waitForFunction(() => G.combat.status === 'ENGAGING', null, { timeout: 5000 });
  const approached = await until(
    (telemetry5) =>
      telemetry5.distance < 900 &&
      telemetry5.combat.status === 'ENGAGING' &&
      telemetry5.combat.target === initial.foe.id,
    'automatic approach',
  );
  if (drift) {
    assert.ok(
      Math.abs(approached.player.a - initial.player.a) > 0.2,
      'Assist changes initial off-target heading',
    );
    assert.ok(
      Math.hypot(
        approached.player.vx - initial.player.vx,
        approached.player.vy - initial.player.vy,
      ) > 20,
      'Assist changes initial drift vector',
    );
  }
  assert.equal(approached.combat.target, initial.foe.id);
  assert.equal(approached.player.inp.thrust, 1, 'Assist applies actual thrust');
  const fired = await until(
    (combatProbe: { shots: number; foe: { shield: number } }) =>
      combatProbe.shots > 0 && combatProbe.foe.shield < 1000,
    'primary fire damages selected hostile',
    20000,
  );
  assert.equal(fired.combat.status, 'ENGAGING');
  if (protection) {
    assert.ok(
      fired.retaliating.includes('umbral'),
      'Assist actual hit permits faction retaliation',
    );
    await until(
      (telemetry6) => telemetry6.foe.target === telemetry6.player.id,
      'NPC responds to actual outgoing damage',
    );
  }
  assert.ok(fired.distance < initial.distance - 200);
  await page.screenshot({ path: path.join(evidence, 'combat-assist-engaging.png') });
  await page.keyboard.down('w');
  await page.waitForFunction(() => G.combat.status === 'SUSPENDED');
  await page.keyboard.up('w');
  await page.screenshot({ path: path.join(evidence, 'combat-assist-manual-takeover.png') });
  let sceneryResult;
  if (scenery) {
    sceneryResult = await page.evaluate(async () => {
      const { decorFor } =
        (await import('/render.js')) as typeof import('./helpers/render-probe.ts');
      const { SYS: systemsById } = await import('/shared/galaxy.js');
      const { cometPose, cometScreen, cometTailAngle } = await import('/comet.js');
      const decor = decorFor(systemsById[G.sys!]);
      // Inspect the naturally generated comet in the running game's complete
      // flight renderer, retaining all worlds/ships/UI and its actual sun.
      if (!decor.comet) throw new Error('Scenery fixture system must contain a natural comet');
      const canvas = document.getElementById('view');
      const canvasWidth = (canvas! as HTMLCanvasElement).width,
        canvasHeight = (canvas! as HTMLCanvasElement).height,
        zoom2 = G.zoom;
      const currentTime = performance.now(),
        pose = cometPose(decor.comet, currentTime);
      const cameraX = (pose.x + (canvasWidth * 0.15) / zoom2 ** 0.25) / 0.12;
      const cameraY = (pose.y + (canvasHeight * 0.2) / zoom2 ** 0.25) / 0.12;
      G._look = {} as typeof G._look;
      G._lookT = [cameraX - G.view!.rx, cameraY - G.view!.ry];
      G.lookX = G._lookT[0];
      G.lookY = G._lookT[1];
      const player = cometScreen(
        decor.comet,
        canvasWidth,
        canvasHeight,
        zoom2,
        cameraX,
        cameraY,
        currentTime,
      );
      const next = cometScreen(
        decor.comet,
        canvasWidth,
        canvasHeight,
        zoom2,
        cameraX,
        cameraY,
        currentTime + 30000,
      );
      const starPosition = {
        x: canvasWidth / 2 + (decor.sun!.x - cameraX * decor.sun!.depth) * zoom2 ** 0.25,
        y: canvasHeight / 2 + (decor.sun!.y - cameraY * decor.sun!.depth) * zoom2 ** 0.25,
      };
      return {
        sys: G.sys,
        landed: G.landed,
        naturalComet: true,
        p: player,
        next,
        sun: starPosition,
        tailAngle: cometTailAngle(player, starPosition),
        bgPlanets: decor.bgp!.length,
        canvas: { W: canvasWidth, H: canvasHeight },
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await page.screenshot({ path: path.join(evidence, 'comet-integrated-flight.png') });
    assert.equal(sceneryResult.landed, null);
    assert.ok(
      Math.hypot(
        sceneryResult.next.x - sceneryResult.p.x,
        sceneryResult.next.y - sceneryResult.p.y,
      ) > 20,
    );
  }
  assert.deepEqual(errors, []);
  const result = {
    scenery: sceneryResult,
    passive,
    initial,
    approached,
    fired,
    final: read(),
    pageErrors: errors,
    targetPackets: messages.filter((message) => message.t === 'target'),
    combatPackets: messages.filter((message) => message.t === 'combat'),
    evidence,
  };
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: true,
        targetRelationship: neutral ? 'neutral' : 'hostile',
        drift,
        named,
        live,
        playerHull,
        targetName: initial.foe.name,
        targetRival: initial.foe.rival,
        initialDistance: initial.distance,
        approachDistance: approached.distance,
        firingDistance: fired.distance,
        primaryShots: fired.shots,
        targetShield: fired.foe.shield,
        manualStatus: await page.locator('#combatstatus').innerText(),
        pageErrors: errors,
        evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  serverLog.end();
}
