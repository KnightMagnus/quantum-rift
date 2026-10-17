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
const session = {data: {name: 'Fixture Captain', cargo: {}, cargoLots: {version: 1, byCommodity: {}}, sys: 'meridian'}, ent: null};
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
  result = check('features.mining.advanceClock(1/30);\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check("features.mining.advanceClock('1');\n");
  assert.notEqual(result.status, 0, 'mining clock requires numeric seconds');
  assert.match(result.stdout + result.stderr, /string.*number/);
  result = check(
    `/** @type {import('${modulePath('mining-contracts.js')}').MiningCapabilities} */\nconst miningWithoutDB={paused(){return false;},endTick(){},bonus(){return {};},mods(){return {mining:1,regrow:1};},specOnMine(){}};\n`,
  );
  assert.notEqual(result.status, 0, 'mining facade requires explicit database capability');
  assert.match(result.stdout + result.stderr, /db.*missing|missing.*db/);
  result = check(
    `/** @type {import('${modulePath('refinery-contracts.js')}').RefineryRequest} */\nconst request={op:'quote',recipe:'alloy',grade:'pure',n:3};\n`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check(
    `/** @type {import('${modulePath('refinery-contracts.js')}').RefineryRequest} */\nconst request={op:'quote',n:'3',fee:0};\n`,
  );
  assert.notEqual(result.status, 0, 'string tonnes/forged fee rejected by refinery contract');
  result = check(
    `/** @type {import('${modulePath('refinery-contracts.js')}').RefineryCapabilities} */\nconst missingCheckpoint={paused(){return false;}};\n`,
  );
  assert.notEqual(
    result.status,
    0,
    'refinery requires explicit checkpoint/pricing/capacity capabilities',
  );
  result =
    check(`/** @type {import('${modulePath('industrial-contracts.js')}').IndustrialRequest} */
const industrial={op:'recipe',recipe:'alloy',grade:'common'};
`);
  assert.equal(result.status, 0, 'typed industrial mode request');
  result =
    check(`/** @type {import('${modulePath('industrial-contracts.js')}').IndustrialRequest} */
const forged={op:'harvest',heat:0,n:999};
`);
  assert.notEqual(result.status, 0, 'client heat and yield authority rejected');
  result =
    check(`/** @type {import('${modulePath('industrial-contracts.js')}').IndustrialCapabilities} */
const missing={paused(){return false;}};
`);
  assert.notEqual(
    result.status,
    0,
    'industrial requires checkpoint/capacity/root mining capabilities',
  );
  console.log(
    'Typed valid calls/grade selections pass; invalid argument, grade quantity and missing capability are rejected.',
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
