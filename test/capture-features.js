// Deterministic characterization helper. REFERENCE_ROOT is only for regenerating
// a fixture from the documented original checkout, never needed to run tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
const root = process.env.REFERENCE_ROOT || new URL('../', import.meta.url).pathname;
const load = file => import(pathToFileURL(path.join(root, file)).href);
process.env.SEEDS_FILE = '/nonexistent';
delete process.env.INVASION_NOW;
Date.now = () => 1781503200000;
let random = 123456789;
Math.random = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
globalThis.setInterval = () => ({ unref() {} });
const { DB } = await load('server/db.js');
const { makeLoadout } = await load('shared/rules.js');
const A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
const trace = [];
const phases = {
  fronts: ['frontsInit'], coop: ['coopInit', 'coopMigrate', 'coopLogin'],
  frontier: ['frontierInit'], rivals: ['rivalsInit'], living: ['livingInit', 'livingTick'],
  hangar: ['hangarInit'], docks: ['docksInit'], hostile: ['hostInit'],
  story: ['storyInit'], syndicate: ['synInit'], arcs: ['arcsInit']
};
for (const [file, methods] of Object.entries(phases)) {
  const module = await load(`server/${file}.js`);
  const operations = Object.values(module).find(value => value && typeof value === 'object' && typeof value[methods[0]] === 'function');
  for (const method of methods) {
    const original = operations[method];
    operations[method] = function (...args) { trace.push(method); return original.apply(this, args); };
  }
}
const { Game } = await load('server/game.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-feature-fixture-'));
try {
  const g = new Game(A, new DB(dir));
  const worldInit = trace.splice(0);
  const sock = new EventEmitter(); sock.open = true; sock.backlog = 0;
  const messages = []; sock.send = m => messages.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  g.connect(sock, '127.0.0.1');
  const s = [...g.sessions.values()][0];
  g.onMessage(s, { t: 'hello', name: 'Mixed Case', pass: 'secret' });
  const login = trace.splice(0);
  const operations = g.features ? {
    bonus: g.features.bonuses.bonus, stats: g.features.shipStats.stats,
    worldPayload: g.features.world.worldPayload, sessionOf: g.features.sessions.sessionOf
  } : Object.fromEntries(['bonus','stats','worldPayload','sessionOf'].map(key => [key, g[key].bind(g)]));
  const saved = JSON.parse(JSON.stringify(s.data, (key, value) => ['salt', 'hash'].includes(key) ? undefined : value));
  const samples = [];
  for (const hull of [700,704,812,818]) {
    if (!A.ships[hull]) continue;
    s.data.ship = makeLoadout(A, hull, 'Fixture');
    s.data.station.done = ['mining1', 'mining2'];
    s.data.mastery = { [hull]: 2500 };
    samples.push({ hull, bonus: operations.bonus(s.data), stats: operations.stats(s.data) });
  }
  const world = operations.worldPayload();
  const lookup = ['Mixed Case', 'mixed case', 'MIXED CASE', 'missing'].map(name => !!operations.sessionOf(name));
  process.stdout.write(JSON.stringify({ baseline: '47bea35a9f3d773efa9a9f075e5b361d9533b390', worldInit, login, saved, samples, world, lookup }, null, 2)+'\n');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
