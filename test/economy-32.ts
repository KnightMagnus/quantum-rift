import { requiredFixtureValue } from './helpers/required.ts';
// Covers settlement arithmetic and cash-flow reporting.
import assert from 'node:assert/strict';
import { tradePreview } from '../shared/economy-preview.ts';
import {
  recordEconomy,
  beginEconomyTrip,
  arriveEconomyTrip,
  economyReceipt,
} from '../shared/economy-receipt.ts';
import { analyseSessions, CAREERS, BANDS, RISKS } from '../tools/economy-baseline.ts';
import {
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  refineryWorld,
} from './helpers/refinery-fixture.ts';
import { DB as Database } from '../server/db.ts';

const account = {};
assert.equal(economyReceipt(account), null, 'Old saves are read without adding invented history');
recordEconomy(account, 'a', 'purchases', 120);
recordEconomy(account, 'a', 'serviceFees', 30);
beginEconomyTrip(account, 'a', 1000);
arriveEconomyTrip(account, 'b', 2000);
recordEconomy(account, 'b', 'sales', 200);
recordEconomy(account, 'b', 'purchases', 80);
assert.equal(
  requiredFixtureValue(economyReceipt(account)).net,
  50,
  'Supplies for the next trip do not rewrite the previous recap',
);
assert.equal(requiredFixtureValue(economyReceipt(account)).purchases, 120);
const restored = JSON.parse(JSON.stringify(account));
assert.deepEqual(
  economyReceipt(restored),
  economyReceipt(account),
  'Receipt survives saved-account reload',
);
beginEconomyTrip(restored, 'b', 3000);
assert.equal(requiredFixtureValue(economyReceipt(restored)).purchases, 80);
assert.equal(requiredFixtureValue(economyReceipt(restored)).sales, 0);
const cancelledPrep = {};
recordEconomy(cancelledPrep, 'a', 'serviceFees', 100);
recordEconomy(cancelledPrep, 'a', 'refunds', 90);
beginEconomyTrip(cancelledPrep, 'a', 1000);
assert.equal(
  requiredFixtureValue(economyReceipt(cancelledPrep)).net,
  -10,
  'Pre-departure cancellation retains only its actual handling cost',
);

