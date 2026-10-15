import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindOperations } from '../server/feature-service.js';
import { createMessageRegistry } from '../server/message-registry.js';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';

// Characterization from the untouched baseline: catches ordering, stacking,
// schema, payload, and session-normalization changes without running both against
// one mutable state. capture-features runs in its own process with fixed time/RNG.
const actual = JSON.parse(
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL('./capture-features.js', import.meta.url))],
    {
      encoding: 'utf8',
      env: { ...process.env, REFERENCE_ROOT: '' },
    },
  ),
);
const expected = JSON.parse(
  fs.readFileSync(new URL('./fixtures/features-v26.json', import.meta.url)),
);
assert.deepEqual(actual, expected);
console.log('Baseline initialization, login, save, bonus/stats, world and name lookup parity.');

assert.throws(() => bindOperations({ bad: 3 }, {}), /must be a function/);
const only = {
  read() {
    return Object.keys(this).sort();
  },
};
assert.deepEqual(bindOperations(only, { toast() {}, spaces: {} }).read(), ['spaces', 'toast']);
assert.throws(
  () =>
    createMessageRegistry([
      ['trade', () => {}],
      ['trade', () => {}],
    ]),
  /Duplicate message route/,
);
const called = [];
const registry = createMessageRegistry([
  ['trade', () => called.push('market')],
  ['trade2', () => called.push('captain')],
]);
registry.dispatch('trade', {}, {});
registry.dispatch('trade2', {}, {});
for (const value of ['constructor', '__proto__', 'toString', 'unknown', {}, null])
  registry.dispatch(value, {}, {});
assert.deepEqual(called, ['market', 'captain']);
console.log('Capability isolation, invalid operation and duplicate/unknown message route checks.');

const manifest = JSON.parse(
  fs.readFileSync(new URL('../docs/feature-inventory.json', import.meta.url)),
);
const composition = fs.readFileSync(new URL('../server/features.js', import.meta.url), 'utf8');
assert.equal(new Set(manifest.features.map((f) => f.file)).size, 15);
for (const feature of manifest.features) {
  const module = await import(`../server/${feature.file}.js`);
  const operations = module[feature.exportName];
  assert.deepEqual(
    Object.keys(operations).sort(),
    [...feature.methods].sort(),
    feature.file + ' operations inventory',
  );
  const source = fs.readFileSync(new URL(`../server/${feature.file}.js`, import.meta.url), 'utf8');
  const referenced = [
    ...new Set([...source.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])),
  ].sort();
  assert.deepEqual(referenced, feature.uses, feature.file + ' declared dependencies');
  const facade = composition.split(`const ${feature.file}Capabilities = {`)[1].split('\n  };')[0];
  const provided = [
    ...new Set([...facade.matchAll(/(?:get )?(\w+)(?:\(\)|: core\.\w+\.bind)/g)].map((m) => m[1])),
  ].filter((k) => !['bind'].includes(k));
  for (const key of referenced)
    assert.ok(provided.includes(key), `${feature.file}: missing explicit capability ${key}`);
  for (const method of feature.methods)
    assert.equal(
      Object.hasOwn(Game.prototype, method),
      false,
      method + ' must not be installed on Game',
    );
}
console.log('All 15 feature exports and explicit dependencies match the checked-in inventory.');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-feature-security-'));
const interval = globalThis.setInterval;
process.env.SEEDS_FILE = '/nonexistent';
let game;
try {
  globalThis.setInterval = () => ({ unref() {} });
  game = new Game(
    JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
    new DB(dir),
  );
} finally {
  globalThis.setInterval = interval;
}
try {
  const routes = game.messageHandlers;
  const dispatched = [];
  game.messageHandlers = { dispatch: (...args) => dispatched.push(args) };
  const session = { data: null, msgs: 0, msgT: Date.now(), actT: 123 };
  game.onMessage(session, { t: 'order', o: 'hold' });
  assert.equal(dispatched.length, 0, 'unauthenticated action must not dispatch');
  session.data = {};
  game.onMessage(session, { t: 'ping' });
  assert.equal(session.actT, 123, 'ping must not mark player active');
  game.onMessage(session, { t: 'order', o: 'hold' });
  assert.ok(session.actT > 123);
  session.msgs = 120;
  game.onMessage(session, { t: 'order', o: 'attack' });
  assert.equal(dispatched.length, 2, 'flooded action must not dispatch');
  assert.ok(routes.types.includes('trade') && routes.types.includes('trade2'));
  assert.equal(new Set(routes.types).size, routes.types.length);
  assert.equal(Object.keys(game.features).length, 19);
  const cargo = { food: 10 };
  const notices = [];
  game.toast = (_s, message) => notices.push(message);
  // Services capture explicit core function capabilities at construction. Use a
  // standalone typed pilot facade to check the unauthorized action's mutation.
  const { FleetCmdOperations } = await import('../server/fleetcmd.js');
  const fleet = bindOperations(FleetCmdOperations, {
    toast: (_s, m) => notices.push(m),
    send() {},
    you() {},
    stats() {
      return { cargo: 20 };
    },
    spaces: {},
  });
  fleet.jettison({ data: { cargo, sys: 'meridian' }, ent: null }, 'food', 5);
  assert.deepEqual(cargo, { food: 10 });
  assert.match(notices[0], /only jettison cargo in space/);
  console.log('Authentication, flood, activity, explicit route and docked-action gates preserved.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
