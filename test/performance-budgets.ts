import assert from 'node:assert/strict';
import {
  nativeBuildDigest,
  nativeBuildInputPath,
  nativeBuildToolInputs,
  writeNativeBuildProvenance,
  verifyNativeBuildProvenance,
  nativeRuntimeRelative,
  nativeProvenanceRelative,
} from '../tools/nakama-build-provenance.ts';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parsePerformanceBudgetProfile,
  verifyPerformanceBudgets,
} from '../tools/performance-budgets.ts';
import type { HealthSummary } from '../shared/health.ts';
import { runNativePerformance } from './helpers/native-performance.ts';
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
  metadata: {
    ...environment,
    sourceHead: 'a'.repeat(40),
    sourceDirty: false,
    runtimeSha256: 'b'.repeat(64),
    sourceFingerprint: 'c'.repeat(64),
  },
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
for (const field of ['runtimeSha256', 'sourceFingerprint'] as const) {
  const different = second();
  different.metadata[field] = 'd'.repeat(64);
  assert(
    verifyPerformanceBudgets(profile, [report, different]).failures.includes(
      'same-artifact-required',
    ),
    field,
  );
  for (const invalid of ['', 'unavailable', 'F'.repeat(64), 'a'.repeat(63), null, undefined, 42]) {
    const malformed = second();
    Object.assign(malformed.metadata, { [field]: invalid });
    assert(
      verifyPerformanceBudgets(profile, [report, malformed]).failures.includes(
        'run-2:artifact-provenance',
      ),
      field,
    );
  }
}

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

// Pure provenance checks use isolated fixture bytes; no native service is started.
const provenanceRoot = fs.mkdtempSync(path.join(evidenceDir('performance-budgets'), 'provenance-'));
try {
  for (const directory of ['tools', 'server', 'dist/nakama'])
    fs.mkdirSync(path.join(provenanceRoot, directory), { recursive: true });
  for (const file of [
    'tools/build-nakama.ts',
    'tools/nakama-build-provenance.ts',
    'package-lock.json',
    'server/entry.ts',
  ])
    fs.writeFileSync(path.join(provenanceRoot, file), 'fixture bytes ' + file);
  const runtime = path.join(provenanceRoot, nativeRuntimeRelative);
  const manifest = path.join(provenanceRoot, nativeProvenanceRelative);
  fs.writeFileSync(runtime, 'fixture runtime');
  const captured = nativeBuildToolInputs(provenanceRoot);
  captured.set(
    'server/entry.ts',
    nativeBuildDigest(fs.readFileSync(path.join(provenanceRoot, 'server/entry.ts'))),
  );
  const written = writeNativeBuildProvenance(provenanceRoot, captured);
  const verified = verifyNativeBuildProvenance(provenanceRoot);
  assert.equal(verified.runtimeSha256, written.runtimeSha256);
  assert.equal(verified.sourceFingerprint, written.sourceFingerprint);
  assert.equal(Buffer.from(verified.runtimeBytes).toString(), 'fixture runtime');
  assert(
    !JSON.stringify(written).includes(provenanceRoot),
    'manifest paths are portable, never absolute private paths',
  );
  assert.equal(
    nativeBuildInputPath(provenanceRoot, path.join(provenanceRoot, 'server/entry.ts')),
    'server/entry.ts',
  );
  assert.equal(
    nativeBuildInputPath(
      provenanceRoot,
      path.resolve(provenanceRoot, '../other-checkout/node_modules/package/source.js'),
    ),
    'node_modules/package/source.js',
  );
  assert.throws(() =>
    nativeBuildInputPath(provenanceRoot, path.resolve(provenanceRoot, '../private-source.ts')),
  );
  const original = fs.readFileSync(manifest, 'utf8');
  for (const file of [
    'server/entry.ts',
    'tools/build-nakama.ts',
    'tools/nakama-build-provenance.ts',
    'package-lock.json',
  ]) {
    const absolute = path.join(provenanceRoot, file);
    const bytes = fs.readFileSync(absolute);
    fs.appendFileSync(absolute, ' stale');
    assert.throws(() => verifyNativeBuildProvenance(provenanceRoot), /missing, stale or invalid/);
    assert.throws(
      () => writeNativeBuildProvenance(provenanceRoot, captured),
      /changed/,
      'manifest cannot attest to bytes changed after bundler load',
    );
    fs.writeFileSync(absolute, bytes);
  }
  fs.writeFileSync(runtime, 'tampered runtime');
  assert.throws(() => verifyNativeBuildProvenance(provenanceRoot));
  assert.equal(
    Buffer.from(verified.runtimeBytes).toString(),
    'fixture runtime',
    'verified bytes remain pinned even if ignored dist is concurrently rebuilt',
  );
  fs.writeFileSync(runtime, 'fixture runtime');
  for (const mutate of [
    (value: typeof written) => {
      value.runtimeSha256 = 'a'.repeat(64);
    },
    (value: typeof written) => {
      value.sourceFingerprint = 'a'.repeat(64);
    },
    (value: typeof written) => {
      value.inputs.pop();
    },
    (value: typeof written) => {
      value.inputs[0].path = '../private';
    },
    (value: typeof written) => {
      value.inputs[0].path = '/absolute/private';
    },
    (value: typeof written) => {
      value.inputs.push(value.inputs[0]);
    },
  ]) {
    const changed = structuredClone(written);
    mutate(changed);
    fs.writeFileSync(manifest, JSON.stringify(changed));
    assert.throws(() => verifyNativeBuildProvenance(provenanceRoot));
  }
  fs.writeFileSync(manifest, original);
  assert.deepEqual(verifyNativeBuildProvenance(provenanceRoot), verified);
  fs.unlinkSync(manifest);
  assert.throws(() => verifyNativeBuildProvenance(provenanceRoot), /run npm run build/);
} finally {
  fs.rmSync(provenanceRoot, { recursive: true, force: true });
}
console.log(
  'Native build provenance rejects stale inputs/build tools/lockfiles, tampered/missing artifacts and mixed-report runtime hashes without native startup.',
);

// A stale/missing receipt must fail before the native fixture constructor can allocate.
const statBeforeProvenanceProbe = fs.statSync;
const createBeforeProvenanceProbe = fs.mkdtempSync;
let resourceAttempts = 0;
try {
  fs.statSync = ((filename: fs.PathLike, ...args: unknown[]) => {
    if (String(filename).split(path.sep).join('/').endsWith(nativeProvenanceRelative))
      throw Error('missing fixture receipt');
    return Reflect.apply(statBeforeProvenanceProbe, fs, [filename, ...args]);
  }) as typeof fs.statSync;
  fs.mkdtempSync = (() => {
    resourceAttempts++;
    throw Error('native resources must not be created by provenance rejection');
  }) as typeof fs.mkdtempSync;
  await assert.rejects(
    runNativePerformance({ durationSeconds: 32, captains: 1, seed: 1701 }),
    /Native runtime provenance/,
  );
  assert.equal(
    resourceAttempts,
    0,
    'provenance validation precedes native directory/process allocation',
  );
} finally {
  fs.statSync = statBeforeProvenanceProbe;
  fs.mkdtempSync = createBeforeProvenanceProbe;
}
