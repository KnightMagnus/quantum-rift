import type { MiningContact, MiningSource } from '../server/mining-contracts.ts';
import { mockSpace } from './helpers/mocks.ts';
import type { Space } from '../server/space.ts';
import type { SavedRockGeneration } from '../server/mining-contracts.ts';
type MiningFixtureSpace = Omit<Space, 'rocks'> & { rocks: SavedRockGeneration[] };
import { requiredFixtureValue } from './helpers/required.ts';
// Natural renewal is a new finite generation, never a reset of an extracted ledger.
import assert from 'node:assert/strict';
import { refineryGame } from './helpers/refinery-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { MINING } from '../shared/mining-rules.ts';
import { Game } from '../server/game.ts';
const fields = ['ore', 'gas', 'shards'].map((oreType, index) => ({
  x: index * 1000,
  y: 0,
  r: 500,
  ore: oreType,
  rich: 2,
  rocks: 12,
}));
function space(game: Game) {
  const message = mockSpace({
    id: 'meridian',
    sys: { fields },
    rocks: [],
    loot: [],
    events: [],
    t: 0,
  }) as MiningFixtureSpace;
  game.features.mining.openSpace(message);
  return message;
}
function advanceTo(game: Game, message: MiningFixtureSpace, time: number) {
  requiredFixtureValue(game.db.world.mining).clock = time;
  game.features.mining.endTick(message);
}
function full(game: Game, message: MiningFixtureSpace, previousState: SavedRockGeneration) {
  const next = requiredFixtureValue(
    message.rocks.find(
      (result: { key: string }) =>
        result.key.split(':').slice(0, 3).join(':') ===
        previousState.key.split(':').slice(0, 3).join(':'),
    ),
  );
  assert.notEqual(next.id, previousState.id);
  assert.equal(next.generation, previousState.generation + 1);
  assert.equal(next.hp, next.max);
  assert.equal(next.stage, 0);
  assert.equal(next.heat, 0);
  assert.equal(next.work, 0);
  assert.equal(next.budget, -1);
  assert.equal(next.down, 0);
  assert.equal(
    requiredFixtureValue(
      game.features.mining.rocksPayload(message).rocks.find((asteroid) => asteroid.id === next.id),
    ).hp,
    100,
  );
  return next;
}
for (const oreType of ['ore', 'gas', 'shards']) {
  const game = refineryGame(),
    message2 = space(game),
    message = game.features.mining;
  const damaged = requiredFixtureValue(
    message2.rocks.find((rockGeneration) => rockGeneration.ore === oreType),
  );
  message.ordinary(message2, damaged, 1);
  advanceTo(game, message2, MINING.idleRenewal - 0.01);
  assert.ok(message2.rocks.includes(damaged), `${oreType}: no early renewal`);
  advanceTo(game, message2, MINING.idleRenewal);
  const renewed = full(game, message2, damaged);
  const hitPoints = renewed.hp;
  message.ordinary(message2, damaged, 1e9);
  message.sweep(message2, damaged, 1e9, 'stale');
  message.contact(message2, damaged, { damage: 1e9 } as MiningContact);
  assert.equal(renewed.hp, hitPoints, 'stale object cannot damage/mint from new generation');
  assert.equal(message2.loot.length, 0, 'abandoned unissued rock pays no reward');
  assert.equal(
    requiredFixtureValue(game.db.world.mining).systems.meridian.history.length,
    0,
    'no unissued history leak',
  );
  const depleted = requiredFixtureValue(
    message2.rocks.find(
      (rockGeneration) => rockGeneration.ore === oreType && rockGeneration !== renewed,
    ),
  );
  while (!requiredFixtureValue(depleted).down) message.ordinary(message2, depleted, 1e9);
  const deadline = requiredFixtureValue(depleted).down;
  assert.ok(deadline > requiredFixtureValue(game.db.world.mining).clock);
  advanceTo(game, message2, deadline - 0.01);
  assert.ok(message2.rocks.includes(depleted));
  advanceTo(game, message2, deadline);
  full(game, message2, depleted);
}
// Active/recent contacts restart the quiet timer, across sweep and cutting paths.
{
  const game = refineryGame(),
    message = space(game),
    message3 = game.features.mining;
  const rockGeneration = requiredFixtureValue(
    message.rocks.find((rockGeneration2) => rockGeneration2.stages === 1),
  );
  message3.sweep(message, rockGeneration, 1, 'worker');
  advanceTo(game, message, 299);
  message3.contact(message, rockGeneration, {
    damage: 0,
    x: requiredFixtureValue(rockGeneration).x + requiredFixtureValue(rockGeneration).r,
    y: requiredFixtureValue(rockGeneration).y,
    projectile: true,
    source: { contactId: 'active', captain: null, cadence: 1 } as MiningSource,
  });
  advanceTo(game, message, 300);
  assert.ok(message.rocks.includes(rockGeneration), 'active cutting not reset at old deadline');
  advanceTo(game, message, 598.99);
  assert.ok(message.rocks.includes(rockGeneration));
  advanceTo(game, message, 599);
  full(game, message, rockGeneration);
}
// Quiet-space late settlement emits original parcels, preserves original budget, then renews.
{
  const game = refineryGame(),
    message = space(game),
    message2 = game.features.mining;
  const rockGeneration = requiredFixtureValue(
    message.rocks.find((rockGeneration2) => rockGeneration2.stages > 1),
  );
  message2.contact(message, rockGeneration, {
    damage: 1e6,
    x: requiredFixtureValue(rockGeneration).x + requiredFixtureValue(rockGeneration).r,
    y: requiredFixtureValue(rockGeneration).y,
    projectile: true,
    source: { contactId: 'ready', captain: null, cadence: 1 } as MiningSource,
  });
  advanceTo(game, message, 1); // Contact establishes the release deadline; next observation is lazy.
  advanceTo(game, message, MINING.idleRenewal);
  full(game, message, rockGeneration);
  const feature = requiredFixtureValue(game.db.world.mining).systems.meridian;
  assert.ok(feature.history.includes(rockGeneration));
  const parcels = feature.parcels.filter(
    (player) => player.it.generationKey === requiredFixtureValue(rockGeneration).key,
  );
  assert.ok(parcels.length);
  assert.equal(requiredFixtureValue(rockGeneration).pending, 0);
  const floating = parcels.reduce(
    (quantity, message4) =>
      quantity +
      Object.values(message4.it.remainingLots).reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      ),
    0,
  );
  assert.equal(
    requiredFixtureValue(rockGeneration).accepted +
      floating +
      requiredFixtureValue(rockGeneration).expired +
      requiredFixtureValue(rockGeneration).discarded,
    requiredFixtureValue(rockGeneration).budget,
  );
  const nextId = requiredFixtureValue(game.db.world.mining).nextId;
  message2.endTick(message);
  assert.equal(
    requiredFixtureValue(game.db.world.mining).nextId,
    nextId,
    'no repeat issuance in same tick',
  );
  game.db.flush();
  const reopened = refineryGame(new Database(game.db.dir));
  assert.equal(
    requiredFixtureValue(reopened.db.world.mining).systems.meridian.history[0].id,
    requiredFixtureValue(rockGeneration).id,
    'ledger validates on restart',
  );
  advanceTo(game, message, MINING.idleRenewal + MINING.parcelTTL);
  assert.ok(!feature.history.includes(rockGeneration), 'settled history remains bounded');
}
// Persisted idle deadline survives restart; no offline/paused catchup or repeated lazy generations.
{
  const game = refineryGame(),
    message = space(game),
    message2 = game.features.mining,
    rockGeneration = message.rocks[0];
  message2.ordinary(message, rockGeneration, 1);
  advanceTo(game, message, 200);
  game.paused = true;
  message2.advanceClock(1);
  assert.equal(requiredFixtureValue(game.db.world.mining).clock, 200);
  game.db.flush();
  const reopened = refineryGame(new Database(game.db.dir)),
    wake = space(reopened);
  assert.equal(requiredFixtureValue(reopened.db.world.mining).clock, 200);
  assert.equal(wake.rocks[0].id, rockGeneration.id);
  advanceTo(reopened, wake, 300);
  const next = full(reopened, wake, rockGeneration);
  advanceTo(reopened, wake, 1e6);
  assert.equal(wake.rocks[0].id, next.id, 'healthy deposits are not needlessly churned');
}
// Older version-1 saves gain a conservative deadline without reminting on load.
{
  const game = refineryGame(),
    message = space(game),
    rockGeneration = message.rocks[0];
  game.features.mining.ordinary(message, rockGeneration, 1);
  advanceTo(game, message, 400);
  const current = message.rocks[0];
  game.features.mining.ordinary(message, current, 1);
  delete current.lastActivity;
  game.db.flush();
  const reopened = refineryGame(new Database(game.db.dir)),
    wake = space(reopened);
  assert.equal(wake.rocks[0].id, current.id);
  advanceTo(reopened, wake, 699.99);
  assert.equal(wake.rocks[0].id, current.id);
  advanceTo(reopened, wake, 700);
  full(reopened, wake, current);
}
console.log(
  'All ore/gas/shard full-health renewal boundaries, active-work protection, stale identities, exact old escrow, bounded history, restart/legacy/pause and lazy wake passed.',
);
