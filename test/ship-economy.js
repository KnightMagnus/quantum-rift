// Real transaction regressions: inclusive factory pricing, refitting, and named recruits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  augmentAssets,
  allOutfits,
  makeLoadout,
  shipStats,
  loadoutValue,
  ensureStockOutfits,
  repairBasis,
} from '../shared/rules.ts';
import { Game } from '../server/game.ts';
import { DocksOperations } from '../server/docks.ts';
import { HangarOperations } from '../server/hangar.ts';
import { STELLARS, WINGMATES } from '../shared/galaxy.ts';
const A = augmentAssets(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
);
const O = allOutfits(A);
const g = Object.create(Game.prototype);
Object.assign(g, {
  A,
  O,
  db: { touch() {} },
  features: { docks: { leadChanged() {} }, shipStats: { stats: (d) => shipStats(A, d.ship) } },
});
for (const key of ['log', 'you', 'landed', 'toast']) g[key] = () => {};
// This deliberately bare core fixture does not run Game's constructor.
g.portService = g.createPortService();
const session = (hull, credits = 10000000) => {
  const d = { ship: makeLoadout(A, hull), credits, cargo: {}, missions: [] };
  const port = Object.values(STELLARS).find(
    (p) => !p.site && (g.yard(p, d) || []).includes(hull) && g.outfitter(p, d),
  );
  if (port) d.stellar = port.id;
  return { data: d };
};
for (const H of Object.values(A.ships)) {
  const fresh = makeLoadout(A, H.id);
  assert.equal(loadoutValue(A, fresh), Math.round(H.cost * 0.5), `${H.name}: inclusive kit price`);
  const st = shipStats(A, fresh);
  if (!H.npcOnly) {
    assert.ok(st.guns <= st.maxGuns, `${H.name}: stock guns fit`);
    assert.ok(st.turrets <= st.maxTurrets, `${H.name}: stock turrets fit`);
  }
}
for (const hull of [798, 738, 790, 765, 775]) {
  const s = session(hull),
    before = s.data.credits;
  assert.ok(s.data.stellar, 'real shipyard and outfitter');
  g.buyShip(s, hull);
  assert.ok(s.data.credits < before, 'same hull purchase must cost money');
  const bought = s.data.credits;
  g.buyShip(s, hull);
  assert.ok(s.data.credits < bought, 'repeat cannot mint credits');
  const alternative = g
    .yard(STELLARS[s.data.stellar], s.data)
    .find((id) => id !== hull && !WINGMATES.includes(id));
  assert.ok(alternative, 'alternate hull in the same real yard');
  const beforeRoundTrip = s.data.credits;
  g.buyShip(s, alternative);
  g.buyShip(s, hull);
  assert.equal(s.data.ship.hull, hull);
  assert.ok(s.data.credits < beforeRoundTrip, 'alternating hulls cannot create credits');
  const d = s.data;
  delete d.ship.stockOutfits; // Existing saves migrate conservatively.
  const initial = d.credits;
  for (const [id, n] of Object.entries({ ...d.ship.outfits })) g.outfit(s, +id, -n);
  assert.ok(
    d.credits - initial + g.tradeIn(d) <= Math.round(A.ships[hull].cost * 0.5) + 5,
    'stripping then trading cannot double-count factory gear',
  );
  const stock = makeLoadout(A, hull),
    id = +Object.keys(stock.outfits)[0];
  d.ship = stock;
  g.outfit(s, id, -1);
  const afterSale = d.credits;
  g.outfit(s, id, 1);
  assert.equal(d.ship.outfits[id], 1, 'factory mount accepts paid replacement');
  if (d.credits < afterSale) {
    const afterBuy = d.credits;
    g.outfit(s, id, -1);
    assert.equal(
      d.credits - afterBuy,
      Math.round(O[id].cost * 0.5),
      'paid replacement retains retail resale',
    );
  }
}
// Every removable factory bank can be removed and restored, including counts above generic shop limits.
const realOutfitter = g.outfitter;
for (const H of Object.values(A.ships).filter((h) => !h.npcOnly)) {
  const s = session(H.id, 1000000000);
  s.data.stellar ||= Object.values(STELLARS).find((p) => p.svc.includes('O')).id;
  const factory = { ...s.data.ship.outfits };
  g.outfitter = () => Object.keys(O).map(Number);
  for (const [id, n] of Object.entries(factory)) {
    g.outfit(s, +id, -n);
    assert.equal(s.data.ship.outfits[id] || 0, 0, `${H.name}: remove factory bank`);
    g.outfit(s, +id, n);
    assert.equal(s.data.ship.outfits[id], n, `${H.name}: restore complete factory bank`);
  }
}
g.outfitter = realOutfitter;
assert.ok(
  repairBasis(A, 754) > A.ships[754].cost,
  'named repair price uses service basis, not recruitment fee',
);
assert.equal(repairBasis(A, 798), A.ships[798].cost, 'ordinary ship repair price unchanged');
// Legacy ship with a missing factory item: buying it must not mark it as factory stock.
const legacy = session(798);
const legacyId = +Object.keys(legacy.data.ship.outfits)[0];
legacy.data.ship.outfits = {};
delete legacy.data.ship.stockOutfits;
ensureStockOutfits(A, legacy.data.ship);
legacy.data.ship.outfits[legacyId] = 1;
assert.equal(
  loadoutValue(A, legacy.data.ship) - loadoutValue(A, { ...legacy.data.ship, outfits: {} }),
  Math.round(O[legacyId].cost * 0.5),
);
const port = Object.values(STELLARS).find((p) => p.site);
const dockGame = {
  A,
  O,
  docksInit: (d) => d,
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
  storedValue: HangarOperations.storedValue,
};
dockGame.portService = Game.prototype.createPortService.call(dockGame);
for (const hull of WINGMATES) {
  const s = {
    data: {
      credits: 10000,
      stellar: port.id,
      station: { site: port.id, ops: 4 },
      dock: [],
      shipless: true,
    },
  };
  DocksOperations.buyToHangar.call(dockGame, s, hull);
  assert.equal(s.data.dock.length, 1);
  DocksOperations.buyToHangar.call(dockGame, s, hull);
  assert.equal(s.data.dock.length, 1, 'cannot recruit a second copy of a named companion');
  assert.equal(s.data.credits, 5000);
  HangarOperations.dockOp.call(dockGame, s, { op: 'sell', uid: 'test-ship' });
  assert.equal(s.data.credits, 7500, 'companion liquidation cannot create money');
}
console.log(
  'Ship economy passed: all stock prices/mounts, 5 formerly profitable hulls, stock stripping, paid replacements, legacy provenance, and 6 unique named recruits.',
);
