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
import { createFeatures } from '../server/features.ts';
import { SYSTEMS } from '../shared/galaxy.ts';
import { INVASION, anomaliesAt } from '../shared/fronts.ts';
import { STATE_SHARE } from '../shared/living.ts';

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
// The Index has no standing ladder; its hidden zero entry is the only new captain field.
assert.equal(actual.saved.rep.nhal, 0);
delete actual.saved.rep.nhal;
assert.equal(actual.saved.rep.index, 0);
delete actual.saved.rep.index;
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
  typeAnnotation?: SourceNode;
  typeName?: SourceNode;
  qualifier?: SourceNode;
  object?: SourceNode;
  property?: SourceNode;
  id?: SourceNode;
  init?: SourceNode;
  key?: { name?: string; value?: string };
  properties?: SourceNode[];
}
function referencedCapabilities(source: string, filename: string): string[] {
  const parsed = parseSync(filename, source, { showSemanticErrors: true });
  assert.deepEqual(parsed.errors, [] as typeof parsed.errors, `${filename}: valid source required`);
  const nodes: SourceNode[] = [];
  function visit(input: unknown) {
    if (!input || typeof input !== 'object') return;
    const node = input as SourceNode;
    nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parsed.program);
  const capabilityTypes = new Set<string>();
  for (const statement of parsed.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers)
      if (
        specifier.type === 'ImportSpecifier' &&
        (specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : specifier.imported.value
        ).endsWith('Capabilities')
      )
        capabilityTypes.add(specifier.local.name);
  }
  function isCapabilityType(annotation: SourceNode | undefined): boolean {
    if (annotation?.type === 'TSImportType')
      return annotation.qualifier?.name?.endsWith('Capabilities') || false;
    return (
      annotation?.type === 'TSTypeReference' && capabilityTypes.has(annotation.typeName?.name || '')
    );
  }
  // Alias order is not significant: an exported import-type alias or a chain of
  // aliases must identify the same capability parameters as a named type import.
  let addedAlias = true;
  while (addedAlias) {
    addedAlias = false;
    for (const node of nodes)
      if (
        node.type === 'TSTypeAliasDeclaration' &&
        node.id?.name &&
        !capabilityTypes.has(node.id.name) &&
        isCapabilityType(node.typeAnnotation)
      ) {
        capabilityTypes.add(node.id.name);
        addedAlias = true;
      }
  }
  const capabilityParameters = new Set<string>();
  for (const node of nodes)
    if (
      node.type === 'Identifier' &&
      node.name &&
      isCapabilityType(node.typeAnnotation?.typeAnnotation)
    )
      capabilityParameters.add(node.name);
  const dependencyNames = new Set<string>();
  for (const node of nodes)
    if (
      (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      !node.computed &&
      node.property?.type === 'Identifier' &&
      (node.object?.type === 'ThisExpression' ||
        (node.object?.type === 'Identifier' && capabilityParameters.has(node.object.name || '')))
    )
      dependencyNames.add(node.property.name!);
  return [...dependencyNames].sort((first, second) =>
    first < second ? -1 : first > second ? 1 : 0,
  );
}

function assertCapabilityInventory(source: string, expected: string[], filename: string) {
  const referenced = referencedCapabilities(source, filename);
  assert.deepEqual(referenced, expected, `${filename} declared dependencies`);
  return referenced;
}

