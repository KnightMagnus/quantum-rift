import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { execFileSync } from 'node:child_process';
import { simulateCombatPlayability } from './helpers/combat-playability-simulation.ts';

const scenarios = [
  { label: 'stock-frigate', fleet: [741], storyEncounter: {} },
  { label: 'stock-cruiser', fleet: [742], storyEncounter: {} },
  { label: 'fitted-cruiser', fleet: [742], storyEncounter: { fitted: true } },
  { label: 'prepared-cruiser', fleet: [742], storyEncounter: { fitted: true, prepared: true } },
  { label: 'stock-spire', fleet: [795], storyEncounter: {} },
  { label: 'stock-mountain', fleet: [774], storyEncounter: {} },
  { label: 'manual-mountain', fleet: [774], storyEncounter: { standOff: 3200 } },
  { label: 'modest-wing', fleet: [742, 741, 741], storyEncounter: {} },
];
const bonusIndex = process.argv.indexOf('--bonus');
const override = bonusIndex < 0 ? undefined : Number(process.argv[bonusIndex + 1]);
if (override !== undefined)
  assert.ok(Number.isFinite(override) && override >= 0 && override <= 120);
const results = scenarios.flatMap((scenario) =>
  [1701, 1702, 1703].map((seed) => {
    const result = simulateCombatPlayability({
      system: 'umbra',
      fleet: scenario.fleet,
      seed,
      seconds: 180,
      upgraded: false,
      storyEncounter: {
        ...scenario.storyEncounter,
        ...(override === undefined ? {} : { bonusPct: override }),
      },
    });
    const observed = result.storyOutcome!;
    assert.ok(observed.bossInitialHealth > 0);
    if (observed.bossDefeated) assert.equal(result.survived, true, 'a mutual death is not a clear');
    assert.ok(Number.isFinite(observed.bossHealthFraction));
    assert.ok(observed.distance.min >= 0 && observed.distance.max >= observed.distance.mean);
    assert.ok(Object.values(observed.bossDamage).every((damage) => damage >= 0));
    assert.ok(Object.values(observed.leadDamage).every((damage) => damage >= 0));
    assert.ok(result.primaryShots > 0, 'each scenario really engages, not merely survives');
    assert.ok(result.aliveSeconds <= 180 && result.aliveSeconds > 0);
    const { capture: _capture, ...summary } = result;
    console.log(JSON.stringify({ label: scenario.label, ...summary }));
    return { label: scenario.label, ...result };
  }),
);
const repeat = simulateCombatPlayability(results[0].capture.scenario);
const deterministic = (result: ReturnType<typeof simulateCombatPlayability>) => {
  const { tickP95Ms: _p95, tickMaxMs: _max, ...outcome } = result;
  return outcome;
};
const { label: _label, ...original } = results[0];
assert.deepEqual(
  deterministic(repeat),
  deterministic(original),
  'seed and geometry reproduce exact outcome',
);
assert.equal(results[0].storyOutcome!.bossInitialHealth, 6600 * (1 + (override ?? 0) / 100));
if (override === undefined) {
  for (const label of ['prepared-cruiser', 'modest-wing']) {
    assert.ok(
      results.filter((run) => run.label === label && run.storyOutcome!.bossDefeated).length >= 2,
      `${label}: reasonable preparation must clear at least two fixed seeds`,
    );
  }
  assert.ok(
    results
      .filter((run) => run.label === 'stock-frigate')
      .every((run) => !run.storyOutcome!.bossDefeated),
    'unprepared light ship does not trivialize the climax',
  );
}
const exportIndex = process.argv.indexOf('--export');
if (exportIndex >= 0)
  filesystem.writeFileSync(
    process.argv[exportIndex + 1],
    JSON.stringify(
      {
        build: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        runtime: process.version,
        dirty:
          execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
        results,
      },
      null,
      2,
    ),
  );
