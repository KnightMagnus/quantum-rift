import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PART_TWO_HULLS, milkyWayTraffic } from '../shared/part-two-ships.ts';
import { augmentAssets, hostileFactions, type GameAssets } from '../shared/rules.ts';
import { SYS } from '../shared/galaxy.ts';
import { FREEFOLK_IDS } from '../shared/ships-freefolk.ts';
import { TYPE0_IDS } from '../shared/ships-type0.ts';
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
      const civilianHulls = traffic.faction === 'freefolk' ? FREEFOLK_IDS : TYPE0_IDS;
      for (const id of traffic.pool)
        assert.ok(civilianHulls.includes(id), 'Civilian community design');
    } else
      for (const id of traffic.pool) assert.ok(id >= 950 && id <= 978, 'Only Part II fleet models');
  }
console.log(
  'Part II fleet catalog, civilian legacy designs, war identities and 200 regional traffic rolls passed',
);
