// Browser scene fixture executes unchanged production decor routines. Only their
// private exports and the baseline size helper are exposed by the test server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence =
  process.env.RIFT_BROWSER_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'rift-background-'));
fs.mkdirSync(evidence, { recursive: true });
const server = http.createServer((req, res) => {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/assets/')) pathname = '/client' + pathname;
  if (pathname === '/')
    return res.end(
      '<body style="margin:0;background:#030713"><canvas width="1800" height="1300"></canvas></body>',
    );
  if (pathname === '/client/render-before.js' || pathname === '/client/render-after.js') {
    let source = fs.readFileSync(path.join(root, 'dist/client/render.js'), 'utf8');
    if (pathname.includes('before'))
      source = source.replace(
        "import { backgroundScale } from './background_scale.js';",
        'const backgroundScale = () => 1;',
      );
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(source + '\nexport {decorFor,drawDecorFar,drawDecorNear};');
  }
  let file = path.join(root, decodeURIComponent(pathname));
  if (/^\/(client|shared)\/.+\.js$/.test(pathname))
    file = path.join(root, 'dist', decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (
    pathname.startsWith('/client/assets/') &&
    process.env.RIFT_ASSET_FALLBACK &&
    (!fs.existsSync(file) ||
      fs
        .readFileSync(file)
        .subarray(0, 43)
        .toString()
        .startsWith('version https://git-lfs.github.com/spec/v1'))
  )
    file = path.join(process.env.RIFT_ASSET_FALLBACK, pathname.slice('/client/'.length));
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
  const page = await browser.newPage({ viewport: { width: 1800, height: 1300 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const before = await import('/client/render-before.js'),
      after = await import('/client/render-after.js');
    const { SYSTEMS } = await import('/shared/galaxy.js');
    const { planetSprite } = await import('/client/planets.js');
    const system = SYSTEMS.find((s) => {
      const d = after.decorFor(s);
      return (
        d.wreck.length &&
        d.bgp?.some(
          (bp) =>
            /gas giant/i.test(bp.p.desc) &&
            Math.abs(bp.x - d.wreck[0].x * bp.depth) < 700 &&
            Math.abs(bp.y - d.wreck[0].y * bp.depth) < 450,
        )
      );
    });
    if (!system) throw new Error('No authored seeded gas/wreck scene');
    const decor = after.decorFor(system),
      canvas = document.querySelector('canvas'),
      ctx = canvas.getContext('2d');
    const gas = decor.bgp.find((bp) => /gas giant/i.test(bp.p.desc));
    // Pan the fixture camera toward the generated wreck; far decor retains normal parallax.
    const cx = decor.wreck[0].x,
      cy = decor.wreck[0].y;
    const planets = new Map();
    for (let step = 0; step < 150; step++) {
      for (const bp of decor.bgp) {
        const p = planetSprite(bp.p, 10000);
        if (p) planets.set(p.canvas, bp.p.desc);
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    let record = [];
    const original = ctx.drawImage.bind(ctx);
    ctx.drawImage = (image, ...args) => {
      const stack = new Error().stack;
      const kind =
        planets.get(image) ||
        (image instanceof HTMLImageElement
          ? image.src.split('/').pop()
          : stack.includes('drawStar')
            ? 'star'
            : 'other-canvas');
      record.push({ kind, width: args.at(-2), height: args.at(-1) });
      return original(image, ...args);
    };
    function draw(module) {
      record = [];
      ctx.fillStyle = '#030713';
      ctx.fillRect(0, 0, 1800, 1300);
      module.drawDecorFar(ctx, system, 1800, 1300, 1, cx, cy, 10000);
      module.drawDecorNear(
        ctx,
        system,
        1800,
        1300,
        1,
        (x) => 900 + x - cx,
        (y) => 650 + y - cy,
        10000,
      );
      return record.slice();
    }
    draw(before);
    draw(after);
    await new Promise((r) => setTimeout(r, 600));
    const old = draw(before),
      current = draw(after);
    window.__decorBefore = () => draw(before);
    window.__decorAfter = () => draw(after);
    return { system: system.id, gas: gas.p.desc, old, current };
  });
  const rows = [];
  for (const row of result.current) {
    const match = result.old.find((x) => x.kind === row.kind);
    if (!match) continue;
    {
      const expected = row.kind.includes('wreck_') ? 0.5 : /gas giant/i.test(row.kind) ? 0.6 : 1;
      const ratio = row.width / match.width;
      assert.ok(Math.abs(ratio - expected) < 1e-9, `${row.kind}: ${ratio}`);
      rows.push({ ...row, before: match.width, ratio });
    }
  }
  assert.ok(
    rows.some((x) => /gas giant/.test(x.kind)),
    'rendered gas giant measured',
  );
  assert.ok(
    rows.some((x) => /wreck_/.test(x.kind)),
    'rendered wreck measured',
  );
  assert.ok(
    rows.some((x) => x.kind === 'star'),
    'unchanged stellar disc measured',
  );
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__decorBefore());
  await page.screenshot({ path: path.join(evidence, 'before.png') });
  await page.evaluate(() => window.__decorAfter());
  await page.screenshot({ path: path.join(evidence, 'after.png') });
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ ...result, rows, errors }, null, 2),
  );
  console.log(JSON.stringify({ system: result.system, rows, errors, evidence }, null, 2));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
