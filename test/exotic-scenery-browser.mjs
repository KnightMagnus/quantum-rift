// Production flight-scenery rendering and station landing artwork, under Chromium.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.RIFT_BROWSER_EVIDENCE || '/tmp/rift-exotic-scenery';
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://exotic.test/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<body style="margin:0;background:#030712;color:white"><canvas width="1200" height="760"></canvas></body>',
      });
    const file = /^\/(client|shared)\/.+\.js$/.test(p)
      ? path.join(root, 'dist', p)
      : path.join(root, p.startsWith('/assets/') ? '/client' + p : p);
    try {
      let body = await fs.readFile(file);
      if (p === '/client/render.js') body = body.toString() + '\nexport {decorFor,drawDecorFar};';
      await route.fulfill({
        body,
        contentType: p.endsWith('.js')
          ? 'text/javascript'
          : p.endsWith('.json')
            ? 'application/json'
            : p.endsWith('.webp')
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
    const result = await page.evaluate(async (kind) => {
      const { SYS } = await import('/shared/galaxy.js');
      const { decorFor, drawDecorFar } = await import('/client/render.js');
      const S = { ...SYS.meridian, id: 'visual-test-' + kind, scene: { kind } };
      const D = decorFor(S);
      D.sun = { x: -100, y: 0, size: 185, depth: 0.04, core: '255,240,210', halo: '255,180,90' };
      D.gal = [];
      D.bgp = [];
      D.neb = [];
      D.hole = null;
      D.pulsar = null;
      D.comet = null;
      const canvas = document.querySelector('canvas'),
        ctx = canvas.getContext('2d');
      const frame = () => {
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, 1200, 760);
        drawDecorFar(ctx, S, 1200, 760, 1, 0, 0, 10000);
        return canvas.toDataURL();
      };
      const first = frame(),
        repeat = frame();
      const pixels = ctx.getImageData(0, 0, 1200, 760).data;
      let nonBackground = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] !== 3 || pixels[i + 1] !== 7 || pixels[i + 2] !== 18) nonBackground++;
      const timings = [];
      for (let i = 0; i < 200; i++) {
        const before = performance.now();
        drawDecorFar(ctx, S, 1200, 760, 1, 0, 0, 10000 + i * 16);
        ctx.getImageData(0, 0, 1200, 760); // force raster completion, not just command submission
        timings.push(performance.now() - before);
      }
      timings.sort((a, b) => a - b);
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
    const { SYS, STELLARS } = await import('/shared/galaxy.js');
    const { stationDesign } = await import('/client/render.js');
    const { stationLanding } = await import('/client/exotic_scenery.js');
    const p =
      Object.values(STELLARS).find((p) => /luna/i.test(p.name)) ||
      Object.values(STELLARS).find((p) => p.kind === 'station');
    const design = stationDesign(p),
      url = await stationLanding(p, { ...SYS[p.system], scene: { kind: 'blackhole' } }, design);
    if (!url) throw Error('Station image failed');
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.querySelector('canvas'),
      ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1200, 760);
    ctx.drawImage(image, 0, 55);
    return { id: p.id, design, width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.equal(stations.width, 1200);
  assert.equal(stations.height, 650);
  await page.screenshot({ path: path.join(evidence, 'station-blackhole-landing.png') });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, 'results.json'),
    JSON.stringify({ results, stations, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, stations, errors, evidence }, null, 2));
} finally {
  await browser.close();
}
