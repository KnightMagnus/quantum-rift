import { COMPATIBILITY_MESSAGE } from '../shared/protocol.ts';
import type { ClientConnection, ConnectionCredentials } from './connection.ts';

/** Live session facts and UI effects; the transport owner never receives game state. */
export interface ConnectionLifecycleCapabilities {
  /** Current root-owned account epoch, shared with other asynchronous UI work. */
  epoch: () => number;
  /** Current memory-only credentials; missing credentials prohibit reconnect. */
  credentials: () => ConnectionCredentials | undefined;
  /** Build a transport using current server advertisement and mode. */
  createConnection: (credentials: ConnectionCredentials) => ClientConnection;
  /** Local Solo/friend/reference transports need the existing hello packet. */
  sendsHello: () => boolean;
  /** Whether account presentation has already arrived. */
  hasPlayer: () => boolean;
  /** Current duplicate-login denial, never a cached value. */
  kicked: () => boolean;
  /** Dispatch a current transport's encoded packet through the existing owner. */
  receive: (data: string) => void;
  /** Clear held input and transient presentation before reconnect decisions. */
  disconnected: () => void;
  /** Show the existing update-page recovery control. */
  incompatible: () => void;
  /** Show a pre-login connection error and re-enable sign-in. */
  loginError: (message: string) => void;
  /** Update reconnect presentation; only the first failure gets a toast. */
  reconnecting: (first: boolean, reason?: string) => void;
  /** Present early silence without treating a slow peer as disconnected. */
  interrupted?: (interrupted: boolean) => void;
  /** Run the composition root's complete account teardown. */
  terminal: (reason: string) => void;
}

/** Timer seam for deterministic backoff traces; production uses the browser timer. */
export interface ConnectionLifecycleTimers {
  /** Schedule one existing reconnect attempt. */
  schedule: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  /** Cancel the pending attempt when login/logout replaces the account epoch. */
  cancel: (timer: ReturnType<typeof setTimeout> | null) => void;
}

/** Sole socket/reconnect owner; epochs, credentials and player data remain root-owned. */
export class ConnectionLifecycle {
  private socket: ClientConnection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly capabilities: ConnectionLifecycleCapabilities;
  private readonly timers: ConnectionLifecycleTimers;

  constructor(
    capabilities: ConnectionLifecycleCapabilities,
    timers: ConnectionLifecycleTimers = {
      schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
      cancel: (timer) => clearTimeout(timer!),
    },
  ) {
    this.capabilities = capabilities;
    this.timers = timers;
  }

  /** Send only on the current open transport; never queue or replay gameplay actions. */
  send(message: object): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  /** Close the current transport through its ordinary disconnect path. */
  close(): void {
    this.socket?.close();
  }

  /** Invalidate callbacks before the caller revokes tokens or clears account state. */
  detach(): ClientConnection | null {
    this.timers.cancel(this.reconnectTimer);
    const previous = this.socket;
    this.socket = null;
    this.capabilities.interrupted?.(false);
    return previous;
  }

  /** Open or retry with the existing bounded backoff and live account guards. */
  open(tries: number): void {
    const capabilities = this.capabilities;
    const credentials = capabilities.credentials();
    if (!credentials) return;
    const { name, pass } = credentials;
    const epoch = capabilities.epoch();
    const socket = capabilities.createConnection({ name, pass });
    this.socket = socket;
    let compatibilityFailure = false;
    let recovering = false;
    const current = () => this.socket === socket && capabilities.epoch() === epoch;
    socket.oninterrupted = (interrupted) => {
      if (current()) capabilities.interrupted?.(interrupted);
    };
    socket.onopen = () => {
      if (!current()) {
        socket.close();
        return;
      }
      if (capabilities.sendsHello()) this.send({ t: 'hello', name, pass });
    };
    socket.onmessage = (event) => {
      if (current()) capabilities.receive(event.data);
    };
    socket.onclose = () => {
      if (!current()) return;
      capabilities.disconnected();
      if (!capabilities.hasPlayer()) return;
      if (compatibilityFailure) {
        capabilities.terminal(COMPATIBILITY_MESSAGE);
        return;
      }
      if (!capabilities.kicked() && tries < 30) {
        capabilities.reconnecting(
          !tries,
          recovering ? 'Server is recovering. Reconnecting...' : undefined,
        );
        this.reconnectTimer = this.timers.schedule(
          () => {
            if (capabilities.epoch() === epoch && capabilities.credentials()) this.open(tries + 1);
          },
          Math.min(8000, 1000 + tries * 700),
        );
        return;
      }
      capabilities.terminal(
        capabilities.kicked()
          ? 'Signed in somewhere else.'
          : 'Disconnected from the server. Sign in again when it is back.',
      );
    };
    socket.onerror = (message) => {
      if (current() && message === 'Server is recovering. Reconnecting...') recovering = true;
      if (current() && message === COMPATIBILITY_MESSAGE) {
        compatibilityFailure = true;
        capabilities.incompatible();
      }
      if (current() && !capabilities.hasPlayer())
        capabilities.loginError(message || 'Could not reach the Quantum Rift server.');
    };
  }
}
