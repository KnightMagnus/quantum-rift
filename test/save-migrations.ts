import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DB } from '../server/db.ts';
import type { PlayerAccount, WorldData } from '../server/db.ts';
import { previewCargoMigration, SAVE_MIGRATION_CATALOG } from '../server/save-migrations.ts';
import { tempDataDir } from './helpers/temp-data.ts';

interface RestoreFixture {
  /** Synthetic saved accounts, not a full historical release archive. */
  players: Record<string, PlayerAccount>;
  /** Unchanged world fields used to detect accidental reset. */
  world: WorldData;
}
function fixture(name: string): RestoreFixture {
  return JSON.parse(
    filesystem.readFileSync(
      new URL(`./fixtures/save-migrations/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
}
function install(saved: RestoreFixture) {
  const directory = tempDataDir('rift-migration-source-');
  filesystem.writeFileSync(path.join(directory, 'players.json'), JSON.stringify(saved.players));
  filesystem.writeFileSync(path.join(directory, 'world.json'), JSON.stringify(saved.world));
  return directory;
}
function contents(directory: string) {
  return Object.fromEntries(
    filesystem
      .readdirSync(directory)
      .sort()
      .map((filename) => [
        filename,
        filesystem.readFileSync(path.join(directory, filename), 'utf8'),
      ]),
  );
}
const legacy = fixture('legacy');
const legacyBytes = JSON.stringify(legacy);
const preview = previewCargoMigration(legacy.players);
assert.equal(preview.changedAccounts, 1);
assert.equal(JSON.stringify(legacy), legacyBytes, 'Preview does not mutate the original');
assert.deepEqual(preview.players['restore pilot'].cargoLots.byCommodity.ore, {
  common: 7,
  rich: 0,
  pure: 0,
});
assert.deepEqual(preview.players['restore pilot'].storageLots.byCommodity.shards, {
  common: 4,
  rich: 0,
  pure: 0,
});
const normalized = structuredClone(preview.players['restore pilot']);
delete (normalized as Partial<PlayerAccount>).cargoLots;
delete (normalized as Partial<PlayerAccount>).storageLots;
assert.deepEqual(normalized, legacy.players['restore pilot'], 'Only ledger fields are added');
assert.deepEqual(previewCargoMigration(preview.players), {
  players: preview.players,
  changedAccounts: 0,
});
const current = fixture('current');
assert.deepEqual(previewCargoMigration(current.players), {
  players: current.players,
  changedAccounts: 0,
});
for (const name of ['corrupt', 'unsupported']) {
  const saved = fixture(name);
  const before = JSON.stringify(saved);
  assert.throws(() => previewCargoMigration(saved.players), /Cargo ledger/);
  assert.equal(JSON.stringify(saved), before);
}
const multiple = structuredClone(legacy.players);
multiple['broken pilot'] = fixture('corrupt').players['restore pilot'];
const multipleBefore = JSON.stringify(multiple);
assert.throws(() => previewCargoMigration(multiple));
assert.equal(
  JSON.stringify(multiple),
  multipleBefore,
  'A late rejection does not partially migrate source accounts',
);
assert.equal(
  new Set(SAVE_MIGRATION_CATALOG.map((entry) => entry.id)).size,
  SAVE_MIGRATION_CATALOG.length,
);

// Exercise the command in a separate process so its local DB timers end with the rehearsal.
const scratch = tempDataDir('rift-migration-scratch-');
for (const name of ['legacy', 'current', 'corrupt', 'unsupported']) {
  const source = install(fixture(name));
  const before = contents(source);
  const result = spawnSync(process.execPath, ['tools/save-restore-verify.ts', source, scratch], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(result.error);
  if (['legacy', 'current'].includes(name)) {
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.changedAccounts, name === 'legacy' ? 1 : 0);
    assert.equal(report.accounts, 1);
    assert.equal(report.journalRecovered, false);
    assert.equal(report.sourceHashes['players.json'].length, 64);
    assert(!result.stdout.includes('Restore Pilot'));
    assert(!result.stdout.includes('4321'));
  } else {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Save restore verification failed; source was not modified.\n');
  }
  assert.deepEqual(
    contents(source),
    before,
    name + ': byte-identical original after success or failure',
  );
  assert.deepEqual(filesystem.readdirSync(scratch), [], 'Disposable restore removed');
}
const journalSource = install(fixture('corrupt'));
filesystem.writeFileSync(
  path.join(journalSource, 'checkpoint.json'),
  JSON.stringify({
    version: 1,
    players: JSON.stringify(legacy.players),
    world: JSON.stringify(legacy.world),
  }),
);
const journalBefore = contents(journalSource);
const recovered = spawnSync(
  process.execPath,
  ['tools/save-restore-verify.ts', journalSource, scratch],
  { encoding: 'utf8', timeout: 15000 },
);
assert.ifError(recovered.error);
assert.equal(recovered.status, 0, recovered.stderr);
assert.equal(
  JSON.parse(recovered.stdout).journalRecovered,
  true,
  'Committed journal supersedes corrupt stale snapshots',
);
assert.deepEqual(
  contents(journalSource),
  journalBefore,
  'Source journal is never recovered in place',
);
const malformedSource = install(legacy);
filesystem.writeFileSync(
  path.join(malformedSource, 'players.json'),
  '{"private-fixture-message":"DO_NOT_PRINT",',
);
const malformedBefore = contents(malformedSource);
const malformedResult = spawnSync(
  process.execPath,
  ['tools/save-restore-verify.ts', malformedSource, scratch],
  { encoding: 'utf8', timeout: 15000 },
);
assert.equal(malformedResult.status, 1);
assert.equal(malformedResult.stdout, '');
assert.equal(
  malformedResult.stderr,
  'Save restore verification failed; source was not modified.\n',
);
assert.deepEqual(contents(malformedSource), malformedBefore);
assert.deepEqual(filesystem.readdirSync(scratch), []);
const empty = tempDataDir('rift-migration-empty-');
assert.equal(
  spawnSync(process.execPath, ['tools/save-restore-verify.ts', empty, scratch], { timeout: 15000 })
    .status,
  1,
);
const nestedScratch = path.join(journalSource, 'scratch');
filesystem.mkdirSync(nestedScratch);
assert.equal(
  spawnSync(process.execPath, ['tools/save-restore-verify.ts', journalSource, nestedScratch], {
    timeout: 15000,
  }).status,
  1,
);
assert.deepEqual(filesystem.readdirSync(nestedScratch), []);

// Existing local read failures must not silently become an empty economy.
const fresh = new DB(tempDataDir('rift-save-fresh-'));
assert.equal(Object.keys(fresh.players).length, 0);
assert.deepEqual(fresh.world, { sites: {} });
for (const filename of ['players.json', 'world.json']) {
  for (const serialized of [
    '{broken',
    'null',
    '[]',
    '1',
    filename === 'players.json' ? '{"pilot":null}' : '{}',
  ]) {
    const source = install(legacy);
    filesystem.writeFileSync(path.join(source, filename), serialized);
    const before = contents(source);
    assert.throws(() => new DB(source));
    assert.deepEqual(contents(source), before);
  }
  const source = install(legacy);
  const before = contents(source);
  const read = filesystem.readFileSync;
  const denied = Object.assign(new Error('Synthetic denied read'), { code: 'EACCES' });
  filesystem.readFileSync = ((target: Parameters<typeof read>[0], ...args: unknown[]) => {
    if (target === path.join(source, filename)) throw denied;
    return Reflect.apply(read, filesystem, [target, ...args]);
  }) as typeof read;
  try {
    assert.throws(
      () => new DB(source),
      (error) => error === denied,
    );
  } finally {
    filesystem.readFileSync = read;
  }
  assert.deepEqual(contents(source), before);
}
for (const invalidPlayers of ['null', '[]', '{"pilot":false}']) {
  const source = install(legacy);
  filesystem.writeFileSync(
    path.join(source, 'checkpoint.json'),
    JSON.stringify({ version: 1, players: invalidPlayers, world: JSON.stringify(legacy.world) }),
  );
  const before = contents(source);
  assert.throws(() => new DB(source), /Invalid local player snapshot/);
  assert.deepEqual(
    contents(source),
    before,
    'Bad journal rejected before rewriting either snapshot',
  );
}

for (const invalidWorld of ['null', '[]', '{}', '{"sites":[]}']) {
  const source = install(legacy);
  filesystem.writeFileSync(
    path.join(source, 'checkpoint.json'),
    JSON.stringify({ version: 1, players: JSON.stringify(legacy.players), world: invalidWorld }),
  );
  const before = contents(source);
  assert.throws(() => new DB(source), /Invalid local world snapshot/);
  assert.deepEqual(contents(source), before, 'Invalid world journal preserves both snapshots');
}
const unreadableJournal = install(legacy);
const journalRead = filesystem.readFileSync;
const journalDenied = Object.assign(new Error('Synthetic journal read denial'), { code: 'EACCES' });
filesystem.readFileSync = ((target: Parameters<typeof journalRead>[0], ...args: unknown[]) => {
  if (target === path.join(unreadableJournal, 'checkpoint.json')) throw journalDenied;
  return Reflect.apply(journalRead, filesystem, [target, ...args]);
}) as typeof journalRead;
try {
  assert.throws(
    () => new DB(unreadableJournal),
    (error) => error === journalDenied,
  );
} finally {
  filesystem.readFileSync = journalRead;
}

// Real journal commit boundaries while installing the existing cargo migration on a copy.
for (const point of [
  'before-journal',
  'after-journal',
  'between-snapshots',
  'after-both',
  'final-sync',
]) {
  const directory = install(legacy);
  const database = new DB(directory);
  database.players = previewCargoMigration(database.players).players;
  database.touch();
  const write = database.writeDurable.bind(database);
  const sync = database.syncDirectory.bind(database);
  const rename = filesystem.renameSync;
  const unlink = filesystem.unlinkSync;
  let injected = false;
  let syncs = 0;
  database.writeDurable = (filename, serialized) => {
    if (point === 'before-journal' && filename === database.journal + '.tmp') {
      injected = true;
      throw new Error('Injected before journal');
    }
    write(filename, serialized);
  };
  database.syncDirectory = () => {
    if (point === 'final-sync' && ++syncs === 3) {
      injected = true;
      throw new Error('Injected final sync');
    }
    sync();
  };
  filesystem.renameSync = (from, to) => {
    if (point === 'between-snapshots' && to === database.wfile) {
      injected = true;
      throw new Error('Injected between snapshots');
    }
    rename(from, to);
    if (point === 'after-journal' && to === database.journal) {
      injected = true;
      throw new Error('Injected after journal');
    }
  };
  filesystem.unlinkSync = (filename) => {
    if (point === 'after-both' && filename === database.journal) {
      injected = true;
      throw new Error('Injected after both snapshots');
    }
    unlink(filename);
  };
  try {
    assert.throws(() => database.flush(), /Injected/);
  } finally {
    filesystem.renameSync = rename;
    filesystem.unlinkSync = unlink;
    database.writeDurable = write;
    database.syncDirectory = sync;
  }
  assert(injected, point);
  assert.equal(database.economicFrozen, point !== 'before-journal');
  if (point !== 'before-journal') assert.throws(() => database.flush(), /frozen/);
  const reopened = new DB(directory);
  assert.equal(
    previewCargoMigration(reopened.players).changedAccounts,
    point === 'before-journal' ? 1 : 0,
  );
  assert.equal(reopened.players['restore pilot'].credits, 4321);
  assert.deepEqual(reopened.world, legacy.world);
  reopened.players = previewCargoMigration(reopened.players).players;
  reopened.touch();
  reopened.flush();
  assert.deepEqual(new DB(directory).players['restore pilot'], preview.players['restore pilot']);
}
console.log(
  'Save catalog: detached cargo migration, read-only restore, fail-closed local reads and real journal recovery passed.',
);
