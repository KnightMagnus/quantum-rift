import assert from 'node:assert/strict';
import { readiness, releaseLanes } from '../tools/release-readiness.ts';
const head = 'f'.repeat(40);
const complete = Object.fromEntries(releaseLanes.map((lane) => [lane, { result: 'success' }]));
assert.equal(readiness(complete, head).ready, true);
assert.equal(readiness(complete, head).head, head);
for (const lane of releaseLanes) {
  for (const result of ['failure', 'cancelled', 'skipped', 'pending']) {
    const report = readiness({ ...complete, [lane]: { result } }, head);
    assert.equal(report.ready, false, lane + ': ' + result);
    assert.equal(report.lanes[lane], result);
  }
  const missing = { ...complete };
  delete missing[lane];
  assert.equal(readiness(missing, head).ready, false, 'Missing lane: ' + lane);
  assert.equal(readiness({ ...complete, [lane]: null }, head).ready, false);
}
assert.throws(() => readiness(null, head));
assert.throws(() => readiness(complete, ''));
console.log('PASS readiness fails closed on every missing, failed, skipped and cancelled lane');
