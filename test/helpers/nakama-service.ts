import { NativePacketCollector } from './native-packet-collector.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, Session } from '@heroiclabs/nakama-js';
import type { Socket } from '@heroiclabs/nakama-js';
export const repository = path.resolve(import.meta.dirname, '../..');
const privateRoot = path.resolve(repository, '..');
/** CI summaries must never retain bearer tokens, credentials/configuration or private absolute roots. */
export function sanitizedDiagnostic(message: string): string {
  return message
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted JWT]')
    .replaceAll(repository, '[checkout]')
    .replaceAll(privateRoot, '[fixture]');
}
export async function until(predicate: () => unknown, label: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await delay(40);
  }
  throw new Error('Timed out: ' + label);
}
async function port() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const number = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return number;
}
interface Child {
  name: string;
  process: ChildProcess;
  done: Promise<{ code: number | null; signal: string | null }>;
  result?: { code: number | null; signal: string | null };
  error?: string;
}
/** Explicit fixture-only observability and watchdog settings; ordinary tests retain defaults. */
export interface NakamaFixtureOptions {
  /** Include numeric world health summaries in the private native runtime log. */
  runtimeHealth?: boolean;
  /** Total fixture watchdog, including setup and cleanup, between 30 seconds and less than 10 minutes. */
  deadlineMs?: number;
}
/** Bound retained diagnostic packets for sustained scenarios without changing socket delivery. */
export interface NakamaConnectionOptions {
  /** Maximum recent packets and errors; bounded mode also caches three fixed state types. Omitted preserves fixture retention. */
  retainedLimit?: number;
}
/** Native disposable services, without simulated game authority or a Node relay. */
export class NakamaService {
  readonly run: string;
  private readonly runtimeFile: string | Uint8Array;
  readonly children: Child[] = [];
  readonly sockets: Socket[] = [];
  client!: Client;
  apiPort = 0;
  private pgPort = 0;
  private configPath = '';
  private nakama?: Child;
  private binary = '';
  private password = randomBytes(24).toString('hex');
  private cleanupPromise?: Promise<unknown>;
  private deadline: ReturnType<typeof setTimeout>;
  private readonly options: NakamaFixtureOptions;
  private onTerm = () => {
    void this.cleanup().finally(() => process.exit(143));
  };
  private onInterrupt = () => {
    void this.cleanup().finally(() => process.exit(130));
  };
  constructor(
    runtimeFile: string | Uint8Array = path.join(repository, 'dist/nakama/quantum-rift.js'),
    options: NakamaFixtureOptions = {},
  ) {
    const deadlineMs = options.deadlineMs ?? 180000;
    if (!Number.isInteger(deadlineMs) || deadlineMs < 30000 || deadlineMs >= 600000)
      throw new Error('Native fixture deadline must be 30000..599999 milliseconds');
    if (options.runtimeHealth !== undefined && typeof options.runtimeHealth !== 'boolean')
      throw new Error('Native fixture runtimeHealth must be boolean');
    this.options = options;
    this.runtimeFile = typeof runtimeFile === 'string' ? runtimeFile : new Uint8Array(runtimeFile);
    process.umask(0o077);
    const temporary = path.join(privateRoot, 'temp');
    fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
    process.env.TMPDIR = process.env.TMP = process.env.TEMP = temporary;
    process.env.npm_config_cache = path.join(privateRoot, 'npm-cache');
    this.run = fs.mkdtempSync(path.join(temporary, 'nakama-game-'));
    this.deadline = setTimeout(() => {
      console.error('Native game deadline exceeded');
      void this.cleanup().finally(() => process.exit(1));
    }, deadlineMs);
    process.once('SIGTERM', this.onTerm);
    process.once('SIGINT', this.onInterrupt);
  }
  private start(command: string, args: string[], name: string, env = process.env): Child {
    const log = fs.openSync(path.join(this.run, name + '.log'), 'a', 0o600);
    const child = spawn(command, args, {
      cwd: this.run,
      env,
      detached: true,
      stdio: ['ignore', log, log],
    });
    fs.closeSync(log);
    const entry = { name, process: child } as Child;
    entry.done = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        entry.result = { code, signal };
        resolve(entry.result);
      });
      child.once('error', (error) => {
        entry.error = String(error);
        entry.result = { code: -1, signal: null };
        resolve(entry.result);
      });
    });
    this.children.push(entry);
    return entry;
  }
  private async finish(child: Child, timeout = 30000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        child.done,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(child.name + ' timeout; logs: ' + this.run)),
            timeout,
          );
        }),
      ]);
      assert.equal(
        result.code,
        0,
        child.name +
          ': ' +
          JSON.stringify(result) +
          ' ' +
          (child.error || '') +
          '; logs: ' +
          this.run,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private async stop(child: Child) {
    const signal = (name: NodeJS.Signals) => {
      try {
        if (child.process.pid) process.kill(-child.process.pid, name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };
    if (!child.result) {
      signal('SIGTERM');
      await Promise.race([child.done, delay(6000, undefined, { ref: false })]);
    }
    if (!child.result) {
      signal('SIGKILL');
      await Promise.race([child.done, delay(2000, undefined, { ref: false })]);
    }
    assert(child.result, child.name + ' process group did not exit');
  }
  async initialize() {
    const pg = process.env.POSTGRES_BIN;
    assert(pg, 'Set POSTGRES_BIN to a native PostgreSQL bin directory.');
    this.binary =
      process.env.NAKAMA_BINARY || path.join(repository, '.artifacts/nakama/nakama-3.41.0/nakama');
    if (!fs.existsSync(this.binary))
      await this.finish(
        this.start(
          process.execPath,
          [path.join(repository, 'tools/runtime/install-nakama.ts')],
          'install-nakama',
        ),
      );
    this.pgPort = await port();
    let grpc: net.Server | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      this.apiPort = await port();
      try {
        grpc = net.createServer();
        await new Promise<void>((resolve, reject) => {
          grpc!.once('error', reject);
          grpc!.listen(this.apiPort - 1, '127.0.0.1', resolve);
        });
        break;
      } catch {
        grpc = undefined;
      }
    }
    assert(grpc, 'Could not reserve API/gRPC pair');
    await new Promise<void>((resolve) => grpc!.close(() => resolve()));
    const consolePort = await port();
    const pwfile = path.join(this.run, 'postgres-password');
    fs.writeFileSync(pwfile, this.password, { mode: 0o600 });
    assert.equal(fs.statSync(pwfile).mode & 0o777, 0o600);
    const data = path.join(this.run, 'postgres');
    await this.finish(
      this.start(
        path.join(pg, 'initdb'),
        [
          '-D',
          data,
          '-U',
          'postgres',
          '--auth-host=scram-sha-256',
          '--auth-local=scram-sha-256',
          '--pwfile',
          pwfile,
          '--no-locale',
        ],
        'initdb',
      ),
    );
    const postgres = this.start(
      path.join(pg, 'postgres'),
      ['-D', data, '-h', '127.0.0.1', '-p', String(this.pgPort), '-k', ''],
      'postgres',
    );
    await until(() => {
      assert(!postgres.result, 'Postgres exited early');
      return fs
        .readFileSync(path.join(this.run, 'postgres.log'), 'utf8')
        .includes('database system is ready to accept connections');
    }, 'Postgres startup');
    const modules = path.join(this.run, 'modules');
    fs.mkdirSync(modules, { mode: 0o700 });
    const targetRuntime = path.join(modules, 'quantum-rift.js');
    if (typeof this.runtimeFile === 'string') fs.copyFileSync(this.runtimeFile, targetRuntime);
    else fs.writeFileSync(targetRuntime, this.runtimeFile);
    const secret = () => randomBytes(24).toString('hex');
    const serverKey = secret();
    const config = {
      name: 'qr-regression',
      data_dir: path.join(this.run, 'data'),
      database: {
        address: [
          'postgres:' + this.password + '@127.0.0.1:' + this.pgPort + '/nakama?sslmode=disable',
        ],
        max_open_conns: 4,
        max_idle_conns: 2,
      },
      socket: {
        address: '127.0.0.1',
        port: this.apiPort,
        server_key: serverKey,
        max_message_size_bytes: 16384,
        write_timeout_ms: 60000,
        outgoing_queue_size: 256,
      },
      console: {
        address: '127.0.0.1',
        port: consolePort,
        username: 'fixture_admin',
        password: secret(),
        signing_key: secret(),
      },
      session: {
        encryption_key: secret(),
        refresh_encryption_key: secret(),
        token_expiry_sec: 7200,
        refresh_token_expiry_sec: 86400,
      },
      runtime: {
        path: modules,
        js_entrypoint: 'quantum-rift.js',
        http_key: secret(),
        js_min_count: 1,
        js_max_count: 4,
        ...(this.options.runtimeHealth ? { env: ['RIFT_HEALTH=1'] } : {}),
      },
      match: { input_queue_size: 512 },
      logger: { level: this.options.runtimeHealth ? 'info' : 'warn' },
      shutdown_grace_sec: 1,
    };
    this.configPath = path.join(this.run, 'nakama.json');
    fs.writeFileSync(this.configPath, JSON.stringify(config), { mode: 0o600 });
    await this.finish(
      this.start(this.binary, ['migrate', 'up', '--config', this.configPath], 'migrate'),
    );
    this.client = new Client(serverKey, '127.0.0.1', String(this.apiPort), false, 45000);
    await this.startNakama();
    return this;
  }
  private async startNakama() {
    const child = this.start(
      this.binary,
      ['--config', this.configPath],
      'nakama-' + this.children.length,
    );
    this.nakama = child;
    await until(
      async () => {
        assert(!child.result, 'Nakama exited early; logs: ' + this.run);
        try {
          return (
            await fetch('http://127.0.0.1:' + this.apiPort + '/healthcheck', {
              signal: AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          return false;
        }
      },
      'Nakama startup',
      60000,
    );
    const log = fs.readFileSync(path.join(this.run, child.name + '.log'), 'utf8');
    assert(
      !/default.*(?:key|password)|(?:key|password).*default|insecure.*(?:key|password)/i.test(log),
      'Default-secret warning: ' + log,
    );
  }
  async restartNakama() {
    assert(this.nakama);
    await this.stop(this.nakama);
    await this.startNakama();
  }
  /** Trusted test issuer for a real, unmapped account in this disposable database only. */
  async unmappedSession(reference: Session): Promise<Session> {
    const id = randomUUID();
    await this.query("INSERT INTO users (id, username) VALUES ('" + id + "', 'fixture_unmapped')");
    const config: { session: { encryption_key: string } } = JSON.parse(
      fs.readFileSync(this.configPath, 'utf8'),
    );
    const [header, encoded] = reference.token.split('.');
    const claims = {
      ...JSON.parse(Buffer.from(encoded, 'base64url').toString()),
      uid: id,
      usn: 'fixture_unmapped',
      tid: randomUUID(),
    };
    const unsigned = header + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', config.session.encryption_key)
      .update(unsigned)
      .digest('base64url');
    return Session.restore(unsigned + '.' + signature, '');
  }
  async connect(session: Session, options: NakamaConnectionOptions = {}) {
    const packets: Record<string, any>[] = [];
    const errors: unknown[] = [];
    const collector = new NativePacketCollector(packets, errors, options.retainedLimit);
    const socket = this.client.createSocket(false, false, undefined, 5000);
    this.sockets.push(socket);
    let disconnected = false;
    socket.onmatchdata = (message) => {
      assert.equal(message.op_code, 2);
      const packet = JSON.parse(new TextDecoder().decode(message.data));
      collector.receive(packet, message.data.byteLength, packet.t);
    };
    socket.onerror = (error) => {
      collector.error(error);
    };
    socket.ondisconnect = () => {
      disconnected = true;
    };
    await socket.connect(session, false);
    return {
      socket,
      packets,
      errors,
      get receivedPackets() {
        return collector.receivedPackets;
      },
      get receivedBytes() {
        return collector.receivedBytes;
      },
      get errorCount() {
        return collector.errorCount;
      },
      receiveReport: () => collector.report(),
      get disconnected() {
        return disconnected;
      },
      latest(type: string) {
        return (
          collector.latestState(type) ??
          packets
            .slice()
            .reverse()
            .find((packet) => packet.t === type)
        );
      },
    };
  }
  /** Connection is fixed to the disposable fixture database, never an external URL. */
  async query(sql: string): Promise<string> {
    const name = 'query-' + this.children.length;
    const child = this.start(
      path.join(process.env.POSTGRES_BIN!, 'psql'),
      [
        '-h',
        '127.0.0.1',
        '-p',
        String(this.pgPort),
        '-U',
        'postgres',
        '-d',
        'nakama',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      name,
      { ...process.env, PGPASSWORD: this.password },
    );
    await this.finish(child);
    return fs.readFileSync(path.join(this.run, name + '.log'), 'utf8').trim();
  }
  cleanup() {
    if (!this.cleanupPromise)
      this.cleanupPromise = (async () => {
        for (const socket of this.sockets) {
          try {
            socket.disconnect(false);
          } catch {}
        }
        const failures: string[] = [];
        for (const child of this.children.slice().reverse()) {
          try {
            await this.stop(child);
          } catch (error) {
            failures.push(String(error));
          }
        }
        clearTimeout(this.deadline);
        process.removeListener('SIGTERM', this.onTerm);
        process.removeListener('SIGINT', this.onInterrupt);
        const exits = this.children.map((child) => ({
          name: child.name,
          pid: child.process.pid,
          ...child.result,
          error: child.error,
          exited: !!child.result,
        }));
        fs.writeFileSync(
          path.join(this.run, 'cleanup.json'),
          JSON.stringify({ exits, failures }, null, 2),
        );
        assert.equal(failures.length, 0, failures.join('; '));
        return exits;
      })();
    return this.cleanupPromise;
  }
}
