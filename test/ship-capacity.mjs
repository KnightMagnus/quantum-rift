import assert from 'node:assert/strict';
import {
  ShipCapacity,
  commodityCargoTonnes,
  reservedCargoTonnes,
} from '../shared/ship-capacity.ts';
import { miningPanelState } from '../client/mining-panel-state.ts';

const missions = [
  { type: 'cargo', qty: 5 },
  { type: 'smuggle', qty: 3 },
  { type: 'supply', qty: 6 },
  { type: 'passenger', pax: 2 },
];
assert.equal(reservedCargoTonnes(missions), 8, 'Only delivered cargo occupies reserved hold');
assert.equal(reservedCargoTonnes(), 0);
assert.equal(reservedCargoTonnes(null), 0);
assert.equal(
  reservedCargoTonnes([{ type: 'cargo' }, { type: 'smuggle', qty: 0 }]),
  0,
  'Unspecified quantities preserve the existing zero reservation',
);
assert.equal(
  reservedCargoTonnes([{ type: 'cargo', qty: 5, done: true, paid: true }]),
  5,
  'Allocation lasts until the mission owner removes the record, not its presentation flags',
);
assert.equal(commodityCargoTonnes({ ore: 4, gas: 3 }), 7);

// Captured from the original server/UI/mining arithmetic before extraction.
for (const fixture of [
  { capacity: 20, commodities: 7, reserved: 8, used: 15, remaining: 5, available: 5 },
  { capacity: 15, commodities: 7, reserved: 8, used: 15, remaining: 0, available: 0 },
  { capacity: 10, commodities: 11, reserved: 0, used: 11, remaining: -1, available: 0 },
  { capacity: 0, commodities: 0, reserved: 0, used: 0, remaining: 0, available: 0 },
]) {
  const hold = new ShipCapacity(fixture.capacity, fixture.commodities, fixture.reserved);
  assert.equal(hold.used, fixture.used);
  assert.equal(hold.remaining, fixture.remaining);
  assert.equal(hold.available, fixture.available);
  assert.equal(
    miningPanelState({
      you: {
        shipStats: { cargo: fixture.capacity },
        cargoUsed: fixture.commodities,
        jobCargo: fixture.reserved,
      },
    }).free,
    fixture.available,
    'Mining uses authoritative projected reservations and clamps only presentation',
  );
}

const manifest = { cargo: { ore: 4, gas: 3 }, missions };
const hold = ShipCapacity.fromManifest(20, manifest);
assert.deepEqual([hold.used, hold.remaining, hold.available], [15, 5, 5]);
manifest.cargo.ore = 12;
missions.push({ type: 'cargo', qty: 9 });
assert.equal(hold.used, 15, 'Capacity is a snapshot, not stale aliases into live cargo');
assert.equal(ShipCapacity.fromManifest(20, manifest).used, 32);
assert.throws(() => (hold.capacity = 999), TypeError, 'A hold allocation cannot be mutated');
console.log('Shared ship capacity preserves reservation, overload, snapshot and mining contracts.');
