import { requiredFixtureValue } from './helpers/required.ts';
// Observable production collision, finite accounting and checkpoint recovery; no player saves.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { FixtureSocket, type FixtureSession } from './helpers/refinery-fixture.ts';
import { mockWeaponMount } from './helpers/mocks.ts';
import type { Entity, Space } from '../server/space.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { DT as simulationStepSeconds, makeLoadout } from '../shared/rules.ts';
import { contactTime, rollGrades, randomOf, stageCount } from '../shared/mining-rules.ts';
import { assertLots, clearLots } from '../shared/cargo-lots.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { type SavedRockGeneration } from '../server/mining-contracts.ts';
type MiningFixtureSpace = Omit<Space, 'rocks'> & { rocks: SavedRockGeneration[] };
// Mining initialization replaces plain rocks with persisted generation records.
const miningSpace = (space: Space): MiningFixtureSpace => space as MiningFixtureSpace;
const assets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
function game(database = new Database(tempDataDir('rift-mining-'))) {
  const interval = globalThis.setInterval;
  try {
    globalThis.setInterval = Object.assign(() => {
      const timer = interval(() => {}, 2147483647);
      clearInterval(timer);
      return timer;
    }, interval);
    return new Game(structuredClone(assets), database);
  } finally {
    globalThis.setInterval = interval;
  }
}
function pilot(game4: Game, name: string) {
  const sock = new FixtureSocket();
  game4.connect(sock, '127.0.0.1');
  const session = requiredFixtureValue([...game4.sessions.values()].at(-1));
  game4.onMessage(session, { t: 'hello', name, pass: 'fixture' });
  requiredFixtureValue(session).data.tut = 999;
  requiredFixtureValue(session).data.stellar = null;
  requiredFixtureValue(session).data.sys = 'meridian';
  requiredFixtureValue(session).data.ship = makeLoadout(game4.A, 704, 'Miner');
  game4.spawnPlayer(session, 0, 0, 0, 0);
  requiredFixtureValue(session.ent);
  return session as FixtureSession & { ent: Entity };
}
const game2 = game(),
  session = pilot(game2, 'Cutter'),
  message = miningSpace(game2.spaces.meridian);
