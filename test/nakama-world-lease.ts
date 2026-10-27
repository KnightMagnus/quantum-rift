import { GAME_PROTOCOL } from '../shared/protocol.ts';
import {
  advanceWorld,
  attemptWorldJoin,
  joinWorld,
  leaveWorld,
  signalWorld,
} from '../server/nakama-world.ts';
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

// Supply one real callback batch rather than assuming socket writes share a tick.
function ingressConnection(userId: string) {
  const received: number[] = [];
  return {
    open: true,
    presence: { userId },
    lastSequence: 0,
    received,
    receive: (text: string) => received.push(JSON.parse(text).seq),
  };
}
const flooded = ingressConnection('flooded-user');
const peer = ingressConnection('peer-user');
const ingressState = {
  ...callbackState,
  authorityReady: true,
  connections: new Map([
    ['flooded-session', flooded],
    ['peer-session', peer],
  ]),
};
const ingressPorts: Pick<nkruntime.Nakama, 'binaryToString'> = {
  binaryToString: (data) => new TextDecoder().decode(data),
};
function inputMessage(sessionId: string, userId: string, sequence: number) {
  return {
    sender: { sessionId, userId },
    opCode: 1,
    data: new TextEncoder().encode(JSON.stringify({ t: 'input', seq: sequence, th: 0 })).buffer,
  };
}
const ingressHandle = { world: () => ingressState };
function advanceBatch(messages: ReturnType<typeof inputMessage>[], tick: number) {
  return Reflect.apply(advanceWorld, undefined, [
    {},
    { error: () => {} },
    ingressPorts,
    {},
    tick,
    ingressHandle,
    messages,
  ]);
}
advanceBatch(
  [
    ...Array.from({ length: 150 }, (_, index) =>
      inputMessage('flooded-session', 'flooded-user', index + 1),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      inputMessage('peer-session', 'peer-user', index + 1),
    ),
  ],
  2,
);
assert.deepEqual(flooded.received, [1, 2, 3, 4, 5, 6, 7, 8], 'Exactly eight flood inputs admitted');
assert.deepEqual(
  peer.received,
  [1, 2, 3, 4, 5, 6, 7, 8],
  'The peer retains its independent budget',
);
assert.equal(flooded.lastSequence, 8, 'Dropped packets cannot advance the acknowledgement');
advanceBatch(
  [
    inputMessage('flooded-session', 'flooded-user', 151),
    inputMessage('peer-session', 'peer-user', 9),
  ],
  3,
);
assert.deepEqual(
  flooded.received,
  [1, 2, 3, 4, 5, 6, 7, 8, 151],
  'Admission resets on the next tick',
);
assert.deepEqual(peer.received, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
console.log(
  'Actual native ingress callback: eight-message per-session cap, peer fairness and next-tick reset passed.',
);

// Admission is checked again when a batch of successful attempts reaches join.
const capacitySessions = new Map<number, { data: object; inputScheduling?: string }>();
const capacityGame = {
  nextSid: 1,
  sessions: capacitySessions,
  connect: (connection: { on: (event: 'close', callback: () => void) => void }) => {
    assert.ok(capacityState.connections.size <= 30, 'native admission never exceeds 30 slots');
    assert.ok(
      capacitySessions.size < 30,
      'retire the old Game session before replacement allocation',
    );
    const sessionId = capacityGame.nextSid++;
    capacitySessions.set(sessionId, { data: {} });
    connection.on('close', () => capacitySessions.delete(sessionId));
  },
  onMessage: () => {},
};
const deniedPrincipals = new Set(['denied-user']);
const capacityState = {
  ...callbackState,
  leaseId: 'winner',
  matchId: 'another-world',
  connections: new Map(),
  auth: {
    captainForUser: (id: string) => {
      if (deniedPrincipals.has(id)) throw Error('Denied principal');
      return id;
    },
  },
  database: {
    economicFrozen: false,
    withAuthenticatedCaptain: (_name: string, callback: () => void) => callback(),
    flush: () => {},
  },
  game: capacityGame,
};
const capacityHandle = { world: () => capacityState };
const kicked: string[] = [];
const admissionEvents: Array<{ kind: string; session: string; data?: string }> = [];
const capacityDispatcher = {
  broadcastMessage: (_opcode: number, data: string, presences: Array<{ sessionId: string }>) => {
    for (const presence of presences)
      admissionEvents.push({ kind: 'message', session: presence.sessionId, data });
  },
  matchKick: (presences: Array<{ sessionId: string }>) => {
    kicked.push(...presences.map((presence) => presence.sessionId));
    for (const presence of presences)
      admissionEvents.push({ kind: 'kick', session: presence.sessionId });
  },
};
const capacityJoin = () =>
  Reflect.apply(attemptWorldJoin, undefined, [
    {},
    {},
    nativePorts,
    capacityDispatcher,
    1,
    capacityHandle,
    { userId: 'capacity-user' },
    { protocol: String(GAME_PROTOCOL) },
  ]);
assert.equal(capacityJoin().accept, true);
Reflect.apply(joinWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  Array.from({ length: 31 }, (_, index) => ({
    userId: 'capacity-user-' + index,
    sessionId: 'capacity-session-' + index,
  })),
]);
assert.equal(capacityState.connections.size, 30);
assert.equal(capacitySessions.size, 30);
assert.deepEqual(kicked, ['capacity-session-30']);
assert.equal(capacityJoin().accept, false);
assert.match(capacityJoin().rejectMessage, /full/);
// Duplicate callbacks must not allocate another Game session.
Reflect.apply(joinWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  [{ userId: 'capacity-user-0', sessionId: 'capacity-session-0' }],
]);
assert.equal(capacitySessions.size, 30);
console.log(
  'Native admission: 30 accepted, 31st denied, batched joins capped, duplicate join inert.',
);

