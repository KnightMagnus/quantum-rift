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
        escorts: Array.from({ length: shape.storedEscortCount }, () => ({
          ship: structuredClone(seed.ship),
        })),
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
