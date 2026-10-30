import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { GameAssets } from '../shared/rules.ts';
import type { GamePlatform } from '../server/game-platform.ts';
import { START } from '../shared/galaxy.ts';
import { TICK } from '../shared/rules.ts';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { refineryPilot } from './helpers/refinery-fixture.ts';

const directory = filesystem.mkdtempSync(path.join(tmpdir(), 'rift-portable-core-'));
const assets = (): GameAssets =>
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'));
const pending: Array<{ callback: () => void; delayMs: number }> = [];
let clocks = 0;
const platform: GamePlatform = {
  seedDefinitions: [],
  automaticClock: false,
  startClock: () => {
    clocks++;
  },
  defer: (callback, delayMs) => {
    pending.push({ callback, delayMs });
  },
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
};
const oldSeeds = process.env.SEEDS_FILE;
try {
  process.env.SEEDS_FILE = path.join(directory, 'missing-seeds.json');
  const database = new DB(directory);
  const interval = globalThis.setInterval;
  const timeout = globalThis.setTimeout;
  let game: Game<DB>;
  try {
    globalThis.setInterval = (() => {
      throw Error('portable core created an interval');
    }) as typeof setInterval;
    globalThis.setTimeout = Object.assign(() => {
      throw Error('portable core created a timeout');
    }, timeout);
    game = new Game(assets(), database, platform);
    assert.equal(clocks, 0);
    assert.deepEqual(Object.keys(database.players), []);
    const session = refineryPilot(game, 'Portable Pilot');
    const space = game.spaces[START.system];
    const before = space.t;
    for (let tick = 0; tick < TICK * 2; tick++) game.tick();
    assert.equal(game.tickN, TICK * 2);
    assert.ok(space.t > before, 'external ticks advance the real Space simulation');
    game.depart(session);
    assert.ok(session.ent, 'portable captain departs through the real authoritative route');
    session.inputScheduling = 'match';
    for (let sequence = 1; sequence <= 3; sequence++)
      game.onMessage(session, { t: 'input', seq: sequence, th: 1, tu: 0 });
    assert.equal(
      session.inputs.length,
      0,
      'native match ingress never retains the legacy input queue',
    );
    assert.equal(session.lastInput?.seq, 3);
    game.tick();
    assert.equal(
      session.ent.seq,
      3,
      'one authoritative tick acknowledges the latest native control',
    );
    delete session.inputScheduling;
    game.onMessage(session, { t: 'input', seq: 4, th: 0, tu: 0 });
    game.onMessage(session, { t: 'input', seq: 5, th: 0, tu: 0 });
    assert.equal(session.inputs.length, 2, 'Solo retains its existing local input scheduling');
    game.tick();
    assert.equal(session.ent.seq, 4);
    game.tick();
    assert.equal(session.ent.seq, 5);
    game.features.coop.coopLogout(session);
    assert.equal(pending.at(-1)?.delayMs, 50, 'logout presence uses the serialized host queue');
    pending.pop()!.callback();
  } finally {
    globalThis.setInterval = interval;
    globalThis.setTimeout = timeout;
  }
  const seeded = new Game(assets(), database, {
    ...platform,
    seedDefinitions: [{ name: 'Injected Captain', pass: 'fixture', credits: 12345 }],
    invasionNow: START.system,
  });
  assert.equal(database.get('Injected Captain')?.credits, 12345);
  assert.equal(pending.at(-1)?.delayMs, 500);
  pending.pop()!.callback();
  assert.equal(seeded.features.fronts.worldPayload().invasion?.sys, START.system);
  new Game(assets(), database, { ...platform, automaticClock: true });
  assert.equal(clocks, 1, 'automatic hosts still start exactly one game clock');
  const local = database.gamePlatform();
  assert.equal(local.automaticClock, true);
  assert.deepEqual(local.seedDefinitions, []);
  assert.match(local.randomUUID(), /^[0-9a-f-]{36}$/);
  assert.equal(database.hasPendingCheckpoint(), false);
  filesystem.writeFileSync(database.journal, '{}');
  assert.equal(database.hasPendingCheckpoint(), true, 'installed journal makes rollback unsafe');
  filesystem.unlinkSync(database.journal);
  database.economicFrozen = true;
  assert.equal(database.hasPendingCheckpoint(), true, 'uncertainty survives journal unlink');
  const frozenTick = seeded.tickN;
  seeded.tick();
  assert.equal(seeded.tickN, frozenTick, 'uncertain checkpoint freezes authority');
  assert.throws(
    () =>
      new Game(assets(), database, { ...platform, automaticClock: true, startClock: undefined }),
    /requires platform.startClock/,
  );
  console.log(
    'Portable game core: explicit clock, full Space ticks, injected seeds, deferred presence/invasion, checkpoint uncertainty and Node adapter passed.',
  );
} finally {
  if (oldSeeds === undefined) delete process.env.SEEDS_FILE;
  else process.env.SEEDS_FILE = oldSeeds;
  filesystem.rmSync(directory, { recursive: true, force: true });
}
