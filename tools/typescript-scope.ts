import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

export function checkApplicationTypeScript(rootDirectory: string) {
  const configPath = path.join(rootDirectory, 'tsconfig.json');
  const result = spawnSync(process.execPath, [compiler, '--showConfig', '-p', configPath], {
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  const config = JSON.parse(result.stdout) as {
    compilerOptions: Record<string, boolean | undefined>;
    files: string[];
  };
  if (
    !config.compilerOptions.strict ||
    config.compilerOptions.allowJs ||
    config.compilerOptions.noCheck
  )
    throw new Error(
      'Application source requires strict TypeScript checking without allowJs/noCheck.',
    );
  for (const option of [
    'noImplicitAny',
    'noImplicitThis',
    'strictNullChecks',
    'strictFunctionTypes',
    'strictBindCallApply',
    'strictPropertyInitialization',
    'useUnknownInCatchVariables',
    'strictBuiltinIteratorReturn',
  ])
    if (config.compilerOptions[option] === false)
      throw new Error(`Application source must not disable strict option ${option}.`);
  const checked = new Set(config.files.map((filename) => path.resolve(rootDirectory, filename)));
  let count = 0;
  for (const directory of ['server', 'shared', 'client']) {
    for (const filename of fileSystem.readdirSync(path.join(rootDirectory, directory), {
      recursive: true,
      encoding: 'utf8',
    })) {
      const source = path.join(rootDirectory, directory, filename);
      if (!fileSystem.statSync(source).isFile()) continue;
      if (/\.(?:js|mjs|cjs|jsx)$/.test(filename))
        throw new Error(`Unchecked application JavaScript: ${directory}/${filename}`);
      if (!/\.tsx?$/.test(filename) || filename.endsWith('.d.ts')) continue;
      if (!checked.has(path.resolve(source)))
        throw new Error(`Application source omitted from typecheck: ${directory}/${filename}`);
      if (
        /^\s*(?:\/\/|\/\*+|\*)\s*@ts-(?:nocheck|ignore)\b/m.test(
          fileSystem.readFileSync(source, 'utf8'),
        )
      )
        throw new Error(`Type-check suppression in application source: ${directory}/${filename}`);
      count++;
    }
  }
  if (!count) throw new Error('No checked application TypeScript found.');
  return count;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
  console.log(
    `Strict TypeScript source coverage: ${checkApplicationTypeScript(rootDirectory)} modules.`,
  );
}
