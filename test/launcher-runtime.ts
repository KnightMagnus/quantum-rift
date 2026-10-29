import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-launcher-'));
try {
  for (const scenario of [
    'install',
    'existing',
    'pinned-path',
    'failed',
    'partial',
    'unsupported',
  ]) {
    const directory = path.join(scratch, scenario);
    const runtimeFile = 'fixture-runtime.tar.gz';
    const binary = path.join(
      directory,
      '.artifacts/node-runtime/fixture-runtime',
      process.platform === 'win32' ? 'node.exe' : 'bin/node',
    );
    fileSystem.mkdirSync(path.join(directory, 'tools/runtime'), { recursive: true });
    fileSystem.mkdirSync(path.join(directory, 'server'), { recursive: true });
    fileSystem.mkdirSync(path.join(directory, 'shared'), { recursive: true });
    fileSystem.copyFileSync(
      path.join(root, 'shared/protocol.ts'),
      path.join(directory, 'shared/protocol.ts'),
    );
    fileSystem.mkdirSync(path.join(directory, 'dist/server'), { recursive: true });
    fileSystem.copyFileSync(
      path.join(root, 'tools/start.ts'),
      path.join(directory, 'tools/start.ts'),
    );
    fileSystem.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
    fileSystem.writeFileSync(
      path.join(directory, 'server/friend-host-config.ts'),
      'export function friendHostConfig() { throw Error("not used"); }',
    );
    fileSystem.writeFileSync(
      path.join(directory, 'tools/runtime/node27.json'),
      JSON.stringify({
        version: scenario === 'pinned-path' ? process.version : 'v0.0.0-fixture',
        artifacts:
          scenario === 'unsupported'
            ? {}
            : {
                [`${process.platform}-${process.arch}`]: { file: runtimeFile },
              },
      }),
    );
    // The installer fixture isolates launcher decisions; it does not test download/extraction.
    fileSystem.writeFileSync(
      path.join(directory, 'tools/runtime/install-node.ts'),
      `
      import fs from 'node:fs';
      import path from 'node:path';
      fs.appendFileSync('installer-calls', '1');
      if (${JSON.stringify(scenario)} !== 'failed') {
        fs.mkdirSync(path.dirname(${JSON.stringify(binary)}), { recursive: true });
        fs.copyFileSync(process.execPath, ${JSON.stringify(binary)});
        fs.chmodSync(${JSON.stringify(binary)}, 0o755);
      }
      if (['failed', 'partial'].includes(${JSON.stringify(scenario)})) {
        console.error('fixture installer rejected runtime');
        process.exit(1);
      }
    `,
    );
    fileSystem.writeFileSync(
      path.join(directory, 'dist/server/main.js'),
      'console.log("fixture-server " + process.execPath); process.disconnect?.();',
    );
    if (scenario === 'existing') {
      fileSystem.mkdirSync(path.dirname(binary), { recursive: true });
      fileSystem.copyFileSync(process.execPath, binary);
      fileSystem.chmodSync(binary, 0o755);
    }
    const run = () => {
      const result = spawnSync(process.execPath, ['tools/start.ts'], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, HOST_FRIENDS: '0' },
      });
      assert.ifError(result.error);
      return result;
    };
    const result = run();
    if (['failed', 'partial', 'unsupported'].includes(scenario)) {
      assert.equal(result.status, 1, scenario);
      assert.doesNotMatch(result.stdout, /fixture-server/, scenario);
      assert.match(result.stderr, /Install the project-local Node 27 runtime/, scenario);
      if (scenario === 'partial') {
        assert.equal(
          fileSystem.existsSync(binary),
          false,
          'rejected binary cannot survive for next launch',
        );
        assert.equal(run().status, 1, 'retry must not run a rejected runtime');
      }
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.ok(
        result.stdout.includes(
          'fixture-server ' + (scenario === 'pinned-path' ? process.execPath : binary),
        ),
        scenario,
      );
    }
    const calls = path.join(directory, 'installer-calls');
    if (['existing', 'pinned-path', 'unsupported'].includes(scenario)) {
      assert.equal(fileSystem.existsSync(calls), false, scenario);
    } else {
      assert.equal(
        fileSystem.readFileSync(calls, 'utf8'),
        scenario === 'partial' ? '11' : '1',
        scenario,
      );
    }
    if (scenario === 'install') {
      assert.equal(run().status, 0);
      assert.equal(fileSystem.readFileSync(calls, 'utf8'), '1', 'second launch must not reinstall');
    }
  }
} finally {
  fileSystem.rmSync(scratch, { recursive: true, force: true });
}
console.log('Launcher installs once, reuses available runtimes, and refuses failed installs.');
