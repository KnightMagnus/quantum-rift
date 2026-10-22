import { requiredFixtureValue } from './helpers/required.ts';
// Asset migration contract: persistent IDs, firing roles and mounting still agree after the refresh.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { augmentAssets, weaponParams, type GameAssets } from '../shared/rules.ts';
import { EXTRA_OUTFITS, MINING_WEAPONS } from '../shared/galaxy.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
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
  Object.values(assets.weapons)
    .filter((weapon) => weapon.id < 330)
    .map((weapon) => weapon.id),
  [...classes.keys()],
);
const authored = structuredClone(assets.weapons);
augmentAssets(assets);
for (const [identifier, type] of classes) {
  const weapon = assets.weapons[identifier],
    player = weaponParams(weapon);
  assert.equal(weapon.type, type, `stable firing class ${identifier}`);
  assert.equal(
    weapon.name,
    authored[identifier].name,
    `augmentation retains new profile ${identifier}`,
  );
  assert.ok(
    requiredFixtureValue(weapon.desc).length > 40,
    `authored role description ${identifier}`,
  );
  assert.ok(player.range > 200 && player.range < 5500, `usable bounded range ${identifier}`);
  assert.ok(
    player.reload > 0 && player.dmgA > 0 && player.dmgS > 0,
    `finite firing profile ${identifier}`,
  );
  assert.ok(
    /^#[0-9a-f]{6}$/i.test(requiredFixtureValue(weapon.color)) && weapon.color !== '#000000',
    `visible projectile ${identifier}`,
  );
  assert.equal(player.turret, ['turret', 'pd'].includes(type), `mount conversion ${identifier}`);
}
assert.equal(assets.weapons[134].ammo, 6, 'existing missile resource channel');
assert.equal(assets.weapons[161].ammo, 27, 'existing point-defense resource channel');
assert.ok(
  assets.weapons[181].mining && MINING_WEAPONS.includes(181),
  'existing miner save ID still mines',
);
assert.ok(weaponParams(assets.weapons[161]).pd, 'point defense remains point defense');
assert.ok(weaponParams(assets.weapons[146]).beam, 'beam remains a beam');
for (const ship of Object.values(assets.ships)) {
  for (const [identifier, count] of ship.weapons || []) {
    assert.ok(assets.weapons[identifier], `${ship.name}: weapon ${identifier} exists`);
    assert.ok(count > 0, `${ship.name}: positive mounting count`);
  }
}
for (const options of [...Object.values(assets.outfits), ...EXTRA_OUTFITS]) {
  if (options.eff?.weapon)
    assert.ok(
      assets.weapons[requiredFixtureValue(options.eff).weapon!],
      `${options.name}: weapon exists`,
    );
  if (classes.has(options.eff?.weapon ?? -1)) {
    const weapon = assets.weapons[requiredFixtureValue(options.eff).weapon];
    assert.ok(
      options.name.startsWith(weapon.name),
      `${options.name}: storefront uses replacement name`,
    );
    assert.equal(
      Boolean(options.turret),
      weaponParams(weapon).turret,
      `${options.name}: compatible mount type`,
    );
  }
}
const damagePerSecond = (identifier: number) =>
  (assets.weapons[identifier].dmgA + assets.weapons[identifier].dmgS) /
  weaponParams(assets.weapons[identifier]).reload;
assert.ok(damagePerSecond(128) < damagePerSecond(129), 'forward weapon progression');
assert.ok(
  damagePerSecond(130) < damagePerSecond(131) && damagePerSecond(131) < damagePerSecond(132),
  'turret progression',
);
assert.ok(
  assets.weapons[156].dmgA < assets.weapons[157].dmgA &&
    assets.weapons[157].dmgA < assets.weapons[158].dmgA,
  'penetrator impact progression',
);
assert.ok(
  damagePerSecond(181) < damagePerSecond(128),
  'mining tool does not obsolete starter combat gun',
);
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
    !brand.test(filesystem.readFileSync(new URL('../' + file, import.meta.url), 'utf8')),
    `${file}: no removed branding`,
  );
}
console.log(
  'Original weapon contracts passed: 15 profiles, all hull and outfit references, mount/resource continuity, progression, branding.',
);