message.ships = new Map([
  [requiredFixtureValue(requiredFixtureValue(session).ent).id, requiredFixtureValue(session).ent],
]);
message.players = 1;
let _tokenCalls = 0;
game2.features.specialists.specGain = () => {
  _tokenCalls++;
};
function step(quantity = 1) {
  for (let index = 0; index < quantity; index++) {
    game2.features.mining.advanceClock(simulationStepSeconds);
    message.tick();
  }
}
function choose(radius: number) {
  const result =
    message.rocks.find((rockGeneration) => !rockGeneration.down && rockGeneration.r === radius) ||
    message.rocks.find(
      (rockGeneration) =>
        !rockGeneration.down && stageCount(rockGeneration.r) === stageCount(radius),
    );
  assert.ok(result);
  return result;
}
function setup(weapon: number, rockGeneration: SavedRockGeneration) {
  const shipEntity = requiredFixtureValue(session).ent;
  rockGeneration.x = 100000 + Math.abs(rockGeneration.id) * 1000;
  rockGeneration.y = 100000;
  requiredFixtureValue(shipEntity).guns = []; // Use actual weapon parameters and production Space.fire rather than trusted contact messages.
  const weapon3 = game2.A.weapons[weapon];
  return import('../shared/rules.ts').then(({ weaponParams }) => {
    const weaponMount = mockWeaponMount({
      w: weapon,
      n: 1,
      p: weaponParams(weapon3),
      cd: 0,
      ammo: Infinity,
      snd: 'laser',
      sec: false,
      sndT: 0,
    });
    requiredFixtureValue(shipEntity).guns = [weaponMount];
    requiredFixtureValue(shipEntity).x = rockGeneration.x + rockGeneration.r + 100;
    requiredFixtureValue(shipEntity).y = rockGeneration.y;
    requiredFixtureValue(shipEntity).a = -Math.PI / 2;
    requiredFixtureValue(shipEntity).vx = requiredFixtureValue(shipEntity).vy = 0;
    requiredFixtureValue(shipEntity).inp = {};
    requiredFixtureValue(requiredFixtureValue(shipEntity).player).lastInput = null;
    rockGeneration.seam = 0;
    return weaponMount;
  });
}
function invariant(rockGeneration: SavedRockGeneration) {
  const feature = requiredFixtureValue(game2.db.world.mining).systems.meridian;
  const floating = feature.parcels
    .filter((message2) => message2.it.generationKey === rockGeneration.key)
    .reduce(
      (quantity, message2) =>
        quantity +
        Object.values(message2.it.remainingLots).reduce(
          (firstValue, secondValue) => firstValue + secondValue,
          0,
        ),
      0,
    );
  if (rockGeneration.budget >= 0)
    assert.equal(
      rockGeneration.accepted +
        floating +
        rockGeneration.pending +
        rockGeneration.expired +
        rockGeneration.discarded,
      rockGeneration.budget,
    );
  assertLots(
    requiredFixtureValue(session).data.cargo,
    requiredFixtureValue(session).data.cargoLots,
  );
}
assert.deepEqual([stageCount(20), stageCount(30), stageCount(44)], [1, 2, 3]);
for (const ticksPerSecond of [30, 60]) {
  let work = 0;
  for (let index = 0; index < ticksPerSecond * 3; index++)
    work += contactTime(
      [
        { from: 0, to: 3, seam: true },
        { from: 1, to: 2, seam: false },
      ],
      index / ticksPerSecond,
      (index + 1) / ticksPerSecond,
    ).seconds;
  assert.ok(Math.abs(work - 3) < 1e-10);
}
assert.deepEqual(rollGrades(100, true, randomOf(42)), rollGrades(100, true, randomOf(42)));
console.log(
  'Deterministic grading/stage thresholds; contact union invariant at30/60Hz helper rates.',
);
// Real beams: latch readiness without immediate payout; maintain contact until clean heat, release once.
for (const weapon of [9101, 9102]) {
  const rockGeneration = choose(20);
  const before = message.loot.length;
  const weaponMount = await setup(weapon, rockGeneration);
  for (let index = 0; index < 100; index++) {
    game2.features.mining.advanceClock(simulationStepSeconds);
    message.t += simulationStepSeconds;
    message.fire(
      requiredFixtureValue(session).ent,
      weaponMount,
      null,
      requiredFixtureValue(requiredFixtureValue(session).ent).a,
    );
    game2.features.mining.endTick(message);
  }
  assert.ok(rockGeneration.ready);
  assert.ok(rockGeneration.heat >= 60 && rockGeneration.heat <= 80);
  assert.equal(message.loot.length, before);
  const hitPoints = rockGeneration.hp;
  const work = rockGeneration.work;
  message.fire(
    requiredFixtureValue(session).ent,
    weaponMount,
    null,
    requiredFixtureValue(requiredFixtureValue(session).ent).a,
  );
  message.fire(
    requiredFixtureValue(session).ent,
    weaponMount,
    null,
    requiredFixtureValue(requiredFixtureValue(session).ent).a,
  );
  game2.features.mining.endTick(message);
  assert.equal(rockGeneration.hp, hitPoints, 'duplicate beam frame suppressed');
  assert.equal(rockGeneration.work, work, 'same-time duplicate cannot advance work');
  step(8);
  assert.equal(rockGeneration.stage, 1);
  assert.ok(rockGeneration.down);
  invariant(rockGeneration);
}
console.log(
  'Both real beam weapons reach ready then clean release; duplicate frames cannot mint work/reward.',
);
// Fresh rock for actual Tapper flight/cadence, with deliberate cooling breaks before overheat.
const tapperRock = choose(30),
  weaponMount = await setup(181, tapperRock);
let fired = 0,
  cooling = false;
