// Actual Chromium canvas rendering of the production comet helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence =
  process.env.RIFT_BROWSER_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'rift-comet-'));
fs.mkdirSync(evidence, { recursive: true });
const server = http.createServer((req, res) => {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/assets/')) pathname = '/client' + pathname;
  if (pathname === '/')
    return res.end(
      '<body style="margin:0;background:#030713"><canvas width="1800" height="1300"></canvas></body>',
    );
  let file = path.join(root, decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader(
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
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const { drawComet, cometScreen } = await import('/client/comet.js');
    const canvas = document.querySelector('canvas'),
      ctx = canvas.getContext('2d');
    canvas.width = 1400;
    canvas.height = 900;
    const c = { x0: 5200, y0: 0, len: 790, hue: '170,220,255' };
    const cx = 10500,
      cy = 0,
      sun = { x: 120, y: 450 };
    function draw(t = 0, occlude = false, clone = false) {
      ctx.fillStyle = '#030713';
      ctx.fillRect(0, 0, 1400, 900);
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = '#657282';
        ctx.fillRect((i * 193) % 1400, (i * 137) % 900, 1, 1);
      }
      ctx.fillStyle = '#ffd291';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 24, 0, 7);
      ctx.fill();
      drawComet(ctx, clone ? { ...c } : c, 1400, 900, 1, cx, cy, t, sun);
      if (occlude) {
        ctx.fillStyle = '#334455';
        ctx.beginPath();
        ctx.arc(540, 470, 60, 0, 7);
        ctx.fill();
      }
      return canvas.toDataURL();
    }
    const first = draw(),
      repeated = draw(0, false, true);
    window.cometFrame = draw;
    const p = cometScreen(c, 1400, 900, 1, cx, cy, 0),
      p30 = cometScreen(c, 1400, 900, 1, cx, cy, 30000);
    draw(0, true);
    const occlusion = Array.from(ctx.getImageData(540, 470, 1, 1).data);
    return { deterministic: first === repeated, p, p30, occlusion };
  });
  assert.ok(result.deterministic);
  assert.deepEqual(result.occlusion, [51, 68, 85, 255]);
  assert.ok(Math.hypot(result.p30.x - result.p.x, result.p30.y - result.p.y) > 20);
  assert.deepEqual(errors, []);
  for (const [name, t, occlude] of [
    ['comet', 0, false],
    ['comet-30s', 30000, false],
    ['comet-occluded', 0, true],
  ]) {
    await page.evaluate(([t, o]) => window.cometFrame(t, o), [t, occlude]);
    await page.screenshot({ path: path.join(evidence, name + '.png') });
  }
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(JSON.stringify({ ...result, errors, evidence }, null, 2));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
