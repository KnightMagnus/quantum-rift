import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import {
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  refineryWorld,
} from './helpers/refinery-fixture.ts';
import { RECIPES, recovery, outputUnits, refineryFee } from '../shared/refinery-rules.ts';
import { purchaseUnit, saleValue } from '../server/trade-pricing.ts';
import { STELLARS, COMMODITIES } from '../shared/galaxy.ts';
assert.equal(
  refineryFee(324, 3 * 99, 0),
  28,
  'explicit-spread proposal fixture, not displayed production prices',
);
const naive = refineryFee(360, 270, 0),
  actualAsk = 3 * purchaseUnit(90, 1, 40, false),
  actualBid = saleValue(360, lots(1), 40, false, 1.2);
assert.ok(
  actualBid - actualAsk - naive > 0,
  'counterexample: displayed reference-price floor allows profitable boosted trade',
);
for (const bonus of [0, 25, 75])
  for (const sell of [0.8, 1, 1.3])
    for (const faction of ['quantum', 'korrund', 'ylith', 'thalassi', 'umbral'])
      for (const home of [false, true])
        for (const recipe of RECIPES)
          for (const input of [1, 3, 6, 9, 30]) {
            if (recipe.pure && input % 9) continue;
            const units = outputUnits(input, recovery(faction, home, recipe), recipe.pure);
            for (const residue of [0, 1, 149, 299]) {
              const prices = recipe.inputs.map(
                  (commodityId) =>
                    requiredFixtureValue(
                      COMMODITIES.find((commodity) => commodity.id === commodityId),
                    ).base,
                ),
                sellOffer = prices.reduce(
                  (session, player) =>
                    session + purchaseUnit(player, 1, bonus, home) * (input / prices.length),
                  0,
                ),
                buyOffer =
                  saleValue(recipe.base, lots(1), bonus, home, sell) *
                  Math.ceil((units + residue) / 300),
                serviceFee = refineryFee(buyOffer, sellOffer, 15 * input);
              assert.ok(
                sellOffer + serviceFee >= buyOffer + 1,
                'all recovery/recipe/residue/bonus locked-quote liabilities covered',
              );
            }
          }
// Commodity conversions form a strict forward graph, including the one-way fuel sink.
// Travel changes markets but never introduces a reverse conversion/grade synthesis edge.
const graph = new Map(
  RECIPES.flatMap((result) =>
    result.inputs.map((commodityId) => [
      commodityId,
      RECIPES.filter((fixtureState) => fixtureState.inputs.includes(commodityId)).map(
        (fixtureState) => fixtureState.output,
      ),
    ]),
  ),
);
graph.set('fuel_cells', ['ship_fuel']);
function walk(node: string, path = new Set<string>()) {
  assert.ok(!path.has(node), 'no commodity/fuel conversion cycle');
  const next = new Set(path).add(node);
  for (const dest of graph.get(node) || []) walk(dest, next);
}
for (const node of graph.keys()) walk(node);
assert.ok(!graph.has('ship_fuel'));
assert.ok(!graph.has('composite_plating'), 'pure-only compression has no raw/grade reverse edge');
const realNow = Date.now;
Date.now = () => 1800000000000;
try {
  for (const bonus of [0, 25, 75])
    for (const batchSize of [1, 3, 7, 30])
      for (const recipe of RECIPES.filter((result) => !result.pure)) {
        const game = refineryGame(),
          session = refineryPilot(game, `E${bonus}${batchSize}${recipe.id}`),
          port = Object.values(STELLARS).find(
            (stellarBody) =>
              stellarBody.svc?.includes('O') &&
              stellarBody.svc.includes('T') &&
              stellarBody.prices?.[recipe.inputs[0]] !== undefined &&
              !stellarBody.site,
          );
        requiredFixtureValue(session).data.sys = requiredFixtureValue(port).system;
        requiredFixtureValue(session).data.stellar = requiredFixtureValue(port).id;
        requiredFixtureValue(session).data.rep[
          requiredFixtureValue(
            Object.keys(requiredFixtureValue(session).data.rep).find(
              (propertyKey) => propertyKey === 'quantum',
            ),
          )
        ] = 100;
        const base = game.features.bonuses.bonus;
        game.features.bonuses.bonus = (playerData) => ({ ...base(playerData), tradePct: bonus });
        seed(requiredFixtureValue(session).data, {});
        const initial = requiredFixtureValue(session).data.credits;
        for (let cycle = 0; cycle < 8; cycle++) {
          game.trade(session, recipe.inputs[0], batchSize);
          assert.equal(
            requiredFixtureValue(session).data.cargo[recipe.inputs[0]],
            batchSize,
            'real production purchase',
          );
          const refineryQuote = quote(game, session, recipe.id, batchSize);
          command(game, session, { op: 'submit', id: refineryQuote.id });
          command(game, session, { op: 'claim', recipe: recipe.id });
          const quantity = requiredFixtureValue(session).data.cargo[recipe.output] || 0;
          if (quantity) game.trade(session, recipe.output, -quantity);
          assert.ok(
            requiredFixtureValue(session).data.credits <= initial,
            `no repeated local buy/refine/claim/sell pump bonus${bonus},batch${batchSize}`,
          );
          const paid = refineryWorld(game).batches.reduce(
              (quantity3, refineryBatch) => quantity3 + refineryBatch.quote.units,
              0,
            ),
            ready =
              refineryWorld(game).ready.find(
                (secondEntry: { cid: string }) => secondEntry.cid === recipe.output,
              )?.units || 0;
          assert.ok(ready < 300);
          assert.equal(paid % 300, ready, 'split output fractions conserved after eachcycle');
        }
      }
  console.log('ALL REFINERY ECONOMY / BOOSTED ACTUAL TRADE / REPEATED LOCAL CYCLE TESTS PASSED');
} finally {
  Date.now = realNow;
}
