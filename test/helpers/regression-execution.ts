import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

/** One-based shard coordinates; programs stay sequential inside each worker. */
export interface RegressionShard {
  /** Current worker, starting at one. */
  index: number;
  /** Total independent workers. */
  count: number;
}

export function parseShard(value: string | undefined): RegressionShard {
  if (value === undefined) return { index: 1, count: 1 };
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(value)) throw Error('Expected --shard=INDEX/COUNT');
  const [index, count] = value.split('/').map(Number);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count)
    throw Error('Shard index must be between 1 and count');
  return { index, count };
}

export function selectShard(programs: string[], shard: RegressionShard): string[] {
  if (new Set(programs).size !== programs.length) throw Error('Duplicate regression program');
  return programs.filter((_, index) => index % shard.count === shard.index - 1);
}

/** Inputs for one isolated, deadline-bound subprocess. */
export interface RegressionProgram {
  /** Label recorded in evidence. */
  test: string;
  /** Repository or fixture working directory. */
  cwd: string;
  /** Arguments passed to the current Node executable. */
  args: string[];
  /** Directory for durable logs. */
  evidence: string;
  /** Maximum runtime in milliseconds. */
  timeout: number;
  /** Cancels the active process tree without starting another case. */
  signal: AbortSignal;
}

export async function runRegressionProgram(program: RegressionProgram) {
  const started = Date.now();
  const scratch = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-regression-'));
  filesystem.mkdirSync(program.evidence, { recursive: true });
  const logStream = filesystem.createWriteStream(
    path.join(program.evidence, program.test + '.log'),
  );
  let tail = '',
    timedOut = false,
    error: string | undefined;
  const child = spawn(process.execPath, program.args, {
    cwd: program.cwd,
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
  function killGroup(signal: NodeJS.Signals = 'SIGKILL') {
    if (child.pid === undefined) return;
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else process.kill(-child.pid, signal);
    } catch (caught) {
      if (!(caught instanceof Error) || !('code' in caught) || caught.code !== 'ESRCH')
        throw caught;
    }
  }
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      logStream.write(data);
      tail = (tail + data).slice(-12000);
    });
  // Kill orphan descendants as soon as their parent exits, before waiting on pipes.
  child.once('exit', () => killGroup());
  child.once('error', (caught) => {
    error = String(caught);
  });
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = () => {
    // Detached service fixtures need a chance to clean up their own process groups.
    killGroup('SIGTERM');
    forceTimer ??= setTimeout(() => killGroup(), 5000);
  };
  const cancelled = () => terminate();
  program.signal.addEventListener('abort', cancelled, { once: true });
  if (program.signal.aborted) cancelled();
  const timer = setTimeout(() => {
    timedOut = true;
    terminate();
  }, program.timeout);
  let code: number | null;
  try {
    code = await new Promise<number | null>((resolve) => child.once('close', resolve));
  } finally {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    program.signal.removeEventListener('abort', cancelled);
    killGroup();
    await new Promise<void>((resolve) => logStream.end(resolve));
    filesystem.rmSync(scratch, { recursive: true, force: true });
  }
  return {
    test: program.test,
    passed: code === 0 && !timedOut && !error && !program.signal.aborted,
    code,
    timedOut,
    cancelled: program.signal.aborted,
    error,
    seconds: Math.round((Date.now() - started) / 10) / 100,
    tail,
  };
}
