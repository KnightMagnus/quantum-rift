import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { tickQcsFleet, qcsRunwayOrigin } from '../server/qcs-fleet.ts';
import { QCS_ROSTER, QCS_DWELL } from '../shared/qcs-fleet.ts';
import { SYS } from '../shared/galaxy.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const directory = tempDataDir('qcs-fleet-');
const assets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new DB(directory));
tickQcsFleet(game, 0);
const state = game.db.world.qcsFleet!;
const ships = () =>
  Object.values(game.live)
    .flatMap((space) => [...space.ships.values()])
    .filter(
      (ship) => ship.name === 'QCS Concordance' || [850, 851, 852, 853].includes(Number(ship.hull)),
    );
assert.equal(ships().length, 10, 'eight drones start carried, not pre-spawned');
const launchCarrier = ships().find((ship) => ship.hull === 851)!;
for (let launch = 0; launch < 8; launch++) {
  launchCarrier.a = (launch * Math.PI) / 4;
  const origin = qcsRunwayOrigin(launchCarrier);
  const previous = new Set(ships().map((ship) => ship.id));
  tickQcsFleet(game, launch === 0 ? 3 : 0.75);
  const drone = ships().find((ship) => !previous.has(ship.id))!;
  assert.equal(drone.hull, 853);
  assert.equal(drone.x, origin.x);
  assert.equal(drone.y, origin.y);
  assert.equal(drone.a, launchCarrier.a);
  assert.equal(drone.fighterOf, launchCarrier.id);
  const count = ships().length;
  tickQcsFleet(game, 0);
  assert.equal(ships().length, count, 'launches are staggered, not stacked');
}
assert.equal(ships().length, QCS_ROSTER.length);
assert.equal(ships().filter((ship) => ship.hull === 851).length, 1);
for (const ship of ships()) {
  assert(ship.st.maxSpeed <= 90);
  assert(ship.guns.length > 0);
  assert(!game.spaces[state.system].isHostile(ship, ships()[0]));
}
assert(game.A.ships[850].npcOnly);
assert(!game.A.ships[736].npcOnly);
const flagship = ships().find((ship) => ship.hull === 736)!;
flagship.armor = 1500;
const drone = ships().find((ship) => ship.hull === 853)!;
game.spaces[state.system].remove(drone);
// Waking other systems cannot clone the one world roster.
void game.spaces.halcyon;
tickQcsFleet(game, 0);
assert.equal(ships().length, QCS_ROSTER.length - 1);
const carrier = ships().find((ship) => ship.hull === 851)!;
for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  carrier.a = angle;
  const origin = qcsRunwayOrigin(carrier);
  assert(
    Math.abs(Math.hypot(origin.x - carrier.x, origin.y - carrier.y) - carrier.st.size * 0.035) <
      1e-6,
  );
}
for (const drone of ships().filter((ship) => ship.hull === 853))
  assert.equal(drone.fighterOf, carrier.id);
const oldSystem = state.system;
tickQcsFleet(game, QCS_DWELL);
assert.notEqual(state.system, oldSystem);
assert(SYS[oldSystem].links.includes(state.system));
assert.equal(SYS[state.system].faction, 'quantum');
for (let launch = 0; launch < 8; launch++) tickQcsFleet(game, 3);
assert.equal(ships().length, QCS_ROSTER.length - 1);
assert.equal(ships().find((ship) => ship.hull === 736)!.armor, 1500);
assert(![...game.spaces[oldSystem].ships.values()].includes(flagship));
// A fresh runtime restores the saved finite roster without healing or resurrection.
const restored = new Game(structuredClone(assets), new DB(tempDataDir('qcs-fleet-restore-')));
restored.db.world.qcsFleet = structuredClone(state);
tickQcsFleet(restored, 0);
for (let launch = 0; launch < 8; launch++) tickQcsFleet(restored, 3);
const restoredShips = [...restored.spaces[state.system].ships.values()].filter((ship) =>
  QCS_ROSTER.includes(Number(ship.hull)),
);
assert.equal(restoredShips.length, QCS_ROSTER.length - 1);
assert.equal(restoredShips.find((ship) => ship.hull === 736)!.armor, 1500);
for (let jump = 0; jump < 12; jump++) {
  const before = state.system;
  tickQcsFleet(game, QCS_DWELL);
  assert.equal(SYS[state.system].faction, 'quantum');
  assert(SYS[before].links.includes(state.system));
}
for (const ship of ships()) game.spaces[state.system].remove(ship);
tickQcsFleet(game, QCS_DWELL);
assert.equal(ships().length, 0, 'destroyed fleet does not immediately refill');
// Sleeping a quiet system does not pin it awake or refill the world roster.
const sleepingSpace = restored.spaces[state.system];
restored.sleep(sleepingSpace);
assert(!restored.live[state.system]);
void restored.spaces[state.system];
tickQcsFleet(restored, 0);
assert.equal(restored.db.world.qcsFleet!.health.filter(Boolean).length, QCS_ROSTER.length - 1);
const denied = new Game(structuredClone(assets), new DB(tempDataDir('qcs-carrier-loss-')));
tickQcsFleet(denied, 0);
const deniedSpace = denied.spaces.qgate;
const lostCarrier = [...deniedSpace.ships.values()].find((ship) => ship.hull === 851)!;
deniedSpace.remove(lostCarrier);
tickQcsFleet(denied, 3);
assert.equal([...deniedSpace.ships.values()].filter((ship) => ship.hull === 853).length, 0);
assert(denied.db.world.qcsFleet!.health.slice(10).every((health) => health === null));
console.log(
  'QCS fleet: bounded roster, arms, friendly posture, speed, routing, attrition and restore passed',
);

process.exit(0);
