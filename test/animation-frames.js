import assert from 'node:assert/strict';
import { loopFrames } from '../client/animation_frames.ts';
assert.deepEqual(loopFrames(0, 32, 55), { first: 0, second: 1, mix: 0 });
assert.deepEqual(loopFrames(32 * 55, 32, 55), loopFrames(0, 32, 55));
const before = loopFrames(32 * 55 - 0.001, 32, 55);
assert.equal(before.first, 31);
assert.equal(before.second, 0);
assert.ok(before.mix > 0.9999);
for (let t = 0; t < 10000; t += 7) {
  const f = loopFrames(t, 32, 55);
  assert.ok(
    f.first >= 0 && f.first < 32 && f.second >= 0 && f.second < 32 && f.mix >= 0 && f.mix < 1,
  );
}
console.log('Animation frames: periodic wrap, last-to-first blend and valid indices pass.');
