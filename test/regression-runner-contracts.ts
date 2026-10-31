import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { parseShard, selectShard, runRegressionProgram } from './helpers/regression-execution.ts';

const manifest = JSON.parse(
  filesystem.readFileSync(new URL('./regression-manifest.json', import.meta.url), 'utf8'),
) as { unit: string[]; browser: string[] };
for (const programs of [manifest.unit, manifest.browser, [...manifest.unit, ...manifest.browser]]) {
  for (const count of [1, 2, 4, programs.length + 1]) {
    const selected = Array.from({ length: count }, (_, index) =>
      selectShard(programs, parseShard(`${index + 1}/${count}`)),
    );
    assert.deepEqual(
      selected.flat().sort(),
      [...programs].sort(),
      'Every registered case runs exactly once across all workers',
    );
    for (const shard of selected) assert.equal(new Set(shard).size, shard.length);
    assert.ok(
      Math.max(...selected.map((shard) => shard.length)) -
        Math.min(...selected.map((shard) => shard.length)) <=
        1,
    );
  }
}
assert.deepEqual(parseShard(undefined), { index: 1, count: 1 });
for (const value of [
  '',
  '0/4',
  '1/0',
  '5/4',
  '1.5/4',
  '-1/4',
  '1/2/3',
  '1/Infinity',
  '1/9007199254740992',
])
  assert.throws(() => parseShard(value));
assert.throws(
  () => selectShard(['duplicate.ts', 'duplicate.ts'], parseShard(undefined)),
  /Duplicate/,
);

const durations = JSON.parse(
  filesystem.readFileSync(new URL('./regression-browser-durations.json', import.meta.url), 'utf8'),
) as { seconds: Record<string, number> };
for (const count of [1, 2, 4, manifest.browser.length + 1]) {
  const shards = Array.from({ length: count }, (_, index) =>
    selectShard(manifest.browser, { index: index + 1, count }, durations.seconds),
  );
  assert.deepEqual(shards.flat().sort(), [...manifest.browser].sort());
  assert.deepEqual(
    shards,
    Array.from({ length: count }, (_, index) =>
      selectShard(manifest.browser, { index: index + 1, count }, durations.seconds),
    ),
    'Assignments are repeatable',
  );
}
assert.deepEqual(
  selectShard(manifest.browser, parseShard(undefined), durations.seconds),
  manifest.browser,
);
const synthetic = ['slow', 'fast', 'medium', 'new'];
const weights = { slow: 10, fast: 1, medium: 5 };
assert.deepEqual(selectShard(synthetic, { index: 1, count: 2 }, weights), ['slow', 'fast']);
assert.deepEqual(selectShard(synthetic, { index: 2, count: 2 }, weights), ['medium', 'new']);
for (const seconds of [0, -1, NaN, Infinity])
  assert.throws(() => selectShard(synthetic, parseShard(undefined), { slow: seconds }), /positive/);
assert.throws(() => selectShard(synthetic, parseShard(undefined), {}), /positive/);
assert.throws(() => selectShard(['same', 'same'], parseShard(undefined), weights), /Duplicate/);
const withoutSample = { ...durations.seconds };
delete withoutSample[manifest.browser[0]];
assert.deepEqual(
  Array.from({ length: 4 }, (_, index) =>
    selectShard(manifest.browser, { index: index + 1, count: 4 }, withoutSample),
  )
    .flat()
    .sort(),
  [...manifest.browser].sort(),
  'Missing timing samples never omit registered programs',
);
const workload = ['a', 'b', 'c', 'd'];
const workloadDurations = { a: 10, b: 1, c: 8, d: 1 };
assert.deepEqual(selectShard(workload, { index: 1, count: 2 }, workloadDurations), ['a']);
assert.deepEqual(selectShard(workload, { index: 2, count: 2 }, workloadDurations), ['b', 'c', 'd']);

