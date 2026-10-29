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

// Early repayment stays free and convenient, but cannot manufacture payment history.
const syndicate = game.features.syndicate;
captain.data.stellar = 'qstation';
const openingRating = captain.data.credit;
const openingCredits = captain.data.credits;
for (let cycle = 0; cycle < 20; cycle++) {
  syndicate.bankOp(captain, { op: 'borrow', amt: 1000 });
  assert.equal(captain.data.loan?.bal, 1000);
  syndicate.bankOp(captain, { op: 'pay', amt: 400 });
  assert.equal(captain.data.loan?.bal, 600);
  syndicate.bankOp(captain, { op: 'pay', amt: 600 });
  assert.equal(captain.data.loan, null);
}
assert.equal(captain.data.credit, openingRating);
assert.equal(captain.data.credits, openingCredits);
syndicate.bankOp(captain, { op: 'borrow', amt: 10000 });
assert.ok(captain.data.loan);
captain.data.loan.next = 0;
syndicate.bankTick(captain);
assert.ok(captain.data.credit > openingRating, 'a real scheduled payment builds credit history');
syndicate.bankOp(captain, { op: 'pay', amt: captain.data.loan?.bal || 0 });
assert.equal(captain.data.loan, null);
console.log(
  'Bank history: instant cycles denied rating, partial/early repayment and scheduled history passed.',
);
