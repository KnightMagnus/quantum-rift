import { requiredFixtureValue } from './helpers/required.ts';
// Real contacts and actual shield/armor checks across hazard and encounter scopes.
import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { weaponParams, DT as simulationStepSeconds } from '../shared/rules.ts';
import { DB as Database } from '../server/db.ts';
import { Game, type Session } from '../server/game.ts';
import type { Space } from '../server/space.ts';
import type { SavedRockGeneration } from '../server/mining-contracts.ts';
import { mockWeaponMount } from './helpers/mocks.ts';
const miningSpace = (space: Space): Omit<Space, 'rocks'> & { rocks: SavedRockGeneration[] } =>
  space as Omit<Space, 'rocks'> & { rocks: SavedRockGeneration[] };
function spawnFlyingPilot(game: Game, session: Session, systemId = 'meridian', adult = true) {
  session.data.sys = systemId;
  session.data.stellar = null;
  session.data.station.ops = adult ? 3 : 0;
  game.spawnPlayer(session, 100000, 100000, 0, 0);
  const entity = requiredFixtureValue(session.ent);
  entity.guns = [];
  entity.inp = {};
  return entity;
}
const game = refineryGame(),
  session = refineryPilot(game, 'Noise Owner'),
  session2 = refineryPilot(game, 'Neutral'),
  session3 = refineryPilot(game, 'Armada'),
  playerData = refineryPilot(game, 'Optin');
const entity = spawnFlyingPilot(game, session),
  neutral = spawnFlyingPilot(game, session2),
  armada = spawnFlyingPilot(game, session3),
  peer = spawnFlyingPilot(game, playerData),
  message = miningSpace(game.spaces.meridian);
message.ships = new Map(
  [entity, neutral, armada, peer].map((shipEntity) => [shipEntity.id, shipEntity]),
);
// Owner must stay scope index0 even if peers precede them in connection order.
game.sessions = new Map([...game.sessions.entries()].reverse());
requiredFixtureValue(session).data.armada =
  requiredFixtureValue(session3).data.armada =
  requiredFixtureValue(playerData).data.armada =
    'fixture-miners';
game.features.pressure.consent(session, { op: 'join' });
game.features.pressure.consent(playerData, { op: 'join' });
const wing = message.makeShip({
  hull: 704,
  faction: 'quantum',
  x: entity.x,
  y: entity.y,
  owner: entity.id,
  ai: 'escort',
});
const rock = message.rocks.find((result) => result.ore === 'gas') || message.rocks[0];
rock.ore = 'gas';
rock.x = entity.x + 100;
rock.y = entity.y;
rock.hp = rock.max = 1e9;
rock.seam = Math.PI;
entity.a = Math.PI / 2;
const weaponMount = mockWeaponMount({
  w: 9101,
  n: 1,
  p: weaponParams(game.A.weapons[9101]),
  cd: 0,
  ammo: Infinity,
  snd: 'laser',
  sec: false,
  sndT: 0,
});
const before = [entity, neutral, armada, peer, wing].map((shipEntity) => [
  shipEntity.shield,
  shipEntity.armor,
]);
function step(fire = true) {
  game.features.mining.advanceClock(simulationStepSeconds);
  message.t += simulationStepSeconds;
  if (fire) message.fire(entity, weaponMount, null, entity.a);
  game.features.mining.endTick(message);
  game.features.pressure.pressureTick(message);
}
step();
const hazard = requiredFixtureValue(game.db.world.miningPressure).hazards.find(
  (hull2) => hull2.id === rock.key,
);
assert.ok(hazard);
assert.ok(hazard.detonateAt - hazard.triggerAt >= 2);
assert.deepEqual([entity.shield, entity.armor], before[0], 'no immediate damage');
const noise = game.features.pressure.payload(session).noise;
message.fire(entity, weaponMount, null, entity.a);
game.features.mining.endTick(message);
assert.equal(
  game.features.pressure.payload(session).noise,
  noise,
  'duplicate contact cannot add noise',
);
for (let index = 0; index < 62; index++) step();
assert.ok(entity.shield < before[0][0], 'source captain receives own telegraphed blast');
assert.ok(peer.shield < before[3][0], 'explicit optin receives scoped blast');
for (const [ship, prior] of [
  [neutral, before[1]],
  [armada, before[2]],
  [wing, before[4]],
] as const)
  assert.deepEqual(
    [ship.shield, ship.armor],
    prior,
    'neutral/unconsentingArmada/friendlywing immune',
  );
