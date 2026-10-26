import { GAME_PROTOCOL, COMPATIBILITY_MESSAGE, supportedProtocol } from '../shared/protocol.ts';
import { validEconomicPayload } from '../shared/wire-payloads.ts';
import { customCaptainId } from '../shared/nakama-contracts.ts';
import type { Client, Session, Socket } from '@heroiclabs/nakama-js';

/** Public client endpoint returned by /api/status; serverKey is not a server secret. */
export interface NakamaConfig {
  /** Browser-reachable Nakama hostname. */
  host: string;
  /** Nakama HTTP/realtime port, as expected by the official SDK. */
  port: string;
  /** Use HTTPS and secure realtime WebSockets. */
  useSSL: boolean;
  /** Public client API key, never a signing/runtime/console secret. */
  serverKey: string;
}
export interface ConnectionConfig {
  /** Solo uses the private local save server. */
  solo: boolean;
  /** Explicit status discriminator; never infer local transport from absent Nakama. */
  mode?: 'friends';
  /** Server-advertised local transport, accepted only with friend mode. */
  localTransport?: boolean;
  /** Same-origin Solo/friend /ws endpoint. */
  localUrl: string;
  /** Required online; absence must never enable a raw-socket fallback. */
  nakama?: NakamaConfig;
}
export interface ConnectionCredentials {
  /** Captain name; canonicalized only for custom authentication. */
  name: string;
  /** Memory-only password, used exclusively by custom auth online. */
  pass: string;
}
/** The game keeps its existing input cadence and owns reconnection. */
export interface ClientConnection {
  /** WebSocket-compatible CONNECTING/OPEN/CLOSING/CLOSED values. */
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((message?: string) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  /** Cancel pending work, disconnect, and revoke both native session tokens. */
  logout(): Promise<void>;
}
export type NakamaSocket = Pick<
  Socket,
  | 'connect'
  | 'disconnect'
  | 'joinMatch'
  | 'sendMatchState'
  | 'onmatchdata'
  | 'ondisconnect'
  | 'onerror'
  | 'onheartbeattimeout'
>;
export interface NakamaClient {
  authenticateCustom: Client['authenticateCustom'];
  rpc: Client['rpc'];
  sessionLogout: Client['sessionLogout'];
  createSocket(useSSL: boolean): NakamaSocket;
}
export interface ConnectionDependencies {
  createNakamaClient(config: NakamaConfig): Promise<NakamaClient>;
  createLocalSocket(url: string): WebSocket;
  /** Fresh authority advertisement on every connection, including reconnect. */
  readStatus?(): Promise<{ protocol?: unknown }>;
}
const dependencies: ConnectionDependencies = {
  async readStatus() {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Status unavailable');
    return response.json();
  },
  async createNakamaClient(config) {
    const { Client } = await import('@heroiclabs/nakama-js');
    // First legacy scrypt verification is slower in Goja; it upgrades once to native bcrypt.
    return new Client(config.serverKey, config.host, config.port, config.useSSL, 45000);
  },
  createLocalSocket: (url) => new WebSocket(url),
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function numbers(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item: unknown) => typeof item === 'number' && Number.isFinite(item))
  );
}
/** Reject broken snapshot tuples before they can poison prediction or rendering. */
function validPacket(value: unknown): boolean {
  if (!record(value) || typeof value.t !== 'string') return false;
  if (value.t !== 'snap' && value.t !== 'scene') return validEconomicPayload(value);
  if (
    !Array.isArray(value.ships) ||
    !value.ships.every(
      (ship: unknown) =>
        Array.isArray(ship) &&
        (ship.length === 14 || ship.length === 15 || ship.length === 19) &&
        ship.every((field: unknown, index: number) =>
          index >= 15
            ? typeof field === 'number' &&
              Number.isInteger(field) &&
              field >= (index === 16 ? -1 : 0) &&
              field <= (index === 18 ? 7 : 1000000)
            : index === 14
              ? field === null ||
                (typeof field === 'string' &&
                  ['long_dream', 'table', 'unsettling', 'captains_watch'].includes(field))
              : index === 11
                ? field === null || typeof field === 'string'
                : typeof field === 'number' && Number.isFinite(field),
        ),
    )
  )
    return false;
  if (value.nhal !== undefined) {
    const status = value.nhal;
    if (
      !record(status) ||
      !['slow', 'ichor', 'latch'].every(
        (key) =>
          typeof status[key] === 'number' &&
          Number.isInteger(status[key]) &&
          Number(status[key]) >= 0 &&
          Number(status[key]) <= 15,
      )
    )
      return false;
  }
  for (const [key, length] of [
    ['shots', 5],
    ['beams', 4],
    ['loot', 4],
  ] as const) {
    const entries = value[key];
    if (
      !Array.isArray(entries) ||
      !entries.every(
        (entry: unknown) =>
          numbers(entry, length) ||
          (key === 'shots' && numbers(entry, 6)) ||
          (key === 'loot' && numbers(entry, 5) && (entry as number[])[4] === 1),
      )
    )
      return false;
  }
  if (
    !Array.isArray(value.ev) ||
    !value.ev.every(
      (event: unknown) =>
        Array.isArray(event) &&
        typeof event[0] === 'string' &&
        event
          .slice(1)
          .every(
            (field: unknown) =>
              typeof field === 'string' || (typeof field === 'number' && Number.isFinite(field)),
          ),
    )
  )
    return false;
  if (
    value.me !== undefined &&
    (!Array.isArray(value.me) ||
      value.me.length !== 12 ||
      !numbers(value.me.slice(0, 11), 11) ||
      !Array.isArray(value.me[11]) ||
      !value.me[11].every((entry: unknown) => numbers(entry, 2)))
  )
    return false;
  return true;
}

