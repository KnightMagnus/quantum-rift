// Production cargo writers: no mocked accounting service and no personal saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { tempDataDir } from './helpers/temp-data.js';
import { seedCargo } from './helpers/cargo-fixture.js';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS, COMMODITIES, ORE_PROCESS } from '../shared/galaxy.ts';
import { makeLoadout } from '../shared/rules.ts';
import { JETTISON_OWNER_GRACE_SECONDS } from '../server/fleetcmd.ts';
import { TRADE_IMPACT } from '../shared/living.ts';
import { assertLots, addLots, clearLots } from '../shared/cargo-lots.ts';

const oldInterval = globalThis.setInterval,
  oldRandom = Math.random;
let g;
try {
  globalThis.setInterval = () => ({ unref() {} });
  Math.random = () => 0.4;
  g = new Game(
    JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
    new DB(tempDataDir('rift-cargo-flows-')),
  );
} finally {
  globalThis.setInterval = oldInterval;
  Math.random = oldRandom;
}
function pilot(name) {
  const sock = new EventEmitter();
  Object.assign(sock, {
    open: true,
    backlog: 0,
    out: [],
    close() {},
    send(m) {
      this.out.push(typeof m === 'string' ? JSON.parse(m) : m);
    },
  });
  g.connect(sock, '127.0.0.1');
  const s = [...g.sessions.values()].at(-1);
  g.onMessage(s, { t: 'hello', name, pass: 'fixture' });
  assert.ok(s.data, 'real authenticated login');
  return s;
}
function invariant(d) {
  assertLots(d.cargo, d.cargoLots);
  assertLots(d.storage, d.storageLots);
}
function seed(d, common = 0, rich = 0, pure = 0, cid = 'ore') {
  seedCargo(d, {});
  addLots(d.cargo, d.cargoLots, { cid, qty: common + rich + pure, grades: { common, rich, pure } });
  invariant(d);
}
function lots(d, cid = 'ore') {
  invariant(d);
  return d.cargoLots.byCommodity[cid] || { common: 0, rich: 0, pure: 0 };
}
function own(s, site) {
  const d = s.data;
  d.station = { ...d.station, claimed: true, ops: 3, site };
  g.db.world.sites[site] = g.db.key(d.name);
  d.stellar = site;
  d.sys = STELLARS[site].system;
  s.ent = null;
}
const a = pilot('Cargo Alpha'),
  b = pilot('Cargo Bravo'),
  d = a.data,
  e = b.data;
d.ship = makeLoadout(g.A, 704, 'Cargo test');
d.credits = 1e8;

// Old saves gain common-only cargo/storage before welcome; corrupt premium saves fail closed.
const legacy = g.fresh();
delete legacy.cargoLots;
delete legacy.storageLots;
legacy.cargo = { ore: 4, food: 2 };
legacy.storage = { gas: 3 };
g.db.create('Cargo Legacy', 'fixture', legacy);
const l = pilot('Cargo Legacy');
assert.deepEqual(lots(l.data), { common: 4, rich: 0, pure: 0 });
g.db.flush();
const reloadedLegacy = new DB(g.db.dir).get('Cargo Legacy');
assert.deepEqual(reloadedLegacy.cargoLots, l.data.cargoLots);
assert.deepEqual(reloadedLegacy.storageLots, l.data.storageLots);
assert.deepEqual(l.data.storageLots.byCommodity.gas, { common: 3, rich: 0, pure: 0 });
const corrupt = g.db.create('Cargo Corrupt', 'fixture', g.fresh());
corrupt.cargo = { ore: 1 };
corrupt.cargoLots.byCommodity.ore = { common: 0, rich: 0, pure: 2 };
const beforeBad = JSON.stringify(corrupt),
  sock = new EventEmitter();
