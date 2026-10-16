import assert from 'node:assert/strict';
import { shipBank } from '../client/ship_banking.js';
// Same 15 Hz network samples rendered at different display rates must hold a steady bank.
function simulate(fps, rate = 0.62, origin = 0, jitter = false) {
  const e = { a: origin, t: 0 },
    frames = [];
  let sample = 0;
  for (let now = 0; now <= 2000; now += 1000 / fps) {
    while (((sample + 1) * 1000) / 15 <= now) {
      sample++;
      e.t = (sample * 1000) / 15 + (jitter ? (sample % 2 ? 4 : -4) : 0);
      // Snapshot headings are quantized to a milliradian by Space.snapshot().
      e.a = Math.round((origin + (rate * e.t) / 1000) * 1000) / 1000;
    }
    const bank = shipBank(e, now);
    if (now > 700) frames.push(bank);
  }
  return { e, frames };
}
for (const fps of [30, 60, 120, 144]) {
  assert.ok(
    simulate(fps).frames.every((b) => b === 1),
    `${fps} Hz: steady right turn holds bank between snapshots`,
  );
  assert.ok(
    simulate(fps, -0.62).frames.every((b) => b === 2),
    `${fps} Hz: steady left turn holds bank`,
  );
  assert.ok(
    simulate(fps, 0.62, Math.PI - 0.1, true).frames.every((b) => b === 1),
    `${fps} Hz: snapshot timing jitter does not flicker bank`,
  );
}
const e = simulate(60, 1.2).e;
for (let at = 2067; at <= 2467; at += 1000 / 15) {
  e.t = at;
  shipBank(e, at);
}
assert.equal(
  shipBank(e, 2470),
  0,
  'finishing the turn returns to level with new stationary samples',
);
const reversing = simulate(60, 1.2).e;
for (let at = 2067; at <= 2667; at += 1000 / 15) {
  reversing.a -= 1.2 / 15;
  reversing.t = at;
  shipBank(reversing, at);
}
assert.equal(shipBank(reversing, 2670), 2, 'an actual opposite turn changes the bank direction');
const stale = simulate(60).e;
assert.equal(shipBank(stale, stale.t + 251), 0, 'lost snapshots do not leave bank latched');
const wrap = { a: Math.PI - 0.04, t: 0 };
shipBank(wrap, 0);
for (let i = 1; i <= 15; i++) {
  wrap.t = (i * 1000) / 15;
  wrap.a = Math.atan2(Math.sin(Math.PI - 0.04 + i * 0.06), Math.cos(Math.PI - 0.04 + i * 0.06));
  shipBank(wrap, wrap.t);
}
assert.equal(shipBank(wrap, wrap.t + 1), 1, 'crossing +/-pi preserves turn direction');
const predicted = { a: 0, t: 0 };
for (let now = 0; now <= 1000; now += 1000 / 60) {
  predicted.a = Math.floor(now / (1000 / 30)) * (1000 / 30) * 0.0007;
  const bank = shipBank(predicted, now, true);
  if (now > 700) assert.equal(bank, 1, '30 Hz local prediction stays banked on a 60 Hz display');
}
console.log(
  'Ship banking passed: 15 Hz snapshots at 30/60/120/144 Hz, quantization, timing jitter, turn stop, stale stream, angle wrap, and local prediction.',
);
