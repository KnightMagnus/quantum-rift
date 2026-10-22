import assert from 'node:assert/strict';
import {
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  w,
} from './helpers/refinery-fixture.js';
import { RECIPES, recovery, outputUnits, refineryFee } from '../shared/refinery-rules.js';
import { purchaseUnit, saleValue } from '../server/trade-pricing.js';
import { STELLARS, COMMODITIES } from '../shared/galaxy.js';
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
    for (const fac of ['quantum', 'korrund', 'ylith', 'thalassi', 'umbral'])
      for (const home of [false, true])
        for (const recipe of RECIPES)
          for (const input of [1, 3, 6, 9, 30]) {
            if (recipe.pure && input % 9) continue;
            const units = outputUnits(input, recovery(fac, home, recipe), recipe.pure);
            for (const residue of [0, 1, 149, 299]) {
              const prices = recipe.inputs.map((cid) => COMMODITIES.find((c) => c.id === cid).base),
                ask = prices.reduce(
                  (s, p) => s + purchaseUnit(p, 1, bonus, home) * (input / prices.length),
                  0,
                ),
                bid =
                  saleValue(recipe.base, lots(1), bonus, home, sell) *
                  Math.ceil((units + residue) / 300),
                fee = refineryFee(bid, ask, 15 * input);
              assert.ok(
                ask + fee >= bid + 1,
                'all recovery/recipe/residue/bonus locked-quote liabilities covered',
              );
            }
          }
// Commodity conversions form a strict forward graph, including the one-way fuel sink.
// Travel changes markets but never introduces a reverse conversion/grade synthesis edge.
const graph = new Map(
  RECIPES.flatMap((r) =>
    r.inputs.map((cid) => [
      cid,
      RECIPES.filter((q) => q.inputs.includes(cid)).map((q) => q.output),
    ]),
  ),
);
graph.set('fuel_cells', ['ship_fuel']);
function walk(node, path = new Set()) {
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
      for (const recipe of RECIPES.filter((r) => !r.pure)) {
        const g = refineryGame(),
          s = refineryPilot(g, `E${bonus}${batchSize}${recipe.id}`),
          port = Object.values(STELLARS).find(
            (p) =>
              p.svc?.includes('O') &&
              p.svc.includes('T') &&
              p.prices?.[recipe.inputs[0]] !== undefined &&
              !p.site,
          );
        s.data.sys = port.system;
        s.data.stellar = port.id;
        s.data.rep[Object.keys(s.data.rep).find((k) => k === 'quantum')] = 100;
        const base = g.features.bonuses.bonus;
        g.features.bonuses.bonus = (d) => ({ ...base(d), tradePct: bonus });
        seed(s.data, {});
        const initial = s.data.credits;
        for (let cycle = 0; cycle < 8; cycle++) {
          g.trade(s, recipe.inputs[0], batchSize);
          assert.equal(s.data.cargo[recipe.inputs[0]], batchSize, 'real production purchase');
          const q = quote(g, s, recipe.id, batchSize);
          command(g, s, { op: 'submit', id: q.id });
          command(g, s, { op: 'claim', recipe: recipe.id });
          const n = s.data.cargo[recipe.output] || 0;
          if (n) g.trade(s, recipe.output, -n);
          assert.ok(
            s.data.credits <= initial,
            `no repeated local buy/refine/claim/sell pump bonus${bonus},batch${batchSize}`,
          );
          const paid = w(g).batches.reduce((n, b) => n + b.quote.units, 0),
            ready = w(g).ready.find((b) => b.cid === recipe.output)?.units || 0;
          assert.ok(ready < 300);
          assert.equal(paid % 300, ready, 'split output fractions conserved after eachcycle');
        }
      }
  console.log('ALL REFINERY ECONOMY / BOOSTED ACTUAL TRADE / REPEATED LOCAL CYCLE TESTS PASSED');
} finally {
  Date.now = realNow;
}
