import assert from 'node:assert/strict';
import { FrameCapture, PERFORMANCE_LIMITS } from '../shared/browser-performance.ts';
const capture = new FrameCapture();
capture.frame(10, true);
assert.equal(capture.samples.length, 0, 'off by default');
capture.start('combat', 0);
for (const timestamp of [1, 11, 31, 71, 131, 331]) capture.frame(timestamp, true);
assert.deepEqual(capture.summary(331), {
  scenario: 'combat',
  recording: true,
  stopReason: null,
  elapsedMs: 331,
  visibilityInterruptions: 0,
  frames: 5,
  sampledMs: 330,
  meanMs: 66,
  p50Ms: 40,
  p95Ms: 200,
  p99Ms: 200,
  maxMs: 200,
  over33_3Ms: 3,
  over50Ms: 2,
  over100Ms: 1,
});
capture.interrupt();
capture.frame(10000, false);
capture.frame(20000, true);
capture.frame(20020, true);
assert.deepEqual(capture.samples, [10, 20, 40, 60, 200, 20], 'hidden interval is excluded');
capture.stop(20030);
capture.frame(21000, true);
assert.equal(capture.summary(90000).elapsedMs, 20030, 'stopped duration stays fixed');
assert.equal(capture.summary(90000).visibilityInterruptions, 1);
capture.start('mining', 0);
capture.frame(1, true);
capture.frame(PERFORMANCE_LIMITS.durationMs, true);
assert.equal(capture.stopReason, 'duration-limit');
capture.start('flight', 0);
for (let index = 0; index <= PERFORMANCE_LIMITS.frames; index++) capture.frame(index, true);
assert.equal(capture.stopReason, 'frame-limit');
assert.equal(capture.samples.length, PERFORMANCE_LIMITS.frames);
capture.clear();
assert.equal(capture.recording, false);
assert.equal(capture.samples.length, 0);
assert.equal(capture.summary(100).p95Ms, null);
console.log('Browser performance bounded sampling, summary, visibility and lifecycle PASS');
