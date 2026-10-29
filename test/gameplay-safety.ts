import { tradePreview } from '../shared/economy-preview.ts';
import { addLots } from '../shared/cargo-lots.ts';
import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import { COMMODITIES } from '../shared/galaxy.ts';
import { HailOperations } from '../server/hail.ts';

const game = refineryGame();
const captain = refineryPilot(game, 'Gameplay safety');
for (const cargo of [{}, { food: 5 }, { equipment: 10 }]) {
  for (const hull of [703, 708, 716]) {
    const player = mockPlayerData({ ship: { ...captain.data.ship, hull }, cargo });
    const expected = Math.max(
      800,
      Math.round(
        (game.A.ships[hull].cost * 0.02 +
          Object.entries(cargo).reduce(
            (total, [id, quantity]) =>
              total + (quantity || 0) * COMMODITIES.find((item) => item.id === id)!.base,
            0,
          ) *
            0.4) /
          100,
      ) * 100,
    );
    assert.equal(HailOperations.bribeCost.call(game, player), expected);
  }
}
assert.equal(
  HailOperations.bribeCost.call(
    game,
    mockPlayerData({ ship: { ...captain.data.ship, hull: 703 }, cargo: {} }),
  ),
  800,
);
console.log('Pirate toll: minimum, cargo valuation and hundred-credit rounding passed.');

// Early repayment stays free and convenient, but cannot manufacture payment history.
const syndicate = game.features.syndicate;
captain.data.stellar = 'qstation';
const openingRating = captain.data.credit;
const openingCredits = captain.data.credits;
for (let cycle = 0; cycle < 20; cycle++) {
  syndicate.bankOp(captain, { op: 'borrow', amt: 1000 });
  assert.equal(captain.data.loan?.bal, 1000);
  syndicate.bankOp(captain, { op: 'pay', amt: 400 });
  assert.equal(captain.data.loan?.bal, 600);
  syndicate.bankOp(captain, { op: 'pay', amt: 600 });
  assert.equal(captain.data.loan, null);
}
assert.equal(captain.data.credit, openingRating);
assert.equal(captain.data.credits, openingCredits);
syndicate.bankOp(captain, { op: 'borrow', amt: 10000 });
assert.ok(captain.data.loan);
captain.data.loan.next = 0;
syndicate.bankTick(captain);
assert.ok(captain.data.credit > openingRating, 'a real scheduled payment builds credit history');
syndicate.bankOp(captain, { op: 'pay', amt: captain.data.loan?.bal || 0 });
assert.equal(captain.data.loan, null);
console.log(
  'Bank history: instant cycles denied rating, partial/early repayment and scheduled history passed.',
);

const ordinaryCargo = { equipment: 4 };
const ordinaryLedger = { version: 1 as const, byCommodity: {} };
const previewInput = {
  market: { id: 'equipment', price: 100 },
  amount: 2,
  cargo: ordinaryCargo,
  cargoLots: ordinaryLedger,
  credits: 1000,
  freeHold: 10,
};
assert.deepEqual(
  tradePreview(previewInput).warnings,
  [],
  'ordinary goods with no orders have no delivery warning',
);
assert.deepEqual(
  tradePreview({ ...previewInput, orders: [{ cid: 'equipment', grade: 'common', qty: 2 }] })
    .warnings,
  [],
  'unreserved stock can be sold',
);
assert.equal(
  tradePreview({ ...previewInput, orders: [{ cid: 'equipment', grade: 'common', qty: 3 }] })
    .warnings.length,
  1,
  'selling reserved ordinary goods warns',
);
assert.deepEqual(
  tradePreview({ ...previewInput, orders: [{ cid: 'equipment', grade: 'common', qty: 0 }] })
    .warnings,
  [],
);
const rawCargo: Record<string, number> = {};
const rawLedger = { version: 1 as const, byCommodity: {} };
addLots(rawCargo, rawLedger, { cid: 'ore', qty: 5, grades: { common: 2, rich: 3, pure: 0 } });
const rawPreview = {
  ...previewInput,
  market: { id: 'ore', price: 100 },
  cargo: rawCargo,
  cargoLots: rawLedger,
};
assert.deepEqual(
  tradePreview({ ...rawPreview, orders: [{ cid: 'ore', grade: 'rich', qty: 3 }] }).warnings,
  [],
  'common-first sale leaves reserved rich ore intact',
);
assert.equal(
  tradePreview({ ...rawPreview, amount: 3, orders: [{ cid: 'ore', grade: 'rich', qty: 3 }] })
    .warnings.length,
  2,
  'selling into reserved rich ore warns alongside grade notice',
);
console.log(
  'Delivery previews: ordinary goods, positive reservations and raw-grade ownership passed.',
);

