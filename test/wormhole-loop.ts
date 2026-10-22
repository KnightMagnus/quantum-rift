import { requiredFixtureValue } from './helpers/required.ts';
// Verify actual shipped pixels: an index-only wrap test cannot catch a broken source atlas.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { WORMHOLE } from '../client/wormhole_animation.ts';
import { loopFrames } from '../client/animation_frames.ts';
const wormholeFrame = (currentTime: number) =>
  loopFrames(currentTime, WORMHOLE.frames, WORMHOLE.frameMs).first;

const bytes = filesystem.readFileSync(new URL('../client/assets/wormhole.png', import.meta.url));
assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const width = bytes.readUInt32BE(16),
  height = bytes.readUInt32BE(20);
assert.equal(width, WORMHOLE.columns * WORMHOLE.frameSize);
assert.equal(height, (WORMHOLE.frames / WORMHOLE.columns) * WORMHOLE.frameSize);
assert.equal(bytes[24], 8, '8-bit channel depth');
assert.equal(bytes[25], 6, 'RGBA pixels');
assert.equal(bytes[28], 0, 'noninterlaced PNG');
const compressed = [];
for (let player = 8; player < bytes.length;) {
  const quantity = bytes.readUInt32BE(player),
    type = bytes.toString('ascii', player + 4, player + 8);
  if (type === 'IDAT') compressed.push(bytes.subarray(player + 8, player + 8 + quantity));
  player += 12 + quantity;
}
const rawData = inflateSync(Buffer.concat(compressed)),
  stride = width * 4;
assert.equal(rawData.length, (stride + 1) * height);
const rgba = Buffer.alloc(stride * height);
function paeth(firstValue: number, secondValue: number, captain: number) {
  const player = firstValue + secondValue - captain,
    firstPosition = Math.abs(player - firstValue),
    secondPosition = Math.abs(player - secondValue),
    thirdPosition = Math.abs(player - captain);
  return firstPosition <= secondPosition && firstPosition <= thirdPosition
    ? firstValue
    : secondPosition <= thirdPosition
      ? secondValue
      : captain;
}
for (let verticalPosition = 0; verticalPosition < height; verticalPosition++) {
  const filter = rawData[verticalPosition * (stride + 1)];
  assert.ok(filter <= 4, 'valid PNG filter');
  for (let horizontalPosition = 0; horizontalPosition < stride; horizontalPosition++) {
    const index = verticalPosition * stride + horizontalPosition,
      firstValue = horizontalPosition >= 4 ? rgba[index - 4] : 0,
      secondValue = verticalPosition ? rgba[index - stride] : 0,
      captain = verticalPosition && horizontalPosition >= 4 ? rgba[index - stride - 4] : 0;
    const predictor =
      filter === 0
        ? 0
        : filter === 1
          ? firstValue
          : filter === 2
            ? secondValue
            : filter === 3
              ? Math.floor((firstValue + secondValue) / 2)
              : paeth(firstValue, secondValue, captain);
    rgba[index] =
      (rawData[verticalPosition * (stride + 1) + 1 + horizontalPosition] + predictor) & 255;
  }
}
const tiles: Buffer[] = [];
for (let feature = 0; feature < WORMHOLE.frames; feature++) {
  const tile = Buffer.alloc(WORMHOLE.frameSize ** 2 * 4),
    originX = (feature % WORMHOLE.columns) * WORMHOLE.frameSize,
    originY = Math.floor(feature / WORMHOLE.columns) * WORMHOLE.frameSize;
  for (let verticalPosition2 = 0; verticalPosition2 < WORMHOLE.frameSize; verticalPosition2++)
    rgba.copy(
      tile,
      verticalPosition2 * WORMHOLE.frameSize * 4,
      ((originY + verticalPosition2) * width + originX) * 4,
      ((originY + verticalPosition2) * width + originX + WORMHOLE.frameSize) * 4,
    );
  tiles.push(tile);
}
assert.equal(
  new Set(tiles.map((tile) => createHash('sha256').update(tile).digest('hex'))).size,
  WORMHOLE.frames,
  'all frames differ; no duplicated endpoint/pause',
);
const deltas = tiles.map((firstEntry, feature) => {
  const secondEntry = tiles[(feature + 1) % tiles.length];
  let difference = 0;
  for (let index = 0; index < firstEntry.length; index += 4)
    for (let captain = 0; captain < 3; captain++)
      difference +=
        Math.abs(
          firstEntry[index + captain] * firstEntry[index + 3] -
            secondEntry[index + captain] * secondEntry[index + 3],
        ) / 65025;
  return difference / (WORMHOLE.frameSize ** 2 * 3);
});
const ordinary = deltas.slice(0, -1).sort((firstValue, secondValue) => firstValue - secondValue),
  median = ordinary[Math.floor(ordinary.length / 2)],
  ratio = requiredFixtureValue(deltas.at(-1)) / median;
assert.ok(
  deltas.every((playerData) => playerData > 0.001),
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
