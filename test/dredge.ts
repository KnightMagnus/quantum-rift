import { mockMission, mockWeaponMount } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { dredgePilot, control, industrialStep, seed, lots } from './helpers/dredge-fixture.ts';
import { SPECIALISTS, BUILD, SPEC, BP_NEED, specPower } from '../shared/specialty.ts';
import { STELLARS } from '../shared/galaxy.ts';
const feature = dredgePilot(),
  { g: game, s: session, sp: space } = feature,
  playerData = requiredFixtureValue(session).data;
assert.equal(game.A.ships[815].cost, 2400000);
assert.equal(game.A.ships[815].cargo, 400);
assert.equal(game.A.ships[815].role, 'survey');
assert.equal(game.A.ships[815].fuelRe, 0);

// Preserve every legacy constructor price, not a regenerated roster snapshot.

assert.deepEqual(
  SPECIALISTS.filter((shipHull) => shipHull.id !== 815).map((shipHull) => shipHull.cost),
  [980000, 1190000, 1540000, 1820000, 1680000, 1400000, 1330000, 2100000, 1260000, 1960000],
);
assert.equal(SPEC[805].cost, 980000);
assert.equal(SPECIALISTS.filter((shipHull) => shipHull.id !== 815).length, 10);
const _normalBonus = game.features.bonuses.bonus(playerData).miningPct;
const other = dredgePilot(undefined, 'Precision', 805);
requiredFixtureValue(other.s).data.specState[805] = { tier: 5, comp: { special: 5 } };
assert.ok(
  other.g.features.bonuses.bonus(requiredFixtureValue(other.s).data).miningPct >=
    200 * specPower(requiredFixtureValue(other.s).data.specState[805]),
);
// Actual build requires normal fragments/materials/T3, no plasma; job cargo/passengers checked.
game.dropEscorts(space, requiredFixtureValue(session).ent);
space.remove(requiredFixtureValue(session).ent);
Reflect.set(requiredFixtureValue(session), 'ent', null);
const home =
  Object.values(STELLARS).find(
    (stellarBody) => stellarBody.site && stellarBody.system === 'meridian',
  ) || Object.values(STELLARS).find((stellarBody) => stellarBody.site);
playerData.sys = requiredFixtureValue(home).system;
playerData.stellar = requiredFixtureValue(home).id;
playerData.station.site = requiredFixtureValue(home).id;
playerData.station.ops = BUILD.ops;
game.db.world.sites[requiredFixtureValue(home).id] = playerData.name;
playerData.bp[815] = BP_NEED;
for (const [commodityId, grade, quantity] of BUILD.mats) {
  playerData.mats[commodityId] ??= [0, 0, 0, 0, 0];
  playerData.mats[commodityId][grade] = quantity;
}
seed(playerData, {});
const credits = playerData.credits,
  trade = game.tradeIn(playerData);
const formerMissions = playerData.missions;
playerData.missions = [mockMission({ type: 'cargo', qty: 401 })];
game.features.specialists.specOp(session, { t: 'spec', op: 'build', id: 815 });
assert.equal(playerData.bp[815], BP_NEED);
assert.equal(playerData.credits, credits, 'job cargo preserved on denied build');
playerData.missions = formerMissions;
game.features.specialists.specOp(session, { t: 'spec', op: 'build', id: 815 });
assert.equal(playerData.ship.hull, 815);
assert.equal(playerData.credits, credits - (2400000 - trade));
assert.equal(playerData.bp[815], 0);
assert.equal(playerData.cargo.plasma || 0, 0);
seed(playerData, { plasma: lots(5) });
game.features.specialists.specOp(session, { t: 'spec', op: 'parts', id: 815 });
assert.equal(playerData.cargo.plasma, 0);
assert.equal(playerData.parts[815], 1);
assert.equal(playerData.spec.plasma || 0, 0);
// Back to an actual Dredge flight with forward root work and finite original generation.
playerData.sys = 'meridian';
playerData.stellar = null;
game.spawnPlayer(session, 10000, 10000, 0, 0);
requiredFixtureValue(session).ent.guns = [];
const entity = requiredFixtureValue(session).ent;
requiredFixtureValue(entity).a = Math.PI / 2;
requiredFixtureValue(entity).vx = 80;
requiredFixtureValue(entity).vy = 0;
const result = space.rocks.find(
    (rockGeneration) => rockGeneration.stages === 1 && !rockGeneration.down,
  ),
  large = space.rocks.find((rockGeneration) => rockGeneration.stages > 1 && !rockGeneration.down);