const departing = refineryPilot(game, 'Disconnect once');
const observer = refineryPilot(game, 'Disconnect observer');
let finalFlushes = 0;
const originalFlush = game.db.flush.bind(game.db);
game.db.flush = () => {
  finalFlushes++;
  return originalFlush();
};
game.disconnect(departing);
const afterDisconnect = JSON.stringify(departing.data);
const notices = observer.sock.out.filter(
  (packet) => packet.t === 'chat' && packet.msg.includes('Disconnect once left'),
).length;
assert.equal(notices, 1);
game.disconnect(departing);
assert.equal(finalFlushes, 1);
assert.equal(JSON.stringify(departing.data), afterDisconnect);
assert.equal(
  observer.sock.out.filter(
    (packet) => packet.t === 'chat' && packet.msg.includes('Disconnect once left'),
  ).length,
  1,
);
const replacement = refineryPilot(game, 'Replacement session');
game.sessions.delete(replacement.id);
replacement.id = departing.id;
game.sessions.set(replacement.id, replacement);
const beforeLateClose = finalFlushes;
game.disconnect(departing);
assert.equal(
  game.sessions.get(replacement.id),
  replacement,
  'late close cannot detach a replacement identity',
);
assert.equal(finalFlushes, beforeLateClose);
game.db.flush = originalFlush;
console.log('Disconnect cleanup: one save/notice and replacement-session identity preserved.');

const boarding = refineryPilot(game, 'Boarding captain');
const ally = refineryPilot(game, 'Boarding ally');
boarding.data.stellar = null;
ally.data.stellar = null;
boarding.data.sys = ally.data.sys = 'meridian';
game.spawnPlayer(boarding, 10000, 10000, 0, 0);
game.spawnPlayer(ally, 10000, 10000, 0, 0);
assert.ok(boarding.ent && ally.ent);
const boardingSpace = game.spaces.meridian;
boarding.data.armada = ally.data.armada = 'test-fleet';
for (const owner of [boarding, ally]) {
  const wingmate = boardingSpace.makeShip({
    hull: 708,
    faction: 'quantum',
    owner: owner.ent!.id,
    x: boarding.ent.x,
    y: boarding.ent.y,
    ai: 'escort',
  });
  wingmate.wingOf = owner.id;
  wingmate.disabled = true;
  for (const act of ['plunder', 'capture', 'rescue'] as const) {
    const before = JSON.stringify(boarding.data);
    game.features.hangar.board(boarding, { id: wingmate.id, act });
    assert.equal(
      JSON.stringify(boarding.data),
      before,
      'fleet boarding cannot mint rewards or inventory',
    );
    assert.equal(wingmate.boarded, undefined);
    assert.equal(boardingSpace.ships.get(wingmate.id), wingmate);
  }
}
let captainRescues = 0;
const originalRescue = game.features.coop.rescueBoard;
game.features.coop.rescueBoard = () => {
  captainRescues++;
};
ally.ent.rescueT = Date.now() + 1000;
game.features.hangar.board(boarding, { id: ally.ent.id, act: 'rescue' });
assert.equal(captainRescues, 1, 'downed captain rescue retains its existing authority route');
game.features.coop.rescueBoard = originalRescue;
console.log('Fleet boarding: own/allied reward denial preserves captain rescue routing.');
