// Run directly on each native OS against the same complete built archive, with no npm install.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

const archive = process.env.RIFT_RELEASE_ARCHIVE;
const manifest = process.env.RIFT_RELEASE_MANIFEST;
const evidence = path.resolve(
  process.env.RIFT_TEST_ARTIFACTS || '.artifacts/regression',
  'release-archive',
);
fileSystem.mkdirSync(evidence, { recursive: true });
const scratchBase = path.resolve(process.env.TMPDIR || '.artifacts/temp');
fileSystem.mkdirSync(scratchBase, { recursive: true });
const scratch = fileSystem.mkdtempSync(path.join(scratchBase, 'rift-release-'));
const python = process.platform === 'win32' ? 'python' : 'python3';
function command(args: string[]) {
  const result = spawnSync(python, args, { encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
async function until(predicate: () => unknown, description: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error('Timed out: ' + description);
}
try {
  assert(
    archive && manifest,
    'Set RIFT_RELEASE_ARCHIVE and RIFT_RELEASE_MANIFEST to the CI artifact',
  );
  {
    const verified = JSON.parse(
      command([
        'tools/verify_archive.py',
        '--archive',
        archive,
        '--manifest',
        manifest,
        '--destination',
        path.join(scratch, 'extracted'),
      ]),
    );
    if (process.env.GITHUB_SHA) assert.equal(verified.head, process.env.GITHUB_SHA);
    const installed = verified.installed as string;
    assert.equal(fileSystem.existsSync(path.join(installed, 'node_modules')), false);
    const save = path.join(scratch, 'captain.rift.json');
    command([
      path.join(installed, 'test/Save Generator/save_generator.py'),
      '--output',
      save,
      '--name',
      'Release Pilot',
      '--credits',
      '456789',
      '--location',
      'qstation',
    ]);
    const initial = JSON.parse(fileSystem.readFileSync(save, 'utf8'));
    let expectedCredits = initial.save.credits;
    const data = path.join(scratch, 'data');
    for (let restart = 0; restart < 2; restart++) {
      const portProbe = createServer();
      portProbe.listen(0, '127.0.0.1');
      await once(portProbe, 'listening');
      const address = portProbe.address();
      assert(address && typeof address !== 'string');
      const port = address.port;
      await new Promise<void>((resolve, reject) =>
        portProbe.close((error) => (error ? reject(error) : resolve())),
      );
      const origin = 'http://127.0.0.1:' + port;
      const server = spawn(process.execPath, ['tools/start.ts'], {
        cwd: installed,
        env: {
          ...process.env,
          SOLO: '1',
          HOST_FRIENDS: '',
          PORT: String(port),
          DATA_DIR: data,
          SEEDS_FILE: path.join(scratch, 'no-seeds.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const log = fileSystem.createWriteStream(path.join(evidence, 'server-' + restart + '.log'));
      server.stdout.pipe(log, { end: false });
      server.stderr.pipe(log, { end: false });
      let socket: WebSocket | undefined;
      try {
        await until(async () => {
          assert.equal(server.exitCode, null, 'Archive server unexpectedly exited');
          try {
            return (await fetch(origin + '/api/status', { signal: AbortSignal.timeout(1000) })).ok;
          } catch {
            return false;
          }
        }, 'archive startup');
        if (restart === 0) {
          const imported = await fetch(origin + '/api/import', {
            method: 'POST',
            body: JSON.stringify(initial),
          });
          assert.equal(imported.status, 200);
        }
        assert.match(await (await fetch(origin)).text(), /Quantum Rift/);
        assert.match((await fetch(origin + '/main.js')).headers.get('content-type')!, /javascript/);
        const packets: {
          t: string;
          d?: { credits: number; name: string };
          market?: { id: string; buy: number }[];
        }[] = [];
        socket = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
        socket.addEventListener('message', (event) => packets.push(JSON.parse(String(event.data))));
        await once(socket, 'open');
        socket.send(JSON.stringify({ t: 'hello', name: 'Release Pilot', pass: '' }));
        await until(() => packets.some((packet) => packet.t === 'you'), 'archive login');
        const current = packets.find((packet) => packet.t === 'you')!.d!;
        assert.equal(current.name, 'Release Pilot');
        assert.equal(
          current.credits,
          expectedCredits,
          'Restart preserves actual purchased credits',
        );
        if (restart === 0) {
          await until(
            () => packets.some((packet) => packet.t === 'landed' && packet.market?.length),
            'archive market',
          );
          const commodity = packets.find(
            (packet) => packet.t === 'landed' && packet.market?.length,
          )!.market![0];
          socket.send(JSON.stringify({ t: 'trade', cid: commodity.id, qty: 1 }));
          await until(
            () =>
              packets.some((packet) => packet.t === 'you' && packet.d!.credits < current.credits),
            'archive purchase',
          );
          expectedCredits = packets.filter((packet) => packet.t === 'you').at(-1)!.d!.credits;
        }
        const exported = await (await fetch(origin + '/api/export?name=Release%20Pilot')).json();
        assert.equal(exported.save.credits, expectedCredits);
      } finally {
        socket?.close();
        server.kill('SIGTERM');
        await Promise.race([
          once(server, 'exit'),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        if (server.exitCode === null && server.signalCode === null) {
          server.kill('SIGKILL');
          await once(server, 'exit');
        }
        log.end();
      }
    }
    fileSystem.writeFileSync(
      path.join(evidence, 'results.json'),
      JSON.stringify(
        {
          ...verified,
          platform: process.platform,
          architecture: process.arch,
          node: process.version,
          startupLoginPurchaseSaveRestart: true,
          noPlayerDevelopmentDependencies: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS hashed complete release archive: startup, login, purchase, export and restart on ' +
        process.platform,
    );
  }
} finally {
  fileSystem.rmSync(scratch, { recursive: true, force: true });
}
