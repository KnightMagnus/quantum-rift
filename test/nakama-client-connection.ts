import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { Socket as NetSocket } from 'node:net';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { Session } from '@heroiclabs/nakama-js';
import type { Match, MatchData } from '@heroiclabs/nakama-js';
import { upgrade } from '../server/ws.ts';
import { createGameConnection } from '../client/connection.ts';
import type {
  ClientConnection,
  ConnectionConfig,
  ConnectionDependencies,
  NakamaClient,
  NakamaSocket,
} from '../client/connection.ts';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const token = (kind: string) =>
  'header.' +
  Buffer.from(
    JSON.stringify({
      uid: 'fixture-user',
      usn: 'fixture',
      exp: 4102444800,
      kind,
    }),
  ).toString('base64url') +
  '.signature';
const session = new Session(token('access'), token('refresh'), false);
const presence = {
  user_id: 'fixture-user',
  session_id: 'fixture-session',
  username: 'fixture',
  node: 'fixture-node',
};
const match: Match = {
  match_id: 'world-match',
  authoritative: true,
  size: 1,
  presences: [],
  self: presence,
};
const config: ConnectionConfig = {
  solo: false,
  localUrl: 'ws://unused.invalid/ws',
  nakama: { host: 'localhost', port: '7350', useSSL: false, serverKey: 'public-client-key' },
};
const credentials = { name: '  Captain Name  ', pass: 'fixture-password' };

function fixture(
  options: {
    auth?: Promise<Session>;
    join?: Promise<Match>;
    connect?: Promise<Session>;
    denied?: boolean;
    badWorld?: boolean;
  } = {},
) {
  const authEntered = deferred<void>();
  const connectEntered = deferred<void>();
  const joinEntered = deferred<void>();
  const opened = deferred<void>();
  const closed = deferred<void>();
  const authCalls: Array<{
    id: string;
    create?: boolean;
    username?: string;
    vars?: Record<string, string>;
  }> = [];
  const sends: Array<{ matchId: string; opcode: number; data: string | Uint8Array }> = [];
  const revocations: Array<{ session: Session; token: string; refresh: string }> = [];
  const received: string[] = [];
  const errors: Array<string | undefined> = [];
  let opens = 0;
  let closes = 0;
  let disconnects = 0;
  let socketCreations = 0;
  const socket: NakamaSocket = {
    async connect(value, status) {
      assert.equal(value, session);
      assert.equal(status, false);
      connectEntered.resolve();
      return options.connect ?? session;
    },
    disconnect() {
      disconnects++;
    },
    async joinMatch(id) {
      assert.equal(id, match.match_id);
      joinEntered.resolve();
      return options.join ?? match;
    },
    async sendMatchState(matchId, opcode, data) {
      sends.push({ matchId, opcode, data });
    },
    onmatchdata() {},
    ondisconnect() {},
    onerror() {},
    onheartbeattimeout() {},
  };
  const client: NakamaClient = {
    async authenticateCustom(id, create, username, vars) {
      authCalls.push({ id, create, username, vars });
      authEntered.resolve();
      if (options.denied) throw { status: 401 };
      return options.auth ?? session;
    },
    async rpc(value, id, input) {
      assert.equal(value, session);
      assert.equal(id, 'qr_world');
      assert.deepEqual(input, {});
      return { payload: options.badWorld ? {} : { matchId: match.match_id } };
    },
    async sessionLogout(value, access, refresh) {
      revocations.push({ session: value, token: access, refresh });
      return true;
    },
    createSocket(ssl) {
      assert.equal(ssl, false);
      socketCreations++;
      return socket;
    },
  };
  const services: ConnectionDependencies = {
    async createNakamaClient(value) {
      assert.deepEqual(value, config.nakama);
      return client;
    },
    createLocalSocket() {
      throw new Error('Online must not use a raw WebSocket.');
    },
  };
  const connection = createGameConnection(config, credentials, services);
  connection.onopen = () => {
    opens++;
    opened.resolve();
  };
  connection.onclose = () => {
    closes++;
    closed.resolve();
  };
  connection.onerror = (message) => errors.push(message);
  connection.onmessage = (event) => received.push(event.data);
  const emit = (value: unknown, overrides: Partial<MatchData> = {}) =>
    socket.onmatchdata({
      match_id: match.match_id,
      op_code: 2,
      data: new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)),
      ...overrides,
    });
  return {
    connection,
    socket,
    authCalls,
    sends,
    revocations,
    received,
    errors,
    emit,
    authEntered: authEntered.promise,
    connectEntered: connectEntered.promise,
    joinEntered: joinEntered.promise,
    opened: opened.promise,
    closed: closed.promise,
    counts: () => ({ opens, closes, disconnects, socketCreations }),
  };
}

