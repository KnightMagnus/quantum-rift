import { mockMission } from './helpers/mocks.ts';
import type { GameAssets, ShipHullAsset } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Verify actual mission/outfitter methods, not just the seating formula.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { makeLoadout, shipStats } from '../shared/rules.ts';
import { passengerSeats, occupiedPassengerSeats, PASSENGER_PACK_ID } from '../shared/passengers.ts';

const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-passengers-'));
try {
  const assets: GameAssets = JSON.parse(
    filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  );
  const game = new Game(assets, new Database(directory));
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '127.20.0.1');
  legacySocket2.emit(
    'message',
    JSON.stringify({ t: 'hello', name: 'Seat Tester', pass: 'passengers-test' }),
  );
  const session = [...game.sessions.values()][0],
    playerData = session.data;
  playerData.credits = 1e7;
  const player = STELLARS.qstation;
  playerData.sys = player.system;
  playerData.stellar = player.id;
  playerData.ship = makeLoadout(assets, 714, 'Group Charter');
  assert.equal(passengerSeats(assets.ships[714], playerData.ship), 96);
  const emptyCrewHull: ShipHullAsset = { ...assets.ships[714], crew: 0 };
  assert.equal(passengerSeats(emptyCrewHull, playerData.ship), 96);
  const fullCrewHull: ShipHullAsset = { ...assets.ships[714], crew: 900 };
  assert.equal(passengerSeats(fullCrewHull, playerData.ship), 96);
  // Assign real officers through the live operation, not just a synthetic hull crew field.
  for (const [slot, role] of [
    ['captain', 'captain'],
    ['bridge1', 'engineer'],
    ['bridge2', 'navigator'],
  ]) {
    const officer = {
      id: game.features.hangar.uid(playerData),
      name: `Passenger test ${role}`,
      race: 'quantum',
      role,
      rarity: 0,
      lv: 1,
      xp: 0,
    };
    playerData.officers.push(officer);
    game.features.hangar.officerOp(session, { op: 'assign', oid: officer.id, slot });
    assert.equal(playerData.bridge[slot], officer.id);
  }
  assert.equal(requiredFixtureValue(game.features.shipStats.stats(playerData)).passengerSeats, 96);
  assert.equal(
    game.features.syndicate.acceptCheck(session, mockMission({ type: 'passenger', pax: 96 })),
    true,
    'a full bridge does not take passenger seats',
  );
  assert.equal(
    game.features.syndicate.acceptCheck(session, mockMission({ type: 'passenger', pax: 97 })),
    false,
  );
  for (const shipHullAsset of Object.values(assets.ships)) {
    const legacy = Math.max(
      1,
      Math.min(
        40,
        shipHullAsset.kind === 'specialist'
          ? 2
          : Math.round((shipHullAsset.crew || 1) / 4) +
              (shipHullAsset.role === 'survey' ? 2 : 0) +
              (shipHullAsset.role === 'explorer' ? 1 : 0),
      ),
    );
    assert.ok(
      passengerSeats(shipHullAsset) >= legacy,
      `${shipHullAsset.name} preserves occupied legacy seats`,
    );
  }
  assert.equal(passengerSeats(assets.ships[709]), 24);
  assert.equal(passengerSeats(assets.ships[776]), 36);
  assert.equal(passengerSeats(assets.ships[827]), 48);
  assert.equal(
    passengerSeats(assets.ships[784]),
    40,
    'bulk freighter does not outseat dedicated liners',
  );
  const first = game
    .offers(player, playerData)
    .filter(
      (options) => options.type === 'passenger' && /-(pax|science|charter)$/.test(options.id),
    );
  const second = game
    .offers(player, playerData)
    .filter(
      (mission) => mission.type === 'passenger' && /-(pax|science|charter)$/.test(mission.id),
    );
  assert.equal(first.length, 3);
  assert.deepEqual(first, second, 'same ten-minute board produces stable offers');
  assert.ok(first.some((mission) => requiredFixtureValue(mission.pax) >= 20));
  assert.ok(first.some((mission) => requiredFixtureValue(mission.pax) <= 6));
  for (const offer of first) game.accept(session, offer.id);
  assert.equal(playerData.missions.filter((mission) => mission.type === 'passenger').length, 3);
  const used = occupiedPassengerSeats(playerData.missions);
  assert.equal(game.jobBunks(playerData), used);
  assert.equal(game.fitsJobs(playerData, playerData.ship), null);
  assert.match(requiredFixtureValue(game.fitsJobs(playerData, 703)), /passenger/i);
  const creditsBefore = playerData.credits;
  for (const destination of new Set(first.map((mission) => mission.dest)))
    game.completeOnLanding(session, STELLARS[requiredFixtureValue(destination)]);
  assert.equal(occupiedPassengerSeats(playerData.missions), 0);
  assert.equal(
    playerData.credits - creditsBefore,
    first.reduce((quantity, mission) => quantity + mission.reward, 0),
  );
  // A small yacht can accept a larger group after fitting packs; removal cannot strand them.
  playerData.stellar = player.id;
  playerData.sys = player.system;
  playerData.ship = makeLoadout(assets, 709, 'Seat Retrofit');
  assert.ok(requiredFixtureValue(game.outfitter(player, playerData)).includes(PASSENGER_PACK_ID));
  const cargo = requiredFixtureValue(
      requiredFixtureValue(shipStats(assets, playerData.ship)),
    ).cargo,
    space = requiredFixtureValue(requiredFixtureValue(shipStats(assets, playerData.ship))).free;
  game.outfit(session, PASSENGER_PACK_ID, 2);
  assert.equal(playerData.ship.outfits[PASSENGER_PACK_ID], 2);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(shipStats(assets, playerData.ship))).passengerSeats,
    34,
  );
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(shipStats(assets, playerData.ship))).cargo,
    cargo,
  );
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(shipStats(assets, playerData.ship))).free,
    space - 6,
  );
  playerData.missions = [mockMission({ id: 'legacy-passengers', type: 'passenger', pax: 30 })];
  assert.equal(
    game.features.syndicate.acceptCheck(session, mockMission({ type: 'passenger', pax: 4 })),
    true,
  );
  assert.equal(
    game.features.syndicate.acceptCheck(session, mockMission({ type: 'passenger', pax: 5 })),
    false,
  );
  assert.match(
    requiredFixtureValue(game.fitsJobs(playerData, 709)),
    /passenger/i,
    'fresh stock yacht cannot carry the upgraded ship manifest',
  );
  assert.equal(game.fitsJobs(playerData, playerData.ship), null);
  const beforeSale = playerData.credits;
  game.outfit(session, PASSENGER_PACK_ID, -1);
  assert.equal(playerData.ship.outfits[PASSENGER_PACK_ID], 2);
  assert.equal(playerData.credits, beforeSale);
  playerData.missions = [];
  game.outfit(session, PASSENGER_PACK_ID, -1);
  assert.equal(playerData.ship.outfits[PASSENGER_PACK_ID], 1);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(shipStats(assets, playerData.ship))).passengerSeats,
    29,
  );
  // Exercise both current and legacy dock operations with a real occupied manifest.
  const retrofit = makeLoadout(assets, 709, 'Stored Retrofit');
  retrofit.outfits[PASSENGER_PACK_ID] = 2;
  const stockYacht = makeLoadout(assets, 709, 'Stored Stock Yacht');
  playerData.station.site = 'site-qgate';
  playerData.station.ops = 3;
  playerData.station.claimed = true;
  playerData.stellar = playerData.station.site;
  playerData.sys = STELLARS[playerData.stellar].system;
  playerData.ship = makeLoadout(assets, 714, 'Current Liner');
  playerData.dock = [
    { ship: stockYacht, bridge: {} },
    { ship: retrofit, bridge: {} },
  ];
  game.features.docks.leadChanged(playerData);
  playerData.missions = [mockMission({ id: 'dock-passengers', type: 'passenger', pax: 30 })];
  const originalUid = playerData.ship.uid;
  game.features.docks.docksOp(session, {
    op: 'assign',
    k: playerData.activeDock,
    slot: 'lead',
    uid: stockYacht.uid,
  });
  assert.equal(
    playerData.ship.uid,
    originalUid,
    'stock 24-seat yacht cannot replace a liner carrying 30 passengers',
  );
  game.features.docks.docksOp(session, {
    op: 'assign',
    k: playerData.activeDock,
    slot: 'lead',
    uid: retrofit.uid,
  });
  assert.equal(
    playerData.ship.uid,
    retrofit.uid,
    'stored yacht retains and uses its installed seat packs',
  );
  assert.equal(requiredFixtureValue(game.features.shipStats.stats(playerData)).passengerSeats, 34);
  assert.equal(playerData.ship.outfits[PASSENGER_PACK_ID], 2);
  const occupiedUid = playerData.ship.uid;
  game.features.docks.docksOp(session, {
    op: 'assign',
    k: playerData.activeDock,
    slot: 'lead',
    uid: null,
  });
  assert.equal(
    playerData.shipless,
    false,
    'cannot unassign the active lead with passengers aboard',
  );
  assert.equal(playerData.ship.uid, occupiedUid);
  game.features.hangar.dockOp(session, { op: 'store', i: -1 });
  assert.equal(playerData.shipless, false, 'legacy drydock store cannot strand passengers either');
  assert.equal(playerData.ship.uid, occupiedUid);
  game.features.docks.docksOp(session, { op: 'assign', k: 1, slot: 'lead', uid: stockYacht.uid });
  game.features.docks.docksOp(session, { op: 'activate', k: 1 });
  assert.equal(
    playerData.activeDock,
    0,
    'switching docks also rejects a stock yacht with insufficient seats',
  );
  const nextRetrofit = makeLoadout(assets, 709, 'Dock B Retrofit');
  nextRetrofit.outfits[PASSENGER_PACK_ID] = 2;
  playerData.dock.push({ ship: nextRetrofit, bridge: {} });
  game.features.docks.docksInit(playerData);
  game.features.docks.docksOp(session, { op: 'assign', k: 1, slot: 'lead', uid: nextRetrofit.uid });
  game.features.docks.docksOp(session, { op: 'activate', k: 1 });
  assert.equal(playerData.activeDock, 1);
  assert.equal(playerData.ship.uid, nextRetrofit.uid);
  assert.equal(requiredFixtureValue(game.features.shipStats.stats(playerData)).passengerSeats, 34);
  assert.equal(occupiedPassengerSeats(playerData.missions), 30);
  game.db.touch();
  game.db.flush();
  const reloaded = requiredFixtureValue(new Database(directory).get('Seat Tester'));
  game.features.docks.docksInit(reloaded);
  assert.equal(requiredFixtureValue(reloaded).ship.outfits[PASSENGER_PACK_ID], 2);
  assert.equal(
    requiredFixtureValue(requiredFixtureValue(shipStats(assets, reloaded.ship))).passengerSeats,
    34,
  );
  assert.equal(
    occupiedPassengerSeats(requiredFixtureValue(reloaded).missions),
    30,
    'save/reload preserves occupied upgraded accommodation',
  );
  console.log(
    'PASS: dedicated passenger seats, three mission sizes, simultaneous manifests, delivery rewards, +5-seat outfits, assigned officers, live dock swaps, storage guards and save/reload',
  );
  filesystem.rmSync(directory, { recursive: true, force: true });
  process.exit(0);
} catch (error) {
  filesystem.rmSync(directory, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
}
