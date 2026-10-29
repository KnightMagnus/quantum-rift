import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { ConnectionLifecycle } from '../client/connection-lifecycle.ts';
import type { ClientConnection, ConnectionCredentials } from '../client/connection.ts';
import { COMPATIBILITY_MESSAGE } from '../shared/protocol.ts';

// Unmodified openSocket body from 4444b8a, before ownership extraction. The VM
// supplies the old composition facts/effects, independently of the new owner.
const before = stripTypeScriptTypes(
  filesystem.readFileSync(
    new URL('./fixtures/ownership/connection-before.txt', import.meta.url),
    'utf8',
  ),
);
function harness(legacy: boolean) {
  const trace: unknown[][] = [];
  const sockets: ClientConnection[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const schedule = (callback: () => void, delay: number) => {
    trace.push(['timer', delay]);
    timers.set(++timerId, callback);
    return timerId as unknown as ReturnType<typeof setTimeout>;
  };
  const cancel = (timer: ReturnType<typeof setTimeout> | null) => {
    trace.push(['cancel', timer]);
    timers.delete(timer as unknown as number);
  };
  const elements = {
    lbtn: { disabled: true, textContent: '' },
    lstat: { disabled: false, textContent: '' },
    lerr: { disabled: false, textContent: '' },
  };
  const state = {
    _cred: { name: 'Trace Captain', pass: 'synthetic' } as ConnectionCredentials | undefined,
    _kicked: false,
    you: null as object | null,
    solo: true,
    _look: 7 as number | null,
    _lookT: 19 as number | null,
  };
  const mouse = { down: true };
  const touch = {
    keys: { fire: true } as Record<string, boolean>,
    stick: { x: 1 } as object | null,
  };
  const create = (configuration: unknown, credentials: ConnectionCredentials) => {
    const id = sockets.length;
    trace.push(['create', configuration, credentials]);
    const socket: ClientConnection = {
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: (data) => {
        trace.push(['send', id, JSON.parse(data)]);
      },
      close: () => {
        trace.push(['close', id]);
      },
      logout: async () => {
        trace.push(['logout', id]);
      },
    };
    sockets.push(socket);
    return socket;
  };
  const context = {
    clientGameState: state,
    sessionEpoch: 3,
    webSocket: null as ClientConnection | null,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    localReferenceTransport: false,
    friendHostTransport: false,
    nakamaConfig: undefined,
    location: { protocol: 'https:', host: 'fixture.invalid' },
    createGameConnection: create,
    COMPATIBILITY_MESSAGE,
    setTimeout: schedule,
    updateAttention: () => {
      trace.push(['attention']);
    },
    clearFlightStatus: () => {
      trace.push(['flight-status']);
    },
    landingFeedback: {
      reset: () => {
        trace.push(['landing-reset']);
      },
    },
    flightEngine: {
      input: {
        clear: () => {
          trace.push(['input-clear']);
        },
      },
    },
    mouse,
    touch,
    elementById2: (id: keyof typeof elements) => elements[id],
    onMessage: (packet: unknown) => {
      trace.push(['receive', packet]);
    },
    toast: (text: string) => {
      trace.push(['toast', text]);
    },
    logOut: async (reason: string) => {
      trace.push(['terminal', reason]);
    },
    compatibilityRefresh: {
      classList: {
        remove: (name: string) => {
          trace.push(['show-update', name]);
        },
      },
    },
    send: (_message: object) => {},
    openSocket: (_tries: number) => {},
  };
  const configuration = () => ({
    solo: !!state.solo || (context.localReferenceTransport && !context.friendHostTransport),
    ...(context.friendHostTransport ? { mode: 'friends', localTransport: true } : {}),
    localUrl: 'wss://fixture.invalid/ws',
    nakama: context.nakamaConfig,
  });
  const lifecycle = new ConnectionLifecycle(
    {
      epoch: () => context.sessionEpoch,
      credentials: () => state._cred,
      createConnection: (credentials) => create(configuration(), credentials),
      sendsHello: () =>
        state.solo || context.localReferenceTransport || context.friendHostTransport,
      hasPlayer: () => !!state.you,
      kicked: () => state._kicked,
      receive: (data) => context.onMessage(JSON.parse(data)),
      disconnected: () => {
        context.updateAttention();
        context.clearFlightStatus();
        context.landingFeedback.reset();
        context.flightEngine.input.clear();
        mouse.down = false;
        touch.keys = {};
        touch.stick = null;
        state._look = state._lookT = null;
        elements.lbtn.disabled = false;
      },
      incompatible: () => context.compatibilityRefresh.classList.remove('hidden'),
      loginError: (message) => {
        elements.lerr.textContent = message;
        elements.lbtn.disabled = false;
      },
      reconnecting: (first) => {
        if (first) context.toast('Connection lost. Reconnecting...');
        elements.lstat.textContent = 'Reconnecting to the server...';
      },
      terminal: (reason) => {
        void context.logOut(reason);
      },
    },
    { schedule, cancel },
  );
  context.send = legacy
    ? (message) => {
        if (context.webSocket?.readyState === 1) context.webSocket.send(JSON.stringify(message));
      }
    : (message) => lifecycle.send(message);
  if (legacy) vm.runInNewContext(before, context);
  return {
    trace,
    state,
    context,
    sockets,
    timers,
    open: (tries = 0) => (legacy ? context.openSocket(tries) : lifecycle.open(tries)),
    send: context.send,
    close: () => (legacy ? context.webSocket?.close() : lifecycle.close()),
    detach: () => {
      if (!legacy) return lifecycle.detach();
      cancel(context.reconnectTimer);
      const previous = context.webSocket;
      context.webSocket = null;
      return previous;
    },
    fireTimer: () => {
      const [id, callback] = [...timers][0];
      timers.delete(id);
      callback();
    },
    snapshot: () => structuredClone({ state, mouse, touch, elements }),
  };
}
const scenarios: Record<string, (subject: ReturnType<typeof harness>) => void> = {
  'local hello/current packet/stale callback denial': (subject) => {
    subject.open();
    const first = subject.sockets[0];
    first.onopen!();
    first.onmessage!({ data: '{"t":"welcome"}' });
    subject.send({ t: 'input', seq: 17 });
    subject.context.sessionEpoch++;
    void subject.detach()!.logout();
    first.onmessage!({ data: '{"t":"stale"}' });
    first.onerror!('stale');
    first.onclose!();
    first.onopen!();
  },
  'native welcome before open and pre-login errors': (subject) => {
    subject.state.solo = false;
    subject.open();
    const socket = subject.sockets[0];
    socket.onmessage!({ data: '{"t":"welcome"}' });
    socket.onopen!();
    socket.onerror!();
    socket.onclose!();
  },
  'bounded reconnect with live transport and credentials': (subject) => {
    subject.state.you = {};
    subject.open();
    for (let attempt = 0; attempt <= 30; attempt++) {
      subject.sockets.at(-1)!.onclose!();
      if (attempt < 30) {
        if (attempt === 2) {
          subject.state._cred = { name: 'Live Captain', pass: 'changed-fixture' };
          subject.state.solo = false;
          subject.context.friendHostTransport = true;
        }
        subject.fireTimer();
        subject.sockets.at(-1)!.onopen!();
      }
    }
  },
  'duplicate login is terminal': (subject) => {
    subject.state.you = {};
    subject.open();
    subject.state._kicked = true;
    subject.close();
    subject.sockets[0].onclose!();
  },
  'compatibility disconnect is terminal without retry': (subject) => {
    subject.state.you = {};
    subject.open();
    subject.sockets[0].onerror!(COMPATIBILITY_MESSAGE);
    subject.sockets[0].onclose!();
  },
  'detach cancels an already pending retry': (subject) => {
    subject.state.you = {};
    subject.open();
    subject.sockets[0].onclose!();
    assert.equal(subject.timers.size, 1);
    subject.context.sessionEpoch++;
    void subject.detach()!.logout();
    subject.sockets[0].onopen!();
  },
  'closed transports never queue or replay actions': (subject) => {
    subject.open();
    const socket = subject.sockets[0];
    Object.defineProperty(socket, 'readyState', { value: 0, configurable: true });
    subject.send({ t: 'denied-before-open' });
    Object.defineProperty(socket, 'readyState', { value: 1, configurable: true });
    subject.send({ t: 'accepted-on-current' });
    subject.detach();
    subject.send({ t: 'denied-after-detach' });
  },
  'epoch and removed credentials deny scheduled retry': (subject) => {
    subject.state.you = {};
    subject.open();
    subject.sockets[0].onclose!();
    subject.context.sessionEpoch++;
    subject.fireTimer();
    subject.open();
    subject.sockets.at(-1)!.onclose!();
    subject.state._cred = undefined;
    subject.fireTimer();
    subject.open();
  },
};
for (const [name, scenario] of Object.entries(scenarios)) {
  const legacy = harness(true),
    current = harness(false);
  scenario(legacy);
  scenario(current);
  assert.deepEqual(
    JSON.parse(JSON.stringify(current.trace)),
    JSON.parse(JSON.stringify(legacy.trace)),
    name,
  );
  assert.deepEqual(current.snapshot(), legacy.snapshot(), name + ': root-owned state/effects');
  assert.equal(current.timers.size, 0, name + ': no orphaned retry');
}
// A recovering world can reject a valid login before the first captain projection.
{
  const subject = harness(false);
  subject.open();
  subject.sockets[0].onerror!('Server is recovering. Reconnecting...');
  subject.sockets[0].onclose!();
  assert.equal(subject.state.you, null);
  assert.equal(
    subject.timers.size,
    1,
    'pre-player recovery schedules a bounded credentialed retry',
  );
  subject.fireTimer();
  assert.equal(subject.sockets.length, 2);
  subject.sockets[1].onerror!();
  subject.sockets[1].onclose!();
  assert.equal(subject.timers.size, 1, 'temporary join failures retain the bounded recovery chain');
  subject.fireTimer();
  assert.equal(subject.sockets.length, 3);
  subject.state.you = {};
  subject.sockets[2].onmessage!({ data: '{"t":"welcome"}' });
  assert.ok(subject.trace.some((event) => event[0] === 'receive'));
}
{
  const subject = harness(false);
  subject.open(30);
  subject.sockets[0].onerror!('Server is recovering. Reconnecting...');
  subject.sockets[0].onclose!();
  assert.equal(subject.timers.size, 0, 'pre-player recovery obeys the existing retry cap');
  assert.ok(subject.trace.some((event) => event[0] === 'terminal'));
}
console.log(
  'Connection lifecycle: independent before/after callback, backoff, stale epoch, live credentials, denial and teardown traces passed.',
);
