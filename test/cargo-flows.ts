import type { LootItem } from '../server/space.ts';
import type { CargoLoot } from '../server/contracts.ts';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { mockMission, type FixtureShape } from './helpers/mocks.ts';
import type { TradeState } from '../server/coop-contracts.ts';
// Trade scenarios supply only fields exercised by settlement.
const mockTrade = <Fixture extends FixtureShape<TradeState>>(
  value: Fixture,
): Fixture & TradeState => value as Fixture & TradeState;
import { requiredFixtureValue } from './helpers/required.ts';
// Production cargo writers: no mocked accounting service and no personal saves.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { tempDataDir } from './helpers/temp-data.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game, type Session, type PlayerData } from '../server/game.ts';
import { STELLARS, COMMODITIES, ORE_PROCESS } from '../shared/galaxy.ts';
import { makeLoadout } from '../shared/rules.ts';
import { JETTISON_OWNER_GRACE_SECONDS } from '../server/fleetcmd.ts';
import { TRADE_IMPACT } from '../shared/living.ts';
import { assertLots, addLots, clearLots } from '../shared/cargo-lots.ts';
import { type CargoTotals, type CargoLedger } from '../shared/cargo-contracts.ts';

const oldInterval = globalThis.setInterval,
  oldRandom = Math.random;
let game: Game;
try {
  globalThis.setInterval = Object.assign(() => {
    const timer = oldInterval(() => {}, 2147483647);
    clearInterval(timer);
    return timer;
  }, oldInterval);
  Math.random = () => 0.4;
  game = new Game(
    JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
    new Database(tempDataDir('rift-cargo-flows-')),
  );
} finally {
  globalThis.setInterval = oldInterval;
  Math.random = oldRandom;
}
function pilot(name: string) {
  const sock = legacySocket();
  Object.assign(sock, {
    open: true,
    backlog: 0,
    out: [] as LegacyPacket[],
    close() {},
    send(message: string) {
      this.out.push(typeof message === 'string' ? JSON.parse(message) : message);
    },
  });
  game.connect(sock, '127.0.0.1');
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  game.onMessage(session, { t: 'hello', name, pass: 'fixture' });
  assert.ok(requiredFixtureValue(session).data, 'real authenticated login');
  return session;
}
function invariant(playerData: {
  cargo: CargoTotals;
  cargoLots: CargoLedger;
  storage: CargoTotals;
  storageLots: CargoLedger;
}) {
  assertLots(playerData.cargo, playerData.cargoLots);
  assertLots(playerData.storage, playerData.storageLots);
}
function seed(
  playerData: Pick<PlayerData, 'cargo' | 'cargoLots' | 'storage' | 'storageLots'>,
  common = 0,
  rich = 0,
  pure = 0,
  commodityId = 'ore',
) {
  seedCargo(playerData, {});
  addLots(playerData.cargo, playerData.cargoLots, {
    cid: commodityId,
    qty: common + rich + pure,
    grades: { common, rich, pure },
  });
  invariant(playerData);
}
function lots(playerData: PlayerData, commodityId = 'ore') {
  invariant(playerData);
  return playerData.cargoLots.byCommodity[commodityId] || { common: 0, rich: 0, pure: 0 };
}
function ownedShip(session: Session, site: string) {
  const playerData = session.data;
  playerData.station = { ...playerData.station, claimed: true, ops: 3, site };
  game.db.world.sites[site] = game.db.key(playerData.name);
  playerData.stellar = site;
  playerData.sys = STELLARS[site].system;
  session.ent = null;
}
const session = pilot('Cargo Alpha'),
  session2 = pilot('Cargo Bravo'),
  playerData = requiredFixtureValue(session).data,
  entity = requiredFixtureValue(session2).data;
playerData.ship = makeLoadout(game.A, 704, 'Cargo test');
playerData.credits = 1e8;

