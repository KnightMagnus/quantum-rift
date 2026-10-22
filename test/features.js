import { parseSync } from 'oxc-parser';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindOperations } from '../server/feature-service.ts';
import { createMessageRegistry } from '../server/message-registry.ts';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';

// Characterization checks ordering, stacking, schema, payloads and session normalization.
// capture-features runs in a separate process with fixed time and RNG. The baseline
// permits passengerSeats, stockOutfits, armadaFollow=false, empty versioned
// cargoLots/storageLots and storage. Living-state allocation accounts for the six
// additional markets in the seeded selection pool. All other fields must match.
const actual = JSON.parse(
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL('./capture-features.js', import.meta.url))],
    {
      encoding: 'utf8',
      env: { ...process.env, REFERENCE_ROOT: '' },
    },
  ),
);
// The saved starter station is the only radio-specific initialization baseline difference.
// Preserve all other baseline fields; discovery/progression is tested separately.
const expected = JSON.parse(
  fs.readFileSync(new URL('./fixtures/features-v26.json', import.meta.url)),
);
assert.deepEqual(actual, expected);
console.log('Baseline initialization, login, save, bonus/stats, world and name lookup parity.');

assert.throws(() => bindOperations({ bad: 3 }, {}), /must be a function/);
const only = {
  read() {
    return Object.keys(this).sort();
  },
};
assert.deepEqual(bindOperations(only, { toast() {}, spaces: {} }).read(), ['spaces', 'toast']);
assert.throws(
  () =>
    createMessageRegistry([
      ['trade', () => {}],
      ['trade', () => {}],
    ]),
  /Duplicate message route/,
);
const called = [];
const registry = createMessageRegistry([
  ['trade', () => called.push('market')],
  ['trade2', () => called.push('captain')],
]);
registry.dispatch('trade', {}, {});
registry.dispatch('trade2', {}, {});
for (const value of ['constructor', '__proto__', 'toString', 'unknown', {}, null])
  registry.dispatch(value, {}, {});
assert.deepEqual(called, ['market', 'captain']);
console.log('Capability isolation, invalid operation and duplicate/unknown message route checks.');

