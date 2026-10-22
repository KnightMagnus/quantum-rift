// Verify actual mission/outfitter methods, not just the seating formula.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { makeLoadout, shipStats } from '../shared/rules.ts';
import { passengerSeats, occupiedPassengerSeats, PASSENGER_PACK_ID } from '../shared/passengers.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-passengers-'));
try {
  const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
  const game = new Game(A, new DB(dir));
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  game.connect(sock, '127.20.0.1');
  sock.emit(
    'message',
    JSON.stringify({ t: 'hello', name: 'Seat Tester', pass: 'passengers-test' }),
  );
  const s = [...game.sessions.values()][0],
    d = s.data;
  d.credits = 1e7;
  const p = STELLARS.qstation;
  d.sys = p.system;
  d.stellar = p.id;
  d.ship = makeLoadout(A, 714, 'Group Charter');
  assert.equal(passengerSeats(A.ships[714], d.ship), 96);
  assert.equal(passengerSeats({ ...A.ships[714], crew: 0 }, d.ship), 96);
  assert.equal(passengerSeats({ ...A.ships[714], crew: 900 }, d.ship), 96);
  // Assign real officers through the live operation, not just a synthetic hull crew field.
  for (const [slot, role] of [
    ['captain', 'captain'],
    ['bridge1', 'engineer'],
    ['bridge2', 'navigator'],
  ]) {
    const officer = {
      id: game.features.hangar.uid(d),
      name: `Passenger test ${role}`,
      race: 'quantum',
      role,
      rarity: 0,
      lv: 1,
      xp: 0,
    };
    d.officers.push(officer);
    game.features.hangar.officerOp(s, { op: 'assign', oid: officer.id, slot });
    assert.equal(d.bridge[slot], officer.id);
  }
  assert.equal(game.features.shipStats.stats(d).passengerSeats, 96);
  assert.equal(
    game.features.syndicate.acceptCheck(s, { type: 'passenger', pax: 96 }),
    true,
    'a full bridge does not take passenger seats',
  );
  assert.equal(game.features.syndicate.acceptCheck(s, { type: 'passenger', pax: 97 }), false);
  for (const H of Object.values(A.ships)) {
    const legacy = Math.max(
      1,
      Math.min(
        40,
        H.kind === 'specialist'
          ? 2
          : Math.round((H.crew || 1) / 4) +
              (H.role === 'survey' ? 2 : 0) +
              (H.role === 'explorer' ? 1 : 0),
      ),
    );
    assert.ok(passengerSeats(H) >= legacy, `${H.name} preserves occupied legacy seats`);
  }
  assert.equal(passengerSeats(A.ships[709]), 24);
  assert.equal(passengerSeats(A.ships[776]), 36);
  assert.equal(passengerSeats(A.ships[827]), 48);
  assert.equal(
    passengerSeats(A.ships[784]),
    40,
    'bulk freighter does not outseat dedicated liners',
  );
  const first = game
    .offers(p, d)
    .filter((o) => o.type === 'passenger' && /-(pax|science|charter)$/.test(o.id));
  const second = game
    .offers(p, d)
    .filter((o) => o.type === 'passenger' && /-(pax|science|charter)$/.test(o.id));
  assert.equal(first.length, 3);
  assert.deepEqual(first, second, 'same ten-minute board produces stable offers');
  assert.ok(first.some((o) => o.pax >= 20));
  assert.ok(first.some((o) => o.pax <= 6));
  for (const offer of first) game.accept(s, offer.id);
  assert.equal(d.missions.filter((m) => m.type === 'passenger').length, 3);
  const used = occupiedPassengerSeats(d.missions);
  assert.equal(game.jobBunks(d), used);
  assert.equal(game.fitsJobs(d, d.ship), null);
  assert.match(game.fitsJobs(d, 703), /passenger/i);
  const creditsBefore = d.credits;
  for (const dest of new Set(first.map((m) => m.dest))) game.completeOnLanding(s, STELLARS[dest]);
  assert.equal(occupiedPassengerSeats(d.missions), 0);
  assert.equal(
    d.credits - creditsBefore,
    first.reduce((n, m) => n + m.reward, 0),
  );
  // A small yacht can accept a larger group after fitting packs; removal cannot strand them.
  d.stellar = p.id;
  d.sys = p.system;
  d.ship = makeLoadout(A, 709, 'Seat Retrofit');
  assert.ok(game.outfitter(p, d).includes(PASSENGER_PACK_ID));
  const cargo = shipStats(A, d.ship).cargo,
    space = shipStats(A, d.ship).free;
  game.outfit(s, PASSENGER_PACK_ID, 2);
  assert.equal(d.ship.outfits[PASSENGER_PACK_ID], 2);
  assert.equal(shipStats(A, d.ship).passengerSeats, 34);
  assert.equal(shipStats(A, d.ship).cargo, cargo);
  assert.equal(shipStats(A, d.ship).free, space - 6);
  d.missions = [{ id: 'legacy-passengers', type: 'passenger', pax: 30 }];
  assert.equal(game.features.syndicate.acceptCheck(s, { type: 'passenger', pax: 4 }), true);
  assert.equal(game.features.syndicate.acceptCheck(s, { type: 'passenger', pax: 5 }), false);
  assert.match(
    game.fitsJobs(d, 709),
    /passenger/i,
    'fresh stock yacht cannot carry the upgraded ship manifest',
  );
  assert.equal(game.fitsJobs(d, d.ship), null);
  const beforeSale = d.credits;
  game.outfit(s, PASSENGER_PACK_ID, -1);
  assert.equal(d.ship.outfits[PASSENGER_PACK_ID], 2);
  assert.equal(d.credits, beforeSale);
  d.missions = [];
  game.outfit(s, PASSENGER_PACK_ID, -1);
  assert.equal(d.ship.outfits[PASSENGER_PACK_ID], 1);
  assert.equal(shipStats(A, d.ship).passengerSeats, 29);
  // Exercise both current and legacy dock operations with a real occupied manifest.
  const retrofit = makeLoadout(A, 709, 'Stored Retrofit');
  retrofit.outfits[PASSENGER_PACK_ID] = 2;
  const stockYacht = makeLoadout(A, 709, 'Stored Stock Yacht');
  d.station.site = 'site-qgate';
  d.station.ops = 3;
  d.station.claimed = true;
  d.stellar = d.station.site;
  d.sys = STELLARS[d.stellar].system;
  d.ship = makeLoadout(A, 714, 'Current Liner');
  d.dock = [
    { ship: stockYacht, bridge: {} },
    { ship: retrofit, bridge: {} },
  ];
  game.features.docks.leadChanged(d);
  d.missions = [{ id: 'dock-passengers', type: 'passenger', pax: 30 }];
  const originalUid = d.ship.uid;
  game.features.docks.docksOp(s, {
    op: 'assign',
    k: d.activeDock,
    slot: 'lead',
    uid: stockYacht.uid,
  });
  assert.equal(
    d.ship.uid,
    originalUid,
    'stock 24-seat yacht cannot replace a liner carrying 30 passengers',
  );
  game.features.docks.docksOp(s, {
    op: 'assign',
    k: d.activeDock,
    slot: 'lead',
    uid: retrofit.uid,
  });
  assert.equal(d.ship.uid, retrofit.uid, 'stored yacht retains and uses its installed seat packs');
  assert.equal(game.features.shipStats.stats(d).passengerSeats, 34);
  assert.equal(d.ship.outfits[PASSENGER_PACK_ID], 2);
  const occupiedUid = d.ship.uid;
  game.features.docks.docksOp(s, { op: 'assign', k: d.activeDock, slot: 'lead', uid: null });
  assert.equal(d.shipless, false, 'cannot unassign the active lead with passengers aboard');
  assert.equal(d.ship.uid, occupiedUid);
  game.features.hangar.dockOp(s, { op: 'store', i: -1 });
  assert.equal(d.shipless, false, 'legacy drydock store cannot strand passengers either');
  assert.equal(d.ship.uid, occupiedUid);
  game.features.docks.docksOp(s, { op: 'assign', k: 1, slot: 'lead', uid: stockYacht.uid });
  game.features.docks.docksOp(s, { op: 'activate', k: 1 });
  assert.equal(
    d.activeDock,
    0,
    'switching docks also rejects a stock yacht with insufficient seats',
  );
  const nextRetrofit = makeLoadout(A, 709, 'Dock B Retrofit');
  nextRetrofit.outfits[PASSENGER_PACK_ID] = 2;
  d.dock.push({ ship: nextRetrofit, bridge: {} });
  game.features.docks.docksInit(d);
  game.features.docks.docksOp(s, { op: 'assign', k: 1, slot: 'lead', uid: nextRetrofit.uid });
  game.features.docks.docksOp(s, { op: 'activate', k: 1 });
  assert.equal(d.activeDock, 1);
  assert.equal(d.ship.uid, nextRetrofit.uid);
  assert.equal(game.features.shipStats.stats(d).passengerSeats, 34);
  assert.equal(occupiedPassengerSeats(d.missions), 30);
  game.db.touch();
  game.db.flush();
  const reloaded = new DB(dir).get('Seat Tester');
  game.features.docks.docksInit(reloaded);
  assert.equal(reloaded.ship.outfits[PASSENGER_PACK_ID], 2);
  assert.equal(shipStats(A, reloaded.ship).passengerSeats, 34);
  assert.equal(
    occupiedPassengerSeats(reloaded.missions),
    30,
    'save/reload preserves occupied upgraded accommodation',
  );
  console.log(
    'PASS: dedicated passenger seats, three mission sizes, simultaneous manifests, delivery rewards, +5-seat outfits, assigned officers, live dock swaps, storage guards and save/reload',
  );
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
} catch (error) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
}
