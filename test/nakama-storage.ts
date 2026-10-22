import assert from 'node:assert/strict';
import { NakamaDatabase, nakamaStorageBackend } from '../server/nakama-storage.ts';
import { NAKAMA_CHECKPOINT_KEY } from '../shared/nakama-contracts.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';

class MemoryStorage implements StorageBackend {
  rows = new Map<string, { value: unknown; version: string }>();
  counter = 0;
  failure: 'before' | 'after' | null = null;
  read(key: string) {
    const row = this.rows.get(key);
    return row ? structuredClone(row) : null;
  }
  write(key: string, value: object, version: string) {
    const row = this.rows.get(key);
    if (this.failure === 'before') throw new Error('offline');
    if (version === '*' ? !!row : row?.version !== version) throw new Error('CAS conflict');
    const next = String(++this.counter);
    this.rows.set(key, { value: structuredClone(value), version: next });
    if (this.failure === 'after') throw new Error('lost acknowledgement');
    return next;
  }
}
const storage = new MemoryStorage();
const database = new NakamaDatabase(storage);
assert.throws(() => database.create('Pilot', 'ignored', {}), /Authenticated/);
const pilot = database.withAuthenticatedCaptain('Pilot', () =>
  database.create('Pilot', 'ignored', { credits: 42 }),
);
assert.equal(pilot.credits, 42);
assert.equal(database.check(pilot, 'anything'), false);
assert.equal(
  database.withAuthenticatedCaptain('Other', () => database.check(pilot, 'anything')),
  false,
);
assert.equal(
  database.withAuthenticatedCaptain('Pilot', () => database.check(pilot, 'ignored')),
  true,
);
assert.throws(
  () => database.withAuthenticatedCaptain('Pilot', () => database.create('Pilot', '', {})),
  /already exists/,
);
assert.throws(
  () =>
    database.withAuthenticatedCaptain('Pilot', () => {
      throw new Error('scope');
    }),
  /scope/,
);
assert.equal(database.check(pilot, ''), false);
database.world.sites.home = 'pilot';
pilot.credits = 9;
database.touch();
database.flush();
const recovered = new NakamaDatabase(storage);
assert.equal(recovered.get(' PILOT ')?.credits, 9);
assert.equal(recovered.world.sites.home, 'pilot');
assert.deepEqual(
  JSON.parse(JSON.stringify(recovered.players)),
  JSON.parse(JSON.stringify(database.players)),
);
// A stale VM cannot replace a newer atomic world/player checkpoint.
database.world.sites.home = 'new';
database.touch();
database.flush();
recovered.get('Pilot')!.credits = 777;
recovered.touch();
assert.throws(() => recovered.flush(), /CAS/);
assert.equal(recovered.economicFrozen, true);
assert.equal(recovered.hasPendingCheckpoint(), true);
assert.equal(recovered.get('Pilot')?.credits, 777); // no unsafe memory rollback
assert.throws(() => recovered.touch(), /frozen/);
assert.equal(new NakamaDatabase(storage).get('Pilot')?.credits, 9);
for (const failure of ['before', 'after'] as const) {
  const candidate = new NakamaDatabase(storage);
  candidate.get('Pilot')!.credits = failure === 'after' ? 123 : 456;
  candidate.world.sites.home = failure;
  candidate.touch();
  storage.failure = failure;
  assert.throws(() => candidate.flush());
  assert.equal(candidate.economicFrozen, true);
  assert.throws(() => candidate.flush(), /frozen/);
  storage.failure = null;
  const next = new NakamaDatabase(storage);
  assert.equal(next.get('Pilot')?.credits, failure === 'after' ? 123 : 9);
  assert.equal(next.world.sites.home, failure === 'after' ? 'after' : 'new');
}
const corrupt = new MemoryStorage();
corrupt.write(NAKAMA_CHECKPOINT_KEY, { schema: 1 }, '*');
assert.throws(() => new NakamaDatabase(corrupt), /Invalid/);
// Exercise the exact native permission/ownership envelope, not a parallel fake adapter.
let writeRequest: nkruntime.StorageWriteRequest[] = [];
const native = nakamaStorageBackend({
  storageRead: () => [],
  storageWrite: (rows) => {
    writeRequest = rows;
    return rows.map((row) => ({
      collection: row.collection,
      key: row.key,
      userId: '00000000-0000-0000-0000-000000000000',
      version: 'native-v1',
    }));
  },
});
assert.equal(native.read('key'), null);
assert.equal(native.write('key', { test: true }, '*'), 'native-v1');
assert.equal(writeRequest[0].permissionRead, 0);
assert.equal(writeRequest[0].permissionWrite, 0);
assert.equal(writeRequest[0].userId, '00000000-0000-0000-0000-000000000000');
assert.equal(writeRequest[0].version, '*');
console.log('Nakama storage: atomic recovery, CAS ownership, freeze, permissions passed');
