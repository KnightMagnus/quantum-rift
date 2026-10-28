import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { HailService } from '../server/hail-service.ts';
import { HAIL_MACHINE_HULLS } from '../shared/hail-machine.ts';
import { IndexFleetOperations } from '../server/index-fleet.ts';
import type { IndexFleetCapabilities, IndexFleetWorld } from '../server/index-fleet.ts';
import { Space } from '../server/space.ts';
import { DT, step } from '../shared/rules.ts';
import { SYS } from '../shared/galaxy.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { mockSpace } from './helpers/mocks.ts';
import { tempDataDir } from './helpers/temp-data.ts';
const db = new DB(tempDataDir('index-presentation-'));
const game = new Game(JSON.parse(filesystem.readFileSync('shared/assets.json', 'utf8')), db, {
  ...db.gamePlatform(),
  automaticClock: false,
  seedDefinitions: [],
});
const socket = legacySocket();
const packets: Record<string, unknown>[] = [];
socket.open = true;
socket.backlog = 0;
socket.send = (raw) =>
  packets.push(JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)));
game.connect(socket);
const session = [...game.sessions.values()][0];
game.onMessage(session, { t: 'hello', name: 'Index Observer', pass: 'fixture' });
session.data.stellar = null;
session.data.sys = 'meridian';
game.spawnPlayer(session, 10000, 10000, 0, 0);
const space = game.spaces.meridian;
let time = 1800000000000;
const service = new HailService(
  game,
  () => time,
  () => 0.5,
);
for (const hull of HAIL_MACHINE_HULLS) {
  const entity = space.makeShip({
    hull: hull.id,
    faction: hull.faction,
    x: 10100,
    y: 10000,
    ai: 'index',
  });
  packets.length = 0;
  game.features.hail.hail(session, { t: 'hail', id: entity.id });
  let reply = packets.filter((packet) => packet.t === 'hail').at(-1)!;
  assert(reply, 'Real outgoing hail replies for hull ' + hull.id);
  assert.equal(reply.machineHull, hull.id);
  assert.equal(reply.portraitId, undefined, 'Non-human outgoing hail never assigns a captain face');
  const inbox = service.state(session);
  inbox.queue = [];
  assert(service.enqueue(session, entity, 'greeting', 'Survey transmission'));
  const entry = inbox.queue[0];
  assert.equal(entry.machineHull, hull.id);
  assert.equal(entry.portraitId, undefined);
  packets.length = 0;
  service.request(session, { op: 'open', key: entry.key });
  reply = packets.filter((packet) => packet.t === 'hail').at(-1)!;
  assert.equal(reply.machineHull, hull.id, 'Incoming/open or silent archive retains ship identity');
  space.remove(entity);
  time += 180001;
  packets.length = 0;
  service.request(session, { op: 'open', key: entry.key });
  reply = packets.filter((packet) => packet.t === 'hail').at(-1)!;
  assert.equal(reply.machineHull, hull.id, 'Despawned machine archive retains hull');
  assert.equal(reply.portraitId, undefined);
}

