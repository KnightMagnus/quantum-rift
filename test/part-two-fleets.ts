import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PART_TWO_HULLS, milkyWayTraffic } from '../shared/part-two-ships.ts';
import {
  augmentAssets,
  hostileFactions,
  makeLoadout,
  type GameAssets,
  type ShipHullAsset,
} from '../shared/rules.ts';
import { COMMON_HULLS } from '../shared/galaxy.ts';
import { validateFeaturePlayerSave } from '../server/save-validation.ts';
import { SYS } from '../shared/galaxy.ts';
import { FREEFOLK_IDS } from '../shared/ships-freefolk.ts';
import { UNSWORN_SOLD_IDS } from '../shared/ships-unsworn.ts';
const assets = augmentAssets(
  JSON.parse(
    fs.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  ) as GameAssets,
);
assert.equal(PART_TWO_HULLS.length, 28);
for (const hull of PART_TWO_HULLS) {
  assert.ok(assets.ships[hull.id]);
  assert.ok(hull.shield > 0 && hull.armor > 0 && hull.speed > 0);
  assert.ok(fs.existsSync(new URL(`../client/assets/ships/${hull.id}.webp`, import.meta.url)));
  assert.ok(fs.existsSync(new URL(`../client/assets/${hull.img}`, import.meta.url)));
}
for (const id of [952, 956, 957, 958, 974]) assert.deepEqual(assets.ships[id].weapons, []);

// Hand-tuned stats: no shared tier lines, and Confederation yard hulls stay on the common price curve.
/** Stock damage per second, from each weapon's mean shield/armor damage and its reload in 30 Hz ticks. */
const stockDps = (hull: ShipHullAsset) =>
  hull.weapons.reduce((total, [weaponId, count]) => {
    const weapon = assets.weapons[weaponId];
    if (weapon.type === 'bay') return total;
    return total + (count * ((weapon.dmgA + weapon.dmgS) / 2) * 30) / Math.max(weapon.reload, 1);
  }, 0);
const statLine = (hull: ShipHullAsset) =>
  JSON.stringify([hull.cost, hull.shield, hull.armor, hull.speed, hull.turn, hull.weapons]);
const statLines = new Set(PART_TWO_HULLS.map(statLine));
assert.equal(statLines.size, PART_TWO_HULLS.length, 'every Part II hull has its own stat line');
const durabilityPerCredit = (hull: ShipHullAsset) => (hull.shield + hull.armor) / hull.cost;
const bestCommonDurability = Math.max(
  ...COMMON_HULLS.map((id) => durabilityPerCredit(assets.ships[id])),
);
const confederation = PART_TWO_HULLS.filter((hull) => hull.faction === 'confederation');
for (const hull of confederation) {
  const capital = hull.sub === 'Warship';
  if (capital) assert.ok((hull.tech ?? 0) > 3, `${hull.name} stays out of Milky Way yards`);
  else {
    assert.ok((hull.tech ?? 0) <= 3, `${hull.name} stays in Milky Way yards`);
    assert.ok(
      durabilityPerCredit(hull) <= bestCommonDurability,
      `${hull.name} is not more durable per credit than every common hull`,
    );
  }
}
const cutlass = assets.ships[708];
const capitals = confederation.filter((hull) => hull.sub === 'Warship' && !hull.npcOnly);
assert.equal(capitals.length, 7);
assert.equal(new Set(capitals.map(stockDps)).size, capitals.length, 'capitals differ in firepower');
for (const hull of capitals) {
  assert.ok(stockDps(hull) > 2 * stockDps(cutlass), `${hull.name} out-guns a Cutlass Interceptor`);
  assert.ok(
    hull.shield + hull.armor > 5 * (cutlass.shield + cutlass.armor),
    `${hull.name} outlasts a Cutlass Interceptor`,
  );
}
const flint = assets.ships[950];
assert.ok(flint.cost < assets.ships[1015].cost / 4, 'Flint is an entry fighter');
assert.ok(
  flint.shield + flint.armor < assets.ships[1015].shield + assets.ships[1015].armor,
  'Flint is less durable than the Cutlass Type 0',
);
// Every stock loadout survives a save round trip, including fixed banks without an outfit.
for (const hull of PART_TWO_HULLS) {
  const ship = JSON.parse(JSON.stringify(makeLoadout(assets, hull.id, hull.name)));
  assert.doesNotThrow(() => validateFeaturePlayerSave({ ship }), `${hull.name} stock save`);
}
assert.equal(SYS['mw-sol'].faction, 'confederation');
assert.equal(hostileFactions('confederation', 'index'), true);
assert.equal(hostileFactions('freefolk', 'index'), false);
assert.equal(hostileFactions('freefolk', 'confederation'), false);
assert.equal(hostileFactions('unsworn', 'index'), false);
for (const faction of ['confederation', 'index'])
  for (let i = 0; i < 100; i++) {
    const traffic = milkyWayTraffic(faction, i / 100);
    assert.ok(traffic.pool.length);
    for (const id of traffic.pool) assert.ok(assets.ships[id]);
    if (['freefolk', 'unsworn'].includes(traffic.faction)) {
      assert.equal(traffic.kind, 'trade');
      const civilianHulls = traffic.faction === 'freefolk' ? FREEFOLK_IDS : UNSWORN_SOLD_IDS;
      for (const id of traffic.pool)
        assert.ok(civilianHulls.includes(id), 'Civilian community design');
    } else
      for (const id of traffic.pool) assert.ok(id >= 950 && id <= 978, 'Only Part II fleet models');
  }
console.log(
  'Part II fleet catalog, hand-tuned hull stats, stock save round trips, civilian legacy designs, war identities and 200 regional traffic rolls passed',
);