await test(
  'native custom auth joins authoritative world; game commands keep opcode 1 without hello/password',
  { timeout: 2000 },
  async () => {
    const subject = fixture();
    assert.equal(subject.connection.readyState, 0);
    subject.connection.send(JSON.stringify({ t: 'input', seq: 1 }));
    await subject.opened;
    assert.deepEqual(subject.authCalls, [
      {
        id: 'qr:captain%20name',
        create: true,
        username: undefined,
        vars: { pass: credentials.pass, captainName: credentials.name },
      },
    ]);
    assert.equal(subject.connection.readyState, 1);
    subject.connection.send(JSON.stringify({ t: 'hello', ...credentials }));
    subject.connection.send(JSON.stringify({ t: 'input', seq: 2, th: 1 }));
    subject.connection.send(JSON.stringify({ t: 'land', id: 'port' }));
    assert.deepEqual(subject.sends, [
      { matchId: 'world-match', opcode: 1, data: '{"t":"input","seq":2,"th":1}' },
      { matchId: 'world-match', opcode: 1, data: '{"t":"land","id":"port"}' },
    ]);
    assert.ok(!JSON.stringify(subject.sends).includes(credentials.pass));
    await subject.connection.logout();
    assert.deepEqual(subject.revocations, [
      { session, token: session.token, refresh: session.refresh_token },
    ]);
    await subject.connection.logout();
    subject.socket.ondisconnect(new Event('close'));
    subject.connection.close();
    assert.equal(subject.counts().closes, 1);
    assert.equal(subject.revocations.length, 1);
    assert.equal(subject.connection.readyState, 3);
    subject.connection.send('{"t":"input"}');
    assert.equal(subject.sends.length, 2);
  },
);

await test(
  'economic packet headers are validated on native and local receive paths',
  { timeout: 2000 },
  async () => {
    const valid = {
      t: 'you',
      d: { name: 'Captain', sys: 'meridian', credits: 12, cargo: {}, ship: {} },
    };
    const packets = [
      null,
      [],
      { t: 'you', d: null },
      { ...valid, d: { ...valid.d, credits: null } },
      { t: 'refineryQuote', quote: {} },
      { t: 'landed', stellar: 'earth', offers: null },
      valid,
      { t: 'landed', stellar: 'earth', offers: [], yard: null, outfitter: null, mats: [] },
    ];
    const native = fixture();
    await native.opened;
    for (const packet of packets) native.emit(packet);
    assert.deepEqual(
      native.received.map((packet) => JSON.parse(packet)),
      packets.slice(-2),
    );
    await native.connection.logout();
    for (const mode of ['solo', 'friends'] as const) {
      let local!: WebSocket;
      const received: unknown[] = [];
      const connection = createGameConnection(
        {
          solo: mode === 'solo',
          mode: mode === 'friends' ? 'friends' : undefined,
          localTransport: true,
          localUrl: 'ws://fixture.invalid',
        },
        credentials,
        {
          async createNakamaClient() {
            throw new Error('unexpected native connection');
          },
          createLocalSocket() {
            local = {} as WebSocket;
            return local;
          },
        },
      );
      connection.onmessage = (event) => received.push(JSON.parse(event.data));
      await setImmediate();
      local.onopen?.({} as Event);
      for (const packet of packets)
        local.onmessage?.({ data: JSON.stringify(packet) } as MessageEvent);
      assert.deepEqual(received, packets.slice(-2), mode + ' uses identical receive validation');
    }
  },
);

