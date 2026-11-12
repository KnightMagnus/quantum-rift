// Living-economy system-state rolls own a separate random stream. Adding trade ports
// changes how many economy draws warmup makes, but must not advance or shift the
// per-system simulation streams that combat and survey movement read.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import type { GameAssets } from '../shared/rules.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';
import type { GameStorage } from '../server/game-storage.ts';
import type { Entity } from '../server/space.ts';
import { DT } from '../shared/rules.ts';
import { SYS } from '../shared/galaxy.ts';
import { initializeRandomStreams, randomStream } from '../server/random-streams.ts';
import { DB as Database } from '../server/db.ts';
import { NakamaDatabase } from '../server/nakama-storage.ts';
import { Game } from '../server/game.ts';
import { simulateCombatPlayability } from './helpers/combat-playability-simulation.ts';
import { addedMarketCount, withOriginalMarketRoster } from './helpers/original-market-roster.ts';

process.env.SEEDS_FILE = '/nonexistent';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const originalRandom = Math.random;
const originalNow = Date.now;
const startTime = 1800000000000;
let now = startTime;
let ambientDraws = 0;

/** Install a seeded ambient source for root initialization and unmigrated feature draws. */
function seedAmbient(seed: number): void {
  let state = seed >>> 0;
  ambientDraws = 0;
  Math.random = () => {
    ambientDraws++;
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Restore the process clock and ambient stream. */
function restoreAmbient(): void {
  Math.random = originalRandom;
  Date.now = originalNow;
}

/** In-memory authoritative checkpoint store, as the native match uses. */
function memoryBackend(): StorageBackend {
  const rows = new Map<string, { value: object; version: string }>();
  let writes = 0;
  return {
    read: (key) => rows.get(key) ?? null,
    write: (key, value, version) => {
      assert.equal(version, rows.get(key)?.version ?? '*');
      const next = String(++writes);
      rows.set(key, { value: structuredClone(value), version: next });
      return next;
    },
  };
}

const directories: string[] = [];
/** Isolated Solo/friend save directory, removed at exit. */
function saveDirectory(): string {
  const directory = filesystem.mkdtempSync(
    path.join(operatingSystem.tmpdir(), 'rift-economy-rng-'),
  );
  directories.push(directory);
  return directory;
}

/** Fixed virtual clock without timers, matching the authoritative combat fixture. */
function hostOptions() {
  let uuid = 0;
  return {
    automaticClock: false,
    seedDefinitions: [],
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    defer: () => () => undefined,
  };
}

interface Warmup {
  /** Constructed game, for follow-up checks. */
  game: Game;
  /** Ambient draws taken by Game construction, including economy warmup. */
  constructionDraws: number;
  /** Next ambient value after construction, identifying the remaining ambient position. */
  nextAmbient: number;
  /** Trade-port systems that economy warmup rolled over. */
  marketSystems: number;
}

/** Construct a game under a seeded ambient stream and a fixed clock. */
function warmup(storage: GameStorage, seed: number): Warmup {
  now = startTime;
  Date.now = () => now;
  seedAmbient(seed);
  const game = new Game(assets, storage, hostOptions());
  const constructionDraws = ambientDraws;
  const nextAmbient = Math.random();
  return {
    game,
    constructionDraws,
    nextAmbient,
    marketSystems: game.features.living.marketSystems().length,
  };
}

try {
  // Named streams own independent, persisted state with repeatable seed derivation.
  {
    seedAmbient(1);
    const storage = new Database(saveDirectory());
    const repeatedStorage = new Database(saveDirectory());
    initializeRandomStreams(storage, 186);
    initializeRandomStreams(repeatedStorage, 186);
    const first = randomStream(storage, 'living-economy');
    const simulation = randomStream(storage, 'simulation:emberlight');
    const otherSystem = randomStream(storage, 'simulation:other');
    const second = randomStream(repeatedStorage, 'living-economy');
    const repeatedSimulation = randomStream(repeatedStorage, 'simulation:emberlight');
    const sequence = Array.from({ length: 64 }, () => first.next());
    assert.deepEqual(
      Array.from({ length: 64 }, () => second.next()),
      sequence,
    );
    for (let draw = 0; draw < 1000; draw++) {
      first.next();
      otherSystem.next();
    }
    assert.deepEqual(
      Array.from({ length: 64 }, () => simulation.next()),
      Array.from({ length: 64 }, () => repeatedSimulation.next()),
      'economy and another system cannot advance this simulation stream',
    );
    assert.equal(ambientDraws, 0, 'explicitly seeded streams consume no ambient draws');
    initializeRandomStreams(new Database(saveDirectory()));
    assert.equal(ambientDraws, 1, 'legacy migration takes exactly one ambient root seed');
    restoreAmbient();
  }

  // Invalid persisted versions and malformed stream states never silently reseed.
  for (const invalid of [
    { version: 2, rootSeed: 186, states: {} },
    { version: 1, rootSeed: -1, states: {} },
    { version: 1, rootSeed: 186, states: [] },
    { version: 1, rootSeed: 186, states: { 'living-economy': NaN } },
    null,
  ]) {
    const storage = new Database(saveDirectory());
    storage.world.randomStreams = invalid as never;
    assert.throws(() => initializeRandomStreams(storage), /invalid gameplay random state/);
    assert.equal(storage.world.randomStreams, invalid, 'rejected state is preserved for recovery');
  }

  // Warmup with extra trade ports also leaves the remaining ambient source unchanged.
  // Several seeds: with the shared stream, most of these took a different number of
  // ambient draws once the extra ports were added.
  assert.ok(addedMarketCount() > 0, 'the scene pack adds trade ports');
  const seed = 0x187;
  let extended: Warmup | undefined;
  for (let candidate = 0x186; candidate < 0x186 + 8; candidate++) {
    const original = withOriginalMarketRoster(() =>
      warmup(new Database(saveDirectory()), candidate),
    );
    const widened = warmup(new Database(saveDirectory()), candidate);
    assert.ok(
      widened.marketSystems > original.marketSystems,
      `extra ports widen economy warmup (${original.marketSystems} -> ${widened.marketSystems})`,
    );
    assert.equal(
      widened.constructionDraws,
      original.constructionDraws,
      `seed ${candidate}: construction takes the same ambient draws with either market roster`,
    );
    assert.equal(
      widened.nextAmbient,
      original.nextAmbient,
      `seed ${candidate}: the ambient source continues from the same position`,
    );
    if (candidate === seed) extended = widened;
  }
  assert.ok(extended);

  // The same seed and inputs reproduce the economy's own results.
  const repeated = warmup(new Database(saveDirectory()), seed);
  assert.ok(Object.keys(extended.game.db.world.states).length > 0, 'warmup starts system states');
  assert.deepEqual(
    repeated.game.db.world.states,
    extended.game.db.world.states,
    'one seed reproduces the economy states',
  );

  // Later economy ticks, including after a session reconnects, draw no ambient values.
  {
    const game = extended.game;
    const states = game.db.world.states;
    const latest = Math.max(...Object.values(states).map((state) => state.until));
    const socket = () => ({ readyState: 1, send() {}, on() {}, close() {} }) as never;
    game.connect(socket());
    game.disconnect([...game.sessions.values()].at(-1)!);
    game.connect(socket());
    now = latest + 1;
    const before = ambientDraws;
    game.features.living.livingTick();
    assert.equal(ambientDraws, before, 'expired states are re-rolled from the economy stream');
    assert.ok(
      Object.values(game.db.world.states).some((state) => state.start === now),
      'the tick rolled new states',
    );
  }

  // Save/load and service restart retain both active states and every stream position.
  for (const [mode, open] of [
    ['Solo/friend save', () => new Database(saveDirectory())],
    ['authoritative checkpoint', () => new NakamaDatabase(memoryBackend())],
  ] as const) {
    const storage = open();
    const first = warmup(storage, seed);
    const savedStates = structuredClone(first.game.db.world.states);
    const economy = randomStream(storage, 'living-economy');
    const simulation = randomStream(storage, 'simulation:emberlight');
    economy.next();
    simulation.next();
    first.game.db.touch();
    first.game.db.flush();
    const reopened =
      storage instanceof Database ? new Database(storage.dir) : reopenCheckpoint(storage);
    assert.deepEqual(
      reopened.world.randomStreams,
      storage.world.randomStreams,
      `${mode}: all stream state survives checkpoint reload`,
    );
    const restarted = warmup(reopened, seed + 1);
    assert.deepEqual(restarted.game.db.world.states, savedStates, `${mode}: states survive reload`);
    assert.deepEqual(
      Array.from({ length: 64 }, () => randomStream(reopened, 'living-economy').next()),
      Array.from({ length: 64 }, () => economy.next()),
      `${mode}: economy resumes exactly`,
    );
    assert.deepEqual(
      Array.from({ length: 64 }, () => randomStream(reopened, 'simulation:emberlight').next()),
      Array.from({ length: 64 }, () => simulation.next()),
      `${mode}: simulation resumes exactly`,
    );
  }
  restoreAmbient();

  // Combat: the same fixed-seed arrival and fight with and without the extra ports.
  {
    const scenario = {
      system: 'emberlight',
      fleet: [708],
      upgraded: false,
      seed: 1701,
      seconds: 120,
    };
    const withoutTiming = (result: ReturnType<typeof simulateCombatPlayability>) => {
      const { tickP95Ms: _p95, tickMaxMs: _max, ...outcome } = result;
      return outcome;
    };
    const baseline = withOriginalMarketRoster(() => simulateCombatPlayability(scenario));
    const widened = simulateCombatPlayability(scenario);
    assert.ok(baseline.damageContacts > 0, 'the combat scenario fights');
    assert.deepEqual(
      withoutTiming(widened),
      withoutTiming(baseline),
      'combat outcome is unchanged',
    );
  }

  // Survey: the same Index tour with and without the extra ports.
  {
    const systemId = Object.values(SYS).find(
      (system) =>
        system.farside &&
        !(system.fields || []).length &&
        system.stellars.length >= 2 &&
        !['table', 'quantum-rift', 'beyond-rift', 'founding-vigil', 'glasswake'].includes(
          system.id,
        ),
    )!.id;
    // Which systems hold a system state still depends on the market roster: a boom or
    // war here is an input to this system's simulation. Hold that input fixed so the
    // comparison isolates the random stream; the other systems keep their warmup states.
    const tour = (game: Game) => {
      delete game.db.world.states[systemId];
      const space = game.spaces[systemId];
      space.players = 1;
      // Entity IDs come from a process-wide counter, so samples omit them.
      const samples: Array<[string, number, number]> = [];
      let maxLeash = 0;
      for (let tick = 0; tick < Math.round(300 / DT); tick++) {
        game.features.mining.advanceClock(DT);
        space.tick();
        now += DT * 1000;
        if (tick % 15) continue;
        const machines = [...space.ships.values()].filter(
          (entity: Entity) => entity.faction === 'index' && !entity.dead,
        );
        for (const entity of machines) {
          samples.push([
            String(entity.name).replace(/ship \d+/, 'ship'),
            Math.round(entity.x),
            Math.round(entity.y),
          ]);
          const parentSlot = entity.indexState?.[1] ?? -1;
          const parent =
            parentSlot >= 0
              ? machines.find((candidate) => candidate.indexState?.[0] === parentSlot)
              : undefined;
          if (parent && [914, 915].includes(Number(entity.hull)))
            maxLeash = Math.max(maxLeash, Math.hypot(entity.x - parent.x, entity.y - parent.y));
        }
      }
      return { samples, maxLeash };
    };
    const baseline = withOriginalMarketRoster(() =>
      tour(warmup(new Database(saveDirectory()), seed).game),
    );
    const widened = tour(warmup(new Database(saveDirectory()), seed).game);
    assert.ok(baseline.samples.length > 0 && baseline.maxLeash > 0, 'Index drones were observed');
    const mismatch = widened.samples.findIndex(
      (sample, index) => JSON.stringify(sample) !== JSON.stringify(baseline.samples[index]),
    );
    assert.ok(
      mismatch < 0 && widened.samples.length === baseline.samples.length,
      `survey movement is unchanged (${baseline.samples.length} samples; first difference ${mismatch}: ${JSON.stringify(baseline.samples[mismatch])} vs ${JSON.stringify(widened.samples[mismatch])})`,
    );
    assert.ok(baseline.maxLeash < 1300, `drones stay leashed (${Math.round(baseline.maxLeash)})`);
    restoreAmbient();
  }
  console.log('economy random isolation: ok');
} finally {
  restoreAmbient();
  for (const directory of directories)
    filesystem.rmSync(directory, { recursive: true, force: true });
}
process.exit(0);

/** Reopen a native checkpoint from the same in-memory backend. */
function reopenCheckpoint(storage: NakamaDatabase): NakamaDatabase {
  return new NakamaDatabase((storage as unknown as { backend: StorageBackend }).backend);
}
