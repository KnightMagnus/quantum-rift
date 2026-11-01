import { mockPlayerData, mockSession, mockDocksHost } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Real transaction regressions: inclusive factory pricing, refitting, and named recruits.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import {
  augmentAssets,
  allOutfits,
  makeLoadout,
  shipStats,
  loadoutValue,
  ensureStockOutfits,
  repairBasis,
  fixedWeaponSaleValue,
  type ShipStatsLoadout,
} from '../shared/rules.ts';
import { Game } from '../server/game.ts';
import { DocksOperations } from '../server/docks.ts';
import { HangarOperations } from '../server/hangar.ts';
import { STELLARS, WINGMATES } from '../shared/galaxy.ts';
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
const outfits2 = allOutfits(assets);
const game = Object.create(Game.prototype);
Object.assign(game, {
  A: assets,
  O: outfits2,
  db: { touch() {} },
  sessions: new Map(),
  live: {},
  features: {
    docks: { leadChanged() {}, activeWings: () => [], wingBonus: () => ({}) },
    bonuses: { bonus: () => ({}) },
    shipStats: {
      stats: (playerData: { ship: ShipStatsLoadout }) => shipStats(assets, playerData.ship),
    },
  },
});
for (const propertyKey of ['log', 'you', 'landed', 'toast']) game[propertyKey] = () => {};
// This deliberately bare core fixture does not run Game's constructor.
game.portService = game.createPortService();
const session = (hull: number, credits = 10000000) => {
  const playerData = mockPlayerData({
    ship: makeLoadout(assets, hull),
    credits,
    cargo: {},
    missions: [],
  });
  const port = Object.values(STELLARS).find(
    (player) =>
      !player.site &&
      (game.yard(player, playerData) || []).includes(hull) &&
      game.outfitter(player, playerData),
  );
  if (port) playerData.stellar = port.id;
  return mockSession({ data: playerData });
};
for (const hull of Object.values(assets.ships)) {
  const fresh = makeLoadout(assets, hull.id);
  assert.equal(
    loadoutValue(assets, fresh),
    Math.round(hull.cost * 0.5),
    `${hull.name}: inclusive kit price`,
  );
  const shipStats3 = shipStats(assets, fresh);
  if (!hull.npcOnly) {
    assert.ok(
      requiredFixtureValue(shipStats3).guns <= requiredFixtureValue(shipStats3).maxGuns,
      `${hull.name}: stock guns fit`,
    );
    assert.ok(
      requiredFixtureValue(shipStats3).turrets <= requiredFixtureValue(shipStats3).maxTurrets,
      `${hull.name}: stock turrets fit`,
    );
  }
}
for (const hull of [798, 738, 790, 765, 775]) {
  const session3 = session(hull),
    before = session3.data.credits;
  assert.ok(session3.data.stellar, 'real shipyard and outfitter');
  game.buyShip(session3, hull);
  assert.ok(session3.data.credits < before, 'same hull purchase must cost money');
  const bought = session3.data.credits;
  game.buyShip(session3, hull);
  assert.ok(session3.data.credits < bought, 'repeat cannot mint credits');
  const alternative = game
    .yard(STELLARS[session3.data.stellar], session3.data)
    .find((identifier: number) => identifier !== hull && !WINGMATES.includes(identifier));
  assert.ok(alternative, 'alternate hull in the same real yard');
  const beforeRoundTrip = session3.data.credits;
  game.buyShip(session3, alternative);
  game.buyShip(session3, hull);
  assert.equal(session3.data.ship.hull, hull);
  assert.ok(session3.data.credits < beforeRoundTrip, 'alternating hulls cannot create credits');
  const playerData = session3.data;
  delete playerData.ship.stockOutfits; // Existing saves migrate conservatively.
  const initial = playerData.credits;
  for (const [identifier, quantity] of Object.entries({ ...playerData.ship.outfits }))
    game.outfit(session3, +identifier, -quantity);
  assert.ok(
    playerData.credits - initial + game.tradeIn(playerData) <=
      Math.round(assets.ships[hull].cost * 0.5) + 5,
    'stripping then trading cannot double-count factory gear',
  );
  const stock = makeLoadout(assets, hull),
    identifier = +Object.keys(stock.outfits)[0];
  playerData.ship = stock;
  game.outfit(session3, identifier, -1);
  const afterSale = playerData.credits;
  game.outfit(session3, identifier, 1);
  assert.equal(playerData.ship.outfits[identifier], 1, 'factory mount accepts paid replacement');
  if (playerData.credits < afterSale) {
    const afterBuy = playerData.credits;
    game.outfit(session3, identifier, -1);
    assert.equal(
      playerData.credits - afterBuy,
      Math.round(outfits2[identifier].cost * 0.5),
      'paid replacement retains retail resale',
    );
  }
}
// Every removable factory bank can be removed and restored, including counts above generic shop limits.
const realOutfitter = game.outfitter;
for (const hull of Object.values(assets.ships).filter((shipHull) => !shipHull.npcOnly)) {
  const session2 = session(hull.id, 1000000000);
  session2.data.stellar ||= requiredFixtureValue(
    Object.values(STELLARS).find((stellarBody) => stellarBody.svc.includes('O')),
  ).id;
  const factory = { ...session2.data.ship.outfits };
  game.outfitter = () => Object.keys(outfits2).map(Number);
  for (const [identifier, quantity] of Object.entries(factory)) {
    game.outfit(session2, +identifier, -quantity);
    assert.equal(
      session2.data.ship.outfits[identifier] || 0,
      0,
      `${hull.name}: remove factory bank`,
    );
    game.outfit(session2, +identifier, quantity);
    assert.equal(
      session2.data.ship.outfits[identifier],
      quantity,
      `${hull.name}: restore complete factory bank`,
    );
  }
}
game.outfitter = realOutfitter;
assert.ok(
  repairBasis(assets, 754) > assets.ships[754].cost,
  'named repair price uses service basis, not recruitment fee',
);
assert.equal(
  repairBasis(assets, 798),
  assets.ships[798].cost,
  'ordinary ship repair price unchanged',
);
// Legacy ship with a missing factory item: buying it must not mark it as factory stock.
const legacy = session(798);
const legacyId = +Object.keys(legacy.data.ship.outfits)[0];
legacy.data.ship.outfits = {};
delete legacy.data.ship.stockOutfits;
ensureStockOutfits(assets, legacy.data.ship);
legacy.data.ship.outfits[legacyId] = 1;
assert.equal(
  loadoutValue(assets, legacy.data.ship) -
    loadoutValue(assets, { ...legacy.data.ship, outfits: {} }),
  Math.round(outfits2[legacyId].cost * 0.5),
);
// Unmapped built-in weapons use the same outfitter authority and retain stripping conservation.
for (const hull of Object.values(assets.ships)) {
  const stock = makeLoadout(assets, hull.id);
  if (hull.npcOnly || !stock.fixed.length) continue;
  const pilot = session(hull.id);
  pilot.data.stellar = 'concordia';
  const before = pilot.data.credits;
  const originalValue = loadoutValue(assets, pilot.data.ship);
  const weaponCounts = { ...shipStats(assets, pilot.data.ship)!.weapons };
  for (const [weaponId, count] of pilot.data.ship.fixed) {
    const refund = fixedWeaponSaleValue(assets, pilot.data.ship, weaponId);
    const beforeBuy = pilot.data.credits;
    game.outfit(pilot, Number(weaponId), 1, true);
    assert.equal(pilot.data.credits, beforeBuy, 'built-ins cannot be bought through sale route');
    game.outfit(pilot, Number(weaponId), -count - 99, true);
    assert.equal(
      shipStats(assets, pilot.data.ship)!.weapons[weaponId] || 0,
      (weaponCounts[weaponId] || 0) - count,
      `${hull.name}: sold built-in stops firing`,
    );
    const afterSale = pilot.data.credits;
    game.outfit(pilot, Number(weaponId), -1, true);
    assert.equal(pilot.data.credits, afterSale, 'repeated sale cannot mint credits');
    assert(refund >= 0);
  }
  assert.equal(
    pilot.data.credits - before + loadoutValue(assets, pilot.data.ship),
    originalValue,
    `${hull.name}: built-in sale subtracts exactly from trade-in`,
  );
  const restored = JSON.parse(JSON.stringify(pilot.data.ship));
  assert.deepEqual(
    shipStats(assets, restored)!.weapons,
    shipStats(assets, pilot.data.ship)!.weapons,
    'serialized stripped loadout does not restore weapons',
  );
}
const deniedFixed = session(716);
deniedFixed.data.stellar = 'longhaul-depot';
const deniedBefore = JSON.stringify(deniedFixed.data);
game.outfit(deniedFixed, 143, -1, true);
assert.equal(JSON.stringify(deniedFixed.data), deniedBefore, 'no outfitter: no fixed sale');
deniedFixed.data.stellar = 'concordia';
deniedFixed.ent = {} as typeof deniedFixed.ent;
const flightBefore = JSON.stringify(deniedFixed.data);
game.outfit(deniedFixed, 143, -1, true);
assert.equal(JSON.stringify(deniedFixed.data), flightBefore, 'flight: no fixed sale');
deniedFixed.ent = null;
const unknownBefore = JSON.stringify(deniedFixed.data);
game.outfit(deniedFixed, 999999, -1, true);
assert.equal(JSON.stringify(deniedFixed.data), unknownBefore, 'unknown built-in: no sale');

