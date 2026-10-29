import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import type { PlayerAccount, WorldData } from '../server/db.ts';
import type { GameAssets } from '../shared/rules.ts';
import { validateCheckpoint } from '../server/nakama-storage.ts';
import { validateFeaturePlayerSave } from '../server/save-validation.ts';
import { FixtureSocket } from './helpers/refinery-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const platform = {
  seedDefinitions: [],
  automaticClock: false,
  defer: () => {},
  randomUUID: () => 'save-feature-fixture',
};
function game(database = new DB(tempDataDir('rift-feature-save-'))) {
  return new Game(assets, database, platform);
}
function login(instance: Game) {
  const socket = new FixtureSocket();
  instance.connect(socket, '127.0.0.1');
  const session = [...instance.sessions.values()].at(-1)!;
  instance.onMessage(session, { t: 'hello', name: 'Feature Pilot', pass: 'fixture' });
  return { session, socket };
}
function install(players: Record<string, PlayerAccount>, world: WorldData) {
  const directory = tempDataDir('rift-feature-legacy-');
  filesystem.writeFileSync(path.join(directory, 'players.json'), JSON.stringify(players));
  filesystem.writeFileSync(path.join(directory, 'world.json'), JSON.stringify(world));
  return directory;
}
interface CompatibilityShape {
  /** Committed synthetic historical field shape, not an archived binary save. */
  label: string;
  /** Fields absent before their existing feature owner introduced them. */
  remove: string[];
  /** Saved progress retained through initialization. */
  set: Record<string, unknown>;
  /** Retired hired escorts stored with a hull before dock migration. */
  storedEscortCount: number;
  /** Historical hull IDs coexist with compatibility loadout records. */
  storedEscortFormat?: 'hull-ids';
  /** Exact refund from the existing dock owner, never a verifier-issued reward. */
  refund: number;
}
const shapes: CompatibilityShape[] = JSON.parse(
  filesystem.readFileSync(
    new URL('./fixtures/save-migrations/feature-versions.json', import.meta.url),
    'utf8',
  ),
);
const template = game();
const seed = template.db.create('Feature Pilot', 'fixture', template.fresh());
seed.credits = 4321;
for (const shape of shapes) {
  const saved = structuredClone(seed);
  for (const key of shape.remove) delete (saved as unknown as Record<string, unknown>)[key];
  Object.assign(saved, shape.set);
  if (shape.storedEscortCount) {
    saved.dock = [
      {
        ship: structuredClone(seed.ship),
        escorts: Array.from({ length: shape.storedEscortCount }, () =>
          shape.storedEscortFormat === 'hull-ids' ? 752 : { ship: structuredClone(seed.ship) },
        ),
      },
    ];
  }
  const source = JSON.stringify(saved);
  const directory = install({ 'feature pilot': saved }, { sites: {} } as WorldData);
  const instance = game(new DB(directory));
  const { session } = login(instance);
  assert(session.data, shape.label + ': real login succeeds');
  const migrated = session.data;
  assert.equal(migrated.credits, 4321 + shape.refund, shape.label);
  assert.equal(migrated.v26, true);
  assert(Array.isArray(migrated.docks));
  assert(migrated.story && migrated.arcs && migrated.holdout);
  instance.features.specialists.specInit(migrated);
  instance.features.coop.socialInit(migrated);
  assert.deepEqual(JSON.parse(source), saved, 'Fixture input is never mutated');
  const featureState = (account: PlayerAccount) =>
    Object.fromEntries(
      [
        'credits',
        'cargo',
        'cargoLots',
        'storage',
        'storageLots',
        'mats',
        'spec',
        'bp',
        'ship',
        'dock',
        'docks',
        'activeDock',
        'nextUid',
        'story',
        'arcs',
        'holdout',
        'parts',
        'specState',
        'syn',
        'shards',
        'credit',
        'v26',
        'friends',
        'mail',
        'log',
      ].map((key) => [key, (account as unknown as Record<string, unknown>)[key]]),
    );
  const expected = structuredClone(featureState(migrated as PlayerAccount));
  instance.disconnect(session);
  instance.db.touch();
  instance.db.flush();
  for (let restart = 0; restart < 2; restart++) {
    const reopened = game(new DB(directory));
    const next = login(reopened).session;
    assert(next.data);
    reopened.features.specialists.specInit(next.data);
    reopened.features.coop.socialInit(next.data);
    assert.deepEqual(
      featureState(next.data as PlayerAccount),
      expected,
      shape.label + ': reload idempotence',
    );
    reopened.disconnect(next);
    reopened.db.touch();
    reopened.db.flush();
  }
}

