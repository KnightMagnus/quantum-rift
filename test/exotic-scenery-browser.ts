import { launchChromium } from './helpers/chromium.ts';
// Production flight-scenery rendering and station landing artwork, under Chromium.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.RIFT_BROWSER_EVIDENCE || '/tmp/rift-exotic-scenery';
await fileSystem.mkdir(evidence, { recursive: true });
const browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(event.message));
  await page.route('http://exotic.test/**', async (route) => {
    const player = new URL(route.request().url()).pathname;
    if (player === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<body style="margin:0;background:#030712;color:white"><canvas width="1200" height="760"></canvas></body>',
      });
    const file = /^\/(client|shared)\/.+\.js$/.test(player)
      ? path.join(root, 'dist', player)
      : path.join(root, player.startsWith('/assets/') ? '/client' + player : player);
    try {
      let body: string | import('node:buffer').Buffer = await fileSystem.readFile(file);
      if (player === '/client/render.js')
        body = body.toString() + '\nexport {decorFor,drawDecorFar};';
      await route.fulfill({
        body,
        contentType: player.endsWith('.js')
          ? 'text/javascript'
          : player.endsWith('.json')
            ? 'application/json'
            : player.endsWith('.webp')
              ? 'image/webp'
              : undefined,
      });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('http://exotic.test/');
  const results = [];
  for (const kind of ['binary', 'blackhole', 'pulsar', 'rogue', 'shattered', 'observatory']) {
    const result = await page.evaluate(async (kind: string) => {
      const { SYS: systemsById } = await import('/shared/galaxy.js');
      const { decorFor, drawDecorFar } =
        (await import('/client/render.js')) as typeof import('./helpers/render-probe.ts');
      const system2 = { ...systemsById.meridian, id: 'visual-test-' + kind, scene: { kind } };
      const decor = decorFor(system2);
      decor.sun = {
        x: -100,
        y: 0,
        size: 185,
        depth: 0.04,
        core: '255,240,210',
        halo: '255,180,90',
      };
      decor.gal = [];
      decor.bgp = [];
      decor.neb = [];
      decor.hole = null;
      decor.pulsar = null;
      decor.comet = null;
      const canvas = document.querySelector<HTMLCanvasElement>('canvas'),
        context = canvas!.getContext('2d');
      const frame = () => {
        context!.fillStyle = '#030712';
        context!.fillRect(0, 0, 1200, 760);
        drawDecorFar(context!, system2, 1200, 760, 1, 0, 0, 10000);
        return canvas!.toDataURL();
      };
      const first = frame(),
        repeat = frame();
      const pixels = context!.getImageData(0, 0, 1200, 760).data;
      let nonBackground = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (pixels[index] !== 3 || pixels[index + 1] !== 7 || pixels[index + 2] !== 18)
          nonBackground++;
      const timings = [];
      for (let index = 0; index < 200; index++) {
        const before = performance.now();
        drawDecorFar(context!, system2, 1200, 760, 1, 0, 0, 10000 + index * 16);
        context!.getImageData(0, 0, 1200, 760); // force raster completion, not just command submission
        timings.push(performance.now() - before);
      }
      timings.sort((firstCaptain, secondCaptain) => firstCaptain - secondCaptain);
      return {
        kind,
        deterministic: first === repeat,
        nonBackground,
        medianFrameMs: timings[100],
        p95FrameMs: timings[190],
      };
    }, kind);
    assert.equal(result.deterministic, true);
    assert.ok(result.medianFrameMs < 30, kind + ' cached scenery frame budget');
    assert.ok(result.nonBackground > 6000, kind + ' should have detailed visible artwork');
    results.push(result);
    await page.screenshot({ path: path.join(evidence, kind + '.png') });
  }
  const stations = await page.evaluate(async () => {
    const { SYS: systemsById2, STELLARS } = await import('/shared/galaxy.js');
    const { stationDesign } =
      (await import('/client/render.js')) as typeof import('./helpers/render-probe.ts');
    const { stationLanding } = await import('/client/exotic_scenery.js');
    const player =
      Object.values(STELLARS).find((planetBody) => /luna/i.test(planetBody.name)) ||
      Object.values(STELLARS).find((stationBody) => stationBody.kind === 'station');
    const design = stationDesign(player!),
      address = await stationLanding(
        player!,
        { ...systemsById2[player!.system], scene: { kind: 'blackhole' } },
        design,
      );
    if (!address) throw Error('Station image failed');
    const image = new Image();
    image.src = address;
    await image.decode();
    const canvas = document.querySelector<HTMLCanvasElement>('canvas'),
      canvasContext = canvas!.getContext('2d');
    canvasContext!.fillStyle = '#000';
    canvasContext!.fillRect(0, 0, 1200, 760);
    canvasContext!.drawImage(image, 0, 55);
    return { id: player!.id, design, width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.equal(stations.width, 1200);
  assert.equal(stations.height, 650);
  await page.screenshot({ path: path.join(evidence, 'station-blackhole-landing.png') });
  assert.deepEqual(errors, []);
  await fileSystem.writeFile(
    path.join(evidence, 'results.json'),
    JSON.stringify({ results, stations, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, stations, errors, evidence }, null, 2));
} finally {
  await browser.close();
}
