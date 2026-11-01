import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { STELLARS } from '../shared/galaxy.ts';
import {
  STATION_DEFENSE_HULL,
  STATION_DEFENSE_RADIUS,
  STATION_DEFENSE_REBUILD,
} from '../shared/station-defense.ts';
import { syncStationDefenses } from '../server/station-defense.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';

const game = new Game(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  new DB(tempDataDir('station-defense-')),
);
const socket = legacySocket();
socket.open = true;
socket.backlog = 0;
socket.send = () => {};
socket.close = () => {};
game.connect(socket, '127.0.0.83');
socket.emit('message', JSON.stringify({ t: 'hello', name: 'Station Defender', pass: 'fixture' }));
const session = [...game.sessions.values()][0];
const player = session.data;
const site = STELLARS['site-meridian'];
player.station.site = site.id;
player.station.claimed = false;
player.station.ops = 5;
player.station.defense = 2;
game.db.world.sites[site.id] = game.db.key(player.name);
const space = game.spaces[site.system];
for (const entity of space.ships.values()) space.remove(entity);
const platforms = () => [...space.ships.values()].filter((entity) => entity.stationDefense);
syncStationDefenses(space);
assert.equal(
  platforms().length,
  0,
  'unclaimed hulls never deploy platforms, even with stale upgrade data',
);
player.station.claimed = true;
player.station.ops = 0;
syncStationDefenses(space);
assert.equal(platforms().length, 0, 'claimed abandoned Tier 0 hulls have no defenses');
player.station.ops = 1;
syncStationDefenses(space);
assert.equal(platforms().length, 3);
assert(platforms().every((entity) => entity.hull === STATION_DEFENSE_HULL));
const ids = platforms().map((entity) => entity.id);
for (let tick = 0; tick < 20; tick++) syncStationDefenses(space);
assert.deepEqual(
  platforms().map((entity) => entity.id),
  ids,
  'deployment is idempotent',
);
const platform = platforms()[0];
platform.shield -= 100;
player.station.defense = 3;
syncStationDefenses(space);
assert.equal(platforms().length, 4);
assert.equal(
  space.ships.get(platform.id),
  platform,
  'upgrades keep surviving platform identity and damage',
);
assert(platform.shield < platform.st.shield);
const hostile = space.makeShip({
  hull: 712,
  faction: 'hollow',
  x: site.x + 300,
  y: site.y - 220,
  ai: 'guard',
});
hostile.home = { x: hostile.x, y: hostile.y };
const neutral = space.makeShip({ hull: 703, faction: 'quantum', x: site.x, y: site.y - 200 });
assert(space.isHostile(platform, hostile));
assert(!space.isHostile(platform, neutral));
const health = hostile.shield + hostile.armor;
for (let tick = 0; tick < 100; tick++) space.tick();
assert(hostile.shield + hostile.armor < health, 'real turret shots damage nearby hostile traffic');
for (const entity of platforms()) {
  assert.equal(entity.x, entity.home!.x);
  assert.equal(entity.y, entity.home!.y);
  assert.equal(entity.vx, 0);
  assert.equal(entity.vy, 0);
}
hostile.x = site.x + STATION_DEFENSE_RADIUS + 500;
hostile.y = site.y;
space.ai(platform);
assert.equal(
  platform.target,
  null,
  'platform does not chase enemies outside station protection range',
);
player.rep.hollow = 40;
hostile.x = site.x + 300;
space.ai(platform);
assert.equal(platform.target, null, 'pirate factions friendly to the owner are not attacked');
player.rep.hollow = 0;
space.remove(hostile);
space.remove(neutral);
space.remove(platform);
syncStationDefenses(space);
assert.equal(platforms().length, 3, 'destroyed platforms are not replaced instantly');
space.t += STATION_DEFENSE_REBUILD - 0.1;
syncStationDefenses(space);
assert.equal(platforms().length, 3);
space.t += 0.2;
syncStationDefenses(space);
assert.equal(platforms().length, 4, 'destroyed platform rebuilds once after the delay');
player.sys = site.system;
player.stellar = site.id;
game.depart(session);
const ownerShip = session.ent!;
const sentinel = platforms()[0];
assert(!space.isHostile(sentinel, ownerShip));
const before = ownerShip.shield;
space.damage(ownerShip, 100, 100, sentinel);
assert.equal(ownerShip.shield, before, 'platform fire cannot damage a captain');
const shield = sentinel.shield;
space.damage(sentinel, 100, 100, ownerShip);
assert.equal(sentinel.shield, shield, 'captain fire cannot grief station property');
// Holdout reuses the same permanent roster and ending it cannot remove station defenses.
game.land(session, site.id);
player.station.ops = 2;
player.holdout.lastT = 0;
game.features.hostile.holdoutStart(session);
game.features.hostile.holdoutTick(session);
assert.equal(platforms().length, 4, 'Holdout adds no duplicate temporary gunboats');
assert.deepEqual(
  new Set(player.holdout.active!.platforms),
  new Set(platforms().map((entity) => entity.id)),
);
game.features.hostile.holdoutEnd(session, false, 'Fixture ended');
assert.equal(platforms().length, 4, 'permanent platforms survive Holdout cleanup');
// Relocating and abandoning ownership both retire the old site's roster.
player.station.site = 'site-halcyon';
delete game.db.world.sites[site.id];
game.db.world.sites['site-halcyon'] = game.db.key(player.name);
syncStationDefenses(space);
assert.equal(platforms().length, 0, 'relocation removes every old-site platform');
const destination = game.spaces[STELLARS['site-halcyon'].system];
syncStationDefenses(destination);
assert.equal([...destination.ships.values()].filter((entity) => entity.stationDefense).length, 4);
player.station.claimed = false;
syncStationDefenses(destination);
assert.equal(
  [...destination.ships.values()].filter((entity) => entity.stationDefense).length,
  0,
  'abandoned hull has no remaining platforms',
);
player.station.claimed = true;
syncStationDefenses(destination);
const liveCount = Object.keys(game.live).length;
syncStationDefenses(destination);
assert.equal(
  Object.keys(game.live).length,
  liveCount,
  'station maintenance never wakes other systems',
);
game.sleep(destination);
const awakened = game.spaces[destination.id];
syncStationDefenses(awakened);
assert.equal(
  [...awakened.ships.values()].filter((entity) => entity.stationDefense).length,
  4,
  'waking a system reconstructs exactly one station roster',
);
console.log(
  'Permanent Triad Sentinels: claim/Tier 0 gates, idempotence, real fire, anchoring, range/friendliness, rebuild, player safety, Holdout reuse and relocation passed.',
);
process.exit(0);
