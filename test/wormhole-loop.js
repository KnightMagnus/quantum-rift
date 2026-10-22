// Verify actual shipped pixels: an index-only wrap test cannot catch a broken source atlas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { WORMHOLE } from '../client/wormhole_animation.ts';
import { loopFrames } from '../client/animation_frames.ts';
const wormholeFrame = (now) => loopFrames(now, WORMHOLE.frames, WORMHOLE.frameMs).first;

const bytes = fs.readFileSync(new URL('../client/assets/wormhole.png', import.meta.url));
assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const width = bytes.readUInt32BE(16),
  height = bytes.readUInt32BE(20);
assert.equal(width, WORMHOLE.columns * WORMHOLE.frameSize);
assert.equal(height, (WORMHOLE.frames / WORMHOLE.columns) * WORMHOLE.frameSize);
assert.equal(bytes[24], 8, '8-bit channel depth');
assert.equal(bytes[25], 6, 'RGBA pixels');
assert.equal(bytes[28], 0, 'noninterlaced PNG');
const compressed = [];
for (let p = 8; p < bytes.length;) {
  const n = bytes.readUInt32BE(p),
    type = bytes.toString('ascii', p + 4, p + 8);
  if (type === 'IDAT') compressed.push(bytes.subarray(p + 8, p + 8 + n));
  p += 12 + n;
}
const raw = inflateSync(Buffer.concat(compressed)),
  stride = width * 4;
assert.equal(raw.length, (stride + 1) * height);
const rgba = Buffer.alloc(stride * height);
function paeth(a, b, c) {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  assert.ok(filter <= 4, 'valid PNG filter');
  for (let x = 0; x < stride; x++) {
    const i = y * stride + x,
      a = x >= 4 ? rgba[i - 4] : 0,
      b = y ? rgba[i - stride] : 0,
      c = y && x >= 4 ? rgba[i - stride - 4] : 0;
    const predictor =
      filter === 0
        ? 0
        : filter === 1
          ? a
          : filter === 2
            ? b
            : filter === 3
              ? Math.floor((a + b) / 2)
              : paeth(a, b, c);
    rgba[i] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
  }
}
const tiles = [];
for (let f = 0; f < WORMHOLE.frames; f++) {
  const tile = Buffer.alloc(WORMHOLE.frameSize ** 2 * 4),
    ox = (f % WORMHOLE.columns) * WORMHOLE.frameSize,
    oy = Math.floor(f / WORMHOLE.columns) * WORMHOLE.frameSize;
  for (let y = 0; y < WORMHOLE.frameSize; y++)
    rgba.copy(
      tile,
      y * WORMHOLE.frameSize * 4,
      ((oy + y) * width + ox) * 4,
      ((oy + y) * width + ox + WORMHOLE.frameSize) * 4,
    );
  tiles.push(tile);
}
assert.equal(
  new Set(tiles.map((tile) => createHash('sha256').update(tile).digest('hex'))).size,
  WORMHOLE.frames,
  'all frames differ; no duplicated endpoint/pause',
);
const deltas = tiles.map((a, f) => {
  const b = tiles[(f + 1) % tiles.length];
  let difference = 0;
  for (let i = 0; i < a.length; i += 4)
    for (let c = 0; c < 3; c++)
      difference += Math.abs(a[i + c] * a[i + 3] - b[i + c] * b[i + 3]) / 65025;
  return difference / (WORMHOLE.frameSize ** 2 * 3);
});
const ordinary = deltas.slice(0, -1).sort((a, b) => a - b),
  median = ordinary[Math.floor(ordinary.length / 2)],
  ratio = deltas.at(-1) / median;
assert.ok(
  deltas.every((d) => d > 0.001),
  'every frame advances internal motion',
);
assert.ok(ratio > 0.8 && ratio < 1.2, `last-to-first pixel delta is not an outlier (${ratio})`);
assert.equal(wormholeFrame(0), 0);
assert.equal(wormholeFrame(32 * 55 - 0.001), 31);
assert.equal(wormholeFrame(32 * 55), 0);
assert.equal(wormholeFrame(32 * 55 + 55), 1);
console.log(
  JSON.stringify({
    check: 'wormhole loop',
    frames: tiles.length,
    size: WORMHOLE.frameSize,
    frameMs: WORMHOLE.frameMs,
    adjacentMedian: median,
    wrapDelta: deltas.at(-1),
    wrapRatio: ratio,
  }),
);
