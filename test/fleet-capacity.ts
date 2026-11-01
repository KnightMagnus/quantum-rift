import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { makeLoadout, shipStats } from '../shared/rules.ts';
import { passengerSeats } from '../shared/passengers.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { mockMission } from './helpers/mocks.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';

const directory = tempDataDir('fleet-capacity-');
const game = new Game(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  new DB(directory),
);
const socket = legacySocket();
socket.open = true;
socket.backlog = 0;
socket.send = () => {};
socket.close = () => {};
game.connect(socket, '127.0.0.82');
socket.emit('message', JSON.stringify({ t: 'hello', name: 'Fleet Capacity', pass: 'fixture' }));
const session = [...game.sessions.values()][0];
const player = session.data;
player.credits = 1e9;
player.station.site = 'site-qgate';
player.station.claimed = true;
player.station.ops = 4;
game.db.world.sites['site-qgate'] = game.db.key(player.name);
player.ship = makeLoadout(game.A, 703, 'Lead');
player.ship.uid = 'capacity-lead';
const hauler = makeLoadout(game.A, 704, 'Wing Dory');
hauler.uid = 'capacity-dory';
const liner = makeLoadout(game.A, 714, 'Wing Liner');
liner.uid = 'capacity-liner';
liner.outfits[9020] = 1;
const spare = makeLoadout(game.A, 784, 'Unassigned');
spare.uid = 'capacity-spare';
player.dock = [
  { ship: hauler, bridge: {} },
  { ship: liner, bridge: {} },
  { ship: spare, bridge: {} },
];
player.docks = [
  {
    lead: player.ship.uid,
    wings: [
      { uid: hauler.uid, cap: null, crew: null },
      { uid: liner.uid, cap: null, crew: null },
    ],
  },
];
player.activeDock = 0;
game.features.docks.docksInit(player);
const expected = {
  cargo: [player.ship, hauler, liner].reduce(
    (sum, ship) => sum + shipStats(game.A, ship)!.cargo,
    0,
  ),
  passengerSeats: [player.ship, hauler, liner].reduce(
    (sum, ship) => sum + passengerSeats(game.A.ships[ship.hull], ship),
    0,
  ),
};
assert.deepEqual(
  game.transportCapacity(player),
  expected,
  'only assigned ready ships contribute fitted capacity',
);
assert.equal(
  game.features.shipStats.stats(player)!.cargo,
  shipStats(game.A, player.ship)!.cargo,
  'lead physical stats remain independent',
);
player.stellar = 'qstation';
player.sys = STELLARS.qstation.system;
game.trade(session, 'ore', 9999);
assert.equal(player.cargo.ore, expected.cargo, 'Trade buys past the lead hold and fills the fleet');
const fullCredits = player.credits;
game.trade(session, 'ore', 1);
assert.equal(player.credits, fullCredits, 'full fleet cannot spend on another ton');
assert(
  game.features.syndicate.acceptCheck(
    session,
    mockMission({ type: 'passenger', pax: expected.passengerSeats }),
  ),
);
assert(
  !game.features.syndicate.acceptCheck(
    session,
    mockMission({ type: 'passenger', pax: expected.passengerSeats + 1 }),
  ),
);
const passengerJob = mockMission({
  id: 'fleet-passengers',
  type: 'passenger',
  pax: expected.passengerSeats,
  title: 'Fleet charter',
});
game.offers = () => [passengerJob];
game.accept(session, passengerJob.id);
assert(
  player.missions.some((mission) => mission.id === passengerJob.id),
  'actual passenger job books the combined seating',
);
player.stellar = player.station.site;
player.sys = STELLARS[player.stellar].system;
const roster = JSON.stringify(player.docks);
game.features.docks.docksOp(session, { op: 'assign', k: 0, slot: 0, uid: '' });
assert.equal(JSON.stringify(player.docks), roster, 'cannot unassign a loaded cargo carrier');
seedCargo(player, {});
const credits = player.credits;
game.features.hangar.dockOp(session, { op: 'sell', uid: liner.uid });
assert.equal(player.credits, credits, 'cannot sell occupied passenger seats');
assert(player.dock.some((ship) => ship.ship.uid === liner.uid));
const dockBefore = player.activeDock;
player.docks[1].lead = spare.uid;
game.features.docks.docksOp(session, { op: 'activate', k: 1 });
assert.equal(
  player.activeDock,
  dockBefore,
  'cannot switch to a dock without seats for the booked group',
);
seedCargo(player, { ore: expected.cargo });
// Damage excludes a carrier immediately without deleting the shared manifest.
player.dock[0].repairT = Date.now() + 60000;
assert.equal(
  game.transportCapacity(player).cargo,
  expected.cargo - shipStats(game.A, hauler)!.cargo,
);
assert.equal(player.cargo.ore, expected.cargo, 'repair transitions do not silently destroy cargo');
player.dock[0].repairT = 0;
seedCargo(player, {});
player.missions = [];
const cargoJob = mockMission({
  id: 'fleet-cargo',
  type: 'cargo',
  qty: expected.cargo,
  title: 'Fleet delivery',
});
game.offers = () => [cargoJob];
game.accept(session, cargoJob.id);
assert(
  player.missions.some((mission) => mission.id === cargoJob.id),
  'cargo jobs use wing holds too',
);
player.missions = [];
game.features.docks.docksOp(session, { op: 'assign', k: 0, slot: 0, uid: '' });
assert.equal(player.docks[0].wings[0], null, 'empty fleet may unassign a carrier');
assert.equal(
  game.transportCapacity(player).cargo,
  expected.cargo - shipStats(game.A, hauler)!.cargo,
);
game.db.touch();
game.db.flush();
const reloaded = new DB(directory).players[game.db.key(player.name)];
assert.deepEqual(
  game.transportCapacity(reloaded),
  game.transportCapacity(player),
  'roster capacity survives reload without a second inventory',
);
// Stored bridge presets must be normalized before a loaded roster can switch leads.
player.officers.push({
  id: 'capacity-qm',
  name: 'Quartermaster',
  race: 'quantum',
  role: 'quartermaster',
  rarity: 3,
  lv: 10,
  xp: 0,
});
const target = makeLoadout(game.A, 703, 'Target lead');
target.uid = 'capacity-target';
const targetStored = { ship: target, bridge: { bridge1: 'capacity-qm' } };
player.dock.push(targetStored);
player.docks[0].wings = [null, null];
player.docks[1] = {
  lead: target.uid,
  wings: [{ uid: hauler.uid!, cap: 'capacity-qm', crew: null }],
};
const prospective = structuredClone(player);
prospective.ship = target;
prospective.activeDock = 1;
prospective.bridge = {};
const cleanCapacity = game.transportCapacity(prospective).cargo;
prospective.bridge = { bridge1: 'capacity-qm' };
assert(
  game.transportCapacity(prospective).cargo > cleanCapacity,
  'stale officer preset would overcount capacity',
);
player.ship = makeLoadout(game.A, 714, 'Roomy lead');
player.ship.uid = 'capacity-roomy';
player.docks[0].lead = player.ship.uid;
seedCargo(player, { ore: cleanCapacity + 1 });
const beforeSwitch = JSON.stringify(player);
game.features.docks.docksOp(session, { op: 'activate', k: 1 });
assert.equal(
  JSON.stringify(player),
  beforeSwitch,
  'activation denies an overloaded cleaned bridge without mutating the preset',
);
player.docks[1].wings = [null];
player.docks[0].wings[0] = { uid: hauler.uid!, cap: 'capacity-qm', crew: null };
const beforeAssignment = JSON.stringify(player);
game.features.docks.docksOp(session, { op: 'assign', k: 0, slot: 'lead', uid: target.uid });
assert.equal(
  JSON.stringify(player),
  beforeAssignment,
  'lead assignment also checks the cleaned bridge before mutation',
);
// Actual mined parcels can fill ready wing holds after the lead hold fills.
seedCargo(player, {});
player.docks[0].wings[0] = { uid: hauler.uid!, cap: null, crew: null };
game.depart(session);
assert(session.ent, 'fleet departs for real in-flight capacity checks');
const space = game.live[player.sys];
const ownWing = [...space.ships.values()].find(
  (entity) => entity.wingUid === hauler.uid && entity.wingOf === session.id,
)!;
assert(ownWing, 'assigned Dory spawned');
const leadCargo = game.features.shipStats.stats(player)!.cargo;
seedCargo(player, { ore: leadCargo });
assert.equal(
  game.onLoot(game.pref(session), {
    ore: 'ore',
    n: 1,
    remainingLots: { common: 1, rich: 0, pure: 0 },
  }),
  true,
);
assert.equal(
  player.cargo.ore,
  leadCargo + 1,
  'mined ore enters wing capacity beyond the full lead hold',
);
const flyingCapacity = game.transportCapacity(player).cargo;
// Account-local ship UIDs can overlap, but a foreign captain's carrier is not ours.
const ownWingKey = ownWing.id;
space.ships.delete(ownWingKey);
const foreignWing = space.makeShip({ hull: 704, faction: 'quantum' });
foreignWing.wingUid = hauler.uid;
foreignWing.wingOf = session.id + 1000;
space.ships.set(foreignWing.id, foreignWing);
assert.equal(
  game.transportCapacity(player).cargo,
  flyingCapacity - shipStats(game.A, hauler)!.cargo,
  'foreign matching UID cannot replace a missing owned wing',
);
space.ships.delete(foreignWing.id);
space.ships.set(ownWingKey, ownWing);
console.log(
  'Fleet cargo and passenger capacity: actual Trade/jobs, fitted active wings, repair exclusion, roster/sale denials and persistence passed.',
);

process.exit(0);
