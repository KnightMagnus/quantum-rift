// Covers settlement arithmetic and cash-flow reporting.
import assert from 'node:assert/strict';
import { tradePreview } from '../shared/economy-preview.ts';
import {
  recordEconomy,
  beginEconomyTrip,
  arriveEconomyTrip,
  economyReceipt,
} from '../shared/economy-receipt.ts';
import { analyseSessions, CAREERS, BANDS, RISKS } from '../tools/economy-baseline.mjs';
import {
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  w,
} from './helpers/refinery-fixture.js';
import { DB } from '../server/db.ts';

const account = {};
assert.equal(economyReceipt(account), null, 'Old saves are read without adding invented history');
recordEconomy(account, 'a', 'purchases', 120);
recordEconomy(account, 'a', 'serviceFees', 30);
beginEconomyTrip(account, 'a', 1000);
arriveEconomyTrip(account, 'b', 2000);
recordEconomy(account, 'b', 'sales', 200);
recordEconomy(account, 'b', 'purchases', 80);
assert.equal(
  economyReceipt(account).net,
  50,
  'Supplies for the next trip do not rewrite the previous recap',
);
assert.equal(economyReceipt(account).purchases, 120);
const restored = JSON.parse(JSON.stringify(account));
assert.deepEqual(
  economyReceipt(restored),
  economyReceipt(account),
  'Receipt survives saved-account reload',
);
beginEconomyTrip(restored, 'b', 3000);
assert.equal(economyReceipt(restored).purchases, 80);
assert.equal(economyReceipt(restored).sales, 0);
const cancelledPrep = {};
recordEconomy(cancelledPrep, 'a', 'serviceFees', 100);
recordEconomy(cancelledPrep, 'a', 'refunds', 90);
beginEconomyTrip(cancelledPrep, 'a', 1000);
assert.equal(
  economyReceipt(cancelledPrep).net,
  -10,
  'Pre-departure cancellation retains only its actual handling cost',
);

