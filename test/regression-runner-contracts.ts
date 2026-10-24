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
