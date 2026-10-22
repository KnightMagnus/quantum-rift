import type { SavedRefinery } from '../server/refinery-contracts.ts';
import type { LivingState } from '../server/world-contracts.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Real service, grade ledger, accounts and durable DB; isolated saves only.
import assert from 'node:assert/strict';
import {
  fuelQuote,
  refineryGame,
  refineryPilot,
  seed,
  command,
  quote,
  lots,
  refineryWorld,
} from './helpers/refinery-fixture.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { RECIPES, recovery, outputUnits } from '../shared/refinery-rules.ts';
import { DB as Database } from '../server/db.ts';
import { clearLots } from '../shared/cargo-lots.ts';
const realNow = Date.now;
let time = 1800000000000;
Date.now = () => time;
try {
  const game = refineryGame(),
    session = refineryPilot(game),
    session2 = refineryPilot(game, 'Other Refiner');
  for (const faction of ['quantum', 'korrund', 'ylith', 'thalassi', 'umbral'])
    for (const result of RECIPES) {
      const rate = recovery(faction, false, result);
      assert.ok([75, 80, 85, 95].includes(rate));
      assert.equal(outputUnits(result.pure ? 9 : 3, rate, result.pure), 3 * rate);
      assert.equal(recovery(faction, true, result), 100);
    }
  seed(requiredFixtureValue(session).data, { ore: lots(12, 3, 3) });
  const refineryQuote = quote(game, session);
  assert.equal(refineryQuote.units, 255);
  assert.equal(refineryQuote.recovery, 85);
  command(game, session, { op: 'submit', id: refineryQuote.id });
  assert.equal(requiredFixtureValue(session).data.cargo.ore, 15);
  assert.equal(refineryWorld(game).ready[0].units, 255);
  const credits = requiredFixtureValue(session).data.credits;
  command(game, session, { op: 'submit', id: refineryQuote.id });
  assert.equal(requiredFixtureValue(session).data.credits, credits);
  assert.equal(
    requiredFixtureValue(session).data.cargo.ore,
    15,
    'duplicate quote cannot debit twice',
  );
  command(game, session, { op: 'claim', recipe: 'alloy' });
  assert.equal(
    requiredFixtureValue(session).data.cargo.alloy_ingots || 0,
    0,
    'fraction cannot round up',
  );
  command(game, session, { op: 'submit', id: quote(game, session).id });
  command(game, session, { op: 'claim', recipe: 'alloy' });
  assert.equal(requiredFixtureValue(session).data.cargo.alloy_ingots, 1);
  assert.equal(refineryWorld(game).ready[0].units, 210);
  assert.deepEqual(
    requiredFixtureValue(session).data.cargoLots.byCommodity.ore,
    lots(6, 3, 3),
    'standard default consumes onlycommon',
  );
  // Missing third pure input: copies prevent debit of either prior input or fee.
  seed(requiredFixtureValue(session).data, {
    ore: lots(0, 0, 3),
    gas: lots(0, 0, 3),
    shards: lots(0, 0, 2),
  });
  const composite = quote(game, session, 'plating', 3, 'pure'),
    before = JSON.stringify(requiredFixtureValue(session).data),
    stateBefore = JSON.stringify(refineryWorld(game));
  command(game, session, { op: 'submit', id: composite.id });
  assert.equal(JSON.stringify(requiredFixtureValue(session).data), before);
  assert.equal(JSON.stringify(refineryWorld(game)), stateBefore);
  seed(requiredFixtureValue(session).data, {
    ore: lots(0, 0, 3),
    gas: lots(0, 0, 3),
    shards: lots(0, 0, 3),
  });
  command(game, session, { op: 'submit', id: quote(game, session, 'plating', 3, 'pure').id });
  assert.equal(
    requiredFixtureValue(
      refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'composite_plating'),
    ).units,
    255,
  );
  assert.equal(requiredFixtureValue(session).data.cargo.ore || 0, 0);
  // Timed escrow, exact premium cancellation, full/partial holds and access-loss collection.
  seed(requiredFixtureValue(session).data, { ore: lots(0, 6, 0) });
  const stored = quote(game, session, 'alloy', 3, 'rich', 'stored');
  command(game, session, { op: 'submit', id: stored.id });
  const batch = refineryWorld(game).batches.at(-1);
  assert.equal(requiredFixtureValue(batch).status, 'queued');
  assert.equal(requiredFixtureValue(batch).readyAt - requiredFixtureValue(batch).startAt, 315000);
  assert.equal(requiredFixtureValue(batch).startAt - time, 30000);
  command(game, session2, { op: 'cancel', id: requiredFixtureValue(batch).id });
  assert.equal(
    requiredFixtureValue(refineryWorld(game).batches.at(-1)).status,
    'queued',
    'wrongowner cannotcancel',
  );
  const feeCredits = requiredFixtureValue(session).data.credits;
  command(game, session, { op: 'cancel', id: requiredFixtureValue(batch).id });
  assert.equal(
    requiredFixtureValue(session).data.credits,
    feeCredits + stored.fee - stored.cancelFee,
  );
  command(game, session, { op: 'returns', id: requiredFixtureValue(batch).id });
  assert.deepEqual(requiredFixtureValue(session).data.cargoLots.byCommodity.ore, lots(0, 6, 0));
  const timed = quote(game, session, 'alloy', 3, 'rich', 'stored');
  command(game, session, { op: 'submit', id: timed.id });
  const mission = refineryWorld(game).batches.at(-1);
  time = requiredFixtureValue(mission).startAt;
  command(game, session, { op: 'cancel', id: requiredFixtureValue(mission).id });
  assert.equal(
    requiredFixtureValue(refineryWorld(game).batches.at(-1)).status,
    'processing',
    'atstart cancellation denied',
  );
  const held = requiredFixtureValue(
    refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'alloy_ingots'),
  ).units;
  time = requiredFixtureValue(mission).readyAt + 1;
  game.features.refinery.payload(session);
  const ready = requiredFixtureValue(
    refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'alloy_ingots'),
  ).units;
  assert.equal(ready, held + 255);
  time -= 500000;
  game.features.refinery.payload(session);
  assert.equal(
    requiredFixtureValue(
      refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'alloy_ingots'),
    ).units,
    ready,
    'clockrollback cannotunready',
  );
  const capacity = requiredFixtureValue(game.features.shipStats.stats(session.data)).cargo;
  seed(requiredFixtureValue(session).data, { food: lots(capacity) });
  command(game, session, { op: 'claim', recipe: 'alloy' });
  assert.equal(
    requiredFixtureValue(
      refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'alloy_ingots'),
    ).units,
    ready,
  );
  requiredFixtureValue(session).data.cargo.food--;
  requiredFixtureValue(session).data.rep.quantum = -50;
  const port = STELLARS[requiredFixtureValue(requiredFixtureValue(session).data.stellar)];
  game.depart(session);
  requiredFixtureValue(requiredFixtureValue(session).ent).x = port.x;
  requiredFixtureValue(requiredFixtureValue(session).ent).y = port.y;
  requiredFixtureValue(requiredFixtureValue(session).ent).fuel = 0;
  requiredFixtureValue(session).data.fuel = 100;
  command(game, session, { op: 'claim', recipe: 'alloy', port: port.id });
  assert.equal(
    requiredFixtureValue(session).data.cargo.alloy_ingots,
    1,
    'nontrade approach collects despite accessloss',
  );
  assert.equal(
    requiredFixtureValue(
      refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'alloy_ingots'),
    ).units,
    ready - 300,
  );
  assert.ok(requiredFixtureValue(session).ent, 'collection didnotland/repair');
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(session).ent).fuel,
    0,
    'collection cannot restore stale saved flight fuel',
  );
  seed(requiredFixtureValue(session).data, { fuel_cells: lots(2) });
  const fuelQuote2 = fuelQuote(game, session);
  command(game, session, { op: 'fuel', id: fuelQuote2.id });
  assert.equal(requiredFixtureValue(requiredFixtureValue(session).ent).fuel, 100);
  assert.equal(requiredFixtureValue(session).data.fuel, 100);
  command(game, session, { op: 'fuel', id: fuelQuote2.id });
  assert.equal(
    requiredFixtureValue(session).data.cargo.fuel_cells,
    1,
    'fuel replay cannot consume again',
  );
  requiredFixtureValue(requiredFixtureValue(session).ent).fuel = 0;
  refineryWorld(game).operations = refineryWorld(game).operations.filter(
    (options: { kind: string }) => options.kind !== 'fuel',
  );
  command(game, session, { op: 'fuel', id: fuelQuote2.id });
  assert.equal(
    requiredFixtureValue(session).data.cargo.fuel_cells,
    1,
    'pruned receipt cannot resurrect consumed server quote',
  );
  // Real flight fuel is continuous and keeps regenerating while a quote is visible.
  requiredFixtureValue(requiredFixtureValue(session).ent).fuel = 100.5;
  const flightQuote = fuelQuote(game, session);
  const space = game.spaces[requiredFixtureValue(session).data.sys];
  assert.ok(space);
  const regen = (requiredFixtureValue(requiredFixtureValue(session).ent).st.fuelRe = 2);
  assert.ok(regen > 0);
  space.tick();
  assert.ok(
    requiredFixtureValue(requiredFixtureValue(session).ent).fuel > 100.5 &&
      requiredFixtureValue(requiredFixtureValue(session).ent).fuel < 101.5,
  );
  const liveFuel = requiredFixtureValue(requiredFixtureValue(session).ent).fuel;
  command(game, session, { op: 'fuel', id: flightQuote.id });
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(session).ent).fuel,
    liveFuel + 100,
    'binding fixed gain survives ordinary regeneration',
  );
  assert.equal(requiredFixtureValue(session).data.cargo.fuel_cells, 0);
  seed(requiredFixtureValue(session).data, { fuel_cells: lots(1) });
  requiredFixtureValue(requiredFixtureValue(session).ent).fuel = 0.5;
  const clippedQuote = fuelQuote(game, session);
  requiredFixtureValue(requiredFixtureValue(session).ent).fuel =
    requiredFixtureValue(game.features.shipStats.stats(session.data)).fuel - 99;
  command(game, session, { op: 'fuel', id: clippedQuote.id });
  assert.equal(
    requiredFixtureValue(session).data.cargo.fuel_cells,
    1,
    'confirmation cannot waste a cell after regeneration fills room',
  );
  requiredFixtureValue(requiredFixtureValue(session).ent).fuel =
    requiredFixtureValue(game.features.shipStats.stats(session.data)).fuel - 1;
  command(game, session, { op: 'fuelQuote', n: 1 });
  assert.equal(
    requiredFixtureValue(session).data.cargo.fuel_cells,
    1,
    'reject cell that wouldclip',
  );
  // Finite exact-grade order acceptance/delivery; generic landing cannot pay.
  requiredFixtureValue(session).ent = null;
  requiredFixtureValue(session).data.stellar = port.id;
  requiredFixtureValue(session).data.rep.quantum = 10;
  clearLots(requiredFixtureValue(session).data.cargo, requiredFixtureValue(session).data.cargoLots);
  const offer = game.features.refinery
    .payload(session)
    .offers.find((cargoTransfer) => cargoTransfer.grade === 'rich');
  command(game, session, { op: 'accept', id: requiredFixtureValue(offer).id, port: port.id }, true);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(session).data.missions.at(-1)).type,
    'miningOrder',
  );
  const rewardBefore = requiredFixtureValue(session).data.credits,
    earnedBefore = requiredFixtureValue(session).data.stats.earned || 0;
  game.completeOnLanding(session, port);
  assert.equal(requiredFixtureValue(session).data.credits, rewardBefore);
  seed(requiredFixtureValue(session).data, { gas: lots(requiredFixtureValue(offer).qty) });
  command(
    game,
    session,
    { op: 'deliver', id: requiredFixtureValue(offer).id, port: port.id },
    true,
  );
  assert.equal(
    requiredFixtureValue(session).data.credits,
    rewardBefore,
    'common cannot satisfyrich',
  );
  seed(requiredFixtureValue(session).data, { gas: lots(0, requiredFixtureValue(offer).qty) });
  command(
    game,
    session,
    { op: 'deliver', id: requiredFixtureValue(offer).id, port: port.id },
    true,
  );
  assert.equal(
    requiredFixtureValue(session).data.credits,
    rewardBefore + requiredFixtureValue(offer).reward,
  );
  assert.equal(
    requiredFixtureValue(session).data.stats.earned,
    earnedBefore + requiredFixtureValue(offer).reward,
  );
  command(
    game,
    session,
    { op: 'deliver', id: requiredFixtureValue(offer).id, port: port.id },
    true,
  );
  assert.equal(
    requiredFixtureValue(session).data.credits,
    rewardBefore + requiredFixtureValue(offer).reward,
  );
  assert.ok(
    !game.features.refinery
      .payload(session2)
      .offers.some((cargoTransfer) => cargoTransfer.id === requiredFixtureValue(offer).id),
    'othercaptain cannot accept paidglobal offer',
  );
  game.db.touch();
  game.db.flush();
  const reload = refineryGame(new Database(game.db.dir));
  assert.equal(
    requiredFixtureValue(
      requiredFixtureValue(reload.db.world.refinery).ready.find(
        (entry) => entry.cid === 'alloy_ingots',
      ),
    ).units,
    requiredFixtureValue(
      refineryWorld(game).ready.find((entry: { cid: string }) => entry.cid === 'alloy_ingots'),
    ).units,
  );
  // Home profile is a new-recipe advantage; legacy 12 t + 1500 cr crate processing remains.
  {
    const hull = refineryGame(),
      player = refineryPilot(hull, 'Home Refiner'),
      site = Object.values(STELLARS).find((stellarBody) => stellarBody.site);
    requiredFixtureValue(player).data.station = {
      ...requiredFixtureValue(player).data.station,
      claimed: true,
      ops: 3,
      site: requiredFixtureValue(site).id,
    };
    hull.db.world.sites[requiredFixtureValue(site).id] = hull.db.key(
      requiredFixtureValue(player).data.name,
    );
    requiredFixtureValue(player).data.sys = requiredFixtureValue(site).system;
    requiredFixtureValue(player).data.stellar = requiredFixtureValue(site).id;
    seed(requiredFixtureValue(player).data, { ore: lots(15) });
    const home = quote(hull, player);
    assert.equal(home.recovery, 100);
    assert.equal(home.units, 300);
    const money = requiredFixtureValue(player).data.credits,
      crates = requiredFixtureValue(player).data.mats.alloy.reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      );
    hull.station(player, { op: 'process', id: 'ore' });
    assert.equal(requiredFixtureValue(player).data.credits, money - 1500);
    assert.equal(requiredFixtureValue(player).data.cargo.ore, 3);
    assert.equal(
      requiredFixtureValue(player).data.mats.alloy.reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      ),
      crates + 1,
    );
    command(hull, player, { op: 'submit', id: quote(hull, player).id });
    command(hull, player, { op: 'claim', recipe: 'alloy' });
    assert.equal(requiredFixtureValue(player).data.cargo.alloy_ingots, 1);
  }
  // Shared finite rush reservation, exact delivery progress, event-end completion and pause deadlines.
  {
    const hull2 = refineryGame(),
      session3 = refineryPilot(hull2, 'Rush Source'),
      session4 = refineryPilot(hull2, 'Rush Rival'),
      systemId = requiredFixtureValue(session3).data.sys;
    hull2.db.world.states[systemId] = {
      kind: 'rush',
      until: time + 60000,
      got: 0,
      need: 160,
    } as LivingState;
    const offer = hull2.features.refinery
      .payload(session3)
      .offers.find((cargoTransfer) => cargoTransfer.grade === 'common');
    command(hull2, session3, { op: 'accept', id: requiredFixtureValue(offer).id }, true);
    assert.ok(
      !hull2.features.refinery
        .payload(session4)
        .offers.some((cargoTransfer) => cargoTransfer.id === requiredFixtureValue(offer).id),
    );
    const record = refineryWorld(hull2).orders[0],
      deadline = record.deadline;
    hull2.features.refinery.resume(10000);
    assert.equal(refineryWorld(hull2).orders[0].deadline, deadline + 10000);
    seed(requiredFixtureValue(session3).data, { ore: lots(requiredFixtureValue(offer).qty) });
    command(hull2, session3, { op: 'deliver', id: requiredFixtureValue(offer).id }, true);
    assert.equal(hull2.db.world.states[systemId].got, requiredFixtureValue(offer).qty);
    hull2.features.refinery.payload(session3);
    assert.equal(
      hull2.db.world.states[systemId].got,
      requiredFixtureValue(offer).qty,
      'rush progress idempotent',
    );
    const later = hull2.features.refinery
      .payload(session3)
      .offers.find((cargoTransfer) => cargoTransfer.grade === 'rich');
    command(hull2, session3, { op: 'accept', id: requiredFixtureValue(later).id }, true);
    time += 60001;
    seed(requiredFixtureValue(session3).data, { gas: lots(0, requiredFixtureValue(later).qty) });
    const money = requiredFixtureValue(session3).data.credits;
    command(hull2, session3, { op: 'deliver', id: requiredFixtureValue(later).id }, true);
    assert.equal(
      requiredFixtureValue(session3).data.credits,
      money + requiredFixtureValue(later).reward,
      'accepted reservation survives event end',
    );
    const remaining = hull2.features.refinery.payload(session3).offers[0];
    command(hull2, session3, { op: 'accept', id: remaining.id }, true);
    const active = refineryWorld(hull2).orders.find(
      (options: { id: string }) => options.id === remaining.id,
    );
    time = requiredFixtureValue(active).deadline + 1;
    hull2.features.refinery.payload(session3);
    assert.equal(
      requiredFixtureValue(
        refineryWorld(hull2).orders.find((options: { id: string }) => options.id === remaining.id),
      ).status,
      'expired',
    );
    assert.ok(
      !requiredFixtureValue(session3).data.missions.some(
        (message: { id: string }) => message.id === remaining.id,
      ),
      'expiry frees jobslot',
    );
    assert.equal(
      requiredFixtureValue(
        refineryWorld(hull2).demand.find(
          (refineryDemand) => refineryDemand.key === requiredFixtureValue(active).demand,
        ),
      ).reserved,
      0,
    );
  }
  // Pure composite has both processing throughput and actual shared buyer limits.
  {
    const hull3 = refineryGame(),
      session3 = refineryPilot(hull3, 'Composite Seller'),
      other = refineryPilot(hull3, 'Composite Alt');
    seed(requiredFixtureValue(session3).data, { composite_plating: lots(35) });
    hull3.trade(session3, 'composite_plating', -99);
    assert.equal(requiredFixtureValue(session3).data.cargo.composite_plating, 5);
    assert.equal(
      requiredFixtureValue(
        requiredFixtureValue(
          hull3.market(STELLARS[requiredFixtureValue(session3.data.stellar)]),
        ).find((marketItem) => marketItem.id === 'composite_plating'),
      ).sellCap,
      0,
    );
    seed(requiredFixtureValue(other).data, { composite_plating: lots(2) });
    const money = requiredFixtureValue(other).data.credits;
    hull3.trade(other, 'composite_plating', -2);
    assert.equal(requiredFixtureValue(other).data.credits, money);
    assert.equal(
      requiredFixtureValue(other).data.cargo.composite_plating,
      2,
      'buyer cap shared across accounts',
    );
    hull3.db.touch();
    hull3.db.flush();
    const reload = refineryGame(new Database(hull3.db.dir));
    assert.equal(
      reload.features.refinery.sellRoom(
        requiredFixtureValue(requiredFixtureValue(session3).data.stellar),
        99,
      ),
      0,
      'buyer cap persists',
    );
  }
  // Corrupt durable versions, entitlements and pooled-unit counters fail closed.
  {
    const hull4 = refineryGame(),
      session3 = refineryPilot(hull4, 'Invalid Refinery');
    seed(requiredFixtureValue(session3).data, { ore: lots(6) });
    command(hull4, session3, { op: 'submit', id: quote(hull4, session3, 'alloy', 6).id });
    const valid = structuredClone(refineryWorld(hull4));
    for (const mutate of [
      (weapon: SavedRefinery) => Reflect.set(weapon, 'version', 99),
      (weapon: SavedRefinery) => weapon.ready[0].units++,
      (weapon: SavedRefinery) => weapon.batches[0].quote.units++,
      (weapon: SavedRefinery) => weapon.ready.push({ ...weapon.ready[0] }),
      (weapon: SavedRefinery) => (weapon.batches[0].credited = false),
      (weapon: SavedRefinery) => weapon.batches[0].startAt++,
      (weapon: SavedRefinery) =>
        (weapon.batches[0].returns = structuredClone(weapon.batches[0].quote.inputs)),
      (weapon: SavedRefinery) => (weapon.operations[0].kind = 'invented'),
      (weapon: SavedRefinery) => (weapon.operations[0].owner = ''),
      (weapon: SavedRefinery) => (
        (weapon.batches[0].quote.inputs = [
          { cid: 'ore', lots: lots(0, 0, 3) },
          { cid: 'gas', lots: lots(0, 0, 3) },
          { cid: 'shards', lots: lots(0, 0, 6) },
        ]),
        (weapon.batches[0].quote.recipe = 'plating'),
        (weapon.batches[0].quote.output = 'composite_plating'),
        (weapon.batches[0].quote.inputTonnes = 12),
        (weapon.batches[0].quote.units = outputUnits(12, 85, true))
      ),
    ]) {
      const invalid = structuredClone(valid);
      mutate(invalid);
      hull4.db.world.refinery = invalid;
      const before = JSON.stringify(hull4.db.world.refinery);
      assert.throws(() => hull4.features.refinery.init(), /Invalid|Duplicate/);
      assert.equal(JSON.stringify(hull4.db.world.refinery), before);
    }
    hull4.db.world.refinery = valid;
  }
  console.log('ALL REFINERY TRANSACTION / FRACTION / ESCROW / FUEL / EXACT ORDER TESTS PASSED');
} finally {
  Date.now = realNow;
}