for (let index = 0; index < 2400 && tapperRock.stage === 0; index++) {
  if (!tapperRock.ready && tapperRock.heat >= 45) cooling = true;
  if (cooling && tapperRock.heat < 1) cooling = false;
  if (index % 22 === 0 && (!cooling || tapperRock.ready) && tapperRock.heat < 64) {
    message.fire(
      requiredFixtureValue(session).ent,
      weaponMount,
      null,
      requiredFixtureValue(requiredFixtureValue(session).ent).a,
    );
    fired++;
  }
  step();
}
assert.ok(fired > 1);
assert.equal(tapperRock.stage, 1, 'Tapper clean/ordinary release succeeds through real cadence');
assert.equal(tapperRock.lastCut, 'clean', 'Tapper clean release attainable');
assert.equal(tapperRock.penalty, false, 'controlled Tapper work avoids overheat');
invariant(tapperRock);
console.log(
  'Real projectile Tapper cadence/travel creates bounded contact leases and a staged parcel.',
);
// Same real departed-source Tapper collision, sampled populated vs quiet. A
// threshold reached during a lease must survive cooling before the next sample.
async function tapperSampling(quiet: boolean, ready: boolean) {
  const game_ = game(),
    session = pilot(game_, `Heat${quiet}${ready}`),
    space = miningSpace(game_.spaces.meridian);
  space.ships = new Map([
    [requiredFixtureValue(requiredFixtureValue(session).ent).id, requiredFixtureValue(session).ent],
  ]);
  const rock = space.rocks.find((rockGeneration) => stageCount(rockGeneration.r) === 2);
  requiredFixtureValue(rock).x = 100000;
  requiredFixtureValue(rock).y = 100000;
  requiredFixtureValue(rock).seam = 0;
  requiredFixtureValue(rock).hp = ready ? 1 : requiredFixtureValue(rock).max;
  const { weaponParams } = await import('../shared/rules.ts');
  const weapon = mockWeaponMount({
    w: 181,
    n: 1,
    p: weaponParams(game_.A.weapons[181]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  });
  const entity = requiredFixtureValue(session).ent;
  requiredFixtureValue(entity).x =
    requiredFixtureValue(rock).x + requiredFixtureValue(rock).r + 100;
  requiredFixtureValue(entity).y = requiredFixtureValue(rock).y;
  requiredFixtureValue(entity).a = -Math.PI / 2;
  requiredFixtureValue(entity).guns = [weapon];
  space.fire(entity, weapon, null, requiredFixtureValue(entity).a);
  const shot = space.shots.at(-1);
  space.ships.delete(requiredFixtureValue(entity).id); // Captured real provenance survives departure.
  for (
    let index = 0;
    index < 30 &&
    !Object.hasOwn(
      requiredFixtureValue(rock).seen,
      requiredFixtureValue(requiredFixtureValue(shot).mining).contactId,
    );
    index++
  ) {
    game_.features.mining.advanceClock(simulationStepSeconds);
    space.tick();
  }
  assert.ok(
    Object.hasOwn(
      requiredFixtureValue(rock).seen,
      requiredFixtureValue(requiredFixtureValue(shot).mining).contactId,
    ),
  );
  assert.equal(
    requiredFixtureValue(rock).captain,
    game_.db.key(requiredFixtureValue(requiredFixtureValue(session).name)),
  );
  assert.equal(requiredFixtureValue(rock).ready, ready);
  requiredFixtureValue(rock).heat = 87;
  requiredFixtureValue(rock).work = 3;
  for (let index = 1; index <= 30; index++) {
    game_.features.mining.advanceClock(simulationStepSeconds);
    if (!quiet || index % 15 === 0) game_.features.mining.endTick(space);
  }
  assert.equal(requiredFixtureValue(rock).penalty, true, 'crossing remains latched after cooling');
  assert.equal(requiredFixtureValue(rock).stage, ready ? 1 : 0);
  if (ready) assert.equal(requiredFixtureValue(rock).lastCut, 'overheat');
  else {
    assert.equal(
      requiredFixtureValue(rock).budget,
      -1,
      'not-ready crossing does not freeze rewards early',
    );
    assert.equal(requiredFixtureValue(rock).discarded, 0);
    game_.features.mining.ordinary(space, requiredFixtureValue(rock), 1e9);
  }
  const discarded = requiredFixtureValue(rock).discarded;
  assert.ok(discarded > 0, 'one prospective penalty applied');
  while (requiredFixtureValue(rock).stage < requiredFixtureValue(rock).stages)
    game_.features.mining.ordinary(space, requiredFixtureValue(rock), 1e9);
  assert.equal(
    requiredFixtureValue(rock).discarded,
    discarded,
    'later stage cannot reapply penalty',
  );
  const parcels = requiredFixtureValue(game_.db.world.mining).systems.meridian.parcels.filter(
    (message2) => message2.it.generationKey === requiredFixtureValue(rock).key,
  );
  const floating = parcels.reduce(
    (quantity, message2) =>
      quantity +
      Object.values(message2.it.remainingLots).reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      ),
    0,
  );
  assert.equal(
    requiredFixtureValue(rock).accepted +
      floating +
      requiredFixtureValue(rock).pending +
      requiredFixtureValue(rock).expired +
      discarded,
    requiredFixtureValue(rock).budget,
  );
  return {
    discarded,
    budget: requiredFixtureValue(rock).budget,
    floating,
    grades: parcels.map((message2) => message2.it.remainingLots),
    penalty: requiredFixtureValue(rock).penalty,
    penaltyApplied: requiredFixtureValue(rock).penaltyApplied,
    stage: requiredFixtureValue(rock).stage,
    lastCut: requiredFixtureValue(rock).lastCut,
  };
}
for (const ready of [true, false])
  assert.deepEqual(await tapperSampling(true, ready), await tapperSampling(false, ready));
