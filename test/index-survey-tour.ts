import { withLegacyMarketWarmup } from './helpers/legacy-market-warmup.ts';
// Farside Index groups tour real bodies and fields, label what they catalogue, and keep
// their drones on a fixed orbit leash while they swing out on scanning passes.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import type { GameAssets } from '../shared/rules.ts';
import { DT } from '../shared/rules.ts';
import { SYS } from '../shared/galaxy.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';

process.env.SEEDS_FILE = '/nonexistent';
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-index-tour-'));
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
// Preserve this fixed movement scenario independently of unrelated market RNG.
const game = withLegacyMarketWarmup(() => new Game(assets, new Database(directory)));
try {
  // A Farside system with no asteroid fields used to leave the group circling empty space.
  const systemId = Object.values(SYS).find(
    (system) =>
      system.farside &&
      !(system.fields || []).length &&
      system.stellars.length >= 2 &&
      !['table', 'quantum-rift', 'beyond-rift', 'founding-vigil', 'glasswake'].includes(system.id),
  )!.id;
  const space = game.spaces[systemId];
  space.players = 1;
  const index = () =>
    [...space.ships.values()].filter((entity) => entity.faction === 'index' && !entity.dead);
  const labels = new Set<string>();
  const leash = new Map<number, { min: number; max: number }>();
  const bodies = SYS[systemId].stellars;
  let visitedBody = false;
  let diverseAssignments = false;
  let investigatedShip = false;
  for (let tick = 0; tick < Math.round(900 / DT); tick++) {
    game.features.mining.advanceClock(DT);
    space.tick();
    if (tick % 15) continue;
    const machines = index();
    const assignments = machines
      .filter((entity) => (entity.indexState?.[1] ?? -1) < 0)
      .map((entity) => String(entity.name).split(' · ')[1]);
    if (new Set(assignments).size > 1) diverseAssignments = true;
    if (assignments.some((label) => label?.includes('ship '))) investigatedShip = true;
    for (const entity of machines) {
      const activity = String(entity.name).split(' · ')[1];
      if (activity) labels.add(activity);
      assert.doesNotMatch(String(entity.name), /neutral survey/, 'labels say what they are doing');
      // indexState carries [slot, parent slot, ...] for the renderer.
      const parentSlot = entity.indexState?.[1] ?? -1;
      const parent =
        parentSlot >= 0
          ? machines.find((candidate) => candidate.indexState?.[0] === parentSlot)
          : undefined;
      if (parent && [914, 915].includes(Number(entity.hull))) {
        const range = Math.hypot(entity.x - parent.x, entity.y - parent.y);
        const record = leash.get(entity.id) || { min: Infinity, max: 0 };
        record.min = Math.min(record.min, range);
        record.max = Math.max(record.max, range);
        leash.set(entity.id, record);
      }
    }
    const parents = machines.filter((entity) => [910, 911].includes(Number(entity.hull)));
    if (parents.length) {
      const centreX = parents.reduce((sum, entity) => sum + entity.x, 0) / parents.length,
        centreY = parents.reduce((sum, entity) => sum + entity.y, 0) / parents.length;
      if (bodies.some((body) => Math.hypot(centreX - body.x, centreY - body.y) < body.r + 1600))
        visitedBody = true;
    }
  }
  assert.ok(diverseAssignments, 'parents receive different simultaneous survey assignments');
  assert.ok(investigatedShip, 'peaceful survey includes passing ships');
  const catalogued = [...labels].filter((label) => label.startsWith('cataloguing '));
  assert.ok(
    catalogued.some((label) => bodies.some((body) => label === 'cataloguing ' + body.name)),
    `the group catalogues a real body: ${[...labels].join(', ')}`,
  );
  assert.ok(
    [...labels].some((label) => label.startsWith('en route to ')),
    'the group travels between stops',
  );
  assert.ok(visitedBody, 'the parent ring actually moves to a world or station');
  assert.ok(
    [...labels].some((label) => label.startsWith('scanning ')),
    'drones fly scanning passes',
  );
  assert.ok(leash.size > 0, 'drones were observed');
  for (const [id, record] of leash) {
    assert.ok(
      record.max < 1300,
      `drone ${id} stays on its parent’s leash (${Math.round(record.max)})`,
    );
    assert.ok(record.max - record.min > 150, `drone ${id} swings out and back while scanning`);
  }
  console.log(JSON.stringify({ ok: true, systemId, labels: [...labels] }));
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
process.exit(0);