// Old saves gain common-only cargo/storage before welcome; corrupt premium saves fail closed.
const legacy = game.fresh();
Reflect.deleteProperty(legacy, 'cargoLots');
Reflect.deleteProperty(legacy, 'storageLots');
legacy.cargo = { ore: 4, food: 2 };
legacy.storage = { gas: 3 };
game.db.create('Cargo Legacy', 'fixture', legacy);
const linkedSystemId = pilot('Cargo Legacy');
assert.deepEqual(lots(requiredFixtureValue(linkedSystemId).data), { common: 4, rich: 0, pure: 0 });
game.db.flush();
const reloadedLegacy = new Database(game.db.dir).get('Cargo Legacy');
assert.deepEqual(
  requiredFixtureValue(reloadedLegacy).cargoLots,
  requiredFixtureValue(linkedSystemId).data.cargoLots,
);
assert.deepEqual(
  requiredFixtureValue(reloadedLegacy).storageLots,
  requiredFixtureValue(linkedSystemId).data.storageLots,
);
assert.deepEqual(requiredFixtureValue(linkedSystemId).data.storageLots.byCommodity.gas, {
  common: 3,
  rich: 0,
  pure: 0,
});
const corrupt = game.db.create('Cargo Corrupt', 'fixture', game.fresh());
corrupt.cargo = { ore: 1 };
corrupt.cargoLots.byCommodity.ore = { common: 0, rich: 0, pure: 2 };
const beforeBad = JSON.stringify(corrupt),
  sock = legacySocket();
Object.assign(sock, {
  open: true,
  backlog: 0,
  out: [] as LegacyPacket[],
  close() {},
  send(message: string) {
    this.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  },
});
game.connect(sock, '127.0.0.2');
const invalidValue = requiredFixtureValue([...game.sessions.values()].at(-1));
const errorLog = console.error;
try {
  console.error = () => {};
  game.onMessage(invalidValue, { t: 'hello', name: 'Cargo Corrupt', pass: 'fixture' });
} finally {
  console.error = errorLog;
}
assert.equal(requiredFixtureValue(invalidValue).data, null);
assert.equal(JSON.stringify(corrupt), beforeBad);
assert.match(requiredFixtureValue(sock.out.at(-1)).msg, /Cargo save validation failed/);
assert.throws(() => game.importSave({ ...corrupt, name: 'Rejected Import' }), /aggregate mismatch/);
assert.equal(game.db.get('Rejected Import'), null);
console.log(
  'Login/import migrate legacy holds/storage; corrupt premium data is rejected without repair.',
);

// Actual market: grade weighting enters the existing depth/modifier formula once.
playerData.stellar = 'qstation';
playerData.sys = 'qgate';
for (const commodityId of ['ore', 'gas', 'shards']) {
  for (const grade of ['common', 'rich', 'pure']) {
    seed(
      playerData,
      grade === 'common' ? 10 : 0,
      grade === 'rich' ? 10 : 0,
      grade === 'pure' ? 10 : 0,
      commodityId,
    );
    const port = STELLARS[playerData.stellar],
      playerReference = requiredFixtureValue(
        requiredFixtureValue(game.market(port)).find((captain) => captain.id === commodityId),
      ).price;
    const multiplier = grade === 'pure' ? 1.6 : grade === 'rich' ? 1.3 : 1;
    const expected = Math.round(
      10 *
        multiplier *
        requiredFixtureValue(playerReference) *
        (1 - Math.min(TRADE_IMPACT.max, 10 * TRADE_IMPACT.perTon) / 2) *
        game.features.fronts.mods(playerData.sys).sell *
        (1 + (game.features.bonuses.bonus(playerData).tradePct || 0) / 100),
    );
    const credits = playerData.credits;
    game.onMessage(session, {
      t: 'trade',
      cid: commodityId,
      qty: -10,
      lots: { common: 0, rich: 0, pure: 0, [grade]: 10 },
    });
    assert.equal(playerData.credits - credits, expected);
    assert.equal(playerData.cargo[commodityId] || 0, 0);
    invariant(playerData);
  }
}
seed(playerData, 2, 3, 4);
const denial = JSON.stringify(playerData);
game.trade(session, 'ore', -2, { common: 0, rich: 0, pure: 2.5 });
assert.equal(JSON.stringify(playerData), denial);
game.trade(session, 'ore', -3);
assert.deepEqual(lots(playerData), { common: 0, rich: 2, pure: 4 });
game.trade(session, 'ore', 2);
assert.deepEqual(lots(playerData), { common: 2, rich: 2, pure: 4 });
seedCargo(playerData, { food: 3 });
game.trade(session, 'food', -3);
invariant(playerData);
assert.equal(playerData.cargo.food || 0, 0);
console.log(
  'All raw grades sell exactly once through market depth/bonuses; repurchases are common; ordinary goods remain compatible.',
);

