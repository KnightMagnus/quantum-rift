import fs from 'node:fs';
import { INSTANCE_PLAYER_LIMIT } from '../shared/world-capacity.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HealthSummary } from '../shared/health.ts';

const environmentKeys = [
  'platform',
  'arch',
  'cpuModel',
  'logicalCpus',
  'node',
  'sdk',
  'nakama',
  'postgres',
] as const;
const metricNames = [
  'tickP95Ms',
  'tickMaxMs',
  'checkpointP95Ms',
  'snapshotGapP95Ms',
  'sendDriftP95Ms',
  'reconnectToFlightMs',
  'restartToFlightMs',
  'nativeResidentKiB',
  'checkpointBytes',
] as const;
/** Metrics supported by the native numeric-report verifier. */
export type PerformanceBudgetMetric = (typeof metricNames)[number];
/** Explicit deployment targets or lab regression alarms, never inferred by the verifier. */
export interface PerformanceBudgetProfile {
  /** Profile format; newer formats require an updated verifier. */
  schema: 1;
  /** Human-chosen hardware/workload label; lab alarms are not deployment promises. */
  name: string;
  /** Exact runtime and hardware identity from the native report. */
  environment: Record<(typeof environmentKeys)[number], string | number>;
  /** Exact measured workload identity; not a capacity claim. */
  workload: { durationSeconds: number; captains: number; seed: number };
  /** At least two independent, same-build reports are required. */
  minimumRuns: number;
  /** Maximum permitted observations; missing metrics fail closed. */
  budgets: Partial<Record<PerformanceBudgetMetric, number>>;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function validEnvironment(value: unknown) {
  if (!object(value) || !exactKeys(value, environmentKeys)) return false;
  return environmentKeys.every((key) =>
    key === 'logicalCpus'
      ? Number.isSafeInteger(value[key]) && Number(value[key]) > 0
      : typeof value[key] === 'string' && value[key].length > 0 && value[key] !== 'unavailable',
  );
}
/** Reject malformed, unknown-field and incomplete profiles without inspecting services. */
export function parsePerformanceBudgetProfile(value: unknown): PerformanceBudgetProfile {
  if (
    !object(value) ||
    !exactKeys(value, ['schema', 'name', 'environment', 'workload', 'minimumRuns', 'budgets']) ||
    value.schema !== 1 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 120 ||
    !Number.isSafeInteger(value.minimumRuns) ||
    Number(value.minimumRuns) < 2 ||
    Number(value.minimumRuns) > 100 ||
    !validEnvironment(value.environment) ||
    !object(value.workload) ||
    !exactKeys(value.workload, ['durationSeconds', 'captains', 'seed']) ||
    !Number.isInteger(value.workload.durationSeconds) ||
    Number(value.workload.durationSeconds) < 32 ||
    Number(value.workload.durationSeconds) > 300 ||
    !Number.isInteger(value.workload.captains) ||
    Number(value.workload.captains) < 1 ||
    Number(value.workload.captains) > INSTANCE_PLAYER_LIMIT ||
    !Number.isSafeInteger(value.workload.seed) ||
    Number(value.workload.seed) < 0 ||
    Number(value.workload.seed) > 0xffffffff ||
    !object(value.budgets) ||
    !Object.keys(value.budgets).length ||
    !Object.entries(value.budgets).every(
      ([key, limit]) => metricNames.includes(key as PerformanceBudgetMetric) && positive(limit),
    )
  )
    throw new Error('Invalid native performance budget profile');
  return value as unknown as PerformanceBudgetProfile;
}
function maximum(values: unknown[]): number | null {
  if (
    !values.length ||
    !values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  )
    return null;
  return Math.max(...(values as number[]));
}
/** Timing percentiles require retained observations, not a placeholder zero. */
function measuredSummary(value: unknown): value is HealthSummary {
  return (
    object(value) &&
    Number.isSafeInteger(value.count) &&
    Number(value.count) > 0 &&
    Number.isSafeInteger(value.retained) &&
    Number(value.retained) > 0 &&
    Number(value.retained) <= 4096 &&
    Number(value.retained) <= Number(value.count) &&
    ['total', 'max', 'last', 'p50', 'p95'].every(
      (field) =>
        typeof value[field] === 'number' && Number.isFinite(value[field]) && value[field] >= 0,
    )
  );
}
function metric(report: Record<string, unknown>, name: PerformanceBudgetMetric): number | null {
  const health = Array.isArray(report.health) ? report.health : [];
  const summary = (key: string, field: string) =>
    maximum(
      health.map((entry) =>
        object(entry) && measuredSummary(entry[key])
          ? entry[key][field as keyof HealthSummary]
          : undefined,
      ),
    );
  if (name === 'tickP95Ms') return summary('tickMs', 'p95');
  if (name === 'tickMaxMs') return summary('tickMs', 'max');
  if (name === 'checkpointP95Ms') return summary('checkpointMs', 'p95');
  if (name === 'snapshotGapP95Ms') {
    if (!Array.isArray(report.connections)) return null;
    const gaps: number[] = [];
    for (const entry of report.connections) {
      if (
        !object(entry) ||
        !Number.isSafeInteger(entry.snapshotCount) ||
        Number(entry.snapshotCount) < 0
      )
        return null;
      if (Number(entry.snapshotCount) < 2) {
        if (entry.snapshotGapMs !== null) return null;
        continue;
      }
      if (
        !measuredSummary(entry.snapshotGapMs) ||
        entry.snapshotGapMs.count !== Number(entry.snapshotCount) - 1
      )
        return null;
      gaps.push(entry.snapshotGapMs.p95);
    }
    return maximum(gaps);
  }
  if (name === 'sendDriftP95Ms')
    return measuredSummary(report.sendDriftMs) ? report.sendDriftMs.p95 : null;
  if (name === 'nativeResidentKiB')
    return maximum(
      (Array.isArray(report.resources) ? report.resources : [])
        .filter((entry) => object(entry) && entry.role === 'nakama')
        .map((entry) => entry.residentKiB),
    );
  return maximum([report[name]]);
}
/** Verify each report independently; averages cannot hide a failing repeat. */
export function verifyPerformanceBudgets(profileInput: unknown, reports: unknown[]) {
  const profile = parsePerformanceBudgetProfile(profileInput);
  const failures: string[] = [];
  if (reports.length < profile.minimumRuns || reports.length > 100) failures.push('report-count');
  const builds = new Set<string>();
  const artifacts = new Set<string>();
  const observations: Partial<Record<PerformanceBudgetMetric, number>> = {};
  const started = new Set<string>();
  reports.forEach((report, index) => {
    const fail = (reason: string) => failures.push(`run-${index + 1}:${reason}`);
    if (
      !object(report) ||
      report.schema !== 1 ||
      report.status !== 'passed' ||
      report.failedPhase !== null ||
      !object(report.metadata) ||
      !object(report.workload)
    ) {
      fail('report-shape-or-status');
      return;
    }
    const metadata = report.metadata;
    const workload = report.workload;
    if (!environmentKeys.every((key) => metadata[key] === profile.environment[key]))
      fail('environment-mismatch');
    if (!Object.entries(profile.workload).every(([key, value]) => workload[key] === value))
      fail('workload-mismatch');
    if (
      report.metadata.sourceDirty !== false ||
      typeof report.metadata.sourceHead !== 'string' ||
      !/^[a-f0-9]{40}$/.test(report.metadata.sourceHead)
    )
      fail('source-provenance');
    else builds.add(report.metadata.sourceHead);
    if (
      typeof metadata.runtimeSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metadata.runtimeSha256) ||
      typeof metadata.sourceFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metadata.sourceFingerprint)
    )
      fail('artifact-provenance');
    else artifacts.add(metadata.runtimeSha256 + ':' + metadata.sourceFingerprint);
    if (
      typeof report.started !== 'string' ||
      !Number.isFinite(Date.parse(report.started)) ||
      started.has(report.started)
    )
      fail('duplicate-or-invalid-run');
    else started.add(report.started);
    if (
      !positive(report.measuredElapsedMs) ||
      report.measuredElapsedMs < profile.workload.durationSeconds * 1000
    )
      fail('duration');
    if (
      report.restoredCaptains !== profile.workload.captains ||
      report.inputPackets !== profile.workload.captains * profile.workload.durationSeconds * 10 ||
      !positive(report.checkpointRevision) ||
      !positive(report.checkpointBytes)
    )
      fail('workload-evidence');
    if (
      !object(report.cleanup) ||
      report.cleanup.succeeded !== true ||
      report.cleanup.allExited !== true ||
      !positive(report.cleanup.processes) ||
      report.cleanup.exited !== report.cleanup.processes
    )
      fail('cleanup');
    if (
      !Array.isArray(report.connections) ||
      !report.connections.length ||
      !report.connections.every((entry) => object(entry) && entry.errorCount === 0)
    )
      fail('connection-errors');
    if (
      !Array.isArray(report.health) ||
      !report.health.length ||
      !report.health.every(
        (entry) =>
          object(entry) &&
          ['tickFailures', 'spaceFailures', 'checkpointFreezes', 'frozenTicks'].every(
            (key) => entry[key] === undefined || (object(entry[key]) && entry[key].count === 0),
          ),
      )
    )
      fail('authority-failures');
    for (const [name, limit] of Object.entries(profile.budgets) as [
      PerformanceBudgetMetric,
      number,
    ][]) {
      const observed = metric(report, name);
      if (observed === null) fail(`${name}:missing-or-invalid`);
      else {
        observations[name] = Math.max(observations[name] ?? 0, observed);
        if (observed > limit) fail(`${name}:over-budget`);
      }
    }
  });
  if (builds.size !== 1) failures.push('same-build-required');
  if (artifacts.size !== 1) failures.push('same-artifact-required');
  return {
    schema: 1,
    profile: profile.name,
    passed: failures.length === 0,
    runs: reports.length,
    observations,
    failures,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [profilePath, ...reportPaths] = process.argv.slice(2);
  if (!profilePath || reportPaths.length < 2)
    throw new Error(
      'Usage: node tools/performance-budgets.ts PROFILE.json REPORT1.json REPORT2.json [...]',
    );
  const read = (filename: string) => {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
      throw new Error('Expected JSON file no larger than 4 MiB');
    return JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown;
  };
  const result = verifyPerformanceBudgets(read(profilePath), reportPaths.map(read));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