Object.assign(sock, {
  open: true,
  backlog: 0,
  out: [],
  close() {},
  send(m) {
    this.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  },
});
g.connect(sock, '127.0.0.2');
const bad = [...g.sessions.values()].at(-1);
const errorLog = console.error;
try {
  console.error = () => {};
  g.onMessage(bad, { t: 'hello', name: 'Cargo Corrupt', pass: 'fixture' });
} finally {
  console.error = errorLog;
}
assert.equal(bad.data, null);
assert.equal(JSON.stringify(corrupt), beforeBad);
assert.match(sock.out.at(-1).msg, /Cargo save validation failed/);
assert.throws(() => g.importSave({ ...corrupt, name: 'Rejected Import' }), /aggregate mismatch/);
assert.equal(g.db.get('Rejected Import'), null);
console.log(
  'Login/import migrate legacy holds/storage; corrupt premium data is rejected without repair.',
);

// Actual market: grade weighting enters the existing depth/modifier formula once.
d.stellar = 'qstation';
d.sys = 'qgate';
for (const cid of ['ore', 'gas', 'shards']) {
  for (const grade of ['common', 'rich', 'pure']) {
    seed(d, grade === 'common' ? 10 : 0, grade === 'rich' ? 10 : 0, grade === 'pure' ? 10 : 0, cid);
    const port = STELLARS[d.stellar],
      pr = g.market(port).find((c) => c.id === cid).price;
    const multiplier = grade === 'pure' ? 1.6 : grade === 'rich' ? 1.3 : 1;
    const expected = Math.round(
      10 *
        multiplier *
        pr *
        (1 - Math.min(TRADE_IMPACT.max, 10 * TRADE_IMPACT.perTon) / 2) *
        g.features.fronts.mods(d.sys).sell *
        (1 + (g.features.bonuses.bonus(d).tradePct || 0) / 100),
    );
    const credits = d.credits;
    g.onMessage(a, {
      t: 'trade',
      cid,
      qty: -10,
      lots: { common: 0, rich: 0, pure: 0, [grade]: 10 },
    });
    assert.equal(d.credits - credits, expected);
    assert.equal(d.cargo[cid] || 0, 0);
    invariant(d);
  }
}
seed(d, 2, 3, 4);
const denial = JSON.stringify(d);
g.trade(a, 'ore', -2, { common: 0, rich: 0, pure: 2.5 });
assert.equal(JSON.stringify(d), denial);
g.trade(a, 'ore', -3);
assert.deepEqual(lots(d), { common: 0, rich: 2, pure: 4 });
g.trade(a, 'ore', 2);
assert.deepEqual(lots(d), { common: 2, rich: 2, pure: 4 });
seedCargo(d, { food: 3 });
g.trade(a, 'food', -3);
invariant(d);
assert.equal(d.cargo.food || 0, 0);
console.log(
  'All raw grades sell exactly once through market depth/bonuses; repurchases are common; ordinary goods remain compatible.',
);

// Jettison exact grades into multiple real parcels; job cargo constrains recollection.
seed(d, 0, 2, 8);
g.depart(a);
assert.ok(a.ent);
const space = g.spaces[d.sys],
  base = space.loot.length;
g.onMessage(a, { t: 'jettison', cid: 'ore', n: 8, lots: { common: 0, rich: 0, pure: 8 } });
assert.deepEqual(lots(d), { common: 0, rich: 2, pure: 0 });
const parcels = space.loot.slice(base).map((x) => x.it);
assert.equal(
  parcels.reduce((n, x) => n + x.n, 0),
  8,
);
assert.equal(
  parcels.reduce((n, x) => n + x.lots.pure, 0),
  8,
);
space.t += JETTISON_OWNER_GRACE_SECONDS;
const cap = g.features.shipStats.stats(d).cargo;
d.missions = [{ type: 'cargo', qty: cap - 3 }];
assert.equal(g.onLoot(g.pref(a), parcels[0]), false);
assert.equal(d.cargo.ore, 3);
assert.equal(parcels[0].n, 3);
invariant(d);
d.missions = [];
for (const it of parcels) g.onLoot(g.pref(a), it);
assert.deepEqual(lots(d), { common: 0, rich: 2, pure: 8 });
assert.ok(parcels.every((x) => x.n === 0));
g.features.fleetcmd.lootCargo(a, parcels[0]);
assert.equal(d.cargo.ore, 10);
console.log(
  'Jettison and partial recollection preserve premium grades and respect mission hold usage.',
);

