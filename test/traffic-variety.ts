import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { pickVariedHull } from '../shared/traffic-variety.ts';

// The picker favours hulls that are not already flying, independent of which hulls a pool lists.
{
  const pool = [703, 704, 706, 712, 714];
  const counts = new Map<number, number>();
  for (let index = 0; index < 1000; index++) {
    const hull = pickVariedHull(pool, (candidate) => (candidate <= 706 ? 3 : 0), index / 1000)!;
    counts.set(hull, (counts.get(hull) || 0) + 1);
  }
  const crowded = (counts.get(703) || 0) + (counts.get(704) || 0) + (counts.get(706) || 0);
  assert.ok(crowded > 0, 'crowded hulls stay possible');
  assert.ok(crowded < 100, `crowded hulls become rare (${crowded}/1000)`);
  assert.equal(
    pickVariedHull([], () => 0),
    undefined,
    'an empty pool picks nothing',
  );
  assert.equal(
    pickVariedHull([801], () => 50),
    801,
    'a single-hull pool still spawns',
  );
  // An ID listed twice keeps its authored double weight when nothing is flying.
  let doubled = 0;
  for (let index = 0; index < 900; index++)
    if (pickVariedHull([1, 2, 2], () => 0, index / 900) === 2) doubled++;
  assert.equal(doubled, 600);
}

// Live traffic: the first three hulls no longer dominate Rift or Sol traffic.
const root = path.resolve('.artifacts/traffic-variety');
filesystem.mkdirSync(root, { recursive: true });
const directory = filesystem.mkdtempSync(path.join(root, 'run-'));
try {
  const db = new DB(directory);
  const game = new Game(JSON.parse(filesystem.readFileSync('shared/assets.json', 'utf8')), db);
  const starters = new Set([703, 704, 706]);
  /** Deterministic source so both traffic comparisons see the same rolls. */
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const originalRandom = Math.random;
  /** Spawn 60 waves of six groups and report the hull mix. */
  const sample = (system: string, uniform: boolean) => {
    Math.random = seeded(7);
    const space = game.spaces[system];
    const originalNext = space.random.next;
    space.random.next = seeded(7);
    space.recentTrafficHulls = [];
    const varied = space.pickTrafficHull.bind(space);
    if (uniform)
      space.pickTrafficHull = (pool) => pool[Math.floor(space.random.next() * pool.length)];
    const seen = new Map<number, number>();
    for (let wave = 0; wave < 60; wave++) {
      for (const entity of space.ships.values()) if (!entity.player) space.remove(entity);
      for (let spawn = 0; spawn < 6; spawn++) space.spawnTraffic(true);
      for (const entity of space.ships.values())
        if (!entity.player && typeof entity.hull === 'number')
          seen.set(entity.hull, (seen.get(entity.hull) || 0) + 1);
    }
    space.pickTrafficHull = varied;
    space.random.next = originalNext;
    Math.random = originalRandom;
    const total = [...seen.values()].reduce((sum, count) => sum + count, 0);
    const starterCount = [...seen.entries()]
      .filter(([hull]) => starters.has(hull))
      .reduce((sum, [, count]) => sum + count, 0);
    return { total, kinds: seen.size, starterShare: starterCount / total };
  };
  // Rift (Quantum) and spacer systems share the starter hulls with most other pools.
  for (const system of ['qgate', 'waystation']) {
    const before = sample(system, true);
    const after = sample(system, false);
    assert.ok(after.total > 100, `${system} spawned traffic`);
    assert.ok(after.kinds >= before.kinds - 1, `${system} keeps its hull range`);
    assert.ok(
      after.starterShare < before.starterShare - 0.03,
      `${system} starter-hull share ${before.starterShare.toFixed(2)} -> ${after.starterShare.toFixed(2)}`,
    );
  }
  const sol = sample('mw-sol', false);
  assert.ok(sol.total > 100 && sol.kinds >= 6, 'Sol traffic spans several hulls');
  console.log('Traffic variety: weighted hull picks spread Rift, frontier and Sol traffic passed');
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
process.exit(0);