const realNow = Date.now;
Date.now = () => 1800000000000;
try {
  const game = refineryGame(),
    session = refineryPilot(game);
  seed(requiredFixtureValue(session).data, { ore: lots(10, 5, 2) });
  const market = requiredFixtureValue(
    game.market(
      (await import('../shared/galaxy.ts')).STELLARS[requiredFixtureValue(session.data.stellar)],
    ),
  ).find((captain) => captain.id === 'ore')!;
  const options = {
    market,
    amount: 10,
    cargo: requiredFixtureValue(session).data.cargo,
    cargoLots: requiredFixtureValue(session).data.cargoLots,
    credits: requiredFixtureValue(session).data.credits,
    freeHold:
      requiredFixtureValue(game.features.shipStats.stats(session.data)).cargo -
      game.holdUsed(requiredFixtureValue(session).data),
    tradePct: game.features.bonuses.bonus(requiredFixtureValue(session).data).tradePct || 0,
    sell: game.features.fronts.mods(requiredFixtureValue(session).data.sys).sell,
  };
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  const originalMarket = game.market;
  const beforeMarketOverride = structuredClone({
    credits: requiredFixtureValue(session).data.credits,
    cargo: requiredFixtureValue(session).data.cargo,
    lots: requiredFixtureValue(session).data.cargoLots,
  });
  let marketReads = 0;
  game.market = function () {
    assert.equal(this, game, 'port forwarding retains the Game receiver');
    marketReads++;
    return null;
  };
  game.trade(session, 'ore', 1);
  assert.equal(marketReads, 1, 'trade uses the current market provider, not a captured method');
  assert.deepEqual(
    {
      credits: requiredFixtureValue(session).data.credits,
      cargo: requiredFixtureValue(session).data.cargo,
      lots: requiredFixtureValue(session).data.cargoLots,
    },
    beforeMarketOverride,
  );
  game.market = originalMarket;
  const preview = tradePreview(options),
    beforeBuy = requiredFixtureValue(session).data.credits;
  game.trade(session, 'ore', requiredFixtureValue(preview.buy).tonnes);
  assert.equal(
    beforeBuy - requiredFixtureValue(session).data.credits,
    requiredFixtureValue(preview.buy).total,
    'Preview matches actual server bulk purchase settlement',
  );
  const sellPreview = tradePreview({
    ...options,
    market: requiredFixtureValue(
      game.market(
        (await import('../shared/galaxy.ts')).STELLARS[requiredFixtureValue(session.data.stellar)],
      ),
    ).find((captain) => captain.id === 'ore')!,
    cargo: requiredFixtureValue(session).data.cargo,
    cargoLots: requiredFixtureValue(session).data.cargoLots,
  });
  const beforeSell = requiredFixtureValue(session).data.credits;
  game.trade(session, 'ore', -10);
  assert.equal(
    requiredFixtureValue(session).data.credits - beforeSell,
    requiredFixtureValue(sellPreview.sale).total,
    'Preview matches actual grade-aware sale settlement',
  );
  assert.equal(tradePreview({ ...options, amount: 1.5 }).valid, false);
  assert.equal(requiredFixtureValue(tradePreview({ ...options, freeHold: 0 }).buy).tonnes, 0);
  assert.equal(requiredFixtureValue(tradePreview({ ...options, credits: 0 }).buy).tonnes, 0);
  const warnings = tradePreview({
    ...options,
    amount: 17,
    orders: [{ cid: 'ore', grade: 'pure', qty: 2 }],
  }).warnings;
  assert.ok(warnings.some((session3) => session3.includes('higher-grade')));
  assert.ok(warnings.some((session2) => session2.includes('delivery')));

  seed(requiredFixtureValue(session).data, { ore: lots(20) });
  const legacy = quote(game, session);
  let last;
  for (let index = 1; index <= 12; index++) {
    command(game, session, {
      op: 'preview',
      recipe: 'alloy',
      n: index,
      grade: 'common',
      mode: 'instant',
    });
    last = requiredFixtureValue(session)
      .sock.out.filter((message: { t: string }) => message.t === 'refineryQuote')
      .at(-1)!.quote!;
  }
  assert.equal(
    refineryWorld(game).quotes.filter((refineryQuote) => refineryQuote.preview).length,
    1,
    'Normal edits cannot exhaust the active cost-preview limit',
  );
  assert.ok(
    refineryWorld(game).quotes.some((refineryQuote) => refineryQuote.id === legacy.id),
    'Existing explicit binding quotes are not invalidated by UI previews',
  );
  const credits = requiredFixtureValue(session).data.credits;
  command(game, session, { op: 'submit', id: requiredFixtureValue(last).id });
  assert.equal(
    credits - requiredFixtureValue(session).data.credits,
    (requiredFixtureValue(last) as import('../server/refinery-contracts.ts').RefineryQuote).fee,
  );
  const settled = JSON.stringify(requiredFixtureValue(session).data);
  command(game, session, { op: 'submit', id: requiredFixtureValue(last).id });
  assert.equal(
    JSON.stringify(requiredFixtureValue(session).data),
    settled,
    'Repeated Start cannot debit cargo, credits or receipt twice',
  );
  const persisted = new Database(game.db.dir);
  assert.deepEqual(
    requiredFixtureValue(persisted.get(session.data.name)).economyReceipt,
    requiredFixtureValue(session).data.economyReceipt,
    'Refining and recap settle durably together',
  );
  seed(requiredFixtureValue(session).data, {
    ore: lots(0, 0, 3),
    gas: lots(0, 0, 3),
    shards: lots(0, 0, 2),
  });
  const incomplete = quote(game, session, 'plating', 3, 'pure'),
    unchanged = JSON.stringify(requiredFixtureValue(session).data);
  command(game, session, { op: 'submit', id: incomplete.id });
  assert.equal(
    JSON.stringify(requiredFixtureValue(session).data),
    unchanged,
    'Third-input failure does not change either credits, cargo or the recap',
  );
  seed(requiredFixtureValue(session).data, { ore: lots(5) });
  const expiring = quote(game, session),
    unchangedExpired = JSON.stringify(requiredFixtureValue(session).data);
  Date.now = () => 1800000031000;
  command(game, session, { op: 'submit', id: expiring.id });
  assert.equal(
    JSON.stringify(requiredFixtureValue(session).data),
    unchangedExpired,
    'Expired cost cannot spend anything',
  );
} finally {
  Date.now = realNow;
}

// Synthetic arithmetic fixtures test the report only; they are NOT measured game sessions.
const observations: Parameters<typeof analyseSessions>[0] = [];
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
