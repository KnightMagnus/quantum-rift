// Unsworn hull catalog: registration, artwork, traffic pools and Commonhold exclusion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { milkyWayTraffic } from '../shared/part-two-ships.ts';
import { augmentAssets, type GameAssets } from '../shared/rules.ts';
import { COMMON_HULLS, FACTION_HULLS, SYS, TRAFFIC } from '../shared/galaxy.ts';
import { SPRITES } from '../shared/sprites26.ts';
import {
  UNSWORN_COMMAND_ID,
  UNSWORN_HULLS,
  UNSWORN_IDS,
  UNSWORN_SOLD_IDS,
} from '../shared/ships-unsworn.ts';

const assets = augmentAssets(
  JSON.parse(
    fs.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  ) as GameAssets,
);

assert.deepEqual(UNSWORN_IDS, [1050, 1051, 1052, 1053, 1054, 1055]);
assert.deepEqual(UNSWORN_SOLD_IDS, [1050, 1051, 1052, 1053, 1054]);
assert.equal(UNSWORN_COMMAND_ID, 1055);

for (const hull of UNSWORN_HULLS) {
  const registered = assets.ships[hull.id];
  assert.ok(registered, `hull ${hull.id} is registered`);
  assert.equal(registered.name, hull.name, `hull ${hull.id} is not shadowed by an older asset`);
  assert.equal(registered.faction, 'unsworn');
  assert.equal(registered.fastJump, true);
  assert.ok(registered.shield > 0 && registered.armor > 0 && registered.speed > 0);
  for (const suffix of ['', '_glow', '_yard'])
    assert.ok(
      fs.existsSync(new URL(`../client/assets/ships/${hull.id}${suffix}.webp`, import.meta.url)),
      `ships/${hull.id}${suffix}.webp exists`,
    );
  assert.equal(registered.img, `ships/${hull.id}_yard.webp`);
  const sprite = SPRITES[hull.id];
  assert.ok(sprite, `sprite sheet ${hull.id} is registered`);
  assert.equal(sprite.cols, 12);
  assert.ok(sprite.banks && sprite.glow && sprite.packed);
  for (const [weaponId] of hull.weapons) assert.ok(assets.weapons[weaponId], `weapon ${weaponId}`);
}

// Only the Shrike escort carries a gun.
const armed = UNSWORN_HULLS.filter((hull) => hull.weapons.length).map((hull) => hull.id);
assert.deepEqual(armed, [1052]);

// Unsworn traffic flies Unsworn hulls only; the escort pool is the Shrike.
assert.deepEqual(TRAFFIC.unsworn, { traders: [1050, 1051, 1053, 1054], war: [1052] });
assert.deepEqual(FACTION_HULLS.unsworn, UNSWORN_SOLD_IDS);
let unswornRolls = 0;
for (const faction of ['confederation', 'index'])
  for (let step = 0; step < 1000; step++) {
    const traffic = milkyWayTraffic(faction, step / 1000);
    if (traffic.faction !== 'unsworn') {
      for (const id of traffic.pool) assert.ok(!UNSWORN_IDS.includes(id), 'Unsworn hull leaked');
      continue;
    }
    unswornRolls++;
    assert.equal(traffic.kind, 'trade');
    assert.deepEqual(traffic.pool, [1050, 1051, 1053, 1054]);
  }
assert.ok(unswornRolls > 0, 'Confederation space produces Unsworn traffic');

// Commonhold is a stationary NPC location ship: never in a traffic pool, shipyard list or common catalog.
assert.ok(!COMMON_HULLS.includes(UNSWORN_COMMAND_ID));
assert.equal(assets.ships[UNSWORN_COMMAND_ID].npcOnly, true, 'Commonhold is NPC only');
for (const id of UNSWORN_SOLD_IDS)
  assert.ok(!assets.ships[id].npcOnly, `hull ${id} stays obtainable`);
for (const [faction, pools] of Object.entries(TRAFFIC))
  assert.ok(
    !pools.traders.includes(UNSWORN_COMMAND_ID) && !pools.war.includes(UNSWORN_COMMAND_ID),
    `Commonhold is absent from ${faction} traffic`,
  );
for (const [faction, hullIds] of Object.entries(FACTION_HULLS)) {
  assert.ok(!hullIds.includes(UNSWORN_COMMAND_ID), `Commonhold is absent from ${faction} hulls`);
  if (faction !== 'unsworn')
    for (const id of UNSWORN_IDS)
      assert.ok(!hullIds.includes(id), `${faction} does not build Unsworn hull ${id}`);
}

// No public shipyard sells Unsworn hulls: no system is Unsworn-owned.
assert.ok(!Object.values(SYS).some((system) => system.faction === 'unsworn'));

console.log(
  `Unsworn hulls: 6 registered with sheets, ${unswornRolls} Unsworn traffic rolls, Commonhold excluded`,
);
