import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { Socket as NetSocket } from 'node:net';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { Session } from '@heroiclabs/nakama-js';
import type { Match, MatchData } from '@heroiclabs/nakama-js';
import filesystem from 'node:fs';
import path from 'node:path';
import operatingSystem from 'node:os';
import { upgrade, Socket } from '../server/ws.ts';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { CHAINS } from '../shared/quests.ts';
import type { QuestRecord } from '../shared/quests.ts';
import { radioTourOffer } from '../server/radio-discovery.ts';
import { validServerEnvelope } from '../shared/wire-payloads.ts';
import { createGameConnection } from '../client/connection.ts';
import { COMPATIBILITY_MESSAGE } from '../shared/protocol.ts';
import type {
  ClientConnection,
  ConnectionConfig,
  ConnectionDependencies,
  NakamaClient,
  NakamaSocket,
} from '../client/connection.ts';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
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
    protocol?: unknown;
    status?: { protocol?: unknown };
    freshStatus?: () => Promise<{ protocol?: unknown }>;
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
    async joinMatch(id, token, metadata) {
      assert.equal(token, undefined);
      assert.deepEqual(metadata, { protocol: '1' });
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
      return {
        payload: options.badWorld ? {} : { matchId: match.match_id, protocol: options.protocol },
      };
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
    readStatus: options.freshStatus ?? (async () => options.status ?? {}),
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
  'shared economic and communication headers are validated on native and local receive paths',
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
      { t: 'dm', from: 'Captain', to: 'Other', msg: [] },
      { t: 'paused', on: 'true' },
      { t: 'story', id: 'fixture', title: 'Fixture', text: 'Hello', choices: [{}] },
      { t: 'hail', text: 'Hello', opts: [{ label: 'Answer', k: [] }] },
      { t: 'toast', msg: 'x'.repeat(65537) },
      { t: 'unknown', msg: 'Ignored' },
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
  'real completion, hail and chat packets survive native, Solo and friend receive paths',
  { timeout: 10000 },
  async () => {
    const directory = filesystem.mkdtempSync(
      path.join(operatingSystem.tmpdir(), 'wire-notice-producer-'),
    );
    try {
      const database = new DB(directory);
      const game = new Game(
        JSON.parse(
          filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
        ),
        database,
        {
          seedDefinitions: [],
          automaticClock: false,
          defer: () => {},
          randomUUID: () => 'wire-notice-fixture',
        },
      );
      const produced: Record<string, unknown>[] = [];
      const socket = new Socket(new NetSocket());
      socket.send = (raw) =>
        produced.push(JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)));
      socket.close = () => {};
      game.connect(socket, 'fixture');
      const pilot = [...game.sessions.values()][0];
      game.onMessage(pilot, { t: 'hello', name: 'Notice Captain', pass: 'fixture' });
      const player = pilot.data;
      assert(player);
      produced.length = 0;
      const port = STELLARS['meridian-yards'];
      let tour: ReturnType<typeof radioTourOffer> = null;
      for (let attempt = 0; attempt < 1000 && !tour; attempt++) {
        player.stats.jumps = attempt;
        tour = radioTourOffer(port, player);
      }
      assert(tour?.radioTour, 'Find the deterministic ordinary tour offer');
      player.missions.push(tour);
      const beforeCredits = player.credits;
      for (const stop of tour.radioTour.stops) {
        const destination = STELLARS[stop];
        player.sys = destination.system;
        player.stellar = destination.id;
        game.completeOnLanding(pilot, destination);
      }
      assert.equal(player.credits, beforeCredits + 60000, 'Real job owner completes the tour');
      assert.equal(produced.filter((packet) => packet.t === 'story').length, 1);

      const quest: QuestRecord = {
        qid: 'wire-notice-quest',
        name: 'Fixture quest',
        giver: 'Fixture contact',
        at: 'qstation',
        plan: {},
        steps: [],
        step: 0,
        started: Date.now(),
        tries: 0,
        chain: CHAINS[0].id,
        contact: 'fixture-contact',
        lvl: 0,
      };
      const quests = game.features.quests.questInit(player);
      quests.active[quest.qid] = quest;
      game.features.quests.questFinish(pilot, quest);
      assert.equal(
        quests.active[quest.qid],
        undefined,
        'Real quest owner completes its saved record',
      );
      assert.equal(produced.filter((packet) => packet.t === 'story').length, 2);

      const hailState = game.hails.state(pilot);
      hailState.escort = { source: 99999, sys: player.sys, expires: Date.now() + 60000 };
      game.hails.cancelEscort(pilot, hailState);
      assert.equal(hailState.escort, null, 'Real hail owner cancels the escort');
      const notices = produced.filter((packet) => packet.t === 'story' || packet.t === 'hailmark');
      assert.equal(notices.length, 3);
      for (const notice of notices.filter((packet) => packet.t === 'story')) {
        assert.equal(notice.done, true);
        assert.equal(notice.id, undefined, 'Actual completion producers omit an action identifier');
      }
      assert.deepEqual(notices.at(-1), { t: 'hailmark', until: 0 });
      const chat = (channel: string, message: string) => {
        pilot.chatT = 0;
        game.chat(pilot, { ch: channel, msg: message });
      };
      assert.equal(Boolean(pilot.ent), false, 'The real session starts docked');
      chat('all', 'Global docked chat');
      chat('sys', 'System docked chat');
      game.features.coop.armadaOp(pilot, { op: 'form', name: 'Wire Armada' });
      assert(game.features.coop.armadaOf(player), 'The real Armada owner forms the group');
      chat('armada', 'Armada docked chat');
      game.depart(pilot);
      assert.equal(pilot.ent?.state, 'fly');
      chat('sys', 'System flight chat');
      chat('all', 'Global flight chat');
      chat('armada', 'Armada flight chat');
      const chats = produced.filter((packet) => packet.t === 'chat');
      assert.deepEqual(
        chats.map((packet) => [packet.ch, packet.ship, packet.msg]),
        [
          ['all', null, 'Global docked chat'],
          ['sys', null, 'System docked chat'],
          ['armada', null, 'Armada docked chat'],
          ['sys', pilot.ent!.id, 'System flight chat'],
          ['all', null, 'Global flight chat'],
          ['armada', null, 'Armada flight chat'],
        ],
        'Real chat producer uses a finite ship only for system flight chat',
      );
      const invalid = [
        ...['7', [], {}, true].map((ship) => ({
          ...chats[0],
          ship,
        })),
        { t: 'story', title: 'Offer', text: 'Hello' },
        { t: 'story', done: true, id: null, title: 'Notice', text: 'Hello' },
        { t: 'story', done: true, id: 7, title: 'Notice', text: 'Hello' },
        {
          t: 'story',
          done: true,
          title: 'Notice',
          text: 'Hello',
          choices: [{ value: 'accept', label: 'Accept' }],
        },
        { t: 'hailmark', until: Date.now() + 10000 },
        { t: 'hailmark', until: 0, x: [] },
        { t: 'hailmark', until: '0' },
      ];
      const activeMarker = {
        t: 'hailmark',
        until: Date.now() + 10000,
        x: 1,
        y: 2,
        label: 'Fixture',
      };
      const offer = {
        t: 'story',
        id: 'fixture-offer',
        title: 'Offer',
        text: 'Hello',
        choices: [{ value: 'accept', label: 'Accept' }],
      };
      for (const packet of invalid) assert.equal(validServerEnvelope(packet), false);
      const accepted = [...notices, ...chats, activeMarker, offer];
      for (const packet of accepted) assert.equal(validServerEnvelope(packet), true);
      for (const ship of [NaN, Infinity, -Infinity])
        assert.equal(validServerEnvelope({ ...chats[0], ship }), false);
      const packets = [...invalid, ...accepted];
      const native = fixture();
      await native.opened;
      for (const packet of packets) native.emit(packet);
      assert.deepEqual(
        native.received.map((packet) => JSON.parse(packet)),
        accepted,
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
              local = {
                close() {
                  local.onclose?.({} as CloseEvent);
                },
              } as WebSocket;
              return local;
            },
          },
        );
        connection.onmessage = (event) => received.push(JSON.parse(event.data));
        await setImmediate();
        local.onopen?.({} as Event);
        for (const packet of packets)
          local.onmessage?.({ data: JSON.stringify(packet) } as MessageEvent);
        assert.deepEqual(
          received,
          accepted,
          mode + ': real producer notices survive identical receive validation',
        );
        await connection.logout();
      }
    } finally {
      filesystem.rmSync(directory, { recursive: true, force: true });
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
    assert.deepEqual(actions, [JSON.stringify({ ...JSON.parse(hello), protocol: 1 })]);
    await connection.logout();
    await serverClosed.promise;
    connection.send('already-closed');
    await setImmediate();
    assert.equal(connection.readyState, 3);
    assert.equal(nakamaCalls, 0);
    assert.equal(closes, 1);
    assert.deepEqual(actions, [JSON.stringify({ ...JSON.parse(hello), protocol: 1 })]);
  },
);