const realNow = Date.now;
Date.now = () => 1800000000000;
try {
  const g = refineryGame(),
    s = refineryPilot(g);
  seed(s.data, { ore: lots(10, 5, 2) });
  const market = g
    .market((await import('../shared/galaxy.ts')).STELLARS[s.data.stellar])
    .find((c) => c.id === 'ore');
  const options = {
    market,
    amount: 10,
    cargo: s.data.cargo,
    cargoLots: s.data.cargoLots,
    credits: s.data.credits,
    freeHold: g.features.shipStats.stats(s.data).cargo - g.holdUsed(s.data),
    tradePct: g.features.bonuses.bonus(s.data).tradePct || 0,
    sell: g.features.fronts.mods(s.data.sys).sell,
  };
  const originalMarket = g.market;
  const beforeMarketOverride = structuredClone({
    credits: s.data.credits,
    cargo: s.data.cargo,
    lots: s.data.cargoLots,
  });
  let marketReads = 0;
  g.market = function () {
    assert.equal(this, g, 'port forwarding retains the Game receiver');
    marketReads++;
    return null;
  };
  g.trade(s, 'ore', 1);
  assert.equal(marketReads, 1, 'trade uses the current market provider, not a captured method');
  assert.deepEqual(
    { credits: s.data.credits, cargo: s.data.cargo, lots: s.data.cargoLots },
    beforeMarketOverride,
  );
  g.market = originalMarket;
  const preview = tradePreview(options),
    beforeBuy = s.data.credits;
  g.trade(s, 'ore', preview.buy.tonnes);
  assert.equal(
    beforeBuy - s.data.credits,
    preview.buy.total,
    'Preview matches actual server bulk purchase settlement',
  );
  const sellPreview = tradePreview({
    ...options,
    market: g
      .market((await import('../shared/galaxy.ts')).STELLARS[s.data.stellar])
      .find((c) => c.id === 'ore'),
    cargo: s.data.cargo,
    cargoLots: s.data.cargoLots,
  });
  const beforeSell = s.data.credits;
  g.trade(s, 'ore', -10);
  assert.equal(
    s.data.credits - beforeSell,
    sellPreview.sale.total,
    'Preview matches actual grade-aware sale settlement',
  );
  assert.equal(tradePreview({ ...options, amount: 1.5 }).valid, false);
  assert.equal(tradePreview({ ...options, freeHold: 0 }).buy.tonnes, 0);
  assert.equal(tradePreview({ ...options, credits: 0 }).buy.tonnes, 0);
  const warnings = tradePreview({
    ...options,
    amount: 17,
    orders: [{ cid: 'ore', grade: 'pure', qty: 2 }],
  }).warnings;
  assert.ok(warnings.some((s) => s.includes('higher-grade')));
  assert.ok(warnings.some((s) => s.includes('delivery')));

  seed(s.data, { ore: lots(20) });
  const legacy = quote(g, s);
  let last;
  for (let i = 1; i <= 12; i++) {
    command(g, s, { op: 'preview', recipe: 'alloy', n: i, grade: 'common', mode: 'instant' });
    last = s.sock.out.filter((m) => m.t === 'refineryQuote').at(-1).quote;
  }
  assert.equal(
    w(g).quotes.filter((q) => q.preview).length,
    1,
    'Normal edits cannot exhaust the active cost-preview limit',
  );
  assert.ok(
    w(g).quotes.some((q) => q.id === legacy.id),
    'Existing explicit binding quotes are not invalidated by UI previews',
  );
  const credits = s.data.credits;
  command(g, s, { op: 'submit', id: last.id });
  assert.equal(credits - s.data.credits, last.fee);
  const settled = JSON.stringify(s.data);
  command(g, s, { op: 'submit', id: last.id });
  assert.equal(
    JSON.stringify(s.data),
    settled,
    'Repeated Start cannot debit cargo, credits or receipt twice',
  );
  const persisted = new DB(g.db.dir);
  assert.deepEqual(
    persisted.get(s.data.name).economyReceipt,
    s.data.economyReceipt,
    'Refining and recap settle durably together',
  );
  seed(s.data, { ore: lots(0, 0, 3), gas: lots(0, 0, 3), shards: lots(0, 0, 2) });
  const incomplete = quote(g, s, 'plating', 3, 'pure'),
    unchanged = JSON.stringify(s.data);
  command(g, s, { op: 'submit', id: incomplete.id });
  assert.equal(
    JSON.stringify(s.data),
    unchanged,
    'Third-input failure does not change either credits, cargo or the recap',
  );
  seed(s.data, { ore: lots(5) });
  const expiring = quote(g, s),
    unchangedExpired = JSON.stringify(s.data);
  Date.now = () => 1800000031000;
  command(g, s, { op: 'submit', id: expiring.id });
  assert.equal(JSON.stringify(s.data), unchangedExpired, 'Expired cost cannot spend anything');
} finally {
  Date.now = realNow;
}

// Synthetic arithmetic fixtures test the report only; they are NOT measured game sessions.
const observations = [];
for (const band of BANDS)
  for (const risk of RISKS)
    for (const career of CAREERS)
      observations.push({
        id: `${band}:${risk}:${career}`,
        profile: 'standard',
        band,
        risk,
        career,
        seed: 42,
        durationSeconds: 1800,
        activeSeconds: 1200,
        openingCredits: 1000,
        closingCredits: 1600,
        externalCredits: 100,
        externalDebits: 0,
        capitalCredits: 45000,
        holdRequired: 70,
        lossesCredits: 50,
        nextUpgradeCost: 3000,
        closedLoop: true,
        unmeasuredCosts: [],
        notes: [],
      });
const report = analyseSessions(observations);
assert.equal(report.complete, true);
assert.equal(
  report.rows[0].netCredits,
  500,
  'External transfers excluded and losses not subtracted twice',
);
assert.equal(report.rows[0].netPerActiveMinute, 25);
assert.equal(report.rows[0].idleMinutes, 10);
assert.throws(() => analyseSessions(observations.slice(1)), /Missing/);
assert.equal(analyseSessions(observations.slice(1), { allowPartial: true }).complete, false);
assert.throws(() => analyseSessions([...observations, observations[0]]), /unique/);
const stress = structuredClone(observations);
stress[0].profile = 'stress-only';
assert.throws(
  () => analyseSessions(stress),
  /Missing/,
  'KNIGHT-style test wealth does not fill ordinary baseline cells',
);
console.log(
  '3.2 settlement previews, trip recap conservation/persistence, refinery preview/atomic denial and measurement report invariants passed.',
);
