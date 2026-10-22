import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkApplicationTypeScript } from './typescript-scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
checkApplicationTypeScript(root);
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
for (const config of ['tsconfig.core.json', 'tsconfig.build.json']) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Game resolves its default seed catalog relative to its emitted module.
fs.copyFileSync(path.join(root, 'server/seeds.json'), path.join(output, 'server/seeds.json'));
console.log('Compiled server, shared and browser modules into dist/.');