await test(
  'compatibility preflight and native RPC deny unsupported worlds before joining',
  { timeout: 2000 },
  async () => {
    for (const protocol of [2, 0, null, '1', {}, []]) {
      const subject = fixture({ status: { protocol } });
      await subject.closed;
      assert.equal(subject.authCalls.length, 0, 'preflight must precede native authentication');
      assert.equal(subject.counts().opens, 0);
      assert.match(subject.errors[0]!, /Refresh this page/);
      const rpc = fixture({ protocol });
      await rpc.closed;
      assert.equal(rpc.counts().opens, 0);
      assert.match(rpc.errors[0]!, /Refresh this page/);
    }
    for (const protocol of [1, undefined]) {
      const subject = fixture({ status: { protocol }, protocol });
      await subject.opened;
      await subject.connection.logout();
    }
    let reads = 0;
    const freshStatus = async () => ({ protocol: ++reads === 1 ? 1 : 2 });
    const initial = fixture({ freshStatus });
    await initial.opened;
    await initial.connection.logout();
    const reconnect = fixture({ freshStatus });
    await reconnect.closed;
    assert.equal(reads, 2, 'reconnect must not reuse a cached compatibility decision');
    assert.equal(reconnect.authCalls.length, 0);
  },
);

await test(
  'authoritative native join rejection remains a compatibility error after valid preflight',
  { timeout: 2000 },
  async () => {
    const joined = deferred<Match>();
    const subject = fixture({ status: { protocol: 1 }, protocol: 1, join: joined.promise });
    await subject.joinEntered;
    joined.reject({ code: 3, message: COMPATIBILITY_MESSAGE });
    await subject.closed;
    assert.deepEqual(subject.errors, [COMPATIBILITY_MESSAGE]);
    assert.equal(subject.counts().opens, 0);
    assert.equal(subject.counts().closes, 1);
    await subject.connection.logout();
    assert.equal(subject.revocations.length, 1);
  },
);

