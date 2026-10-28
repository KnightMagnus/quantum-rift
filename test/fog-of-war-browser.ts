import { launchChromium } from './helpers/chromium.ts';
// Fog of war on the real galaxy map: a new Concordia pilot sees only Concordia and its
// neighbours; a Concord star chart reveals Concord space; plotting stays inside known space.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Page } from 'playwright';
import {
  availablePort,
  cleanup,
  evidenceDir,
  failureEvidence,
  ready,
  root,
} from './helpers/browser-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, START } from '../shared/galaxy.ts';
import { augmentAssets } from '../shared/rules.ts';
import { chartSystems } from '../shared/map-knowledge.ts';

const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-fog-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || evidenceDir('fog-of-war');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const addCaptain = (name: string, charted: string[] = []) => {
  // A brand-new captain, exactly as account creation leaves them, past the tutorial.
  const playerData = { ...Game.prototype.fresh.call({ A: assets }), charted };
  playerData.tut = 999;
  return database.create(name, 'solo', playerData);
};
const concord = chartSystems(systemsById, 'quantum');
addCaptain('New Pilot');
addCaptain('Chart Pilot', concord);
database.touch();
database.flush();

const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', path.join(root, 'test/helpers/seed-random.ts'), 'server/local-main.ts'],
  {
    cwd: root,
    env: { ...process.env, SOLO: '1', PORT: String(port), DATA_DIR: path.join(directory, 'data') },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);

async function playAs(page: Page, name: string) {
  await page.goto(origin);
  await page.locator(`[data-slot="${name}"]`).click();
  await page.waitForFunction(() => window.G?.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.keyboard.press('KeyM');
  await page.locator('#gmap').waitFor({ state: 'visible' });
  await page.locator('#gfit').click();
  await page.waitForTimeout(300);
}
/** Map hit-test at a system's on-screen position: null when the system is not drawn. */
const hitAt = (page: Page, id: string) =>
  page.evaluate(async (systemId) => {
    const { SYS } = await import('/shared/galaxy.js');
    const { mapHit } = await import('/render.js');
    const view = G.mapXform!;
    const system = SYS[systemId];
    return mapHit(
      G,
      view.W / 2 + (system.x - view.cx) * view.k,
      view.H / 2 + (system.y - view.cy) * view.k,
    );
  }, id);

let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  await ready(server, origin);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(event.message));

  await playAs(page, 'New Pilot');
  assert.deepEqual(await page.evaluate(() => G.you!.explored), [START.system]);
  await page.screenshot({ path: path.join(evidence, 'new-pilot-concordia-map.png') });
  const neighbour = systemsById[START.system].links[0];
  const hidden = systemsById[neighbour].links.find(
    (id) => id !== START.system && !systemsById[START.system].links.includes(id),
  )!;
  assert.equal(await hitAt(page, neighbour), neighbour, 'a neighbouring system is on the map');
  assert.equal(await hitAt(page, hidden), null, 'a system two jumps out is hidden');
  // Searching does not reveal hidden systems either.
  await page.fill('#gsearch', systemsById[hidden].name);
  await page.waitForTimeout(150);
  assert.doesNotMatch(
    await page.locator('#gresults').innerText(),
    new RegExp(systemsById[hidden].name),
    'search does not list hidden systems',
  );
  await page.fill('#gsearch', systemsById[neighbour].name);
  await page.waitForFunction(
    (name) => document.getElementById('gresults')!.textContent!.includes(name),
    systemsById[neighbour].name,
  );
  assert.match(
    await page.locator('#gresults').innerText(),
    /unvisited system/i,
    'name-only search results do not reveal the neighbouring faction',
  );
  await page.fill('#gsearch', '');
  // Neighbours show their name only.
  await page.evaluate(
    async ({ id }) => {
      G.hoverSys = id;
      (await import('/ui.js')).openMap();
    },
    { id: neighbour },
  );
  const neighbourInfo = await page.locator('#ginfo').innerText();
  assert.match(neighbourInfo, /not yet visited/);
  assert.doesNotMatch(neighbourInfo, /danger|shipyard|market/, 'no detail before visiting');
  // The rendered map must not leak neighbour port markers or world-event details.
  const unknownOverlays = await page.evaluate(async (neighbourId) => {
    const { galaxy } = await import('/render.js');
    const { ANOMALIES } = await import('/shared/fronts.js');
    const { SYS } = await import('/shared/galaxy.js');
    const originalWorld = G.world;
    const anomaly = Object.keys(ANOMALIES)[0];
    G.world = { ...G.world!, anomalies: { [neighbourId]: anomaly }, states: {}, invasion: null };
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const context = canvas.getContext('2d')!;
    const texts: string[] = [];
    const fills: string[] = [];
    const fillText = context.fillText.bind(context);
    const fill = context.fill.bind(context);
    context.fillText = (...args: Parameters<typeof context.fillText>) => {
      texts.push(args[0]);
      fillText(...args);
    };
    context.fill = () => {
      if (typeof context.fillStyle === 'string') fills.push(context.fillStyle);
      fill();
    };
    try {
      galaxy(G, context, { big: true });
      return {
        eventVisible: texts.includes(ANOMALIES[anomaly].icon),
        stationMarkers: fills.filter((color) => color === '#8a70b0').length,
        expectedStations: SYS[G.sys!].stellars.some((body) => body.site) ? 1 : 0,
      };
    } finally {
      G.world = originalWorld;
    }
  }, neighbour);
  assert.equal(unknownOverlays.eventVisible, false, 'name-only neighbours hide event details');
  assert.equal(
    unknownOverlays.stationMarkers,
    unknownOverlays.expectedStations,
    'port markers appear only for known systems',
  );
  // Plotting into hidden space is refused; one hop out is fine.
  await page.evaluate(async (id) => (await import('/ui.js')).plot(id), hidden);
  assert.deepEqual(await page.evaluate(() => G.route), [], 'no route through unvisited space');
  await page.evaluate(async (id) => (await import('/ui.js')).plot(id), neighbour);
  assert.deepEqual(await page.evaluate(() => G.route), [neighbour]);
  await page.screenshot({ path: path.join(evidence, 'new-pilot-plotted-neighbour.png') });
  await page.close();

  const charted = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  charted.on('pageerror', (event) => errors.push(event.message));
  await playAs(charted, 'Chart Pilot');
  const farConcord = concord.find(
    (id) => id !== START.system && !systemsById[START.system].links.includes(id),
  )!;
  assert.equal(await hitAt(charted, farConcord), farConcord, 'charted Concord space is drawn');
  await charted.screenshot({ path: path.join(evidence, 'concord-chart-map.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, evidence }, null, 2));
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
