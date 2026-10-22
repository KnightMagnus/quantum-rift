import { NakamaService, until } from './helpers/nakama-service.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { root, availablePort, ready, cleanup, evidenceDir } from './helpers/browser-fixture.ts';

const scratch = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-package-'));
const checkout = path.join(scratch, 'source');
const output = path.join(scratch, 'archives');
const extracted = path.join(scratch, 'extracted');
const evidence = evidenceDir('packaged-runtime');
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
    'tsconfig.json',
    'tsconfig.core.json',
    'tsconfig.build.json',
    'shared/assets.json',
    'server/seeds.json',
    'client/index.html',
    'client/style.css',
    'tools/build.ts',
    'tools/build-nakama.ts',
    'tools/typescript-scope.ts',
    'tools/start.ts',
    'tools/runtime/node27.json',
    'tools/package_archive.py',
  ])
    copy(relative);
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
  command(python, ['tools/package_archive.py', '--output', output]);
  const manifest: { files: { path: string }[]; archives: { name: string }[]; root: string } =
    JSON.parse(fileSystem.readFileSync(path.join(output, 'package-manifest.json'), 'utf8'));
  assert.ok(manifest.files.some(({ path: filename }) => filename === 'dist/server/main.js'));
  assert.ok(manifest.files.some(({ path: filename }) => filename === 'dist/client/html.js'));
  assert.ok(manifest.files.some(({ path: filename }) => filename === 'dist/server/seeds.json'));
  for (const required of [
    'dist/nakama/quantum-rift.js',
    'dist/client/connection.js',
    'dist/shared/assets.json',
  ])
    assert(manifest.files.some(({ path: filename }) => filename === required));
  assert.equal(
    manifest.files.some(({ path: filename }) => /stale-secret|private|node_modules/.test(filename)),
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
  'Release packaging excludes private/stale output; extracted Solo and actual native online flight run without bundled npm dependencies.',
);
