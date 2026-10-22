import { requiredFixtureValue } from './helpers/required.ts';
import { mockPlayerAccount } from './helpers/mocks.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { DB as Database } from '../server/db.ts';
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
} from '../shared/cargo-lots.ts';
import type {
  CargoOwner,
  CargoTotals,
  CargoLedger,
  LotTransfer,
} from '../shared/cargo-contracts.ts';
type Inventory = {
  cargo: CargoTotals;
  storage: CargoTotals;
  cargoLots: CargoLedger;
  storageLots: CargoLedger;
};
const _clone = <Value>(value: Value): Value => structuredClone(value);
const snap = (value: unknown) => JSON.stringify(value);
function inventory(
  cargo: Record<string, unknown> = {},
  storage: Record<string, unknown> = {},
): Inventory {
  const player: CargoOwner = { cargo: cargo as CargoTotals, storage: storage as CargoTotals };
  assert.deepEqual(migrateCargoLots(player), { changed: true });
  assert.ok(player.cargoLots && player.storageLots);
  return player as Inventory;
}
function deniedUnchanged(subject: unknown, callback: () => unknown, pattern?: RegExp | Error) {
  const before = snap(subject);
  if (pattern) assert.throws(callback, pattern);
  else assert.throws(callback);
  assert.equal(snap(subject), before, 'denied operation must not mutate inventory');
}
const transfer = (commodityId: string, common: number, rich = 0, pure = 0) => ({
  cid: commodityId,
  qty: common + rich + pure,
  grades: { common, rich, pure },
});

