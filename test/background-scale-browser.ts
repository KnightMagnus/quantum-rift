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
  fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-background-'));
fileSystem.mkdirSync(evidence, { recursive: true });
const server = http.createServer((request, response) => {
  let pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname.startsWith('/assets/')) pathname = '/client' + pathname;
  if (pathname === '/')
    return response.end(
      '<body style="margin:0;background:#030713"><canvas width="1800" height="1300"></canvas></body>',
    );
  if (pathname === '/client/render-before.js' || pathname === '/client/render-after.js') {
    let source = fileSystem.readFileSync(path.join(root, 'dist/client/render.js'), 'utf8');
    if (pathname.includes('before'))
      source = source.replace(
        "import { backgroundScale } from './background_scale.js';",
        'const backgroundScale = () => 1;',
      );
    response.setHeader('Content-Type', 'text/javascript');
    return response.end(source + '\nexport {decorFor,drawDecorFar,drawDecorNear};');
  }
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
  const page = await browser.newPage({ viewport: { width: 1800, height: 1300 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.goto(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`);
  const result = await page.evaluate(async () => {
    const before =
        (await import('/client/render-before.js')) as typeof import('./helpers/render-probe.ts'),
      after =
        (await import('/client/render-after.js')) as typeof import('./helpers/render-probe.ts');
    const { SYSTEMS } = await import('/shared/galaxy.js');
    const { planetSprite } = await import('/client/planets.js');
    const system = SYSTEMS.find((session) => {
      const decorModel = after.decorFor(session);
      return (
        decorModel.wreck.length &&
        decorModel.bgp?.some(
          (backgroundPlanet) =>
            /gas giant/i.test(backgroundPlanet.p.desc!) &&
            Math.abs(backgroundPlanet.x - decorModel.wreck[0].x * backgroundPlanet.depth) < 700 &&
            Math.abs(backgroundPlanet.y - decorModel.wreck[0].y * backgroundPlanet.depth) < 450!,
        )
      );
    });
    if (!system) throw new Error('No authored seeded gas/wreck scene');
    const decor = after.decorFor(system),
      canvas = document.querySelector<HTMLCanvasElement>('canvas'),
      context = canvas!.getContext('2d');
    const gasPlanet = decor.bgp!.find((backgroundPlanet2) =>
      /gas giant/i.test(backgroundPlanet2.p.desc!),
    );
    // Pan the fixture camera toward the generated wreck; far decor retains normal parallax.
    const cameraX = decor.wreck[0].x,
      cameraY = decor.wreck[0].y;
    const planets = new Map();
    for (let step = 0; step < 150; step++) {
      for (const backgroundPlanet3 of decor.bgp!) {
        const player = planetSprite(backgroundPlanet3.p, 10000);
        if (player) planets.set(player.canvas, backgroundPlanet3.p.desc);
      }
      await new Promise((resolve3) => requestAnimationFrame(resolve3));
    }
    let record: { kind: string; width: number | undefined; height: number | undefined }[] = [];
    const original = context!.drawImage.bind(context);
    context!.drawImage = (image: CanvasImageSource, ...args: number[]) => {
      const stack = new Error().stack;
      const kind =
        planets.get(image) ||
        (image instanceof HTMLImageElement
          ? image.src.split('/').pop()
          : stack!.includes('drawStar')
            ? 'star'
            : 'other-canvas');
      record.push({ kind, width: args.at(-2), height: args.at(-1) });
      return Reflect.apply(original, context, [image, ...args]);
    };
    function draw(module: typeof import('./helpers/render-probe.ts')) {
      record = [];
      context!.fillStyle = '#030713';
      context!.fillRect(0, 0, 1800, 1300);
      module.drawDecorFar(context!, system!, 1800, 1300, 1, cameraX, cameraY, 10000);
      module.drawDecorNear(
        context!,
        system!,
        1800,
        1300,
        1,
        (horizontalPosition: number) => 900 + horizontalPosition - cameraX,
        (verticalPosition: number) => 650 + verticalPosition - cameraY,
        10000,
      );
      return record.slice();
    }
    draw(before);
    draw(after);
    await new Promise((resolve4) => setTimeout(resolve4, 600));
    const baseline = draw(before),
      current = draw(after);
    window.__decorBefore = () => draw(before);
    window.__decorAfter = () => draw(after);
    return { system: system.id, gas: gasPlanet!.p.desc, old: baseline, current };
  });
  const rows = [];
  for (const currentDrawRecord of result.current) {
    const match = result.old.find((assetProbe) => assetProbe.kind === currentDrawRecord.kind);
    if (!match) continue;
    {
      const expected = currentDrawRecord.kind.includes('wreck_')
        ? 0.5
        : /gas giant/i.test(currentDrawRecord.kind)
          ? 0.6
          : 1;
      const ratio = currentDrawRecord.width! / match.width!;
      assert.ok(Math.abs(ratio - expected) < 1e-9, `${currentDrawRecord.kind}: ${ratio}`);
      rows.push({ ...currentDrawRecord, before: match.width, ratio });
    }
  }
  assert.ok(
    rows.some((assetProbe2) => /gas giant/.test(assetProbe2.kind)),
    'rendered gas giant measured',
  );
  assert.ok(
    rows.some((assetProbe3) => /wreck_/.test(assetProbe3.kind)),
    'rendered wreck measured',
  );
  assert.ok(
    rows.some((assetProbe4) => assetProbe4.kind === 'star'),
    'unchanged stellar disc measured',
  );
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__decorBefore());
  await page.screenshot({ path: path.join(evidence, 'before.png') });
  await page.evaluate(() => window.__decorAfter());
  await page.screenshot({ path: path.join(evidence, 'after.png') });
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ ...result, rows, errors }, null, 2),
  );
  console.log(JSON.stringify({ system: result.system, rows, errors, evidence }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve5) => server.close(resolve5));
}
