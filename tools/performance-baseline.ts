import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  performanceScenarios,
  runPerformanceScenario,
} from '../test/helpers/performance-scenarios.ts';
const ticks = Number(process.env.RIFT_PERF_TICKS || 900);
const soakTicks = Number(process.env.RIFT_PERF_SOAK_TICKS || 18000);
const captains =
  process.env.RIFT_PERF_CAPTAINS === undefined ? undefined : Number(process.env.RIFT_PERF_CAPTAINS);
const retainedAccounts = Number(process.env.RIFT_PERF_RETAINED_ACCOUNTS || 0);
const storageDelayMs = Number(process.env.RIFT_PERF_STORAGE_DELAY_MS || 0);
const output = process.env.RIFT_PERF_OUTPUT;
if (!output) throw new Error('RIFT_PERF_OUTPUT must name a private baseline JSON file');
const started = new Date().toISOString();
const result = {
  schema: 1,
  started,
  build: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  runtime: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: operatingSystem.cpus()[0]?.model,
  logicalCpus: operatingSystem.cpus().length,
  totalMemory: operatingSystem.totalmem(),
  loadBefore: operatingSystem.loadavg(),
  renderer: 'none (server harness)',
  limits: [
    'Shared host; not dedicated hardware.',
    'Accelerated simulation, not a real-time wall-clock soak.',
    'In-process connections and memory storage exclude Nakama, PostgreSQL, network and browser latency.',
    'Timing is observational; no user-hardware latency budget is established.',
  ],
  scenarios: performanceScenarios.map((name) =>
    runPerformanceScenario(
      name,
      name === 'soak' ? soakTicks : ticks,
      true,
      captains,
      retainedAccounts,
      storageDelayMs,
    ),
  ),
  loadAfter: operatingSystem.loadavg(),
  finished: new Date().toISOString(),
};
filesystem.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log('Baseline written:', output);