console.log(
  'Real departed Tapper threshold crossings agree at30Hz and quiet0.5s, ready and not-ready; one penalty and conserved mass.',
);
// Replay two real Tapper impacts exactly one second apart. The first ready
// stage's release deadline must settle before the later collision is admitted.
async function separatedTapper(quiet: boolean, secondBeam = false) {
  const fixtureGame = game(),
    fixtureSession = pilot(fixtureGame, `Separated${quiet}${secondBeam}`),
    space = miningSpace(fixtureGame.spaces.meridian);
  space.ships = new Map([
    [
      requiredFixtureValue(requiredFixtureValue(fixtureSession).ent).id,
      requiredFixtureValue(fixtureSession).ent,
    ],
  ]);
  const result = space.rocks.find((rock) => stageCount(rock.r) === 2),
    shipEntity = requiredFixtureValue(fixtureSession).ent;
  requiredFixtureValue(result).x = 100000;
  requiredFixtureValue(result).y = 100000;
  requiredFixtureValue(result).seam = 0;
  requiredFixtureValue(result).hp = 1;
  const { weaponParams } = await import('../shared/rules.ts');
  const weaponMount2 = mockWeaponMount({
    w: 181,
    n: 1,
    p: weaponParams(fixtureGame.A.weapons[181]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  });
  requiredFixtureValue(shipEntity).x =
    requiredFixtureValue(result).x + requiredFixtureValue(result).r + 100;
  requiredFixtureValue(shipEntity).y = requiredFixtureValue(result).y;
  requiredFixtureValue(shipEntity).a = -Math.PI / 2;
  requiredFixtureValue(shipEntity).vx = requiredFixtureValue(shipEntity).vy = 0;
  requiredFixtureValue(shipEntity).inp = {};
  requiredFixtureValue(shipEntity).guns = [];
  space.fire(shipEntity, weaponMount2, null, requiredFixtureValue(shipEntity).a);
  const first = space.shots.at(-1);
  let flight = 0;
  while (
    !Object.hasOwn(
      requiredFixtureValue(result).seen,
      requiredFixtureValue(requiredFixtureValue(first).mining).contactId,
    ) &&
    flight < 30
  ) {
    fixtureGame.features.mining.advanceClock(simulationStepSeconds);
    space.tick();
    flight++;
  }
  assert.ok(requiredFixtureValue(result).ready);
  assert.ok(flight < 30);
  requiredFixtureValue(result).heat = 65;
  requiredFixtureValue(result).work = 2;
  const start = requiredFixtureValue(fixtureGame.db.world.mining).clock,
    endTick = fixtureGame.features.mining.endTick;
  let frame = 0,
    second;
  fixtureGame.features.mining.endTick = (fixtureSpace) => {
    if (!quiet || frame % 15 === 0) endTick(fixtureSpace);
  };
  for (frame = 1; frame <= 75; frame++) {
    if (!secondBeam && frame === 31 - flight) {
      space.fire(shipEntity, weaponMount2, null, requiredFixtureValue(shipEntity).a);
      second = space.shots.at(-1);
    }
    fixtureGame.features.mining.advanceClock(simulationStepSeconds);
    if (secondBeam && frame === 30)
      space.fire(
        shipEntity,
        { ...weaponMount2, w: 9101, p: weaponParams(fixtureGame.A.weapons[9101]) },
        null,
        requiredFixtureValue(shipEntity).a,
      );
    space.tick();
    if (frame === 30 && !secondBeam) {
      assert.ok(
        Object.hasOwn(
          requiredFixtureValue(result).seen,
          requiredFixtureValue(requiredFixtureValue(second).mining).contactId,
        ),
        'second real impact at1s',
      );
      assert.ok(
        Math.abs(
          requiredFixtureValue(result).seen[
            requiredFixtureValue(requiredFixtureValue(second).mining).contactId
          ] -
            start -
            1,
        ) < 1e-9,
      );
    }
  }
  assert.equal(requiredFixtureValue(result).stage, 1);
  assert.equal(requiredFixtureValue(result).lastCut, 'clean');
  assert.equal(
    requiredFixtureValue(result).ready,
    false,
    'later shot belongs to next stage, not old readiness',
  );
  assert.ok(
    requiredFixtureValue(result).hp < requiredFixtureValue(result).max &&
      requiredFixtureValue(result).hp > 0,
  );
  const parcels = requiredFixtureValue(fixtureGame.db.world.mining).systems.meridian.parcels.filter(
      (message2) => message2.it.generationKey === requiredFixtureValue(result).key,
    ),
    lots = parcels.map((message2) => message2.it.remainingLots),
    floating = lots.reduce(
      (quantity, gradeLots) =>
        quantity +
        Object.values(gradeLots).reduce((firstValue, secondValue) => firstValue + secondValue, 0),
      0,
    );
  assert.equal(
    requiredFixtureValue(result).accepted +
      floating +
      requiredFixtureValue(result).pending +
      requiredFixtureValue(result).expired +
      requiredFixtureValue(result).discarded,
    requiredFixtureValue(result).budget,
  );
  return {
    stage: requiredFixtureValue(result).stage,
    lastCut: requiredFixtureValue(result).lastCut,
    ready: requiredFixtureValue(result).ready,
    hp: requiredFixtureValue(result).hp,
    work: requiredFixtureValue(result).work,
    heat: requiredFixtureValue(result).heat,
    lots,
    budget: requiredFixtureValue(result).budget,
    floating,
    pending: requiredFixtureValue(result).pending,
  };
}
for (const beam of [false, true]) {
  const quietSeparated = await separatedTapper(true, beam),
    fineSeparated = await separatedTapper(false, beam);
  for (const propertyKey of ['heat', 'work'] as const) {
    assert.ok(
      Math.abs(quietSeparated[propertyKey] - fineSeparated[propertyKey]) < 1e-9,
      `${beam ? 'beam' : 'Tapper'} ${propertyKey} sampling parity`,
    );
    Reflect.deleteProperty(quietSeparated, propertyKey);
    Reflect.deleteProperty(fineSeparated, propertyKey);
  }
  assert.deepEqual(quietSeparated, fineSeparated);
}
console.log(
  'Separated real Tapper-to-Tapper and Tapper-to-beam contacts settle old clean release and preserve first-frame next-stage work at populated/quiet cadence.',
);
// Early release retains HP/work, no parcel; target switching cannot reset rock state.
const early = choose(44),
  heavy = await setup(9102, early);
const initial = early.hp;
game2.features.mining.advanceClock(simulationStepSeconds);
message.t += simulationStepSeconds;
message.fire(
  requiredFixtureValue(session).ent,
  heavy,
  null,
  requiredFixtureValue(requiredFixtureValue(session).ent).a,
);
game2.features.mining.endTick(message);
const earlyWork = early.work;
assert.ok(early.hp < initial);
step(10);
assert.ok(early.work >= earlyWork);
assert.equal(early.stage, 0);
assert.ok(!early.ready);
const savedWork = early.work;
const beforeHeat = early.heat;
game2.features.mining.advanceClock(1);
game2.features.mining.endTick(message);
assert.equal(early.work, savedWork);
assert.equal(early.heat, Math.max(0, beforeHeat - 10));
// Overheat has a single prospective penalty over all stages.
for (let index = 0; index < 160; index++) {
  game2.features.mining.advanceClock(simulationStepSeconds);
  message.t += simulationStepSeconds;
  message.fire(
    requiredFixtureValue(session).ent,
    heavy,
    null,
    requiredFixtureValue(requiredFixtureValue(session).ent).a,
  );
  game2.features.mining.endTick(message);
}
assert.ok(early.penalty);
const discarded = early.discarded;
assert.ok(discarded > 0);
for (let stage = early.stage; stage < early.stages; stage++) {
  game2.features.mining.ordinary(message, early, 1e9);
  invariant(early);
}
assert.equal(early.discarded, discarded);
assert.equal(early.pending, 0);
// Partial pickups: the real onLoot path debits fixed lots; collectors/bonuses cannot reroll.
const parcel = message.loot.find((message2) => message2.it.generationKey === early.key);
assert.ok(parcel);
const original = structuredClone(parcel.it.remainingLots);
clearLots(requiredFixtureValue(session).data.cargo, requiredFixtureValue(session).data.cargoLots);
const capacity = requiredFixtureValue(
  game2.features.shipStats.stats(requiredFixtureValue(session).data),
).cargo;
requiredFixtureValue(session).data.cargo.food = capacity;
assert.equal(game2.onLoot(game2.pref(session), parcel.it), false);
assert.deepEqual(parcel.it.remainingLots, original);
requiredFixtureValue(session).data.cargo.food = capacity - 1;
const mined = requiredFixtureValue(session).data.stats.mined || 0;
game2.onLoot(game2.pref(session), parcel.it);
assert.equal(requiredFixtureValue(session).data.stats.mined, mined + 1);
invariant(early);
delete requiredFixtureValue(session).data.cargo.food;
game2.onLoot(game2.pref(session), parcel.it);
const remaining = Object.values(requiredFixtureValue(parcel.it.remainingLots)).reduce(
  (firstValue, secondValue) => firstValue + secondValue,
  0,
);
if (!remaining) {
  const mined2 = requiredFixtureValue(session).data.stats.mined;
  game2.onLoot(game2.pref(session), parcel.it);
  assert.equal(requiredFixtureValue(session).data.stats.mined, mined2);
}
invariant(early);
console.log(
  'Early release/target persistence, prospective overheat once, partial/full holds, repeated collection conserve lots.',
);
// Original economic progression opportunities are shared across clusters/stages/retries.
const tokenRock = choose(30);
let opportunities = 0;
const onMine = game2.features.specialists.specOnMine;
game2.features.specialists.specOnMine = () => {
  opportunities++;
};
clearLots(requiredFixtureValue(session).data.cargo, requiredFixtureValue(session).data.cargoLots);
for (let index = 0; index < tokenRock.stages; index++)
  game2.features.mining.ordinary(message, tokenRock, 1e9);
for (const message2 of [
  ...requiredFixtureValue(game2.db.world.mining).systems.meridian.parcels,
].filter((message3) => message3.it.generationKey === tokenRock.key)) {
  game2.onLoot(game2.pref(session), message2.it);
  game2.onLoot(game2.pref(session), message2.it);
  invariant(tokenRock);
}
assert.equal(
  opportunities,
  tokenRock.tokens.length,
  'visual splits preserve original opportunity count',
);
game2.features.specialists.specOnMine = onMine;
// Duplicate projectile evidence is denied, and its captured captain survives source departure.
const departed = choose(44),
  departedGun = await setup(181, departed);
message.fire(
  requiredFixtureValue(session).ent,
  departedGun,
  null,
  requiredFixtureValue(requiredFixtureValue(session).ent).a,
);
const shot = message.shots.at(-1);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(shot).mining).captain,
  game2.db.key(requiredFixtureValue(requiredFixtureValue(session).name)),
);
message.ships.delete(requiredFixtureValue(requiredFixtureValue(session).ent).id);
for (
  let index = 0;
  index < 30 && !departed.seen[requiredFixtureValue(requiredFixtureValue(shot).mining).contactId];
  index++
)
  step();
