import assert from 'node:assert/strict';
import { loopFrames } from '../client/animation_frames.ts';
assert.deepEqual(loopFrames(0, 32, 55), { first: 0, second: 1, mix: 0 });
assert.deepEqual(loopFrames(32 * 55, 32, 55), loopFrames(0, 32, 55));
const before = loopFrames(32 * 55 - 0.001, 32, 55);
assert.equal(before.first, 31);
assert.equal(before.second, 0);
assert.ok(before.mix > 0.9999);
for (let messageType = 0; messageType < 10000; messageType += 7) {
  const feature = loopFrames(messageType, 32, 55);
  assert.ok(
    feature.first >= 0 &&
      feature.first < 32 &&
      feature.second >= 0 &&
      feature.second < 32 &&
      feature.mix >= 0 &&
      feature.mix < 1,
  );
}
console.log('Animation frames: periodic wrap, last-to-first blend and valid indices pass.');
