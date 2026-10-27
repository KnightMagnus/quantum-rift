import assert from 'node:assert/strict';
import { purchaseValue, saleValue, realizedTradeProfit } from '../shared/trade-pricing.ts';
import { TRADE_IMPACT } from '../shared/living.ts';
import { COMMODITIES, STELLARS } from '../shared/galaxy.ts';
import {
  addLots,
  applyTake,
  planTake,
  moveLots,
  clearLots,
  migrateCargoLots,
} from '../shared/cargo-lots.ts';
import type { CargoLedger } from '../shared/cargo-contracts.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { validateFeaturePlayerSave } from '../server/save-validation.ts';
import { tradePreview } from '../shared/economy-preview.ts';
const clamp = (value: number) => Math.max(-TRADE_IMPACT.max, Math.min(TRADE_IMPACT.max, value));
const lots = (common: number) => ({ common, rich: 0, pure: 0 });
for (const commodity of COMMODITIES)
  for (const site of [false, true])
    for (const bonus of [0, 1, 3, 7, 25, 75, 1000])
      for (const sell of [0.8, 1, 1.15, 1.3])
        for (const impact of [-0.4, -0.39, 0, 0.39, 0.4])
          for (const quantity of [1, 10, 500]) {
            const debit = purchaseValue(commodity.base, quantity, bonus, site, sell, impact);
            const after = site ? 0 : clamp(impact - quantity * TRADE_IMPACT.perTon);
            const credit = saleValue(commodity.base, lots(quantity), bonus, site, sell, after);
            assert.ok(credit < debit, `${commodity.id}: immediate reverse cannot profit`);
            let state = impact,
              splitDebit = 0,
              splitCredit = 0;
            for (let count = 0; count < quantity; count++) {
              splitDebit += purchaseValue(commodity.base, 1, bonus, site, sell, state);
              if (!site) state = clamp(state - TRADE_IMPACT.perTon);
            }
            for (let count = 0; count < quantity; count++) {
              splitCredit += saleValue(commodity.base, lots(1), bonus, site, sell, state);
              if (!site) state = clamp(state + TRADE_IMPACT.perTon);
            }
            assert.ok(
              splitCredit < splitDebit,
              'Shared-state split orders, including alternate captains, cannot profit',
            );
          }
assert.ok(
  saleValue(200, lots(10), 0, false, 1) > purchaseValue(100, 10, 0, false),
  'Inter-port route remains profitable',
);
assert.ok(
  purchaseValue(1000, 10, 7, false) < purchaseValue(1000, 10, 0, false),
  'Trade skill remains useful',
);
assert.ok(
  saleValue(1000, { common: 0, rich: 0, pure: 10 }, 0, false, 1) >
    saleValue(1000, lots(10), 0, false, 1),
  'Premium mined cargo retains its value',
);
const cargo = {},
  ledger: CargoLedger = { version: 1, byCommodity: {} };
addLots(cargo, ledger, { cid: 'ore', qty: 10, grades: lots(10), basis: lots(1000) });
addLots(cargo, ledger, { cid: 'ore', qty: 10, grades: lots(10) });
addLots(cargo, ledger, { cid: 'ore', qty: 5, grades: { common: 0, rich: 0, pure: 5 } });
const take = planTake(cargo, ledger, 'ore', 5);
assert.equal(take.basis!.common, 250, 'Acquired common cargo mixes at weighted-average cost');
applyTake(cargo, ledger, take);
const storage = {},
  storageLedger: CargoLedger = { version: 1, byCommodity: {} };
