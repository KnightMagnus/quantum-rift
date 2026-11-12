import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import { NakamaService, repository } from './helpers/nakama-service.ts';
import { NakamaDatabase } from '../server/nakama-storage.ts';
import { initializeRandomStreams, randomStream } from '../server/random-streams.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';

// This endpoint exists only in the disposable test runtime. It runs the same stream
// and checkpoint implementations as the match, without exposing gameplay test hooks.
const fixtureSource = `
import { NakamaDatabase, nakamaStorageBackend } from './server/nakama-storage.ts';
import { initializeRandomStreams, randomStream } from './server/random-streams.ts';
export function exercise(ctx, logger, nk, payload) {
  const request = JSON.parse(payload);
  const storage = new NakamaDatabase(nakamaStorageBackend(nk));
  initializeRandomStreams(storage, request.seed);
  const economy = randomStream(storage, 'living-economy');
  const simulation = randomStream(storage, 'simulation:emberlight');
  const unrelated = randomStream(storage, 'simulation:unrelated');
  for (let index = 0; index < request.extraEconomy; index++) economy.next();
  for (let index = 0; index < request.extraSystem; index++) unrelated.next();
  const economyValues = [], simulationValues = [];
  for (let index = 0; index < 16; index++) {
    economyValues.push(economy.next());
    simulationValues.push(simulation.next());
  }
  storage.touch();
  storage.flush();
  return JSON.stringify({economyValues, simulationValues, state:storage.world.randomStreams});
}
`;
const bundled = await build({
  absWorkingDir: repository,
  stdin: { contents: fixtureSource, resolveDir: repository, sourcefile: 'rng-native-fixture.ts' },
  bundle: true,
  write: false,
  platform: 'neutral',
  format: 'cjs',
  target: 'esnext',
  banner: { js: 'var module = { exports: {} };' },
});
const transformed = await transformAsync(bundled.outputFiles[0].text, {
  configFile: false,
  babelrc: false,
  presets: [[presetEnv, { targets: { ie: '11' }, modules: false }]],
});
assert(transformed?.code);
const runtime = new TextEncoder().encode(
  transformed.code +
    '\nfunction qrTestRandom(ctx, logger, nk, payload) { return module.exports.exercise(ctx, logger, nk, payload); }' +
    '\nfunction InitModule(ctx, logger, nk, initializer) { initializer.registerRpc("qr_test_random", qrTestRandom); }\n',
);
const service = new NakamaService(runtime);
let row: { value: object; version: string } | null = null;
let revision = 0;
const backend: StorageBackend = {
  read: () => row,
  write: (_key, value, version) => {
    assert.equal(version, row?.version ?? '*');
    row = { value: structuredClone(value), version: String(++revision) };
    return row.version;
  },
};
interface Request {
  /** Seed used only when migrating a legacy world without stream state. */
  seed: number;
  /** Extra economy draws must not advance either simulation stream. */
  extraEconomy: number;
  /** Extra draws in an unrelated system must not advance the target system. */
  extraSystem: number;
}
function local(request: Request) {
  const storage = new NakamaDatabase(backend);
  initializeRandomStreams(storage, request.seed);
  const economy = randomStream(storage, 'living-economy');
  const simulation = randomStream(storage, 'simulation:emberlight');
  const unrelated = randomStream(storage, 'simulation:unrelated');
  for (let index = 0; index < request.extraEconomy; index++) economy.next();
  for (let index = 0; index < request.extraSystem; index++) unrelated.next();
  const economyValues: number[] = [],
    simulationValues: number[] = [];
  for (let index = 0; index < 16; index++) {
    economyValues.push(economy.next());
    simulationValues.push(simulation.next());
  }
  storage.touch();
  storage.flush();
  return { economyValues, simulationValues, state: storage.world.randomStreams };
}
try {
  await service.initialize();
  const authenticate = () => service.client.authenticateCustom('rng-fixture-only', true);
  let session = await authenticate();
  const compare = async (request: Request) => {
    const before = structuredClone(row);
    const beforeRevision = revision;
    const control = local({ ...request, extraEconomy: 0, extraSystem: 0 });
    row = before;
    revision = beforeRevision;
    const expected = local(request);
    assert.deepEqual(
      expected.simulationValues,
      control.simulationValues,
      'extra economy and unrelated-system draws leave the target simulation sequence unchanged',
    );
    const reply = await service.client.rpc(session, 'qr_test_random', request);
    assert.deepEqual(
      reply.payload,
      expected,
      'Goja matches Node stream draws and checkpoint state',
    );
    return expected;
  };
  await compare({ seed: 186, extraEconomy: 0, extraSystem: 0 });
  session = await authenticate();
  await compare({ seed: 999, extraEconomy: 1000, extraSystem: 1000 });
  const saved = JSON.parse(
    await service.query(
      "SELECT value->'world'->'randomStreams' FROM storage WHERE collection='qr_server' AND key='authoritative_world_v1'",
    ),
  );
  assert.deepEqual(
    saved,
    (row!.value as { world: { randomStreams: unknown } }).world.randomStreams,
  );
  await service.restartNakama();
  session = await authenticate();
  await compare({ seed: 123, extraEconomy: 37, extraSystem: 51 });
  console.log(
    'Native RNG: Node/Goja parity, isolated streams, reconnect and PostgreSQL restart continuation.',
  );
} finally {
  await service.cleanup();
}
