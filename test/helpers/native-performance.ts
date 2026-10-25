import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import type { Session } from '@heroiclabs/nakama-js';
import type { HealthMetric, HealthSummary } from '../../shared/health.ts';
import { HealthMonitor } from '../../shared/health.ts';
import { PLAYER_PORTRAITS } from '../../shared/portraits.ts';
import { NakamaService, repository, until, sanitizedDiagnostic } from './nakama-service.ts';

/** Bounded client workload; this seed does not control native server randomness. */
export interface NativePerformanceOptions {
  /** Measured wall-clock flight duration, 32..300 seconds. */
  durationSeconds: number;
  /** Fresh captains in one initial system, 1..12. */
  captains: number;
  /** Unsigned 32-bit seed for client input selection only. */
  seed: number;
}
/** Reject invalid workloads before creating fixture files, sockets or processes. */
export function validateNativePerformance(options: NativePerformanceOptions): void {
  if (
    !Number.isInteger(options.durationSeconds) ||
    options.durationSeconds < 32 ||
    options.durationSeconds > 300
  )
    throw new Error('Native duration must be 32..300 integer seconds');
  if (!Number.isInteger(options.captains) || options.captains < 1 || options.captains > 12)
    throw new Error('Native captains must be 1..12');
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)
    throw new Error('Native seed must be an unsigned 32-bit integer');
}
/** Strict command-line parsing has no fixture side effects. */
export function parseNativePerformanceArguments(argumentsList: string[]) {
  const values = new Map<string, string>();
  for (const argument of argumentsList) {
    const match = /^--(duration|captains|seed|output)=(.+)$/.exec(argument);
    if (!match || values.has(match[1]))
      throw new Error('Expected unique --duration/--captains/--seed/--output=value');
    values.set(match[1], match[2]);
  }
  for (const key of ['duration', 'captains', 'seed'])
    if (values.has(key) && !/^\d+$/.test(values.get(key)!))
      throw new Error('Native limits must be decimal integers');
  const options = {
    durationSeconds: Number(values.get('duration') ?? 60),
    captains: Number(values.get('captains') ?? 4),
    seed: Number(values.get('seed') ?? 1701),
  };
  validateNativePerformance(options);
  const output = values.get('output');
  if (!output || !path.isAbsolute(output))
    throw new Error('--output must name an absolute private JSON file');
  return { options, output };
}
const serverMetrics: readonly HealthMetric[] = [
  'tickMs',
  'featuresMs',
  'spacesMs',
  'snapshotsMs',
  'snapshotBuildMs',
  'snapshotSerializeMs',
  'snapshotBytes',
  'systems',
  'entities',
  'shots',
  'returningLogins',
  'tickFailures',
  'spaceFailures',
  'frozenTicks',
  'connections',
  'disconnects',
  'checkpointMs',
  'checkpointSerializeMs',
  'checkpointBytes',
  'checkpointFreezes',
];
const summaryFields = ['count', 'total', 'max', 'last', 'p50', 'p95', 'retained'] as const;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Copy only fixed numeric metric fields from the native logger's health message. */
export function parseNativeHealth(
  message: unknown,
): Partial<Record<HealthMetric, HealthSummary>> | null {
  if (
    typeof message !== 'string' ||
    !message.startsWith('World health: ') ||
    message.length > 32768
  )
    return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(message.slice('World health: '.length));
  } catch {
    return null;
  }
  if (!record(decoded)) return null;
  const result: Partial<Record<HealthMetric, HealthSummary>> = {};
  for (const metric of serverMetrics) {
    const summary = decoded[metric];
    if (summary === undefined) continue;
    if (
      !record(summary) ||
      !summaryFields.every(
        (field) =>
          typeof summary[field] === 'number' &&
          Number.isFinite(summary[field]) &&
          summary[field] >= 0,
      )
    )
      return null;
    if (
      !Number.isSafeInteger(summary.count) ||
      !Number.isSafeInteger(summary.retained) ||
      Number(summary.retained) > 4096
    )
      return null;
    result[metric] = Object.fromEntries(
      summaryFields.map((field) => [field, summary[field]]),
    ) as unknown as HealthSummary;
  }
  return Object.keys(result).length ? result : null;
}
function healthReports(service: NakamaService) {
  const reports: Partial<Record<HealthMetric, HealthSummary>>[] = [];
  for (const child of service.children.filter((entry) => entry.name.startsWith('nakama-'))) {
    const file = path.join(service.run, child.name + '.log');
    assert(fs.statSync(file).size <= 16 * 1024 * 1024, 'native diagnostic log exceeds 16 MiB');
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const report = record(entry) ? parseNativeHealth(entry.msg) : null;
      if (report) reports.push(report);
      if (reports.length > 32) throw new Error('Native health report count exceeded bound');
    }
  }
  return reports;
}
function version(command: string, argumentsList: string[]) {
  const text = execFileSync(command, argumentsList, {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
  });
  return text.match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/)?.[0] ?? 'unavailable';
}
function nativeResources(service: NakamaService) {
  return service.children
    .filter(
      (entry) =>
        !entry.result && ['postgres', 'nakama-'].some((prefix) => entry.name.startsWith(prefix)),
    )
    .map((entry) => {
      const values = execFileSync('ps', ['-p', String(entry.process.pid), '-o', 'cputimes=,rss='], {
        encoding: 'utf8',
        timeout: 5000,
      })
        .trim()
        .split(/\s+/)
        .map(Number);
      assert(values.length === 2 && values.every((value) => Number.isFinite(value) && value >= 0));
      return {
        role: entry.name.startsWith('nakama-') ? 'nakama' : 'postgres-parent',
        cpuSeconds: values[0],
        residentKiB: values[1],
      };
    });
}
async function waitUntil(target: number): Promise<void> {
  while (performance.now() < target)
    await delay(Math.max(1, Math.ceil(target - performance.now())));
}
type Connection = Awaited<ReturnType<NakamaService['connect']>>;
type Phase = 'setup' | 'join' | 'flight' | 'checkpoint' | 'restart' | 'cleanup' | 'complete';
/** Optional fault injection is used only to verify the harness's failure cleanup. */
export interface NativePerformanceHooks {
  /** Called after real authenticated joins, before measured flight. */
  afterJoin?: () => void;
}
/** Real native services and SDK sockets, paced by monotonic wall time. */
export async function runNativePerformance(
  options: NativePerformanceOptions,
  hooks: NativePerformanceHooks = {},
) {
  validateNativePerformance(options);
  const started = new Date().toISOString();
  const wallStart = performance.now();
  const cpuStart = process.cpuUsage();
  const peers: Connection[] = [];
  const sessions: Session[] = [];
  const active: Connection[] = [];
  const sequences: number[] = [];
  let phase: Phase = 'setup';
  let failedPhase: Phase | null = null;
  let status: 'passed' | 'failed' = 'failed';
  let measuredElapsedMs = 0;
  let inputPackets = 0;
  let inputBytes = 0;
  let reconnectMs = 0;
  let reconnectToFlightMs = 0;
  let restartToStateMs = 0;
  let restartToFlightMs = 0;
  let restoredCaptains = 0;
  let checkpointRevision = 0;
  let checkpointBytes = 0;
  let health: ReturnType<typeof healthReports> = [];
  let resources: ReturnType<typeof nativeResources> = [];
  let cleanup: { processes: number; exited: number; allExited: boolean; succeeded: boolean } = {
    processes: 0,
    exited: 0,
    allExited: false,
    succeeded: false,
  };
  const drift = new HealthMonitor(512);
  let scheduleState = options.seed;
  const choose = () => {
    scheduleState = (Math.imul(scheduleState, 1664525) + 1013904223) >>> 0;
    return scheduleState / 4294967296;
  };
  const metadata = {
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim(),
    sourceDirty:
      execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim()
        .length > 0,
    node: process.version,
    sdk: JSON.parse(
      fs.readFileSync(
        path.join(repository, 'node_modules/@heroiclabs/nakama-js/package.json'),
        'utf8',
      ),
    ).version as string,
    nakama: 'unavailable',
    postgres: 'unavailable',
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unavailable',
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    loadBefore: os.loadavg(),
  };
  const service = new NakamaService(undefined, {
    runtimeHealth: true,
    deadlineMs: options.durationSeconds * 1000 + 120000,
  });
  const world = async (session: Session) => {
    const response = await service.client.rpc(session, 'qr_world', {});
    assert(record(response.payload) && typeof response.payload.matchId === 'string');
    return response.payload.matchId;
  };
  const attach = async (session: Session, matchId: string) => {
    const connection = await service.connect(session, { retainedLimit: 64 });
    peers.push(connection);
    await connection.socket.joinMatch(matchId);
    await until(() => connection.latest('you'), 'native authoritative player state');
    return connection;
  };
  const send = async (connection: Connection, matchId: string, packet: object) => {
    const text = JSON.stringify(packet);
    await connection.socket.sendMatchState(matchId, 1, text);
    return Buffer.byteLength(text);
  };
  try {
    await service.initialize();
    metadata.nakama = version(
      process.env.NAKAMA_BINARY ?? path.join(repository, '.artifacts/nakama/nakama-3.41.0/nakama'),
      ['--version'],
    );
    metadata.postgres = version(path.join(process.env.POSTGRES_BIN!, 'postgres'), ['--version']);
    phase = 'join';
    let matchId = '';
    let systemId = '';
    for (let index = 0; index < options.captains; index++) {
      const session = await service.client.authenticateCustom(
        'qr:Native Probe ' + index,
        true,
        undefined,
        { pass: 'synthetic-native-probe-only' },
      );
      sessions.push(session);
      const resolved = await world(session);
      if (!matchId) matchId = resolved;
      assert.equal(resolved, matchId, 'captains share the actual native world');
      const connection = await attach(session, matchId);
      active.push(connection);
      sequences.push(0);
      if (!systemId) systemId = connection.latest('you')!.d.sys;
      assert.equal(connection.latest('you')!.d.sys, systemId, 'initial workload is concentrated');
      const portraitId = PLAYER_PORTRAITS[1 + (index % (PLAYER_PORTRAITS.length - 1))].id;
      await send(connection, matchId, { t: 'portrait', portraitId });
      await until(
        () => connection.latest('you')!.d.portraitId === portraitId,
        'persistent portrait marker',
      );
      await send(connection, matchId, { t: 'depart' });
      await until(() => connection.latest('snap')?.me, 'authoritative native flight');
    }
    hooks.afterJoin?.();
    phase = 'flight';
    const measurementStart = performance.now();
    const initialPositions = active.map((connection) => connection.latest('snap')!.me.slice(2, 4));
    let reconnected = false;
    for (let step = 0; ; step++) {
      const target = measurementStart + step * 100;
      if (target >= measurementStart + options.durationSeconds * 1000) break;
      await waitUntil(target);
      drift.observe('tickMs', Math.max(0, performance.now() - target));
      if (!reconnected && performance.now() - measurementStart >= options.durationSeconds * 500) {
        const before = active[0].latest('you')!.d;
        active[0].socket.disconnect(false);
        const reconnectStart = performance.now();
        active[0] = await attach(sessions[0], matchId);
        reconnectMs = performance.now() - reconnectStart;
        await send(active[0], matchId, { t: 'depart' });
        await until(() => active[0].latest('snap')?.me, 'reconnected authoritative flight');
        assert.equal(active[0].latest('you')!.d.portraitId, before.portraitId);
        assert.equal(active[0].latest('you')!.d.credits, before.credits);
        reconnectToFlightMs = performance.now() - reconnectStart;
        reconnected = true;
      }
      for (let index = 0; index < active.length; index++) {
        const connection = active[index];
        assert(!connection.disconnected, 'unexpected native disconnect');
        const packet = {
          t: 'input',
          seq: ++sequences[index],
          th: 1,
          tu: choose() < 0.15 ? 1 : 0,
          f1: false,
          f2: false,
        };
        inputBytes += await send(connection, matchId, packet);
        inputPackets++;
        const snapshot = connection.latest('snap');
        assert(
          snapshot?.me && snapshot.me.slice(2, 6).every(Number.isFinite),
          'finite authoritative flight',
        );
      }
    }
    await waitUntil(measurementStart + options.durationSeconds * 1000);
    measuredElapsedMs = performance.now() - measurementStart;
    assert(reconnected);
    for (let index = 0; index < active.length; index++) {
      await send(active[index], matchId, { t: 'input', seq: ++sequences[index], th: 0, tu: 0 });
      await until(
        () => active[index].latest('snap')!.me[1] >= sequences[index],
        'native input progress',
      );
      assert.notDeepEqual(
        active[index].latest('snap')!.me.slice(2, 4),
        initialPositions[index],
        'actual flight movement',
      );
    }
    health = healthReports(service);
    assert(health.length > 0, 'runtime.env health and info logger must deliver native summaries');
    for (const report of health) {
      for (const metric of [
        'tickFailures',
        'spaceFailures',
        'checkpointFreezes',
        'frozenTicks',
      ] as const)
        assert.equal(report[metric]?.count ?? 0, 0, 'no native simulation/authority failures');
    }
    assert(
      health.some((report) => (report.checkpointMs?.count ?? 0) > 0),
      'actual PostgreSQL checkpoint measured',
    );
    resources = nativeResources(service);
    phase = 'checkpoint';
    const prior = active.map((connection) => connection.latest('you')!.d);
    for (const connection of active) connection.socket.disconnect(false);
    await delay(300);
    const checkpoint = JSON.parse(
      await service.query(
        "SELECT json_build_object('revision',(value->>'revision')::bigint,'bytes',octet_length(value::text),'captains',(SELECT count(*) FROM jsonb_object_keys(value->'players')))::text FROM storage WHERE collection='qr_server' AND key='authoritative_world_v1'",
      ),
    );
    assert(
      record(checkpoint) &&
        Number.isSafeInteger(checkpoint.revision) &&
        Number(checkpoint.revision) > 0,
    );
    assert.equal(checkpoint.captains, options.captains);
    assert(typeof checkpoint.bytes === 'number' && checkpoint.bytes > 0);
    checkpointRevision = Number(checkpoint.revision);
    checkpointBytes = checkpoint.bytes;
    phase = 'restart';
    const restartStart = performance.now();
    await service.restartNakama();
    for (let index = 0; index < sessions.length; index++) {
      const match = await world(sessions[index]);
      assert.notEqual(match, matchId, 'restart creates a new native world');
      const connection = await attach(sessions[index], match);
      const player = connection.latest('you')!.d;
      assert.equal(player.portraitId, prior[index].portraitId, 'saved nondefault marker restored');
      assert.equal(player.credits, prior[index].credits);
      assert.equal(player.ship.hull, prior[index].ship.hull);
      assert.equal(player.sys, prior[index].sys);
      restartToStateMs = performance.now() - restartStart;
      await send(connection, match, { t: 'depart' });
      await until(() => connection.latest('snap')?.me, 'restored authoritative flight');
      restoredCaptains++;
    }
    restartToFlightMs = performance.now() - restartStart;
    health = healthReports(service);
    assert(
      peers.every((connection) => connection.errorCount === 0),
      'no native SDK errors',
    );
    status = 'passed';
    phase = 'complete';
  } catch (error) {
    failedPhase = phase;
    fs.writeFileSync(
      path.join(service.run, 'scenario-error.log'),
      sanitizedDiagnostic(
        error instanceof Error ? (error.stack ?? error.message) : 'Native scenario failure',
      ),
      { mode: 0o600 },
    );
  } finally {
    try {
      await service.cleanup();
      cleanup = {
        processes: service.children.length,
        exited: service.children.filter((child) => !!child.result).length,
        allExited: service.children.every((child) => !!child.result),
        succeeded: true,
      };
      assert(cleanup.allExited, 'native process cleanup');
    } catch {
      status = 'failed';
      failedPhase = 'cleanup';
    }
  }
  const cpu = process.cpuUsage(cpuStart);
  return {
    schema: 1,
    status,
    failedPhase,
    started,
    finished: new Date().toISOString(),
    workload: {
      ...options,
      inputHz: 10,
      retainedRecentPacketLimit: 64,
      retainedStatePacketLimit: 3,
      watchdogMs: options.durationSeconds * 1000 + 120000,
    },
    metadata: { ...metadata, loadAfter: os.loadavg() },
    measuredElapsedMs,
    totalElapsedMs: performance.now() - wallStart,
    driverCpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 },
    driverMaxResidentKiB: process.resourceUsage().maxRSS,
    resources,
    inputPackets,
    inputBytes,
    sendDriftMs: drift.report().tickMs ?? null,
    reconnectMs,
    reconnectToFlightMs,
    restartToStateMs,
    restartToFlightMs,
    restoredCaptains,
    checkpointRevision,
    checkpointBytes,
    connections: peers.map((connection) => connection.receiveReport()),
    health,
    cleanup,
    limits: [
      'Shared loopback host; not Internet latency, production capacity or a latency SLO.',
      'Client input seed does not make native server RNG or wall-clock scheduling deterministic.',
      'Concentrated fresh-captain flight and one reconnect; distributed, combat and mining workloads are not covered.',
      'Snapshot gaps are client receive intervals, not round-trip latency; send drift includes harness scheduling and reconnect work.',
      'Native CPU samples use ps integer CPU seconds; PostgreSQL parent excludes backend workers. Driver CPU is separate.',
      'Bounded wall-clock run, not multihour soak or browser rendering evidence.',
    ],
  };
}
