// Prove checked contracts reject bad calls, not merely that tsc exits cleanly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-types-'));
const modulePath = (file) => path.join(root, 'server', file).replaceAll('\\', '/');
const common = `// @ts-check
/** @type {import('${modulePath('features.js')}').FeatureServices} */
const features = /** @type {import('${modulePath('features.js')}').FeatureServices} */ ({});
/** @type {import('${modulePath('contracts.js')}').CommandSession} */
const session = {data: {cargo: {}, cargoLots: {version: 1, byCommodity: {}}, sys: 'meridian'}, ent: null};
`;
try {
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  const config = JSON.parse(fs.readFileSync(new URL('../tsconfig.json', import.meta.url)));
  config.compilerOptions.typeRoots = [path.join(root, 'node_modules/@types')];
  config.include = [path.join(dir, 'fixture.js')];
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(config));
  const check = (body) => {
    fs.writeFileSync(path.join(dir, 'fixture.js'), common + body);
    return spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(dir, 'tsconfig.json')],
      { encoding: 'utf8' },
    );
  };
  let result = check(
    "features.fleetcmd.fleetOrder(session, 'hold');\nfeatures.fleetcmd.jettison(session, 'food', 3);\n",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check('features.fleetcmd.fleetOrder(session, 42);\n');
  assert.notEqual(result.status, 0, 'numeric fleet order must be rejected');
  assert.match(result.stdout + result.stderr, /number.*string/);
  result = check(
    `/** @type {import('${modulePath('contracts.js')}').FleetCommandsCapabilities} */\nconst incomplete = {toast() {}, send() {}, you() {}, holdUsed() { return 0; }, stats() { return {cargo: 5}; }};\n`,
  );
  assert.notEqual(result.status, 0, 'missing spaces capability must be rejected');
  assert.match(result.stdout + result.stderr, /spaces.*missing|missing.*spaces/);
  result = check("features.fleetcmd.jettison(session, 'ore', 1, {common: 0, rich: 0, pure: 1});\n");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check(
    "features.fleetcmd.jettison(session, 'ore', 1, {common: 0, rich: 0, pure: '1'});\n",
  );
  assert.notEqual(result.status, 0, 'string grade quantity must be rejected');
  assert.match(result.stdout + result.stderr, /string.*number/);
  console.log(
    'Typed valid calls/grade selections pass; invalid argument, grade quantity and missing capability are rejected.',
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
