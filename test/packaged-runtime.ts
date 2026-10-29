import { NakamaService, until } from './helpers/nakama-service.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import operatingSystem from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { Socket } from '../server/ws.ts';
import type { ServerMessage, SnapshotMessage } from '../client/protocol.ts';
import type { PlayerPayload, LandedPayload } from '../client/main.ts';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.ts';

const scratch = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-package-'));
const checkout = path.join(scratch, 'source');
const output = path.join(scratch, 'archives');
const extracted = path.join(scratch, 'extracted');
const evidence = evidenceDir('packaged-runtime-' + path.basename(scratch));
const python = process.platform === 'win32' ? 'python' : 'python3';
const environment = {
  ...process.env,
  PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
  GIT_AUTHOR_NAME: 'Package Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Package Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  HUSKY: '0',
};
function command(
  binary: string,
  args: readonly string[],
  workingDirectory = checkout,
  expected = 0,
) {
  const result = spawnSync(binary, args, {
    cwd: workingDirectory,
    env: environment,
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 8 * 1024 * 1024,
  });
  fileSystem.appendFileSync(
    path.join(evidence, 'commands.log'),
    (result.stdout || '') + (result.stderr || ''),
  );
  if (result.error) throw result.error;
  if (expected === 0) assert.equal(result.status, 0, `${binary}: ${result.stderr}`);
  else assert.notEqual(result.status, 0, 'Invalid package input must fail');
  return result.stdout;
}
function copy(relative: string) {
  const destination = path.join(checkout, relative);
  fileSystem.mkdirSync(path.dirname(destination), { recursive: true });
  fileSystem.copyFileSync(path.join(root, relative), destination);
}
/** Real RFC 6455 client with a browser Origin and masked client frames. */
async function captain(origin: string, name: string, pass = 'synthetic-archive-friends') {
  const key = randomBytes(16).toString('base64');
  const socket = await new Promise<Socket>((resolve, reject) => {
    const upgrade = request(origin + '/ws', {
      headers: {
        Origin: origin,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
      },
    });
    upgrade.setTimeout(5000, () => upgrade.destroy(new Error('Archive handshake timeout')));
    upgrade.once('error', reject);
    upgrade.once('response', (response) => {
      response.resume();
      reject(new Error('Archive socket rejected: ' + response.statusCode));
    });
    upgrade.once('upgrade', (response, stream, head) => {
      const expected = createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      if (response.headers['sec-websocket-accept'] !== expected) {
        stream.destroy();
        reject(new Error('Invalid WebSocket handshake'));
        return;
      }
      resolve(new Socket(stream));
      if (head.length) stream.unshift(head);
    });
    upgrade.end();
  });
  const messages: ServerMessage[] = [];
  const actor = {
    name,
    socket,
    messages,
    you: undefined as PlayerPayload | undefined,
    landed: undefined as LandedPayload | undefined,
    snap: undefined as SnapshotMessage | undefined,
    send(packet: object) {
      const payload = Buffer.from(JSON.stringify(packet));
      assert(payload.length < 126, 'Small fixture packet');
      const mask = randomBytes(4);
      const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, payload]);
      for (let index = 0; index < payload.length; index++) frame[6 + index] ^= mask[index & 3];
      socket.sock.write(frame);
    },
  };
  socket.on('message', (data: string) => {
    const packet = JSON.parse(String(data)) as ServerMessage;
    messages.push(packet);
    if (packet.t === 'you') actor.you = packet.d;
    if (packet.t === 'landed') actor.landed = packet;
    if (packet.t === 'snap') actor.snap = packet;
  });
  actor.send({ t: 'hello', name, pass });
  try {
    await until(
      () => actor.you || messages.some((packet) => packet.t === 'error'),
      'archive login',
    );
    return actor;
  } catch (error) {
    socket.sock.destroy();
    throw error;
  }
}

