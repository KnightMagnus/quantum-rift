import { GAME_PROTOCOL } from '../shared/protocol.ts';
import type { RuntimeManifest } from './runtime/contracts.ts';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { friendHostConfig } from '../server/friend-host-config.ts';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  fileSystem.readFileSync(new URL('./runtime/node27.json', import.meta.url), 'utf8'),
) as RuntimeManifest;
const artifact = manifest.artifacts[`${process.platform}-${process.arch}`];
const localDirectory = artifact
  ? path.join(
      rootDirectory,
      '.artifacts/node-runtime',
      artifact.file.replace(/\.(tar\.(xz|gz)|zip)$/, ''),
    )
  : null;
const localBinary = localDirectory
  ? path.join(localDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node')
  : null;
const installerPath = fileURLToPath(new URL('./runtime/install-node.ts', import.meta.url));
// Launchers start with whatever Node is on PATH; fetch the pinned runtime on first run.
if (localBinary && !fileSystem.existsSync(localBinary) && process.version !== manifest.version) {
  console.log(`Installing the pinned Node runtime (${manifest.version}); this happens once.`);
  const installation = spawnSync(process.execPath, [installerPath], {
    cwd: rootDirectory,
    stdio: 'inherit',
  });
  if (installation.error || installation.status !== 0) {
    // Extraction can leave a binary behind even when the installer rejects it.
    fileSystem.rmSync(localBinary, { force: true });
    if (installation.error) console.error(installation.error.message);
    console.error('Install the project-local Node 27 runtime: node tools/runtime/install-node.ts');
    process.exit(1);
  }
}
const binary = localBinary && fileSystem.existsSync(localBinary) ? localBinary : process.execPath;
if (binary === process.execPath && process.version !== manifest.version) {
  console.error('Install the project-local Node 27 runtime: node tools/runtime/install-node.ts');
  process.exit(1);
}
if (!fileSystem.existsSync(path.join(rootDirectory, 'dist/server/main.js'))) {
  console.error('Compile the game first: npm ci && npm run build');
  process.exit(1);
}
// --friends is an explicit owner action; ordinary startup stays dedicated Nakama.
const launchFriends = process.argv.includes('--friends');
const environment = { ...process.env };
if (launchFriends) {
  environment.HOST_FRIENDS = '1';
  environment.HOST_BIND ??= '0.0.0.0';
}
const friendConfig =
  environment.HOST_FRIENDS === '1' ? friendHostConfig(environment, rootDirectory) : undefined;
const child = spawn(binary, [path.join(rootDirectory, 'dist/server/main.js')], {
  cwd: rootDirectory,
  stdio: ['inherit', launchFriends ? 'pipe' : 'inherit', 'inherit', 'ipc'],
  env: environment,
});
// Wait for this child's listening log before probing; an occupied port must not open an older world.
let childListening = false;
child.stdout?.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  if (chunk.toString().includes('(friend game) running at')) childListening = true;
});
let cancelled = false;
child.once('exit', () => {
  cancelled = true;
});
if (launchFriends && friendConfig) {
  const expectedVersion: string = JSON.parse(
    fileSystem.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'),
  ).publicVersion;
  const browserHost =
    friendConfig.bind === '0.0.0.0'
      ? '127.0.0.1'
      : friendConfig.bind === '::'
        ? '[::1]'
        : friendConfig.bind.includes(':')
          ? `[${friendConfig.bind}]`
          : friendConfig.bind;
  const browserUrl = `http://${browserHost}:${friendConfig.port}`;
  void (async () => {
    for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!childListening) continue;
      try {
        const response = await fetch(`${browserUrl}/api/status`, {
          signal: AbortSignal.timeout(1000),
        });
        const status = (await response.json()) as {
          mode?: string;
          version?: string;
          protocol?: number;
        };
        if (cancelled) return;
        if (
          !response.ok ||
          status.mode !== 'friends' ||
          status.version !== expectedVersion ||
          status.protocol !== GAME_PROTOCOL
        )
          continue;
        const command =
          process.platform === 'win32'
            ? 'cmd'
            : process.platform === 'darwin'
              ? 'open'
              : 'xdg-open';
        const args = process.platform === 'win32' ? ['/c', 'start', '', browserUrl] : [browserUrl];
        const browser = spawn(command, args, { stdio: 'ignore' });
        browser.on('error', () => console.log(`Open the game in your browser: ${browserUrl}`));
        browser.unref();
        return;
      } catch {
        /* The authority may still be starting. */
      }
    }
    if (!cancelled) console.log(`Open the game in your browser: ${browserUrl}`);
  })();
}
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(signal, () => {
    if (child.connected) child.send('shutdown');
    else child.kill(signal);
  });
if (process.platform === 'win32')
  process.on('SIGBREAK', () => {
    if (child.connected) child.send('shutdown');
    else child.kill('SIGBREAK');
  });
// Windows kill(SIGTERM) cannot run shutdown handlers. Supervisors use this private
// inherited channel instead; there is no HTTP or game-message shutdown endpoint.
process.on('message', (message) => {
  if (message === 'shutdown' && child.connected) child.send('shutdown');
});
child.on('exit', (code) => {
  process.exitCode = code || 0;
  if (process.connected) process.disconnect?.();
});
