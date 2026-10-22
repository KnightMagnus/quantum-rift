import fileSystem from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkApplicationTypeScript } from './typescript-scope.ts';
import { generateTemplates } from './eta-generate.ts';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
await generateTemplates();
checkApplicationTypeScript(rootDirectory);
const output = path.join(rootDirectory, 'dist');
// Preserve earlier output for inspection instead of deleting it.
fileSystem.mkdirSync(path.join(rootDirectory, '.artifacts'), { recursive: true });
if (fileSystem.existsSync(output))
  fileSystem.renameSync(
    output,
    path.join(
      fileSystem.mkdtempSync(path.join(rootDirectory, '.artifacts', 'dist-before-')),
      'dist',
    ),
  );
for (const config of ['tsconfig.core.json', 'tsconfig.build.json']) {
  const result = spawnSync(
    process.execPath,
    [path.join(rootDirectory, 'node_modules/tsrs/bin/tsrs'), '-p', config],
    { cwd: rootDirectory, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Game resolves its default seed catalog relative to its emitted module.
fileSystem.copyFileSync(
  path.join(rootDirectory, 'server/seeds.json'),
  path.join(output, 'server/seeds.json'),
);
console.log('Compiled server, shared and browser modules into dist/.');
