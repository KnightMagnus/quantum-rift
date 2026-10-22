import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { FixtureSocket } from './helpers/refinery-fixture.ts';
import { mockEntity } from './helpers/mocks.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { repairBasis } from '../shared/rules.ts';
import { WING_REPAIR_COST } from '../shared/docks.ts';
process.env.SEEDS_FILE = '/nonexistent';
const assets = JSON.parse(
    filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  ),
  directory = filesystem.mkdtempSync(
    path.join(operatingSystem.tmpdir(), 'rift-outfitter-repairs-'),
  ),
  game = new Game(assets, new Database(directory));
function captain(name: string) {
  const playerData = game.db.create(name, 'secret', game.fresh());
  playerData.tut = 999;
  playerData.credits = 1e6;
  playerData.station.claimed = true;
  playerData.station.ops = 2;
  playerData.station.site = 'site-qgate';
  playerData.escorts = [751];
  const sock = new FixtureSocket();
  const output = sock.out;
  game.connect(sock, '127.0.0.1');
  const send = (message: Record<string, unknown>) => sock.emit('message', JSON.stringify(message));
  send({ t: 'hello', name, pass: 'secret' });
  const session = [...game.sessions.values()].at(-1);
  return { s: session, d: requiredFixtureValue(session).data, send, out: output };
}
const player = captain('Repair Pilot'),
  other = captain('Other Pilot'),
  dockWing = player.d.dock[0],
  alien = other.d.dock[0],
  cost = Math.round(repairBasis(assets, dockWing.ship.hull) * WING_REPAIR_COST);
function landAt(identifier: string) {
  requiredFixtureValue(player.s).ent = null;
  player.d.stellar = identifier;
  player.d.sys = STELLARS[identifier].system;
}
function broken() {
  dockWing.repairT = Date.now() + 600000;
}
function repair(shipUid = dockWing.ship.uid) {
  player.send({ t: 'docks', op: 'outfitterRepair', uid: shipUid });
}
for (const port of ['meridian-yards', 'concordia']) {
  landAt(port);
  broken();
  const before = player.d.credits;
  repair();
  assert.equal(dockWing.repairT, 0, port + ' repairs');
  assert.equal(player.d.credits, before - cost, 'existing fee');
  repair();
  assert.equal(player.d.credits, before - cost, 'duplicate packet not charged');
}
landAt('longhaul-depot');
broken();
const before = player.d.credits,
  timer = dockWing.repairT;
repair();
assert.equal(player.d.credits, before);
assert.equal(dockWing.repairT, timer);
landAt('concordia');
player.d.credits = cost - 1;
repair();
assert.equal(dockWing.repairT, timer);
assert.equal(player.d.credits, cost - 1);
player.d.credits = 1e6;
alien.repairT = Date.now() + 600000;
alien.ship.uid = 'other-player-only-ship';
repair(alien.ship.uid);
assert.ok(alien.repairT > Date.now());
assert.equal(player.d.credits, 1e6);
repair(player.d.ship.uid);
repair('not-owned');
assert.equal(player.d.credits, 1e6);
requiredFixtureValue(player.s).ent = mockEntity({});
repair();
assert.equal(dockWing.repairT, timer);
assert.equal(player.d.credits, 1e6);
requiredFixtureValue(player.s).ent = null;
player.d.sys = 'sol';
repair();
assert.equal(dockWing.repairT, timer);
landAt('site-qgate');
game.db.world.sites['site-qgate'] = game.db.key('Repair Pilot');
player.d.station.ops = 1;
repair();
assert.equal(dockWing.repairT, timer, 'Ops 1 has no outfitter');
player.d.station.ops = 2;
repair();
assert.equal(dockWing.repairT, 0, 'Ops 2 personal outfitter works');
broken();
player.send({ t: 'docks', op: 'repair', uid: dockWing.ship.uid });
assert.equal(dockWing.repairT, 0, 'existing DOCKS operation preserved');
dockWing.repairT = Date.now() - 1;
assert.ok(
  game.features.docks.activeWings(player.d).some((weapon) => weapon.x === dockWing),
  'free timer repair preserved',
);
assert.equal(game.features.docks.docksPayload(player.d).stored[0].repairT, 0);
console.log(
  'Outfitter repairs passed: station/planet, exact fee, duplicate, funds, ownership, flying, service, location, personal station, DOCKS and timed repair.',
);
filesystem.rmSync(directory, { recursive: true, force: true });
process.exit(0);
