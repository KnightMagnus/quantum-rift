import { BLOCKED_IDENTITY_HOOKS } from '../shared/nakama-contracts.ts';
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build a self-contained, flat module with globally discoverable named Nakama callbacks. */
export async function buildNakamaRuntime(
  root = fileURLToPath(new URL('../', import.meta.url)),
): Promise<string> {
  const output = path.join(root, 'dist/nakama');
  fileSystem.mkdirSync(output, { recursive: true });
  const bundled = await build({
    absWorkingDir: root,
    entryPoints: ['server/nakama-world.ts'],
    write: false,
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    target: 'esnext',
    metafile: true,
    banner: { js: 'var module = { exports: {} };' },
  });
  const code = bundled.outputFiles[0]?.text;
  if (!code) throw new Error('Nakama bundle is empty');
  // ES5 syntax is the official runtime contract. Existing game rules remain shared source.
  const transformed = await transformAsync(code, {
    filename: 'quantum-rift.js',
    configFile: false,
    babelrc: false,
    presets: [[presetEnv, { targets: { ie: '11' }, modules: false }]],
    comments: true,
    compact: false,
  });
  if (!transformed?.code) throw new Error('Nakama ES5 transform is empty');
  const target = path.join(output, 'quantum-rift.js');
  const bridges: Record<string, string> = {
    qrDenyIdentity: 'denyUnsupportedIdentity',
    qrBeforeAuthentication: 'beforeCaptainAuthentication',
    qrWorldRpc: 'worldRpc',
    qrInitialize: 'initializeWorld',
    qrJoinAttempt: 'attemptWorldJoin',
    qrJoin: 'joinWorld',
    qrLeave: 'leaveWorld',
    qrAdvance: 'advanceWorld',
    qrTerminate: 'terminateWorld',
    qrSignal: 'signalWorld',
  };
  const declarations = Object.entries(bridges)
    .map(
      ([name, exported]) =>
        'function ' +
        name +
        '() { return QuantumRiftRuntime.' +
        exported +
        '.apply(null, arguments); }',
    )
    .join('\n');
  // Goja discovers callback names globally in each VM; export getters are not registration points.
  const registration = [
    'function InitModule(ctx, logger, nk, initializer) {',
    ...BLOCKED_IDENTITY_HOOKS.map((hook) => 'initializer.' + hook + '(qrDenyIdentity);'),
    'initializer.registerBeforeAuthenticateCustom(qrBeforeAuthentication);',
    'initializer.registerRpc("qr_world", qrWorldRpc);',
    'initializer.registerMatch("qr_world", {matchInit:qrInitialize,matchJoinAttempt:qrJoinAttempt,matchJoin:qrJoin,matchLeave:qrLeave,matchLoop:qrAdvance,matchTerminate:qrTerminate,matchSignal:qrSignal});',
    '}',
  ].join('\n');
  fileSystem.writeFileSync(
    target,
    'var QuantumRiftRuntime = (function () {\n' +
      transformed.code +
      '\nreturn module.exports;\n})();\n' +
      declarations +
      '\n' +
      registration +
      '\n',
  );
  fileSystem.mkdirSync(path.join(root, '.artifacts'), { recursive: true });
  fileSystem.writeFileSync(
    path.join(root, '.artifacts/nakama-bundle-inputs.json'),
    JSON.stringify(bundled.metafile, null, 2),
  );
  console.log('Built the shared authoritative game as an ES5 Nakama runtime.');
  return target;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildNakamaRuntime();
