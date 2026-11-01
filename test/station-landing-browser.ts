import sceneAdditions from '../shared/diversity-worlds.json' with { type: 'json' };
import { launchChromium } from './helpers/chromium.ts';
import type { StellarBody, StarSystem } from '../shared/galaxy.ts';
type StationSite = Parameters<typeof import('../client/exotic_scenery.ts').stationLanding>[3];
import {
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
// Real Solo login, landing UI, departure and complete production flight renderer.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-exotic-solo-'));
const evidence = process.env.RIFT_BROWSER_EVIDENCE || evidenceDir('stations');
fileSystem.mkdirSync(evidence, { recursive: true });
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
augmentAssets(assets);
const database = new Database(path.join(directory, 'data'));
const ports = [
  'qstation',
  'site-qgate',
  'site-meridian',
  'site-halcyon',
  'lanternfall',
  'threshold',
  'aureole-ring',
  'twins-exchange',
  'reliquary-watch',
  'nightjar-refuge',
  'glasswake-foundry',
  'palinode-observatory',
  'meridian-yards',
  'luna',
  'waystation-hub',
  'longhaul-depot',
  'cinder-hold',
  'farside-span',
  'nightjar-beacon',
];
assert.equal(systemsById[STELLARS['cinder-hold'].system].faction, 'hollow');
assert.equal(systemsById[STELLARS['farside-span'].system].farside, true);
assert.ok(STELLARS['farside-span'].svc?.includes('L'));
assert.equal(Object.values(STELLARS).filter((body) => body.id === 'farside-span').length, 1);
const captain = (identifier: string) => 'Art ' + ports.indexOf(identifier);
for (const identifier of ports) {
  const player = STELLARS[identifier],
    playerData = Game.prototype.fresh.call({ A: assets });
  playerData.sys = player.system;
  playerData.stellar = identifier;
  playerData.tut = 999;
  playerData.explored = Object.keys(systemsById);
  if (player.site && identifier !== 'site-qgate') {
    playerData.station = {
      ...playerData.station,
      claimed: true,
      site: identifier,
      ops: identifier === 'site-meridian' ? 3 : 5,
    };
    database.world.sites[identifier] = database.key(captain(identifier));
  }
  database.create(captain(identifier), 'solo', playerData);
}
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
let browser;
try {
  browser = await launchChromium({
    headless: true,
    args: ['--no-sandbox'],
  });
  await ready(server, origin);
  const results = [];
  for (const identifier of process.env.RIFT_STATION_QUICK ? ['qstation'] : ports) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors: string[] = [];
    page.on('pageerror', (event) => errors.push(event.message));
    await page.route('**/regression-render.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body:
          fileSystem.readFileSync(path.join(root, 'dist/client/render.js'), 'utf8') +
          '\nexport {stationSprite};\n',
      }),
    );
    await page.goto(origin);
    await page.locator(`[data-slot="${captain(identifier)}"]`).click();
    await page.waitForFunction(() => window.G?.you && G.landed);
    if (
      STELLARS[identifier].kind === 'station' ||
      STELLARS[identifier].hub ||
      STELLARS[identifier].site
    )
      await page.waitForFunction(() =>
        document.getElementById('landpic')!.style.backgroundImage.includes('data:image/png'),
      );
    for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    // CSS background failures do not raise pageerror: decode EVERY selected landing URL.
    const landingImages = await page.evaluate(async () => {
      const cssRule = document.getElementById('landpic')!.style.backgroundImage;
      const urls = [...cssRule.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(
        (message) => message[1],
      );
      return await Promise.all(
        urls.map(async (source2) => {
          const image = new Image();
          image.src = source2;
          try {
            await image.decode();
            return {
              src: source2.startsWith('data:') ? 'generated-station-scene' : source2,
              ok: true,
            };
          } catch {
            return { src: source2, ok: false };
          }
        }),
      );
    });
    assert.ok(
      landingImages.length && landingImages.every((imageProbe) => imageProbe.ok),
      identifier + ' landed pictures decode',
    );
    await page.screenshot({ path: path.join(evidence, identifier + '-landed.png') });
    const state = await page.evaluate(() => ({
      solo: G.solo,
      sys: G.sys,
      stellar: G.landed!.stellar,
      name: document.getElementById('landname')!.textContent,
      landArt: document
        .getElementById('landpic')!
        .style.backgroundImage.startsWith('url("data:image/png'),
    }));
    assert.equal(state.solo, true);
    assert.equal(state.stellar, identifier);
    if (identifier === 'farside-span') assert.match(state.name || '', /Farside Foothold/);
    if (
      STELLARS[identifier].kind === 'station' ||
      STELLARS[identifier].hub ||
      STELLARS[identifier].site
    )
      assert.equal(state.landArt, true);
    await page.click('#depart');
    await page.waitForFunction(() => G.view && !G.landed);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(evidence, identifier + '-flight.png') });
    assert.deepEqual(errors, []);
    results.push({ ...state, landingImages, errors });
    const expectedDesigns: Record<string, string> = {
      luna: 'luna',
      'waystation-hub': 'crescent',
      'longhaul-depot': 'refinery',
      'cinder-hold': 'stronghold',
      'farside-span': 'farside',
      threshold: 'relay',
      'twins-exchange': 'cylinder',
      'nightjar-beacon': 'biodome',
    };
    if (expectedDesigns[identifier]) {
      const design = await page.evaluate(async (id) => {
        const { STELLARS } = await import('/shared/galaxy.js');
        const { stationDesign } = await import('/render.js');
        return stationDesign(STELLARS[id]);
      }, identifier);
      assert.equal(design, expectedDesigns[identifier], identifier + ' authored station model');
    }
    if (identifier === 'qstation') {
      let failed = false;
      await page.route('**/s_cross.webp?v=station-retry', (route) => {
        if (!failed) {
          failed = true;
          return route.abort();
        }
        return route.continue();
      });
      const retry = await page.evaluate(async () => {
        const { stationLanding } = await import('/exotic_scenery.js');
        const { setArtworkVersion, artworkUrl } = await import('/artwork.js');
        const previousRevision = new URL(artworkUrl('hub.png'), location.href).searchParams.get(
          'v',
        );
        setArtworkVersion('station-retry');
        const player = { id: 'retry-audit', name: 'Retry fixture' } as StellarBody;
        const first = await stationLanding(player, {} as StarSystem, 'cross');
        const second = await stationLanding(player, {} as StarSystem, 'cross');
        setArtworkVersion(previousRevision!);
        return { first, second: !!second };
      });
      assert.equal(retry.first, null);
      assert.equal(retry.second, true, 'transient station-art failures can recover');
      const audit = await page.evaluate(async () => {
        const { STELLARS, SYS: systemsById2 } = await import('/shared/galaxy.js');
        const { stationDesign, stationSprite } =
          (await import('/regression-render.js')) as typeof import('./helpers/render-probe.d.ts');
        const { stationLanding, stationLandingSource } = await import('/exotic_scenery.js');
        const { assetImage } = await import('/asset-resources.js');
        const stations = Object.values(STELLARS).filter(
          (player) =>
            player.svc?.includes('L') && (player.hub || player.site || player.kind === 'station'),
        );
        const rows = [];
        const unique = new Map();
        for (const player of stations) {
          for (const tier of player.site ? [0, 1, 2, 3, 4, 5] : [null]) {
            const site = player.site ? { ops: tier } : undefined;
            const design = stationDesign(player);
            const source = stationLandingSource(player, design, site as StationSite);
            let sprite = player.hub
              ? assetImage('hub.png')
              : player.site
                ? assetImage(`stations/${tier}.png`)
                : stationSprite(player);
            const deadline = Date.now() + 3000;
            while (!sprite && Date.now() < deadline) {
              await new Promise((resolve2) => setTimeout(resolve2, 20));
              sprite = stationSprite(player);
            }
            if (!sprite) throw Error('Missing production flight sprite: ' + player.id);
            if (sprite instanceof HTMLImageElement) await sprite.decode();
            const flightMatches =
              sprite instanceof HTMLCanvasElement
                ? sprite.toDataURL('image/png') === source
                : new URL(sprite.src).pathname ===
                  new URL(source, location.href).pathname.replace('_landed.webp', '.webp');
            if (
              [
                'biodome',
                'cylinder',
                'crescent',
                'bastion',
                'refinery',
                'relay',
                'luna',
                'stronghold',
                'farside',
              ].includes(design)
            ) {
              const landingAsset = new Image();
              landingAsset.src = source;
              await landingAsset.decode();
              if (landingAsset.naturalWidth !== 800 || !source.includes('_landed.webp'))
                throw Error('Missing high-resolution landing variant: ' + player.id);
            }
            if (!flightMatches)
              throw Error('Flight/landed identity mismatch: ' + player.id + ' tier ' + tier);
            const address = await stationLanding(
              player,
              systemsById2[player.system],
              design,
              site as StationSite,
            );
            if (!address) throw new Error('Failed artwork: ' + player.id);
            const image2 = new Image();
            image2.src = address;
            await image2.decode();
            rows.push({
              id: player.id,
              kind: player.kind,
              tier,
              design,
              source,
              flightMatches,
              width: image2.naturalWidth,
              height: image2.naturalHeight,
            });
            if (!unique.has(source))
              unique.set(source, { p: player, source, im: image2, tier, design });
          }
        }
        const contact = document.createElement('canvas');
        contact.width = 1200;
        contact.height = Math.ceil(unique.size / 3) * 240;
        const cameraX = contact.getContext('2d');
        cameraX!.fillStyle = '#030712';
        cameraX!.fillRect(0, 0, contact.width, contact.height);
        let index = 0;
        for (const { p: player, im: image3, tier, design } of unique.values()) {
          const horizontalPosition2 = (index % 3) * 400,
            verticalPosition = Math.floor(index / 3) * 240;
          cameraX!.drawImage(image3, horizontalPosition2, verticalPosition, 400, 217);
          cameraX!.fillStyle = 'white';
          cameraX!.font = '12px sans-serif';
          cameraX!.fillText(
            player.name + ' / ' + (player.hub ? 'unique hub' : player.site ? 'T-' + tier : design),
            horizontalPosition2 + 8,
            verticalPosition + 232,
          );
          index++;
        }
        return {
          rows,
          unique: unique.size,
          contact: contact.toDataURL(),
          stations: stations.length,
        };
      });
      fileSystem.writeFileSync(
        path.join(evidence, 'all-station-audit.json'),
        JSON.stringify({ ...audit, contact: undefined }, null, 2),
      );
      fileSystem.writeFileSync(
        path.join(evidence, 'all-designs.png'),
        Buffer.from(audit.contact.split(',')[1], 'base64'),
      );
      const newStations = sceneAdditions.filter(
        (entry) => entry.body.kind === 'station' && entry.body.svc.includes('L'),
      );
      assert.equal(audit.stations, 112 + newStations.length);
      assert.equal(audit.rows.length, 247 + newStations.length);
      for (const entry of newStations)
        assert.equal(
          audit.rows.filter((row) => row.id === entry.body.id).length,
          1,
          'Every new scene station joins the real flight/landing artwork audit',
        );
      assert.equal(
        audit.rows.filter((row) => row.id === 'table-station').length,
        1,
        'the authored Table port joins the complete real artwork/flight identity audit',
      );
      assert.ok(
        audit.rows
          .filter((assetProbe) => assetProbe.kind === 'hub')
          .every((assetProbe2) => assetProbe2.source.includes('hub.png')),
      );
      assert.ok(
        audit.rows
          .filter((assetProbe3) => assetProbe3.kind === 'site')
          .every((assetProbe4) =>
            assetProbe4.source.includes('/stations/' + assetProbe4.tier + '.png'),
          ),
      );
    }
    await page.close();
  }
  fileSystem.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, evidence }, null, 2));
} catch (error) {
  await failureEvidence(browser, evidence, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
