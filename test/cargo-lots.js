import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DB } from '../server/db.js';
import {
  migrateCargoLots,
  assertLots,
  planTake,
  applyTake,
  addLots,
  moveLots,
  clearLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.js';
const _clone = (v) => structuredClone(v);
const snap = (v) => JSON.stringify(v);
function inventory(cargo = {}, storage = {}) {
  const p = { cargo, storage };
  assert.deepEqual(migrateCargoLots(p), { changed: true });
  return p;
}
function deniedUnchanged(subject, fn, pattern) {
  const before = snap(subject);
  assert.throws(fn, pattern);
  assert.equal(snap(subject), before, 'denied operation must not mutate inventory');
}
const transfer = (cid, common, rich = 0, pure = 0) => ({
  cid,
  qty: common + rich + pure,
  grades: { common, rich, pure },
});

// Descriptor hardening: every denial is atomic on the actual records, not clones.
const hardeningFailures = [];
function hardeningCase(name, fn) {
  try {
    fn();
  } catch (error) {
    hardeningFailures.push(new Error(name, { cause: error }));
  }
}
for (const block of [
  (p) => Object.freeze(p.cargo),
  (p) => Object.preventExtensions(p.cargo),
  (p) => Object.defineProperty(p.cargo, 'ore', { value: 0, writable: false, enumerable: true }),
  (p) => Object.freeze(p.cargoLots.byCommodity),
  (p) => Object.preventExtensions(p.cargoLots.byCommodity),
  (p) =>
    Object.defineProperty(p.cargoLots.byCommodity, 'ore', {
      value: { common: 0, rich: 0, pure: 0 },
      writable: false,
      enumerable: true,
    }),
]) {
  hardeningCase('add blocked destination', () => {
    const p = inventory();
    block(p);
    deniedUnchanged(p, () => addLots(p.cargo, p.cargoLots, commonLots('ore', 1)));
  });
  hardeningCase('move blocked actual destination', () => {
    const source = inventory({ ore: 2 }),
      target = inventory();
    block(target);
    deniedUnchanged([source, target], () =>
      moveLots(source.cargo, source.cargoLots, target.cargo, target.cargoLots, 'ore', 1),
    );
  });
}
for (const block of [
  (p) => Object.freeze(p.cargo),
  (p) => Object.defineProperty(p.cargo, 'ore', { writable: false }),
  (p) => Object.freeze(p.cargoLots.byCommodity),
])
  hardeningCase('withdrawal and move blocked source', () => {
    const source = inventory({ ore: 2 }),
      target = inventory();
    const plan = planTake(source.cargo, source.cargoLots, 'ore', 1);
    block(source);
    deniedUnchanged(source, () => applyTake(source.cargo, source.cargoLots, plan));
    deniedUnchanged([source, target], () =>
      moveLots(source.cargo, source.cargoLots, target.cargo, target.cargoLots, 'ore', 1),
    );
  });
for (const block of [
  (p) => Object.freeze(p),
  (p) => Object.preventExtensions(p),
  (p) =>
    Object.defineProperty(p, 'storageLots', {
      value: undefined,
      writable: false,
      enumerable: true,
    }),
  (p) =>
    Object.defineProperty(p, 'storage', { value: undefined, writable: false, enumerable: true }),
])
  hardeningCase('migration blocked owner destination', () => {
    const p = { cargo: { ore: 2 } };
    block(p);
    deniedUnchanged(p, () => migrateCargoLots(p));
  });
for (const block of [
  (p) => Object.defineProperty(p.cargo, 'food', { configurable: false }),
  (p) => Object.freeze(p.cargo),
  (p) => Object.defineProperty(p.cargoLots, 'byCommodity', { writable: false }),
])
  hardeningCase('clear blocked deletion or ledger replacement', () => {
    const p = inventory({ ore: 2, food: 3 });
    block(p);
    deniedUnchanged(p, () => clearLots(p.cargo, p.cargoLots));
  });
hardeningCase('forged plan getter never executes', () => {
  const p = inventory({ ore: 2 });
  let reads = 0;
  const forged = {
    get cid() {
      reads++;
      p.cargo.ore = 99;
      return 'ore';
    },
  };
  deniedUnchanged(p, () => applyTake(p.cargo, p.cargoLots, forged), /untrusted/);
  assert.equal(reads, 0);
});
for (const key of ['cargo', 'storage', 'cargoLots', 'storageLots']) {
  hardeningCase('owner ' + key + ' getter never executes', () => {
    let reads = 0;
    const p = { cargo: { ore: 2 } };
    Object.defineProperty(p, key, {
      enumerable: true,
      get() {
        reads++;
        return undefined;
      },
    });
    const before = Object.getOwnPropertyDescriptors(p);
    assert.throws(() => migrateCargoLots(p), /data properties/);
    assert.equal(reads, 0);
    assert.deepEqual(Object.getOwnPropertyDescriptors(p), before);
  });
}
hardeningCase('normal player fields need not be cargo records', () => {
  let reads = 0;
  const p = {
    cargo: { ore: 2 },
    name: 'Captain',
    items: [],
    save() {},
    get unrelated() {
      reads++;
      return 42;
    },
  };
  migrateCargoLots(p);
  assert.equal(reads, 0);
  assertLots(p.cargo, p.cargoLots);
});
hardeningCase('nonplain owner rejected before inherited getter', () => {
  let reads = 0;
  const p = Object.create({
    get cargo() {
      reads++;
      return {};
    },
  });
  assert.throws(() => migrateCargoLots(p), /plain record/);
  assert.equal(reads, 0);
});
hardeningCase('sealed existing destinations remain supported when writable', () => {
  const p = inventory({ ore: 2 });
  Object.seal(p.cargo);
  Object.seal(p.cargoLots.byCommodity);
  addLots(p.cargo, p.cargoLots, commonLots('ore', 1));
  assert.equal(p.cargo.ore, 3);
  applyTake(p.cargo, p.cargoLots, planTake(p.cargo, p.cargoLots, 'ore', 1));
  assert.equal(p.cargo.ore, 2);
});
if (hardeningFailures.length)
  throw new AggregateError(hardeningFailures, 'Cargo descriptor regressions');

// Old raw cargo and off-ship storage migrate without altering unrelated goods,
// existing field richness, material crate numeric grade, or cargo cost basis.
const old = {
  cargo: { ore: 7, gas: 2, shards: 1, food: 9 },
  storage: { ore: 4 },
  rich: 2,
  materials: [{ grade: 3 }],
  paid: { ore: 90 },
};
const originals = snap(old);
assert.equal(migrateCargoLots(old).changed, true);
assert.deepEqual(old.cargoLots.byCommodity.ore, { common: 7, rich: 0, pure: 0 });
assert.deepEqual(old.storageLots.byCommodity.ore, { common: 4, rich: 0, pure: 0 });
assert.equal(old.cargoLots.byCommodity.food, undefined);
const migrated = snap(old),
  ledgerRef = old.cargoLots;
assert.deepEqual(migrateCargoLots(old), { changed: false });
assert.equal(snap(old), migrated);
assert.equal(old.cargoLots, ledgerRef);
const { cargoLots, storageLots, ...unchanged } = old;
assert.equal(snap(unchanged), originals);
addLots(old.cargo, old.cargoLots, transfer('ore', 0, 2, 1));
assert.equal(migrateCargoLots(old).changed, false);
assert.deepEqual(old.cargoLots.byCommodity.ore, { common: 7, rich: 2, pure: 1 });

assert.throws(
  () => migrateCargoLots({ cargo: Object.defineProperty({}, 'ore', { value: NaN }) }),
  /serializable/,
);
assert.throws(
  () =>
    migrateCargoLots({
      cargo: {
        get ore() {
          throw Error('getter must not run');
        },
      },
    }),
  /serializable/,
);
assert.throws(() => migrateCargoLots({ cargo: null }));
assert.throws(() => migrateCargoLots({ storage: null }));

// A bad storage ledger cannot cause a half-migrated cargo record.
const corrupt = {
  cargo: { ore: 3 },
  storage: { gas: 1 },
  storageLots: { version: 2, byCommodity: {} },
};
deniedUnchanged(corrupt, () => migrateCargoLots(corrupt), /version/);
for (const bad of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => migrateCargoLots({ cargo: { ore: bad } }));
}
for (const badLedger of [
  null,
  { version: 99, byCommodity: {} },
  { version: 1, byCommodity: { ore: { common: 2, rich: 0, pure: 0 } } },
  { version: 1, byCommodity: { ore: { common: 1, rich: 0, pure: 0, legendary: 1 } } },
  { version: 1, byCommodity: { food: { common: 1, rich: 0, pure: 0 } } },
  JSON.parse('{"version":1,"byCommodity":{"__proto__":{"common":1,"rich":0,"pure":0}}}'),
  { version: 1, byCommodity: Object.create({ ore: { common: 1, rich: 0, pure: 0 } }) },
])
  assert.throws(() => migrateCargoLots({ cargo: { ore: 1 }, cargoLots: badLedger }));
