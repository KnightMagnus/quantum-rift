import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parsePerformanceBudgetProfile,
  verifyPerformanceBudgets,
} from '../tools/performance-budgets.ts';
import type { HealthSummary } from '../shared/health.ts';
import { evidenceDir } from './helpers/browser-fixture.ts';

// Synthetic measurements test verifier semantics, not deployment performance.
const environment = {
  platform: 'linux',
  arch: 'x64',
  cpuModel: 'fixture CPU',
  logicalCpus: 4,
  node: 'v27.0.0',
  sdk: '2.8.0',
  nakama: '3.41.0',
  postgres: '18.0',
};
const profile = {
  schema: 1,
  name: 'synthetic verifier fixture',
  environment,
  workload: { durationSeconds: 60, captains: 4, seed: 1701 },
  minimumRuns: 2,
  budgets: {
    tickP95Ms: 3,
    tickMaxMs: 10,
    checkpointP95Ms: 4,
    snapshotGapP95Ms: 100,
    sendDriftP95Ms: 5,
    reconnectToFlightMs: 200,
    restartToFlightMs: 2000,
    nativeResidentKiB: 100000,
    checkpointBytes: 200000,
  },
};
const summary = (value: number, count = 20): HealthSummary => ({
  count,
  retained: Math.min(count, 512),
  total: count * value,
  max: value,
  last: value,
  p50: value,
  p95: value,
});
const report = {
  schema: 1,
  status: 'passed',
  failedPhase: null,
  started: '2026-10-27T00:00:00.000Z',
  metadata: { ...environment, sourceHead: 'a'.repeat(40), sourceDirty: false },
  workload: { ...profile.workload, inputHz: 10 },
  measuredElapsedMs: 60000,
  restoredCaptains: 4,
  inputPackets: 2400,
  checkpointRevision: 1,
  checkpointBytes: 200000,
  cleanup: { succeeded: true, allExited: true, exited: 4, processes: 4 },
  connections: [{ errorCount: 0, snapshotCount: 21, snapshotGapMs: summary(100) }],
  health: [{ tickMs: { ...summary(3), max: 10, total: 67 }, checkpointMs: summary(4) }],
  sendDriftMs: summary(5, 600),
  reconnectToFlightMs: 200,
  restartToFlightMs: 2000,
  resources: [{ role: 'nakama', residentKiB: 100000 }],
};
const second = () => ({ ...structuredClone(report), started: '2026-10-27T00:02:00.000Z' });
assert(verifyPerformanceBudgets(profile, [report, second()]).passed, 'inclusive thresholds');
assert(!verifyPerformanceBudgets(profile, [report]).passed, 'repeat evidence required');
assert(!verifyPerformanceBudgets(profile, [report, report]).passed, 'duplicate report rejected');
const mixed = second();
mixed.metadata.sourceHead = 'b'.repeat(40);
assert(!verifyPerformanceBudgets(profile, [report, mixed]).passed, 'same build required');
for (const mutate of [
  (value: typeof report) => {
    value.status = 'failed';
  },
  (value: typeof report) => {
    value.schema = 2;
  },
  (value: typeof report) => {
    value.metadata.cpuModel = 'other CPU';
  },
  (value: typeof report) => {
    value.metadata.sourceDirty = true;
  },
  (value: typeof report) => {
    value.workload.captains = 5;
  },
  (value: typeof report) => {
    value.measuredElapsedMs = 59999;
  },
  (value: typeof report) => {
    value.inputPackets--;
  },
  (value: typeof report) => {
    value.restoredCaptains--;
  },
  (value: typeof report) => {
    value.checkpointRevision = 0;
  },
  (value: typeof report) => {
    value.cleanup.allExited = false;
  },
  (value: typeof report) => {
    value.connections[0].errorCount = 1;
  },
  (value: typeof report) => {
    value.health = [];
  },
]) {
  const changed = second();
  mutate(changed);
  assert(!verifyPerformanceBudgets(profile, [report, changed]).passed);
}
for (const key of ['tickFailures', 'spaceFailures', 'checkpointFreezes', 'frozenTicks']) {
  const changed = second();
  Object.assign(changed.health[0], { [key]: { count: 1 } });
  assert(!verifyPerformanceBudgets(profile, [report, changed]).passed, key);
}
for (const name of Object.keys(profile.budgets)) {
  const changedProfile = structuredClone(profile);
  changedProfile.budgets[name as keyof typeof profile.budgets] /= 2;
  const result = verifyPerformanceBudgets(changedProfile, [report, second()]);
  assert(
    result.failures.some((failure) => failure.includes(name + ':over-budget')),
    name,
  );
}
const missing = second();
missing.health = [
  { tickMs: { ...summary(3), max: 10, total: 67 } } as (typeof report.health)[number],
];
assert(
  verifyPerformanceBudgets(profile, [report, missing]).failures.includes(
    'run-2:checkpointP95Ms:missing-or-invalid',
  ),
);
const shortConnection = second();
Object.assign(shortConnection.connections[0], { snapshotCount: 1, snapshotGapMs: null });
assert(!verifyPerformanceBudgets(profile, [report, shortConnection]).passed, 'no measured gaps');
const withShortConnection = second();
withShortConnection.connections.push({
  errorCount: 0,
  snapshotGapMs: null,
} as unknown as (typeof report.connections)[number]);
Object.assign(withShortConnection.connections[1], { snapshotCount: 1 });
assert(
  verifyPerformanceBudgets(profile, [report, withShortConnection]).passed,
  'ignore connections without an interval',
);
// Actual HealthSummary fields must prove observations exist for every timing budget.
for (const [metricName, getSummary] of [
  ['tickP95Ms', (value: typeof report) => value.health[0].tickMs],
  ['tickMaxMs', (value: typeof report) => value.health[0].tickMs],
  ['checkpointP95Ms', (value: typeof report) => value.health[0].checkpointMs],
  ['snapshotGapP95Ms', (value: typeof report) => value.connections[0].snapshotGapMs],
  ['sendDriftP95Ms', (value: typeof report) => value.sendDriftMs],
] as const) {
  for (const field of ['count', 'retained']) {
    for (const invalid of [undefined, null, 0, -1, 1.5, Infinity, '20']) {
      const changed = second();
      const measurement = getSummary(changed) as unknown as Record<string, unknown>;
      if (invalid === undefined) delete measurement[field];
      else measurement[field] = invalid;
      const result = verifyPerformanceBudgets(profile, [report, changed]);
      assert(
        result.failures.includes(`run-2:${metricName}:missing-or-invalid`),
        `${metricName} ${field}=${invalid}`,
      );
    }
  }
  for (const invalid of ['more-than-count', 'above-limit']) {
    const changed = second();
    const measurement = getSummary(changed);
    if (invalid === 'more-than-count') measurement.retained = measurement.count + 1;
    else {
      measurement.retained = 4097;
      measurement.count = 5000;
    }
    assert(
      !verifyPerformanceBudgets(profile, [report, changed]).passed,
      `${metricName} invalid retained bounds`,
    );
  }
}
for (const snapshotCount of [undefined, null, -1, 1.5, Infinity, '21', 22]) {
  const changed = second();
  const connection = changed.connections[0] as unknown as Record<string, unknown>;
  if (snapshotCount === undefined) delete connection.snapshotCount;
  else connection.snapshotCount = snapshotCount;
  assert(
    verifyPerformanceBudgets(profile, [report, changed]).failures.includes(
      'run-2:snapshotGapP95Ms:missing-or-invalid',
    ),
    'snapshot intervals match lifetime snapshot count',
  );
}
const zeroTimings = second();
zeroTimings.health[0] = { tickMs: summary(0), checkpointMs: summary(0) };
zeroTimings.connections[0].snapshotGapMs = summary(0);
zeroTimings.sendDriftMs = summary(0, 600);
assert(
  verifyPerformanceBudgets(profile, [report, zeroTimings]).passed,
  'real zero-duration observations remain valid',
);
for (const key of ['tickFailures', 'spaceFailures', 'checkpointFreezes', 'frozenTicks']) {
  const changed = second();
  Object.assign(changed.health[0], { [key]: { count: 0 } });
  assert(
    verifyPerformanceBudgets(profile, [report, changed]).passed,
    'explicit zero failure counters need no timing samples',
  );
}
const nonfinite = second();
nonfinite.sendDriftMs.p95 = Infinity;
assert(!verifyPerformanceBudgets(profile, [report, nonfinite]).passed);
for (const invalid of [
  null,
  [],
  {},
  { ...profile, schema: 2 },
  { ...profile, extra: true },
  { ...profile, minimumRuns: 1 },
  { ...profile, budgets: {} },
  { ...profile, budgets: { typo: 1 } },
  { ...profile, budgets: { tickP95Ms: NaN } },
  { ...profile, environment: { ...environment, cpuModel: 'unavailable' } },
  { ...profile, workload: { ...profile.workload, seed: -1 } },
])
  assert.throws(() => parsePerformanceBudgetProfile(invalid));

