import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { STELLARS } from '../shared/galaxy.js';
import { repairBasis } from '../shared/rules.js';
import { WING_REPAIR_COST } from '../shared/docks.js';
process.env.SEEDS_FILE = '/nonexistent';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-outfitter-repairs-')),
  g = new Game(A, new DB(dir));
function captain(name) {
  const d = g.db.create(name, 'secret', g.fresh());
  d.tut = 999;
  d.credits = 1e6;
  d.station.claimed = true;
  d.station.ops = 2;
  d.station.site = 'site-qgate';
  d.escorts = [751];
  const sock = new EventEmitter(),
    out = [];
  sock.open = true;
  sock.backlog = 0;
  sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  g.connect(sock, '127.0.0.1');
  const send = (m) => sock.emit('message', JSON.stringify(m));
  send({ t: 'hello', name, pass: 'secret' });
  const s = [...g.sessions.values()].at(-1);
  return { s, d: s.data, send, out };
}
const p = captain('Repair Pilot'),
  other = captain('Other Pilot'),
  X = p.d.dock[0],
  alien = other.d.dock[0],
  cost = Math.round(repairBasis(A, X.ship.hull) * WING_REPAIR_COST);
function landAt(id) {
  p.s.ent = null;
  p.d.stellar = id;
  p.d.sys = STELLARS[id].system;
}
function broken() {
  X.repairT = Date.now() + 600000;
}
function repair(uid = X.ship.uid) {
  p.send({ t: 'docks', op: 'outfitterRepair', uid });
}
for (const port of ['meridian-yards', 'concordia']) {
  landAt(port);
  broken();
  const before = p.d.credits;
  repair();
  assert.equal(X.repairT, 0, port + ' repairs');
  assert.equal(p.d.credits, before - cost, 'existing fee');
  repair();
  assert.equal(p.d.credits, before - cost, 'duplicate packet not charged');
}
landAt('longhaul-depot');
broken();
const before = p.d.credits,
  timer = X.repairT;
repair();
assert.equal(p.d.credits, before);
assert.equal(X.repairT, timer);
landAt('concordia');
p.d.credits = cost - 1;
repair();
assert.equal(X.repairT, timer);
assert.equal(p.d.credits, cost - 1);
p.d.credits = 1e6;
alien.repairT = Date.now() + 600000;
alien.ship.uid = 'other-player-only-ship';
repair(alien.ship.uid);
assert.ok(alien.repairT > Date.now());
assert.equal(p.d.credits, 1e6);
repair(p.d.ship.uid);
repair('not-owned');
assert.equal(p.d.credits, 1e6);
p.s.ent = {};
repair();
assert.equal(X.repairT, timer);
assert.equal(p.d.credits, 1e6);
p.s.ent = null;
p.d.sys = 'sol';
repair();
assert.equal(X.repairT, timer);
landAt('site-qgate');
g.db.world.sites['site-qgate'] = g.db.key('Repair Pilot');
p.d.station.ops = 1;
repair();
assert.equal(X.repairT, timer, 'Ops 1 has no outfitter');
p.d.station.ops = 2;
repair();
assert.equal(X.repairT, 0, 'Ops 2 personal outfitter works');
broken();
p.send({ t: 'docks', op: 'repair', uid: X.ship.uid });
assert.equal(X.repairT, 0, 'existing DOCKS operation preserved');
X.repairT = Date.now() - 1;
assert.ok(
  g.features.docks.activeWings(p.d).some((w) => w.x === X),
  'free timer repair preserved',
);
assert.equal(g.features.docks.docksPayload(p.d).stored[0].repairT, 0);
console.log(
  'Outfitter repairs passed: station/planet, exact fee, duplicate, funds, ownership, flying, service, location, personal station, DOCKS and timed repair.',
);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