// Close stationary jettison must not be instantly auto-scooped by its owner.
{
  const owner = pilot('Grace Owner'),
    foreign = pilot('Grace Foreign');
  owner.data.sys = foreign.data.sys = 'meridian';
  owner.data.stellar = foreign.data.stellar = null;
  owner.data.ship = makeLoadout(g.A, 704);
  foreign.data.ship = makeLoadout(g.A, 704);
  g.spawnPlayer(owner, 50000, 50000, 0, 0);
  const sp = g.spaces.meridian;
  sp.spawnT = 1e9;
  Object.assign(owner.ent, { a: 0, vx: 0, vy: 0, graceT: 1e9, guns: [] });
  seed(owner.data, 0, 2, 0);
  const random = Math.random,
    rolls = [0.5, 0, 0.5, 0.5];
  try {
    Math.random = () => rolls.shift() ?? 0.5;
    g.onMessage(owner, { t: 'jettison', cid: 'ore', n: 2, lots: { common: 0, rich: 2, pure: 0 } });
  } finally {
    Math.random = random;
  }
  const parcel = sp.loot.at(-1),
    original = JSON.stringify(parcel.it);
  assert.ok(Math.hypot(parcel.x - owner.ent.x, parcel.y - owner.ent.y) < 30);
  sp.tick();
  assert.equal(
    owner.data.cargo.ore || 0,
    0,
    'actual first Space.tick leaves dumped cargo outside owner hold',
  );
  assert.equal(sp.loot.includes(parcel), true, 'blocked pickup does not consume parcel');
  assert.equal(
    g.onLoot(g.pref(owner), parcel.it),
    false,
    'root-authority collector cannot bypass grace',
  );
  assert.equal(JSON.stringify(parcel.it), original, 'denial preserves exact mass and grades');
  // Other captains can take part immediately; the remainder retains owner grace.
  seed(foreign.data);
  const capacity = g.features.shipStats.stats(foreign.data).cargo;
  foreign.data.missions = [{ type: 'cargo', qty: capacity - 1 }];
  assert.equal(g.onLoot(g.pref(foreign), parcel.it), false);
  assert.deepEqual(lots(foreign.data), { common: 0, rich: 1, pure: 0 });
  assert.equal(parcel.it.n, 1);
  assert.equal(g.onLoot(g.pref(owner), parcel.it), false);
  // Flight/session identity can change, but stable captain provenance still blocks it.
  const oldEnt = owner.ent;
  g.spawnPlayer(owner, 50000, 50000, 0, 0);
  sp.ships.delete(oldEnt.id);
  Object.assign(owner.ent, { a: 0, vx: 0, vy: 0, graceT: 1e9, guns: [] });
  assert.equal(g.onLoot(g.pref(owner), parcel.it), false);
  const until = parcel.it.jettisonPickup.until;
  sp.t = until - 0.01;
  assert.equal(
    g.onLoot(g.pref(owner), parcel.it),
    false,
    'simulation-time grace includes its final fraction',
  );
  sp.tick();
  assert.deepEqual(
    lots(owner.data),
    { common: 0, rich: 1, pure: 0 },
    'owner can recover exact remainder after grace',
  );
  assert.equal(sp.loot.includes(parcel), false);
  assert.equal(
    (owner.data.cargo.ore || 0) + (foreign.data.cargo.ore || 0),
    2,
    'total mass conserved',
  );
  invariant(owner.data);
  invariant(foreign.data);
  foreign.data.missions = [];
  sp.remove(owner.ent);
  owner.ent = null;
}