const port = Object.values(STELLARS).find((stellarBody) => stellarBody.site);
const dockGame = mockDocksHost({
  A: assets,
  O: outfits2,
  docksInit: (playerData) => playerData,
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  yard: Game.prototype.yard,
  dockSlots: () => 20,
  shipUid: () => 'test-ship',
  ownSite: () => true,
  log() {},
  toast() {},
  db: { touch() {} },
  you() {},
  landed() {},
  unassign() {},
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  storedValue: HangarOperations.storedValue,
});
dockGame.portService = Game.prototype.createPortService.call(dockGame);
for (const hull of WINGMATES) {
  const session2 = mockSession({
    data: {
      credits: 10000,
      stellar: requiredFixtureValue(port).id,
      station: { site: requiredFixtureValue(port).id, ops: 4 },
      dock: [],
      shipless: true,
    },
  });
  DocksOperations.buyToHangar.call(dockGame, session2, hull);
  assert.equal(session2.data.dock.length, 1);
  DocksOperations.buyToHangar.call(dockGame, session2, hull);
  assert.equal(session2.data.dock.length, 1, 'cannot recruit a second copy of a named companion');
  assert.equal(session2.data.credits, 5000);
  HangarOperations.dockOp.call(dockGame, session2, { op: 'sell', uid: 'test-ship' });
  assert.equal(session2.data.credits, 7500, 'companion liquidation cannot create money');
}
console.log(
  'Ship economy passed: all stock prices/mounts, 5 formerly profitable hulls, stock stripping, paid replacements, legacy provenance, and 6 unique named recruits.',
);
