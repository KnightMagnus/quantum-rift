import assert from 'node:assert/strict';
import { backgroundScale } from '../client/background_scale.ts';
assert.equal(backgroundScale('wreck'), 0.5);
for (const desc of ['gas giant ringed rings', 'gas giant storm bands', 'ice giant gas giant'])
  assert.equal(backgroundScale('world', desc), 0.6);
for (const kind of ['star', 'ship', 'planet', 'station'])
  assert.equal(backgroundScale(kind, 'gas giant'), 1);
assert.equal(backgroundScale('world', 'ocean world seas'), 1);
console.log('Background sizing: giants/wrecks reduced; stars, ships, foreground worlds unchanged.');