// Once-resolved mining parcel: full/partial pickups cannot reroll bonuses or progression.
seed(d);
const miningCap = g.features.shipStats.stats(d).cargo;
d.missions = [{ type: 'cargo', qty: miningCap }];
const parcel = { ore: 'ore', n: 10, rich: 2 };
let rolls = 0;
Math.random = () => {
  rolls++;
  return 0.1;
};
try {
  assert.equal(g.onLoot(g.pref(a), parcel), false);
  const frozen = structuredClone(parcel.remainingLots),
    resolutionRolls = rolls;
  assert.equal(g.onLoot(g.pref(a), parcel), false);
  assert.equal(rolls, resolutionRolls);
  d.missions = [{ type: 'cargo', qty: miningCap - 2 }];
  const mined = d.stats.mined || 0,
    bp = d.bp[805] || 0;
  assert.equal(g.onLoot(g.pref(a), parcel), false);
  assert.equal(d.stats.mined - mined, 2);
  assert.equal(d.bp[805] - bp, 2);
  const afterProgress = rolls;
  d.missions = [];
  d.station.research = { mining: 10 };
  assert.equal(g.onLoot(g.pref(a), parcel), true);
  assert.equal(rolls, afterProgress);
  assert.equal(d.bp[805] - bp, 2);
  assert.equal(d.cargo.ore, frozen.common);
  assert.equal(d.stats.mined - mined, frozen.common);
  assert.equal(g.onLoot(g.pref(a), parcel), true);
  assert.equal(d.cargo.ore, frozen.common);
  invariant(d);
} finally {
  Math.random = oldRandom;
  delete d.station.research;
  d.missions = [];
}
console.log(
  'Mining bonus resolution, accepted-tonne counters and progression token are once-only across retries.',
);

// Existing station processing still costs 12 t + 1,500 cr and uses its crate-grade rules.
a.ent = null;
own(a, 'site-qgate');
seed(d, 12, 0, 12);
const cr = d.credits,
  crate = d.mats.alloy[ORE_PROCESS.grade[3]];
g.onMessage(a, { t: 'station', op: 'process', id: 'ore', lots: { common: 0, rich: 0, pure: 12 } });
assert.equal(d.credits, cr - 1500);
assert.equal(d.mats.alloy[ORE_PROCESS.grade[3]], crate + 1);
assert.deepEqual(lots(d), { common: 12, rich: 0, pure: 0 });
const untouched = JSON.stringify(d);
g.station(a, { op: 'process', id: 'ore', lots: { common: 0, rich: 0, pure: 12 } });
assert.equal(JSON.stringify(d), untouched);
// Supply contracts have no grade requirement and consume common first.
d.missions = [
  {
    id: 'supply-fixture',
    type: 'supply',
    dest: d.stellar,
    cid: 'ore',
    qty: 5,
    reward: 123,
    title: 'Supply ore',
  },
];
g.completeOnLanding(a, STELLARS[d.stellar]);
assert.equal(d.cargo.ore, 7);
assert.deepEqual(lots(d), { common: 7, rich: 0, pure: 0 });
console.log(
  'Station processing preserves 12 t/1,500 cr/crate-grade economics; supply consumes exact common-first lots.',
);