// Jettison exact grades into multiple real parcels; job cargo constrains recollection.
seed(playerData, 0, 2, 8);
game.depart(session);
assert.ok(requiredFixtureValue(session).ent);
const space = game.spaces[playerData.sys],
  base = space.loot.length;
game.onMessage(session, { t: 'jettison', cid: 'ore', n: 8, lots: { common: 0, rich: 0, pure: 8 } });
assert.deepEqual(lots(playerData), { common: 0, rich: 2, pure: 0 });
const parcels = space.loot.slice(base).map((message) => message.it);
assert.equal(
  parcels.reduce((quantity, entry) => quantity + requiredFixtureValue(entry.n), 0),
  8,
);
assert.equal(
  parcels.reduce((quantity, entry) => quantity + requiredFixtureValue(entry.lots).pure, 0),
  8,
);
space.t += JETTISON_OWNER_GRACE_SECONDS;
const capacity = requiredFixtureValue(game.features.shipStats.stats(playerData)).cargo;
playerData.missions = [mockMission({ type: 'cargo', qty: capacity - 3 })];
assert.equal(game.onLoot(game.pref(session), parcels[0]), false);
assert.equal(playerData.cargo.ore, 3);
assert.equal(parcels[0].n, 3);
invariant(playerData);
playerData.missions = [];
for (const lootItem of parcels) game.onLoot(game.pref(session), lootItem);
assert.deepEqual(lots(playerData), { common: 0, rich: 2, pure: 8 });
assert.ok(parcels.every((entry) => entry.n === 0));
game.features.fleetcmd.lootCargo(session, requiredFixtureValue(parcels[0]) as CargoLoot);
assert.equal(playerData.cargo.ore, 10);
console.log(
  'Jettison and partial recollection preserve premium grades and respect mission hold usage.',
);