assert.ok(
  Object.hasOwn(departed.seen, requiredFixtureValue(requiredFixtureValue(shot).mining).contactId),
);
assert.equal(
  departed.captain,
  game2.db.key(requiredFixtureValue(requiredFixtureValue(session).name)),
);
const shotHP = departed.hp;
game2.features.mining.contact(message, departed, {
  source: requiredFixtureValue(requiredFixtureValue(shot).mining),
  damage: 999,
  x: departed.x,
  y: departed.y,
  projectile: true,
});
assert.equal(departed.hp, shotHP, 'same shot cannot debit HP twice');
message.ships.set(
  requiredFixtureValue(requiredFixtureValue(session).ent).id,
  requiredFixtureValue(session).ent,
);
// Fully exhausted generations roll over once; old floating parcels expire, never remint.
const oldKey = tokenRock.key,
  oldId = tokenRock.id,
  regrow = tokenRock.down;
while (requiredFixtureValue(game2.db.world.mining).clock <= regrow)
  game2.features.mining.advanceClock(
    Math.min(1, regrow - requiredFixtureValue(game2.db.world.mining).clock + 0.01),
  );
game2.features.mining.endTick(message);
const next = message.rocks.find(
  (rockGeneration) =>
    rockGeneration.key === oldKey.replace(/:\d+$/, ':' + (tokenRock.generation + 1)),
);
assert.ok(next);
assert.notEqual(next.id, oldId);
assert.equal(next.generation, tokenRock.generation + 1);
assert.equal(next.budget, -1);
assert.equal(next.work, 0);
assert.equal(next.heat, 0);
for (const rockGeneration of requiredFixtureValue(game2.db.world.mining).systems.meridian.history)
  invariant(rockGeneration);
