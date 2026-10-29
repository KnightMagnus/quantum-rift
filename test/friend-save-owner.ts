import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repository = fileURLToPath(new URL('../', import.meta.url));
const temp = path.resolve(repository, '../temp');
fs.mkdirSync(temp, { recursive: true, mode: 0o700 });
const fixture = fs.mkdtempSync(path.join(temp, 'friend-save-security-'));
const data = path.join(fixture, 'world');
const children: ChildProcess[] = [];
async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
function start(port: number, directory = data) {
  // Deliberately weak invoking mask: the authority, not the harness, must fix it.
  const previousMask = process.umask(0o022);
  const child = spawn(process.execPath, ['server/main.ts'], {
    cwd: repository,
    env: {
      ...process.env,
      HOST_FRIENDS: '1',
      HOST_BIND: '127.0.0.1',
      PORT: String(port),
      FRIEND_DATA_DIR: directory,
      DATA_DIR: '',
      SOLO: '',
      SEEDS_FILE: '',
      INVASION_NOW: '',
      HOST_PUBLIC_ORIGIN: undefined,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.umask(previousMask);
  let output = '';
  child.stdout!.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr!.on('data', (chunk) => {
    output += chunk;
  });
  children.push(child);
  return { child, output: () => output };
}
async function until(predicate: () => boolean, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await delay(30);
  assert.ok(predicate(), label);
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  await until(
    () => child.exitCode !== null || child.signalCode !== null,
    'bounded child shutdown',
    4000,
  );
}
async function request(port: number, host: string, upgrade = false): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: upgrade ? '/ws' : '/api/status',
        headers: {
          Host: host,
          Origin: 'http://' + host,
          'X-Forwarded-Host': 'localhost:' + port,
          ...(upgrade
            ? {
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version': '13',
              }
            : {}),
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    request.setTimeout(2000, () => request.destroy(new Error('request timeout')));
    request.on('error', reject);
    request.end();
  });
}
try {
  const port = await availablePort();
  const first = start(port);
  await until(() => first.output().includes('running at'), 'first host ready: ' + first.output());
  const secondPort = await availablePort();
  assert.notEqual(port, secondPort);
  // A malformed committed journal makes any premature DB recovery observable.
  const checkpoint = path.join(data, 'checkpoint.json');
  fs.writeFileSync(checkpoint, 'must not be loaded by the contender', { mode: 0o600 });
  const second = start(secondPort);
  await until(() => second.child.exitCode !== null, 'contender exits');
  assert.notEqual(second.child.exitCode, 0);
  assert.match(second.output(), /already owned or has a stale lock/);
  assert.doesNotMatch(second.output(), /SyntaxError/);
  assert.equal(fs.readFileSync(checkpoint, 'utf8'), 'must not be loaded by the contender');
  fs.unlinkSync(checkpoint);
  const alias = path.join(fixture, 'world-alias');
  fs.symlinkSync(data, alias, 'junction');
  const aliasHost = start(await availablePort(), alias);
  await until(() => aliasHost.child.exitCode !== null, 'canonical save alias contender exits');
  assert.notEqual(aliasHost.child.exitCode, 0);
  assert.match(aliasHost.output(), /already owned or has a stale lock/);
  const failedBindData = path.join(fixture, 'failed-bind');
  const failedBind = start(port, failedBindData);
  await until(() => failedBind.child.exitCode !== null, 'occupied-port host exits');
  assert.notEqual(failedBind.child.exitCode, 0);
  assert.equal(
    fs.existsSync(path.join(failedBindData, '.friend-host.lock')),
    false,
    'clean bind failure releases only its own save lock',
  );
  const bindRetry = start(await availablePort(), failedBindData);
  await until(() => bindRetry.output().includes('running at'), 'retry after clean bind failure');
  await stop(bindRetry.child);
  assert.equal(await request(port, '127.0.0.1:' + port), 200);
  assert.equal(await request(port, 'localhost:' + port), 200);
  assert.equal(await request(port, 'attacker.example:' + port), 403);
  assert.equal(await request(port, 'attacker.example:' + port, true), 403);
  // Actual account creation creates new credential/checkpoint files under inherited 022.
  const SocketWithHeaders = WebSocket as unknown as {
    new (url: string, options: { headers: Record<string, string> }): WebSocket;
  };
  const socket = new SocketWithHeaders('ws://127.0.0.1:' + port + '/ws', {
    headers: { Origin: 'http://127.0.0.1:' + port },
  });
  await until(() => socket.readyState !== WebSocket.CONNECTING, 'socket open');
  assert.equal(socket.readyState, WebSocket.OPEN);
  let authenticated = false;
  socket.addEventListener('message', (event) => {
    if (JSON.parse(String(event.data)).t === 'you') authenticated = true;
  });
  socket.send(
    JSON.stringify({ t: 'hello', name: 'SecurityFixture', pass: 'synthetic-security-only' }),
  );
  await until(() => authenticated, 'synthetic captain authenticated');
  socket.close();
  await until(() => socket.readyState === WebSocket.CLOSED, 'socket closed');
  await stop(first.child);
  assert.equal(first.child.exitCode, 0);
  assert.equal(fs.existsSync(path.join(data, '.friend-host.lock')), false);
  const privateTree = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (process.platform !== 'win32')
        assert.equal(fs.statSync(file).mode & 0o777, entry.isDirectory() ? 0o700 : 0o600, file);
      if (entry.isDirectory()) privateTree(file);
    }
  };
  if (process.platform !== 'win32') assert.equal(fs.statSync(data).mode & 0o777, 0o700);
  privateTree(data);
  // Existing permissive credentials, backups, and committed journal are tightened before recovery.
  const players = fs.readFileSync(path.join(data, 'players.json'), 'utf8');
  const world = fs.readFileSync(path.join(data, 'world.json'), 'utf8');
  fs.mkdirSync(path.join(data, 'backups', 'fixture'), { recursive: true, mode: 0o755 });
  fs.writeFileSync(path.join(data, 'backups', 'fixture', 'players.json'), players);
  fs.writeFileSync(checkpoint, JSON.stringify({ version: 1, players, world }));
  for (const file of [
    checkpoint,
    path.join(data, 'players.json'),
    path.join(data, 'backups', 'fixture', 'players.json'),
  ])
    fs.chmodSync(file, 0o644);
  const restart = start(await availablePort());
  await until(() => restart.output().includes('running at'), 'clean restart recovery');
  assert.equal(fs.existsSync(checkpoint), false);
  privateTree(data);
  assert.equal(fs.readFileSync(path.join(data, 'players.json'), 'utf8'), players);
  await stop(restart.child, process.platform === 'win32' ? 'SIGTERM' : 'SIGHUP');
  assert.equal(restart.child.exitCode, 0, 'supported console-close signal finalizes saves');
  assert.equal(fs.existsSync(path.join(data, '.friend-host.lock')), false);
  // An unclean death leaves an unreclaimed lock, including a dead PID.
  const crash = start(await availablePort());
  await until(() => crash.output().includes('running at'), 'crash fixture ready');
  await stop(crash.child, 'SIGKILL');
  const stale = start(await availablePort());
  await until(() => stale.child.exitCode !== null, 'stale lock fail closed');
  assert.notEqual(stale.child.exitCode, 0);
  assert.match(stale.output(), /manually remove only .friend-host.lock/);
  assert.equal(fs.existsSync(path.join(data, '.friend-host.lock')), true);
  console.log(
    'Friend save security passed: different-port exclusion before recovery, clean restart, private saves under umask 022, hostile HTTP/upgrade denial, stale lock fail-closed.',
  );
} finally {
  for (const child of children) {
    try {
      await stop(child);
    } catch {
      child.kill('SIGKILL');
    }
  }
  fs.rmSync(fixture, { recursive: true, force: true });
}
