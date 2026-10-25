import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseNativePerformanceArguments,
  validateNativePerformance,
  parseNativeHealth,
  runNativePerformance,
} from './helpers/native-performance.ts';
import { NativePacketCollector } from './helpers/native-packet-collector.ts';
import { NakamaService, repository } from './helpers/nakama-service.ts';
import { evidenceDir } from './helpers/browser-fixture.ts';

const options = { durationSeconds: 32, captains: 2, seed: 1701 };
for (const invalid of [
  { ...options, durationSeconds: 0 },
  { ...options, durationSeconds: 31 },
  { ...options, durationSeconds: 301 },
  { ...options, durationSeconds: NaN },
  { ...options, captains: 0 },
  { ...options, captains: 13 },
  { ...options, captains: 1.5 },
  { ...options, seed: -1 },
  { ...options, seed: Infinity },
  { ...options, seed: 0x100000000 },
])
  assert.throws(() => validateNativePerformance(invalid));
for (const argumentsList of [
  [],
  ['--output=relative.json'],
  ['--duration=Infinity', '--output=/unused'],
  ['--duration=60', '--duration=60', '--output=/unused'],
  ['--captains=3e0', '--output=/unused'],
  ['--unknown=1', '--output=/unused'],
])
  assert.throws(() => parseNativePerformanceArguments(argumentsList));
assert.deepEqual(parseNativePerformanceArguments(['--output=/private/report.json']).options, {
  durationSeconds: 60,
  captains: 4,
  seed: 1701,
});
// Invalid CLI input must fail before touching an output path or starting services.
const privateOutput = path.join(evidenceDir('performance-native'), 'invalid-output.json');
fs.rmSync(privateOutput, { force: true });
const temporaryRoot = path.resolve(repository, '../temp');
const temporaryEntries = () =>
  fs.existsSync(temporaryRoot) ? fs.readdirSync(temporaryRoot).sort() : [];
const beforeInvalid = temporaryEntries();
const invalidCli = spawnSync(
  process.execPath,
  ['tools/performance-native.ts', '--duration=301', '--output=' + privateOutput],
  { cwd: repository, encoding: 'utf8', timeout: 5000 },
);
assert.equal(invalidCli.status, 1);
assert.equal(invalidCli.signal, null);
assert.equal(invalidCli.error, undefined);
assert.deepEqual(temporaryEntries(), beforeInvalid, 'invalid CLI creates no fixture directory');
assert(!fs.existsSync(privateOutput));
for (const deadlineMs of [0, 29999, 600000, Infinity])
  assert.throws(() => new NakamaService(undefined, { deadlineMs }));
for (const limit of [0, 4097, NaN]) assert.throws(() => new NativePacketCollector([], [], limit));
let now = 0;
const collector = new NativePacketCollector<{ t: string; privatePayload: string }>(
  [],
  [],
  3,
  () => now,
);
for (let index = 0; index < 10000; index++) {
  now += 10;
  collector.receive({ t: 'snap', privatePayload: 'private captain/token contents' }, 80, 'snap');
  collector.error('private error');
}
assert.equal(collector.packets.length, 3);
assert.equal(collector.errors.length, 3);
assert.equal(collector.report().retainedStatePackets, 1);
assert.equal(collector.report().retainedPacketsTotal, 4);
assert.equal(collector.report().receivedPackets, 10000);
assert.equal(collector.report().receivedBytes, 800000);
assert.equal(collector.report().errorCount, 10000);
assert.equal(collector.report().snapshotCount, 10000);
assert.equal(collector.report().snapshotGapMs!.retained, 512);
assert.equal(collector.report().snapshotGapMs!.p95, 10);
assert(!JSON.stringify(collector.report()).includes('private'));
const savedPlayer = { t: 'you', privatePayload: 'private initial state' };
collector.receive(savedPlayer, 80, 'you');
for (let index = 0; index < 10; index++)
  collector.receive({ t: 'snap', privatePayload: 'new' }, 80, 'snap');
assert.equal(
  collector.latestState('you'),
  savedPlayer,
  'fixed player state survives ring eviction',
);
assert.equal(collector.report().retainedStatePackets, 2);
assert.equal(collector.report().retainedPacketsTotal, 5);
assert.throws(() => collector.receive(savedPlayer, Infinity, 'you'));

const summary = { count: 1, total: 2, max: 2, last: 2, p50: 2, p95: 2, retained: 1 };
assert.deepEqual(
  parseNativeHealth(
    'World health: ' +
      JSON.stringify({
        tickMs: { ...summary, secret: 'private' },
        captain: 'private',
        credits: 999,
      }),
  ),
  { tickMs: summary },
);
for (const message of [
  null,
  'private exception',
  'World health: []',
  'World health: {',
  'World health: ' + JSON.stringify({ tickMs: { ...summary, count: '1' } }),
  'World health: ' + JSON.stringify({ tickMs: { ...summary, retained: 4097 } }),
])
  assert.equal(parseNativeHealth(message), null);

let injected = false;
const interrupted = await runNativePerformance(options, {
  afterJoin() {
    injected = true;
    throw new Error('private injected exception');
  },
});
assert(injected, 'cleanup fault must occur after real authenticated joins');
assert.equal(interrupted.status, 'failed');
assert.equal(interrupted.failedPhase, 'join');
assert(interrupted.cleanup.succeeded && interrupted.cleanup.allExited);
assert(interrupted.cleanup.processes >= 4);
assert(!JSON.stringify(interrupted).includes('private injected exception'));
fs.writeFileSync(
  path.join(evidenceDir('performance-native'), 'failure-cleanup.json'),
  JSON.stringify(interrupted, null, 2),
  { mode: 0o600 },
);
const result = await runNativePerformance(options);
fs.writeFileSync(
  path.join(evidenceDir('performance-native'), 'result.json'),
  JSON.stringify(result, null, 2),
  { mode: 0o600 },
);
assert.equal(result.status, 'passed', 'native scenario phase: ' + result.failedPhase);
assert(result.measuredElapsedMs >= 32000);
assert.equal(result.restoredCaptains, options.captains);
assert.equal(result.inputPackets, options.captains * options.durationSeconds * 10);
assert(result.reconnectMs > 0 && result.restartToStateMs > 0);
assert(result.checkpointRevision > 0 && result.checkpointBytes > 0);
assert(
  result.connections.every(
    (connection) =>
      connection.retainedPackets <= 64 &&
      connection.retainedStatePackets <= 3 &&
      connection.retainedPacketsTotal <= 67 &&
      connection.retainedErrors <= 64 &&
      connection.errorCount === 0,
  ),
);
assert(
  result.connections.some((connection) => connection.receivedPackets > connection.retainedPackets),
);
assert(result.health.some((report) => (report.tickMs?.count ?? 0) >= 900));
assert(result.cleanup.succeeded && result.cleanup.allExited);
const published = JSON.stringify(result);
assert(!published.includes('synthetic-native-probe-only') && !published.includes('Native Probe'));
assert(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(published));
console.log(
  'Native workload limits, bounded numeric collectors, failure cleanup, real flight/reconnect/checkpoint/restart and numeric health passed.',
);
