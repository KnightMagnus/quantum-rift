import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { cometPose, cometScreen, cometTailAngle, COMET_DEPTH } from '../client/comet.ts';
const cometDescriptor = { x0: 5200, y0: 0, len: 700, hue: '170,220,255' };
for (const sampleTime of [0, 899999, 900000, 4523893, 1e9]) {
  assert.deepEqual(
    cometPose(cometDescriptor, sampleTime),
    cometPose({ ...cometDescriptor }, sampleTime),
  );
  const firstEntry = cometPose(cometDescriptor, sampleTime),
    secondEntry = cometPose(cometDescriptor, sampleTime + 1000);
  const speed = Math.hypot(secondEntry.x - firstEntry.x, secondEntry.y - firstEntry.y);
  assert.ok(speed > 0.7 && speed < 1.3, 'slow continuous drift, including old reset');
}
const period = 720 * Math.PI * 2 * 1000;
const start = cometPose(cometDescriptor, 0),
  positionAfterOrbit = cometPose(cometDescriptor, period);
assert.ok(Math.hypot(start.x - positionAfterOrbit.x, start.y - positionAfterOrbit.y) < 1e-9);
for (const zoom of [0.4, 1, 2])
  for (const centerX of [-2000, 0, 2000]) {
    const firstEntry = cometScreen(cometDescriptor, 1200, 800, zoom, centerX, 300, 0);
    const secondEntry = cometScreen(cometDescriptor, 1200, 800, zoom, centerX + 100, 300, 0);
    assert.ok(Math.abs(firstEntry.x - secondEntry.x - 100 * COMET_DEPTH * zoom ** 0.25) < 1e-9);
    const sunPosition = {
      x: 600 + (150 - centerX * 0.03) * zoom ** 0.25,
      y: 400 + (-90 - 300 * 0.03) * zoom ** 0.25,
    };
    for (const time of [0, period / 2]) {
      const projectedComet = cometScreen(cometDescriptor, 1200, 800, zoom, centerX, 300, time),
        angle = cometTailAngle(projectedComet, sunPosition);
      const deltaX = projectedComet.x - sunPosition.x,
        deltaY = projectedComet.y - sunPosition.y;
      assert.ok(Math.abs(Math.cos(angle) * deltaY - Math.sin(angle) * deltaX) < 1e-9);
      assert.ok(
        Math.cos(angle) * deltaX + Math.sin(angle) * deltaY > 0,
        'anti-solar on both sides while panning',
      );
    }
  }
const source = filesystem.readFileSync(new URL('../client/render.ts', import.meta.url), 'utf8');
const farLayer = source.slice(
  source.indexOf('function drawDecorFar'),
  source.indexOf('function drawDecorMid'),
);
assert.ok(farLayer.indexOf('drawComet(') < farLayer.indexOf('of [...decorModel.bgp!].sort('));
assert.ok(
  /farXY\(\s*decorModel\.sun!?,\s*width,\s*height,\s*centerX,\s*centerY,\s*zoomFactor,?\s*\)/.test(
    farLayer,
  ),
);
assert.ok(
  !source
    .slice(
      source.indexOf('function drawDecorNear'),
      source.indexOf('function drawDecorNear') + 6000,
    )
    .includes('decorModel.comet'),
);
assert.ok(
  /canvasRenderingContext2D\.globalAlpha = 1;\s*canvasRenderingContext2D\.drawImage\(\s*planetSprite\d*\.canvas/.test(
    farLayer,
  ),
);
console.log(
  'Comet motion, continuity, parallax, anti-solar orientation, layer order and opacity guard passed.',
);
