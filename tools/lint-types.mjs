import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['server', 'shared', 'client'].flatMap((directory) =>
  fs
    .readdirSync(path.join(root, directory), { recursive: true })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join(directory, file)),
);
if (!files.length) throw new Error('No TypeScript sources found for type-aware linting.');
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/oxlint/bin/oxlint'), '--type-aware', '--deny-warnings', ...files],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