await test(
  'only server opcode 2 for the joined match reaches the game; malformed snapshots are ignored',
  { timeout: 2000 },
  async () => {
    const subject = fixture();
    await subject.opened;
    subject.emit({ t: 'welcome', name: 'Captain Name' }, { match_id: 'other' });
    subject.emit({ t: 'welcome', name: 'Captain Name' }, { op_code: 1 });
    subject.emit({ t: 'welcome', name: 'Captain Name' }, { presence });
    subject.emit('{invalid-json');
    subject.emit(null);
    subject.emit([]);
    subject.emit({ t: 'snap', ships: null });
    const snapshot = {
      t: 'snap',
      ships: [[1, 800, 10, 20, 0, 0, 0, 16, 100, 100, 0, 'Captain Name', 0, 0]],
      shots: [[1, 2, 3, 4, 5]],
      beams: [],
      loot: [],
      ev: [
        ['pickup', 42],
        ['radio', 'signal'],
      ],
      me: [1, 2, 10, 20, 0, 0, 0, 100, 100, 10, 0, [[1, 5]]],
    };
    subject.emit({ ...snapshot, me: [1] });
    subject.emit({ ...snapshot, ships: [[1, 2]] });
    subject.emit({ ...snapshot, shots: [[1, 2, null, 4, 5]] });
    subject.emit({ ...snapshot, ev: [null] });
    subject.emit({ ...snapshot, nhal: { slow: 0, ichor: Infinity, latch: 0 } });
    subject.emit({ ...snapshot, nhal: { slow: 0, ichor: 16, latch: 0 } });
    subject.emit({ ...snapshot, nhal: { slow: '0', ichor: 0, latch: 0 } });
    subject.emit({ ...snapshot, ships: [[...snapshot.ships[0], 'forged-ending']] });
    subject.emit({ ...snapshot, shots: [[1, 2, 3, 4, 5, 'forged-owner']] });
    subject.emit({ ...snapshot, loot: [[1, 2, 3, 4, 2]] });
    const storySnapshot = {
      ...snapshot,
      ships: [[...snapshot.ships[0], 'table']],
      shots: [[1, 2, 3, 4, 5, 1]],
      nhal: { slow: 2, ichor: 4, latch: 0 },
      loot: [[1, 2, 3, 4, 1]],
    };
    subject.emit({ t: 'welcome', name: 'Captain Name' });
    subject.emit(snapshot);
    subject.emit(storySnapshot);
    subject.emit({ ...snapshot, t: 'scene', me: undefined });
    assert.deepEqual(
      subject.received.map((value) => JSON.parse(value)),
      [
        { t: 'welcome', name: 'Captain Name' },
        snapshot,
        storySnapshot,
        JSON.parse(JSON.stringify({ ...snapshot, t: 'scene', me: undefined })),
      ],
    );
    assert.equal(subject.errors.length, 0);
    await subject.connection.logout();
    subject.emit({ t: 'welcome', name: 'stale' });
    assert.equal(subject.received.length, 4);
  },
);

await test(
  'logout during authentication cancels stale completion and revokes the late session',
  { timeout: 2000 },
  async () => {
    const auth = deferred<Session>();
    const subject = fixture({ auth: auth.promise });
    await subject.authEntered;
    const logout = subject.connection.logout();
    assert.equal(subject.connection.readyState, 3);
    auth.resolve(session);
    await logout;
    assert.equal(subject.counts().opens, 0);
    assert.equal(subject.counts().socketCreations, 0);
    assert.equal(subject.counts().closes, 1);
    assert.equal(subject.revocations.length, 1);
  },
);

await test(
  'logout during native socket connect prevents RPC/join and closes late completion',
  { timeout: 2000 },
  async () => {
    const connected = deferred<Session>();
    const subject = fixture({ connect: connected.promise });
    await subject.connectEntered;
    const logout = subject.connection.logout();
    connected.resolve(session);
    await logout;
    assert.equal(subject.counts().opens, 0);
    assert.ok(subject.counts().disconnects >= 1);
    assert.equal(subject.revocations.length, 1);
  },
);

await test(
  'replacing a connection while match join is pending cannot reopen the old session',
  { timeout: 2000 },
  async () => {
    const joined = deferred<Match>();
    const old = fixture({ join: joined.promise });
    await old.joinEntered;
    const logout = old.connection.logout();
    const current = fixture();
    await current.opened;
    joined.resolve(match);
    await logout;
    old.emit({ t: 'welcome', name: 'stale' });
    assert.equal(old.counts().opens, 0);
    assert.equal(old.received.length, 0);
    assert.equal(current.connection.readyState, 1);
    assert.equal(old.counts().closes, 1);
    await current.connection.logout();
  },
);

