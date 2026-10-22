// A registration/composition guard, NOT evidence that all behavior branches are tested.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { tempDataDir } from './helpers/temp-data.js';
const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const manifest = read('./regression-manifest.json'),
  inventory = read('../docs/feature-inventory.json');
const registered = [...manifest.unit, ...manifest.browser];
assert.equal(
  new Set(registered).size,
  registered.length,
  'test groups cannot silently duplicate cases',
);
const reachable = new Set([...registered, ...Object.values(manifest.children).flat()]);
for (const file of reachable)
  assert.ok(
    fs.existsSync(new URL('./' + file, import.meta.url)),
    'Missing registered test ' + file,
  );
for (const [parent, children] of Object.entries(manifest.children)) {
  assert.ok(registered.includes(parent));
  for (const child of children)
    assert.ok(
      fs.readFileSync(new URL('./' + parent, import.meta.url), 'utf8').includes(child),
      'Unreachable child test ' + child,
    );
}
const mapped = manifest.systems.flatMap((row) => row.services);
assert.deepEqual(
  [...new Set(mapped)].sort(),
  inventory.features.map((f) => f.file).sort(),
  'Every named feature provider must have behavior-test mapping',
);
assert.equal(new Set(manifest.systems.map((x) => x.id)).size, manifest.systems.length);
const guide = fs.readFileSync(new URL('../docs/TEST-COVERAGE.md', import.meta.url), 'utf8');
for (const row of manifest.systems) {
  assert.ok(
    row.tests.length && row.asserts.length > 30,
    'System needs explicit behavior contract ' + row.id,
  );
  for (const test of row.tests)
    assert.ok(reachable.has(test), 'System test not in CI ' + row.id + ':' + test);
  for (const owner of row.owners)
    assert.ok(
      fs.existsSync(new URL('../' + owner, import.meta.url)),
      'Missing system owner ' + owner,
    );
  assert.ok(guide.includes('`' + row.id + '`'), 'Coverage guide missing system ' + row.id);
}
const game = new Game(read('../shared/assets.json'), new DB(tempDataDir('rift-coverage-')));
assert.deepEqual(
  Object.keys(game.features).sort(),
  [
    ...new Set([...mapped, ...Object.values(inventory.sharedServices).map((s) => s.namespace)]),
  ].sort(),
  'Runtime feature namespaces must be mapped, not only the inventory file',
);
assert.deepEqual(
  Object.keys(manifest.routes).sort(),
  [...game.messageHandlers.types].sort(),
  'New/removed message actions require reviewed behavior-test mapping',
);
for (const [route, tests] of Object.entries(manifest.routes)) {
  assert.ok(tests.length, 'Missing action evidence ' + route);
  for (const test of tests)
    assert.ok(reachable.has(test), 'Action test omitted from CI ' + route + ':' + test);
}
for (const file of fs
  .readdirSync(new URL('./', import.meta.url))
  .filter((n) => /^v\d+\.js$/.test(n)))
  assert.ok(registered.includes(file), 'Legacy suite omitted from CI ' + file);
const classified = new Set([
  ...reachable,
  ...manifest.characterization,
  ...manifest.contracts,
  ...manifest.tooling,
  ...Object.keys(manifest.supplemental),
]);
const unknown = fs
  .readdirSync(new URL('./', import.meta.url))
  .filter((n) => /\.(js|mjs)$/.test(n) && !classified.has(n));
assert.deepEqual(
  unknown,
  [],
  'New test programs require explicit CI registration or reviewed supplemental classification',
);
console.log(
  `Coverage registration: ${manifest.systems.length} system contracts, all ${inventory.features.length} feature providers, ${game.messageHandlers.types.length} dispatched actions and ${registered.length} CI programs mapped. This is a scope guard, not line/branch coverage.`,
);
process.exit(0);