// Late corrupt accounts cannot be partially defaulted or paid before a load fails.
const invalidFields: Record<string, unknown>[] = [
  { credits: '4321' },
  { credits: null },
  { v26: 'true' },
  { directives: { '1': -1 } },
  { dock: [null] },
  { dock: [{ ship: null }] },
  { dock: [{ ship: structuredClone(seed.ship), escorts: [-1] }] },
  { dock: [{ ship: structuredClone(seed.ship), escorts: [752.5] }] },
  { dock: [{ ship: structuredClone(seed.ship), escorts: [null] }] },
  { docks: [{ lead: 's1', wings: 'bad' }] },
  { story: { step: -1 } },
  { story: { done: 'bad' } },
  { story: { active: { id: 7 } } },
  { arcs: { one: { step: 0, active: { got: -1 } } } },
  { holdout: { best: -1 } },
  { specState: { one: { tier: 1, comp: { engine: -1 } } } },
  { friends: [7] },
  { shuttles: {} },
  { officers: [false] },
  { station: { queue: {} } },
  { tutV: 9 },
  { tut: -1 },
  { mastery: { '703': -1 } },
];
for (const invalid of invalidFields) {
  const broken = Object.assign(structuredClone(seed), invalid);
  const players = {
    'feature pilot': structuredClone(seed),
    'broken pilot': { ...broken, name: 'Broken Pilot' },
  };
  const directory = install(players, { sites: {} } as WorldData);
  const before = filesystem.readFileSync(path.join(directory, 'players.json'));
  assert.throws(() => new DB(directory), /feature save|Tutorial save/);
  assert.deepEqual(filesystem.readFileSync(path.join(directory, 'players.json')), before);
  assert.throws(
    () => validateCheckpoint({ schema: 1, revision: 1, players, world: { sites: {} } }),
    /feature save|Tutorial save/,
  );
  const live = game();
  const original = live.db.create('Feature Pilot', 'fixture', live.fresh());
  original.credits = 9911;
  const source = structuredClone(broken);
  assert.throws(() => live.importSave(broken), /feature save|Tutorial save/);
  assert.deepEqual(broken, source);
  assert.equal(
    live.db.get('Feature Pilot')!.credits,
    9911,
    'Denied import preserves existing economy',
  );
  Object.assign(original, invalid);
  const loginBefore = structuredClone(original);
  const denied = login(live);
  assert(!denied.session.data, 'Corrupt feature state rejected before session ownership');
  assert(denied.socket.out.some((packet) => packet.t === 'error'));
  assert.deepEqual(original, loginBefore, 'Failed login leaves markers and balances intact');
}
for (const invalidWorld of [
  { fleets: { old: { leader: 'Feature Pilot', members: [], bank: -1 } } },
  { mining: { version: 2 } },
  { mining: null },
  { fleets: { old: { leader: 'Feature Pilot', members: [], bank: null } } },
  { refinery: [] },
  { industrial: { version: 0 } },
  { towing: { version: 2 } },
  { colonies: [] },
  { orders: {} },
]) {
  const world = { sites: {}, ...invalidWorld } as unknown as WorldData;
  const directory = install({ 'feature pilot': seed }, world);
  const before = filesystem.readFileSync(path.join(directory, 'world.json'));
  assert.throws(() => new DB(directory), /feature save/);
  assert.deepEqual(filesystem.readFileSync(path.join(directory, 'world.json')), before);
  assert.throws(
    () => validateCheckpoint({ schema: 1, revision: 1, players: { 'feature pilot': seed }, world }),
    /feature save/,
  );
}
const unsupported = { ...seed, story: { step: 0, done: [] }, tutV: 9 };
const journalDirectory = install({ 'feature pilot': seed }, { sites: {} } as WorldData);
const playersBefore = filesystem.readFileSync(path.join(journalDirectory, 'players.json'));
filesystem.writeFileSync(
  path.join(journalDirectory, 'checkpoint.json'),
  JSON.stringify({
    version: 1,
    players: JSON.stringify({ 'feature pilot': unsupported }),
    world: '{"sites":{}}',
  }),
);
assert.throws(() => new DB(journalDirectory), /Tutorial save/);
assert.deepEqual(
  filesystem.readFileSync(path.join(journalDirectory, 'players.json')),
  playersBefore,
  'Invalid committed feature journal rejects before either snapshot is rewritten',
);
validateFeaturePlayerSave({
  ...seed,
  mastery: { '703': 1.5 },
  futureAppendOnlyField: { version: 37 },
});
console.log(
  'Feature save validation: real legacy login/reloads, exact dock refunds, source preservation and local/native/import/login denial passed.',
);

