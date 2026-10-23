import fileSystem from 'node:fs';
import { build } from 'esbuild';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkApplicationTypeScript } from './typescript-scope.ts';
import { buildNakamaRuntime } from './build-nakama.ts';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
checkApplicationTypeScript(rootDirectory);
const output = path.join(rootDirectory, 'dist');
fileSystem.rmSync(output, { recursive: true, force: true });
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
// Bundle only the engine dependency graph. Stateful HUD/audio/render helpers remain
// ordinary local modules, so production and browser harnesses share one instance.
await build({
  entryPoints: [path.join(rootDirectory, 'client/engine.ts')],
  outfile: path.join(output, 'client/engine.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  plugins: [
    {
      name: 'preserve-client-helpers',
      setup(builder) {
        builder.onResolve({ filter: /(?:render|login_scene)\.ts$|\.\.\/shared\// }, (args) => ({
          path: args.path.replace(/\.ts$/, '.js'),
          external: true,
        }));
      },
    },
  ],
});
console.log('Compiled server, shared and browser modules into dist/.');

// The SDK is bundled once for the transport; engine/HUD/audio helpers retain their existing owners.
await build({
  entryPoints: [path.join(rootDirectory, 'client/connection.ts')],
  outfile: path.join(output, 'client/connection.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
await buildNakamaRuntime(rootDirectory);
