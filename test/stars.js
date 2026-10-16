import assert from 'node:assert/strict';
import { starProfile, drawStar } from '../client/stars.js';

const sun = { core: '210,230,255', halo: '140,180,255' };
const first = starProfile({ id: 'vega' }, sun);
assert.deepEqual(first, starProfile({ id: 'vega' }, sun), 'profiles are deterministic');
assert.deepEqual(first.core, [210, 230, 255], 'existing system palette survives');
assert.deepEqual(starProfile({ id: 'sol' }, sun).core, [255, 244, 220], 'Sol stays yellow');
const crucible = { core: '255,216,208', halo: '255,90,80' };
assert.deepEqual(
  starProfile({ id: 'crucible', arena: true }, crucible).halo,
  [255, 90, 80],
  'Crucible retains its authored red halo',
);
assert.equal(starProfile({ id: 'crucible', arena: true }, crucible).radiusScale, 1);
assert.deepEqual(starProfile({ id: 'far', farside: true }, sun).halo, [140, 180, 255]);
const scales = Array.from({ length: 200 }, (_, i) => starProfile({ id: `s${i}` }, sun).radiusScale);
assert.ok(
  scales.every((n) => n >= 0.8 && n <= 1.25),
  'size variation is bounded',
);
assert.ok(new Set(scales).size > 20, 'ordinary systems have varied apparent sizes');
assert.doesNotThrow(
  () => drawStar(null, { id: 'sol' }, sun, 0, 0, 0, 0),
  'zero-radius stars require no canvas',
);
console.log('Stellar profiles: deterministic palettes, authored overrides and size bounds pass.');
