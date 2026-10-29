import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import { COMMODITIES } from '../shared/galaxy.ts';
import { HailOperations } from '../server/hail.ts';

const game = refineryGame();
const captain = refineryPilot(game, 'Gameplay safety');
for (const cargo of [{}, { food: 5 }, { equipment: 10 }]) {
  for (const hull of [703, 708, 716]) {
    const player = mockPlayerData({ ship: { ...captain.data.ship, hull }, cargo });
    const expected = Math.max(
      800,
      Math.round(
        (game.A.ships[hull].cost * 0.02 +
          Object.entries(cargo).reduce(
            (total, [id, quantity]) =>
              total + (quantity || 0) * COMMODITIES.find((item) => item.id === id)!.base,
            0,
          ) *
            0.4) /
          100,
      ) * 100,
    );
    assert.equal(HailOperations.bribeCost.call(game, player), expected);
  }
}
assert.equal(
  HailOperations.bribeCost.call(
    game,
    mockPlayerData({ ship: { ...captain.data.ship, hull: 703 }, cargo: {} }),
  ),
  800,
);
console.log('Pirate toll: minimum, cargo valuation and hundred-credit rounding passed.');
