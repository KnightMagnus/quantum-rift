import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { execFileSync } from 'node:child_process';

import { simulateCombatPlayability } from './helpers/combat-playability-simulation.ts';
const full = !process.argv.includes('--smoke');
const scenarios = full
  ? [
      { system: 'emberlight', fleet: [708], upgraded: false },
      { system: 'gloam', fleet: [736, 717, 717], upgraded: true },
      { system: 'umbra', fleet: [787, 786, 736], upgraded: true },
    ]
  : [{ system: 'emberlight', fleet: [708], upgraded: false }];
const results = scenarios.flatMap((scenario) =>
  (full ? [1701, 1702, 1703] : [1701]).map((seed) => {
    const result = simulateCombatPlayability({ ...scenario, seed, seconds: full ? 480 : 30 });
    assert.ok(Number.isFinite(result.power) && result.power > 0, 'finite fitted fleet power');
    assert.ok(Number.isFinite(result.damageTaken) && result.damageTaken >= 0);
    assert.ok(Number.isFinite(result.remainingHullFraction) && result.remainingHullFraction >= 0);
    assert.ok(result.aliveSeconds > 0 && result.aliveSeconds <= result.seconds);
    assert.ok(Number.isInteger(result.kills) && result.kills >= 0);
    assert.ok(Number.isInteger(result.disables) && result.disables >= 0);
    assert.ok(result.peakHostiles >= result.arrivalHostiles);
    if (result.survived) assert.equal(result.aliveSeconds, result.seconds);
    const { capture: _capture, ...summary } = result;
    console.log(JSON.stringify(summary));
    return result;
  }),
);
if (full && !process.argv.includes('--report-only')) {
  for (const scenario of scenarios) {
    const runs = results.filter((result) => result.system === scenario.system);
    const contestedSurvivors = runs.filter(
      (result) =>
        result.survived && result.damageTaken > 0 && (result.kills > 0 || result.disables > 0),
    );
    assert.ok(
      contestedSurvivors.length >= 2,
      `${scenario.system}: ${contestedSurvivors.length}/3 contested eight-minute survivors; at least 2 required (positive damage and a kill or player-caused disable in each surviving run)`,
    );
  }
}

// Geometry and motion vary independently of RNG; scripted manual is not a human skill estimate.
const experiments = [
  { opponent: 708, distance: 250, angle: 0, lateralSpeed: 0, control: 'assist' as const },
  { opponent: 708, distance: 600, angle: 1.2, lateralSpeed: 60, control: 'assist' as const },
  { opponent: 708, distance: 900, angle: -1.8, lateralSpeed: -80, control: 'manual' as const },
  { opponent: 761, distance: 1200, angle: 2.4, lateralSpeed: 40, control: 'assist' as const },
];
const experimentResults = experiments.map((experiment, index) => {
  const result = simulateCombatPlayability({
    system: 'emberlight',
    fleet: [index === 3 ? 716 : 708],
    upgraded: index === 3,
    seed: 1701,
    seconds: 45,
    experiment,
  });
  assert.ok(result.primaryShots > 0, 'varied encounter exercises lead primary weapons');
  assert.ok(result.tickP95Ms >= 0 && result.tickMaxMs >= result.tickP95Ms);
  assert.ok(result.capture.events.length <= 256);
  const { capture: _capture, ...summary } = result;
  console.log(JSON.stringify(summary));
  return result;
});
assert.equal(
  new Set(experimentResults.map((result) => JSON.stringify(result.capture.actors))).size,
  4,
  'different geometry/motion/fittings produce genuinely distinct initial states',
);
const deterministic = (result: (typeof experimentResults)[number]) => {
  const { tickP95Ms: _p95, tickMaxMs: _max, ...outcomes } = result;
  return outcomes;
};
for (const original of experimentResults) {
  const saved = JSON.parse(JSON.stringify(original)) as typeof original;
  const repeated = simulateCombatPlayability(saved.capture.scenario);
  assert.deepEqual(
    deterministic(repeated),
    deterministic(saved),
    'serialized capture parameters reproduce every outcome and bounded event',
  );
}
const exportAt = process.argv.indexOf('--export');
if (exportAt >= 0) {
  assert.ok(process.argv[exportAt + 1], '--export requires an output file');
  filesystem.writeFileSync(
    process.argv[exportAt + 1],
    JSON.stringify(
      {
        build: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty:
          execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
        runtime: process.version,
        experiments: experimentResults,
      },
      null,
      2,
    ),
  );
}
const replayAt = process.argv.indexOf('--replay');
if (replayAt >= 0) {
  const saved = JSON.parse(filesystem.readFileSync(process.argv[replayAt + 1], 'utf8'));
  assert.equal(
    saved.build,
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    'replay requires exact build',
  );
  assert.equal(saved.dirty, false, 'replay requires a clean capture build');
  assert.equal(saved.runtime, process.version, 'replay requires exact runtime');
  assert.ok(Array.isArray(saved.experiments) && saved.experiments.length <= 4);
  for (const result of saved.experiments) {
    const replay = simulateCombatPlayability(result.capture.scenario);
    assert.deepEqual(
      deterministic(replay),
      deterministic(result),
      'exported scenario reproduces exact outcomes/events',
    );
  }
}
