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
  w,
} from './helpers/refinery-fixture.js';
import { STELLARS } from '../shared/galaxy.js';
import { RECIPES, recovery, outputUnits } from '../shared/refinery-rules.js';
import { DB } from '../server/db.js';
import { clearLots } from '../shared/cargo-lots.js';
const realNow = Date.now;
let time = 1800000000000;
Date.now = () => time;
try {
  const g = refineryGame(),
    s = refineryPilot(g),
    b = refineryPilot(g, 'Other Refiner');
  for (const fac of ['quantum', 'korrund', 'ylith', 'thalassi', 'umbral'])
    for (const r of RECIPES) {
      const rate = recovery(fac, false, r);
      assert.ok([75, 80, 85, 95].includes(rate));
      assert.equal(outputUnits(r.pure ? 9 : 3, rate, r.pure), 3 * rate);
      assert.equal(recovery(fac, true, r), 100);
    }
  seed(s.data, { ore: lots(12, 3, 3) });
  const a = quote(g, s);
  assert.equal(a.units, 255);
  assert.equal(a.recovery, 85);
  command(g, s, { op: 'submit', id: a.id });
  assert.equal(s.data.cargo.ore, 15);
  assert.equal(w(g).ready[0].units, 255);
  const credits = s.data.credits;
  command(g, s, { op: 'submit', id: a.id });
  assert.equal(s.data.credits, credits);
  assert.equal(s.data.cargo.ore, 15, 'duplicate quote cannot debit twice');
  command(g, s, { op: 'claim', recipe: 'alloy' });
  assert.equal(s.data.cargo.alloy_ingots || 0, 0, 'fraction cannot round up');
  command(g, s, { op: 'submit', id: quote(g, s).id });
  command(g, s, { op: 'claim', recipe: 'alloy' });
  assert.equal(s.data.cargo.alloy_ingots, 1);
  assert.equal(w(g).ready[0].units, 210);
  assert.deepEqual(
    s.data.cargoLots.byCommodity.ore,
    lots(6, 3, 3),
    'standard default consumes onlycommon',
  );
  // Missing third pure input: copies prevent debit of either prior input or fee.
  seed(s.data, { ore: lots(0, 0, 3), gas: lots(0, 0, 3), shards: lots(0, 0, 2) });
  const composite = quote(g, s, 'plating', 3, 'pure'),
    before = JSON.stringify(s.data),
    stateBefore = JSON.stringify(w(g));
  command(g, s, { op: 'submit', id: composite.id });
  assert.equal(JSON.stringify(s.data), before);
  assert.equal(JSON.stringify(w(g)), stateBefore);
  seed(s.data, { ore: lots(0, 0, 3), gas: lots(0, 0, 3), shards: lots(0, 0, 3) });
  command(g, s, { op: 'submit', id: quote(g, s, 'plating', 3, 'pure').id });
  assert.equal(w(g).ready.find((x) => x.cid === 'composite_plating').units, 255);
  assert.equal(s.data.cargo.ore || 0, 0);
  // Timed escrow, exact premium cancellation, full/partial holds and access-loss collection.
  seed(s.data, { ore: lots(0, 6, 0) });
  const stored = quote(g, s, 'alloy', 3, 'rich', 'stored');
  command(g, s, { op: 'submit', id: stored.id });
  const batch = w(g).batches.at(-1);
  assert.equal(batch.status, 'queued');
  assert.equal(batch.readyAt - batch.startAt, 315000);
  assert.equal(batch.startAt - time, 30000);
  command(g, b, { op: 'cancel', id: batch.id });
  assert.equal(w(g).batches.at(-1).status, 'queued', 'wrongowner cannotcancel');
  const feeCredits = s.data.credits;
  command(g, s, { op: 'cancel', id: batch.id });
  assert.equal(s.data.credits, feeCredits + stored.fee - stored.cancelFee);
  command(g, s, { op: 'returns', id: batch.id });
  assert.deepEqual(s.data.cargoLots.byCommodity.ore, lots(0, 6, 0));
  const timed = quote(g, s, 'alloy', 3, 'rich', 'stored');
  command(g, s, { op: 'submit', id: timed.id });
  const job = w(g).batches.at(-1);
  time = job.startAt;
  command(g, s, { op: 'cancel', id: job.id });
  assert.equal(w(g).batches.at(-1).status, 'processing', 'atstart cancellation denied');
  const held = w(g).ready.find((x) => x.cid === 'alloy_ingots').units;
  time = job.readyAt + 1;
  g.features.refinery.payload(s);
  const ready = w(g).ready.find((x) => x.cid === 'alloy_ingots').units;
  assert.equal(ready, held + 255);
  time -= 500000;
  g.features.refinery.payload(s);
  assert.equal(
    w(g).ready.find((x) => x.cid === 'alloy_ingots').units,
    ready,
    'clockrollback cannotunready',
  );
  const capacity = g.features.shipStats.stats(s.data).cargo;
  seed(s.data, { food: lots(capacity) });
  command(g, s, { op: 'claim', recipe: 'alloy' });
  assert.equal(w(g).ready.find((x) => x.cid === 'alloy_ingots').units, ready);
  s.data.cargo.food--;
  s.data.rep.quantum = -50;
  const port = STELLARS[s.data.stellar];
  g.depart(s);
  s.ent.x = port.x;
  s.ent.y = port.y;
  s.ent.fuel = 0;
  s.data.fuel = 100;
  command(g, s, { op: 'claim', recipe: 'alloy', port: port.id });
  assert.equal(s.data.cargo.alloy_ingots, 1, 'nontrade approach collects despite accessloss');
  assert.equal(w(g).ready.find((x) => x.cid === 'alloy_ingots').units, ready - 300);
  assert.ok(s.ent, 'collection didnotland/repair');
  assert.equal(s.ent.fuel, 0, 'collection cannot restore stale saved flight fuel');
  seed(s.data, { fuel_cells: lots(2) });
  const fq = fuelQuote(g, s);
  command(g, s, { op: 'fuel', id: fq.id });
  assert.equal(s.ent.fuel, 100);
  assert.equal(s.data.fuel, 100);
  command(g, s, { op: 'fuel', id: fq.id });
  assert.equal(s.data.cargo.fuel_cells, 1, 'fuel replay cannot consume again');
  s.ent.fuel = 0;
  w(g).operations = w(g).operations.filter((o) => o.kind !== 'fuel');
  command(g, s, { op: 'fuel', id: fq.id });
  assert.equal(s.data.cargo.fuel_cells, 1, 'pruned receipt cannot resurrect consumed server quote');
  // Real flight fuel is continuous and keeps regenerating while a quote is visible.
  s.ent.fuel = 100.5;
  const flightQuote = fuelQuote(g, s);
  const space = g.spaces[s.data.sys];
  assert.ok(space);
  const regen = (s.ent.st.fuelRe = 2);
  assert.ok(regen > 0);
  space.tick(0.1);
  assert.ok(s.ent.fuel > 100.5 && s.ent.fuel < 101.5);
  const liveFuel = s.ent.fuel;
  command(g, s, { op: 'fuel', id: flightQuote.id });
  assert.equal(s.ent.fuel, liveFuel + 100, 'binding fixed gain survives ordinary regeneration');
  assert.equal(s.data.cargo.fuel_cells, 0);
  seed(s.data, { fuel_cells: lots(1) });
  s.ent.fuel = 0.5;
  const clippedQuote = fuelQuote(g, s);
  s.ent.fuel = g.features.shipStats.stats(s.data).fuel - 99;
  command(g, s, { op: 'fuel', id: clippedQuote.id });
  assert.equal(
    s.data.cargo.fuel_cells,
    1,
    'confirmation cannot waste a cell after regeneration fills room',
  );
  s.ent.fuel = g.features.shipStats.stats(s.data).fuel - 1;
  command(g, s, { op: 'fuelQuote', n: 1 });
  assert.equal(s.data.cargo.fuel_cells, 1, 'reject cell that wouldclip');
  // Finite exact-grade order acceptance/delivery; generic landing cannot pay.
  s.ent = null;
  s.data.stellar = port.id;
  s.data.rep.quantum = 10;
  clearLots(s.data.cargo, s.data.cargoLots);
  const offer = g.features.refinery.payload(s).offers.find((o) => o.grade === 'rich');
  command(g, s, { op: 'accept', id: offer.id, port: port.id }, true);
  assert.equal(s.data.missions.at(-1).type, 'miningOrder');
  const rewardBefore = s.data.credits,
    earnedBefore = s.data.stats.earned || 0;
  g.completeOnLanding(s, port);
  assert.equal(s.data.credits, rewardBefore);
  seed(s.data, { gas: lots(offer.qty) });
  command(g, s, { op: 'deliver', id: offer.id, port: port.id }, true);
  assert.equal(s.data.credits, rewardBefore, 'common cannot satisfyrich');
  seed(s.data, { gas: lots(0, offer.qty) });
  command(g, s, { op: 'deliver', id: offer.id, port: port.id }, true);
  assert.equal(s.data.credits, rewardBefore + offer.reward);
  assert.equal(s.data.stats.earned, earnedBefore + offer.reward);
  command(g, s, { op: 'deliver', id: offer.id, port: port.id }, true);
  assert.equal(s.data.credits, rewardBefore + offer.reward);
  assert.ok(
    !g.features.refinery.payload(b).offers.some((o) => o.id === offer.id),
    'othercaptain cannot accept paidglobal offer',
  );
  g.db.touch();
  g.db.flush();
  const reload = refineryGame(new DB(g.db.dir));
  assert.equal(
    reload.db.world.refinery.ready.find((x) => x.cid === 'alloy_ingots').units,
    w(g).ready.find((x) => x.cid === 'alloy_ingots').units,
  );
  // Home profile is a new-recipe advantage; old12t+1500cr crate processing remains.
  {
    const h = refineryGame(),
      p = refineryPilot(h, 'Home Refiner'),
      site = Object.values(STELLARS).find((x) => x.site);
    p.data.station = { ...p.data.station, claimed: true, ops: 3, site: site.id };
    h.db.world.sites[site.id] = h.db.key(p.data.name);
    p.data.sys = site.system;
    p.data.stellar = site.id;
    seed(p.data, { ore: lots(15) });
    const home = quote(h, p);
    assert.equal(home.recovery, 100);
    assert.equal(home.units, 300);
    const money = p.data.credits,
      crates = p.data.mats.alloy.reduce((a, b) => a + b, 0);
    h.station(p, { op: 'process', id: 'ore' });
    assert.equal(p.data.credits, money - 1500);
    assert.equal(p.data.cargo.ore, 3);
    assert.equal(
      p.data.mats.alloy.reduce((a, b) => a + b, 0),
      crates + 1,
    );
    command(h, p, { op: 'submit', id: quote(h, p).id });
    command(h, p, { op: 'claim', recipe: 'alloy' });
    assert.equal(p.data.cargo.alloy_ingots, 1);
  }
  // Shared finite rush reservation, exact delivery progress, event-end completion and pause deadlines.
  {
    const h = refineryGame(),
      p = refineryPilot(h, 'Rush Source'),
      q = refineryPilot(h, 'Rush Rival'),
      sys = p.data.sys;
    h.db.world.states[sys] = { kind: 'rush', until: time + 60000, got: 0, need: 160 };
    const offer = h.features.refinery.payload(p).offers.find((o) => o.grade === 'common');
    command(h, p, { op: 'accept', id: offer.id }, true);
    assert.ok(!h.features.refinery.payload(q).offers.some((o) => o.id === offer.id));
    const record = w(h).orders[0],
      deadline = record.deadline;
    h.features.refinery.resume(10000);
    assert.equal(w(h).orders[0].deadline, deadline + 10000);
    seed(p.data, { ore: lots(offer.qty) });
    command(h, p, { op: 'deliver', id: offer.id }, true);
    assert.equal(h.db.world.states[sys].got, offer.qty);
    h.features.refinery.payload(p);
    assert.equal(h.db.world.states[sys].got, offer.qty, 'rush progress idempotent');
    const later = h.features.refinery.payload(p).offers.find((o) => o.grade === 'rich');
    command(h, p, { op: 'accept', id: later.id }, true);
    time += 60001;
    seed(p.data, { gas: lots(0, later.qty) });
    const money = p.data.credits;
    command(h, p, { op: 'deliver', id: later.id }, true);
    assert.equal(p.data.credits, money + later.reward, 'accepted reservation survives event end');
    const remaining = h.features.refinery.payload(p).offers[0];
    command(h, p, { op: 'accept', id: remaining.id }, true);
    const active = w(h).orders.find((o) => o.id === remaining.id);
    time = active.deadline + 1;
    h.features.refinery.payload(p);
    assert.equal(w(h).orders.find((o) => o.id === remaining.id).status, 'expired');
    assert.ok(!p.data.missions.some((m) => m.id === remaining.id), 'expiry frees jobslot');
    assert.equal(w(h).demand.find((d) => d.key === active.demand).reserved, 0);
  }
  // Pure composite has both processing throughput and actual shared buyer limits.
  {
    const h = refineryGame(),
      p = refineryPilot(h, 'Composite Seller'),
      other = refineryPilot(h, 'Composite Alt');
    seed(p.data, { composite_plating: lots(35) });
    h.trade(p, 'composite_plating', -99);
    assert.equal(p.data.cargo.composite_plating, 5);
    assert.equal(
      h.market(STELLARS[p.data.stellar]).find((c) => c.id === 'composite_plating').sellCap,
      0,
    );
    seed(other.data, { composite_plating: lots(2) });
    const money = other.data.credits;
    h.trade(other, 'composite_plating', -2);
    assert.equal(other.data.credits, money);
    assert.equal(other.data.cargo.composite_plating, 2, 'buyer cap shared across accounts');
    h.db.touch();
    h.db.flush();
    const reload = refineryGame(new DB(h.db.dir));
    assert.equal(reload.features.refinery.sellRoom(p.data.stellar, 99), 0, 'buyer cap persists');
  }
  // Corrupt durable versions, entitlements and pooled-unit counters fail closed.
  {
    const h = refineryGame(),
      p = refineryPilot(h, 'Invalid Refinery');
    seed(p.data, { ore: lots(6) });
    command(h, p, { op: 'submit', id: quote(h, p, 'alloy', 6).id });
    const valid = structuredClone(w(h));
    for (const mutate of [
      (w) => (w.version = 99),
      (w) => w.ready[0].units++,
      (w) => w.batches[0].quote.units++,
      (w) => w.ready.push({ ...w.ready[0] }),
      (w) => (w.batches[0].credited = false),
      (w) => w.batches[0].startAt++,
      (w) => (w.batches[0].returns = structuredClone(w.batches[0].quote.inputs)),
      (w) => (w.operations[0].kind = 'invented'),
      (w) => (w.operations[0].owner = ''),
      (w) => (
        (w.batches[0].quote.inputs = [
          { cid: 'ore', lots: lots(0, 0, 3) },
          { cid: 'gas', lots: lots(0, 0, 3) },
          { cid: 'shards', lots: lots(0, 0, 6) },
        ]),
        (w.batches[0].quote.recipe = 'plating'),
        (w.batches[0].quote.output = 'composite_plating'),
        (w.batches[0].quote.inputTonnes = 12),
        (w.batches[0].quote.units = outputUnits(12, 85, true))
      ),
    ]) {
      const invalid = structuredClone(valid);
      mutate(invalid);
      h.db.world.refinery = invalid;
      const before = JSON.stringify(h.db.world.refinery);
      assert.throws(() => h.features.refinery.init(), /Invalid|Duplicate/);
      assert.equal(JSON.stringify(h.db.world.refinery), before);
    }
    h.db.world.refinery = valid;
  }
  console.log('ALL REFINERY TRANSACTION / FRACTION / ESCROW / FUEL / EXACT ORDER TESTS PASSED');
} finally {
  Date.now = realNow;
}
