import assert from 'node:assert/strict';
import { freightOffers, INNER_FREIGHT_SYSTEMS } from '../server/freight-offers.ts';
import { STELLARS, SYS, START, FACTIONS } from '../shared/galaxy.ts';
import { makeLoadout, shipStats, route } from '../shared/rules.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.js';
import { DB } from '../server/db.ts';

const now = Date.now;
let time = 1800000000000;
Date.now = () => time;
try {
  const g = refineryGame(),
    s = refineryPilot(g, 'Courier boundary'),
    d = s.data;
  d.ship = makeLoadout(g.A, START.ship, 'Starter');
  d.cargo = {};
  const innerPorts = Object.values(STELLARS).filter(
    (p) => INNER_FREIGHT_SYSTEMS.has(p.system) && p.svc.includes('B') && !p.site && !p.outlaw,
  );
  assert.ok(innerPorts.length >= 15 && INNER_FREIGHT_SYSTEMS.has(START.system));
  assert.ok(!INNER_FREIGHT_SYSTEMS.has('gloam'));
  let checked = 0;
  for (let window = 0; window < 128; window++) {
    time = 1800000000000 + window * 600000;
    for (const p of innerPorts) {
      const offers = g.offers(p, d),
        courier = offers.filter((o) => o.id.includes('-freight-courier-'));
      assert.equal(courier.length, 2, `Two small contracts at ${p.id}, window ${window}`);
      assert.ok(courier[0].qty >= 3 && courier[0].qty <= 5);
      assert.ok(courier[1].qty >= 6 && courier[1].qty <= 10);
      assert.ok(courier[0].qty + courier[1].qty <= 15);
      for (const o of courier) {
        assert.equal(o.type, 'cargo');
        assert.ok(!o.deadline && !o.rush && !o.syn);
        assert.notEqual(o.sys, p.system);
        assert.ok(INNER_FREIGHT_SYSTEMS.has(o.sys));
        assert.ok(STELLARS[o.dest].svc.includes('L') && !STELLARS[o.dest].site);
        const path = route(SYS, p.system, o.sys);
        assert.ok(path.length > 0 && path.length <= 2);
        assert.ok(path.every((id) => SYS[id].danger <= 1 && !FACTIONS[SYS[id].faction].pirate));
      }
      checked++;
    }
  }
  const port = STELLARS.qstation;
  d.sys = port.system;
  d.stellar = port.id;
  const board = () => g.offers(port, d),
    small = () => board().filter((o) => o.id.includes('-freight-courier-'));
  const first = small()[0],
    second = small()[1];
  const stable = freightOffers(port, Math.floor(time / 600000));
  assert.deepEqual(stable, freightOffers(port, Math.floor(time / 600000)));
  const bulk = stable.filter((o) => o.id.includes('-bulk-'));
  assert.equal(bulk.length, 5);
  const limits = [
    [30, 60],
    [70, 120],
    [140, 300],
    [350, 450],
    [900, 1800],
  ];
  for (const [i, o] of bulk.entries()) {
    assert.ok(o.qty >= limits[i][0] && o.qty <= limits[i][1]);
    assert.ok(o.reward > first.reward);
    assert.ok(Number.isSafeInteger(o.reward) && o.reward > 0);
  }
  for (const [name, band, expected] of [
    ['Dory Hauler', 0, 70],
    ['Sunwake Sloop', 1, 120],
    ['Longhaul Barge', 2, 300],
    ['Magma Hauler', 3, 450],
    ['Grand Caravan', 4, 1800],
  ]) {
    // Named stock haulers must fit the advertised progression bands across every seed.
    const hull = Object.values(g.A.ships).find((h) => h.name === name).id;
    const cap = shipStats(g.A, makeLoadout(g.A, hull, 'Hauler')).cargo;
    assert.equal(cap, expected);
    for (let window = 0; window < 128; window++) {
      const offer = freightOffers(port, window).filter((o) => o.id.includes('-bulk-'))[band];
      assert.ok(offer.qty <= cap, `${g.A.ships[hull].name} fits band ${band}`);
    }
  }
  const big = board().find((o) => o.id.includes('-bulk-4'));
  const originalOffers = g.offers;
  let offerReads = 0;
  g.offers = function () {
    assert.equal(this, g, 'core forwarding keeps the Game receiver');
    offerReads++;
    return [];
  };
  g.accept(s, first.id);
  assert.equal(offerReads, 1, 'acceptance reads the current offer provider, not a stale binding');
  assert.equal(d.missions.length, 0, 'an offer removed by the current provider cannot be accepted');
  g.offers = originalOffers;
  g.accept(s, big.id);
  assert.equal(d.missions.length, 0, 'Starter cannot overfill with a large contract');
  d.cargo.food = 15;
  g.accept(s, first.id);
  assert.equal(d.missions.length, 0, 'Existing commodities count against hold capacity');
  d.cargo = {};
  const credits = d.credits;
  g.accept(s, first.id);
  g.accept(s, first.id);
  g.accept(s, 'forged-freight-id');
  assert.equal(d.missions.length, 1, 'Duplicate and forged acceptance are denied');
  g.accept(s, second.id);
  assert.equal(d.missions.length, 2, 'Both courier shipments fit the starter together');
  assert.equal(g.holdUsed(d), first.qty + second.qty);
  assert.deepEqual(d.cargo, {}, 'Freight is supplied mission cargo, not purchased commodities');
  assert.equal(d.credits, credits, 'Acceptance never charges the captain');
  assert.equal(small().length, 0, 'Accepted board slots do not keep refilling');
  const accepted = structuredClone(d.missions);
  time += 600000;
  d.ship = makeLoadout(g.A, 784, 'Grand Caravan');
  assert.deepEqual(d.missions, accepted, 'Time and ship changes cannot resize accepted cargo/pay');
  assert.deepEqual(
    freightOffers(port, 5),
    freightOffers(port, 5),
    'Offers are public, not ship-scaled',
  );
  g.db.touch();
  g.db.flush();
  const loaded = new DB(g.db.dir).get(d.name);
  assert.deepEqual(loaded.missions, accepted, 'Cargo and pay survive a real database reload');
  g.completeOnLanding(s, port);
  assert.equal(d.credits, credits, 'Wrong port cannot pay');
  g.completeOnLanding(s, STELLARS[first.dest]);
  const paid = d.credits;
  assert.equal(
    paid,
    credits + accepted.filter((o) => o.dest === first.dest).reduce((n, o) => n + o.reward, 0),
  );
  g.completeOnLanding(s, STELLARS[first.dest]);
  assert.equal(d.credits, paid, 'Repeated completion cannot pay twice');
  const untouched = freightOffers(port, Math.floor(time / 600000));
  d.missions = Array.from({ length: 6 }, (_, i) => ({ id: `occupied-${i}`, type: 'patrol' }));
  g.accept(s, untouched[0].id);
  assert.equal(d.missions.length, 6, 'Normal six-job limit is preserved');
  d.missions = [];
  const heavy = board().find((o) => o.id.includes('-bulk-4'));
  g.accept(s, heavy.id);
  assert.equal(d.missions.length, 1, 'Grand Caravan accepts a genuine high-tonnage contract');
  assert.equal(g.holdUsed(d), heavy.qty);
  const beforeHeavy = d.credits;
  g.completeOnLanding(s, STELLARS[heavy.dest]);
  assert.equal(d.credits, beforeHeavy + heavy.reward);
  assert.equal(g.holdUsed(d), 0, 'Heavy delivery releases the whole reserved shipment');
  assert.deepEqual(freightOffers({ ...port, svc: 'L' }, 0), []);
  assert.deepEqual(freightOffers({ ...port, outlaw: true }, 0), []);
  assert.deepEqual(freightOffers({ ...port, site: true }, 0), []);
  assert.deepEqual(freightOffers({ ...port, system: 'gloam' }, 0), []);
  assert.ok(
    !freightOffers({ ...port, system: 'farmouth' }, 0).some((o) => o.id.includes('-courier-')),
  );
  console.log(
    `${checked} inner-port boards: two starter-fit couriers, hauler tiers, reservations, exact payout, denial and persistence passed.`,
  );
} finally {
  Date.now = now;
}