moveLots(cargo, ledger, storage, storageLedger, 'ore', 5);
assert.equal(storageLedger.basis!.ore.common, 250, 'Storage carries proportional basis');
const premium = planTake(cargo, ledger, 'ore', 5, { common: 0, rich: 0, pure: 5 });
assert.equal(premium.basis!.pure, 0, 'Mined premium is not charged common acquisition cost');
clearLots(cargo, ledger);
assert.deepEqual(ledger.basis, {}, 'Lost cargo does not charge future unrelated cargo');
const legacy = {
  cargo: { ore: 10 },
  cargoLots: { version: 1 as const, byCommodity: { ore: lots(10) } },
  paid: { ore: 17 },
};
migrateCargoLots(legacy);
assert.equal(
  (legacy.cargoLots as CargoLedger).basis!.ore.common,
  170,
  'Legacy held common cargo seeds historical average without changing balances',
);
migrateCargoLots(legacy);
assert.equal(
  (legacy.cargoLots as CargoLedger).basis!.ore.common,
  170,
  'Legacy seeding is idempotent',
);
const realNow = Date.now;
let currentTime = 1800000000000;
Date.now = () => currentTime;
try {
  const game = refineryGame(),
    session = refineryPilot(game, 'TradeSafety');
  session.data.stellar = 'qstation';
  session.data.sys = STELLARS.qstation.system;
  session.data.credits = 1e8;
  game.onMessage(session, { t: 'lower', i: 0, op: 'hire', kind: 'fixer' });
  assert.equal(
    game.features.bonuses.bonus(session.data).tradePct,
    1,
    'Fresh Fixer hired through production dispatch',
  );
  game.features.fronts.goalsFor(session.data);
  session.data.goals!.daily = [{ type: 'trade', n: 10000000, got: 0, claimed: false }];
  const earned = session.data.stats.earned;
  const market = game.market(STELLARS.qstation)!.find((item) => item.id === 'ore')!;
  const preview = tradePreview({
    market,
    amount: 10,
    cargo: session.data.cargo,
    cargoLots: session.data.cargoLots,
    credits: session.data.credits,
    freeHold: 500,
    tradePct: 1,
  });
  const before = session.data.credits;
  game.onMessage(session, { t: 'trade', cid: 'ore', qty: 10 });
  assert.equal(before - session.data.credits, preview.buy!.total);
  const basis = session.data.cargoLots.basis!.ore.common;
  assert.equal(basis, preview.buy!.total);
  const saleMarket = game.market(STELLARS.qstation)!.find((item) => item.id === 'ore')!;
  const salePreview = tradePreview({
    market: saleMarket,
    amount: 5,
    cargo: session.data.cargo,
    cargoLots: session.data.cargoLots,
    credits: session.data.credits,
    freeHold: 500,
    tradePct: 1,
  });
  const beforeSale = session.data.credits;
  game.trade(session, 'ore', -5);
  assert.equal(
    session.data.credits - beforeSale,
    salePreview.sale!.total,
    'Impacted sale preview matches production settlement',
  );
  assert.equal(
    session.data.stats.earned,
    earned,
    'Loss-making partial resale earns no recycled-volume credit',
  );
  assert.equal(session.data.cargoLots.basis!.ore.common, basis - Math.floor(basis / 2));
  game.trade(session, 'ore', -5);
  assert.equal(session.data.stats.earned, earned);
  assert.equal(session.data.goals!.daily![0].got, 0, 'Losing sales do not advance profit goals');
  clearLots(session.data.cargo, session.data.cargoLots);
  const routes = Object.values(STELLARS)
    .filter((port) => !port.site)
    .flatMap((port) => {
      const market = game.market(port)?.find((item) => item.id === 'ore');
      if (!market || market.price === null) return [];
      const reference = market.quoteBase ?? market.price;
      const sell = game.features.fronts.mods(port.system).sell;
      return [
        {
          port,
          ask: purchaseValue(reference, 10, 1, false, sell, market.impact ?? 0),
          bid: saleValue(reference, lots(5), 1, false, sell, market.impact ?? 0),
        },
      ];
    });
  const source = [...routes].sort((left, right) => left.ask - right.ask)[0];
  const destination = [...routes].sort((left, right) => right.bid - left.bid)[0];
  session.data.sys = source.port.system;
  session.data.stellar = source.port.id;
  game.trade(session, 'ore', 10);
  const routeBasis = session.data.cargoLots.basis!.ore.common;
  session.data.sys = destination.port.system;
  session.data.stellar = destination.port.id;
  const priorLoss = session.data.tradeLoss || 0;
  const routeBefore = session.data.credits;
  game.trade(session, 'ore', -5);
  const profit = session.data.credits - routeBefore - Math.floor(routeBasis / 2);
  assert.ok(profit > 0, 'Implemented inter-port route has positive realized partial-sale margin');
  assert.equal(session.data.stats.earned - earned, Math.max(0, profit - priorLoss));
  assert.equal(
    session.data.goals!.daily![0].got,
    Math.max(0, profit - priorLoss),
    'Partial sale goal advances by proportional realized profit',
  );
  // Decay cannot improve an immediate purchase reversal: a raised price relaxes down.
  const bought = purchaseValue(1000, 100, 7, false, 1, 0);
  const decayed = -100 * TRADE_IMPACT.perTon * 0.5;
  assert.ok(saleValue(1000, lots(100), 7, false, 1, decayed) < bought);
  const finite = tradePreview({
    market: { id: 'composite_plating', price: 2400, sellCap: 2 },
    amount: 10,
    cargo: { composite_plating: 10 },
    cargoLots: { version: 1, byCommodity: {} },
    credits: 10000,
    freeHold: 10,
  });
  assert.equal(finite.sale!.tonnes, 2, 'Preview honors finite plating buyer demand');
  for (const port of [STELLARS.qstation, Object.values(STELLARS).find((port) => port.site)!]) {
    if (port.site) {
      session.data.station.site = port.id;
      session.data.station.ops = 1;
      game.db.world.sites[port.id] = game.db.key(session.data.name);
    }
    const other = refineryPilot(game, port.site ? 'StationGuest' : 'OtherTrader');
    for (const trader of [session, other]) {
      trader.data.sys = port.system;
      trader.data.stellar = port.id;
      clearLots(trader.data.cargo, trader.data.cargoLots);
    }
    const before = session.data.credits + other.data.credits;
    for (let round = 0; round < 20; round++) {
      currentTime += 1000;
      game.onMessage(session, { t: 'trade', cid: 'exotic_matter', qty: 10 });
      const acquired = session.data.cargo.exotic_matter || 0;
      assert.equal(acquired, 10, `${port.id} round ${round}`);
      moveLots(
        session.data.cargo,
        session.data.cargoLots,
        other.data.cargo,
        other.data.cargoLots,
        'exotic_matter',
        acquired,
      );
      game.onMessage(other, { t: 'trade', cid: 'exotic_matter', qty: -4 });
      game.onMessage(other, { t: 'trade', cid: 'exotic_matter', qty: -6 });
    }
    assert.ok(
      session.data.credits + other.data.credits < before,
      'Alternating captains and partial fills cannot recycle credits at ordinary/guest station markets',
    );
  }
  // One realized high-price tranche may set a first high-water mark. Repeating
  // the whole loss-making loop cannot repeatedly award that tranche as new income.
  const cycle = refineryPilot(game, 'SplitCycle');
  cycle.data.sys = STELLARS.qstation.system;
  cycle.data.stellar = 'qstation';
  cycle.data.lower = ['fixer'];
  game.db.world.tradeImpact = {};
  game.features.fronts.goalsFor(cycle.data);
  cycle.data.goals!.daily = [{ type: 'trade', n: 10000000, got: 0, claimed: false }];
  let firstIncome = 0,
    firstGoal = 0;
  for (let round = 0; round < 40; round++) {
    if (round === 20)
      game.db.world.tradeImpact = { qstation: { exotic_matter: { v: -0.4, t: Date.now() } } };
    game.trade(cycle, 'exotic_matter', 100);
    game.trade(cycle, 'exotic_matter', -50);
    game.trade(cycle, 'exotic_matter', -50);
    if (round === 0) {
      firstIncome = cycle.data.stats.earned;
      firstGoal = cycle.data.goals!.daily![0].got;
    } else
      assert.equal(
        cycle.data.stats.earned,
        firstIncome,
        'Repeated bulk/partial local cycles do not farm earned income',
      );
    assert.equal(
      cycle.data.goals!.daily![0].got,
      firstGoal,
      'Normal and saturated repeated bulk/split cycles do not farm goal progress',
    );
  }
  assert.ok((cycle.data.tradeLoss || 0) > 0);
  assert.ok(Number.isSafeInteger(cycle.data.tradeLoss));
  const restored = JSON.parse(JSON.stringify(cycle.data));
  validateFeaturePlayerSave(restored);
  assert.equal(
    restored.tradeLoss,
    cycle.data.tradeLoss,
    'Realized loss carry survives save serialization',
  );
  for (const invalid of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validateFeaturePlayerSave({ ...restored, tradeLoss: invalid }));
  const carry = { tradeLoss: 50 };
  assert.equal(
    realizedTradeProfit(carry, 100, 25),
    25,
    'Future margin first offsets only realized loss',
  );
  assert.equal(carry.tradeLoss, 0);
  const beforeRefund = session.data.stats.earned;
  game.features.frontier.pay(session.data.name, 100, 0);
  assert.equal(
    session.data.stats.earned,
    beforeRefund,
    'Returned exchange principal does not count as income',
  );
} finally {
  Date.now = realNow;
}
console.log(
  'Trade safety: commodity/spread/impact/saturation/split-order matrix, useful routes/bonuses/grades, proportional cost and production settlement passed.',
);
