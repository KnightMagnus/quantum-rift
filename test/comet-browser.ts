// Actual Chromium canvas rendering of the production comet helper.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import operatingSystem from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence =
  process.env.RIFT_BROWSER_EVIDENCE ||
  fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-comet-'));
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
const { chromium } = (await import(
  process.env.PLAYWRIGHT_MODULE || ('playwright' as string)
)) as typeof import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }),
    errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.goto(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`);
  const result = await page.evaluate(async () => {
    const { drawComet, cometScreen } = await import('/client/comet.js');
    const canvas = document.querySelector<HTMLCanvasElement>('canvas'),
      context = canvas!.getContext('2d');
    canvas!.width = 1400;
    canvas!.height = 900;
    const cometDescriptor = { x0: 5200, y0: 0, len: 790, hue: '170,220,255' };
    const cameraX = 10500,
      cameraY = 0,
      starPosition = { x: 120, y: 450 };
    function draw(elapsedMilliseconds = 0, occlude = false, clone = false) {
      context!.fillStyle = '#030713';
      context!.fillRect(0, 0, 1400, 900);
      for (let index = 0; index < 180; index++) {
        context!.fillStyle = '#657282';
        context!.fillRect((index * 193) % 1400, (index * 137) % 900, 1, 1);
      }
      context!.fillStyle = '#ffd291';
      context!.beginPath();
      context!.arc(starPosition.x, starPosition.y, 24, 0, 7);
      context!.fill();
      drawComet(
        context!,
        clone ? { ...cometDescriptor } : cometDescriptor,
        1400,
        900,
        1,
        cameraX,
        cameraY,
        elapsedMilliseconds,
        starPosition,
      );
      if (occlude) {
        context!.fillStyle = '#334455';
        context!.beginPath();
        context!.arc(540, 470, 60, 0, 7);
        context!.fill();
      }
      return canvas!.toDataURL();
    }
    const first = draw(),
      repeated = draw(0, false, true);
    window.cometFrame = draw;
    const player = cometScreen(cometDescriptor, 1400, 900, 1, cameraX, cameraY, 0),
      positionAfterThirtySeconds = cometScreen(
        cometDescriptor,
        1400,
        900,
        1,
        cameraX,
        cameraY,
        30000,
      );
    draw(0, true);
    const occlusion = Array.from(context!.getImageData(540, 470, 1, 1).data);
    return {
      deterministic: first === repeated,
      p: player,
      p30: positionAfterThirtySeconds,
      occlusion,
    };
  });
  assert.ok(result.deterministic);
  assert.deepEqual(result.occlusion, [51, 68, 85, 255]);
  assert.ok(Math.hypot(result.p30.x - result.p.x, result.p30.y - result.p.y) > 20);
  assert.deepEqual(errors, []);
  for (const [name, sampleTime, occlude] of [
    ['comet', 0, false],
    ['comet-30s', 30000, false],
    ['comet-occluded', 0, true],
  ] as const) {
    await page.evaluate(([frameTime, options]) => window.cometFrame(frameTime, options), [
      sampleTime,
      occlude,
    ] as const);
    await page.screenshot({ path: path.join(evidence, name + '.png') });
  }
  fileSystem.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(JSON.stringify({ ...result, errors, evidence }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve3) => server.close(resolve3));
}