for (const declaration of [
  `import type { MiningCapabilities as Boundary } from './contracts.ts';`,
  `export type Boundary = import('./contracts.ts').MiningCapabilities;`,
  `type Boundary = Intermediate; type Intermediate = import('./contracts.ts').MiningCapabilities;`,
]) {
  const fixture = `${declaration}
    function helper(capabilities: Boundary) { capabilities.bonus(); capabilities.mods(); }
    const unrelated = { ignored() {} }; unrelated.ignored();
    export const operations = { tick(this: Boundary) { this.endTick(); } };
  `;
  const dependencies = ['bonus', 'endTick', 'mods'];
  assertCapabilityInventory(fixture, dependencies, 'native-capability-fixture.ts');
  assert.throws(
    () => assertCapabilityInventory(fixture, ['endTick', 'mods'], 'native-capability-fixture.ts'),
    /declared dependencies/,
    'native helper dependencies cannot be omitted from the inventory',
  );
  assert.throws(
    () =>
      assertCapabilityInventory(
        fixture.replace('capabilities.bonus();', ''),
        dependencies,
        'native-capability-fixture.ts',
      ),
    /declared dependencies/,
    'an unused declared dependency must also fail the inventory',
  );
}
assertCapabilityInventory(
  `function helper(capabilities: import('./contracts.ts').MiningCapabilities) { capabilities.bonus(); }`,
  ['bonus'],
  'direct-native-capability-fixture.ts',
);
console.log('Native capability imports, exported/chained aliases and strict dependency fixtures.');

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
assert.equal(new Set(manifest.features.map((feature) => feature.file)).size, 23);
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
  const referenced = assertCapabilityInventory(source, feature.uses, `${feature.file}.ts`);
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
console.log('All 23 feature exports and explicit dependencies match the checked-in inventory.');