// Close stationary jettison must not be instantly auto-scooped by its owner.
{
  const owner = pilot('Grace Owner'),
    foreign = pilot('Grace Foreign');
  requiredFixtureValue(owner).data.sys = requiredFixtureValue(foreign).data.sys = 'meridian';
  requiredFixtureValue(owner).data.stellar = requiredFixtureValue(foreign).data.stellar = null;
  requiredFixtureValue(owner).data.ship = makeLoadout(game.A, 704);
  requiredFixtureValue(foreign).data.ship = makeLoadout(game.A, 704);
  game.spawnPlayer(owner, 50000, 50000, 0, 0);
  const message = game.spaces.meridian;
  message.spawnT = 1e9;
  Object.assign(requiredFixtureValue(requiredFixtureValue(owner).ent), {
    a: 0,
    vx: 0,
    vy: 0,
    graceT: 1e9,
    guns: [],
  });
  seed(requiredFixtureValue(owner).data, 0, 2, 0);
  const random = Math.random,
    rolls = [0.5, 0, 0.5, 0.5];
  try {
    Math.random = () => rolls.shift() ?? 0.5;
    game.onMessage(owner, {
      t: 'jettison',
      cid: 'ore',
      n: 2,
      lots: { common: 0, rich: 2, pure: 0 },
    });
  } finally {
    Math.random = random;
  }
  const parcel = message.loot.at(-1),
    original = JSON.stringify(requiredFixtureValue(parcel).it);
  assert.ok(
    Math.hypot(
      requiredFixtureValue(parcel).x - requiredFixtureValue(requiredFixtureValue(owner).ent).x,
      requiredFixtureValue(parcel).y - requiredFixtureValue(requiredFixtureValue(owner).ent).y,
    ) < 30,
  );
  message.tick();
  assert.equal(
    requiredFixtureValue(owner).data.cargo.ore || 0,
    0,
    'actual first Space.tick leaves dumped cargo outside owner hold',
  );
  assert.equal(
    message.loot.includes(requiredFixtureValue(parcel)),
    true,
    'blocked pickup does not consume parcel',
  );
  assert.equal(
    game.onLoot(game.pref(owner), requiredFixtureValue(parcel).it),
    false,
    'root-authority collector cannot bypass grace',
  );
  assert.equal(
    JSON.stringify(requiredFixtureValue(parcel).it),
    original,
    'denial preserves exact mass and grades',
  );
  // Other captains can take part immediately; the remainder retains owner grace.
  seed(requiredFixtureValue(foreign).data);
  const capacity = requiredFixtureValue(game.features.shipStats.stats(foreign.data)).cargo;
  requiredFixtureValue(foreign).data.missions = [mockMission({ type: 'cargo', qty: capacity - 1 })];
  assert.equal(game.onLoot(game.pref(foreign), requiredFixtureValue(parcel).it), false);
  assert.deepEqual(lots(requiredFixtureValue(foreign).data), { common: 0, rich: 1, pure: 0 });
  assert.equal(requiredFixtureValue(parcel).it.n, 1);
  assert.equal(game.onLoot(game.pref(owner), requiredFixtureValue(parcel).it), false);
  // Flight/session identity can change, but stable captain provenance still blocks it.
  const oldEnt = requiredFixtureValue(owner).ent;
  game.spawnPlayer(owner, 50000, 50000, 0, 0);
  message.ships.delete(requiredFixtureValue(oldEnt).id);
  Object.assign(requiredFixtureValue(requiredFixtureValue(owner).ent), {
    a: 0,
    vx: 0,
    vy: 0,
    graceT: 1e9,
    guns: [],
  });
  assert.equal(game.onLoot(game.pref(owner), requiredFixtureValue(parcel).it), false);
  const until = requiredFixtureValue(requiredFixtureValue(parcel).it.jettisonPickup).until;
  message.t = until - 0.01;
  assert.equal(
    game.onLoot(game.pref(owner), requiredFixtureValue(parcel).it),
    false,
    'simulation-time grace includes its final fraction',
  );
  message.tick();
  assert.deepEqual(
    lots(requiredFixtureValue(owner).data),
    { common: 0, rich: 1, pure: 0 },
    'owner can recover exact remainder after grace',
  );
  assert.equal(message.loot.includes(requiredFixtureValue(parcel)), false);
  assert.equal(
    (requiredFixtureValue(owner).data.cargo.ore || 0) +
      (requiredFixtureValue(foreign).data.cargo.ore || 0),
    2,
    'total mass conserved',
  );
  invariant(requiredFixtureValue(owner).data);
  invariant(requiredFixtureValue(foreign).data);
  requiredFixtureValue(foreign).data.missions = [];
  message.remove(requiredFixtureValue(requiredFixtureValue(owner).ent));
  requiredFixtureValue(owner).ent = null;
}

// Once-resolved mining parcel: full/partial pickups cannot reroll bonuses or progression.
seed(playerData);
const miningCap = requiredFixtureValue(game.features.shipStats.stats(playerData)).cargo;
playerData.missions = [mockMission({ type: 'cargo', qty: miningCap })];
const parcel: LootItem = { ore: 'ore', n: 10, rich: 2 };
let rolls = 0;
Math.random = () => {
  rolls++;
  return 0.1;
};
try {
  assert.equal(game.onLoot(game.pref(session), parcel), false);
  const frozen = structuredClone(requiredFixtureValue(parcel.remainingLots)),
    resolutionRolls = rolls;
  assert.equal(game.onLoot(game.pref(session), parcel), false);
  assert.equal(rolls, resolutionRolls);
  playerData.missions = [mockMission({ type: 'cargo', qty: miningCap - 2 })];
  const mined = playerData.stats.mined || 0,
    blueprints = playerData.bp[805] || 0;
  assert.equal(game.onLoot(game.pref(session), parcel), false);
  assert.equal(playerData.stats.mined - mined, 2);
  assert.equal(playerData.bp[805] - blueprints, 2);
  const afterProgress = rolls;
  playerData.missions = [];
  Object.assign(playerData.station, { research: { mining: 10 } });
  assert.equal(game.onLoot(game.pref(session), parcel), true);
  assert.equal(rolls, afterProgress);
  assert.equal(playerData.bp[805] - blueprints, 2);
  assert.equal(playerData.cargo.ore, frozen.common);
  assert.equal(playerData.stats.mined - mined, frozen.common);
  assert.equal(game.onLoot(game.pref(session), parcel), true);
  assert.equal(playerData.cargo.ore, frozen.common);
  invariant(playerData);
} finally {
  Math.random = oldRandom;
  Reflect.deleteProperty(playerData.station, 'research');
  playerData.missions = [];
}
console.log(
  'Mining bonus resolution, accepted-tonne counters and progression token are once-only across retries.',
);

