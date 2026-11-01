// Canonical manifest-driven CI runner: isolated processes, bounded time and evidence.
import filesystem from 'node:fs';
import path from 'node:path';
import { root, evidenceDir } from './helpers/browser-fixture.ts';
import { parseShard, selectShard, runRegressionProgram } from './helpers/regression-execution.ts';
const manifest = JSON.parse(
  filesystem.readFileSync(new URL('./regression-manifest.json', import.meta.url), 'utf8'),
) as { unit: string[]; browser: string[] };
const group = process.argv[2] || 'all';
if (group !== 'unit' && group !== 'browser' && group !== 'all')
  throw Error('Expected unit, browser or all');
if (Number(process.versions.node.split('.')[0]) < 22)
  throw Error('CI regressions require Node 22+ (native WebSocket).');
const options = process.argv.slice(3);
if (options.length > 1 || options.some((option) => !option.startsWith('--shard=')))
  throw Error('Expected optional --shard=INDEX/COUNT');
const shard = parseShard(options[0]?.slice('--shard='.length));
const inventory = group === 'all' ? [...manifest.unit, ...manifest.browser] : manifest[group];
const browserDurations = JSON.parse(
  filesystem.readFileSync(new URL('./regression-browser-durations.json', import.meta.url), 'utf8'),
) as { seconds: Record<string, number> };
const cases = selectShard(
  inventory,
  shard,
  group === 'browser' ? browserDurations.seconds : undefined,
);
const runner = evidenceDir(`runner/${group}-${shard.index}-of-${shard.count}`);
const results = [];
// The full dock matrix covers two destinations, nine viewports, two scales and
// every station department; hosted runners can exceed the ordinary three minutes.
const programTimeouts: Record<string, number> = {
  'network-systems.ts': 240000,
  'landed-responsive-browser.ts': 360000,
  // The station matrix decodes every authored design and visits 19 ports.
  'station-landing-browser.ts': 360000,
};
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
console.log(
  `${group} shard ${shard.index}/${shard.count}: ${cases.length}/${inventory.length} programs`,
);
try {
  for (const test of cases) {
    if (cancellation.signal.aborted) break;
    console.log('Regression:', test);
    const { tail, ...record } = await runRegressionProgram({
      test,
      cwd: root,
      args: ['--import', './test/seed-random.ts', 'test/' + test],
      evidence: runner,
      timeout: programTimeouts[test] ?? 180000,
      signal: cancellation.signal,
    });
    results.push(record);
    console.log(`${record.passed ? 'PASS' : 'FAIL'} ${test} (${record.seconds}s)`);
    if (!record.passed) console.error(tail || record.error);
    filesystem.writeFileSync(
      path.join(runner, group + '-results.json'),
      JSON.stringify(results, null, 2),
    );
  }
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
}
const failed = results.filter((entry) => !entry.passed);
console.log(
  `${results.length - failed.length}/${cases.length} ${group} regression programs passed.`,
);
if (cancellation.signal.aborted) process.exitCode = 130;
else if (failed.length || results.length !== cases.length) process.exitCode = 1;