// Core import validation cannot replace a good slot with malformed original fields.
{
  const instance = game();
  const existing = instance.db.create('Core Import Pilot', 'fixture', instance.fresh());
  existing.credits = 9911;
  instance.db.touch();
  instance.db.flush();
  const source = structuredClone(existing);
  const malformed = [
    { name: 'constructor' },
    { name: 'A captain name beyond twenty characters' },
    { ship: { ...source.ship, hull: 99999 } },
    { ship: { ...source.ship, outfits: { '99999': 1 } } },
    { ship: { ...source.ship, ammo: { '99999': 1 } } },
    { ship: { ...source.ship, fixed: [[99999, 1]] } },
    { ship: { ...source.ship, outfits: null } },
    { sys: 'not-a-system' },
    { stellar: 'not-a-port' },
    { station: { ...source.station, ops: 90 } },
    { station: { ...source.station, done: null } },
    { station: { ...source.station, claimed: null } },
    { station: { ...source.station, refUnits: 'many' } },
    { mats: { ...source.mats, alloy: [-1, 0, 0, 0, 0] } },
    { mats: { ...source.mats, alloy: 'bad' } },
    { rep: { quantum: 'lots' } },
    { missions: [{}, null, 5] },
    { missions: [{ id: 'x', type: 'cargo', qty: 'lots' }] },
    { stats: [] },
    { stats: {} },
    { credits: 1e300 },
    { credits: -1 },
    { cargo: { food: -1 } },
  ];
  const beforePlayers = filesystem.readFileSync(instance.db.file),
    beforeWorld = filesystem.readFileSync(instance.db.wfile);
  for (const patch of malformed) {
    const replacement = Object.assign(structuredClone(source), patch);
    assert.throws(() => instance.importSave(replacement));
    assert.deepEqual(
      instance.db.get(existing.name),
      source,
      'Invalid import preserves the old account',
    );
    assert.deepEqual(filesystem.readFileSync(instance.db.file), beforePlayers);
    assert.deepEqual(filesystem.readFileSync(instance.db.wfile), beforeWorld);
    assert.equal(filesystem.existsSync(instance.db.journal), false);
  }
  const compatible = structuredClone(source);
  compatible.credits = 12.5;
  compatible.rep.quantum = -2.5;
  compatible.mastery = { '703': 1.5 };
  compatible.station.refUnits = 0.25;
  compatible.fuel = 2.5;
  // These markers/containers belong to their established historical migration owners.
  for (const key of [
    'v26',
    'cargoLots',
    'storageLots',
    'tutV',
    'docks',
    'story',
    'shuttles',
  ] as const)
    delete (compatible as Partial<PlayerAccount>)[key];
  instance.importSave(compatible);
  const restored = new DB(instance.db.dir).get(compatible.name)!;
  assert.equal(restored.credits, 12.5);
  assert.equal(restored.rep.quantum, -2.5);
  assert.equal(restored.fuel, 2.5);
  assert.equal(restored.station.refUnits, 0.25);
  assert.equal(restored.mastery!['703'], 1.5);
  const durable = filesystem.readFileSync(instance.db.file);
  const reopened = new DB(instance.db.dir);
  reopened.get(compatible.name)!.mats.alloy[0] = -1;
  reopened.touch();
  assert.throws(() => reopened.flush(), /Invalid feature save/);
  assert.deepEqual(
    filesystem.readFileSync(reopened.file),
    durable,
    'Invalid live inventory cannot poison next startup',
  );
  assert.equal(filesystem.existsSync(reopened.journal), false);
}