// Existing station processing still costs 12 t + 1,500 cr and uses its crate-grade rules.
requiredFixtureValue(session).ent = null;
ownedShip(session, 'site-qgate');
seed(playerData, 12, 0, 12);
const credits = playerData.credits,
  crate = playerData.mats.alloy[ORE_PROCESS.grade[3]];
game.onMessage(session, {
  t: 'station',
  op: 'process',
  id: 'ore',
  lots: { common: 0, rich: 0, pure: 12 },
});
assert.equal(playerData.credits, credits - 1500);
assert.equal(playerData.mats.alloy[ORE_PROCESS.grade[3]], crate + 1);
assert.deepEqual(lots(playerData), { common: 12, rich: 0, pure: 0 });
const untouched = JSON.stringify(playerData);
game.station(session, { op: 'process', id: 'ore', lots: { common: 0, rich: 0, pure: 12 } });
assert.equal(JSON.stringify(playerData), untouched);
// Supply contracts have no grade requirement and consume common first.
playerData.missions = [
  mockMission({
    id: 'supply-fixture',
    type: 'supply',
    dest: playerData.stellar,
    cid: 'ore',
    qty: 5,
    reward: 123,
    title: 'Supply ore',
  }),
];
game.completeOnLanding(session, STELLARS[playerData.stellar]);
assert.equal(playerData.cargo.ore, 7);
assert.deepEqual(lots(playerData), { common: 7, rich: 0, pure: 0 });
console.log(
  'Station processing preserves 12 t/1,500 cr/crate-grade economics; supply consumes exact common-first lots.',
);