const directory = fs.mkdtempSync(path.join(evidenceDir('performance-budgets'), 'fixture-'));
try {
  const write = (name: string, value: unknown) => {
    const file = path.join(directory, name + '.json');
    fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    return file;
  };
  const profilePath = write('profile', profile);
  const firstPath = write('first', report);
  const secondPath = write('second', second());
  const run = (files: string[]) =>
    spawnSync(process.execPath, ['tools/performance-budgets.ts', ...files], {
      encoding: 'utf8',
      timeout: 5000,
    });
  const passing = run([profilePath, firstPath, secondPath]);
  assert.equal(passing.status, 0, passing.stderr);
  assert.equal(JSON.parse(passing.stdout).passed, true);
  const failing = run([profilePath, firstPath, firstPath]);
  assert.equal(failing.status, 1);
  assert.equal(JSON.parse(failing.stdout).passed, false);
  fs.writeFileSync(secondPath, '{');
  assert.equal(run([profilePath, firstPath, secondPath]).status, 1);
  fs.writeFileSync(secondPath, ' '.repeat(4 * 1024 * 1024 + 1));
  assert.equal(run([profilePath, firstPath, secondPath]).status, 1);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log(
  'Native budget profiles enforce repeats, exact provenance/workload, failures, thresholds, missing metrics and CLI exits.',
);