try {
  fileSystem.mkdirSync(checkout);
  // Keep this fixture small: real game modules/catalogs and HTTP entry assets,
  // without the unrelated binary artwork/audio library.
  for (const directory of ['server', 'shared', 'client']) {
    for (const filename of fileSystem.readdirSync(path.join(root, directory), {
      recursive: true,
      encoding: 'utf8',
    })) {
      if (!/\.(?:js|ts)$/.test(filename)) continue;
      copy(path.join(directory, filename));
    }
  }
  for (const relative of [
    '.gitignore',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.core.json',
    'tsconfig.build.json',
    'shared/assets.json',
    'shared/landscape-worlds.json',
    'shared/portrait-catalog.json',
    'server/seeds.json',
    'client/index.html',
    'client/style.css',
    'tools/build.ts',
    'tools/build-nakama.ts',
    'tools/nakama-build-provenance.ts',
    'tools/typescript-scope.ts',
    'tools/start.ts',
    'tools/runtime/node27.json',
    'tools/package_archive.py',
  ])
    copy(relative);
  for (const launcher of [
    'tools/start-friends.ts',
    'Start Friend Game.bat',
    'start-friends.command',
  ]) {
    if (fileSystem.existsSync(path.join(root, launcher))) copy(launcher);
  }
  command('git', ['init', '--quiet']);
  command('git', ['add', '.']);
  command('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '-m',
    'test: add package fixture',
  ]);
  command(python, ['tools/package_archive.py', '--output', output], checkout, 1);
  assert.equal(
    fileSystem.existsSync(output),
    false,
    'Build failure must not emit a release archive',
  );

  fileSystem.symlinkSync(
    fileSystem.realpathSync(path.join(root, 'node_modules')),
    path.join(checkout, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  fileSystem.writeFileSync(
    path.join(checkout, 'server/untracked-private.js'),
    'export const secret = 1;',
  );
  command(python, ['tools/package_archive.py', '--output', output], checkout, 1);
  assert.ok(
    !fileSystem.existsSync(output) || fileSystem.readdirSync(output).length === 0,
    'Untracked source output must not enter an archive',
  );
  fileSystem.rmSync(path.join(checkout, 'server/untracked-private.js'));
  fileSystem.mkdirSync(path.join(checkout, 'dist'), { recursive: true });
  fileSystem.writeFileSync(path.join(checkout, 'dist/stale-secret.js'), 'must not ship');
  fileSystem.mkdirSync(path.join(checkout, '.artifacts'), { recursive: true });
  fileSystem.writeFileSync(path.join(checkout, '.artifacts/private.txt'), 'must not ship');
  // Reject accidentally tracked private saves, and exclude untracked runtime saves.
  fileSystem.mkdirSync(path.join(checkout, 'friend-data'), { recursive: true });
  fileSystem.writeFileSync(path.join(checkout, 'friend-data/players.json'), '{"synthetic":true}');
  command('git', ['add', '-f', 'friend-data/players.json']);
  command('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '-m',
    'test: tracked private save rejection',
  ]);
  command(python, ['tools/package_archive.py', '--output', output], checkout, 1);
  assert.match(
    fileSystem.readFileSync(path.join(evidence, 'commands.log'), 'utf8'),
    /Private\/runtime file tracked: friend-data\/players.json/,
  );
  command('git', ['rm', '--cached', 'friend-data/players.json']);
  command('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '-m',
    'test: exclude private save',
  ]);
  command(python, ['tools/package_archive.py', '--output', output]);
  const manifest: {
    version: string;
    files: { path: string }[];
    archives: { name: string }[];
    root: string;
  } = JSON.parse(fileSystem.readFileSync(path.join(output, 'package-manifest.json'), 'utf8'));
  for (const launcher of [
    'tools/start-friends.ts',
    'Start Friend Game.bat',
    'start-friends.command',
  ]) {
    if (fileSystem.existsSync(path.join(checkout, launcher))) {
      assert(
        manifest.files.some(({ path: filename }) => filename === launcher),
        'Shipped friend launcher',
      );
    }
  }
  const publicVersion = JSON.parse(
    fileSystem.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).publicVersion;
  assert.equal(
    manifest.version,
    publicVersion,
    'archive manifest uses the public beta release label',
  );
  assert.equal(manifest.root, 'Quantum Rift v' + publicVersion);
  assert.equal(manifest.archives[0].name, 'Quantum Rift v' + publicVersion + '.zip');
  assert.ok(manifest.files.some(({ path: filename }) => filename === 'dist/server/main.js'));
  assert.ok(manifest.files.some(({ path: filename }) => filename === 'dist/client/html.js'));
  assert.ok(manifest.files.some(({ path: filename }) => filename === 'dist/server/seeds.json'));
  for (const required of [
    'dist/nakama/quantum-rift.js',
    'dist/nakama/quantum-rift.provenance.json',
    'dist/client/connection.js',
    'dist/shared/assets.json',
    'dist/shared/landscape-worlds.json',
    'dist/shared/portrait-catalog.json',
  ])
    assert(manifest.files.some(({ path: filename }) => filename === required));
  assert.equal(
    manifest.files.some(({ path: filename }) =>
      /stale-secret|private|node_modules|friend-data/.test(filename),
    ),
    false,
  );
  command(python, [
    '-c',
    'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
    path.join(output, manifest.archives[0].name),
    extracted,
  ]);
  const installed = path.join(extracted, manifest.root);
  assert.equal(fileSystem.existsSync(path.join(installed, 'node_modules')), false);
  const port = await availablePort();
  const data = path.join(scratch, 'save');
  const serverLog = fileSystem.createWriteStream(path.join(evidence, 'server.log'));
  const server = spawn(process.execPath, ['tools/start.ts'], {
    cwd: installed,
    env: { ...environment, PORT: String(port), SOLO: '1', DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });
  try {
    const origin = `http://127.0.0.1:${port}`;
    await ready(server, origin);
    const status = await (await fetch(origin + '/api/status')).json();
    assert.equal(status.solo, true);
    assert.equal((await fetch(origin + '/')).status, 200);
    const module = await fetch(origin + '/html.js');
    assert.equal(module.status, 200);
    assert.match(await module.text(), /export function escapeHtml/);
    assert.equal((await fetch(origin + '/shared/assets.json')).status, 200);
  } finally {
    await cleanup(server, null, serverLog, data);
  }
  const friendData = path.join(scratch, 'friend-save');
  const names = ['Archive Host', 'Archive Friend'];
  let expected: { name: string; credits: number; cargo: PlayerPayload['cargo']; sys: string }[] =
    [];
  let worldBefore: unknown;
  for (let launch = 0; launch < 2; launch++) {
    const friendPort = await availablePort();
    const origin = 'http://127.0.0.1:' + friendPort;
    const log = fileSystem.createWriteStream(path.join(evidence, 'friends-' + launch + '.log'));
    const host = spawn(process.execPath, ['tools/start.ts'], {
      cwd: installed,
      env: {
        ...environment,
        HOST_FRIENDS: '1',
        HOST_BIND: '127.0.0.1',
        SOLO: '',
        SEEDS_FILE: '',
        INVASION_NOW: '',
        DATA_DIR: '',
        FRIEND_DATA_DIR: friendData,
        PORT: String(friendPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    host.stdout.pipe(log, { end: false });
    host.stderr.pipe(log, { end: false });
    const actors: Awaited<ReturnType<typeof captain>>[] = [];
    try {
      await ready(host, origin);
      const status = await (await fetch(origin + '/api/status')).json();
      assert.equal(status.solo, false);
      assert.equal(status.mode, 'friends');
      assert.equal(status.localTransport, true);
      for (const name of names) {
        const actor = await captain(origin, name);
        actors.push(actor);
        assert.equal(actor.you?.name, name, 'Password-authenticated captain');
      }
      const wrong = await captain(origin, names[0], 'wrong-synthetic-password');
      actors.push(wrong);
      assert.equal(wrong.you, undefined);
      assert.match(JSON.stringify(wrong.messages), /wrong password/i);
      wrong.socket.sock.destroy();
      const clients = actors.slice(0, 2);
      if (launch === 0) {
        for (const actor of clients) {
          await until(() => actor.landed?.market?.length, 'archive starting market');
          const commodity = actor.landed!.market![0];
          const before = actor.you!.credits;
          actor.send({ t: 'trade', cid: commodity.id, qty: 1 });
          await until(() => actor.you!.credits < before, 'archive ordinary credit expenditure');
          assert.equal(actor.you!.cargo[commodity.id], 1);
        }
        expected = clients.map((actor) => ({
          name: actor.name,
          credits: actor.you!.credits,
          cargo: structuredClone(actor.you!.cargo),
          sys: actor.you!.sys,
        }));
      } else {
        for (const [index, actor] of clients.entries()) {
          assert.deepEqual(
            {
              name: actor.you!.name,
              credits: actor.you!.credits,
              cargo: actor.you!.cargo,
              sys: actor.you!.sys,
            },
            expected[index],
          );
        }
        assert.deepEqual(
          JSON.parse(fileSystem.readFileSync(path.join(friendData, 'world.json'), 'utf8')),
          worldBefore,
          'Same persisted universe reloaded',
        );
      }
      for (const actor of clients) actor.send({ t: 'depart' });
      await until(
        () =>
          clients.every(
            (actor) =>
              actor.snap?.me &&
              names.every((name) => actor.snap!.ships.some((ship) => ship[11] === name)),
          ),
        'archive shared universe',
      );
      assert.equal(new Set(clients.map((actor) => actor.you!.sys)).size, 1);
      assert.equal(new Set(clients.map((actor) => actor.snap!.me![0])).size, 2);
      const before = clients.map((actor) => [actor.snap!.me![2], actor.snap!.me![3]]);
      for (const actor of clients) actor.send({ t: 'input', seq: 1, th: 1, tu: 0 });
      await until(
        () =>
          clients.every(
            (actor, index) =>
              actor.snap!.me![1] >= 1 &&
              Math.hypot(
                actor.snap!.me![2] - before[index][0],
                actor.snap!.me![3] - before[index][1],
              ) > 15,
          ),
        'archive both authoritative movement acknowledgements',
      );
      for (const actor of clients) actor.send({ t: 'input', seq: 2, th: 0, tu: 0 });
      await until(
        () => clients.every((actor) => actor.snap!.me![1] === 2),
        'archive input releases',
      );
      for (const actor of clients) {
        const welcome = actor.messages.find((packet) => packet.t === 'welcome');
        assert(welcome?.t === 'welcome');
        assert.equal(welcome.name, actor.name);
        const ownShip = actor.snap!.ships.find((ship) => ship[11] === actor.name);
        assert(ownShip, 'Own public ship');
        assert.equal(actor.snap!.me![0], ownShip[0], 'Only own private movement payload');
        assert(
          actor.messages
            .filter((packet) => packet.t === 'you')
            .every((packet) => packet.t === 'you' && packet.d.name === actor.name),
        );
        // Cargo may legitimately contain the commodity named salt; compare real secrets.
        const account = JSON.parse(
          fileSystem.readFileSync(path.join(friendData, 'players.json'), 'utf8'),
        )[actor.name.toLowerCase()];
        for (const secret of [account.salt, account.hash]) {
          assert.equal(typeof secret, 'string');
          assert(secret.length >= 32);
          assert(!JSON.stringify(actor.messages).includes(secret), 'Account secret never returned');
        }
        assert(!Object.hasOwn(actor.you!, 'salt') && !Object.hasOwn(actor.you!, 'hash'));
        assert(!JSON.stringify(actor.messages).includes('synthetic-archive-friends'));
        assert(actor.snap!.me!.slice(0, 7).every(Number.isFinite));
      }
      assert.equal(fileSystem.existsSync(path.join(installed, 'node_modules')), false);
    } finally {
      for (const actor of actors) actor.socket.sock.destroy();
      // Preserve the save directory across this owned process restart.
      await cleanup(host, null, log, path.join(scratch, 'friend-cleanup-unused'));
    }
    const players = JSON.parse(
      fileSystem.readFileSync(path.join(friendData, 'players.json'), 'utf8'),
    );
    for (const saved of expected) {
      assert.equal(players[saved.name.toLowerCase()].credits, saved.credits);
      assert.deepEqual(players[saved.name.toLowerCase()].cargo, saved.cargo);
    }
    worldBefore = JSON.parse(fileSystem.readFileSync(path.join(friendData, 'world.json'), 'utf8'));
  }
  fileSystem.writeFileSync(
    path.join(evidence, 'friends-result.json'),
    JSON.stringify(
      {
        passed: true,
        captains: expected,
        extractedArchive: true,
        restarts: 1,
        checks: [
          'password authentication and denial',
          'shared universe',
          'private payloads',
          'departure',
          'authoritative movement and input release',
          'credits/cargo persistence',
          'persisted universe reload',
          'no node_modules',
        ],
      },
      null,
      2,
    ),
  );
  // The extracted artifact, not the source checkout bundle, owns this native game.
  const native = new NakamaService(path.join(installed, 'dist/nakama/quantum-rift.js'));
  try {
    await native.initialize();
    const onlinePort = await availablePort();
    const onlineLog = fileSystem.createWriteStream(path.join(evidence, 'online-server.log'));
    const online = spawn(process.execPath, ['tools/start.ts'], {
      cwd: installed,
      env: {
        ...environment,
        SOLO: '',
        PORT: String(onlinePort),
        NAKAMA_HOST: '127.0.0.1',
        NAKAMA_PORT: String(native.apiPort),
        NAKAMA_SERVER_KEY: native.client.serverkey,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    online.stdout.pipe(onlineLog, { end: false });
    online.stderr.pipe(onlineLog, { end: false });
    const onlineData = path.join(scratch, 'online-empty');
    fileSystem.mkdirSync(onlineData);
    try {
      const origin = 'http://127.0.0.1:' + onlinePort;
      await ready(online, origin);
      const status = await (await fetch(origin + '/api/status')).json();
      assert.equal(status.solo, false);
      assert.equal(Number(status.nakama.port), native.apiPort);
      assert.equal(status.localAuthority, undefined);
      assert.equal((await fetch(origin + '/connection.js')).status, 200);
      const session = await native.client.authenticateCustom('qr:archivepilot', true, undefined, {
        pass: 'synthetic-archive-pass',
      });
      const rpc = await native.client.rpc(session, 'qr_world', {});
      const payload: unknown =
        typeof rpc.payload === 'string' ? JSON.parse(rpc.payload) : rpc.payload;
      assert(
        payload &&
          typeof payload === 'object' &&
          'matchId' in payload &&
          typeof payload.matchId === 'string',
      );
      const actor = await native.connect(session);
      await actor.socket.joinMatch(payload.matchId);
      await until(() => actor.latest('you'), 'extracted native captain');
      assert.equal(actor.latest('you')!.d.name, 'archivepilot');
      await actor.socket.sendMatchState(payload.matchId, 1, JSON.stringify({ t: 'depart' }));
      await until(() => actor.latest('snap')?.me, 'extracted native departure');
      const before = actor.latest('snap')!.me;
      await actor.socket.sendMatchState(
        payload.matchId,
        1,
        JSON.stringify({ t: 'input', seq: 1, th: 1, tu: 1, ab: 0, rv: 0, f1: 0, f2: 0 }),
      );
      await until(() => {
        const me = actor.latest('snap')?.me;
        return me && me[1] >= 1 && Math.hypot(me[2] - before[2], me[3] - before[3]) > 1;
      }, 'extracted native authoritative movement');
      assert(actor.latest('snap')!.me.slice(0, 7).every(Number.isFinite));
      await actor.socket.sendMatchState(
        payload.matchId,
        1,
        JSON.stringify({ t: 'input', seq: 2, th: 0, tu: 0, ab: 0, rv: 0, f1: 0, f2: 0 }),
      );
      await until(() => actor.latest('snap')?.me?.[1] === 2, 'extracted native input release');
      assert.equal(fileSystem.existsSync(path.join(installed, 'node_modules')), false);
    } finally {
      await cleanup(online, null, onlineLog, onlineData);
    }
  } finally {
    await native.cleanup();
  }
} catch (error) {
  fileSystem.writeFileSync(
    path.join(evidence, 'failure.txt'),
    String((error as Error).stack || error),
  );
  throw error;
} finally {
  fileSystem.rmSync(scratch, { recursive: true, force: true });
}
console.log(
  'Release packaging excludes private/stale output; extracted Solo, friends restart and actual native online flight run without bundled npm dependencies. Evidence: ' +
    evidence,
);
