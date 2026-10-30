// Prove checked contracts reject bad calls, not merely that the checker exits cleanly.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checker = 'tsrs/bin/tsrs';
const fixtureRoot = path.join(root, '.artifacts', 'type-contracts');
filesystem.mkdirSync(fixtureRoot, { recursive: true });
const directory = filesystem.mkdtempSync(path.join(fixtureRoot, 'fixture-'));
const modulePath = (file: string) =>
  './' +
  path
    .relative(directory, path.join(root, 'server', file.replace(/\.js$/, '.ts')))
    .replaceAll('\\', '/');
const common = `const features: import('${modulePath('features.ts')}').FeatureServices = ({} as import('${modulePath('features.ts')}').FeatureServices);
const session: import('${modulePath('contracts.js')}').CommandSession = ({} as import('${modulePath('contracts.js')}').CommandSession);
`;
try {
  filesystem.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  const config = JSON.parse(
    filesystem.readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'),
  );
  config.compilerOptions.allowJs = false;
  config.compilerOptions.typeRoots = [path.join(root, 'node_modules/@types')];
  config.include = [path.join(directory, 'fixture.ts')];
  filesystem.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify(config));
  const check = (body: string) => {
    filesystem.writeFileSync(path.join(directory, 'fixture.ts'), common + body);
    return spawnSync(
      process.execPath,
      [path.join(root, 'node_modules', checker), '-p', path.join(directory, 'tsconfig.json')],
      { encoding: 'utf8' },
    );
  };
  const commandType = modulePath('../shared/wire-commands.ts');
  let commandResult = check(`import type { ClientAction } from '${commandType}';
const command: ClientAction = {t:'armada',op:'contractReady',id:'plan',revision:4}; void command;`);
  assert.equal(commandResult.status, 0, commandResult.stdout + commandResult.stderr);
  for (const request of [
    "{t:'bank',op:'borrow',amt:[]}",
    "{t:'combat',op:'claim'}",
    "{t:'social',op:'prefs',credits:1}",
    "{t:'trade2',op:'offer',give:{items:{food:[]}}}",
  ]) {
    commandResult = check(`import type { ClientAction } from '${commandType}';
const command: ClientAction = ${request}; void command;`);
    assert.notEqual(
      commandResult.status,
      0,
      'shared discriminant, numeric selector and authority checks',
    );
  }
  const purchaseType = modulePath('../shared/wire-actions.ts');
  let purchaseResult = check(`import type { PortPurchaseAction } from '${purchaseType}';
const request: PortPurchaseAction = {t:'buymat',mat:'alloy',grade:'2',n:'3.9'}; void request;`);
  assert.equal(purchaseResult.status, 0, purchaseResult.stdout + purchaseResult.stderr);
  for (const request of [
    "{t:'buyship',hull:[]}",
    "{t:'buyship',hull:201,store:'true'}",
    "{t:'outfit',id:5,n:null}",
    "{t:'buymat',mat:'alloy',grade:0,n:1,price:0}",
  ]) {
    purchaseResult = check(`import type { PortPurchaseAction } from '${purchaseType}';
const request: PortPurchaseAction = ${request}; void request;`);
    assert.notEqual(purchaseResult.status, 0, 'purchase shape and authority fields are checked');
  }
  const frontsType = modulePath('features.ts');
  const frontsFixture = `declare const capabilities: import('${frontsType}').FrontsCapabilities;\n`;
  let infrastructureResult = check(
    frontsFixture +
      'capabilities.db.touch(); capabilities.sessions.values(); void capabilities.spaces.meridian;',
  );
  assert.equal(
    infrastructureResult.status,
    0,
    infrastructureResult.stdout + infrastructureResult.stderr,
  );
  for (const reference of ['db', 'sessions', 'spaces', 'readAnomalies']) {
    infrastructureResult = check(
      frontsFixture + `capabilities.${reference} = capabilities.${reference};`,
    );
    assert.notEqual(infrastructureResult.status, 0, 'features cannot replace ' + reference);
    assert.match(infrastructureResult.stdout + infrastructureResult.stderr, /read-only/);
  }
  for (const reference of ['_an', '_anW']) {
    const cacheResult = check(frontsFixture + `void capabilities.${reference};`);
    assert.notEqual(cacheResult.status, 0, 'cache internals are not capabilities');
    assert.match(cacheResult.stdout + cacheResult.stderr, /does not exist/);
  }
  const bindingPath = modulePath('feature-service.js');
  const bindingFixture = `import {bindOperations} from '${bindingPath}';
function run(this: {required: number}): number{return this.required;}
const operations = {run};
`;
  let bindingResult = check(bindingFixture + 'bindOperations(operations, {required: 1});');
  assert.equal(bindingResult.status, 0, bindingResult.stdout + bindingResult.stderr);
  bindingResult = check(bindingFixture + 'bindOperations(operations, {});');
  assert.notEqual(bindingResult.status, 0, 'binding requires the operation capability facade');
  assert.match(bindingResult.stdout + bindingResult.stderr, /required.*missing|missing.*required/);
  const incompleteSession = check(
    `const invalidSession: import('${modulePath('contracts.js')}').CommandSession = {data: {name: 'Fixture Captain', cargo: {}, sys: 'meridian'}, ent: null};`,
  );
  assert.notEqual(incompleteSession.status, 0, 'incomplete authenticated session must be rejected');
  let result = check(
    "features.fleetcmd.fleetOrder(session, 'hold');\nfeatures.fleetcmd.jettison(session, 'food', 3);\n",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check('features.fleetcmd.fleetOrder(session, 42);\n');
  assert.notEqual(result.status, 0, 'numeric fleet order must be rejected');
  assert.match(result.stdout + result.stderr, /number.*string/);
  result = check(
    `const incomplete: import('${modulePath('contracts.js')}').FleetCommandsCapabilities = {toast() {}, send() {}, you() {}, holdUsed() { return 0; }, stats() { return {cargo: 5}; }};\n`,
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
    `const miningWithoutDB: import('${modulePath('mining-contracts.js')}').MiningCapabilities ={paused(){return false;},endTick(){},bonus(){return {};},mods(){return {mining:1,regrow:1};},specOnMine(){}};\n`,
  );
  assert.notEqual(result.status, 0, 'mining facade requires explicit database capability');
  assert.match(result.stdout + result.stderr, /db.*missing|missing.*db/);
  result = check(
    `const request: import('${modulePath('refinery-contracts.js')}').RefineryRequest ={op:'quote',recipe:'alloy',grade:'pure',n:3};\n`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check(
    `const request: import('${modulePath('refinery-contracts.js')}').RefineryRequest ={op:'quote',n:'3',fee:0};\n`,
  );
  assert.notEqual(result.status, 0, 'string tonnes/forged fee rejected by refinery contract');
  result = check(
    `const missingCheckpoint: import('${modulePath('refinery-contracts.js')}').RefineryCapabilities ={paused(){return false;}};\n`,
  );
  assert.notEqual(
    result.status,
    0,
    'refinery requires explicit checkpoint/pricing/capacity capabilities',
  );
  result =
    check(`const industrial: import('${modulePath('industrial-contracts.js')}').IndustrialRequest ={op:'recipe',recipe:'alloy',grade:'common'};
`);
  assert.equal(result.status, 0, 'typed industrial mode request');
  result =
    check(`import type { IndustrialAction } from '${modulePath('../shared/wire-actions.ts')}';
const request: IndustrialAction = {t:'industrial',op:'recipe',recipe:'alloy',grade:'pure'}; void request;`);
  assert.equal(result.status, 0, 'shared industrial request');
  for (const request of [
    "{t:'industrial',op:'claim'}",
    "{t:'industrial',op:'recipe',recipe:[]}",
    "{t:'industrial',op:'recipe',grade:3}",
    "{t:'industrial',op:'harvest',heat:0}",
  ]) {
    result =
      check(`import type { IndustrialAction } from '${modulePath('../shared/wire-actions.ts')}';
const request: IndustrialAction = ${request}; void request;`);
    assert.notEqual(result.status, 0, 'invalid industrial operation, selector or authority');
  }
  result =
    check(`const forged: import('${modulePath('industrial-contracts.js')}').IndustrialRequest ={op:'harvest',heat:0,n:999};
`);
  assert.notEqual(result.status, 0, 'client heat and yield authority rejected');
  result =
    check(`const missing: import('${modulePath('industrial-contracts.js')}').IndustrialCapabilities ={paused(){return false;}};
`);
  assert.notEqual(
    result.status,
    0,
    'industrial requires checkpoint/capacity/root mining capabilities',
  );
  result = check(
    `const tow: import('${modulePath('towing-contracts.js')}').TowRequest ={op:'attach',id:1,revision:2};`,
  );
  assert.equal(result.status, 0, 'typed tow request');
  result = check(
    `const forged: import('${modulePath('towing-contracts.js')}').TowRequest ={op:'deliver',id:1,revision:2,lots:{pure:999},owner:'other'};`,
  );
  assert.notEqual(result.status, 0, 'tow lots/owner authority rejected');
  result = check(
    `const missing: import('${modulePath('towing-contracts.js')}').TowCapabilities ={paused(){return false;}};`,
  );
  assert.notEqual(
    result.status,
    0,
    'tow requires explicit checkpoint/session/capacity capabilities',
  );
  result =
    check(`import { createGameMessageHandlers } from '${modulePath('game-message-handlers.js')}';
const routing: import('${modulePath('game-message-handlers.js')}').MessageCapabilities = ({} as import('${modulePath('game-message-handlers.js')}').MessageCapabilities);
createGameMessageHandlers(routing);
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result =
    check(`import { createGameMessageHandlers } from '${modulePath('game-message-handlers.js')}';
createGameMessageHandlers({send() {}});
`);
  assert.notEqual(result.status, 0, 'routing requires all explicit capabilities');
  assert.match(result.stdout + result.stderr, /missing/);
  result =
    check(`const routing: import('${modulePath('game-message-handlers.js')}').MessageCapabilities = ({} as import('${modulePath('game-message-handlers.js')}').MessageCapabilities);
routing.trade = 42;
`);
  assert.notEqual(result.status, 0, 'routing trade capability must be callable');
  assert.match(result.stdout + result.stderr, /number/);
  result = check(`import { createJobService } from '${modulePath('jobs.js')}';
const jobs: import('${modulePath('jobs.js')}').JobCapabilities = ({} as import('${modulePath('jobs.js')}').JobCapabilities);
createJobService(jobs);
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check(`import { createJobService } from '${modulePath('jobs.js')}';
createJobService({toast() {}});
`);
  assert.notEqual(result.status, 0, 'job service requires explicit core capabilities');
  assert.match(result.stdout + result.stderr, /missing/);
  result = check(`import { createPortService } from '${modulePath('port-services.js')}';
const port: import('${modulePath('port-services.js')}').PortCapabilities = ({} as import('${modulePath('port-services.js')}').PortCapabilities);
const captain: import('${modulePath('game.js')}').Session = ({} as import('${modulePath('game.js')}').Session);
createPortService(port).buyMat(captain, 'alloy', 2, 1);
`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check(`import { createPortService } from '${modulePath('port-services.js')}';
createPortService({toast() {}});
`);
  assert.notEqual(result.status, 0, 'port operations require explicit core capabilities');
  assert.match(result.stdout + result.stderr, /missing/);
  result = check(`import type { EconomicAction } from '${modulePath('../shared/wire-actions.ts')}';
const request: EconomicAction = {t: 'trade', cid: 'food', qty: '3'}; void request;`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  result = check(`import type { EconomicAction } from '${modulePath('../shared/wire-actions.ts')}';
const request: EconomicAction = {t: 'trade', cid: 'food', qty: {count: 3}}; void request;`);
  assert.notEqual(result.status, 0, 'trade quantity must be scalar');
  result = check(`import type { EconomicAction } from '${modulePath('../shared/wire-actions.ts')}';
const request: EconomicAction = {t: 'towing', op: 'quote', id: 1, revision: 1}; void request;`);
  assert.notEqual(result.status, 0, 'towing discriminator rejects refinery operations');
  result = check(`import type { EconomicAction } from '${modulePath('../shared/wire-actions.ts')}';
const request: EconomicAction = {t: 'refinery', op: 'accept', id: 'order'}; void request;`);
  assert.notEqual(result.status, 0, 'refinery discriminator rejects mining-order operations');

  console.log(
    'Typed valid calls/grade selections pass; invalid argument, grade quantity and missing capability are rejected.',
  );
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