// A reconnect may arrive before its old half-open presence leaves a full world.
const replacementPresence = { userId: 'capacity-user-0', sessionId: 'replacement-session' };
const replacementAttempt = Reflect.apply(attemptWorldJoin, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  replacementPresence,
  { protocol: String(GAME_PROTOCOL) },
]);
assert.equal(
  replacementAttempt.accept,
  true,
  'same signed principal can replace itself at capacity',
);
const replacementEvents = admissionEvents.length;
Reflect.apply(joinWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  [replacementPresence],
]);
assert.equal(capacityState.connections.size, 30);
assert.equal(capacitySessions.size, 30, 'old Game session retired before new allocation');
assert.ok(!capacityState.connections.has('capacity-session-0'));
assert.equal(
  capacityState.connections.get('replacement-session')?.presence.userId,
  'capacity-user-0',
);
assert.deepEqual(
  admissionEvents.slice(replacementEvents),
  [
    {
      kind: 'message',
      session: 'capacity-session-0',
      data: JSON.stringify({ t: 'error', msg: 'Signed in somewhere else.' }),
    },
    { kind: 'kick', session: 'capacity-session-0' },
  ],
  'displaced-login error precedes kick, preserving the no-auto-reconnect signal',
);
const nextSession = capacityGame.nextSid;
Reflect.apply(joinWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  [replacementPresence],
]);
assert.equal(capacityGame.nextSid, nextSession, 'duplicate replacement callback remains inert');
Reflect.apply(leaveWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  [{ userId: 'capacity-user-0', sessionId: 'capacity-session-0' }],
]);
assert.equal(capacityState.connections.size, 30, 'old delayed leave cannot delete the replacement');
assert.equal(capacitySessions.size, 30);
assert.ok(capacityState.connections.get('replacement-session')?.open);
Reflect.apply(joinWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  [
    { userId: 'new-user', sessionId: 'new-session' },
    { userId: 'denied-user', sessionId: 'denied-session' },
  ],
]);
assert.deepEqual(kicked.slice(-2), ['new-session', 'denied-session']);
assert.equal(
  capacityState.connections.size,
  30,
  'new/unauthenticated batch presences cannot displace a captain',
);
assert.equal(capacitySessions.size, 30);
console.log(
  'Full native admission: authenticated replacement retains 30 slots, sends displacement error before close, rejects a new 31st captain, and ignores stale leave/duplicate callbacks.',
);

deniedPrincipals.add('capacity-user-0');
const revoked = { userId: 'capacity-user-0', sessionId: 'revoked-replacement' };
const deniedAttempt = Reflect.apply(attemptWorldJoin, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  revoked,
  { protocol: String(GAME_PROTOCOL) },
]);
assert.equal(deniedAttempt.accept, false);
assert.match(
  deniedAttempt.rejectMessage,
  /authentication/i,
  'authentication is checked before capacity',
);
Reflect.apply(joinWorld, undefined, [
  {},
  {},
  nativePorts,
  capacityDispatcher,
  1,
  capacityHandle,
  [revoked],
]);
assert.equal(kicked.at(-1), revoked.sessionId, 'join callback rechecks authenticated ownership');
assert.ok(
  capacityState.connections.get('replacement-session')?.open,
  'revoked callback cannot evict the legitimate existing captain',
);
assert.equal(capacitySessions.size, 30);
