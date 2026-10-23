import { mockOfficer, mockWeaponMount } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import {
  dredgePilot,
  control,
  industrialStep,
  seed,
  DT as simulationStepSeconds,
} from './helpers/dredge-fixture.ts';
import { weaponParams } from '../shared/rules.ts';
import { RECIPES } from '../shared/refinery-rules.ts';
import { SYS as systemsById, STELLARS, COMMODITIES } from '../shared/galaxy.ts';
import { quote, command } from './helpers/refinery-fixture.ts';
import { evidenceDir } from './helpers/browser-fixture.ts';
// Actual price/debit/output/fee loop including new plasma recipes, all forward only.
for (const recipe of RECIPES.filter((result) => result.inputs[0] === 'plasma'))
  for (const quantity of [1, 3, 7, 30]) {
    const feature = dredgePilot(),
      { g: game, s: session } = feature;
    game.dropEscorts(feature.sp, requiredFixtureValue(session).ent);
    feature.sp.remove(requiredFixtureValue(session).ent);
    Reflect.set(requiredFixtureValue(session), 'ent', null);
    const player = Object.values(STELLARS).find(
      (stellarBody) =>
        stellarBody.system === requiredFixtureValue(session).data.sys &&
        !stellarBody.site &&
        stellarBody.svc.includes('T') &&
        stellarBody.svc.includes('O'),
    );
    requiredFixtureValue(session).data.stellar = requiredFixtureValue(player).id;
    seed(requiredFixtureValue(session).data, {});
    const start = requiredFixtureValue(session).data.credits;
    game.trade(session, 'plasma', quantity);
    assert.equal(requiredFixtureValue(session).data.cargo.plasma, quantity);
    const refineryQuote = quote(game, session, recipe.id, quantity);
    command(game, session, { op: 'submit', id: refineryQuote.id });
    command(game, session, { op: 'claim', recipe: recipe.id });
    const output = requiredFixtureValue(session).data.cargo[recipe.output] || 0;
    if (output) game.trade(session, recipe.output, -output);
    assert.ok(
      requiredFixtureValue(session).data.credits <= start,
      'no local buy/process/sell money pump including fractional liability',
    );
  }
const graph = new Map();
for (const result of RECIPES)
  for (const commodityId of result.inputs)
    graph.set(commodityId, [...(graph.get(commodityId) || []), result.output]);
