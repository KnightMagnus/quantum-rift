import { requiredFixtureValue } from './helpers/required.ts';
// Canonical manifest-driven CI runner: isolated processes, bounded time and evidence.
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, evidenceDir } from './helpers/browser-fixture.ts';
const manifest = JSON.parse(
  filesystem.readFileSync(new URL('./regression-manifest.json', import.meta.url), 'utf8'),
);
const group = process.argv[2] || 'all';
if (!['unit', 'browser', 'all'].includes(group)) throw Error('Expected unit, browser or all');
if (Number(process.versions.node.split('.')[0]) < 22)
  throw Error('CI regressions require Node 22+ (native WebSocket).');
const cases = group === 'all' ? [...manifest.unit, ...manifest.browser] : manifest[group];
const results = [];
for (const test of cases) {
  const started = Date.now(),
    scratch = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-regression-'));
  const runner = evidenceDir('runner'),
    logStream = filesystem.createWriteStream(path.join(runner, test + '.log'));
  console.log('Regression:', test);
  const child = spawn(process.execPath, ['--import', './test/seed-random.ts', 'test/' + test], {
    cwd: root,
    env: {
      ...process.env,
      TMPDIR: scratch,
      TMP: scratch,
      TEMP: scratch,
      SEEDS_FILE: '/nonexistent',
      RIFT_STATION_QUICK: '',
    },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let tail = '',
    timedOut = false;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      logStream.write(data);
      tail = (tail + data).slice(-12000);
    });
  function killGroup() {
    try {
      if (process.platform !== 'win32') process.kill(-requiredFixtureValue(child.pid), 'SIGKILL');
      else child.kill('SIGKILL');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
    }
  }
  const cancel = () => {
    killGroup();
    filesystem.rmSync(scratch, { recursive: true, force: true });
    process.exit(130);
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const timer = setTimeout(
    () => {
      timedOut = true;
      killGroup();
    },
    test === 'network-systems.ts' ? 240000 : 180000,
  );
  let code, error;
  try {
    code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
  } catch (error2) {
    error = String(error2);
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    killGroup();
    logStream.end();
    filesystem.rmSync(scratch, { recursive: true, force: true });
  }
  const passed = code === 0 && !timedOut && !error;
  const record = {
    test,
    passed,
    code,
    timedOut,
    error,
    seconds: Math.round((Date.now() - started) / 10) / 100,
  };
  results.push(record);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${test} (${record.seconds}s)`);
  if (!passed) console.error(tail || error);
  filesystem.writeFileSync(
    path.join(runner, group + '-results.json'),
    JSON.stringify(results, null, 2),
  );
}
const failed = results.filter((entry) => !entry.passed);
console.log(
  `${results.length - failed.length}/${results.length} ${group} regression programs passed.`,
);
if (failed.length) process.exitCode = 1;
