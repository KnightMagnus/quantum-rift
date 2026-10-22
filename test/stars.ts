import assert from 'node:assert/strict';
import { starProfile, drawStar } from '../client/stars.ts';

const sunPosition = { core: '210,230,255', halo: '140,180,255' };
const first = starProfile({ id: 'vega' }, sunPosition);
assert.deepEqual(first, starProfile({ id: 'vega' }, sunPosition), 'profiles are deterministic');
assert.deepEqual(first.core, [210, 230, 255], 'existing system palette survives');
assert.deepEqual(starProfile({ id: 'sol' }, sunPosition).core, [255, 244, 220], 'Sol stays yellow');
const crucible = { core: '255,216,208', halo: '255,90,80' };
assert.deepEqual(
  starProfile({ id: 'crucible', arena: true }, crucible).halo,
  [255, 90, 80],
  'Crucible retains its authored red halo',
);
assert.equal(starProfile({ id: 'crucible', arena: true }, crucible).radiusScale, 1);
assert.deepEqual(
  starProfile(Object.assign({ id: 'far' }, { farside: true }), sunPosition).halo,
  [140, 180, 255],
);
const scales = Array.from(
  { length: 200 },
  (_unused, index) => starProfile({ id: `s${index}` }, sunPosition).radiusScale,
);
assert.ok(
  scales.every((quantity) => quantity >= 0.8 && quantity <= 1.25),
  'size variation is bounded',
);
assert.ok(new Set(scales).size > 20, 'ordinary systems have varied apparent sizes');
assert.doesNotThrow(
  () =>
    drawStar(null as unknown as CanvasRenderingContext2D, { id: 'sol' }, sunPosition, 0, 0, 0, 0),
  'zero-radius stars require no canvas',
);
console.log('Stellar profiles: deterministic palettes, authored overrides and size bounds pass.');