assert.throws(() => migrateCargoLots({ cargo: JSON.parse('{"__proto__":1}') }));
assert.throws(() => planTake(old.cargo, old.cargoLots, 'constructor', 0));
assert.throws(() =>
  planTake(old.cargo, old.cargoLots, 'ore', 1, Object.create({ common: 1, rich: 0, pure: 0 })),
);

const a = inventory();
addLots(a.cargo, a.cargoLots, transfer('ore', 4, 3, 2));
const plan = planTake(a.cargo, a.cargoLots, 'ore', 6);
assert.deepEqual(plan.grades, { common: 4, rich: 2, pure: 0 });
assert.equal(a.cargo.ore, 9, 'planning is read-only');
assert.throws(() => {
  plan.grades.pure = 2;
}, TypeError);
applyTake(a.cargo, a.cargoLots, plan);
assert.equal(a.cargo.ore, 3);
assert.deepEqual(a.cargoLots.byCommodity.ore, { common: 0, rich: 1, pure: 2 });
deniedUnchanged(a, () => applyTake(a.cargo, a.cargoLots, plan), /stale|untrusted/);
deniedUnchanged(a, () => applyTake(a.cargo, a.cargoLots, transfer('ore', 0, 1)), /untrusted/);
deniedUnchanged(
  a,
  () => planTake(a.cargo, a.cargoLots, 'ore', 2, { common: 0, rich: 2, pure: 0 }),
  /unavailable/,
);
deniedUnchanged(
  a,
  () => planTake(a.cargo, a.cargoLots, 'ore', 2, { common: 0, rich: 0, pure: 1 }),
  /unavailable/,
);
const stale = planTake(a.cargo, a.cargoLots, 'ore', 1);
addLots(a.cargo, a.cargoLots, transfer('ore', 1));
deniedUnchanged(a, () => applyTake(a.cargo, a.cargoLots, stale), /stale/);

