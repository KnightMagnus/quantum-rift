import assert from 'node:assert/strict';
import { runPerformanceScenario } from './helpers/performance-scenarios.ts';
const baseline = runPerformanceScenario('concentrated', 3, true, 2);
const grown = runPerformanceScenario('concentrated', 3, true, 2, 100, 2);
assert.equal(baseline.totalAccounts, 2);
assert.equal(grown.totalAccounts, 102);
assert.equal(grown.captains, 2);
assert.equal(grown.outcome.sessions, baseline.outcome.sessions);
assert.ok(grown.metrics.checkpointBytes!.last > baseline.metrics.checkpointBytes!.last);
assert.ok(grown.metrics.checkpointMs!.last >= 2);
assert.equal(grown.metrics.checkpointFreezes?.count ?? 0, 0);
for (const invalid of [-1, 10001, 0.5])
  assert.throws(() => runPerformanceScenario('concentrated', 1, true, 2, invalid));
for (const invalid of [-1, 51, NaN])
  assert.throws(() => runPerformanceScenario('concentrated', 1, true, 2, 0, invalid));
console.log('Retained-account growth and bounded synchronous storage delay passed');
