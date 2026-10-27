import { sharedSnapshotEncoder } from '../server/snapshot-encoding.ts';
import type { SpaceSnapshot } from '../server/space.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Game } from '../server/game.ts';
import { HealthMonitor, utf8Bytes } from '../shared/health.ts';
import { NakamaDatabase } from '../server/nakama-storage.ts';
import { runPerformanceScenario, performanceScenarios } from './helpers/performance-scenarios.ts';
const monitor = new HealthMonitor(3);
for (let value = 1; value <= 100; value++) monitor.observe('tickMs', value);
monitor.observe('tickMs', NaN);
monitor.observe('tickMs', -1);
assert.deepEqual(monitor.report().tickMs, {
  count: 100,
  total: 5050,
  max: 100,
  last: 100,
  retained: 3,
  p50: 99,
  p95: 100,
});
assert.throws(() => new HealthMonitor(0));
assert.throws(() => new HealthMonitor(4097));
for (const text of ['ASCII', 'héllo', '🚀', '\ud800', '\udc00', 'a\u0800'])
  assert.equal(utf8Bytes(text), Buffer.byteLength(text));
// A lost acknowledgement freezes authority once; diagnostics must not retain backend error text.
const failed = new NakamaDatabase(
  {
    read: () => null,
    write: () => {
      throw new Error('private-save-content');
    },
  },
  monitor,
);
failed.touch();
assert.throws(() => failed.flush(), /private-save-content/);
assert.equal(failed.economicFrozen, true);
assert.equal(monitor.report().checkpointFreezes?.count, 1);
assert.throws(() => failed.flush(), /frozen/);
assert.equal(monitor.report().checkpointFreezes?.count, 1);
assert.ok(monitor.report().checkpointBytes!.last > 0);
assert.equal(JSON.stringify(monitor.report()).includes('private-save-content'), false);
const diagnosticHealth = new HealthMonitor(3);
const diagnosticDatabase = new NakamaDatabase(
  { read: () => null, write: () => '1' },
  diagnosticHealth,
);
const diagnosticGame = new Game(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  diagnosticDatabase,
  {
    health: diagnosticHealth,
    automaticClock: false,
    seedDefinitions: [],
    randomUUID: () => '00000000-0000-4000-8000-000000000082',
    defer: () => {},
  },
);
const diagnosticSpace = diagnosticGame.spaces.meridian;
diagnosticSpace.players = 1;
diagnosticSpace.tick = () => {
  throw new Error('private-save-content');
};
const originalConsoleError = console.error;
const logged: unknown[][] = [];
try {
  console.error = (...argumentsList) => {
    logged.push(argumentsList);
  };
  for (let index = 0; index < 10; index++) diagnosticGame.tick();
} finally {
  console.error = originalConsoleError;
}
assert.equal(
  diagnosticHealth.report().spaceFailures?.count,
  10,
  'failures remain visible after log suppression',
);
assert.equal(diagnosticSpace.errs, 10);
assert.equal(logged.length, 4, 'existing repeated-error log suppression is preserved');
assert.equal(JSON.stringify(logged).includes('private-save-content'), false);
diagnosticGame.features.mining.advanceClock = () => {
  throw new Error('private-save-content');
};
for (let index = 0; index < 8; index++)
  assert.throws(() => diagnosticGame.tick(), /private-save-content/);
assert.equal(diagnosticHealth.report().tickFailures?.count, 8);
diagnosticDatabase.economicFrozen = true;
const frozenTick = diagnosticGame.tickN;
diagnosticGame.tick();
assert.equal(diagnosticHealth.report().frozenTicks?.count, 1);
assert.equal(diagnosticGame.tickN, frozenTick, 'frozen economy never advances');
assert.equal(JSON.stringify(diagnosticHealth.report()).includes('private-save-content'), false);
for (const name of performanceScenarios) {
  const enabled = runPerformanceScenario(name, 120);
  const disabled = runPerformanceScenario(name, 120, false);
  assert.deepEqual(
    enabled.outcome,
    disabled.outcome,
    name + ': instrumentation preserves authoritative results',
  );
  assert.equal(enabled.metrics.tickMs?.count, 120);
  assert.ok(enabled.metrics.snapshotBytes!.count > 0);
  assert.ok(
    enabled.metrics.snapshotBytes!.max <= 32 * 1024,
    name + ': flying snapshot resource budget',
  );
  assert.ok(
    enabled.metrics.checkpointBytes!.max <= 256 * 1024,
    name + ': checkpoint resource budget',
  );
  if (name === 'busy-combat')
    assert.ok(enabled.metrics.shots!.max > 0, 'armed combat produces projectiles');
  assert.ok(Object.values(enabled.metrics).every((metric) => metric.retained <= 512));
  if (name === 'reconnect') {
    assert.equal(enabled.reconnects, 2);
    assert.equal(enabled.metrics.returningLogins?.count, 2);
    assert.equal(enabled.metrics.connections?.count, 2);
    assert.equal(enabled.metrics.disconnects?.count, 2);
  }
  if (name === 'mining-towing') {
    assert.ok(enabled.miningFrames > 0);
    assert.equal(enabled.towingAttached, true);
  }
}
console.log(
  'Bounded health, UTF-8 sizes, freeze privacy and six seeded workloads preserve enabled/disabled authority.',
);

// Full-instance concentrated and distributed fixtures retain real simulation and bounds.
for (const name of ['concentrated', 'distributed'] as const) {
  const full = runPerformanceScenario(name, 120, true, 30);
  assert.equal(full.captains, 30);
  assert.equal(full.outcome.sessions, 30);
  assert.equal(full.metrics.tickFailures?.count ?? 0, 0);
  assert.ok(full.metrics.snapshotBytes!.max <= 32 * 1024);
  assert.ok(full.metrics.checkpointBytes!.max <= 512 * 1024);
}
assert.throws(() => runPerformanceScenario('concentrated', 1, true, 31));

// The independent platform encoder covers all code units, paired/lone surrogates,
// and long ASCII runs around Unicode names. No timing threshold depends on host speed.
let unicode = '';
for (let code = 0; code <= 0xffff; code++) unicode += String.fromCharCode(code);
for (const value of [
  unicode,
  unicode.split('').reverse().join(''),
  'x'.repeat(65536),
  'x'.repeat(32768) + 'é🚀\ud800' + 'y'.repeat(32768),
  '\ud800\ud800\udc00\udc00',
  'a\udfffz\ud800',
])
  assert.equal(utf8Bytes(value), Buffer.byteLength(value));

// Compare wire bytes with the pre-optimization JSON object expression, not another
// cached encoder. Recipient flags, escaped names/events and empty arrays stay exact.
for (const ships of [[], [[1, 703, 0, 'Unicode é🚀 and "quote"']]]) {
  const shared: SpaceSnapshot = { ships, shots: [], beams: [], loot: [], ev: [] };
  const encode = sharedSnapshotEncoder(shared);
  for (let recipient = 0; recipient < 30; recipient++) {
    const fields = {
      attention: { targeted: recipient === 2, scanned: recipient === 3 },
      mining: null,
      me: [recipient, 0, -0, 1.25],
      text: 'escaped\nline\t\ud800',
    };
    assert.equal(encode(fields), JSON.stringify({ t: 'snap', ...shared, ...fields }));
  }
}
