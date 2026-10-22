import path from 'node:path';
import { fileURLToPath } from 'node:url';
// A registration/composition guard, NOT evidence that all behavior branches are tested.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { tempDataDir } from './helpers/temp-data.ts';
const read = (name: string | URL) =>
  JSON.parse(fileSystem.readFileSync(new URL(name, import.meta.url), 'utf8'));
const manifest = read('./regression-manifest.json') as {
  unit: string[];
  browser: string[];
  children: Record<string, string[]>;
  systems: { id: string; services: string[]; tests: string[]; asserts: string; owners: string[] }[];
  routes: Record<string, string[]>;
  characterization: string[];
  contracts: string[];
  tooling: string[];
  supplemental: Record<string, string>;
};
const inventory = read('../docs/feature-inventory.json') as {
  features: { file: string }[];
  sharedServices: Record<string, { namespace: string }>;
};
const registered = [...manifest.unit, ...manifest.browser];
assert.equal(
  new Set(registered).size,
  registered.length,
  'test groups cannot silently duplicate cases',
);
// Follow supporting imports/preloads from registered programs, including helper chains.
const testDirectory = fileURLToPath(new URL('./', import.meta.url));
const repositoryDirectory = path.resolve(testDirectory, '..');
const reachable = new Set(registered);
const pendingPrograms = [...registered];
while (pendingPrograms.length) {
  const parent = pendingPrograms.shift()!;
  const parentPath = path.join(testDirectory, parent);
  const source = fileSystem.readFileSync(parentPath, 'utf8');
  const references = [...source.matchAll(/['"]([^'"\r\n]+\.ts)['"]/g)].map((match) => match[1]);
  for (const child of manifest.children[parent] || []) {
    const childPath = path.join(testDirectory, child);
    assert.ok(fileSystem.existsSync(childPath), 'Missing registered test ' + child);
    assert.ok(
      references.some(
        (reference) =>
          path.resolve(path.dirname(parentPath), reference) === childPath ||
          path.resolve(repositoryDirectory, reference) === childPath,
      ),
      'Unreachable child test ' + child,
    );
    if (!reachable.has(child)) {
      reachable.add(child);
      pendingPrograms.push(child);
    }
  }
}
for (const parent of Object.keys(manifest.children))
  assert.ok(reachable.has(parent), 'Unreachable child-test parent ' + parent);
const mapped = manifest.systems.flatMap((systemContract) => systemContract.services);
assert.deepEqual(
  [...new Set(mapped)].sort(),
  inventory.features.map((feature) => feature.file).sort(),
  'Every named feature provider must have behavior-test mapping',
);
assert.equal(
  new Set(manifest.systems.map((systemContract) => systemContract.id)).size,
  manifest.systems.length,
);
const guide = fileSystem.readFileSync(new URL('../docs/TEST-COVERAGE.md', import.meta.url), 'utf8');
for (const systemContract of manifest.systems) {
  assert.ok(
    systemContract.tests.length && systemContract.asserts.length > 30,
    'System needs explicit behavior contract ' + systemContract.id,
  );
  for (const test of systemContract.tests)
    assert.ok(reachable.has(test), 'System test not in CI ' + systemContract.id + ':' + test);
  for (const owner of systemContract.owners)
    assert.ok(
      fileSystem.existsSync(new URL('../' + owner, import.meta.url)),
      'Missing system owner ' + owner,
    );
  assert.ok(
    guide.includes('`' + systemContract.id + '`'),
    'Coverage guide missing system ' + systemContract.id,
  );
}
const game = new Game(read('../shared/assets.json'), new Database(tempDataDir('rift-coverage-')));
assert.deepEqual(
  Object.keys(game.features).sort(),
  [
    ...new Set([
      ...mapped,
      ...Object.values(inventory.sharedServices).map((sharedService) => sharedService.namespace),
    ]),
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
for (const file of fileSystem
  .readdirSync(new URL('./', import.meta.url))
  .filter((filename) => /^v\d+\.ts$/.test(filename)))
  assert.ok(registered.includes(file), 'Legacy suite omitted from CI ' + file);
const classified = new Set([
  ...reachable,
  ...manifest.characterization,
  ...manifest.contracts,
  ...manifest.tooling,
  ...Object.keys(manifest.supplemental),
]);
const unknown = fileSystem
  .readdirSync(new URL('./', import.meta.url))
  .filter(
    (quantity2) =>
      /\.(js|mjs|ts)$/.test(quantity2) &&
      !quantity2.endsWith('.d.ts') &&
      !classified.has(quantity2),
  );
assert.deepEqual(
  unknown,
  [],
  'New test programs require explicit CI registration or reviewed supplemental classification',
);
console.log(
  `Coverage registration: ${manifest.systems.length} system contracts, all ${inventory.features.length} feature providers, ${game.messageHandlers.types.length} dispatched actions and ${registered.length} CI programs mapped. This is a scope guard, not line/branch coverage.`,
);
process.exit(0);
