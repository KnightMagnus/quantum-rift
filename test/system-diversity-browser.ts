import { launchChromium } from './helpers/chromium.ts';
// Browser scene fixture executes unchanged production decor routines. Only their
// private exports and the baseline size helper are exposed by the test server.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import operatingSystem from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence =
  process.env.RIFT_BROWSER_EVIDENCE ||
  fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-diversity-'));
fileSystem.mkdirSync(evidence, { recursive: true });
const server = http.createServer((request, response) => {
  let pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname.startsWith('/assets/')) pathname = '/client' + pathname;
  if (pathname === '/')
    return response.end(
      '<body style="margin:0;background:#030713"><canvas width="1800" height="1300"></canvas></body>',
    );
  let file = path.join(root, decodeURIComponent(pathname));
  if (/^\/(client|shared)\/.+\.js$/.test(pathname))
    file = path.join(root, 'dist', decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  if (
    pathname.startsWith('/client/assets/') &&
    process.env.RIFT_ASSET_FALLBACK &&
    (!fileSystem.existsSync(file) ||
      fileSystem
        .readFileSync(file)
        .subarray(0, 43)
        .toString()
        .startsWith('version https://git-lfs.github.com/spec/v1'))
  )
    file = path.join(process.env.RIFT_ASSET_FALLBACK, pathname.slice('/client/'.length));
  if (!fileSystem.existsSync(file)) return response.writeHead(404).end();
  response.setHeader(
    'Content-Type',
    file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.json')
        ? 'application/json'
        : file.endsWith('.webp')
          ? 'image/webp'
          : file.endsWith('.png')
            ? 'image/png'
            : 'application/octet-stream',
  );
  response.end(fileSystem.readFileSync(file));
});
await new Promise<void>((resolve2) => server.listen(0, '127.0.0.1', () => resolve2()));

const browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1300 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`);
  const outcome = await page.evaluate(async () => {
    const { decorFor, draw, stationDesign } = await import('/client/render.js');
    const { allocationFor, asteroidArtFor } = await import('/client/scenery-allocation.js');
    const { planetSprite } = await import('/client/planets.js');
    const { SYSTEMS, STELLARS } = await import('/shared/galaxy.js');
    const { bodyArtwork } = await import('/shared/body-artwork.js');
    const failures: string[] = [];
    let checks = 0;
    for (const system of SYSTEMS) {
      const allocation = allocationFor(system.id);
      if (!allocation || system.arena) continue;
      const decor = decorFor(system);
      if (
        decor.wreck.some(
          (wreck) => wreck.img.startsWith('wreck_s_') && (wreck.size < 90 || wreck.size > 220),
        )
      )
        failures.push(system.id + ': small wreck size');
      if (decor.wreck.filter((wreck) => !wreck.img.startsWith('wreck_s_')).length > 1)
        failures.push(system.id + ': massive wreck cap');
      if (asteroidArtFor(system.id, 'ore', 0) !== allocation.clutter.rocks[0])
        failures.push(system.id + ': ore pool');
      for (const [id, station] of Object.entries(allocation.stations)) {
        if (
          STELLARS[id] &&
          ![
            'luna',
            'waystation-hub',
            'longhaul-depot',
            'cinder-hold',
            'farside-span',
            'threshold',
            'twins-exchange',
            'nightjar-beacon',
            'aureole-ring',
            'reliquary-watch',
            'glasswake-foundry',
            'palinode-observatory',
          ].includes(id) &&
          stationDesign(STELLARS[id]) !== station.design
        )
          failures.push(id + ': design');
      }
      checks++;
    }
    const irregular = Object.values(STELLARS).find(
      (body) => bodyArtwork(body.id)?.shape === 'irregular',
    )!;
    let sprite = planetSprite(irregular, 0);
    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      sprite = planetSprite(irregular, 0);
      if (sprite?.S === 512) break;
    }
    if (!sprite || sprite.S !== 512) failures.push('irregular moon never decoded');
    else {
      const canvas = sprite.canvas as HTMLCanvasElement;
      const before = canvas.toDataURL();
      const next = planetSprite(irregular, 90000);
      if (next?.canvas !== canvas || canvas.toDataURL() === before)
        failures.push('irregular moon rotation');
    }
    const canvas = document.querySelector('canvas')!;
    const context = canvas.getContext('2d')!;
    const state = {
      sys: 'meridian',
      zoom: 0.55,
      lookX: 0,
      lookY: 0,
    } as import('../client/main.ts').ClientGameState;
    for (let frame = 0; frame < 80; frame++) {
      draw(state, context, 1800, 1300, 16, frame * 16, 'background');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return { failures, checks };
  });
  assert.deepEqual(outcome.failures, []);
  assert.ok(outcome.checks >= 217);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidence, 'meridian-diversity.png') });
  console.log(
    `Diversity browser: ${outcome.checks} authored systems, bounded wrecks, station/rock choices and rotating irregular moon passed.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