const manifest = JSON.parse(
  fs.readFileSync(new URL('../docs/feature-inventory.json', import.meta.url)),
);
const composition = fs.readFileSync(new URL('../server/features.ts', import.meta.url), 'utf8');
assert.equal(new Set(manifest.features.map((f) => f.file)).size, 20);
for (const feature of manifest.features) {
  const module = await import(`../server/${feature.module || feature.file}.ts`);
  const operations = module[feature.exportName];
  assert.deepEqual(
    Object.keys(operations).sort(),
    [...feature.methods].sort(),
    feature.file + ' operations inventory',
  );
  const source = fs.readFileSync(
    new URL(`../server/${feature.module || feature.file}.ts`, import.meta.url),
    'utf8',
  );
  const capabilityTypes = new Set(
    [...source.matchAll(/@typedef\s+\{import\([^)]*\)\.\w*Capabilities\}\s+(\w+)/g)].map(
      ([, name]) => name,
    ),
  );
  const capabilityParameters = new Set();
  for (const [, type, name] of source.matchAll(/@param\s+\{(\w+)\}\s+(\w+)/g))
    if (capabilityTypes.has(type)) capabilityParameters.add(name);
  const parsed = parseSync(`${feature.file}.ts`, source, { showSemanticErrors: true });
  assert.deepEqual(parsed.errors, [], `${feature.file}: valid source required`);
  // Native type imports/parameters replace the earlier JSDoc boundary aliases.
  for (const statement of parsed.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers)
      if ((specifier.imported?.name || '').endsWith('Capabilities'))
        capabilityTypes.add(specifier.local.name);
  }
  function collectCapabilityParameters(node) {
    if (!node || typeof node !== 'object') return;
    const annotation = node.typeAnnotation?.typeAnnotation;
    if (node.type === 'Identifier' && capabilityTypes.has(annotation?.typeName?.name))
      capabilityParameters.add(node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(collectCapabilityParameters);
      else if (value && typeof value === 'object') collectCapabilityParameters(value);
    }
  }
  collectCapabilityParameters(parsed.program);
  const dependencyNames = new Set();
  function collectDependencies(node) {
    if (!node || typeof node !== 'object') return;
    if (
      (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      !node.computed &&
      node.property?.type === 'Identifier' &&
      (node.object?.type === 'ThisExpression' ||
        (node.object?.type === 'Identifier' && capabilityParameters.has(node.object.name)))
    )
      dependencyNames.add(node.property.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(collectDependencies);
      else if (value && typeof value === 'object') collectDependencies(value);
    }
  }
  collectDependencies(parsed.program);
  const referenced = [...dependencyNames].sort();
  assert.deepEqual(referenced, feature.uses, feature.file + ' declared dependencies');
  const parsedComposition = parseSync('features.ts', composition, { showSemanticErrors: true });
  assert.deepEqual(parsedComposition.errors, [], 'valid feature composition required');
  const tree = parsedComposition.program;
  let facade;
  function find(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.name === `${feature.file}Capabilities` &&
      node.init?.type === 'ObjectExpression'
    )
      facade = node.init;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(find);
      else if (value && typeof value === 'object') find(value);
    }
  }
  find(tree);
  assert.ok(facade, `${feature.file}: explicit object facade required`);
  const provided = facade.properties.map((p) => p.key?.name || p.key?.value);
  for (const key of referenced)
    assert.ok(provided.includes(key), `${feature.file}: missing explicit capability ${key}`);
  for (const method of feature.methods)
    assert.equal(
      Object.hasOwn(Game.prototype, method),
      false,
      method + ' must not be installed on Game',
    );
}
console.log('All 20 feature exports and explicit dependencies match the checked-in inventory.');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-feature-security-'));
const interval = globalThis.setInterval;
process.env.SEEDS_FILE = '/nonexistent';
let game;
try {
  globalThis.setInterval = () => ({ unref() {} });
  game = new Game(
    JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
    new DB(dir),
  );
} finally {
  globalThis.setInterval = interval;
}
try {
  const routes = game.messageHandlers;
  const dispatched = [];
  game.messageHandlers = { dispatch: (...args) => dispatched.push(args) };
  const session = { data: null, msgs: 0, msgT: Date.now(), actT: 123 };
  game.onMessage(session, { t: 'order', o: 'hold' });
  assert.equal(dispatched.length, 0, 'unauthenticated action must not dispatch');
  session.data = {};
  game.onMessage(session, { t: 'ping' });
  assert.equal(session.actT, 123, 'ping must not mark player active');
  game.onMessage(session, { t: 'order', o: 'hold' });
  assert.ok(session.actT > 123);
  session.msgs = 120;
  game.onMessage(session, { t: 'order', o: 'attack' });
  assert.equal(dispatched.length, 2, 'flooded action must not dispatch');
  assert.ok(routes.types.includes('trade') && routes.types.includes('trade2'));
  assert.equal(new Set(routes.types).size, routes.types.length);
  assert.equal(Object.keys(game.features).length, 24);
  const cargo = { food: 10 };
  const notices = [];
  game.toast = (_s, message) => notices.push(message);
  // Services capture explicit core function capabilities at construction. Use a
  // standalone typed pilot facade to check the unauthorized action's mutation.
  const { FleetCmdOperations } = await import('../server/fleetcmd.ts');
  const fleet = bindOperations(FleetCmdOperations, {
    toast: (_s, m) => notices.push(m),
    send() {},
    you() {},
    stats() {
      return { cargo: 20 };
    },
    spaces: {},
  });
  fleet.jettison({ data: { cargo, sys: 'meridian' }, ent: null }, 'food', 5);
  assert.deepEqual(cargo, { food: 10 });
  assert.match(notices[0], /only jettison cargo in space/);
  console.log('Authentication, flood, activity, explicit route and docked-action gates preserved.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