const directory = filesystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-runner-contracts-'),
);
const evidence = path.join(directory, 'evidence');
const suiteCancellation = new AbortController();
const cancelSuite = () => suiteCancellation.abort();
process.once('SIGTERM', cancelSuite);
process.once('SIGINT', cancelSuite);
async function execute(
  test: string,
  source: string,
  signal = suiteCancellation.signal,
  timeout = 5000,
) {
  const result = await runRegressionProgram({
    test,
    cwd: directory,
    args: ['-e', source],
    evidence,
    timeout,
    signal,
  });
  const log = filesystem.readFileSync(path.join(evidence, test + '.log'), 'utf8');
  const scratch = /SCRATCH=(.+)/.exec(log)?.[1];
  assert.ok(scratch, 'Fixture prints its isolated temporary directory');
  assert.equal(
    filesystem.existsSync(scratch),
    false,
    'Temporary saves are removed after every outcome',
  );
  return { result, log };
}
const prelude = 'console.log("SCRATCH=" + process.env.TMPDIR);';
try {
  const failed = await execute(
    'failure',
    prelude + 'console.error("failure evidence"); process.exit(7)',
  );
  assert.equal(failed.result.passed, false);
  assert.equal(failed.result.code, 7);
  assert.match(failed.log, /failure evidence/);
  assert.match(failed.result.tail, /failure evidence/);
  const passed = await execute('success-after-failure', prelude + 'console.log("passed")');
  assert.equal(passed.result.passed, true, 'Failure does not prevent a later case');
  const timedOut = await execute(
    'deadline',
    prelude + 'setInterval(() => {}, 1000)',
    undefined,
    1200,
  );
  assert.equal(timedOut.result.timedOut, true);
  assert.equal(timedOut.result.passed, false);
  assert.ok(timedOut.result.seconds < 5, 'A hung case is bounded');
  const controller = new AbortController();
  const cancellation = setTimeout(() => controller.abort(), 1200);
  try {
    const cancelled = await execute(
      'cancelled',
      prelude + 'setInterval(() => {}, 1000)',
      controller.signal,
    );
    assert.equal(cancelled.result.cancelled, true);
    assert.equal(cancelled.result.passed, false);
  } finally {
    clearTimeout(cancellation);
  }
  if (process.platform !== 'win32') {
    const helper = new URL('./helpers/browser-fixture.ts', import.meta.url).href;
    for (const stubborn of [false, true]) {
      const source = `
        const { spawn } = await import('node:child_process');
        const { once } = await import('node:events');
        const fs = await import('node:fs');
        const { cleanup } = await import(${JSON.stringify(helper)});
        const child = spawn(process.execPath, ['-e', ${JSON.stringify(
          stubborn
            ? "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"
            : "console.log('ready'); setInterval(() => {}, 1000)",
        )}], { stdio: ['ignore', 'pipe', 'pipe'] });
        await once(child.stdout, 'data');
        const log = fs.createWriteStream(process.env.TMPDIR + '/server.log');
        const scratch = fs.mkdtempSync(process.env.TMPDIR + '/cleanup-');
        await cleanup(child, null, log, scratch);
        if (fs.existsSync(scratch)) throw Error('cleanup left scratch');
        if (child.signalCode !== ${JSON.stringify(stubborn ? 'SIGKILL' : 'SIGTERM')}) throw Error('wrong shutdown signal');
      `;
      const cleanupResult = await execute('fixture-cleanup-' + stubborn, prelude + source);
      assert.equal(cleanupResult.result.passed, true, cleanupResult.log);
      if (stubborn) assert.ok(cleanupResult.result.seconds >= 3, 'Grace period retained');
      else
        assert.ok(cleanupResult.result.seconds < 2, 'No losing shutdown timer keeps process alive');
    }
  }
  const gracefulMarker = path.join(directory, 'graceful-cleanup');
  const gracefulController = new AbortController();
  const gracefulCancellation = setTimeout(() => gracefulController.abort(), 1200);
  try {
    const graceful = await execute(
      'graceful-cancellation',
      prelude +
        `process.on('SIGTERM', () => { require('node:fs').writeFileSync(${JSON.stringify(gracefulMarker)}, 'cleaned'); process.exit(0); }); setInterval(() => {}, 1000);`,
      gracefulController.signal,
    );
    assert.equal(graceful.result.cancelled, true);
    assert.equal(
      filesystem.readFileSync(gracefulMarker, 'utf8'),
      'cleaned',
      'Fixture signal cleanup runs before escalation',
    );
  } finally {
    clearTimeout(gracefulCancellation);
  }
  if (process.platform !== 'win32') {
    const heartbeat = path.join(directory, 'heartbeat');
    const source = `require('node:fs').appendFileSync(${JSON.stringify(heartbeat)}, 'x');setInterval(() => require('node:fs').appendFileSync(${JSON.stringify(heartbeat)}, 'x'), 30)`;
    const descendant = await execute(
      'descendant',
      prelude +
        `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', ${JSON.stringify(source)}], { stdio: 'ignore' }); setTimeout(() => process.exit(0), 400);`,
    );
    assert.equal(descendant.result.passed, true);
    const before = filesystem.readFileSync(heartbeat, 'utf8');
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    assert.equal(
      filesystem.readFileSync(heartbeat, 'utf8'),
      before,
      'Orphan descendant cannot keep writing after parent success',
    );
  }
  console.log(
    'Regression runner contracts: exact coverage, validation, logs, failure continuation, deadlines, cancellation and descendant cleanup passed.',
  );
} finally {
  process.removeListener('SIGTERM', cancelSuite);
  process.removeListener('SIGINT', cancelSuite);
  filesystem.rmSync(directory, { recursive: true, force: true });
}