await test(
  'cancel before async initialization makes no network calls',
  { timeout: 2000 },
  async () => {
    const subject = fixture();
    await subject.connection.logout();
    assert.equal(subject.authCalls.length, 0);
    assert.equal(subject.counts().socketCreations, 0);
    assert.equal(subject.counts().closes, 1);
  },
);

await test(
  'denied auth and invalid world fail once without leaking secrets or falling back',
  { timeout: 2000 },
  async () => {
    const denied = fixture({ denied: true });
    await denied.closed;
    assert.deepEqual(denied.errors, ['Captain name or password was not accepted.']);
    assert.equal(denied.counts().opens, 0);
    assert.equal(denied.counts().socketCreations, 0);
    const unavailable = fixture({ badWorld: true });
    await unavailable.closed;
    assert.equal(unavailable.counts().opens, 0);
    await unavailable.connection.logout();
    assert.equal(unavailable.revocations.length, 1);
  },
);

await test(
  'socket errors, heartbeat timeout and remote disconnect notify close once',
  { timeout: 2000 },
  async () => {
    for (const failure of ['error', 'heartbeat', 'disconnect']) {
      const subject = fixture();
      await subject.opened;
      if (failure === 'error') subject.socket.onerror(new Event('error'));
      else if (failure === 'heartbeat') subject.socket.onheartbeattimeout();
      else subject.socket.ondisconnect(new Event('close'));
      subject.socket.ondisconnect(new Event('close'));
      assert.equal(subject.counts().closes, 1);
      assert.equal(subject.connection.readyState, 3);
      await subject.connection.logout();
      assert.equal(subject.revocations.length, 1);
    }
  },
);

await test(
  'online without endpoint fails closed and never opens raw transport',
  { timeout: 2000 },
  async () => {
    let calls = 0;
    const closed = deferred<void>();
    const connection = createGameConnection(
      { solo: false, localUrl: config.localUrl },
      credentials,
      {
        async createNakamaClient() {
          calls++;
          throw new Error('unexpected SDK call');
        },
        createLocalSocket() {
          calls++;
          throw new Error('unexpected raw transport');
        },
      },
    );
    connection.onclose = () => closed.resolve();
    await closed.promise;
    assert.equal(calls, 0);
    assert.equal(connection.readyState, 3);
  },
);

await test(
  'Solo keeps real local /ws hello, ready/send/close behavior and makes no Nakama calls',
  { timeout: 3000 },
  async (context) => {
    const server = createServer();
    const rawSockets = new Set<NetSocket>();
    let connection: ClientConnection | undefined;
    context.after(async () => {
      connection?.close();
      for (const socket of rawSockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const actions: string[] = [];
    const serverClosed = deferred<void>();
    server.on('upgrade', (request, rawSocket) => {
      assert.ok(rawSocket instanceof NetSocket);
      rawSockets.add(rawSocket);
      upgrade(request, rawSocket, (socket) => {
        socket.on('message', (message: string) => {
          actions.push(message);
          socket.send({ t: 'welcome', name: 'Solo Captain' });
        });
        socket.on('close', () => serverClosed.resolve());
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    let nakamaCalls = 0;
    const opened = deferred<void>();
    const received = deferred<string>();
    let closes = 0;
    connection = createGameConnection(
      { ...config, solo: true, localUrl: 'ws://127.0.0.1:' + address.port + '/ws' },
      credentials,
      {
        async createNakamaClient() {
          nakamaCalls++;
          throw new Error('Solo must not call Nakama');
        },
        createLocalSocket: (url) => new WebSocket(url),
      },
    );
    connection.onopen = () => opened.resolve();
    connection.onmessage = (event) => received.resolve(event.data);
    connection.onclose = () => closes++;
    connection.send('not-open');
    await opened.promise;
    assert.equal(connection.readyState, 1);
    const hello = JSON.stringify({ t: 'hello', name: 'Solo Captain', pass: '' });
    connection.send(hello);
    assert.deepEqual(JSON.parse(await received.promise), { t: 'welcome', name: 'Solo Captain' });
    assert.deepEqual(actions, [hello]);
    await connection.logout();
    await serverClosed.promise;
    connection.send('already-closed');
    await setImmediate();
    assert.equal(connection.readyState, 3);
    assert.equal(nakamaCalls, 0);
    assert.equal(closes, 1);
    assert.deepEqual(actions, [hello]);
  },
);
