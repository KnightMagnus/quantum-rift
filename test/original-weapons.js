// Asset migration contract: persistent IDs, firing roles and mounting still agree after the refresh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { augmentAssets, weaponParams } from '../shared/rules.ts';
import { EXTRA_OUTFITS, MINING_WEAPONS } from '../shared/galaxy.ts';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const classes = new Map([
  [128, 'gun'],
  [129, 'gun'],
  [130, 'turret'],
  [131, 'turret'],
  [132, 'turret'],
  [134, 'homing'],
  [143, 'frontturret'],
  [146, 'beam'],
  [156, 'frontturret'],
  [157, 'frontturret'],
  [158, 'frontturret'],
  [161, 'pd'],
  [162, 'turret'],
  [181, 'gun'],
  [197, 'turret'],
]);
assert.deepEqual(
  Object.values(A.weapons)
    .filter((w) => w.id < 330)
    .map((w) => w.id),
  [...classes.keys()],
);
const authored = structuredClone(A.weapons);
augmentAssets(A);
for (const [id, type] of classes) {
  const w = A.weapons[id],
    p = weaponParams(w);
  assert.equal(w.type, type, `stable firing class ${id}`);
  assert.equal(w.name, authored[id].name, `augmentation retains new profile ${id}`);
  assert.ok(w.desc.length > 40, `authored role description ${id}`);
  assert.ok(p.range > 200 && p.range < 5500, `usable bounded range ${id}`);
  assert.ok(p.reload > 0 && p.dmgA > 0 && p.dmgS > 0, `finite firing profile ${id}`);
  assert.ok(/^#[0-9a-f]{6}$/i.test(w.color) && w.color !== '#000000', `visible projectile ${id}`);
  assert.equal(p.turret, ['turret', 'pd'].includes(type), `mount conversion ${id}`);
}
assert.equal(A.weapons[134].ammo, 6, 'existing missile resource channel');
assert.equal(A.weapons[161].ammo, 27, 'existing point-defense resource channel');
assert.ok(
  A.weapons[181].mining && MINING_WEAPONS.includes(181),
  'existing miner save ID still mines',
);
assert.ok(weaponParams(A.weapons[161]).pd, 'point defense remains point defense');
assert.ok(weaponParams(A.weapons[146]).beam, 'beam remains a beam');
for (const ship of Object.values(A.ships)) {
  for (const [id, count] of ship.weapons || []) {
    assert.ok(A.weapons[id], `${ship.name}: weapon ${id} exists`);
    assert.ok(count > 0, `${ship.name}: positive mounting count`);
  }
}
for (const o of [...Object.values(A.outfits), ...EXTRA_OUTFITS]) {
  if (o.eff?.weapon) assert.ok(A.weapons[o.eff.weapon], `${o.name}: weapon exists`);
  if (classes.has(o.eff?.weapon)) {
    const w = A.weapons[o.eff.weapon];
    assert.ok(o.name.startsWith(w.name), `${o.name}: storefront uses replacement name`);
    assert.equal(Boolean(o.turret), weaponParams(w).turret, `${o.name}: compatible mount type`);
  }
}
const dps = (id) => (A.weapons[id].dmgA + A.weapons[id].dmgS) / weaponParams(A.weapons[id]).reload;
assert.ok(dps(128) < dps(129), 'forward weapon progression');
assert.ok(dps(130) < dps(131) && dps(131) < dps(132), 'turret progression');
assert.ok(
  A.weapons[156].dmgA < A.weapons[157].dmgA && A.weapons[157].dmgA < A.weapons[158].dmgA,
  'penetrator impact progression',
);
assert.ok(dps(181) < dps(128), 'mining tool does not obsolete starter combat gun');
const brand = /\b(?:EV(?:[ -](?:Nova|Quantum)|[ -]style)|Escape\s+Velocity)\b/i;
for (const file of [
  'README.md',
  'package.json',
  'shared/assets.json',
  'shared/galaxy.ts',
  'shared/rules.ts',
  'shared/story.ts',
  'shared/specialty.ts',
]) {
  assert.ok(
    !brand.test(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')),
    `${file}: no removed branding`,
  );
}
console.log(
  'Original weapon contracts passed: 15 profiles, all hull and outfit references, mount/resource continuity, progression, branding.',
);