// Exchange escrow survives partial matching and refunds; storage collection includes job cargo.
playerData.stellar = entity.stellar = 'qstation';
playerData.sys = entity.sys = 'qgate';
entity.credits = 1e7;
seed(playerData, 0, 3, 7);
seed(entity);
game.onMessage(session, {
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'ore',
  qty: 10,
  price: 100,
});
assert.equal(playerData.cargo.ore, 0);
const order = game.db.world.orders.at(-1);
assert.deepEqual(requiredFixtureValue(order).lots, { common: 0, rich: 3, pure: 7 });
game.onMessage(session2, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 5,
  price: 100,
});
assert.deepEqual(entity.storageLots.byCommodity.ore, { common: 0, rich: 3, pure: 2 });
assert.deepEqual(requiredFixtureValue(order).lots, { common: 0, rich: 0, pure: 5 });
invariant(entity);
game.onMessage(session, { t: 'exchange', op: 'cancel', id: requiredFixtureValue(order).id });
assert.deepEqual(playerData.storageLots.byCommodity.ore, { common: 0, rich: 0, pure: 5 });
invariant(playerData);
const bcap = requiredFixtureValue(game.features.shipStats.stats(entity)).cargo;
entity.missions = [mockMission({ type: 'cargo', qty: bcap - 1 })];
game.onMessage(session2, { t: 'exchange', op: 'collect' });
assert.deepEqual(lots(entity), { common: 0, rich: 1, pure: 0 });
assert.equal(entity.storage.ore, 4);
entity.missions = [];
game.onMessage(session2, { t: 'exchange', op: 'collect' });
assert.deepEqual(lots(entity), { common: 0, rich: 3, pure: 2 });
assert.equal(entity.storage.ore, 0);
// Offline old-save destination storage migrates before delivery.
Reflect.deleteProperty(requiredFixtureValue(linkedSystemId).data, 'storageLots');
game.features.frontier.deliver(
  requiredFixtureValue(linkedSystemId).data.name,
  { kind: 'com', cid: 'gas' },
  2,
);
invariant(requiredFixtureValue(linkedSystemId).data);
assert.equal(requiredFixtureValue(linkedSystemId).data.storageLots.byCommodity.gas.common, 5);
// A corrupt destination cannot consume an incoming order's escrow/credits.
entity.storageLots.byCommodity.gas = { common: 0, rich: 0, pure: 1 };
seed(playerData, 0, 0, 2);
game.onMessage(session, {
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
const balance = entity.credits,
  book = JSON.stringify(game.db.world.orders);
game.onMessage(session2, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
assert.equal(entity.credits, balance);
assert.equal(JSON.stringify(game.db.world.orders), book);
Reflect.deleteProperty(entity.storageLots.byCommodity, 'gas');
invariant(entity);
game.onMessage(session, {
  t: 'exchange',
  op: 'cancel',
  id: requiredFixtureValue(game.db.world.orders.at(-1)).id,
});
// Resting offline buyer corruption exercises full-fill preflight and exact seller rollback.
game.onMessage(session2, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
const restingBuy = game.db.world.orders.at(-1);
entity.storageLots.byCommodity.gas = { common: 0, rich: 0, pure: 1 };
seed(playerData, 0, 0, 2);
const sellerBefore = JSON.stringify([playerData.cargo, playerData.cargoLots, playerData.credits]),
  restingBefore = JSON.stringify(game.db.world.orders);
game.onMessage(session, {
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'com',
  cid: 'ore',
  qty: 2,
  price: 100,
});
assert.equal(
  JSON.stringify([playerData.cargo, playerData.cargoLots, playerData.credits]),
  sellerBefore,
);
assert.equal(JSON.stringify(game.db.world.orders), restingBefore);
Reflect.deleteProperty(entity.storageLots.byCommodity, 'gas');
game.onMessage(session2, { t: 'exchange', op: 'cancel', id: requiredFixtureValue(restingBuy).id });
console.log(
  'Exchange escrow, partial fill, refund, offline migration and job-aware collection conserve every grade; corrupt destination rolls back.',
);

// A post-commit notification failure cannot refund/mint escrow or lose the remainder.
seed(playerData, 0, 0, 2);
game.onMessage(session2, {
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'com',
  cid: 'ore',
  qty: 1,
  price: 100,
});
const notify = game.features.frontier.notify,
  beforeNoticeCredits = playerData.credits;
game.features.frontier.notify = () => {
  throw new Error('fixture notification failure');
};
try {
  assert.throws(
    () =>
      game.features.frontier.exchangeOp(session, {
        op: 'place',
        side: 'sell',
        kind: 'com',
        cid: 'ore',
        qty: 2,
        price: 100,
      }),
    /fixture notification failure/,
  );
} finally {
  game.features.frontier.notify = notify;
}
assert.equal(playerData.cargo.ore, 0);
assert.equal(playerData.credits, beforeNoticeCredits + 98);
assert.deepEqual(entity.storageLots.byCommodity.ore, { common: 0, rich: 0, pure: 1 });
const remainder = game.db.world.orders.at(-1);
assert.equal(requiredFixtureValue(remainder).qty, 1);
assert.deepEqual(requiredFixtureValue(remainder).lots, { common: 0, rich: 0, pure: 1 });
game.db.flush();
assert.equal(
  requiredFixtureValue(requiredFixtureValue(new Database(game.db.dir).world.orders.at(-1)).lots)
    .pure,
  1,
);
game.features.frontier.exchangeOp(session, {
  op: 'cancel',
  id: requiredFixtureValue(remainder).id,
});
clearLots(entity.storage, entity.storageLots);
console.log(
  'Post-commit notification failure preserves paid fill and exact durable pending escrow without refunds.',
);

// Captain-to-captain trade preflights both sides and leaves excess in graded storage.
ownedShip(session, 'site-qgate');
ownedShip(session2, 'site-meridian');
seed(playerData, 0, 0, 4);
seed(entity, 0, 3, 0);
entity.missions = [mockMission({ type: 'cargo', qty: bcap })];
const tradeFixture = mockTrade({
  id: 'fixture-trade',
  a: playerData.name,
  b: entity.name,
  give: {
    [playerData.name]: {
      credits: 1000,
      items: { 'cargo:ore': 4 },
      lots: { ore: { common: 0, rich: 0, pure: 4 } },
    },
    [entity.name]: { items: { 'cargo:ore': 3 }, lots: { ore: { common: 0, rich: 3, pure: 0 } } },
  },
});
game.trades[tradeFixture.id] = tradeFixture;
game.features.coop.tradeDo(tradeFixture);
assert.equal(entity.cargo.ore, 0);
assert.equal(entity.storageLots.byCommodity.ore.pure, 4);
assert.equal(lots(playerData).rich, 3);
invariant(entity);
seed(playerData, 0, 0, 1);
seed(entity, 0, 1, 0);
const badTrade = structuredClone(tradeFixture);
badTrade.id = 'bad-trade';
badTrade.give[playerData.name].items['cargo:ore'] = 1;
badTrade.give[playerData.name].lots.ore.pure = 1;
badTrade.give[entity.name].items['cargo:ore'] = 1;
badTrade.give[entity.name].lots.ore = { common: 0, rich: 0, pure: 1 };
game.trades[badTrade.id] = badTrade;
const aBefore = JSON.stringify(playerData),
  bBefore = JSON.stringify(entity);
game.features.coop.tradeDo(badTrade);
assert.equal(JSON.stringify(playerData), aBefore);
assert.equal(JSON.stringify(entity), bBefore);
entity.missions = [];
entity.stellar = 'qstation';
entity.sys = 'qgate';
game.features.frontier.exchangeOp(session2, { op: 'collect' });
assert.equal(lots(entity).pure, 4);
console.log(
  'Captain swap preserves both exact offers, preflights both sides and retains full-hold premium goods in station storage.',
);

// Colony production is newly common, leaves fractional/unaccepted production behind.
playerData.stellar = 'qstation';
playerData.sys = 'qgate';
seed(playerData);
playerData.missions = [mockMission({ type: 'cargo', qty: capacity - 2 })];
game.db.world.colonies[playerData.stellar] = {
  owner: game.db.key(playerData.name),
  lv: 1,
  buildings: [],
  store: { ore: 5.5 },
  t: Date.now(),
  name: 'Fixture',
};
game.features.frontier.colonyOp(session, { op: 'collect' });
assert.deepEqual(lots(playerData), { common: 2, rich: 0, pure: 0 });
assert.equal(game.db.world.colonies[playerData.stellar].store.ore, 3.5);
playerData.missions = [];
// Actual disabled-ship boarding producer; deterministic commodity = raw ore.
seed(playerData);
game.depart(session);
const message = game.spaces[playerData.sys],
  target = message.makeShip({
    hull: 703,
    faction: 'hollow',
    x: requiredFixtureValue(requiredFixtureValue(session).ent).x,
    y: requiredFixtureValue(requiredFixtureValue(session).ent).y,
  });
target.disabled = true;
target.vx = requiredFixtureValue(requiredFixtureValue(session).ent).vx;
target.vy = requiredFixtureValue(requiredFixtureValue(session).ent).vy;
const oreIndex = COMMODITIES.findIndex((captain) => captain.id === 'ore');
let randomCalls = 0;
Math.random = () => (++randomCalls === 2 ? (oreIndex + 0.1) / COMMODITIES.length : 0.4);
try {
  game.features.hangar.board(session, { id: target.id, act: 'plunder' });
} finally {
  Math.random = oldRandom;
}
assert.ok(playerData.cargo.ore > 0);
assert.equal(lots(playerData).common, playerData.cargo.ore);
console.log(
  'Colony collection and real disabled-ship plunder produce common lots with correct capacity.',
);

// Death clears matching totals+ledger; Lodestar preserves both exactly.
seed(playerData, 1, 2, 3);
game.onPlayerDeath(game.pref(session), message);
assert.deepEqual(playerData.cargo, {});
assert.deepEqual(playerData.cargoLots.byCommodity, {});
playerData.ship = makeLoadout(game.A, 805, 'Lodestar');
seed(playerData, 1, 2, 3);
const protectedHold = JSON.stringify([playerData.cargo, playerData.cargoLots]);
game.onPlayerDeath(game.pref(session), message);
assert.equal(JSON.stringify([playerData.cargo, playerData.cargoLots]), protectedHold);
invariant(playerData);
console.log('Death clears paired inventory; Lodestar preserves paired premium inventory.');
console.log('ALL PRODUCTION CARGO FLOW TESTS PASSED');