graph.set('plasma', [...graph.get('plasma'), 'industrial_parts']);
graph.set('fuel_cells', ['ship_fuel']);
function visit(propertyKey: unknown, seen = new Set()) {
  assert.ok(!seen.has(propertyKey), 'no fuel/plasma/parts reverse conversion');
  for (const next of graph.get(propertyKey) || []) visit(next, new Set([...seen, propertyKey]));
}
for (const propertyKey2 of graph.keys()) visit(propertyKey2);
// Twenty-minute deterministic production-boundary sessions. Scheduler travel/selection dwell is explicit;
// these are not autonomous flight AI, human play or full expansion-wide balance proofs.
const results: {
  mature: boolean;
  hull: number;
  cid: string;
  tonnes: number;
  premium: number;
  net: number;
  tonnesPerMinute: number;
  netCreditsPerMinute: number;
  miningPct: number;
  commonInFinalHold: number;
  protected: boolean;
  scope: string;
}[] = [];
for (const mature of [false, true])
  for (const hull of [815, 805]) {
    const pilotFixture = dredgePilot(
        undefined,
        (mature ? 'Mature' : 'Stock') + hull,
        hull,
        hull === 805
          ? requiredFixtureValue(
              Object.values(systemsById).find(
                (starSystem) =>
                  starSystem.fields?.some((asteroid) => asteroid.ore === 'shards') &&
                  starSystem.stellars.some(
                    (stellarBody) =>
                      requiredFixtureValue(stellarBody.svc).includes('T') &&
                      requiredFixtureValue(stellarBody.svc).includes('O') &&
                      !stellarBody.site,
                  ),
              ),
            ).id
          : 'meridian',
      ),
      { g: game, s: session, sp: space } = pilotFixture,
      playerData = requiredFixtureValue(session).data;
    if (mature) {
      playerData.station.done = ['mining1', 'mining2', 'holds'];
      playerData.officers = [
        mockOfficer({
          id: 'industrial-chief',
          role: 'scout',
          rarity: 2,
          lv: 10,
          rank: 2,
          race: 'human',
          traits: ['prospector'],
        }),
      ];
      playerData.bridge = { captain: 'industrial-chief' };
      playerData.lower = ['rigger', 'fixer'];
      playerData.mastery = { [hull]: 25000 };
      playerData.specState[hull] = {
        tier: 5,
        comp: { weapons: 5, shields: 5, hull: 5, drive: 5, special: 5 },
      };
    }
    const entity = requiredFixtureValue(session).ent;
    requiredFixtureValue(entity).st = requiredFixtureValue(
      game.features.shipStats.stats(playerData),
    );
    requiredFixtureValue(entity).a = Math.PI / 2;
    requiredFixtureValue(entity).vx = 65;
    requiredFixtureValue(entity).vy = 0;
    const commodityId = hull === 815 ? 'ore' : 'shards',
      family = space.rocks.filter(
        (rockGeneration) =>
          rockGeneration.ore === commodityId && (hull === 815 ? rockGeneration.stages === 1 : true),
      );
    assert.ok(family.length);
    const player = Object.values(STELLARS).find(
      (stellarBody) =>
        stellarBody.system === requiredFixtureValue(session).data.sys &&
        !stellarBody.site &&
        stellarBody.svc.includes('T') &&
        stellarBody.svc.includes('O'),
    );
    let harvested = 0,
      premium = 0,
      netCredits = 0,
      seconds = 60; // Initial travel budget; explicit fixed fixture assumption.
    let next = 0;
    while (seconds < 1200) {
      let current = space.rocks.filter(
        (rockGeneration) =>
          rockGeneration.ore === commodityId && (hull === 815 ? rockGeneration.stages === 1 : true),
      );
      if (!current.length)
        current = space.rocks.filter((rockGeneration) => rockGeneration.ore === commodityId);
      const rockGeneration = current[next++ % current.length];
      if (rockGeneration.down) {
        industrialStep(pilotFixture, 1);
        seconds++;
        continue;
      }
      // Place encounter at a fixture-relative forward point; production work/ledger stays untouched.
      const beforeHold = game.holdUsed(playerData);
      rockGeneration.x = requiredFixtureValue(entity).x + 120;
      rockGeneration.y = requiredFixtureValue(entity).y;
      if (hull === 815 && rockGeneration.stages === 1) {
        requiredFixtureValue(entity).a = Math.PI / 2;
        requiredFixtureValue(entity).vx = 65;
        requiredFixtureValue(entity).vy = 0;
        control(pilotFixture, 'sweep');
        let work = 0;
        while (!rockGeneration.down && work < 10 && seconds < 1200) {
          industrialStep(pilotFixture, simulationStepSeconds);
          game.features.mining.endTick(space);
          seconds += simulationStepSeconds;
          work += simulationStepSeconds;
        }
        control(pilotFixture, 'off');
      } else {
        requiredFixtureValue(entity).x = rockGeneration.x + rockGeneration.r + 100;
        requiredFixtureValue(entity).y = rockGeneration.y;
        requiredFixtureValue(entity).a = -Math.PI / 2;
        requiredFixtureValue(entity).vx = requiredFixtureValue(entity).vy = 0;
        const weaponMount = mockWeaponMount({
          w: 9102,
          n: hull === 815 ? 1 : 2,
          p: weaponParams(game.A.weapons[9102]),
          cd: 0,
          ammo: Infinity,
          snd: 'laser',
          sec: false,
          sndT: 0,
        });
        requiredFixtureValue(entity).guns = [weaponMount];
        let work = 0,
          stage = rockGeneration.stage,
          releaseUntil = 0;
        while (!rockGeneration.down && work < 30 && seconds < 1200) {
          game.features.mining.advanceClock(simulationStepSeconds);
          space.t += simulationStepSeconds;
          if (stage !== rockGeneration.stage) {
            stage = rockGeneration.stage;
            releaseUntil = 0;
          }
          if (rockGeneration.ready && rockGeneration.heat >= 65 && !releaseUntil)
            releaseUntil = requiredFixtureValue(game.db.world.mining).clock + 0.3;
          if (!releaseUntil) space.fire(entity, weaponMount, null, -Math.PI / 2);
          game.features.mining.endTick(space);
          seconds += simulationStepSeconds;
          work += simulationStepSeconds;
        }
      }
      // Snapshot before collection mutates the live parcel list.
      const parcelsBeforeCollection = [
        ...requiredFixtureValue(game.db.world.mining).systems[playerData.sys].parcels,
      ];
      for (const parcel of parcelsBeforeCollection)
        if (parcel.it.generationKey === rockGeneration.key && !parcel.taken) {
          const _before = game.holdUsed(playerData);
          game.onLoot(requiredFixtureValue(requiredFixtureValue(entity).player), parcel.it);
        }
      harvested += game.holdUsed(playerData) - beforeHold;
      if (
        game.holdUsed(playerData) >= requiredFixtureValue(entity).st.cargo - 30 ||
        seconds >= 1180
      ) {
        premium += Object.values(playerData.cargoLots.byCommodity).reduce(
          (quantity2, linkedSystemId) => quantity2 + linkedSystemId.rich + linkedSystemId.pure,
          0,
        );
        // Actual docked refinery/trade settlement, with explicit roundtrip travel/processing time budget.
        const saved = requiredFixtureValue(session).ent;
        Reflect.set(requiredFixtureValue(session), 'ent', null);
        playerData.stellar = requiredFixtureValue(player).id;
        const before = playerData.credits;
        const quantity = playerData.cargo[commodityId] || 0;
        if (quantity) game.trade(session, commodityId, -quantity);
        netCredits += playerData.credits - before;
        playerData.stellar = null;
        requiredFixtureValue(session).ent = saved;
        seconds += 90;
      } else {
        industrialStep(pilotFixture, hull === 815 ? 1 : 3);
        seconds += hull === 815 ? 1 : 3;
      } // Field selection/scoop dwell; precision attention is not free.
    }
    const hold = playerData.cargo[commodityId] || 0;
    premium += Object.values(playerData.cargoLots.byCommodity).reduce(
      (quantity, gradeLots) => quantity + gradeLots.rich + gradeLots.pure,
      0,
    );
    const rawData = requiredFixtureValue(
      COMMODITIES.find((commodity) => commodity.id === commodityId),
    ).base;
    netCredits += Math.floor(hold * rawData * 0.9);
    const common = playerData.cargoLots.byCommodity[commodityId]?.common || 0;
    results.push({
      mature,
      hull,
      cid: commodityId,
      tonnes: harvested,
      premium,
      net: netCredits,
      tonnesPerMinute: harvested / 20,
      netCreditsPerMinute: netCredits / 20,
      miningPct: game.features.bonuses.bonus(playerData).miningPct,
      commonInFinalHold: common,
      protected: hull === 805,
      scope:
        'scripted production boundary; fixed travel/selection dwell, no encounters or player skill model',
    });
  }
filesystem.writeFileSync(
  path.join(evidenceDir('dredge-economy'), 'twenty-minute-sessions.json'),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
assert.ok(results.every((entry) => Number.isFinite(entry.net) && entry.tonnes > 0));
for (const mature of [false, true]) {
  const bulk = results.find((entry) => entry.mature === mature && entry.hull === 815),
    precision = results.find((entry) => entry.mature === mature && entry.hull === 805);
  assert.ok(
    requiredFixtureValue(bulk).tonnesPerMinute > requiredFixtureValue(precision).tonnesPerMinute,
    'bounded scripted bulk throughput ahead',
  );
  assert.ok(
    requiredFixtureValue(precision).netCreditsPerMinute >
      requiredFixtureValue(bulk).netCreditsPerMinute,
    'precision value ahead without nerfing Lodestar',
  );
}