console.log(
  'Shared original progression tokens, captured departed-source projectile attribution/deduplication, generation rollover and expiry conservation passed.',
);
// Repeated production regrowth with accepted/TTL-settled ledgers is bounded.
// Keep one original generation alive through many faster regrowth cycles, then
// collect it exactly once through onLoot; unrelated old ledgers must not pin it.
{
  const fixtureGame = game(),
    fixtureSession = pilot(fixtureGame, 'History'),
    space = miningSpace(fixtureGame.spaces.meridian),
    field = requiredFixtureValue(fixtureGame.db.world.mining).systems.meridian;
  const first = space.rocks.find((rockGeneration) => stageCount(rockGeneration.r) === 1);
  const slot = field.rocks.indexOf(requiredFixtureValue(first));
  const mods = fixtureGame.features.fronts.mods;
  fixtureGame.features.fronts.mods = (...args) => ({ ...mods(...args), regrow: 100 });
  function advanceTo(time: number) {
    while (requiredFixtureValue(fixtureGame.db.world.mining).clock < time)
      fixtureGame.features.mining.advanceClock(
        Math.min(1, time - requiredFixtureValue(fixtureGame.db.world.mining).clock),
      );
    fixtureGame.features.mining.endTick(space);
  }
  function exhaust(result: SavedRockGeneration | undefined) {
    while (!requiredFixtureValue(result).down)
      fixtureGame.features.mining.ordinary(space, requiredFixtureValue(result), 1e9);
    const floating = field.parcels
      .filter((message2) => message2.it.generationKey === requiredFixtureValue(result).key)
      .reduce(
        (quantity, message2) =>
          quantity +
          Object.values(message2.it.remainingLots).reduce(
            (firstValue, secondValue) => firstValue + secondValue,
            0,
          ),
        0,
      );
    assert.equal(
      requiredFixtureValue(result).accepted +
        floating +
        requiredFixtureValue(result).expired +
        requiredFixtureValue(result).discarded +
        requiredFixtureValue(result).pending,
      requiredFixtureValue(result).budget,
    );
  }
  exhaust(first);
  const originalBudget = requiredFixtureValue(first).budget;
  const originalParcels = field.parcels.filter(
    (message2) => message2.it.generationKey === requiredFixtureValue(first).key,
  );
  advanceTo(requiredFixtureValue(first).down + 0.001);
  for (let cycle = 0; cycle < 32; cycle++) {
    const rockGeneration = field.rocks[slot];
    exhaust(rockGeneration);
    const parcels = field.parcels.filter(
      (message2) => message2.it.generationKey === rockGeneration.key,
    );
    if (cycle < 24 || cycle % 2) {
      clearLots(
        requiredFixtureValue(fixtureSession).data.cargo,
        requiredFixtureValue(fixtureSession).data.cargoLots,
      );
      for (const message2 of parcels)
        fixtureGame.onLoot(fixtureGame.pref(fixtureSession), message2.it);
    } else {
      // Production TTL processing; leave the deliberately live old parcels intact.
      advanceTo(Math.max(...parcels.map((message2) => message2.expires)) + 0.001);
    }
    if (requiredFixtureValue(fixtureGame.db.world.mining).clock < rockGeneration.down)
      advanceTo(rockGeneration.down + 0.001);
    else fixtureGame.features.mining.endTick(space);
    if (cycle >= 24 && cycle % 2 === 0)
      assert.equal(
        rockGeneration.expired,
        rockGeneration.budget,
        'real TTL settles the whole uncollected generation',
      );
    assert.equal(rockGeneration.pending, 0);
    assert.equal(
      rockGeneration.accepted + rockGeneration.expired + rockGeneration.discarded,
      rockGeneration.budget,
    );
    assert.ok(!field.history.some((rockGeneration2) => rockGeneration2.key === rockGeneration.key));
    assert.ok(
      field.history.length <= (cycle < 24 ? 1 : 0),
      'settled history cannot grow per regrowth',
    );
    if (cycle < 24) {
      assert.ok(
        field.history.includes(requiredFixtureValue(first)),
        'live original parcels pin their ledger',
      );
      assert.equal(requiredFixtureValue(first).accepted + requiredFixtureValue(first).expired, 0);
    }
    if (cycle === 23) {
      clearLots(
        requiredFixtureValue(fixtureSession).data.cargo,
        requiredFixtureValue(fixtureSession).data.cargoLots,
      );
      const mined = requiredFixtureValue(fixtureSession).data.stats.mined || 0;
      for (const message2 of originalParcels)
        fixtureGame.onLoot(fixtureGame.pref(fixtureSession), message2.it);
      assert.equal(requiredFixtureValue(fixtureSession).data.stats.mined, mined + originalBudget);
      for (const message2 of originalParcels)
        fixtureGame.onLoot(fixtureGame.pref(fixtureSession), message2.it);
      assert.equal(
        requiredFixtureValue(fixtureSession).data.stats.mined,
        mined + originalBudget,
        'old generation accepted once',
      );
      assert.equal(requiredFixtureValue(first).accepted, originalBudget);
      fixtureGame.features.mining.endTick(space);
      assert.equal(field.history.length, 0);
      fixtureGame.db.touch();
      fixtureGame.db.flush();
      const reloaded = game(new Database(fixtureGame.db.dir));
      assert.equal(
        requiredFixtureValue(reloaded.db.world.mining).systems.meridian.history.length,
        0,
      );
    }
  }
}
console.log(
  '32 real regrowth/collection/TTL cycles retain only live generations, collectible exactly once with conserved original budget.',
);
// Survey private bounded snapshots; unknown authority fields, landed/dead/paused/cooldown denied.
assert.equal(game2.features.mining.survey(session, { t: 'mining', op: 'survey', n: 99 }), false);
assert.equal(game2.features.mining.survey(session, { t: 'mining', op: 'survey' }), true);
const privateState = game2.features.mining.payload(session, message);
assert.ok(privateState.revealed.length > 0);
assert.equal(game2.features.mining.survey(session, { t: 'mining', op: 'survey' }), false);
const clock = requiredFixtureValue(game2.db.world.mining).clock;
game2.paused = true;
game2.tick();
assert.equal(requiredFixtureValue(game2.db.world.mining).clock, clock);
game2.paused = false;
// Sleep/reopen and clean DB restart preserve exact geometry/work/budget/parcel remainders.
game2.features.mining.endTick(message);
const records = JSON.stringify(requiredFixtureValue(game2.db.world.mining).systems.meridian);
game2.sleep(message);
const reopened = miningSpace(game2.spaces.meridian);
assert.equal(JSON.stringify(requiredFixtureValue(game2.db.world.mining).systems.meridian), records);
game2.db.touch();
game2.db.flush();
const reloadedGame = game(new Database(game2.db.dir));
const reopenedSpace = miningSpace(reloadedGame.spaces.meridian);
assert.equal(reopenedSpace.rocks[0].key, reopened.rocks[0].key);
assert.equal(reopenedSpace.rocks[0].x, reopened.rocks[0].x);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(reloadedGame.db.get('Cutter')).miningSurvey)
    .cooldownUntil,
  requiredFixtureValue(requiredFixtureValue(session).data.miningSurvey).cooldownUntil,
);
const corrupt = structuredClone(reloadedGame.db.world.mining);
Reflect.set(requiredFixtureValue(corrupt), 'version', 99);
reloadedGame.db.world.mining = corrupt;
assert.throws(() => reloadedGame.features.mining.init(), /Invalid mining/);
assert.equal(requiredFixtureValue(reloadedGame.db.world.mining).version, 99);
for (const mutate of [
  (rockGeneration: SavedRockGeneration) => (rockGeneration.releaseHeat = NaN),
  (rockGeneration: SavedRockGeneration) => Reflect.set(rockGeneration, 'ready', 'yes'),
  (rockGeneration: SavedRockGeneration) => (rockGeneration.id = 0),
  (rockGeneration: SavedRockGeneration) =>
    (rockGeneration.leases = [{ from: 0, to: 99, seam: true }]),
  (rockGeneration: SavedRockGeneration) => (rockGeneration.seen = { bad: Infinity }),
]) {
  const invalidValue = structuredClone(game2.db.world.mining);
  mutate(requiredFixtureValue(invalidValue).systems.meridian.rocks[0]);
  reloadedGame.db.world.mining = invalidValue;
  assert.throws(
    () => reloadedGame.features.mining.init(),
    /Invalid mining/,
    'malformed save rejected before mutation',
  );
}

