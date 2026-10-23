/** Actual friends-host process and raw clients; all saves and evidence remain private. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { availablePort, evidenceDir } from './browser-fixture.ts';
import type { ServerMessage, SnapshotMessage } from '../../client/protocol.ts';
import type { PlayerPayload, LandedPayload } from '../../client/main.ts';
export const repository = fileURLToPath(new URL('../../', import.meta.url));
export const password = 'synthetic-friends-only-password';
export async function until(predicate: () => unknown, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(40);
  }
  assert.ok(predicate(), 'Timed out: ' + label);
}
export class FriendHost {
  readonly output: string;
  readonly data: string;
  origin = '';
  process?: ChildProcess;
  private exited?: Promise<unknown>;
  readonly clients = new Set<FriendClient>();
  constructor(label: string) {
    process.umask(0o077);
    const privateRoot = path.resolve(repository, '..');
    for (const name of ['temp', 'evidence', 'npm-cache']) {
      const directory = path.join(privateRoot, name);
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      assert.equal(fs.statSync(directory).mode & 0o077, 0, 'Private fixture directory');
    }
    process.env.TMPDIR = process.env.TMP = process.env.TEMP = path.join(privateRoot, 'temp');
    process.env.npm_config_cache = path.join(privateRoot, 'npm-cache');
    this.output = fs.mkdtempSync(path.join(evidenceDir('friend-host'), label + '-'));
    this.data = fs.mkdtempSync(path.join(privateRoot, 'temp', label + '-'));
  }
  async start() {
    const port = await availablePort();
    this.origin = 'http://127.0.0.1:' + port;
    const log = fs.openSync(path.join(this.output, 'server.log'), 'a', 0o600);
    this.process = spawn(process.execPath, ['server/main.ts'], {
      cwd: repository,
      env: {
        ...process.env,
        HOST_FRIENDS: '1',
        HOST_BIND: '127.0.0.1',
        HOST: '127.0.0.1',
        SOLO: '',
        PORT: String(port),
        DATA_DIR: '',
        FRIEND_DATA_DIR: this.data,
        HOST_PUBLIC_ORIGIN: this.origin,
        SEEDS_FILE: '',
        INVASION_NOW: '',
      },
      stdio: ['ignore', log, log],
    });
    fs.closeSync(log);
    this.exited = new Promise((resolve) => {
      this.process!.once('exit', resolve);
      this.process!.once('error', resolve);
    });
    let status: { mode?: string; solo?: boolean; localTransport?: boolean } | undefined;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      assert.equal(this.process.exitCode, null, 'Host exited; inspect ' + this.output);
      try {
        const response = await fetch(this.origin + '/api/status', {
          signal: AbortSignal.timeout(800),
        });
        if (response.ok) {
          status = await response.json();
          break;
        }
      } catch {
        /* Listener is still starting. */
      }
      await delay(80);
    }
    assert.ok(status, 'Friends host readiness');
    assert.equal(status.mode, 'friends');
    assert.equal(status.localTransport, true);
    assert.equal(status.solo, false);
    return status;
  }
  async connect(name: string, pass = password) {
    const client = new FriendClient(this.origin.replace('http:', 'ws:') + '/ws', name);
    this.clients.add(client);
    await client.open();
    client.send({ t: 'hello', name, pass });
    await until(() => client.you || client.latest('error'), 'login result for ' + name);
    return client;
  }
  async stop() {
    for (const client of this.clients) await client.close();
    this.clients.clear();
    const child = this.process;
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([this.exited, delay(4000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await Promise.race([this.exited, delay(2000)]);
      }
    }
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'Owned host process exited');
    this.process = undefined;
  }
  save(name: string, value: unknown) {
    fs.writeFileSync(path.join(this.output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  }
}
export class FriendClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly snapshots: { at: number; packet: SnapshotMessage }[] = [];
  you?: PlayerPayload;
  snap?: SnapshotMessage;
  landed?: LandedPayload;
  readonly name: string;
  constructor(address: string, name: string) {
    this.name = name;
    const SocketWithHeaders = WebSocket as unknown as {
      new (url: string, options: { headers: Record<string, string> }): WebSocket;
    };
    this.ws = new SocketWithHeaders(address, {
      headers: { Origin: new URL(address).origin.replace('ws:', 'http:') },
    });
    this.ws.addEventListener('message', (event) => {
      const packet = JSON.parse(String(event.data)) as ServerMessage;
      this.messages.push(packet);
      if (this.messages.length > 3000) this.messages.shift();
      if (packet.t === 'you') this.you = packet.d;
      if (packet.t === 'landed') this.landed = packet;
      if (packet.t === 'snap') {
        this.snap = packet;
        this.snapshots.push({ at: Date.now(), packet });
      }
    });
  }
  async open() {
    await until(() => this.ws.readyState !== WebSocket.CONNECTING, 'WebSocket open');
    assert.equal(this.ws.readyState, WebSocket.OPEN);
  }
  send(packet: object) {
    this.ws.send(JSON.stringify(packet));
  }
  latest(type: string) {
    return this.messages.filter((packet) => packet.t === type).at(-1);
  }
  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    this.ws.close();
    await until(() => this.ws.readyState === WebSocket.CLOSED, 'WebSocket closed', 4000);
  }
}