// Descriptor hardening: every denial is atomic on the actual records, not clones.
const hardeningFailures: Error[] = [];
function hardeningCase(name: string, callback2: () => void) {
  try {
    callback2();
  } catch (error) {
    hardeningFailures.push(new Error(name, { cause: error }));
  }
}
for (const block of [
  (player: Inventory) => Object.freeze(player.cargo),
  (player: Inventory) => Object.preventExtensions(player.cargo),
  (player: Inventory) =>
    Object.defineProperty(player.cargo, 'ore', { value: 0, writable: false, enumerable: true }),
  (player: Inventory) => Object.freeze(player.cargoLots.byCommodity),
  (player: Inventory) => Object.preventExtensions(player.cargoLots.byCommodity),
  (player: Inventory) =>
    Object.defineProperty(player.cargoLots.byCommodity, 'ore', {
      value: { common: 0, rich: 0, pure: 0 },
      writable: false,
      enumerable: true,
    }),
]) {
  hardeningCase('add blocked destination', () => {
    const player = inventory();
    block(player);
    deniedUnchanged(player, () => addLots(player.cargo, player.cargoLots, commonLots('ore', 1)));
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
  (player: Inventory) => Object.freeze(player.cargo),
  (player: Inventory) => Object.defineProperty(player.cargo, 'ore', { writable: false }),
  (player: Inventory) => Object.freeze(player.cargoLots.byCommodity),
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
  (player: CargoOwner) => Object.freeze(player),
  (player: CargoOwner) => Object.preventExtensions(player),
  (player: CargoOwner) =>
    Object.defineProperty(player, 'storageLots', {
      value: undefined,
      writable: false,
      enumerable: true,
    }),
  (player: CargoOwner) =>
    Object.defineProperty(player, 'storage', {
      value: undefined,
      writable: false,
      enumerable: true,
    }),
])
  hardeningCase('migration blocked owner destination', () => {
    const player = { cargo: { ore: 2 } };
    block(player);
    deniedUnchanged(player, () => migrateCargoLots(player));
  });
for (const block of [
  (player: Inventory) => Object.defineProperty(player.cargo, 'food', { configurable: false }),
  (player: Inventory) => Object.freeze(player.cargo),
  (player: Inventory) =>
    Object.defineProperty(player.cargoLots, 'byCommodity', { writable: false }),
])
  hardeningCase('clear blocked deletion or ledger replacement', () => {
    const player = inventory({ ore: 2, food: 3 });
    block(player);
    deniedUnchanged(player, () => clearLots(player.cargo, player.cargoLots));
  });
hardeningCase('forged plan getter never executes', () => {
  const player = inventory({ ore: 2 });
  let reads = 0;
  const forged = {
    get cid() {
      reads++;
      player.cargo.ore = 99;
      return 'ore';
    },
  };
  deniedUnchanged(
    player,
    () => applyTake(player.cargo, player.cargoLots, forged as unknown as LotTransfer),
    /untrusted/,
  );
  assert.equal(reads, 0);
});
for (const propertyKey of ['cargo', 'storage', 'cargoLots', 'storageLots']) {
  hardeningCase('owner ' + propertyKey + ' getter never executes', () => {
    let reads = 0;
    const player = { cargo: { ore: 2 } };
    Object.defineProperty(player, propertyKey, {
      enumerable: true,
      get() {
        reads++;
        return undefined;
      },
    });
    const before = Object.getOwnPropertyDescriptors(player);
    assert.throws(() => migrateCargoLots(player), /data properties/);
    assert.equal(reads, 0);
    assert.deepEqual(Object.getOwnPropertyDescriptors(player), before);
  });
}
hardeningCase('normal player fields need not be cargo records', () => {
  let reads = 0;
  const player = {
    cargo: { ore: 2 },
    name: 'Captain',
    items: [],
    save() {},
    get unrelated() {
      reads++;
      return 42;
    },
  };
  migrateCargoLots(player);
  assert.equal(reads, 0);
  assertLots(player.cargo, requiredFixtureValue((player as CargoOwner).cargoLots));
});
hardeningCase('nonplain owner rejected before inherited getter', () => {
  let reads = 0;
  const player = Object.create({
    get cargo() {
      reads++;
      return {};
    },
  });
  assert.throws(() => migrateCargoLots(player), /plain record/);
  assert.equal(reads, 0);
});
hardeningCase('sealed existing destinations remain supported when writable', () => {
  const player = inventory({ ore: 2 });
  Object.seal(player.cargo);
  Object.seal(player.cargoLots.byCommodity);
  addLots(player.cargo, player.cargoLots, commonLots('ore', 1));
  assert.equal(player.cargo.ore, 3);
  applyTake(player.cargo, player.cargoLots, planTake(player.cargo, player.cargoLots, 'ore', 1));
  assert.equal(player.cargo.ore, 2);
});
if (hardeningFailures.length)
  throw new AggregateError(hardeningFailures, 'Cargo descriptor regressions');

// Old raw cargo and off-ship storage migrate without altering unrelated goods,
// existing field richness, material crate numeric grade, or cargo cost basis.
const previousState: CargoOwner & {
  cargo: CargoTotals;
  storage: CargoTotals;
  rich: number;
  materials: { grade: number }[];
  paid: CargoTotals;
} = {
  cargo: { ore: 7, gas: 2, shards: 1, food: 9 },
  storage: { ore: 4 },
  rich: 2,
  materials: [{ grade: 3 }],
  paid: { ore: 90 },
};
const originals = snap(previousState);
assert.equal(migrateCargoLots(previousState).changed, true);
assert.ok(previousState.cargoLots && previousState.storageLots);
assert.deepEqual(previousState.cargoLots.byCommodity.ore, { common: 7, rich: 0, pure: 0 });
assert.deepEqual(previousState.storageLots.byCommodity.ore, { common: 4, rich: 0, pure: 0 });
assert.equal(previousState.cargoLots.byCommodity.food, undefined);
const migrated = snap(previousState),
  ledgerRef = previousState.cargoLots;
assert.deepEqual(migrateCargoLots(previousState), { changed: false });
assert.equal(snap(previousState), migrated);
assert.equal(previousState.cargoLots, ledgerRef);
const { cargoLots, storageLots, ...unchanged } = previousState;
assert.equal(snap(unchanged), originals);
addLots(previousState.cargo, previousState.cargoLots, transfer('ore', 0, 2, 1));
assert.equal(migrateCargoLots(previousState).changed, false);
assert.deepEqual(previousState.cargoLots.byCommodity.ore, { common: 7, rich: 2, pure: 1 });

assert.throws(
  () => migrateCargoLots({ cargo: Object.defineProperty({}, 'ore', { value: NaN }) }),
  /serializable/,
);
assert.throws(
  () =>
    migrateCargoLots({
      cargo: {
        get ore(): number {
          throw Error('getter must not run');
        },
      },
    }),
  /serializable/,
);
assert.throws(() => migrateCargoLots({ cargo: null } as unknown as CargoOwner));
assert.throws(() => migrateCargoLots({ storage: null } as unknown as CargoOwner));

// A bad storage ledger cannot cause a half-migrated cargo record.
const corrupt = {
  cargo: { ore: 3 },
  storage: { gas: 1 },
  storageLots: { version: 2, byCommodity: {} },
};
deniedUnchanged(corrupt, () => migrateCargoLots(corrupt as unknown as CargoOwner), /version/);
for (const invalidValue of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => migrateCargoLots({ cargo: { ore: invalidValue } }));
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
assert.throws(() =>
  planTake(previousState.cargo, requiredFixtureValue(previousState.cargoLots), 'constructor', 0),
);
assert.throws(() =>
  planTake(
    previousState.cargo,
    requiredFixtureValue(previousState.cargoLots),
    'ore',
    1,
    Object.create({ common: 1, rich: 0, pure: 0 }),
  ),
);

const firstEntry = inventory();
addLots(firstEntry.cargo, firstEntry.cargoLots, transfer('ore', 4, 3, 2));
const plan = planTake(firstEntry.cargo, firstEntry.cargoLots, 'ore', 6);
assert.deepEqual(plan.grades, { common: 4, rich: 2, pure: 0 });
assert.equal(firstEntry.cargo.ore, 9, 'planning is read-only');
assert.throws(() => {
  plan.grades.pure = 2;
}, TypeError);
applyTake(firstEntry.cargo, firstEntry.cargoLots, plan);
assert.equal(firstEntry.cargo.ore, 3);
assert.deepEqual(firstEntry.cargoLots.byCommodity.ore, { common: 0, rich: 1, pure: 2 });
deniedUnchanged(
  firstEntry,
  () => applyTake(firstEntry.cargo, firstEntry.cargoLots, plan),
  /stale|untrusted/,
);
deniedUnchanged(
  firstEntry,
  () => applyTake(firstEntry.cargo, firstEntry.cargoLots, transfer('ore', 0, 1)),
  /untrusted/,
);
deniedUnchanged(
  firstEntry,
  () => planTake(firstEntry.cargo, firstEntry.cargoLots, 'ore', 2, { common: 0, rich: 2, pure: 0 }),
  /unavailable/,
);
deniedUnchanged(
  firstEntry,
  () => planTake(firstEntry.cargo, firstEntry.cargoLots, 'ore', 2, { common: 0, rich: 0, pure: 1 }),
  /unavailable/,
);
const stale = planTake(firstEntry.cargo, firstEntry.cargoLots, 'ore', 1);
addLots(firstEntry.cargo, firstEntry.cargoLots, transfer('ore', 1));
deniedUnchanged(
  firstEntry,
  () => applyTake(firstEntry.cargo, firstEntry.cargoLots, stale),
  /stale/,
);

// Transfer to limited hold uses caller's holdUsed INCLUDING mission cargo.
const secondEntry = inventory({ food: 2 });
const hold = 7,
  jobCargo = 4,
  room = hold - secondEntry.cargo.food - jobCargo;
const credits = { source: 20, target: 30 };
deniedUnchanged(
  [firstEntry, secondEntry, credits],
  () =>
    moveLots(
      firstEntry.cargo,
      firstEntry.cargoLots,
      secondEntry.cargo,
      secondEntry.cargoLots,
      'ore',
      2,
      'common-first',
      room,
    ),
  /capacity/,
);
const moved = moveLots(
  firstEntry.cargo,
  firstEntry.cargoLots,
  secondEntry.storage,
  secondEntry.storageLots,
  'ore',
  2,
  {
    common: 0,
    rich: 0,
    pure: 2,
  },
);
assert.deepEqual(moved.grades, { common: 0, rich: 0, pure: 2 });
assert.equal(firstEntry.cargo.ore, 2);
assert.equal(secondEntry.storage.ore, 2);
moveLots(
  secondEntry.storage,
  secondEntry.storageLots,
  secondEntry.cargo,
  secondEntry.cargoLots,
  'ore',
  1,
  { common: 0, rich: 0, pure: 1 },
  room,
);
assert.equal(secondEntry.storage.ore, 1);
assert.deepEqual(secondEntry.cargoLots.byCommodity.ore, { common: 0, rich: 0, pure: 1 });
deniedUnchanged(
  secondEntry,
  () =>
    moveLots(
      secondEntry.cargo,
      secondEntry.cargoLots,
      secondEntry.cargo,
      secondEntry.cargoLots,
      'ore',
      1,
    ),
  /aliased/,
);

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
  const quantity = Math.min(capacity, remaining.common + remaining.rich + remaining.pure);
  const selected = splitLots(remaining, quantity);
  addLots(
    collector.cargo,
    collector.cargoLots,
    { cid: 'shards', qty: quantity, grades: selected },
    capacity,
  );
  for (const game of ['common', 'rich', 'pure'] as const) remaining[game] -= selected[game];
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
const maximum = inventory({ ore: Number.MAX_SAFE_INTEGER });
deniedUnchanged(
  maximum,
  () => addLots(maximum.cargo, maximum.cargoLots, commonLots('ore', 1)),
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
const player = inventory(),
  fixtureState = inventory();
for (const commodityId of ['ore', 'gas', 'shards'])
  addLots(player.cargo, player.cargoLots, transfer(commodityId, 40, 30, 20));
let seed = 42;
for (let index = 0; index < 600; index++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const commodityId = ['ore', 'gas', 'shards'][seed % 3],
    [source2, destination] = seed & 8 ? [player, fixtureState] : [fixtureState, player];
  const quantity = Math.min(source2.cargo[commodityId] || 0, (seed >>> 8) % 9);
  moveLots(
    source2.cargo,
    source2.cargoLots,
    destination.cargo,
    destination.cargoLots,
    commodityId,
    quantity,
  );
  assertLots(player.cargo, player.cargoLots);
  assertLots(fixtureState.cargo, fixtureState.cargoLots);
  const left = player.cargoLots.byCommodity[commodityId],
    right = fixtureState.cargoLots.byCommodity[commodityId];
  for (const [grade, total] of [
    ['common', 40],
    ['rich', 30],
    ['pure', 20],
  ] as const)
    assert.equal((left?.[grade] || 0) + (right?.[grade] || 0), total);
}

// Real DB serialization roundtrip of the versioned ledger; isolated temp save.
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-cargo-lots-'));
try {
  const database = new Database(directory);
  database.players.captain = mockPlayerAccount({
    name: 'Captain',
    salt: '',
    hash: '',
    created: 0,
    ...player,
  });
  database.dirty = true;
  database.flush();
  const reload = new Database(directory).players.captain;
  assert.equal(migrateCargoLots(reload).changed, false);
  assert.deepEqual(reload.cargoLots, player.cargoLots);
  assertLots(reload.cargo, reload.cargoLots);
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
clearLots(player.cargo, player.cargoLots);
assert.deepEqual(player.cargo, {});
assert.deepEqual(player.cargoLots, { version: 1, byCommodity: {} });
assertLots(player.cargo, player.cargoLots);
console.log(
  'Cargo lots: migration, exact-grade accounting, denial atomicity, storage/capacity, fixed partial lots, seeded conservation and real save roundtrip passed.',
);
