import { mockMission } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { freightOffers, INNER_FREIGHT_SYSTEMS } from '../server/freight-offers.ts';
import { STELLARS, SYS as systemsById, START, FACTIONS } from '../shared/galaxy.ts';
import { makeLoadout, shipStats, route } from '../shared/rules.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { DB as Database } from '../server/db.ts';

const currentTime = Date.now;
let time = 1800000000000;
Date.now = () => time;
try {
  const game = refineryGame(),
    session = refineryPilot(game, 'Courier boundary'),
    playerData = requiredFixtureValue(session).data;
  playerData.ship = makeLoadout(game.A, START.ship, 'Starter');
  playerData.cargo = {};
  const innerPorts = Object.values(STELLARS).filter(
    (player) =>
      INNER_FREIGHT_SYSTEMS.has(player.system) &&
      player.svc.includes('B') &&
      !player.site &&
      !player.outlaw,
  );
  assert.ok(innerPorts.length >= 15 && INNER_FREIGHT_SYSTEMS.has(START.system));
  assert.ok(!INNER_FREIGHT_SYSTEMS.has('gloam'));
  let checked = 0;
  for (let window = 0; window < 128; window++) {
    time = 1800000000000 + window * 600000;
    for (const stellarBody of innerPorts) {
      const offers = game.offers(stellarBody, playerData),
        courier = offers.filter((options) => options.id.includes('-freight-courier-'));
      assert.equal(courier.length, 2, `Two small contracts at ${stellarBody.id}, window ${window}`);
      assert.ok(
        requiredFixtureValue(courier[0].qty) >= 3 && requiredFixtureValue(courier[0].qty) <= 5,
      );
      assert.ok(
        requiredFixtureValue(courier[1].qty) >= 6 && requiredFixtureValue(courier[1].qty) <= 10,
      );
      assert.ok(requiredFixtureValue(courier[0].qty) + requiredFixtureValue(courier[1].qty) <= 15);
      for (const mission of courier) {
        assert.equal(mission.type, 'cargo');
        assert.ok(!mission.deadline && !mission.rush && !mission.syn);
        assert.notEqual(mission.sys, stellarBody.system);
        assert.ok(INNER_FREIGHT_SYSTEMS.has(mission.sys));
        assert.ok(
          STELLARS[requiredFixtureValue(mission.dest)].svc.includes('L') &&
            !STELLARS[requiredFixtureValue(mission.dest)].site,
        );
        const path = route(systemsById, stellarBody.system, mission.sys);
        assert.ok(path.length > 0 && path.length <= 2);
        assert.ok(
          path.every(
            (identifier) =>
              systemsById[identifier].danger <= 1 &&
              !FACTIONS[systemsById[identifier].faction].pirate,
          ),
        );
      }
      checked++;
    }
  }
  const port = STELLARS.qstation;
  playerData.sys = port.system;
  playerData.stellar = port.id;
  const board = () => game.offers(port, playerData),
    small = () => board().filter((mission) => mission.id.includes('-freight-courier-'));
  const first = small()[0],
    second = small()[1];
  const stable = freightOffers(port, Math.floor(time / 600000));
  assert.deepEqual(stable, freightOffers(port, Math.floor(time / 600000)));
  const bulk = stable.filter((mission) => mission.id.includes('-bulk-'));
  assert.equal(bulk.length, 5);
  const limits = [
    [30, 60],
    [70, 120],
    [140, 300],
    [350, 450],
    [900, 1800],
  ];
  for (const [index, mission] of bulk.entries()) {
    assert.ok(
      requiredFixtureValue(mission.qty) >= limits[index][0] &&
        requiredFixtureValue(mission.qty) <= limits[index][1],
    );
    assert.ok(mission.reward > first.reward);
    assert.ok(Number.isSafeInteger(mission.reward) && mission.reward > 0);
  }
  for (const [name, band, expected] of [
    ['Dory Hauler', 0, 70],
    ['Sunwake Sloop', 1, 120],
    ['Longhaul Barge', 2, 300],
    ['Magma Hauler', 3, 450],
    ['Grand Caravan', 4, 1800],
  ] as const) {
    // Named stock haulers must fit the advertised progression bands across every seed.
    const hull = requiredFixtureValue(
      Object.values(game.A.ships).find((shipHull) => shipHull.name === name),
    ).id;
    const capacity = requiredFixtureValue(
      shipStats(game.A, makeLoadout(game.A, hull, 'Hauler')),
    ).cargo;
    assert.equal(capacity, expected);
    for (let window = 0; window < 128; window++) {
      const offer = freightOffers(port, window).filter((mission) => mission.id.includes('-bulk-'))[
        band
      ];
      assert.ok(
        requiredFixtureValue(offer.qty) <= capacity,
        `${game.A.ships[hull].name} fits band ${band}`,
      );
    }
  }
  const largestOffer = board().find((mission) => mission.id.includes('-bulk-4'));
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  const originalOffers = game.offers;
  let offerReads = 0;
  game.offers = function () {
    assert.equal(this, game, 'core forwarding keeps the Game receiver');
    offerReads++;
    return [];
  };
  game.accept(session, first.id);
  assert.equal(offerReads, 1, 'acceptance reads the current offer provider, not a stale binding');
  assert.equal(
    playerData.missions.length,
    0,
    'an offer removed by the current provider cannot be accepted',
  );
  game.offers = originalOffers;
  game.accept(session, requiredFixtureValue(largestOffer).id);
  assert.equal(playerData.missions.length, 0, 'Starter cannot overfill with a large contract');
  playerData.cargo.food = 15;
  game.accept(session, first.id);
  assert.equal(playerData.missions.length, 0, 'Existing commodities count against hold capacity');
  playerData.cargo = {};
  const credits = playerData.credits;
  game.accept(session, first.id);
  game.accept(session, first.id);
  game.accept(session, 'forged-freight-id');
  assert.equal(playerData.missions.length, 1, 'Duplicate and forged acceptance are denied');
  game.accept(session, second.id);
  assert.equal(playerData.missions.length, 2, 'Both courier shipments fit the starter together');
  assert.equal(
    game.holdUsed(playerData),
    requiredFixtureValue(first.qty) + requiredFixtureValue(second.qty),
  );
  assert.deepEqual(
    playerData.cargo,
    {},
    'Freight is supplied mission cargo, not purchased commodities',
  );
  assert.equal(playerData.credits, credits, 'Acceptance never charges the captain');
  assert.equal(small().length, 0, 'Accepted board slots do not keep refilling');
  const accepted = structuredClone(playerData.missions);
  time += 600000;
  playerData.ship = makeLoadout(game.A, 784, 'Grand Caravan');
  assert.deepEqual(
    playerData.missions,
    accepted,
    'Time and ship changes cannot resize accepted cargo/pay',
  );
  assert.deepEqual(
    freightOffers(port, 5),
    freightOffers(port, 5),
    'Offers are public, not ship-scaled',
  );
  game.db.touch();
  game.db.flush();
  const loaded = new Database(game.db.dir).get(playerData.name);
  assert.deepEqual(
    requiredFixtureValue(loaded).missions,
    accepted,
    'Cargo and pay survive a real database reload',
  );
  game.completeOnLanding(session, port);
  assert.equal(playerData.credits, credits, 'Wrong port cannot pay');
  game.completeOnLanding(session, STELLARS[requiredFixtureValue(first.dest)]);
  const paid = playerData.credits;
  assert.equal(
    paid,
    credits +
      accepted
        .filter((options: { dest?: string }) => options.dest === first.dest)
        .reduce((quantity, mission) => quantity + mission.reward, 0),
  );
  game.completeOnLanding(session, STELLARS[requiredFixtureValue(first.dest)]);
  assert.equal(playerData.credits, paid, 'Repeated completion cannot pay twice');
  const untouched = freightOffers(port, Math.floor(time / 600000));
  playerData.missions = Array.from({ length: 6 }, (_unused, index) =>
    mockMission({ id: `occupied-${index}`, type: 'patrol' }),
  );
  game.accept(session, untouched[0].id);
  assert.equal(playerData.missions.length, 6, 'Normal six-job limit is preserved');
  playerData.missions = [];
  const heavy = board().find((mission) => mission.id.includes('-bulk-4'));
  game.accept(session, requiredFixtureValue(heavy).id);
  assert.equal(
    playerData.missions.length,
    1,
    'Grand Caravan accepts a genuine high-tonnage contract',
  );
  assert.equal(game.holdUsed(playerData), requiredFixtureValue(heavy).qty);
  const beforeHeavy = playerData.credits;
  game.completeOnLanding(session, STELLARS[requiredFixtureValue(requiredFixtureValue(heavy).dest)]);
  assert.equal(playerData.credits, beforeHeavy + requiredFixtureValue(heavy).reward);
  assert.equal(game.holdUsed(playerData), 0, 'Heavy delivery releases the whole reserved shipment');
  assert.deepEqual(freightOffers({ ...port, svc: 'L' }, 0), []);
  assert.deepEqual(freightOffers({ ...port, outlaw: true }, 0), []);
  assert.deepEqual(freightOffers({ ...port, site: true }, 0), []);
  assert.deepEqual(freightOffers({ ...port, system: 'gloam' }, 0), []);
  assert.ok(
    !freightOffers({ ...port, system: 'farmouth' }, 0).some((mission) =>
      mission.id.includes('-courier-'),
    ),
  );
  console.log(
    `${checked} inner-port boards: two starter-fit couriers, hauler tiers, reservations, exact payout, denial and persistence passed.`,
  );
} finally {
  Date.now = currentTime;
}