console.log(
  'Survey denial/private reveal, pause clock, sleep/reload identity and corrupt version fail-closed.',
);
// Real torn-checkpoint fault after players rename but before world rename; recovery rolls BOTH forward.
const directory = tempDataDir('rift-mining-checkpoint-'),
  database2 = new Database(directory);
database2.players = structuredClone(game2.db.players);
database2.world = structuredClone(game2.db.world);
database2.touch();
database2.flush();
const before = requiredFixtureValue(database2.get('Cutter')).cargo.ore || 0;
requiredFixtureValue(database2.get('Cutter')).cargo.ore = before + 1;
requiredFixtureValue(database2.world.mining).clock += 7;
const expectedClock = requiredFixtureValue(database2.world.mining).clock;
database2.touch();
const rename = filesystem.renameSync;
try {
  filesystem.renameSync = (source2, destination) => {
    if (destination === database2.wfile) throw new Error('injected between snapshot renames');
    return rename(source2, destination);
  };
  assert.throws(() => database2.flush(), /injected/);
} finally {
  filesystem.renameSync = rename;
}
assert.ok(filesystem.existsSync(database2.journal));
assert.throws(() => database2.flush(), /requires recovery/);
const recovered = new Database(directory);
assert.equal(requiredFixtureValue(recovered.get('Cutter')).cargo.ore, before + 1);
assert.equal(requiredFixtureValue(recovered.world.mining).clock, expectedClock);
assert.ok(!filesystem.existsSync(recovered.journal));
console.log(
  'Committed journal recovers both snapshots after injected fault between player/world renames.',
);
console.log('ALL MINING PRODUCTION TESTS PASSED');
