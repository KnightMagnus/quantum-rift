import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { checkApplicationTypeScript } from '../tools/typescript-scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-tooling-'));
function lint(source, typed = false) {
  const filename = path.join(directory, typed ? 'fixture.ts' : 'fixture.js');
  fs.writeFileSync(filename, source);
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
    { cwd: directory, encoding: 'utf8', timeout: 30000 },
  );
  if (result.error) throw result.error;
  return result;
}
try {
  const scope = path.join(directory, 'application');
  for (const name of ['server', 'shared', 'client']) {
    fs.mkdirSync(path.join(scope, name), { recursive: true });
    fs.writeFileSync(path.join(scope, name, 'fixture.ts'), 'export const answer: number = 42;');
  }
  const sourceConfig = {
    compilerOptions: { strict: true, noEmit: true },
    include: ['server/**/*.ts', 'shared/**/*.ts', 'client/**/*.ts'],
  };
  const writeScopeConfig = (value) =>
    fs.writeFileSync(path.join(scope, 'tsconfig.json'), JSON.stringify(value));
  writeScopeConfig(sourceConfig);
  assert.equal(checkApplicationTypeScript(scope), 3);
  const legacy = path.join(scope, 'server', 'unchecked.js');
  fs.writeFileSync(legacy, 'export const legacy = 1;');
  assert.throws(() => checkApplicationTypeScript(scope), /Unchecked application JavaScript/);
  fs.unlinkSync(legacy);
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
  fs.writeFileSync(path.join(scope, 'server', 'fixture.ts'), '// @ts-nocheck\nexport const x = 1;');
  assert.throws(() => checkApplicationTypeScript(scope), /Type-check suppression/);
  fs.writeFileSync(path.join(scope, 'server', 'fixture.ts'), 'export const answer: number = 42;');
  assert.equal(checkApplicationTypeScript(scope), 3);
  fs.writeFileSync(
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
  const parsed = parseSync('fixture.js', 'capabilities?.send(); this.toast();');
  assert.deepEqual(parsed.errors, []);
  const optional = parsed.program.body[0].expression;
  assert.equal(optional.type, 'ChainExpression');
  assert.equal(optional.expression.callee.property.name, 'send');
  assert.equal(parsed.program.body[1].expression.callee.object.type, 'ThisExpression');
  assert.ok(parseSync('invalid.js', 'const = ;').errors.length);
  console.log(
    'Oxc gates accept valid code, reject unused bindings/floating promises, and preserve dependency AST traversal.',
  );
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
