import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import { advanceFlightClock } from '../client/flight-clock.ts';
import { DT } from '../shared/rules.ts';

// Independent elapsed-time displacement, with the original DT and extrapolation remainder.
for (const framesPerSecond of [30, 60, 144]) {
  let remainder = 0,
    position = 0,
    ticks = 0;
  for (let frame = 0; frame < framesPerSecond * 10; frame++) {
    remainder = advanceFlightClock(remainder, 1 / framesPerSecond, DT, () => {
      position += 120 * DT;
      ticks++;
    });
  }
  assert.ok(Math.abs(position + remainder * 120 - 1200) < 0.000001);
  assert.ok(Math.abs(ticks - 10 / DT) <= 1);
  assert.ok(remainder >= 0 && remainder < DT);
}
let updates = 0;
const remainder = advanceFlightClock(0, 30, DT, () => updates++);
assert.equal(updates, 3, 'a hitch is clamped to the original 100ms catch-up budget');
assert.ok(remainder < DT);
assert.equal(
  advanceFlightClock(0, -1, DT, () => updates++),
  0,
);
assert.equal(updates, 3, 'negative elapsed time never rewinds simulation');

const read = (file: string) =>
  fileSystem.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.dependencies.excalibur, '0.32.0');
assert.equal(packageJson.devDependencies.esbuild, '0.25.12');
assert.ok(!/requestAnimationFrame\s*\(/.test(read('client/main.ts')), 'no second flight RAF');
assert.ok(
  !/requestAnimationFrame\s*\(/.test(read('client/login_scene.ts')),
  'login artwork shares engine clock',
);
assert.ok(
  !/fixedUpdate(?:Fps|Timestep)\s*:/.test(read('client/engine.ts')),
  'no second fixed-step accumulator',
);
const bundle = read('dist/client/engine.js');
assert.ok(/class _?Engine/.test(bundle));
assert.ok(!/from\s*['"]excalibur['"]/.test(bundle), 'runtime engine dependency is bundled locally');
assert.ok(
  !/new Function\(|\beval\(/.test(bundle),
  'unused engine coroutine evaluation is tree-shaken',
);
console.log(
  'Engine clock: 30/60/144Hz interpolation, DT/hitch budget, exclusive RAF and pinned local no-eval bundle PASS',
);
