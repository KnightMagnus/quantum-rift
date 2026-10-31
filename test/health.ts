import { EventEmitter } from 'node:events';
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

// Exercise the real tick route for public/private, flying/docked recipients.
const snapshotDatabase = new NakamaDatabase({ read: () => null, write: () => '1' });
const snapshotGame = new Game(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  snapshotDatabase,
  {
    automaticClock: false,
    seedDefinitions: [],
    defer: () => {},
    randomUUID: () => '00000000-0000-4000-8000-000000000149',
  },
);
const recipients = Array.from({ length: 4 }, (_, index) => {
  const connection = Object.assign(new EventEmitter(), {
    open: true,
    backlog: 0,
    send() {},
    close() {},
  });
  snapshotGame.connect(connection);
  const session = [...snapshotGame.sessions.values()].at(-1)!;
  const name = 'Snapshot Pilot ' + index;
  snapshotDatabase.withAuthenticatedCaptain(name, () =>
    snapshotGame.onMessage(session, { t: 'hello', name, pass: 'fixture' }),
  );
  session.data.tut = 999;
  session.data.sys = 'meridian';
  if (index < 2) {
    session.data.stellar = null;
    snapshotGame.spawnPlayer(session, 10000 + index * 100, 10000, 0, 0);
  }
  return session;
});
const snapshotSpace = snapshotGame.spaces.meridian;
snapshotSpace.tick = () => {};
const marker = snapshotSpace.makeShip({
  hull: 704,
  faction: 'quantum',
  x: 10000,
  y: 10000,
  a: 0,
  ai: 'patrol',
});
const payloads = new Map<unknown, Record<string, unknown>>();
snapshotGame.send = (session, message) => {
  const payload = typeof message === 'string' ? JSON.parse(message) : message;
  if (payload.t === 'snap' || payload.t === 'scene') payloads.set(session.sock, payload);
};
let filterCalls = 0;
const originalSnapshot = snapshotSpace.snapshot.bind(snapshotSpace);
snapshotSpace.snapshot = () => {
  const snapshot = originalSnapshot();
  snapshot.shots.push([1, 0, 0, 0, 0, marker.id]);
  snapshot.beams.push([marker.id, 0, 0, 0, 0]);
  for (const rows of [snapshot.ships, snapshot.shots, snapshot.beams]) {
    const originalFilter = rows.filter.bind(rows);
    Object.defineProperty(rows, 'filter', {
      value: (...parameters: Parameters<typeof rows.filter>) => {
        filterCalls++;
        return originalFilter(...parameters);
      },
    });
  }
  return snapshot;
};
let rockBuilds = 0;
let hazardBuilds = 0;
let rockEncodings = 0;
let hazardEncodings = 0;
const buildRocks = snapshotGame.features.mining.rocksPayload.bind(snapshotGame.features.mining);
const buildHazards = snapshotGame.features.pressure.hazards.bind(snapshotGame.features.pressure);
snapshotGame.features.mining.rocksPayload = (space) => {
  rockBuilds++;
  const value = buildRocks(space);
  Object.defineProperty(value, 'toJSON', {
    value: () => {
      rockEncodings++;
      return value;
    },
  });
  return value;
};
snapshotGame.features.pressure.hazards = (system) => {
  hazardBuilds++;
  const value = buildHazards(system);
  Object.defineProperty(value, 'toJSON', {
    value: () => {
      hazardEncodings++;
      return value;
    },
  });
  return value;
};
for (const restriction of ['public', 'owner', 'docked-owner', 'sight'] as const) {
  const restricted = restriction !== 'public';
  marker.story =
    restriction === 'owner'
      ? recipients[0].id
      : restriction === 'docked-owner'
        ? recipients[2].id
        : undefined;
  marker.storySight = restriction === 'sight' ? 'thalassi' : undefined;
  (recipients[0].data.story.flags ??= {}).convoy_visible = true;
  payloads.clear();
  filterCalls = 0;
  rockBuilds = hazardBuilds = rockEncodings = hazardEncodings = 0;
  snapshotGame.tickN = 1;
  snapshotGame.tick();
  assert.equal(payloads.size, 4);
  assert.equal(rockBuilds, 1, 'one rock projection per system/update, including docked observers');
  assert.equal(hazardBuilds, 1, 'one hazard projection per system/update');
  assert.equal(rockEncodings, 1, 'flying recipients reuse encoded rocks, even with private ships');
  assert.equal(hazardEncodings, 1, 'flying recipients reuse encoded hazards');
  const source = originalSnapshot();
  source.shots.push([1, 0, 0, 0, 0, marker.id]);
  source.beams.push([marker.id, 0, 0, 0, 0]);
  for (const session of recipients) {
    const payload = payloads.get(session.sock)!;
    const visible = (identifier: number) => {
      const actor = snapshotSpace.ships.get(identifier);
      return (
        !actor ||
        ((!actor.story || actor.story === session.id) &&
          (!actor.storySight || !!session.data.story.flags?.convoy_visible))
      );
    };
    for (const [key, ownerIndex] of [
      ['ships', 0],
      ['shots', 5],
      ['beams', 0],
    ] as const)
      assert.deepEqual(
        payload[key],
        source[key].filter((row) => visible(Number(row[ownerIndex]))),
      );
    assert.equal(payload.t, session.ent ? 'snap' : 'scene');
    assert.deepEqual(payload.miningRocks, buildRocks(snapshotSpace));
    if (session.ent) {
      assert.deepEqual(payload.miningHazards, buildHazards(snapshotSpace.id));
      assert.equal((payload.me as number[])[0], session.ent.id);
    } else {
      assert.equal('miningHazards' in payload, false, 'scene contract stays unchanged');
    }
    assert.equal(
      (payload.ships as unknown[][]).some((row) => row[0] === marker.id),
      visible(marker.id),
    );
  }
  assert.equal(
    filterCalls,
    restricted ? 12 : 0,
    'public recipients allocate no discarded filtered arrays',
  );
}

// No update may retain another system's projection or stale rock/hazard data.
recipients[3].data.sys = 'sol';
const otherSpace = snapshotGame.spaces.sol;
otherSpace.tick = () => {};
for (let update = 0; update < 2; update++) {
  rockBuilds = hazardBuilds = 0;
  payloads.clear();
  snapshotGame.tickN = 1;
  snapshotGame.tick();
  assert.equal(rockBuilds, 2, 'each observed system rebuilds once each update');
  assert.equal(hazardBuilds, 1, 'docked-only system needs no hazard projection');
  for (const session of recipients)
    assert.deepEqual(
      payloads.get(session.sock)!.miningRocks,
      buildRocks(snapshotGame.spaces[session.data.sys]),
    );
}
