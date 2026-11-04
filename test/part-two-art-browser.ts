import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { SYS, PERSONAL_SYSTEMS, SYSTEMS } from '../shared/galaxy.ts';
import type { ClientGameState } from '../client/main.ts';
import { launchChromium } from './helpers/chromium.ts';

const root = process.cwd();
const evidence = process.env.RIFT_BROWSER_EVIDENCE || path.join(root, '.verification/part-two-art');
await fs.mkdir(evidence, { recursive: true });
const bundle = await build({
  entryPoints: [path.join(root, 'client/render.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.route('http://part-two.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<body style="margin:0"><canvas width="1500" height="900"></canvas></body>',
      });
    if (pathname === '/render.js')
      return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
    try {
      const file = path.join(root, 'client', pathname);
      return route.fulfill({
        body: await fs.readFile(file),
        contentType: pathname.endsWith('.json')
          ? 'application/json'
          : pathname.endsWith('.jpg')
            ? 'image/jpeg'
            : 'image/webp',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('http://part-two.test/');
  const results = await page.evaluate(async () => {
    const render = await import('/render.js');
    const canvas = document.querySelector('canvas')!;
    const context = canvas.getContext('2d')!;
    const state = {
      sys: 'mw-sol',
      view: { rx: 1500, ry: 0 },
      zoom: 0.4,
      opts: { shake: false },
      ents: new Map(),
      spriteScale: 1,
    } as unknown as ClientGameState;
    const frame = () =>
      render.draw(state, context, 1500, 900, 0.016, performance.now(), 'background');
    const interval = setInterval(frame, 50);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    clearInterval(interval);
    frame();
    const receiver = render.heliosReceiver({ x: 2600, y: 0, r: 250 });
    render.startStorySequence(state, 'rift-crossing', 1000);
    const locked = render.storyInputLocked(state, 2000);
    render.skipStorySequence(state, 2000);
    const skipArrivalLocked = render.storyInputLocked(state, 2100);
    const unlocked = !render.storyInputLocked(state, 2900);
    return {
      receiver,
      locked,
      skipArrivalLocked,
      unlocked,
      nonBlack: context.getImageData(750, 450, 1, 1).data[0],
    };
  });
  assert.ok(Math.abs(results.receiver.x - 2071.688) < 0.01);
  assert.ok(Math.abs(results.receiver.y + 25.601) < 0.01);
  assert.ok(results.locked && results.skipArrivalLocked && results.unlocked);
  assert.ok(results.nonBlack > 0, 'The real Milky Way sky must render');
  assert.deepEqual(failures, []);
  await page.screenshot({ path: path.join(evidence, 'sol-helios-luna.png') });
  const regionalAssets = [...SYSTEMS, ...PERSONAL_SYSTEMS].filter(
    (system) => system.region === 'milky-way',
  );
  await page.evaluate(async (systems) => {
    for (const system of systems) {
      const sky = new Image();
      sky.src = `assets/milky-way/${system.backdrop}`;
      await sky.decode();
      for (const body of system.stellars.filter((body) => body.art)) {
        const image = new Image();
        image.src =
          body.kind === 'station'
            ? `assets/stations/s_${body.art}.webp`
            : `assets/planets/${body.art}.webp`;
        await image.decode();
      }
    }
  }, regionalAssets);
  const solBodies = SYS['mw-sol'].stellars.filter((body) => body.art);
  await page.evaluate(async (bodies) => {
    for (const body of bodies.filter((body) => body.kind === 'station')) {
      const image = new Image();
      image.src = `assets/stations/s_${body.art}.webp`;
      await image.decode();
    }
    const render = await import('/render.js');
    const canvas = document.querySelector('canvas')!;
    const context = canvas.getContext('2d')!;
    const minX = Math.min(...bodies.map((body) => body.x - body.r));
    const maxX = Math.max(...bodies.map((body) => body.x + body.r));
    const minY = Math.min(...bodies.map((body) => body.y - body.r));
    const maxY = Math.max(...bodies.map((body) => body.y + body.r));
    const centerX = (minX + maxX) / 2,
      centerY = (minY + maxY) / 2;
    const zoom = Math.min(1300 / (maxX - minX), 700 / (maxY - minY));
    const state = {
      sys: 'mw-sol',
      view: { rx: centerX, ry: centerY },
      zoom,
      opts: { shake: false },
      ents: new Map(),
      spriteScale: 1,
    } as unknown as ClientGameState;
    const originalFillText = context.fillText.bind(context);
    const frame = () => {
      context.fillText = () => {};
      render.draw(state, context, 1500, 900, 0.016, 1000, 'background');
      context.fillText = originalFillText;
    };
    frame();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    frame();
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.font = '16px sans-serif';
    context.fillStyle = '#e0efff';
    context.fillText('Sol — full system overview (renderer capture; labels added)', 30, 35);
    for (const body of bodies.filter(
      (body) =>
        body.art?.startsWith('sol_') &&
        [
          'mw-mercury',
          'mw-venus',
          'vigils-rest',
          'mw-mars',
          'mw-ceres',
          'mw-jupiter',
          'mw-saturn',
          'mw-uranus',
          'mw-neptune',
          'mw-pluto',
        ].includes(body.id),
    )) {
      const x = (body.x - centerX) * zoom + 750,
        y = (body.y - centerY) * zoom + 450;
      context.strokeStyle = '#85abc8';
      context.beginPath();
      context.arc(x, y, Math.max(5, body.r * zoom + 3), 0, Math.PI * 2);
      context.stroke();
      const labelOffset = body.id === 'mw-mercury' ? -35 : body.id === 'mw-venus' ? 25 : -12;
      context.fillText(body.name, x + 10, y + labelOffset);
    }
  }, solBodies);
  await page.screenshot({ path: path.join(evidence, 'sol-full-system.png') });
  const passage = SYS['mw-sol'].stellars.find((body) => body.id === 'mw-sol-rift-mouth')!;
  const portalDraws = await page.evaluate(async (mouth) => {
    const render = await import('/render.js');
    const context = document.querySelector('canvas')!.getContext('2d')!;
    const state = {
      sys: 'mw-sol',
      view: { rx: mouth.x, ry: mouth.y },
      zoom: 0.4,
      opts: { shake: false },
      ents: new Map(),
      spriteScale: 1,
    } as unknown as ClientGameState;
    render.draw(state, context, 1500, 900, 0.016, 1000, 'background');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const images: string[] = [];
    const originalDrawImage = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype,
      'drawImage',
    )!.value as CanvasRenderingContext2D['drawImage'];
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      image: CanvasImageSource,
      ...args: number[]
    ) {
      if (image instanceof HTMLImageElement) images.push(new URL(image.src).pathname);
      Reflect.apply(originalDrawImage, this, [image, ...args]);
    } as typeof context.drawImage;
    render.draw(state, context, 1500, 900, 0.016, 2000, 'background');
    CanvasRenderingContext2D.prototype.drawImage = originalDrawImage;
    return images;
  }, passage);
  assert.ok(
    portalDraws.some((url) => url.endsWith('/quantum_rift.png')),
    'Sol return passage loads Quantum Rift artwork',
  );
  assert.ok(
    !portalDraws.some((url) => url.endsWith('/wormhole.png')),
    'Sol return passage must not use Gateway artwork',
  );
  await page.screenshot({ path: path.join(evidence, 'sol-quantum-rift.png') });
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'tools/ships26/part2/manifest.json'), 'utf8'),
  ) as { id: number; fs: number; banks: boolean }[];
  const decoded = await page.evaluate(async (hulls) => {
    for (const hull of hulls) {
      for (const suffix of ['', '_glow', '_yard']) {
        const image = new Image();
        image.src = `assets/ships/${hull.id}${suffix}.webp`;
        await image.decode();
        const expectedWidth = suffix === '_yard' ? 176 : hull.fs * 12;
        const expectedHeight = suffix === '_yard' ? 176 : hull.fs * (hull.banks ? 9 : 3);
        if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight)
          throw new Error(`Incomplete heading/bank sheet ${hull.id}${suffix}`);
      }
    }
    return hulls.length * 3;
  }, manifest);
  assert.equal(
    decoded,
    84,
    'All real game, glow, and yard artwork must decode at their registered dimensions',
  );
  await fs.writeFile(
    path.join(evidence, 'results.json'),
    JSON.stringify({ ...results, decoded }, null, 2),
  );
  console.log('Part II artwork and crossing presentation checks passed', results);
} finally {
  await browser.close();
}