// A dense saved mixed roster goes through production steering, physics and fleet ticks.
let clock = 0;
const hulls = [910, 911, 912, 916, 919, 921, 923];
const world: IndexFleetWorld = {
  actors: hulls.map((hull, index) => ({
    hull,
    base: hull,
    armor: game.A.ships[hull].armor,
    shield: game.A.ships[hull].shield,
    x: index * 5,
    y: index * 4,
    dead: false,
    hidden: false,
    readyAt: 1e9,
    hitAt: -100,
    launched: 0,
  })),
  remaining: 36,
  offenders: {},
  warnings: {},
  site: { x: 0, y: 0 },
  kernelLost: false,
  rebootUntil: 0,
  dormantUntil: 0,
  extractAt: 1e9,
  holdImmunity: {},
};
const worlds = { glasswake: world };
const capabilities: IndexFleetCapabilities = {
  fleets: () => worlds,
  clock: () => clock,
  key: () => null,
  provoked: () => false,
  touch() {},
  toast() {},
  virginRock: () => null,
  extract() {},
};
function mixedSpace(): Space {
  return mockSpace({
    id: 'glasswake',
    sys: SYS.glasswake,
    A: game.A,
    t: 0,
    ships: new Map(),
    loot: [],
    events: [],
    beams: [],
    rocks: [],
    makeShip: (...args) => Space.prototype.makeShip.apply(survey, args),
    remove: (...args) => Space.prototype.remove.apply(survey, args),
    root: (...args) => Space.prototype.root.apply(survey, args),
    steer: (...args) => Space.prototype.steer.apply(survey, args),
    fight() {},
  });
}
let survey: Space = mixedSpace();
IndexFleetOperations.open.call(capabilities, survey);
const armor = [...survey.ships.values()].map((entity) => entity.armor);
let minimumClearance = Infinity;
let settledPositions = new Map<number, { x: number; y: number }>();
const travelledPaths = new Map<number, number>();
for (let tick = 0; tick < 1800; tick++) {
  clock += DT;
  survey.t += DT;
  for (const entity of survey.ships.values()) {
    IndexFleetOperations.ai.call(capabilities, survey, entity);
    step(entity, entity.st, entity.inp);
  }
  IndexFleetOperations.fleetTick.call(capabilities, survey);
  if (tick === 899)
    settledPositions = new Map(
      [...survey.ships.values()].map((entity) => [entity.id, { x: entity.x, y: entity.y }]),
    );
  if (tick >= 900) {
    for (const entity of survey.ships.values()) {
      const previous = settledPositions.get(entity.id)!;
      travelledPaths.set(
        entity.id,
        (travelledPaths.get(entity.id) || 0) +
          Math.hypot(entity.x - previous.x, entity.y - previous.y),
      );
      settledPositions.set(entity.id, { x: entity.x, y: entity.y });
    }
  }
  if (tick > 300) {
    const machines = [...survey.ships.values()];
    for (let left = 0; left < machines.length; left++)
      for (let right = left + 1; right < machines.length; right++) {
        const first = machines[left],
          second = machines[right];
        const size = (entity: typeof first) => (Number(entity.hull) === 919 ? 260 : entity.st.size);
        const clearance =
          Math.hypot(first.x - second.x, first.y - second.y) - size(first) - size(second);
        minimumClearance = Math.min(minimumClearance, clearance);
        assert(
          clearance >= 75,
          'Mixed machine hull footprints stay separated during actual motion',
        );
      }
  }
}
assert.deepEqual(
  [...survey.ships.values()].map((entity) => entity.armor),
  armor,
);
// A settled neutral survey keeps moving on independent tours instead of parking at fixed berths.
for (const entity of survey.ships.values()) {
  const travelled = travelledPaths.get(entity.id)!;
  assert(
    travelled > 200,
    `Neutral Index hull ${entity.hull} keeps moving after settling (moved ${Math.round(travelled)})`,
  );
  assert(
    Math.hypot(entity.vx, entity.vy) > 5,
    `Neutral Index hull ${entity.hull} is still under way at the end of the run`,
  );
  const fromSite = Math.hypot(entity.x - world.site.x, entity.y - world.site.y);
  assert(fromSite < 2100, 'Independent survey centres move at bounded cruise speed');
}
assert.equal(world.remaining, 36, 'Spacing never reissues replacement budget');
assert(
  world.actors.some((actor) =>
    world.actors.some((other) => Math.hypot(actor.x - other.x, actor.y - other.y) > 1000),
  ),
  'Independent surveys stay spatially distributed rather than sharing a centre',
);
const stored = structuredClone(world);
worlds.glasswake = stored;
survey = mixedSpace();
IndexFleetOperations.open.call(capabilities, survey);
assert.deepEqual(
  [...survey.ships.values()].map((entity) => [entity.x, entity.y]),
  stored.actors.map((actor) => [actor.x, actor.y]),
);
assert.equal(stored.remaining, 36);
// Split blades must fly back under production steering, not be teleported into merge range.
const mergeWorld: IndexFleetWorld = {
  ...structuredClone(world),
  actors: [
    {
      hull: 916,
      base: 916,
      armor: game.A.ships[916].armor - 90,
      shield: game.A.ships[916].shield - 60,
      x: -800,
      y: 0,
      dead: false,
      hidden: false,
      readyAt: 0,
      hitAt: -100,
      launched: 0,
    },
  ],
};
worlds.glasswake = mergeWorld;
survey = mixedSpace();
IndexFleetOperations.open.call(capabilities, survey);
const trident = [...survey.ships.values()][0];
const originalHealth = { armor: trident.armor, shield: trident.shield };
IndexFleetOperations.damaged.call(capabilities, survey, trident, trident, 1);
let splitObserved = false;
let mergedAfterMotion = false;
for (let tick = 0; tick < 2250; tick++) {
  clock += DT;
  survey.t += DT;
  for (const entity of survey.ships.values()) {
    IndexFleetOperations.ai.call(capabilities, survey, entity);
    if (survey.ships.has(entity.id)) step(entity, entity.st, entity.inp);
  }
  if ([...survey.ships.values()].some((entity) => Number(entity.hull) === 918))
    splitObserved = true;
  IndexFleetOperations.fleetTick.call(capabilities, survey);
  const rejoined = [...survey.ships.values()].find((entity) => Number(entity.hull) === 916);
  if (splitObserved && rejoined) {
    assert.equal(rejoined.armor, originalHealth.armor, 'Natural rejoin preserves damaged armor');
    assert.equal(
      rejoined.shield,
      originalHealth.shield,
      'Natural rejoin preserves damaged shields',
    );
    assert.equal(survey.ships.size, 1, 'Rejoin removes its separate blades');
    mergedAfterMotion = true;
    break;
  }
}
assert(splitObserved, 'Actual damage starts a timed Trident split');
assert(mergedAfterMotion, 'Peaceful blades naturally return and rejoin through real physics');
assert.equal(mergeWorld.remaining, world.remaining, 'Natural rejoin spends no replacement budget');
// Drones sweep around their moving parent rather than holding one fixed point beside it.
const droneWorld: IndexFleetWorld = {
  ...structuredClone(world),
  actors: [910, 914, 914].map((hull, index) => ({
    hull,
    base: hull,
    armor: game.A.ships[hull].armor,
    shield: game.A.ships[hull].shield,
    x: 0,
    y: 0,
    dead: false,
    hidden: false,
    parent: index ? 0 : undefined,
    readyAt: 1e9,
    hitAt: -100,
    launched: 0,
  })),
};
worlds.glasswake = droneWorld;
survey = mixedSpace();
IndexFleetOperations.open.call(capabilities, survey);
const droneBearings: number[][] = [];
for (let tick = 0; tick < 1800; tick++) {
  clock += DT;
  survey.t += DT;
  for (const entity of survey.ships.values()) {
    IndexFleetOperations.ai.call(capabilities, survey, entity);
    step(entity, entity.st, entity.inp);
  }
  IndexFleetOperations.fleetTick.call(capabilities, survey);
  if (tick === 899 || tick === 1799) {
    const [quarry, ...drones] = [...survey.ships.values()]
      .sort((left, right) => left.st.size - right.st.size)
      .reverse();
    droneBearings.push(drones.map((drone) => Math.atan2(drone.y - quarry.y, drone.x - quarry.x)));
  }
}
for (const [index, before] of droneBearings[0].entries()) {
  const turned = Math.abs(
    Math.atan2(
      Math.sin(droneBearings[1][index] - before),
      Math.cos(droneBearings[1][index] - before),
    ),
  );
  assert(turned > 0.3, 'Each drone sweeps around its parent during 30 seconds of neutral survey');
}
// Isolate a stationary visitor so a changing label alone cannot pass the investigation check.
clock = 90;
worlds.glasswake = {
  ...structuredClone(world),
  actors: [{ ...structuredClone(droneWorld.actors[0]), x: 0, y: 0 }],
};
survey = mixedSpace();
IndexFleetOperations.open.call(capabilities, survey);
const investigator = [...survey.ships.values()][0];
const visitor = survey.makeShip({
  hull: 704,
  faction: 'spacer',
  x: 20000,
  y: 0,
  name: 'Stationary survey fixture',
});
const initialVisitorDistance = Math.hypot(investigator.x - visitor.x, investigator.y - visitor.y);
const initialVisitorArmor = visitor.armor;
for (let tick = 0; tick < 2400; tick++) {
  clock += DT;
  survey.t += DT;
  IndexFleetOperations.ai.call(capabilities, survey, investigator);
  step(investigator, investigator.st, investigator.inp);
  IndexFleetOperations.fleetTick.call(capabilities, survey);
  assert.match(investigator.name!, /investigating ship Stationary survey fixture/);
  assert.equal(
    investigator.target,
    null,
    'peaceful investigation does not acquire a combat target',
  );
  assert.ok(
    !investigator.inp.fire1 && !investigator.inp.fire2,
    'investigation does not fire weapons',
  );
}
const finalVisitorDistance = Math.hypot(investigator.x - visitor.x, investigator.y - visitor.y);
assert.ok(
  initialVisitorDistance - finalVisitorDistance > 1000,
  `investigator physically approaches the stationary ship beyond its 800-unit home orbit (${initialVisitorDistance - finalVisitorDistance})`,
);
assert.equal(visitor.x, 20000, 'visitor stays fixed while the investigator moves');
assert.equal(visitor.y, 0);
assert.equal(
  visitor.armor,
  initialVisitorArmor,
  'peaceful investigation does not damage the visitor',
);
// A lagging outbound drone recovers its live parent before resuming its scanning orbit.
clock = 0;
worlds.glasswake = {
  ...structuredClone(world),
  actors: [
    { ...structuredClone(droneWorld.actors[0]), x: 0, y: 0 },
    { ...structuredClone(droneWorld.actors[1]), x: 500, y: 0 },
  ],
};
survey = mixedSpace();
IndexFleetOperations.open.call(capabilities, survey);
const [recoveringParent, recoveringDrone] = [...survey.ships.values()];
recoveringDrone.a = Math.PI / 2;
// Match the outbound drift observed at the seeded route-reversal regression.
recoveringDrone.vx = 80;
let greatestRecoveryRange = 0;
let observedOutboundExcursion = false;
let recoveredLeash = false;
for (let tick = 0; tick < 1800; tick++) {
  clock += DT;
  survey.t += DT;
  for (const entity of survey.ships.values()) {
    const before = { x: entity.x, y: entity.y };
    IndexFleetOperations.ai.call(capabilities, survey, entity);
    assert.equal(entity.x, before.x, 'leash guidance never teleports ships');
    assert.equal(entity.y, before.y);
    step(entity, entity.st, entity.inp);
  }
  IndexFleetOperations.fleetTick.call(capabilities, survey);
  const range = Math.hypot(
    recoveringDrone.x - recoveringParent.x,
    recoveringDrone.y - recoveringParent.y,
  );
  greatestRecoveryRange = Math.max(greatestRecoveryRange, range);
  if (range >= 600) observedOutboundExcursion = true;
  else if (observedOutboundExcursion) recoveredLeash = true;
}
assert.ok(greatestRecoveryRange < 1300, `outbound drone stays leashed (${greatestRecoveryRange})`);
assert.ok(observedOutboundExcursion, 'outbound drone first leaves the recovery radius');
assert.ok(recoveredLeash, 'lagging outbound drone physically returns inside the recovery radius');
const output = path.resolve(
  process.env.RIFT_TEST_ARTIFACTS || '.artifacts/regression',
  'index-presentation',
);
filesystem.mkdirSync(output, { recursive: true });
filesystem.writeFileSync(
  path.join(output, 'spacing.json'),
  JSON.stringify({ ticks: 1800, hulls, minimumClearance, remaining: world.remaining }, null, 2),
);
console.log(
  'Index presentation: every non-human hull retains ship-only live/archive hails; mixed large hulls remain separated through 60 seconds of actual steering/physics and restore.',
);