requiredFixtureValue(result).x = requiredFixtureValue(entity).x + 120;
requiredFixtureValue(result).y = requiredFixtureValue(entity).y;
requiredFixtureValue(result).hp = requiredFixtureValue(result).max = 25;
requiredFixtureValue(large).x = requiredFixtureValue(entity).x + 130;
requiredFixtureValue(large).y = requiredFixtureValue(entity).y;
const hitPoints = requiredFixtureValue(large).hp;
control(feature, 'sweep');
industrialStep(feature, 1);
assert.equal(requiredFixtureValue(result).lastCut, 'sweep');
assert.equal(requiredFixtureValue(large).hp, hitPoints, 'intact multistage excluded');
const parcels = requiredFixtureValue(game.db.world.mining).systems.meridian.parcels.filter(
  (message) => message.it.generationKey === requiredFixtureValue(result).key,
);
assert.equal(
  parcels.reduce((quantity, message) => quantity + message.it.remainingLots.pure, 0),
  0,
);
assert.equal(
  parcels.reduce(
    (quantity, message) =>
      quantity +
      Object.values(message.it.remainingLots).reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      ),
    0,
  ) + requiredFixtureValue(result).accepted,
  requiredFixtureValue(result).budget,
);
assert.equal(
  [...space.ships.values()].filter(
    (shipEntity) => shipEntity.industrialRoot === requiredFixtureValue(entity).id,
  ).length,
  2,
);
const total = requiredFixtureValue(result).budget;
for (let index = 0; index < 2; index++)
  for (const message of parcels)
    game.onLoot(requiredFixtureValue(requiredFixtureValue(entity).player), message.it);
