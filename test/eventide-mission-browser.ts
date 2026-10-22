import { fileURLToPath as resolvePreloadFile } from 'node:url';
// Actual Solo board acceptance, exported save/reload, jump authority and delivery payout.
// A test-only server preload positions the disposable captain clear of departure mass-lock,
// then beside the destination after a REAL server jump. It never changes missions/rewards.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
const { chromium } = (await import(
  process.env.PLAYWRIGHT_MODULE || ('playwright' as string)
)) as typeof import('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-eventide-ui-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(directory, 'evidence');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'shared/assets.json')).toString(),
);
augmentAssets(assets);
const database = new Database(path.join(directory, 'data')),
  playerData = Game.prototype.fresh.call({ A: assets }) as ReturnType<
    import('../server/game.ts').Game['fresh']
  > & {
    story?: { done: string[]; active: null; step: number };
  };
playerData.sys = 'lantern-twins';
playerData.stellar = 'twins-exchange';
playerData.tut = 999;
playerData.credits = 1000000;
database.create('Eventide Supply', 'solo', playerData);
const fixture = resolvePreloadFile(
  new URL('./fixtures/preload-eventide-mission-browser.ts', import.meta.url),
);

const port = Number(process.env.RIFT_BROWSER_PORT || 18844),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', fixture, 'server/main.ts'], {
  cwd: root,
  env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(directory, 'data') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (let index = 0; index < 100; index++) {
    try {
      if ((await fetch(origin + '/api/status')).ok) break;
    } catch {}
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(event.message));
  await page.addInitScript(() => {
    const canvasWidth = window.WebSocket;
    window.WebSocket = class extends canvasWidth {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.testSocket = this;
      }
    };
  });
  const login = async () => {
    await page.goto(origin);
    await page.locator('[data-slot="Eventide Supply"]').click();
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
  };
  await login();
  await page.click('[data-lt="jobs"]');
  const accept = page.locator(
    '[data-act="accept"][data-id^="eventide-twins-exchange-"][data-id$="-supply"]',
  );
  await accept.click();
  await page.waitForFunction(() =>
    G.you!.missions.some(
      (message) => message.id.startsWith('eventide-') && message.type === 'cargo',
    ),
  );
  const missionOffer = await page.evaluate(() =>
    G.you!.missions.find(
      (message) => message.id.startsWith('eventide-') && message.type === 'cargo',
    ),
  );
  const save1 = await (await fetch(origin + '/api/export?name=Eventide%20Supply')).json();
  assert.ok(save1.save.missions.some((message: { id: string }) => message.id === missionOffer!.id));
  fileSystem.writeFileSync(
    path.join(evidence, 'accepted-save.json'),
    JSON.stringify(save1, null, 2),
  );
  await page.screenshot({ path: path.join(evidence, 'accepted-board.png') });
  await page.reload();
  await page.locator('[data-slot="Eventide Supply"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  assert.ok(
    await page.evaluate(
      (identifier: string) => G.you!.missions.some((message) => message.id === identifier),
      missionOffer!.id,
    ),
  );
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  const credits = await page.evaluate(() => G.you!.credits);
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.evaluate(() => testSocket.send(JSON.stringify({ t: 'jump', to: 'aureole' })));
  await page.waitForFunction(() => G.sys === 'aureole' && G.view, { timeout: 15000 });
  await page.evaluate(() =>
    testSocket.send(JSON.stringify({ t: 'land', stellar: 'aureole-ring' })),
  );
  await page.waitForFunction(() => G.landed?.stellar === 'aureole-ring');
  assert.equal(
    await page.evaluate(
      (identifier: string) => G.you!.missions.some((message) => message.id === identifier),
      missionOffer!.id,
    ),
    false,
  );
  const paid = await page.evaluate(() => G.you!.credits);
  assert.ok(paid >= credits + missionOffer!.reward);
  const save2 = await (await fetch(origin + '/api/export?name=Eventide%20Supply')).json();
  assert.ok(
    !save2.save.missions.some((message: { id: string }) => message.id === missionOffer!.id),
  );
  await page.screenshot({ path: path.join(evidence, 'delivered-aureole.png') });
  assert.deepEqual(errors, []);
  const results = {
    pass: true,
    job: missionOffer!.title,
    destination: missionOffer!.dest,
    saveRetainedAfterReload: true,
    normalServerJump: true,
    reward: missionOffer!.reward,
    creditsBefore: credits,
    creditsAfter: paid,
    errors,
    testOnlyPositionFixture: true,
  };
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  server.kill();
}
