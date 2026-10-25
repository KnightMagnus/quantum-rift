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
for (let tick = 0; tick < 1800; tick++) {
  clock += DT;
  survey.t += DT;
  for (const entity of survey.ships.values()) {
    IndexFleetOperations.ai.call(capabilities, survey, entity);
    step(entity, entity.st, entity.inp);
  }
  IndexFleetOperations.fleetTick.call(capabilities, survey);
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
assert.equal(world.remaining, 36, 'Spacing never reissues replacement budget');
assert(
  world.actors.every((actor) => Math.hypot(actor.x, actor.y) > 300),
  'Formation is not a shared center target',
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