// Exchange escrow survives partial matching and refunds; storage collection includes job cargo.
d.stellar = e.stellar = 'qstation';
d.sys = e.sys = 'qgate';
e.credits = 1e7;
seed(d, 0, 3, 7);
seed(e);
g.onMessage(a, {
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'ore',
  qty: 10,
  price: 100,
});
assert.equal(d.cargo.ore, 0);
const order = g.db.world.orders.at(-1);
assert.deepEqual(order.lots, { common: 0, rich: 3, pure: 7 });
g.onMessage(b, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 5,
  price: 100,
});
assert.deepEqual(e.storageLots.byCommodity.ore, { common: 0, rich: 3, pure: 2 });
assert.deepEqual(order.lots, { common: 0, rich: 0, pure: 5 });
invariant(e);
g.onMessage(a, { t: 'exchange', op: 'cancel', id: order.id });
assert.deepEqual(d.storageLots.byCommodity.ore, { common: 0, rich: 0, pure: 5 });
invariant(d);
const bcap = g.features.shipStats.stats(e).cargo;
e.missions = [{ type: 'cargo', qty: bcap - 1 }];
g.onMessage(b, { t: 'exchange', op: 'collect' });
assert.deepEqual(lots(e), { common: 0, rich: 1, pure: 0 });
assert.equal(e.storage.ore, 4);
e.missions = [];
g.onMessage(b, { t: 'exchange', op: 'collect' });
assert.deepEqual(lots(e), { common: 0, rich: 3, pure: 2 });
assert.equal(e.storage.ore, 0);
// Offline old-save destination storage migrates before delivery.
delete l.data.storageLots;
g.features.frontier.deliver(l.data.name, { kind: 'com', cid: 'gas' }, 2);
invariant(l.data);
assert.equal(l.data.storageLots.byCommodity.gas.common, 5);
// A corrupt destination cannot consume an incoming order's escrow/credits.
e.storageLots.byCommodity.gas = { common: 0, rich: 0, pure: 1 };
seed(d, 0, 0, 2);
g.onMessage(a, {
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
const balance = e.credits,
  book = JSON.stringify(g.db.world.orders);
g.onMessage(b, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
assert.equal(e.credits, balance);
assert.equal(JSON.stringify(g.db.world.orders), book);
delete e.storageLots.byCommodity.gas;
invariant(e);
g.onMessage(a, { t: 'exchange', op: 'cancel', id: g.db.world.orders.at(-1).id });
// Resting offline buyer corruption exercises full-fill preflight and exact seller rollback.
g.onMessage(b, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
const restingBuy = g.db.world.orders.at(-1);
e.storageLots.byCommodity.gas = { common: 0, rich: 0, pure: 1 };
seed(d, 0, 0, 2);
const sellerBefore = JSON.stringify([d.cargo, d.cargoLots, d.credits]),
  restingBefore = JSON.stringify(g.db.world.orders);
g.onMessage(a, {
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
assert.equal(JSON.stringify([d.cargo, d.cargoLots, d.credits]), sellerBefore);
assert.equal(JSON.stringify(g.db.world.orders), restingBefore);
delete e.storageLots.byCommodity.gas;
g.onMessage(b, { t: 'exchange', op: 'cancel', id: restingBuy.id });
console.log(
  'Exchange escrow, partial fill, refund, offline migration and job-aware collection conserve every grade; corrupt destination rolls back.',
);

// A post-commit notification failure cannot refund/mint escrow or lose the remainder.
seed(d, 0, 0, 2);
g.onMessage(b, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 1,
  price: 100,
});
const notify = g.features.frontier.notify,
  beforeNoticeCredits = d.credits;
g.features.frontier.notify = () => {
  throw new Error('fixture notification failure');
};
try {
  assert.throws(
    () =>
      g.features.frontier.exchangeOp(a, {
        op: 'place',
        side: 'sell',
        kind: 'com',
        cid: 'ore',
        qty: 2,
        price: 100,
      }),
    /fixture notification failure/,
  );
} finally {
  g.features.frontier.notify = notify;
}
assert.equal(d.cargo.ore, 0);
assert.equal(d.credits, beforeNoticeCredits + 98);
assert.deepEqual(e.storageLots.byCommodity.ore, { common: 0, rich: 0, pure: 1 });
const remainder = g.db.world.orders.at(-1);
assert.equal(remainder.qty, 1);
assert.deepEqual(remainder.lots, { common: 0, rich: 0, pure: 1 });
g.db.flush();
assert.equal(new DB(g.db.dir).world.orders.at(-1).lots.pure, 1);
g.features.frontier.exchangeOp(a, { op: 'cancel', id: remainder.id });
clearLots(e.storage, e.storageLots);
console.log(
  'Post-commit notification failure preserves paid fill and exact durable pending escrow without refunds.',
);

// Captain-to-captain trade preflights both sides and leaves excess in graded storage.
own(a, 'site-qgate');
own(b, 'site-meridian');
seed(d, 0, 0, 4);
seed(e, 0, 3, 0);
e.missions = [{ type: 'cargo', qty: bcap }];
const T = {
  id: 'fixture-trade',
  a: d.name,
  b: e.name,
  give: {
    [d.name]: {
      credits: 1000,
      items: { 'cargo:ore': 4 },
      lots: { ore: { common: 0, rich: 0, pure: 4 } },
    },
    [e.name]: { items: { 'cargo:ore': 3 }, lots: { ore: { common: 0, rich: 3, pure: 0 } } },
  },
};
g.trades[T.id] = T;
g.features.coop.tradeDo(T);
assert.equal(e.cargo.ore, 0);
assert.equal(e.storageLots.byCommodity.ore.pure, 4);
assert.equal(lots(d).rich, 3);
invariant(e);
seed(d, 0, 0, 1);
seed(e, 0, 1, 0);
const badTrade = structuredClone(T);
badTrade.id = 'bad-trade';
badTrade.give[d.name].items['cargo:ore'] = 1;
badTrade.give[d.name].lots.ore.pure = 1;
badTrade.give[e.name].items['cargo:ore'] = 1;
badTrade.give[e.name].lots.ore = { common: 0, rich: 0, pure: 1 };
g.trades[badTrade.id] = badTrade;
const aBefore = JSON.stringify(d),
  bBefore = JSON.stringify(e);
g.features.coop.tradeDo(badTrade);
assert.equal(JSON.stringify(d), aBefore);
assert.equal(JSON.stringify(e), bBefore);
e.missions = [];
e.stellar = 'qstation';
e.sys = 'qgate';
g.features.frontier.exchangeOp(b, { op: 'collect' });
assert.equal(lots(e).pure, 4);
console.log(
  'Captain swap preserves both exact offers, preflights both sides and retains full-hold premium goods in station storage.',
);

// Colony production is newly common, leaves fractional/unaccepted production behind.
d.stellar = 'qstation';
d.sys = 'qgate';
seed(d);
d.missions = [{ type: 'cargo', qty: cap - 2 }];
g.db.world.colonies[d.stellar] = {
  owner: g.db.key(d.name),
  lv: 1,
  buildings: [],
  store: { ore: 5.5 },
  t: Date.now(),
  name: 'Fixture',
};
g.features.frontier.colonyOp(a, { op: 'collect' });
assert.deepEqual(lots(d), { common: 2, rich: 0, pure: 0 });
assert.equal(g.db.world.colonies[d.stellar].store.ore, 3.5);
d.missions = [];
// Actual disabled-ship boarding producer; deterministic commodity = raw ore.
seed(d);
g.depart(a);
const sp = g.spaces[d.sys],
  target = sp.makeShip({ hull: 703, faction: 'hollow', x: a.ent.x, y: a.ent.y });
target.disabled = true;
target.vx = a.ent.vx;
target.vy = a.ent.vy;
const oreIndex = COMMODITIES.findIndex((c) => c.id === 'ore');
let randomCalls = 0;
Math.random = () => (++randomCalls === 2 ? (oreIndex + 0.1) / COMMODITIES.length : 0.4);
try {
  g.features.hangar.board(a, { id: target.id, act: 'plunder' });
} finally {
  Math.random = oldRandom;
}
assert.ok(d.cargo.ore > 0);
assert.equal(lots(d).common, d.cargo.ore);
console.log(
  'Colony collection and real disabled-ship plunder produce common lots with correct capacity.',
);

// Death clears matching totals+ledger; Lodestar preserves both exactly.
seed(d, 1, 2, 3);
g.onPlayerDeath(g.pref(a), sp);
assert.deepEqual(d.cargo, {});
assert.deepEqual(d.cargoLots.byCommodity, {});
d.ship = makeLoadout(g.A, 805, 'Lodestar');
seed(d, 1, 2, 3);
const protectedHold = JSON.stringify([d.cargo, d.cargoLots]);
g.onPlayerDeath(g.pref(a), sp);
assert.equal(JSON.stringify([d.cargo, d.cargoLots]), protectedHold);
invariant(d);
console.log('Death clears paired inventory; Lodestar preserves paired premium inventory.');
console.log('ALL PRODUCTION CARGO FLOW TESTS PASSED');
