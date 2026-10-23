import { advanceWorld, attemptWorldJoin, signalWorld } from '../server/nakama-world.ts';
import assert from 'node:assert/strict';
import {
  findOrCreateWorld,
  readWorldLease,
  worldAuthority,
  WORLD_LEASE,
} from '../server/nakama-world-lease.ts';
import type { WorldMatchHost } from '../server/nakama-world-lease.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';
class Memory implements StorageBackend {
  rows = new Map<string, { value: object; version: string }>();
  serial = 0;
  read(key: string) {
    return this.rows.get(key) ?? null;
  }
  write(key: string, value: object, version: string): string {
    const old = this.rows.get(key);
    if ((version === '*' && old) || (version !== '*' && old?.version !== version))
      throw new Error('CAS conflict');
    const next = String(++this.serial);
    this.rows.set(key, { value, version: next });
    return next;
  }
}
const store = new Memory();
let now = 10000,
  ids = 0,
  creates = 0;
const retired: string[] = [];
const live = new Set<string>();
const host: WorldMatchHost = {
  now: () => now,
  uuid: () => 'lease-' + ++ids,
  exists: (id) => live.has(id),
  create: () => {
    const id = 'world-' + ++creates;
    live.add(id);
    return id;
  },
  retire: (id) => {
    retired.push(id);
    live.delete(id);
  },
};
assert.equal(worldAuthority(store, 'missing', 'world'), 'lost');
const pending = store.write(WORLD_LEASE, { leaseId: 'pending', matchId: null, created: now }, '*');
assert.equal(worldAuthority(store, 'pending', 'world'), 'pending');
assert.throws(() => findOrCreateWorld(store, host), /starting/);
assert.equal(creates, 0);
store.write(WORLD_LEASE, { leaseId: 'pending', matchId: null, created: now - 5001 }, pending);
const first = findOrCreateWorld(store, host);
assert.equal(first, 'world-1');
assert.equal(findOrCreateWorld(store, host), first);
assert.equal(creates, 1);
const active = readWorldLease(store)!.value;
assert.equal(worldAuthority(store, active.leaseId, first), 'ready');
assert.equal(worldAuthority(store, active.leaseId, 'another-world'), 'lost');
// Re-enter after a deliberately expired reservation, while its original create call has not returned.
const raced = new Memory();
let attempts = 0;
const racing: WorldMatchHost = {
  ...host,
  create: () => {
    const id = 'race-' + ++attempts;
    live.add(id);
    if (attempts === 1) {
      now += 5001;
      assert.equal(findOrCreateWorld(raced, racing), 'race-2');
    }
    return id;
  },
};
assert.throws(() => findOrCreateWorld(raced, racing), /CAS/);
assert.equal(readWorldLease(raced)!.value.matchId, 'race-2');
assert(retired.includes('race-1'));
assert(!live.has('race-1'));
assert.equal(worldAuthority(raced, 'lease-2', 'race-1'), 'lost');
class LostAck extends Memory {
  override write(key: string, value: object, version: string): string {
    const result = super.write(key, value, version);
    if ('matchId' in value && typeof value.matchId === 'string')
      throw new Error('publish acknowledgement lost');
    return result;
  }
}
const uncertain = new LostAck();
const retiredBefore = retired.length;
const committed = findOrCreateWorld(uncertain, host);
assert.equal(readWorldLease(uncertain)!.value.matchId, committed);
assert.equal(retired.length, retiredBefore);
const invalid = new Memory();
invalid.write(WORLD_LEASE, { matchId: null, leaseId: 'bad', created: NaN }, '*');
assert.throws(() => findOrCreateWorld(invalid, host), /Invalid world lease/);
console.log(
  'World ownership: unpublished worlds cannot advance/join, expired creators lose CAS and retire, committed lost acknowledgements recover.',
);

// Negative native-callback wiring uses narrow SDK spies, not a replacement gameplay simulation.
const fencedStore = new Memory();
let fenceVersion = fencedStore.write(
  WORLD_LEASE,
  { leaseId: 'fenced', matchId: null, created: now },
  '*',
);
let gameTicks = 0,
  deferredTicks = 0;
const nativePorts: Pick<nkruntime.Nakama, 'storageRead'> = {
  storageRead: (requests) =>
    requests.flatMap((request) => {
      const row = fencedStore.read(request.key);
      return row
        ? [
            {
              collection: request.collection,
              key: request.key,
              userId: request.userId || '',
              value: row.value,
              version: row.version,
              permissionRead: 0,
              permissionWrite: 0,
              createTime: 0,
              updateTime: 0,
            },
          ]
        : [];
    }),
};
const callbackState = {
  leaseId: 'fenced',
  matchId: 'world-fenced',
  authorityReady: false,
  dispatcher: {},
  tick: 0,
  connections: new Map(),
  database: { economicFrozen: false, flush: () => {} },
  game: {
    tick: () => {
      gameTicks++;
    },
  },
  deferred: {
    advance: () => {
      deferredTicks++;
    },
  },
};
const handle = { world: () => callbackState };
// Reflect models the SDK callback boundary without asserting a partial spy is the full native API.
const run = (): unknown =>
  Reflect.apply(advanceWorld, undefined, [{}, { error: () => {} }, nativePorts, {}, 1, handle, []]);
run();
assert.equal(gameTicks, 0);
assert.equal(deferredTicks, 0);
const join: unknown = Reflect.apply(attemptWorldJoin, undefined, [
  {},
  {},
  nativePorts,
  {},
  1,
  handle,
  { userId: 'unmapped' },
]);
assert(join && typeof join === 'object' && 'accept' in join && join.accept === false);
fenceVersion = fencedStore.write(
  WORLD_LEASE,
  { leaseId: 'fenced', matchId: 'world-fenced', created: now },
  fenceVersion,
);
run();
assert.equal(gameTicks, 1);
assert.equal(deferredTicks, 1);
callbackState.authorityReady = false;
fencedStore.write(
  WORLD_LEASE,
  { leaseId: 'winner', matchId: 'another-world', created: now },
  fenceVersion,
);
assert.equal(run(), null);
assert.equal(gameTicks, 1);
assert.equal(deferredTicks, 1);
assert.equal(
  Reflect.apply(signalWorld, undefined, [{}, {}, nativePorts, {}, 1, handle, 'stop:fenced']),
  null,
);
console.log(
  'Actual native callback wiring: no pending/orphan simulation or join; published owner advances; orphan signal retires.',
);
