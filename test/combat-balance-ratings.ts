import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Space } from '../server/space.ts';
import { augmentAssets, shipStats } from '../shared/rules.ts';
import { hullCombatPower, shipCombatPower } from '../shared/hostile.ts';
import { mockGame, mockSession, mockPlayerReference } from './helpers/mocks.ts';

const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
assert.equal(assets.ships[736].name, 'Concordance');
assert.ok(
  (assets.weapons[349].beamLen ?? 0) >= 1260,
  'capital turret battery can answer Umbral range',
);
assert.ok((assets.weapons[348].beamLen ?? 0) >= 1260, 'capital lance can answer Umbral range');
assert.equal(
  assets.ships[787].weapons.find(([weapon]) => weapon === 349)![1],
  8,
  'Event Horizon carries a capital-grade turret battery',
);
const fitted = { hull: 708, outfits: {} };
const base = shipCombatPower(assets, fitted);
assert.ok(shipCombatPower(assets, fitted, { damagePct: 100 }) > base);
assert.ok(shipCombatPower(assets, fitted, { shieldPct: 100 }) > base);
assert.ok(shipCombatPower(assets, { hull: 708, fixed: [] }) < base, 'stripped guns reduce power');
assert.ok(
  hullCombatPower(assets, 761) > hullCombatPower(assets, 711),
  'Hunter outrates Bramble using actual armament',
);
const space = Object.assign(Object.create(Space.prototype) as Space, {
  id: 'fixture',
  A: assets,
  t: 0,
  sys: { danger: 6, faction: 'umbral' },
  ships: new Map(),
  events: [],
  game: mockGame({ features: { hostile: { myPower: () => 2000 } } }),
});
assert.equal(space.raidBudget(), 0);
assert.equal(space.spawnEclipse(true), null, 'wake cannot spawn an unbudgeted cell');
const session = mockSession({ data: { sys: 'fixture' } });
const captain = space.makeShip({ hull: 716, player: mockPlayerReference({ id: 1, s: session }) });
session.ent = captain;
assert.equal(captain.pw, hullCombatPower(assets, 716));
const cell = space.spawnEclipse(true);
assert.ok(cell);
assert.equal(
  space.spawnSwarm(),
  null,
  'reinforcements wait instead of replacing the whole budget immediately',
);
assert.equal(space.spawnEclipse(), null, 'only one living Eclipse cell');
for (let index = 0; index < 100; index++) {
  space.t = index * 40;
  space.spawnSwarm(index === 0);
  space.spawnGroup('raid', 'umbral', [761, 762, 763, 764], index === 0);
  space.spawnGroup('patrol', 'umbral', [761, 762, 763, 764]);
  const threats = space.ambientRaiders();
  assert.ok(
    threats.reduce((sum, entity) => sum + entity.pw, 0) <= 2000 * 1.6,
    'combined initial and repeated encounters stay within system allowance',
  );
  assert.ok(
    new Set(threats.map((entity) => space.root(entity).id)).size <= 3,
    'special incursions count toward shared group cap',
  );
}
assert.ok([...space.ships.values()].filter((entity) => entity.faction === 'swarm').length <= 8);
const survivingEscort = [...space.ships.values()].find((entity) => entity.owner === cell.id)!;
assert.ok(survivingEscort);
cell.dead = true;
space.ships.delete(cell.id);
assert.ok(
  space.ambientRaiders().includes(survivingEscort),
  'orphaned escorts still consume the shared threat budget',
);
const hunter = space.makeShip({ hull: 761, ai: 'raid', faction: 'umbral' });
assert.equal(
  hunter.pw,
  hullCombatPower(assets, 761),
  'NPC and player ratings use identical fitted math',
);
assert.equal(shipStats(assets, fitted)!.armor > 0, true);
// Existing target pointers release their hunt slots as soon as a target dies or leaves.
const other = space.makeShip({ hull: 761, ai: 'raid', faction: 'umbral' });
const third = space.makeShip({ hull: 761, ai: 'raid', faction: 'umbral' });
const fourth = space.makeShip({ hull: 761, ai: 'raid', faction: 'umbral' });
for (const entity of [hunter, other, third]) entity.target = captain;
assert.equal(
  space.canAcquire(fourth, captain),
  false,
  'ambient groups cannot all hunt one captain',
);
hunter.target = null;
assert.equal(space.canAcquire(fourth, captain), true, 'a vacant hunt slot is immediately reusable');
// A fragile lead cannot borrow an unlimited encounter budget from expensive wings.
const raiderMap = space.ships;
space.ships = new Map([[captain.id, captain]]);
const originalDurability = captain.st.shield + captain.st.armor;
captain.st.shield = 60;
captain.st.armor = 40;
assert.ok(
  space.raidBudget()! <= 160,
  '100-HP lead caps danger-six total threat at 160 despite 2000 fleet power',
);
captain.shield = 1;
captain.armor = 1;
assert.ok(space.raidBudget()! > 0, 'current damage does not suppress encounters');
captain.st.armor = originalDurability - 60;
space.ships = raiderMap;
console.log(
  'Combat playability: fitted ratings, strict wake/ongoing shared budgets, incursion caps and hunt-slot reuse passed.',
);