const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-feature-security-'),
);
const interval = globalThis.setInterval;
process.env.SEEDS_FILE = '/nonexistent';
let game;
const { FrontsOperations, createAnomalyReader } = await import('../server/fronts.ts');
// oxlint-disable-next-line typescript/unbound-method -- Call with the captured facade and restore the original operation.
const originalFrontsInit = FrontsOperations.frontsInit;
const capturedFronts: { current?: import('../server/features.ts').FrontsCapabilities } = {};
FrontsOperations.frontsInit = function () {
  capturedFronts.current = this;
  return originalFrontsInit.call(this);
};
const { LivingOperations } = await import('../server/living.ts');
// oxlint-disable-next-line typescript/unbound-method -- Capture the real facade during initialization.
const originalLivingInit = LivingOperations.livingInit;
const capturedLiving: { current?: import('../server/features.ts').LivingCapabilities } = {};
LivingOperations.livingInit = function () {
  capturedLiving.current = this;
  return originalLivingInit.call(this);
};
try {
  globalThis.setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;
  game = new Game(
    JSON.parse(fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
    new Database(directory),
  );
} finally {
  globalThis.setInterval = interval;
  FrontsOperations.frontsInit = originalFrontsInit;
  LivingOperations.livingInit = originalLivingInit;
}
try {
  const livingCapabilities = capturedLiving.current;
  assert.ok(livingCapabilities);
  const marketSystems = game.features.living.marketSystems();
  assert.deepEqual(
    marketSystems,
    SYSTEMS.filter(
      (system) =>
        !system.arena &&
        system.stellars.some(
          (stellar) => stellar.svc && stellar.svc.includes('T') && !stellar.site,
        ),
    ).map((system) => system.id),
    'market selection retains trade-port/site/arena filtering and order',
  );
  assert.equal(game.features.living.marketSystems(), marketSystems, 'cache identity is stable');
  assert.equal(
    Reflect.set(livingCapabilities, 'readMarketSystems', () => []),
    false,
  );
  const otherLiving = createFeatures(game).living;
  assert.deepEqual(otherLiving.marketSystems(), marketSystems);
  assert.notEqual(
    otherLiving.marketSystems(),
    marketSystems,
    'market caches belong to each service',
  );
  assert.equal(livingCapabilities._livingStarted, true, 'Game initialization completes warmup');
  const originalStates = game.db.world.states;
  const originalCooldowns = game.db.world.stateCool;
  const originalMarketSystems = game.features.living.marketSystems;
  try {
    game.db.world.states = {};
    game.db.world.stateCool = Object.fromEntries(
      marketSystems.map((id) => [id, Date.now() + 600000]),
    );
    let reads = 0;
    const countMarkets = () => {
      reads++;
      return marketSystems;
    };
    otherLiving.marketSystems = countMarkets;
    otherLiving.livingTick();
    assert.equal(
      reads,
      1 + Math.round(marketSystems.length * STATE_SHARE) * 3,
      'a new composition uses the initial population budget even when the original is warm',
    );
    reads = 0;
    otherLiving.livingTick();
    assert.equal(reads, 7, 'subsequent ticks use the six-attempt budget');
    game.features.living.marketSystems = countMarkets;
    reads = 0;
    game.features.living.livingTick();
    assert.equal(reads, 7, 'the original service remains warm and resolves live market providers');
    assert.deepEqual(game.db.world.states, {}, 'cooldown suppression is unchanged');
    for (const key of ['_livingStarted', '_mkt'])
      assert.equal(key in game, false, key + ' is no longer exposed on Game');
  } finally {
    game.db.world.states = originalStates;
    game.db.world.stateCool = originalCooldowns;
    game.features.living.marketSystems = originalMarketSystems;
  }
  const frontsCapabilities = capturedFronts.current;
  assert.ok(frontsCapabilities);
  for (const key of ['db', 'sessions', 'spaces'] as const) {
    const original: unknown = frontsCapabilities[key];
    assert.equal(Reflect.set(frontsCapabilities, key, {}), false, key + ' replacement denied');
    assert.equal(frontsCapabilities[key], original);
  }
  assert.equal(
    Reflect.set(frontsCapabilities, 'readAnomalies', () => ({})),
    false,
  );
  const originalNow = Date.now;
  try {
    const windowStart = 1000 * 6 * 3600000;
    Date.now = () => windowStart;
    const initial = game.features.fronts.anomalies();
    assert.deepEqual(initial, anomaliesAt(SYSTEMS, windowStart));
    Date.now = () => windowStart + 6 * 3600000 - 1;
    assert.equal(game.features.fronts.anomalies(), initial, 'reuse the map within a window');
    const otherService = createAnomalyReader();
    const independent = otherService();
    assert.deepEqual(independent, initial);
    assert.notEqual(independent, initial, 'cache ownership is per service, not global');
    Date.now = () => windowStart + 6 * 3600000;
    const refreshed = game.features.fronts.anomalies();
    assert.notEqual(refreshed, initial, 'rollover replaces the cached map');
    assert.deepEqual(refreshed, anomaliesAt(SYSTEMS, Date.now()));
    Date.now = () => windowStart;
    assert.deepEqual(game.features.fronts.anomalies(), initial, 'clock rollback refreshes too');
    const originalAnomalies = game.features.fronts.anomalies;
    try {
      game.features.fronts.anomalies = () => ({ meridian: 'fixture' });
      assert.deepEqual(frontsCapabilities.anomalies(), { meridian: 'fixture' });
    } finally {
      game.features.fronts.anomalies = originalAnomalies;
    }
    for (const key of ['_an', '_anW'])
      assert.equal(Object.hasOwn(game, key), false, 'cache state is not stored on Game');
  } finally {
    Date.now = originalNow;
  }
  const originalClock = Date.now;
  const originalStartInvasion = game.features.fronts.startInvasion;
  const originalInvasion = frontsCapabilities.invasion;
  const originalWindow = frontsCapabilities.lastInvWin;
  const scheduleCalls: number[] = [];
  const period = INVASION.everyMin * 60000;
  try {
    Date.now = () => 1000 * period;
    game.features.fronts.frontsInit();
    assert.equal(Object.hasOwn(game, 'lastInvWin'), false, 'schedule is not Game state');
    game.features.fronts.startInvasion = (window) => {
      scheduleCalls.push(window);
      return {} as ReturnType<typeof originalStartInvasion>;
    };
    game.features.fronts.invasionTick();
    assert.deepEqual(scheduleCalls, [], 'initial window does not spawn again');
    Date.now = () => 1001 * period;
    game.features.fronts.invasionTick();
    game.features.fronts.invasionTick();
    assert.deepEqual(scheduleCalls, [1001], 'rollover spawns once with live provider');
    const independent = createFeatures(game);
    independent.fronts.frontsInit();
    independent.fronts.startInvasion = () => ({}) as ReturnType<typeof originalStartInvasion>;
    assert.equal(frontsCapabilities.lastInvWin, 1001);
    Date.now = () => 1002 * period;
    independent.fronts.invasionTick();
    assert.equal(
      frontsCapabilities.lastInvWin,
      1001,
      'other service ticks cannot advance this schedule',
    );
    independent.fronts.frontsInit();
    assert.equal(
      frontsCapabilities.lastInvWin,
      1001,
      'other service resets cannot reset this schedule',
    );
    Date.now = () => 1000 * period;
    game.features.fronts.invasionTick();
    game.features.fronts.invasionTick();
    assert.deepEqual(scheduleCalls, [1001, 1000], 'rollback retains distinct-window behavior');
    const boss = game.features.fronts.startInvasion;
    game.features.fronts.startInvasion = originalStartInvasion;
    const entity = game.features.fronts.startInvasion(1000, 'meridian');
    const active = frontsCapabilities.invasion;
    assert.ok(active && active.ent === entity);
    independent.fronts.frontsInit();
    assert.equal(
      frontsCapabilities.invasion,
      active,
      'initializing another composition must not discard this active encounter',
    );
    assert.equal(game.features.fronts.worldPayload().invasion?.sys, 'meridian');
    assert.equal(independent.fronts.worldPayload().invasion, null);

    game.features.fronts.startInvasion = boss;
    Date.now = () => 1001 * period;
    // Hold an active encounter through a different schedule window without expiry.
    active.until = Date.now() + period;
    game.features.fronts.invasionTick();
    assert.equal(frontsCapabilities.invasion, active);
    assert.deepEqual(scheduleCalls, [1001, 1000], 'active invasion suppresses scheduling');
    active.sp.ships.delete(entity.id);
    game.features.fronts.invasionTick();
    assert.equal(frontsCapabilities.invasion, null);
    assert.equal(active.sp.keep, false, 'missing boss releases the space');
    assert.deepEqual(scheduleCalls, [1001, 1000, 1001], 'ended invasion permits pending window');
    for (const ship of active.sp.ships.values())
      if (ship.owner === entity.id) active.sp.remove(ship, 'jump');
  } finally {
    Date.now = originalClock;
    game.features.fronts.startInvasion = originalStartInvasion;
    frontsCapabilities.invasion = originalInvasion;
    frontsCapabilities.lastInvWin = originalWindow;
  }
  const originalSessions = game.sessions;
  game.sessions = new Map();
  assert.equal(
    frontsCapabilities.sessions,
    game.sessions,
    'composition-root reads remain late-bound',
  );
  game.sessions = originalSessions;
  const originalSpaces = game.spaces;
  game.spaces = {};
  assert.equal(frontsCapabilities.spaces, game.spaces);
  game.spaces = originalSpaces;
  assert.equal(
    frontsCapabilities.spaces.meridian,
    game.spaces.meridian,
    'lazy wake keeps one live space',
  );
  const routes = game.messageHandlers;
  const dispatched = [];
  game.messageHandlers = { types: routes.types, dispatch: (...args) => dispatched.push(args) };
  const session = mockSession({
    id: 9001,
    data: null as unknown as Session['data'],
    msgs: 0,
    msgT: Date.now(),
    actT: 123,
  });
  // Game.connect registers every live connection before its first packet.
  game.sessions.set(session.id, session);
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
  session.msgs = 0;
  game.sessions.delete(session.id);
  game.onMessage(session, { t: 'order', o: 'attack' });
  assert.equal(dispatched.length, 2, 'unregistered session action must not dispatch');
  assert.ok(routes.types.includes('trade') && routes.types.includes('trade2'));
  assert.equal(new Set(routes.types).size, routes.types.length);
  assert.equal(Object.keys(game.features).length, 27);
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