/** Returned synchronously so close/logout can cancel any pending SDK operation. */
export function createGameConnection(
  config: ConnectionConfig,
  credentials: ConnectionCredentials,
  services: ConnectionDependencies = dependencies,
): ClientConnection {
  let state = 0;
  let local: WebSocket | undefined;
  let client: NakamaClient | undefined;
  let socket: NakamaSocket | undefined;
  let session: Session | undefined;
  let matchId = '';
  let logoutPromise: Promise<void> | undefined;
  let finishLocalClose: (() => void) | undefined;
  const localClosed = new Promise<void>((resolve) => {
    finishLocalClose = resolve;
  });
  const finish = () => {
    if (state === 3) return;
    state = 3;
    connection.onclose?.();
  };
  const fail = (message?: string) => {
    if (state === 3) return;
    connection.onerror?.(message);
    socket?.disconnect(false);
    local?.close();
    finish();
  };
  const receive = (data: string) => {
    let packet: unknown;
    try {
      packet = JSON.parse(data);
    } catch {
      return;
    }
    if (record(packet) && packet.t === 'error' && packet.code === 'UPDATE_REQUIRED') {
      fail(COMPATIBILITY_MESSAGE);
      return;
    }
    if (validPacket(packet) && state < 2) connection.onmessage?.({ data });
  };
  const connection: ClientConnection = {
    get readyState() {
      return local?.readyState ?? state;
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data) {
      if (connection.readyState !== 1) return;
      if (local) {
        try {
          const packet: unknown = JSON.parse(data);
          if (record(packet) && packet.t === 'hello')
            data = JSON.stringify({ ...packet, protocol: GAME_PROTOCOL });
        } catch {
          // Keep non-JSON transport handling with the local server.
        }
        local.send(data);
        return;
      }
      // Authentication already logged this presence in; never retransmit credentials.
      let packet: unknown;
      try {
        packet = JSON.parse(data);
      } catch {
        return;
      }
      if (!record(packet) || packet.t === 'hello') return;
      if (socket) void socket.sendMatchState(matchId, 1, data).catch(() => fail());
    },
    close(code, reason) {
      if (local) {
        if (state < 2) {
          state = 2;
          local.close(code, reason);
        }
        return;
      }
      socket?.disconnect(false);
      finish();
    },
    logout() {
      if (!logoutPromise) {
        connection.close(1000, 'Log out');
        logoutPromise = (async () => {
          await started;
          if (local) await localClosed;
          if (client && session)
            await client.sessionLogout(session, session.token, session.refresh_token);
        })();
      }
      return logoutPromise;
    },
  };
  // Yield once so the caller can attach handlers, including for immediate config errors.
  const started = Promise.resolve()
    .then(async () => {
      if (state === 3) return;
      const status = await services.readStatus?.();
      if (state === 3) return;
      if (!supportedProtocol(status?.protocol)) throw new Error(COMPATIBILITY_MESSAGE);
      if (config.solo || (config.mode === 'friends' && config.localTransport === true)) {
        local = services.createLocalSocket(config.localUrl);
        local.onopen = () => {
          state = 1;
          connection.onopen?.();
        };
        local.onmessage = (event: MessageEvent<string>) => receive(event.data);
        local.onerror = () => {
          if (state < 2) connection.onerror?.();
        };
        local.onclose = () => {
          finishLocalClose?.();
          finish();
        };
        return;
      }
      if (!config.nakama) throw new Error('Online service is not configured.');
      client = await services.createNakamaClient(config.nakama);
      if (state === 3) return;
      session = await client.authenticateCustom(
        customCaptainId(credentials.name),
        true,
        undefined,
        { pass: credentials.pass, captainName: credentials.name },
      );
      if (state === 3) return;
      socket = client.createSocket(config.nakama.useSSL);
      socket.ondisconnect = () => finish();
      socket.onerror = () => fail();
      socket.onheartbeattimeout = () => fail();
      socket.onmatchdata = (packet) => {
        if (packet.match_id !== matchId || packet.op_code !== 2 || packet.presence) return;
        receive(new TextDecoder().decode(packet.data));
      };
      await socket.connect(session, false);
      if (state === 3) {
        socket.disconnect(false);
        return;
      }
      const response = await client.rpc(session, 'qr_world', {});
      if (state === 3) return;
      const payload: unknown =
        typeof response.payload === 'string' ? JSON.parse(response.payload) : response.payload;
      if (!record(payload) || typeof payload.matchId !== 'string' || !payload.matchId)
        throw new Error('The online world is unavailable.');
      if (!supportedProtocol(payload.protocol)) throw new Error(COMPATIBILITY_MESSAGE);
      matchId = payload.matchId;
      await socket.joinMatch(matchId, undefined, { protocol: String(GAME_PROTOCOL) });
      if (state === 3) {
        socket.disconnect(false);
        return;
      }
      state = 1;
      connection.onopen?.();
    })
    .catch((error: unknown) => {
      // Server auth errors may be Response objects; do not expose credentials or tokens.
      const message =
        record(error) &&
        typeof error.message === 'string' &&
        error.message.includes(COMPATIBILITY_MESSAGE)
          ? COMPATIBILITY_MESSAGE
          : record(error) && (error.status === 401 || error.status === 403 || error.code === 16)
            ? 'Captain name or password was not accepted.'
            : undefined;
      fail(message);
    });
  return connection;
}
