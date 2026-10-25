import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { augmentAssets, type GameAssets } from '../shared/rules.ts';
import { validateShipContent } from '../tools/content-validation.ts';

const assets: GameAssets = augmentAssets(
  JSON.parse(readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
const before = structuredClone(assets);
assert.deepEqual(
  validateShipContent(assets, (relativePath) =>
    statSync(new URL(`../client/assets/${relativePath}`, import.meta.url)).isFile(),
  ),
  [],
  'all composed hulls, stock weapons and shipped artwork validate',
);
assert.deepEqual(assets, before, 'validation does not mutate the live catalog');

const fixture = (): GameAssets => ({
  ships: { 703: structuredClone(assets.ships[703]) },
  outfits: structuredClone(assets.outfits),
  weapons: structuredClone(assets.weapons),
});
const invalid = fixture();
Object.assign(invalid.ships[703], {
  id: 704,
  cost: Infinity,
  guns: 0.5,
  turrets: -1,
  img: '../outside.png',
  weapons: [[999999, 0, -1]],
});
assert.deepEqual(
  validateShipContent(invalid, () => true).map((diagnostic) => diagnostic.path),
  [
    'ships[703].id',
    'ships[703].cost',
    'ships[703].turrets',
    'ships[703].guns',
    'ships[703].weapons[0][0]',
    'ships[703].weapons[0][1]',
    'ships[703].weapons[0][2]',
    'ships[703].img',
  ],
  'independent authoring errors retain exact catalog locations',
);
for (const path of ['/ships/703.png', 'https://example.com/ship.png', 'ships/../703.png']) {
  const catalog = fixture();
  catalog.ships[703].img = path;
  assert.ok(
    validateShipContent(catalog, () => true).some((entry) => entry.path === 'ships[703].img'),
  );
}
const missing = validateShipContent(fixture(), () => false);
assert.deepEqual(
  missing.map((diagnostic) => diagnostic.path),
  ['ships[703].img', 'ships[703].flightArtwork', 'ships[703].glowArtwork'],
  'yard, flight and glow failures are reported separately',
);
assert.match(missing[0]!.message, /missing client\/assets\/ships\/703_yard.png/);
const legacy = fixture();
delete legacy.ships[703].spr;
const legacyPaths: string[] = [];
assert.deepEqual(
  validateShipContent(legacy, (path) => {
    legacyPaths.push(path);
    return true;
  }),
  [],
);
assert.deepEqual(legacyPaths, ['ships/703_yard.png', 'ships/703.png', 'ships/703_glow.png']);
legacy.ships[703].glow = false;
assert.deepEqual(
  validateShipContent(legacy, () => false).map((diagnostic) => diagnostic.path),
  ['ships[703].img', 'ships[703].flightArtwork'],
  'hulls without active glow do not require a glow file',
);

const mounts = fixture();
mounts.ships[703].guns = 0;
assert.match(validateShipContent(mounts, () => true)[0]!.message, /stock guns 1 exceed mounts 0/);
mounts.ships[703].npcOnly = true;
assert.deepEqual(
  validateShipContent(mounts, () => true),
  [],
  'NPC stock mount exception is explicit',
);
mounts.ships[703].weapons = [[999999, 1]];
assert.match(validateShipContent(mounts, () => true)[0]!.message, /unknown weapon/);

const turret = fixture();
turret.ships[704] = structuredClone(assets.ships[704]);
turret.ships[704].turrets = 0;
assert.ok(
  validateShipContent(turret, () => true).some(
    (entry) => entry.path === 'ships[704].weapons' && /stock turrets/.test(entry.message),
  ),
  'turret limits are separate from fixed gun limits',
);
const optionalAmmo = fixture();
optionalAmmo.ships[703].weapons = [[128, 1]];
assert.deepEqual(
  validateShipContent(optionalAmmo, () => true),
  [],
  'legacy omitted ammo remains valid',
);

const command = fileURLToPath(new URL('../tools/validate-content.ts', import.meta.url));
const run = (args: string[]) =>
  spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
const success = run([]);
assert.equal(success.status, 0, success.stderr);
assert.match(success.stdout, /Content validation passed: \d+ ships/);
const failure = run([
  '--asset-root',
  fileURLToPath(new URL('./missing-content-assets', import.meta.url)),
]);
assert.equal(failure.status, 1, failure.stderr);
assert.match(failure.stderr, /ships\[703\]\.img: missing client\/assets\/ships\/703_yard.png/);
assert.match(failure.stderr, /Content validation failed/);
const usage = run(['--asset-root']);
assert.equal(usage.status, 2);
assert.match(usage.stderr, /Usage:/);
console.log(
  'Composed ship content, malformed references, fitting limits and CLI failure reporting pass.',
);
