import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cometPose, cometScreen, cometTailAngle, COMET_DEPTH } from '../client/comet.ts';
const c = { x0: 5200, y0: 0, len: 700, hue: '170,220,255' };
for (const t of [0, 899999, 900000, 4523893, 1e9]) {
  assert.deepEqual(cometPose(c, t), cometPose({ ...c }, t));
  const a = cometPose(c, t),
    b = cometPose(c, t + 1000);
  const speed = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(speed > 0.7 && speed < 1.3, 'slow continuous drift, including old reset');
}
const period = 720 * Math.PI * 2 * 1000;
const start = cometPose(c, 0),
  end = cometPose(c, period);
assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-9);
for (const z of [0.4, 1, 2])
  for (const cx of [-2000, 0, 2000]) {
    const a = cometScreen(c, 1200, 800, z, cx, 300, 0);
    const b = cometScreen(c, 1200, 800, z, cx + 100, 300, 0);
    assert.ok(Math.abs(a.x - b.x - 100 * COMET_DEPTH * z ** 0.25) < 1e-9);
    const sun = { x: 600 + (150 - cx * 0.03) * z ** 0.25, y: 400 + (-90 - 300 * 0.03) * z ** 0.25 };
    for (const time of [0, period / 2]) {
      const p = cometScreen(c, 1200, 800, z, cx, 300, time),
        angle = cometTailAngle(p, sun);
      const dx = p.x - sun.x,
        dy = p.y - sun.y;
      assert.ok(Math.abs(Math.cos(angle) * dy - Math.sin(angle) * dx) < 1e-9);
      assert.ok(
        Math.cos(angle) * dx + Math.sin(angle) * dy > 0,
        'anti-solar on both sides while panning',
      );
    }
  }
const source = fs.readFileSync(new URL('../client/render.ts', import.meta.url), 'utf8');
const far = source.slice(
  source.indexOf('function drawDecorFar'),
  source.indexOf('function drawDecorMid'),
);
assert.ok(far.indexOf('drawComet(') < far.indexOf('for (const bp'));
assert.ok(/farXY\(D\.sun!?, W, H, cx, cy, zf\)/.test(far));
assert.ok(
  !source
    .slice(
      source.indexOf('function drawDecorNear'),
      source.indexOf('function drawDecorNear') + 6000,
    )
    .includes('D.comet'),
);
assert.ok(far.includes('ctx.globalAlpha = 1;\n    ctx.drawImage(P.canvas'));
console.log(
  'Comet motion, continuity, parallax, anti-solar orientation, layer order and opacity guard passed.',
);