await test(
  'local compatibility denial ignores buffered packets and late transport errors',
  { timeout: 2000 },
  async () => {
    const sent: string[] = [];
    const local = {
      readyState: 0,
      onopen: null as (() => void) | null,
      onmessage: null as ((event: MessageEvent<string>) => void) | null,
      onerror: null as (() => void) | null,
      onclose: null as (() => void) | null,
      send(data: string) {
        sent.push(data);
      },
      close() {
        this.readyState = 3;
        this.onclose?.();
      },
    };
    const errors: Array<string | undefined> = [];
    const packets: string[] = [];
    let closes = 0;
    const connection = createGameConnection({ ...config, solo: true }, credentials, {
      readStatus: async () => ({ protocol: 1 }),
      createNakamaClient: async () => {
        throw new Error('Local compatibility fixture must not call Nakama');
      },
      createLocalSocket: () => local as unknown as WebSocket,
    });
    connection.onerror = (message) => errors.push(message);
    connection.onmessage = (event) => packets.push(event.data);
    connection.onclose = () => closes++;
    await setImmediate();
    assert.ok(local.onopen, 'preflight created the local transport');
    local.readyState = 1;
    local.onopen();
    local.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ t: 'error', code: 'UPDATE_REQUIRED' }),
      }),
    );
    local.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify({ t: 'welcome', name: 'stale' }) }),
    );
    local.onerror?.();
    local.onclose?.();
    connection.send('stale action');
    assert.deepEqual(errors, [COMPATIBILITY_MESSAGE], 'late error cannot replace update guidance');
    assert.deepEqual(packets, [], 'buffered welcome cannot revive a rejected connection');
    assert.deepEqual(sent, []);
    assert.equal(closes, 1);
    assert.equal(connection.readyState, 3);
    await connection.logout();
  },
);