// Actual process deaths cover each side of the single replacement checkpoint.
for (const boundary of ['before-journal', 'after-journal', 'after-players', 'after-create']) {
  const instance = game();
  const existing = instance.db.create('Crash Import Pilot', 'fixture', instance.fresh());
  existing.credits = 9911;
  existing.station = { ...existing.station, claimed: true, ops: 1, site: 'site-qgate' };
  instance.db.world.sites['site-qgate'] = instance.db.key(existing.name);
  instance.db.touch();
  instance.db.flush();
  const replacement = structuredClone(existing);
  replacement.credits = 12345;
  replacement.station.site = 'site-meridian';
  const replacementFile = path.join(instance.db.dir, 'replacement.json');
  filesystem.writeFileSync(replacementFile, JSON.stringify(replacement));
  const child = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./fixtures/import-checkpoint-crash.ts', import.meta.url)),
      instance.db.dir,
      replacementFile,
      boundary,
    ],
    { encoding: 'utf8', timeout: 15000 },
  );
  assert.equal(
    filesystem.readFileSync(path.join(instance.db.dir, 'crash-boundary.txt'), 'utf8'),
    boundary,
  );
  assert.ok(
    child.signal === 'SIGKILL' ||
      (process.platform === 'win32' && child.status !== null && child.status !== 0),
    boundary +
      ': expected forced termination, received ' +
      child.status +
      '/' +
      child.signal +
      ': ' +
      child.stderr,
  );
  const restored = new DB(instance.db.dir),
    captain = restored.get(existing.name)!;
  const committed = boundary !== 'before-journal';
  assert.equal(captain.credits, committed ? 12345 : 9911, boundary);
  assert.deepEqual(captain.ship, replacement.ship, 'Never a credential-only intermediate record');
  assert.equal(
    restored.world.sites[committed ? 'site-meridian' : 'site-qgate'],
    restored.key(captain.name),
  );
  assert.equal(restored.world.sites[committed ? 'site-qgate' : 'site-meridian'], undefined);
  assert.equal(filesystem.existsSync(restored.journal), false);
}

// An attempted journal installation stays fail-closed even if the fixture rejects its rename.
{
  const instance = game(),
    existing = instance.db.create('Failed Import Pilot', 'fixture', instance.fresh());
  const previousSites = instance.db.world.sites,
    replacement = structuredClone(existing);
  replacement.credits = 12345;
  replacement.station = { ...replacement.station, claimed: true, ops: 1, site: 'site-meridian' };
  const previous = filesystem.readFileSync(instance.db.file),
    rename = filesystem.renameSync;
  try {
    filesystem.renameSync = (source, target) => {
      if (target === instance.db.journal) throw new Error('fixture denied journal installation');
      return rename(source, target);
    };
    assert.throws(() => instance.importSave(replacement), /denied journal installation/);
  } finally {
    filesystem.renameSync = rename;
  }
  // The journal install was attempted, so DB deliberately marks its outcome uncertain.
  assert.equal(instance.db.economicFrozen, true);
  assert.equal(
    instance.db.get(existing.name)!.credits,
    12345,
    'Uncertain commit does not roll memory back over a possible durable write',
  );
  assert.deepEqual(filesystem.readFileSync(instance.db.file), previous);
  assert.equal(instance.db.world.sites['site-meridian'], instance.db.key(existing.name));
  assert.notEqual(instance.db.world.sites, previousSites);
  assert.equal(new DB(instance.db.dir).get(existing.name)!.credits, existing.credits);
}
console.log(
  'Core imports reject malformed state, preserve historical fractions/defaults and atomically recover complete slots/ownership across four SIGKILL boundaries.',
);

// Failure while preparing a journal is unambiguously precommit and restores live ownership too.
{
  const instance = game(),
    existing = instance.db.create('Prepare Import Pilot', 'fixture', instance.fresh());
  const sites = instance.db.world.sites,
    replacement = structuredClone(existing);
  replacement.credits = 12345;
  replacement.station = { ...replacement.station, claimed: true, ops: 1, site: 'site-meridian' };
  const players = filesystem.readFileSync(instance.db.file),
    write = instance.db.writeDurable.bind(instance.db);
  instance.db.writeDurable = (filename, contents) => {
    if (filename === instance.db.journal + '.tmp')
      throw new Error('fixture cannot prepare journal');
    return write(filename, contents);
  };
  assert.throws(() => instance.importSave(replacement), /cannot prepare journal/);
  assert.equal(instance.db.get(existing.name), existing);
  assert.equal(instance.db.world.sites, sites);
  assert.equal(instance.db.economicFrozen, false);
  assert.deepEqual(filesystem.readFileSync(instance.db.file), players);
  instance.db.economicFrozen = true;
  const frozen = JSON.stringify({ players: instance.db.players, sites: instance.db.world.sites });
  assert.throws(() => instance.importSave(replacement), /Checkpoint recovery required/);
  assert.equal(
    JSON.stringify({ players: instance.db.players, sites: instance.db.world.sites }),
    frozen,
  );
}