const after = entity.shield;
for (let index = 0; index < 15; index++) step(false);
assert.equal(entity.shield, after, 'same blast cannot replay');
for (
  let index = 0;
  index < 550 &&
  !requiredFixtureValue(game.db.world.miningPressure).encounters.some((entry) => entry.active);
  index++
)
  step();
const group = requiredFixtureValue(game.db.world.miningPressure).encounters.find(
  (entry) => entry.active,
);
assert.ok(group);
assert.equal(group.ids.length, 2);
const raider = requiredFixtureValue(message.ships.get(group.ids[0]));
assert.equal(message.canAcquire(raider, neutral), false);
assert.equal(message.canHit(raider, armada), false);
assert.equal(message.canHit(raider, wing), false);
assert.equal(message.canHit(raider, entity), true);
assert.equal(message.canHit(raider, peer), true);
const neutralHP = [neutral.shield, neutral.armor];
message.damage(neutral, 999, 999, raider);
assert.deepEqual(
  [neutral.shield, neutral.armor],
  neutralHP,
  'damage authority itself blocks collateral',
);
game.features.pressure.consent(playerData, { op: 'leave' });
const hitPoints = [peer.shield, peer.armor];
message.damage(peer, 999, 999, raider);
assert.deepEqual(
  [peer.shield, peer.armor],
  hitPoints,
  'withdrawal removes existinggroup damage eligibility',
);
assert.equal(game.features.pressure.shotAllowed(message, group.id, neutral), false);
assert.equal(game.features.pressure.shotAllowed(message, group.id, peer), false);
assert.equal(game.features.pressure.shotAllowed(message, group.id, entity), true);
// The blast can hit an explicitly enrolled hostile, never an ambient neutral NPC.
const vent = message.rocks.find((rockGeneration) => rockGeneration.key !== rock.key);
requiredFixtureValue(vent).ore = 'gas';
requiredFixtureValue(vent).captain = game.db.key(requiredFixtureValue(session).data.name);
requiredFixtureValue(raider).x = requiredFixtureValue(vent).x;
requiredFixtureValue(raider).y = requiredFixtureValue(vent).y;
const bystander = message.makeShip({
    hull: 704,
    faction: 'spacer',
    x: requiredFixtureValue(vent).x,
    y: requiredFixtureValue(vent).y,
    ai: 'trader',
  }),
  npcHP = [bystander.shield, bystander.armor],
  hostileShield = requiredFixtureValue(raider).shield;
