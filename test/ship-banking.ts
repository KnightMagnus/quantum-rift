import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { augmentAssets, makeLoadout, shipStats } from '../shared/rules.ts';
import { shipBank } from '../client/ship_banking.ts';
// Same 15 Hz network samples rendered at different display rates must hold a steady bank.
function simulate(framesPerSecond: number, rate = 0.62, origin = 0, jitter = false) {
  const entity = { a: origin, t: 0 },
    frames = [];
  let sample = 0;
  for (let currentTime = 0; currentTime <= 2000; currentTime += 1000 / framesPerSecond) {
    while (((sample + 1) * 1000) / 15 <= currentTime) {
      sample++;
      entity.t = (sample * 1000) / 15 + (jitter ? (sample % 2 ? 4 : -4) : 0);
      // Snapshot headings are quantized to a milliradian by Space.snapshot().
      entity.a = Math.round((origin + (rate * entity.t) / 1000) * 1000) / 1000;
    }
    const bank = shipBank(entity, currentTime);
    if (currentTime > 700) frames.push(bank);
  }
  return { e: entity, frames };
}
for (const framesPerSecond of [30, 60, 120, 144]) {
  assert.ok(
    simulate(framesPerSecond).frames.every((secondValue) => secondValue === 1),
    `${framesPerSecond} Hz: steady right turn holds bank between snapshots`,
  );
  assert.ok(
    simulate(framesPerSecond, -0.62).frames.every((secondValue) => secondValue === 2),
    `${framesPerSecond} Hz: steady left turn holds bank`,
  );
  assert.ok(
    simulate(framesPerSecond, 0.62, Math.PI - 0.1, true).frames.every(
      (secondValue) => secondValue === 1,
    ),
    `${framesPerSecond} Hz: snapshot timing jitter does not flicker bank`,
  );
}
const message = simulate(60, 1.2).e;
for (let advanceTo = 2067; advanceTo <= 2467; advanceTo += 1000 / 15) {
  message.t = advanceTo;
  shipBank(message, advanceTo);
}
assert.equal(
  shipBank(message, 2470),
  0,
  'finishing the turn returns to level with new stationary samples',
);
const reversing = simulate(60, 1.2).e;
for (let advanceTo = 2067; advanceTo <= 2667; advanceTo += 1000 / 15) {
  reversing.a -= 1.2 / 15;
  reversing.t = advanceTo;
  shipBank(reversing, advanceTo);
}
assert.equal(shipBank(reversing, 2670), 2, 'an actual opposite turn changes the bank direction');
const stale = simulate(60).e;
assert.equal(shipBank(stale, stale.t + 251), 0, 'lost snapshots do not leave bank latched');
const wrap = { a: Math.PI - 0.04, t: 0 };
shipBank(wrap, 0);
for (let index = 1; index <= 15; index++) {
  wrap.t = (index * 1000) / 15;
  wrap.a = Math.atan2(
    Math.sin(Math.PI - 0.04 + index * 0.06),
    Math.cos(Math.PI - 0.04 + index * 0.06),
  );
  shipBank(wrap, wrap.t);
}
assert.equal(shipBank(wrap, wrap.t + 1), 1, 'crossing +/-pi preserves turn direction');
const predicted = { a: 0, t: 0 };
for (let currentTime = 0; currentTime <= 1000; currentTime += 1000 / 60) {
  predicted.a = Math.floor(currentTime / (1000 / 30)) * (1000 / 30) * 0.0007;
  const bank = shipBank(predicted, currentTime, true);
  if (currentTime > 700)
    assert.equal(bank, 1, '30 Hz local prediction stays banked on a 60 Hz display');
}
console.log(
  'Ship banking passed: 15 Hz snapshots at 30/60/120/144 Hz, quantization, timing jitter, turn stop, stale stream, angle wrap, and local prediction.',
);

// Large hulls must bank at their actual stock turn rate, not an assumed fighter rate.
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
augmentAssets(assets);
for (const hull of Object.values(assets.ships)) {
  const rate = requiredFixtureValue(shipStats(assets, makeLoadout(assets, hull.id))).turn;
  for (const framesPerSecond of [30, 60, 144]) {
    for (const direction of [-1, 1]) {
      assert.ok(
        simulate(framesPerSecond, direction * rate, Math.PI - 0.1, true).frames.every(
          (bank) => bank === (direction > 0 ? 1 : 2),
        ),
        `${hull.name} stock turn at ${framesPerSecond} Hz holds its ${direction > 0 ? 'right' : 'left'} bank`,
      );
    }
  }
}
const quantizedStill = { a: 0, t: 0 };
for (let index = 0; index < 45; index++) {
  quantizedStill.t = (index * 1000) / 15;
  quantizedStill.a = index % 2 ? 0.001 : -0.001;
  assert.equal(
    shipBank(quantizedStill, quantizedStill.t),
    0,
    'stationary quantization noise stays level',
  );
}
console.log(
  `All ${Object.keys(assets.ships).length} hulls bank in both directions at stock rates; stationary quantization noise stays level.`,
);
