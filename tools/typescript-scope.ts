import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const compiler = fileURLToPath(new URL('../node_modules/tsrs/bin/tsrs', import.meta.url));

export function checkApplicationTypeScript(rootDirectory: string) {
  const configPath = path.join(rootDirectory, 'tsconfig.json');
  const result = spawnSync(process.execPath, [compiler, '--listFilesOnly', '-p', configPath], {
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  // tsrs resolves the actual checked file set. Read strictness from the same
  // local JSON configuration chain because its CLI does not expose --showConfig.
  function readCompilerOptions(
    filename: string,
    ancestors = new Set<string>(),
  ): Record<string, boolean | undefined> {
    if (ancestors.has(filename)) throw new Error(`Circular TypeScript config: ${filename}`);
    const config = JSON.parse(fileSystem.readFileSync(filename, 'utf8')) as {
      extends?: string | string[];
      compilerOptions?: Record<string, boolean | undefined>;
    };
    const options: Record<string, boolean | undefined> = {};
    const parents = config.extends ? [config.extends].flat() : [];
    for (const parent of parents) {
      if (!path.isAbsolute(parent) && !parent.startsWith('.'))
        throw new Error(`Source coverage requires a local TypeScript config: ${parent}`);
      let parentPath = path.resolve(path.dirname(filename), parent);
      if (!parentPath.endsWith('.json')) parentPath += '.json';
      Object.assign(options, readCompilerOptions(parentPath, new Set([...ancestors, filename])));
    }
    return Object.assign(options, config.compilerOptions);
  }
  const config = {
    compilerOptions: readCompilerOptions(configPath),
    files: result.stdout.trim().split(/\r?\n/),
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
