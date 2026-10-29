import crypto from 'node:crypto';
import type { DB, PlayerAccount } from './db.ts';
import type { GameConnection } from './game-platform.ts';

/** Password derivation scoped to one synchronous authority dispatch. */
interface PreparedLogin {
  /** Canonical captain identity. */
  key: string;
  /** Password used only to match the synchronous dispatch arguments. */
  password: string;
  /** Original account identity, or null for registration. */
  account: PlayerAccount | null;
  /** Salt used by the background derivation. */
  salt: string;
  /** Derived key, as hexadecimal. */
  hash: string;
}
const prepared = new WeakMap<DB, PreparedLogin>();
/** Direct tools retain synchronous credentials; only a scoped network login reuses its derived key. */
export function preparedLogin(
  database: DB,
  name: string,
  password: string,
): PreparedLogin | undefined {
  const login = prepared.get(database);
  return login?.key === database.key(name) && login.password === password ? login : undefined;
}
/** One bounded authentication operation; no packet is retained after settlement. */
interface LoginJob {
  /** Account store owned by this local host. */
  database: DB;
  /** Display name from the handshake. */
  name: string;
  /** Password retained only until derivation/dispatch completes. */
  password: string;
  /** Synchronous game dispatch after derivation. */
  dispatch: () => void;
  /** Whether this handshake still owns an open transport. */
  isCurrent: () => boolean;
  /** Complete the admission promise. */
  resolve: () => void;
  /** Reject admission without an account mutation. */
  reject: (error: Error) => void;
}
/** Limits worker-pool pressure without changing durable registration acknowledgments. */
export class LocalLoginQueue {
  private active = 0;
  private jobs: LoginJob[] = [];
  private registrations = new Map<string, { since: number; count: number }>();
  private connections = new Map<string, number>();
  private connectionCount = 0;
  /** Reserve a bounded socket slot; release is idempotent. */
  reserve(address: string): (() => void) | undefined {
    const count = this.connections.get(address) || 0;
    if (this.connectionCount >= 128 || count >= 32) return undefined;
    this.connectionCount++;
    this.connections.set(address, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.connectionCount--;
      const remaining = (this.connections.get(address) || 1) - 1;
      if (remaining) this.connections.set(address, remaining);
      else this.connections.delete(address);
    };
  }
  /** Derive at most two keys at once and retain at most sixteen waiting handshakes. */
  run(
    database: DB,
    name: string,
    password: string,
    address: string,
    dispatch: () => void,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    if (this.jobs.length >= 16)
      return Promise.reject(new Error('Sign-in is busy. Try again shortly.'));
    if (!database.get(name)) {
      const now = Date.now();
      for (const [key, window] of this.registrations)
        if (now - window.since >= 60000) this.registrations.delete(key);
      let window = this.registrations.get(address);
      if (!window) {
        if (this.registrations.size >= 1024)
          return Promise.reject(new Error('Registration is busy. Try again shortly.'));
        window = { since: now, count: 0 };
        this.registrations.set(address, window);
      }
      if (window.count >= 8)
        return Promise.reject(
          new Error('Too many new captains from this connection. Try again in a minute.'),
        );
      window.count++;
    }
    return new Promise<void>((resolve, reject) => {
      this.jobs.push({ database, name, password, dispatch, isCurrent, resolve, reject });
      this.drain();
    });
  }
  private drain(): void {
    while (this.active < 2 && this.jobs.length) {
      const job = this.jobs.shift()!;
      this.active++;
      void this.execute(job);
    }
  }
  private async execute(job: LoginJob): Promise<void> {
    try {
      if (!job.isCurrent()) {
        job.resolve();
        return;
      }
      const account = job.database.get(job.name);
      const salt = account?.salt ?? crypto.randomBytes(16).toString('hex');
      const oldHash = account?.hash;
      const hash = await new Promise<string>((resolve, reject) => {
        crypto.scrypt(job.password, salt, 32, (error, key) => {
          if (error) reject(error);
          else resolve(key.toString('hex'));
        });
      });
      if (!job.isCurrent()) {
        job.resolve();
        return;
      }
      if (
        job.database.get(job.name) !== account ||
        (account && (account.salt !== salt || account.hash !== oldHash))
      )
        throw new Error('Captain changed during sign-in. Please try again.');
      prepared.set(job.database, {
        key: job.database.key(job.name),
        password: job.password,
        account,
        salt,
        hash,
      });
      try {
        job.dispatch();
      } finally {
        prepared.delete(job.database);
      }
      job.resolve();
    } catch (error) {
      job.reject(error instanceof Error ? error : new Error('Sign-in unavailable.'));
    } finally {
      job.password = '';
      this.active--;
      this.drain();
    }
  }
}

/** Network-only asynchronous preflight; Game still owns all identity and save mutations. */
export function localLoginConnection(
  database: DB,
  socket: GameConnection,
  queue: LocalLoginQueue,
  address: string,
): GameConnection {
  let pending = false;
  let authenticated = false;
  const deadline = setTimeout(() => {
    if (!authenticated) socket.close();
  }, 30000);
  deadline.unref();
  socket.on('close', () => clearTimeout(deadline));
  return {
    get open() {
      return socket.open;
    },
    get backlog() {
      return socket.backlog;
    },
    on(event, listener) {
      if (event === 'close') {
        socket.on('close', listener as () => void);
        return;
      }
      const receive = listener as (message: string) => void;
      socket.on('message', (text) => {
        if (pending || !socket.open) return;
        let message: { t?: unknown; name?: unknown; pass?: unknown };
        try {
          message = JSON.parse(text);
        } catch {
          return;
        }
        if (authenticated && message?.t === 'hello') return;
        if (
          message?.t === 'hello' &&
          (typeof message.name !== 'string' || typeof message.pass !== 'string')
        ) {
          socket.send({ t: 'error', msg: 'Captain name and password must be text.' });
          return;
        }
        const name = typeof message?.name === 'string' ? message.name.trim() : '';
        const password = typeof message?.pass === 'string' ? message.pass : '';
        if (
          !authenticated &&
          message?.t === 'hello' &&
          /^[A-Za-z0-9 _'-]{3,20}$/.test(name) &&
          password.length >= 4
        ) {
          pending = true;
          void queue
            .run(
              database,
              name,
              password,
              address,
              () => {
                if (socket.open) receive(text);
              },
              () => socket.open,
            )
            .catch((error: Error) => {
              if (socket.open) socket.send({ t: 'error', msg: error.message });
            })
            .finally(() => {
              pending = false;
            });
        } else receive(text);
      });
    },
    send(data) {
      if (typeof data === 'object' && data !== null && 't' in data && data.t === 'welcome') {
        authenticated = true;
        clearTimeout(deadline);
      }
      socket.send(data);
    },
    close() {
      socket.close();
    },
  };
}