// Transfer to limited hold uses caller's holdUsed INCLUDING mission cargo.
const b = inventory({ food: 2 });
const hold = 7,
  jobCargo = 4,
  room = hold - b.cargo.food - jobCargo;
const credits = { source: 20, target: 30 };
deniedUnchanged(
  [a, b, credits],
  () => moveLots(a.cargo, a.cargoLots, b.cargo, b.cargoLots, 'ore', 2, 'common-first', room),
  /capacity/,
);
const moved = moveLots(a.cargo, a.cargoLots, b.storage, b.storageLots, 'ore', 2, {
  common: 0,
  rich: 0,
  pure: 2,
});
assert.deepEqual(moved.grades, { common: 0, rich: 0, pure: 2 });
assert.equal(a.cargo.ore, 2);
assert.equal(b.storage.ore, 2);
moveLots(
  b.storage,
  b.storageLots,
  b.cargo,
  b.cargoLots,
  'ore',
  1,
  { common: 0, rich: 0, pure: 1 },
  room,
);
assert.equal(b.storage.ore, 1);
assert.deepEqual(b.cargoLots.byCommodity.ore, { common: 0, rich: 0, pure: 1 });
deniedUnchanged(b, () => moveLots(b.cargo, b.cargoLots, b.cargo, b.cargoLots, 'ore', 1), /aliased/);

const zero = inventory(),
  zeroTarget = inventory();
const zeroBefore = snap([zero, zeroTarget]);
addLots(zero.cargo, zero.cargoLots, commonLots('ore', 0), 0);
applyTake(zero.cargo, zero.cargoLots, planTake(zero.cargo, zero.cargoLots, 'ore', 0));
moveLots(zero.cargo, zero.cargoLots, zeroTarget.cargo, zeroTarget.cargoLots, 'ore', 0);
assert.equal(snap([zero, zeroTarget]), zeroBefore, 'zero/full-hold operations are byte-stable');