assert.ok(
  Object.values(playerData.cargo).reduce(
    (firstValue, secondValue) => firstValue + secondValue,
    0,
  ) <= total,
);
assert.ok(requiredFixtureValue(result).accepted <= total);
control(feature, 'off');
industrialStep(feature, 0.1);
assert.equal([...space.ships.values()].filter((shipEntity) => shipEntity.industrialRoot).length, 0);
// Wrong hull, forged authority and stationary sweep cannot mutate work.
const before = requiredFixtureValue(result).accepted;
control(feature, 'sweep', { heat: 0 });
assert.equal(requiredFixtureValue(playerData.ship.industrial).sweep, false);
assert.equal(requiredFixtureValue(result).accepted, before);
console.log(
  'Real no-plasma build/parts, legacy Lodestar, root sweep finite mass, multistage exclusion, two collectors and forged requests.',
);
// Real large-rock work in a nonspecialist earns one independent generation opportunity.
{
  const pilotFixture = dredgePilot(undefined, 'Blueprint', 704),
    { g: game3, s: session3, sp: message } = pilotFixture;
  const result2 = message.rocks.find((rockGeneration) => rockGeneration.stages > 1);
  requiredFixtureValue(result2).x = 100000;
  requiredFixtureValue(result2).y = 100000;
  requiredFixtureValue(result2).hp = requiredFixtureValue(result2).max = 1800;
  requiredFixtureValue(session3).ent.x =
    requiredFixtureValue(result2).x + requiredFixtureValue(result2).r + 100;
  requiredFixtureValue(session3).ent.y = requiredFixtureValue(result2).y;
  requiredFixtureValue(session3).ent.a = -Math.PI / 2;
  const { weaponParams } = await import('../shared/rules.ts');
  const weaponMount = mockWeaponMount({
    w: 9102,
    n: 1,
    p: weaponParams(game3.A.weapons[9102]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  });
  requiredFixtureValue(session3).ent.guns = [weaponMount];
  const random = Math.random;
  try {
    Math.random = () => 0;
    for (let index = 0; index < 1500 && !requiredFixtureValue(result2).down; index++) {
      game3.features.mining.advanceClock(1 / 30);
      message.t += 1 / 30;
      message.fire(
        requiredFixtureValue(session3).ent,
        weaponMount,
        null,
        requiredFixtureValue(session3).ent.a,
      );
      game3.features.mining.endTick(message);
    }
  } finally {
    Math.random = random;
  }
  assert.ok(requiredFixtureValue(result2).down);
  assert.equal(
    requiredFixtureValue(session3).data.bp[815],
    1,
    'one token, not per stage or visible parcel',
  );
  for (let index = 0; index < 10; index++) game3.features.mining.endTick(message);
  assert.equal(requiredFixtureValue(session3).data.bp[815], 1);
  const unworked = message.rocks.find(
    (rockGeneration) =>
      rockGeneration !== result2 && rockGeneration.stages > 1 && !rockGeneration.down,
  );
  const before = requiredFixtureValue(session3).data.bp[815];
  game3.features.mining.ordinary(
    message,
    requiredFixtureValue(unworked),
    requiredFixtureValue(unworked).hp,
    requiredFixtureValue(session3).data.name,
  );
  assert.equal(
    requiredFixtureValue(session3).data.bp[815],
    before,
    'ordinary damage without useful mining work grants no fragment',
  );
}
// Append-only industrial-field migration preserves original rock identity, heat and budget.
{
  const pilotFixture = dredgePilot(undefined, 'Migration'),
    { g: game2, sp: message } = pilotFixture,
    weapon = requiredFixtureValue(game2.db.world.mining).systems.meridian,
    allEntries = JSON.parse(weapon.config),
    previousState = allEntries.filter((field: { industrial?: boolean }) => !field.industrial);
  weapon.config = JSON.stringify(previousState);
  weapon.rocks = weapon.rocks.filter(
    (rockGeneration) => Number(rockGeneration.key.split(':')[1]) < previousState.length,
  );
  message.rocks = weapon.rocks;
  message.loot = [];
  const first = weapon.rocks[0];
  first.heat = 42;
  const identifier = first.id,
    budget = first.budget;
  game2.features.mining.openSpace(message);
  assert.equal(weapon.rocks[0].id, identifier);
  assert.equal(weapon.rocks[0].heat, 42);
  assert.equal(weapon.rocks[0].budget, budget);
  const count = weapon.rocks.length;
  game2.features.mining.openSpace(message);
  assert.equal(weapon.rocks.length, count, 'migration idempotent');
  assert.equal(
    weapon.rocks.filter(
      (rockGeneration) =>
        rockGeneration.r <= 23 && Number(rockGeneration.key.split(':')[1]) >= previousState.length,
    ).length,
    20,
  );
  const valid = weapon.config;
  weapon.config = JSON.stringify([
    { ...previousState[0], x: previousState[0].x + 1 },
    ...previousState.slice(1),
  ]);
  assert.throws(() => game2.features.mining.openSpace(message), /explicit migration/);
  weapon.config = valid;
}

// Useful-work provenance survives restart and cooperative contact; ordinary finishing
// damage never steals another captain's generation opportunity.
for (const restart of [false, true]) {
  let pilotFixture = dredgePilot(undefined, 'UsefulWorker', 704);
  const { refineryPilot, refineryGame } = await import('./helpers/refinery-fixture.ts');
  const { DB: Database } = await import('../server/db.ts');
  const finisher = refineryPilot(pilotFixture.g, 'OnlyFinisher');
  const result2 = pilotFixture.sp.rocks.find((rockGeneration) => rockGeneration.stages > 1);
  requiredFixtureValue(result2).hp = requiredFixtureValue(result2).max = 1800;
  for (let index = 0; index < 60; index++) {
    pilotFixture.g.features.mining.advanceClock(1 / 30);
    // Both useful contributors overlap: one opportunity, deterministic account order.
    for (const name of [
      requiredFixtureValue(pilotFixture.s).data.name,
      requiredFixtureValue(finisher).data.name,
    ]) {
      if (name === requiredFixtureValue(finisher).data.name && index >= 15) continue;
      pilotFixture.g.features.mining.contact(pilotFixture.sp, requiredFixtureValue(result2), {
        source: {
          captain: pilotFixture.g.db.key(name),
          source: 1,
          mount: 0,
          weapon: 9102,
          cadence: 1 / 30,
          contactId: `${name}-${index}`,
        },
        damage: 0.01,
        x: requiredFixtureValue(result2).x,
        y: requiredFixtureValue(result2).y,
        projectile: false,
      });
    }
    pilotFixture.g.features.mining.endTick(pilotFixture.sp);
  }
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(result2).dredgeContributors)[
      pilotFixture.g.db.key(requiredFixtureValue(finisher).data.name)
    ] < 1.5,
    true,
  );
  let game2 = pilotFixture.g,
    message = pilotFixture.sp,
    rock = result2;
  const workerName = requiredFixtureValue(pilotFixture.s).data.name,
    finisherName = requiredFixtureValue(finisher).data.name;
  if (restart) {
    game2.db.flush();
    game2 = refineryGame(new Database(game2.db.dir));
    const resumed = dredgePilot(game2, workerName, 704);
    message = resumed.sp;
    rock = message.rocks.find(
      (rockGeneration) => rockGeneration.key === requiredFixtureValue(result2).key,
    );
  }
  const random = Math.random;
  try {
    Math.random = () => 0;
    game2.features.mining.ordinary(
      message,
      requiredFixtureValue(rock),
      requiredFixtureValue(rock).hp,
      game2.db.key(finisherName),
    );
  } finally {
    Math.random = random;
  }
  assert.equal(requiredFixtureValue(game2.db.get(workerName)).bp[815], 1);
  assert.equal(requiredFixtureValue(game2.db.get(finisherName)).bp[815] || 0, 0);
  game2.features.mining.ordinary(
    message,
    requiredFixtureValue(rock),
    requiredFixtureValue(rock).hp,
    game2.db.key(finisherName),
  );
  assert.equal(
    requiredFixtureValue(game2.db.get(workerName)).bp[815],
    1,
    'once per generation, not once per stage',
  );
}