game.features.pressure.work(message, requiredFixtureValue(vent), 0.1);
for (let index = 0; index < 3; index++) game.features.mining.advanceClock(1);
game.features.pressure.pressureTick(message);
assert.ok(
  requiredFixtureValue(raider).shield < hostileShield,
  'enrolled hostile in real radius receives blast',
);
assert.deepEqual([bystander.shield, bystander.armor], npcHP, 'ambient neutral NPC immune');
const last = requiredFixtureValue(
  requiredFixtureValue(game.db.world.miningPressure).captains.find(
    (entry) => entry.owner === game.db.key(requiredFixtureValue(session).data.name),
  ),
).lastEncounter;
for (const identifier of group.ids) message.ships.delete(identifier);
game.features.pressure.pressureTick(message);
assert.equal(group.active, false);
for (let index = 0; index < 20; index++) step();
assert.equal(
  requiredFixtureValue(game.db.world.miningPressure).encounters.filter((entry) => entry.active)
    .length,
  0,
  'kill cannot reset300s cooldown',
);
assert.equal(
  requiredFixtureValue(
    requiredFixtureValue(game.db.world.miningPressure).captains.find(
      (entry) => entry.owner === game.db.key(requiredFixtureValue(session).data.name),
    ),
  ).lastEncounter,
  last,
);
const count = requiredFixtureValue(game.db.world.miningPressure).hazards.length;
game.db.touch();
game.db.flush();
const reload = refineryGame(new Database(game.db.dir));
assert.equal(
  requiredFixtureValue(
    requiredFixtureValue(reload.db.world.miningPressure).captains.find(
      (entry) => entry.owner === game.db.key(requiredFixtureValue(session).data.name),
    ),
  ).lastEncounter,
  last,
);
assert.ok(
  requiredFixtureValue(reload.db.world.miningPressure).hazards.every((hull3) => hull3.resolved),
  'restart cannot replay stale effects',
);
assert.equal(requiredFixtureValue(reload.db.world.miningPressure).consent.length, 0);
assert.ok(count > 0);
const oldNoise = game.features.pressure.payload(session).noise;
for (let index = 0; index < 10; index++) {
  game.features.mining.advanceClock(1);
  game.features.pressure.pressureTick(message);
}
assert.ok(
  game.features.pressure.payload(session).noise < oldNoise,
  'leaving/cooling usespersistentclock',
);
// Main-galaxy newcomer owns the noise but cannot be attacked; Farside retains no truce.
for (const [systemId, expected] of [
  ['meridian', false],
  ['mirrorfall', true],
] as const) {
  const hull4 = refineryGame(),
    session4 = refineryPilot(hull4, `Protected${expected}`),
    ship = spawnFlyingPilot(hull4, session4, systemId, false),
    space = miningSpace(hull4.spaces[systemId]);
  space.ships = new Map([[ship.id, ship]]);
  const rockGeneration = space.rocks[0];
  rockGeneration.captain = hull4.db.key(requiredFixtureValue(session4).data.name);
  hull4.features.pressure.work(space, rockGeneration, 30);
  hull4.features.pressure.pressureTick(space);
  assert.equal(
    requiredFixtureValue(hull4.db.world.miningPressure).encounters.some(
      (entity2) => entity2.active,
    ),
    expected,
  );
  const player = requiredFixtureValue(hull4.db.world.miningPressure).captains[0];
  assert.ok(player.noise >= 70);
  if (!expected)
    assert.equal(hull4.features.pressure.shotAllowed(space, 'nonexistent', ship), false);
}
// Real simultaneous captains share one useful-time union, neither the last
// collision nor duplicate mounts can offload/multiply all of another miner's noise.
{
  const hull5 = refineryGame(),
    session4 = refineryPilot(hull5, 'UnionA'),
    session5 = refineryPilot(hull5, 'UnionB'),
    firstEntity = spawnFlyingPilot(hull5, session4),
    secondEntity = spawnFlyingPilot(hull5, session5),
    space = miningSpace(hull5.spaces.meridian);
  space.ships = new Map([
    [firstEntity.id, firstEntity],
    [secondEntity.id, secondEntity],
  ]);
  const rockGeneration = space.rocks[0];
  rockGeneration.x = 100100;
  rockGeneration.y = 100000;
  rockGeneration.hp = rockGeneration.max = 1e9;
  rockGeneration.seam = Math.PI;
  firstEntity.x = secondEntity.x = 100000;
  firstEntity.y = secondEntity.y = 100000;
  firstEntity.a = secondEntity.a = Math.PI / 2;
  const weaponMount2 = mockWeaponMount({
    w: 9101,
    n: 1,
    p: weaponParams(hull5.A.weapons[9101]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  });
  hull5.features.mining.advanceClock(simulationStepSeconds);
  space.t += simulationStepSeconds;
  space.fire(firstEntity, weaponMount2, null, firstEntity.a);
  space.fire(secondEntity, weaponMount2, null, secondEntity.a);
  hull5.features.mining.endTick(space);
  const firstNoise = hull5.features.pressure.payload(session4).noise,
    secondNoise = hull5.features.pressure.payload(session5).noise;
  assert.ok(firstNoise > 0 && secondNoise > 0);
  assert.ok(Math.abs(firstNoise - secondNoise) < 1e-10);
  assert.ok(
    Math.abs(firstNoise + secondNoise - simulationStepSeconds * 7) < 1e-10,
    'one real union, split attribution',
  );
}
console.log('ALL REAL MINING PRESSURE / TELEGRAPH / CONSENT / NEWCOMER / PERSISTENCE TESTS PASSED');

// A new hull/flight never inherits the old Armada hazard opt-in.
{
  const hull6 = refineryGame(),
    captain = refineryPilot(hull6, 'Flight Consent');
  spawnFlyingPilot(hull6, captain);
  requiredFixtureValue(captain).data.armada = 'flight-group';
  hull6.features.pressure.consent(captain, { op: 'join' });
  assert.equal(hull6.features.pressure.payload(captain).groupConsent, true);
  const previousHull = requiredFixtureValue(captain).ent;
  spawnFlyingPilot(hull6, captain);
  assert.notEqual(
    requiredFixtureValue(requiredFixtureValue(captain).ent).id,
    requiredFixtureValue(previousHull).id,
  );
  assert.equal(
    hull6.features.pressure.payload(captain).groupConsent,
    false,
    'new flight requires explicit opt-in',
  );
  hull6.features.pressure.consent(captain, { op: 'join' });
  assert.equal(hull6.features.pressure.payload(captain).groupConsent, true);
}