// Partial pickups retain a fixed remainder; repeated full holds neither roll nor
// mutate it, and alternating recipients cannot launder premium tonnes.
let remaining = { common: 3, rich: 2, pure: 1 };
const collector = inventory();
for (const capacity of [0, 2, 0, 3, 1]) {
  const qty = Math.min(capacity, remaining.common + remaining.rich + remaining.pure);
  const selected = splitLots(remaining, qty);
  addLots(collector.cargo, collector.cargoLots, { cid: 'shards', qty, grades: selected }, capacity);
  for (const g of ['common', 'rich', 'pure']) remaining[g] -= selected[g];
  assertLots(collector.cargo, collector.cargoLots);
  assert.equal(
    (collector.cargo.shards || 0) + remaining.common + remaining.rich + remaining.pure,
    6,
  );
}
assert.deepEqual(collector.cargoLots.byCommodity.shards, { common: 3, rich: 2, pure: 1 });
assert.deepEqual(remaining, { common: 0, rich: 0, pure: 0 });
// A market repurchase is new common production, not restoration of sold grades.
applyTake(
  collector.cargo,
  collector.cargoLots,
  planTake(collector.cargo, collector.cargoLots, 'shards', 1, { common: 0, rich: 0, pure: 1 }),
);
addLots(collector.cargo, collector.cargoLots, commonLots('shards', 1));
assert.deepEqual(collector.cargoLots.byCommodity.shards, { common: 4, rich: 2, pure: 0 });
addLots(collector.cargo, collector.cargoLots, commonLots('food', 3));
assert.equal(collector.cargoLots.byCommodity.food, undefined);
deniedUnchanged(
  collector,
  () => addLots(collector.cargo, collector.cargoLots, transfer('food', 0, 1)),
  /invalid transfer/,
);
deniedUnchanged(
  collector,
  () =>
    addLots(collector.cargo, collector.cargoLots, {
      cid: 'ore',
      qty: 2,
      grades: { common: 1, rich: 0, pure: 0 },
    }),
  /invalid transfer/,
);
const max = inventory({ ore: Number.MAX_SAFE_INTEGER });
deniedUnchanged(
  max,
  () => addLots(max.cargo, max.cargoLots, commonLots('ore', 1)),
  /invalid quantity/,
);

// A declined/cancelled escrow restores the exact withdrawn lots, not common.
const escrowOwner = inventory();
addLots(escrowOwner.cargo, escrowOwner.cargoLots, transfer('gas', 1, 2, 3));
const escrowBefore = snap(escrowOwner);
const escrow = applyTake(
  escrowOwner.cargo,
  escrowOwner.cargoLots,
  planTake(escrowOwner.cargo, escrowOwner.cargoLots, 'gas', 4, { common: 0, rich: 1, pure: 3 }),
);
addLots(escrowOwner.cargo, escrowOwner.cargoLots, escrow);
assert.equal(snap(escrowOwner), escrowBefore);

// Seeded mixed moves preserve every commodity/grade, not merely aggregate mass.
const p = inventory(),
  q = inventory();
for (const cid of ['ore', 'gas', 'shards'])
  addLots(p.cargo, p.cargoLots, transfer(cid, 40, 30, 20));
let seed = 42;
for (let i = 0; i < 600; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const cid = ['ore', 'gas', 'shards'][seed % 3],
    [src, dst] = seed & 8 ? [p, q] : [q, p];
  const qty = Math.min(src.cargo[cid] || 0, (seed >>> 8) % 9);
  moveLots(src.cargo, src.cargoLots, dst.cargo, dst.cargoLots, cid, qty);
  assertLots(p.cargo, p.cargoLots);
  assertLots(q.cargo, q.cargoLots);
  const left = p.cargoLots.byCommodity[cid],
    right = q.cargoLots.byCommodity[cid];
  for (const [grade, total] of [
    ['common', 40],
    ['rich', 30],
    ['pure', 20],
  ])
    assert.equal((left?.[grade] || 0) + (right?.[grade] || 0), total);
}

// Real DB serialization roundtrip of the versioned ledger; isolated temp save.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-cargo-lots-'));
try {
  const db = new DB(dir);
  db.players.captain = { name: 'Captain', salt: '', hash: '', created: 0, ...p };
  db.dirty = true;
  db.flush();
  const reload = new DB(dir).players.captain;
  assert.equal(migrateCargoLots(reload).changed, false);
  assert.deepEqual(reload.cargoLots, p.cargoLots);
  assertLots(reload.cargo, reload.cargoLots);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
clearLots(p.cargo, p.cargoLots);
assert.deepEqual(p.cargo, {});
assert.deepEqual(p.cargoLots, { version: 1, byCommodity: {} });
assertLots(p.cargo, p.cargoLots);
console.log(
  'Cargo lots: migration, exact-grade accounting, denial atomicity, storage/capacity, fixed partial lots, seeded conservation and real save roundtrip passed.',
);
