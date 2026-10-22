import { mockSession, mockPlayerData } from './helpers/mocks.ts';
import type { Session } from '../server/game.ts';
import { parseSync } from 'oxc-parser';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindOperations } from '../server/feature-service.ts';
import { createMessageRegistry } from '../server/message-registry.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';

// Characterization checks ordering, stacking, schema, payloads and session normalization.
// capture-features runs in a separate process with fixed time and RNG. The baseline
// permits passengerSeats, stockOutfits, armadaFollow=false, empty versioned
// cargoLots/storageLots and storage. Living-state allocation accounts for the six
// additional markets in the seeded selection pool. All other fields must match.
const actual = JSON.parse(
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL('./capture-features.ts', import.meta.url))],
    {
      encoding: 'utf8',
      env: { ...process.env, REFERENCE_ROOT: '' },
    },
  ),
);
// The saved starter station is the only radio-specific initialization baseline difference.
// Preserve all other baseline fields; discovery/progression is tested separately.
const expected = JSON.parse(
  fileSystem.readFileSync(new URL('./fixtures/features-v26.json', import.meta.url), 'utf8'),
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
const called: string[] = [];
const registry = createMessageRegistry([
  ['trade', () => called.push('market')],
  ['trade2', () => called.push('captain')],
]);
registry.dispatch('trade', mockSession({}), {});
registry.dispatch('trade2', mockSession({}), {});
for (const value of ['constructor', '__proto__', 'toString', 'unknown', {}, null])
  registry.dispatch(value as unknown as string, mockSession({}), {});
assert.deepEqual(called, ['market', 'captain']);
console.log('Capability isolation, invalid operation and duplicate/unknown message route checks.');

interface SourceNode {
  type?: string;
  name?: string;
  computed?: boolean;
  typeAnnotation?: { typeAnnotation?: { typeName?: { name?: string } } };
  object?: SourceNode;
  property?: SourceNode;
  id?: SourceNode;
  init?: SourceNode;
  key?: { name?: string; value?: string };
  properties?: SourceNode[];
}
const manifest: {
  features: {
    file: string;
    module?: string;
    exportName: string;
    methods: string[];
    uses: string[];
  }[];
} = JSON.parse(
  fileSystem.readFileSync(new URL('../docs/feature-inventory.json', import.meta.url), 'utf8'),
);
const composition = fileSystem.readFileSync(
  new URL('../server/features.ts', import.meta.url),
  'utf8',
);
assert.equal(new Set(manifest.features.map((feature) => feature.file)).size, 20);
for (const feature of manifest.features) {
  const module = await import(`../server/${feature.module || feature.file}.ts`);
  const operations = module[feature.exportName];
  assert.deepEqual(
    Object.keys(operations).sort(),
    [...feature.methods].sort(),
    feature.file + ' operations inventory',
  );
  const source = fileSystem.readFileSync(
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
  assert.deepEqual(
    parsed.errors,
    [] as typeof parsed.errors,
    `${feature.file}: valid source required`,
  );
  // Native type imports/parameters replace the earlier JSDoc boundary aliases.
  for (const statement of parsed.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers)
      if (
        specifier.type === 'ImportSpecifier' &&
        (
          (specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value) || ''
        ).endsWith('Capabilities')
      )
        capabilityTypes.add(specifier.local.name);
  }
  function collectCapabilityParameters(input: unknown) {
    if (!input || typeof input !== 'object') return;
    const node = input as SourceNode;
    const annotation = node.typeAnnotation?.typeAnnotation;
    if (node.type === 'Identifier' && capabilityTypes.has(annotation?.typeName?.name || ''))
      capabilityParameters.add(node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(collectCapabilityParameters);
      else if (value && typeof value === 'object') collectCapabilityParameters(value);
    }
  }
  collectCapabilityParameters(parsed.program);
  const dependencyNames = new Set<string>();
  function collectDependencies(input: unknown) {
    if (!input || typeof input !== 'object') return;
    const node = input as SourceNode;
    if (
      (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      !node.computed &&
      node.property?.type === 'Identifier' &&
      (node.object?.type === 'ThisExpression' ||
        (node.object?.type === 'Identifier' && capabilityParameters.has(node.object.name || '')))
    )
      dependencyNames.add(node.property.name!);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(collectDependencies);
      else if (value && typeof value === 'object') collectDependencies(value);
    }
  }
  collectDependencies(parsed.program);
  const referenced = [...dependencyNames].sort((first, second) =>
    first < second ? -1 : first > second ? 1 : 0,
  );
  assert.deepEqual(referenced, feature.uses, feature.file + ' declared dependencies');
  const parsedComposition = parseSync('features.ts', composition, { showSemanticErrors: true });
  assert.deepEqual(
    parsedComposition.errors,
    [] as typeof parsedComposition.errors,
    'valid feature composition required',
  );
  const tree = parsedComposition.program;
  let facade: SourceNode | undefined;
  function find(input: unknown) {
    if (!input || typeof input !== 'object') return;
    const node = input as SourceNode;
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
  const provided = facade.properties!.map((player) => player.key?.name || player.key?.value);
  for (const propertyKey of referenced)
    assert.ok(
      provided.includes(propertyKey),
      `${feature.file}: missing explicit capability ${propertyKey}`,
    );
  for (const method of feature.methods)
    assert.equal(
      Object.hasOwn(Game.prototype, method),
      false,
      method + ' must not be installed on Game',
    );
}
console.log('All 20 feature exports and explicit dependencies match the checked-in inventory.');

const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-feature-security-'),
);
const interval = globalThis.setInterval;
process.env.SEEDS_FILE = '/nonexistent';
let game;
try {
  globalThis.setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;
  game = new Game(
    JSON.parse(fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
    new Database(directory),
  );
} finally {
  globalThis.setInterval = interval;
}
try {
  const routes = game.messageHandlers;
  const dispatched = [];
  game.messageHandlers = { types: routes.types, dispatch: (...args) => dispatched.push(args) };
  const session = mockSession({
    data: null as unknown as Session['data'],
    msgs: 0,
    msgT: Date.now(),
    actT: 123,
  });
  game.onMessage(session, { t: 'order', o: 'hold' });
  assert.equal(dispatched.length, 0, 'unauthenticated action must not dispatch');
  session.data = mockPlayerData({});
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
  const notices: string[] = [];
  game.toast = (_session, message) => notices.push(message);
  // Services capture explicit core function capabilities at construction. Use a
  // standalone typed pilot facade to check the unauthorized action's mutation.
  const { FleetCmdOperations } = await import('../server/fleetcmd.ts');
  const fleet = bindOperations(FleetCmdOperations, {
    toast: (_session: Session, message: string) => notices.push(message),
    send() {},
    you() {},
    stats() {
      return { cargo: 20 };
    },
    spaces: {},
  });
  fleet.jettison(mockSession({ data: { cargo, sys: 'meridian' }, ent: null }), 'food', 5);
  assert.deepEqual(cargo, { food: 10 });
  assert.match(notices[0], /only jettison cargo in space/);
  console.log('Authentication, flood, activity, explicit route and docked-action gates preserved.');
} finally {
  fileSystem.rmSync(directory, { recursive: true, force: true });
}