// Persisted provenance fails closed; legacy unattributed totals cannot mint a winner.
{
  const pilotFixture = dredgePilot(undefined, 'Provenance', 704),
    result2 = pilotFixture.sp.rocks.find((rockGeneration) => rockGeneration.stages > 1);
  requiredFixtureValue(result2).dredgeContributors = {
    [pilotFixture.g.db.key(requiredFixtureValue(pilotFixture.s).data.name)]: -1,
  };
  assert.throws(() => pilotFixture.g.features.mining.init(), /industrial mining contributors/);
  delete requiredFixtureValue(result2).dredgeContributors;
  requiredFixtureValue(result2).dredgeWork = 99;
  const random = Math.random;
  try {
    Math.random = () => 0;
    pilotFixture.g.features.mining.ordinary(
      pilotFixture.sp,
      requiredFixtureValue(result2),
      requiredFixtureValue(result2).hp,
      pilotFixture.g.db.key(requiredFixtureValue(pilotFixture.s).data.name),
    );
  } finally {
    Math.random = random;
  }
  assert.equal(requiredFixtureValue(pilotFixture.s).data.bp[815] || 0, 0);
}

// Actual industrial drones share their captain's jettison grace; no root bypass.
{
  const pilotFixture = dredgePilot(undefined, 'DroneGrace'),
    shipEntity = requiredFixtureValue(pilotFixture.s).ent;
  pilotFixture.sp.loot = [];
  for (const rock of pilotFixture.sp.rocks) rock.x = -100000;
  requiredFixtureValue(shipEntity).a = Math.PI / 2;
  requiredFixtureValue(shipEntity).vx = 80;
  seed(requiredFixtureValue(pilotFixture.s).data, { ore: { common: 0, rich: 0, pure: 2 } });
  pilotFixture.g.features.fleetcmd.jettison(pilotFixture.s, 'ore', 2);
  const parcel = pilotFixture.sp.loot.at(-1);
  Object.assign(requiredFixtureValue(parcel), {
    x: requiredFixtureValue(shipEntity).x + 80,
    y: requiredFixtureValue(shipEntity).y,
    vx: 0,
    vy: 0,
  });
  control(pilotFixture, 'sweep');
  industrialStep(pilotFixture, 1);
  const collectors = [...pilotFixture.sp.ships.values()].filter(
    (shipEntity2) => shipEntity2.industrialRoot === requiredFixtureValue(shipEntity).id,
  );
  assert.equal(collectors.length, 2);
  assert.ok(
    collectors.some(
      (shipEntity2) =>
        Math.hypot(
          shipEntity2.x - requiredFixtureValue(parcel).x,
          shipEntity2.y - requiredFixtureValue(parcel).y,
        ) < 35,
    ),
  );
  assert.equal(
    requiredFixtureValue(parcel).taken,
    undefined,
    'actual in-reach industrial collector cannot re-scoop owner dump',
  );
  assert.equal(
    pilotFixture.g.onLoot(
      requiredFixtureValue(requiredFixtureValue(shipEntity).player),
      requiredFixtureValue(parcel).it,
    ),
    false,
    'root authority cannot bypass',
  );
  assert.equal(requiredFixtureValue(parcel).it.n, 2);
  assert.deepEqual(requiredFixtureValue(parcel).it.lots, { common: 0, rich: 0, pure: 2 });
  assert.equal(requiredFixtureValue(pilotFixture.s).data.cargo.ore || 0, 0);
  pilotFixture.sp.t = requiredFixtureValue(requiredFixtureValue(parcel).it.jettisonPickup).until;
  industrialStep(pilotFixture, 0.1);
  assert.equal(
    requiredFixtureValue(parcel).taken,
    true,
    'same actual collector can recover after simulation grace',
  );
  assert.equal(requiredFixtureValue(pilotFixture.s).data.cargo.ore, 2);
  assert.deepEqual(requiredFixtureValue(pilotFixture.s).data.cargoLots.byCommodity.ore, {
    common: 0,
    rich: 0,
    pure: 2,
  });
}
