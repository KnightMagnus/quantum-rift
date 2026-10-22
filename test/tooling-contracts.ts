import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import {
  checkApplicationTypeScript,
  checkNativeTypeDocumentation,
} from '../tools/typescript-scope.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-tooling-'));
checkNativeTypeDocumentation(
  '/** Explain behavior. @param value Document the argument. @returns A result. */\n' +
    'export function example(value: string): string { return value; }\n' +
    'const quoted = "/** @typedef {object} Example */"; const css = "@import url(theme.css)";',
  'native-documentation.ts',
);
for (const declaration of [
  '@typedef {object} Example',
  '@import { Example } from "./example.ts"',
  '@type {number}',
  '@param {string} value Description to preserve.',
  '@returns {number} Description to preserve.',
  '@this {Example}',
  '@template Value',
  '@property {string} name Description to preserve.',
])
  assert.throws(
    () =>
      checkNativeTypeDocumentation(
        `/** Useful explanation.\n * ${declaration}\n */\nexport const value = 1;`,
        'legacy-documentation.ts',
      ),
    /Legacy JSDoc type declaration/,
  );
function lint(source: string | NodeJS.ArrayBufferView<ArrayBufferLike>, typed = false) {
  const filename = path.join(directory, typed ? 'fixture.ts' : 'fixture.js');
  fileSystem.writeFileSync(filename, source);
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/oxlint/bin/oxlint'),
      '-c',
      path.join(root, '.oxlintrc.json'),
      '--deny-warnings',
      ...(typed ? ['--type-aware'] : []),
      filename,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30000 },
  );
  if (result.error) throw result.error;
  return result;
}
try {
  const scope = path.join(directory, 'application');
  for (const name of ['server', 'shared', 'client']) {
    fileSystem.mkdirSync(path.join(scope, name), { recursive: true });
    fileSystem.writeFileSync(
      path.join(scope, name, 'fixture.ts'),
      'export const answer: number = 42;',
    );
  }
  const sourceConfig = {
    compilerOptions: { strict: true, noEmit: true },
    include: ['server/**/*.ts', 'shared/**/*.ts', 'client/**/*.ts'],
  };
  const writeScopeConfig = (value: {
    compilerOptions:
      | { strict: boolean; noEmit: boolean }
      | { noEmit: boolean; strict: boolean }
      | { strict: boolean; noImplicitAny: boolean; noEmit: boolean };
    include: string[];
    exclude?: string[];
  }) => fileSystem.writeFileSync(path.join(scope, 'tsconfig.json'), JSON.stringify(value));
  writeScopeConfig(sourceConfig);
  assert.equal(checkApplicationTypeScript(scope), 3);
  fileSystem.writeFileSync(path.join(scope, 'strict-base.json'), JSON.stringify(sourceConfig));
  fileSystem.writeFileSync(
    path.join(scope, 'tsconfig.json'),
    JSON.stringify({ extends: './strict-base.json' }),
  );
  assert.equal(
    checkApplicationTypeScript(scope),
    3,
    'inherited strict configuration stays checked',
  );
  fileSystem.writeFileSync(
    path.join(scope, 'tsconfig.json'),
    JSON.stringify({
      extends: './strict-base.json',
      compilerOptions: { strictNullChecks: false },
    }),
  );
  assert.throws(() => checkApplicationTypeScript(scope), /must not disable strict option/);
  writeScopeConfig(sourceConfig);
  const legacy = path.join(scope, 'server', 'unchecked.js');
  fileSystem.writeFileSync(legacy, 'export const legacy = 1;');
  assert.throws(() => checkApplicationTypeScript(scope), /Unchecked application JavaScript/);
  fileSystem.unlinkSync(legacy);
  writeScopeConfig({ ...sourceConfig, exclude: ['client'] });
  assert.throws(() => checkApplicationTypeScript(scope), /omitted from typecheck/);
  writeScopeConfig({ ...sourceConfig, compilerOptions: { noEmit: true, strict: false } });
  assert.throws(() => checkApplicationTypeScript(scope), /requires strict TypeScript/);
  writeScopeConfig({
    ...sourceConfig,
    compilerOptions: { strict: true, noImplicitAny: false, noEmit: true },
  });
  assert.throws(() => checkApplicationTypeScript(scope), /must not disable strict option/);
  writeScopeConfig(sourceConfig);
  fileSystem.writeFileSync(
    path.join(scope, 'server', 'fixture.ts'),
    '// @ts-nocheck\nexport const x = 1;',
  );
  assert.throws(() => checkApplicationTypeScript(scope), /Type-check suppression/);
  fileSystem.writeFileSync(
    path.join(scope, 'server', 'fixture.ts'),
    'export const answer: number = 42;',
  );
  assert.equal(checkApplicationTypeScript(scope), 3);
  fileSystem.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', noEmit: true },
      include: ['fixture.ts'],
    }),
  );
  assert.equal(lint('export const answer = 42;').status, 0);
  const unused = lint('const forgotten = 42;');
  assert.notEqual(unused.status, 0);
  assert.match(unused.stdout + unused.stderr, /no-unused-vars/);
  const floating = lint('Promise.resolve(42);', true);
  assert.notEqual(floating.status, 0);
  assert.match(floating.stdout + floating.stderr, /no-floating-promises/);
  assert.equal(lint('void Promise.resolve(42);', true).status, 0);
  const importProject = path.join(directory, 'native-imports');
  fileSystem.mkdirSync(importProject);
  fileSystem.writeFileSync(
    path.join(importProject, 'tsconfig.json'),
    JSON.stringify({
      extends: path.join(root, 'tsconfig.json'),
      compilerOptions: { types: [] },
      include: ['native-import.mts'],
    }),
  );
  fileSystem.writeFileSync(
    path.join(importProject, 'contract.mts'),
    'export interface Contract { value: number }',
  );
  const checkNativeImport = (importDeclaration: string) => {
    fileSystem.writeFileSync(
      path.join(importProject, 'native-import.mts'),
      importDeclaration + " from './contract.mts'; export const value: Contract = {value: 1};",
    );
    return spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/tsrs/bin/tsrs'),
        '--project',
        path.join(importProject, 'tsconfig.json'),
        '--pretty',
        'false',
      ],
      { cwd: root, encoding: 'utf8', timeout: 30000 },
    );
  };
  const invalidTypeImport = checkNativeImport('import { Contract }');
  assert.notEqual(invalidTypeImport.status, 0);
  assert.match(
    invalidTypeImport.stdout + invalidTypeImport.stderr,
    /TS1484/,
    'native type-only exports cannot be requested as runtime values',
  );
  const validTypeImport = checkNativeImport('import type { Contract }');
  assert.equal(validTypeImport.status, 0, validTypeImport.stdout + validTypeImport.stderr);
  const parsed = parseSync('fixture.js', 'capabilities?.send(); this.toast();');
  assert.deepEqual(parsed.errors, []);
  const first = parsed.program.body[0];
  assert.equal(first.type, 'ExpressionStatement');
  const optional = first.expression;
  assert.equal(optional.type, 'ChainExpression');
  assert.equal(optional.expression.type, 'CallExpression');
  assert.equal(optional.expression.callee.type, 'MemberExpression');
  assert.equal(optional.expression.callee.property.type, 'Identifier');
  assert.equal(optional.expression.callee.property.name, 'send');
  const second = parsed.program.body[1];
  assert.equal(second.type, 'ExpressionStatement');
  assert.equal(second.expression.type, 'CallExpression');
  assert.equal(second.expression.callee.type, 'MemberExpression');
  assert.equal(second.expression.callee.object.type, 'ThisExpression');
  assert.ok(parseSync('invalid.js', 'const = ;').errors.length);
  console.log(
    'Oxc gates accept valid code, reject unused bindings/floating promises, and preserve dependency AST traversal.',
  );
} finally {
  fileSystem.rmSync(directory, { recursive: true, force: true });
}
