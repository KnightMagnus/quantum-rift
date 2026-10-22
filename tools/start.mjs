import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(new URL('./runtime/node27.json', import.meta.url), 'utf8'),
);
const artifact = manifest.artifacts[`${process.platform}-${process.arch}`];
const localDirectory = artifact
  ? path.join(root, '.artifacts/node-runtime', artifact.file.replace(/\.(tar\.(xz|gz)|zip)$/, ''))
  : null;
const localBinary = localDirectory
  ? path.join(localDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node')
  : null;
const binary = localBinary && fs.existsSync(localBinary) ? localBinary : process.execPath;
if (binary === process.execPath && process.version !== manifest.version) {
  console.error('Install the project-local Node 27 runtime: node tools/runtime/install-node.mjs');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'dist/server/main.js'))) {
  console.error('Compile the game first: npm ci && npm run build');
  process.exit(1);
}
const child = spawn(binary, [path.join(root, 'dist/server/main.js')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code || 0;
});
