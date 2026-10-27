import assert from 'node:assert/strict';
import {
  parseTradeAction,
  parsePortPurchaseAction,
  parseRefineryAction,
  parseTowingAction,
  parseIndustrialAction,
  validIndustrialRequest,
} from '../shared/wire-actions.ts';
import { validEconomicPayload } from '../shared/wire-payloads.ts';
import { Game } from '../server/game.ts';
import { mockGame, mockSession } from './helpers/mocks.ts';
import { dredgePilot } from './helpers/dredge-fixture.ts';
import type { IndustrialRequest } from '../server/industrial-contracts.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';

const trade = { t: 'trade', cid: 'food', qty: '3.9' };
assert.equal(parseTradeAction(trade), trade, 'parser does not silently normalize quantity');
for (const invalid of [
  null,
  [],
  3,
  { ...trade, qty: Infinity },
  { ...trade, qty: null },
  { ...trade, qty: [] },
  { ...trade, qty: 'Infinity' },
  { ...trade, cid: 'x'.repeat(201) },
  { ...trade, credits: 1 },
  { ...trade, lots: { common: -1, rich: 0, pure: 0 } },
]) {
  assert.equal(parseTradeAction(invalid), null);
}
assert.ok(parseRefineryAction({ t: 'refinery', op: 'list' }));
assert.equal(parseRefineryAction({ t: ['refinery'], op: 'list' }), null);
assert.equal(parseTowingAction({ t: 'towing', op: ['attach'], id: 1, revision: 1 }), null);
assert.ok(parseRefineryAction({ t: 'miningOrder', op: 'accept', id: 'order' }));
assert.equal(parseRefineryAction({ t: 'refinery', op: 'accept' }), null);
assert.equal(parseRefineryAction({ t: 'refinery', op: 'quote', n: NaN }), null);
assert.equal(
  parseTowingAction({ t: 'towing', op: 'attach', id: 1, revision: 1, to: 'Other' }),
  null,
);
assert.ok(parseTowingAction({ t: 'towing', op: 'offer', id: 1, revision: 1, to: 'Other' }));
const game = refineryGame();
const session = refineryPilot(game, 'Wire Contract');
const before = JSON.stringify({ player: session.data, world: game.db.world });
for (const incoming of [
  null,
  [],
  { t: 'unknown' },
  { t: 'trade', cid: 'food', qty: Infinity },
  { t: 'trade', cid: 'food', qty: { value: 3 } },
  { t: 'trade', cid: 'food', qty: 3, lots: [] },
  { t: 'refinery', op: 'quote', recipe: 'alloy', n: Infinity },
  { t: 'refinery', op: 'submit', id: 'x'.repeat(201) },
  { t: 'miningOrder', op: 'accept', id: [] },
  { t: 'towing', op: 'deliver', id: 1, revision: Infinity, port: 'earth' },
  { t: 'towing', op: ['attach'], id: 1, revision: 1 },
])
  game.onMessage(session, incoming);
assert.equal(
  JSON.stringify({ player: session.data, world: game.db.world }),
  before,
  'malformed economic requests do not mutate accounts/world',
);
const calls: number[] = [];
game.trade = (_session, _cid, quantity) => {
  calls.push(quantity);
};
game.onMessage(session, trade);
game.onMessage(session, { ...trade, qty: -3.9 });
game.onMessage(session, { ...trade, qty: 4294967297 });
assert.deepEqual(
  calls,
  [3, -3, 1],
  'numeric text, truncation and signed-int wrapping stay compatible',
);
const projected = game.playerPayload(
  session,
  session.data,
  game.features.shipStats.stats(session.data),
);
assert.ok(
  validEconomicPayload(JSON.parse(JSON.stringify({ t: 'you', d: projected }))),
  'real player projection satisfies economic header',
);
for (const invalid of [
  { t: 'you', d: null },
  { t: 'you', d: { ...projected, credits: Infinity } },
  { t: 'you', d: { ...projected, cargo: [] } },
  { t: 'landed', stellar: 'earth', offers: null },
  { t: 'refineryQuote', quote: [] },
  { t: 'refineryFuelQuote', quote: { id: 'x' } },
  { t: 'you', d: { ...projected, nested: Array(100001).fill(0) } },
])
  assert.equal(validEconomicPayload(invalid), false);
const blocked = mockSession({ id: 1, data: {}, msgT: Date.now(), msgs: 0, actT: 17 });
const gated = mockGame({
  db: { economicFrozen: true },
  sessions: new Map([[blocked.id, blocked]]),
  toast() {
    calls.push(99);
  },
});
Game.prototype.onMessage.call(gated, blocked, { t: 'trade', qty: null });
assert.equal(blocked.actT, 17, 'freeze denial precedes malformed economic validation/activity');
assert.equal(calls.at(-1), 99);
blocked.msgs = 120;
Game.prototype.onMessage.call(gated, blocked, null);
assert.equal(blocked.msgs, 121, 'even invalid roots count toward flood guard');
console.log(
  'Shared economic request contracts, legacy coercion, real account denials and bounded payload headers passed.',
);

const industrial = { t: 'industrial', op: 'recipe', recipe: 'alloy', grade: 'rich' };
assert.equal(
  parseIndustrialAction(industrial),
  industrial,
  'industrial selectors are not normalized',
);
assert.ok(validIndustrialRequest({ op: 'off' }), 'direct calls may omit t');
assert.equal(parseIndustrialAction({ op: 'off' }), null, 'transport requires t');
const malformedIndustrial: unknown[] = [
  null,
  [],
  3,
  { t: 'industrial' },
  { t: ['industrial'], op: 'off' },
  { t: 'industrial', op: null },
  { t: 'industrial', op: [] },
  { t: 'industrial', op: {} },
  { t: 'industrial', op: 'x'.repeat(201) },
  { ...industrial, recipe: null },
  { ...industrial, recipe: [] },
  { ...industrial, recipe: {} },
  { ...industrial, recipe: Infinity },
  { ...industrial, recipe: -Infinity },
  { ...industrial, recipe: 'x'.repeat(201) },
  { ...industrial, grade: null },
  { ...industrial, grade: [] },
  { ...industrial, grade: {} },
  { ...industrial, grade: NaN },
  { ...industrial, grade: 'x'.repeat(201) },
  { ...industrial, heat: 0 },
  { ...industrial, outputs: { plasma: 999 } },
  { ...industrial, workMs: 999 },
  { ...industrial, n: 999 },
  { ...industrial, owner: 'Other' },
  Object.assign(Object.create({ inherited: true }), industrial),
  { ...industrial, [Symbol('authority')]: 1 },
];
for (const invalid of malformedIndustrial) assert.equal(parseIndustrialAction(invalid), null);
const dredge = dredgePilot();
assert.ok(dredge.s.data.ship.industrial, 'denials exercise initialized ship state first');
const industrialSnapshot = () =>
  JSON.stringify({ player: dredge.s.data, world: dredge.g.db.world });
for (const initialized of [true, false]) {
  if (!initialized) {
    delete dredge.s.data.ship.industrial;
    delete dredge.s.data.ship.uid;
  }
  for (const incoming of [
    ...malformedIndustrial,
    { ...industrial, recipe: 'not-a-recipe' },
    { ...industrial, grade: 'not-a-grade' },
    { t: 'industrial', op: 'sweep', recipe: 'alloy' },
    { t: 'industrial', op: 'smelter', grade: 'rich' },
    { t: 'industrial', op: 'harvest', recipe: 'alloy' },
  ]) {
    const beforeIndustrial = industrialSnapshot();
    dredge.g.features.industrial.command(dredge.s, incoming as IndustrialRequest);
    assert.equal(
      industrialSnapshot(),
      beforeIndustrial,
      'direct malformed denial cannot initialize or mutate',
    );
    dredge.g.onMessage(dredge.s, incoming);
    assert.equal(
      industrialSnapshot(),
      beforeIndustrial,
      'routed malformed denial cannot initialize or mutate',
    );
  }
}
dredge.g.features.industrial.command(dredge.s, { op: 'recipe', recipe: 'cells', grade: 'pure' });
assert.equal(dredge.s.data.ship.industrial!.recipe, 'cells');
assert.equal(dredge.s.data.ship.industrial!.grade, 'pure');
dredge.g.onMessage(dredge.s, { t: 'industrial', op: 'sweep' });
assert.equal(dredge.s.data.ship.industrial!.sweep, true);
dredge.g.onMessage(dredge.s, { t: 'industrial', op: 'smelter' });
assert.equal(dredge.s.data.ship.industrial!.smelter, true);
// Legacy all-off ignores bounded selectors rather than applying them.
dredge.g.features.industrial.command(dredge.s, { op: 'off', recipe: 'ignored', grade: 'common' });
assert.equal(dredge.s.data.ship.industrial!.sweep, false);
assert.equal(dredge.s.data.ship.industrial!.smelter, false);
assert.equal(dredge.s.data.ship.industrial!.recipe, 'cells');
assert.equal(dredge.s.data.ship.industrial!.grade, 'pure');
dredge.g.onMessage(dredge.s, { t: 'industrial', op: 'off', recipe: 'ignored', grade: 'ignored' });
assert.equal(
  dredge.s.data.ship.industrial!.grade,
  'pure',
  'all-off still ignores legacy text selectors',
);
for (const gate of ['frozen', 'paused', 'dead', 'docked', 'wrong-hull'] as const) {
  const previousHull = dredge.s.data.ship.hull;
  if (gate === 'frozen') dredge.g.db.economicFrozen = true;
  if (gate === 'paused') dredge.g.paused = true;
  if (gate === 'dead') dredge.s.ent.dead = true;
  if (gate === 'docked') dredge.s.data.stellar = 'earth';
  if (gate === 'wrong-hull') dredge.s.data.ship.hull = 1;
  const beforeGate = industrialSnapshot();
  dredge.g.features.industrial.command(dredge.s, { op: 'sweep' });
  dredge.g.onMessage(dredge.s, { t: 'industrial', op: 'sweep' });
  assert.equal(industrialSnapshot(), beforeGate, `${gate} prevents industrial mutation`);
  dredge.g.db.economicFrozen = false;
  dredge.g.paused = false;
  dredge.s.ent.dead = false;
  dredge.s.data.stellar = null;
  dredge.s.data.ship.hull = previousHull;
}
console.log(
  'Industrial parser, direct/routed no-mutation denials, optional discriminator and all-off selectors passed.',
);

// Port requests share one schema before either transport reaches settlement.
const purchases = [
  { t: 'buyship', hull: '201.9', store: true },
  { t: 'outfit', id: '5.9', n: '-2.9' },
  { t: 'buymat', mat: 'alloy', grade: '2.9', n: '3.9' },
];
const purchaseDenials: unknown[] = [
  null,
  [],
  3,
  { t: 'buyship' },
  { t: 'outfit' },
  { t: 'buymat' },
];
for (const purchase of purchases) {
  assert.equal(parsePortPurchaseAction(purchase), purchase, 'preserve numeric text verbatim');
  purchaseDenials.push({ ...purchase, price: 0 }, { ...purchase, credits: 999 });
  for (const field of purchase.t === 'buyship'
    ? ['hull']
    : purchase.t === 'outfit'
      ? ['id', 'n']
      : ['grade', 'n'])
    for (const invalid of [null, [], {}, true, Infinity, NaN, 'Infinity', 'x'.repeat(201)])
      purchaseDenials.push({ ...purchase, [field]: invalid });
}
purchaseDenials.push(
  { t: 'buyship', hull: 201, store: [] },
  { t: 'buyship', hull: 201, store: 'true' },
  { t: 'buymat', mat: [], grade: 0, n: 1 },
  { t: 'buymat', mat: '__proto__', grade: 0, n: 1 },
  { t: 'buymat', mat: 'x'.repeat(201), grade: 0, n: 1 },
  Object.assign(Object.create({ inherited: true }), purchases[0]),
);
const purchaseGame = refineryGame();
const purchaser = refineryPilot(purchaseGame, 'Port Purchaser');
for (const incoming of purchaseDenials) {
  assert.equal(parsePortPurchaseAction(incoming), null);
  const beforePurchase = JSON.stringify({ player: purchaser.data, world: purchaseGame.db.world });
  purchaser.msgs = 0;
  purchaseGame.onMessage(purchaser, incoming);
  assert.equal(
    JSON.stringify({ player: purchaser.data, world: purchaseGame.db.world }),
    beforePurchase,
  );
}
const purchaseCalls: unknown[][] = [];
purchaseGame.buyShip = (_session, hull) => {
  purchaseCalls.push(['ship', hull]);
};
purchaseGame.features.docks.buyToHangar = (_session, hull) => {
  purchaseCalls.push(['hangar', hull]);
};
purchaseGame.outfit = (_session, id, quantity) => {
  purchaseCalls.push(['outfit', id, quantity]);
};
const buyMaterial = purchaseGame.buyMat.bind(purchaseGame);
purchaseGame.buyMat = (_session, mat, grade, quantity) => {
  purchaseCalls.push(['material', mat, grade, quantity]);
};
for (const incoming of [
  ...purchases,
  { t: 'buyship', hull: 4294967497 },
  { t: 'outfit', id: 5, n: '' },
])
  purchaseGame.onMessage(purchaser, incoming);
assert.deepEqual(
  purchaseCalls,
  [
    ['hangar', 201],
    ['outfit', 5, -2],
    ['material', 'alloy', 2, 3],
    ['ship', 201],
    ['outfit', 5, 0],
  ],
  'purchase routes retain signed-int wrapping, truncation, numeric text, empty text and hangar selection',
);
purchaseGame.buyMat = buyMaterial;
const { STELLARS } = await import('../shared/galaxy.ts');
const materialPort = STELLARS[purchaser.data.stellar!];
assert.ok(materialPort, 'purchase fixture is docked at an ordinary port');
const materialOffer = purchaseGame.matsFor(materialPort, purchaser.data)[0];
assert.ok(materialOffer, 'ordinary port offers engineering material');
const materialBefore = purchaser.data.mats[materialOffer.mat][materialOffer.grade];
const creditsBefore = purchaser.data.credits;
purchaseGame.onMessage(purchaser, {
  t: 'buymat',
  mat: materialOffer.mat,
  grade: String(materialOffer.grade),
  n: '3.9',
});
assert.equal(purchaser.data.mats[materialOffer.mat][materialOffer.grade], materialBefore + 3);
assert.equal(purchaser.data.credits, creditsBefore - 3 * materialOffer.price);
purchaseGame.onMessage(purchaser, {
  t: 'buymat',
  mat: materialOffer.mat,
  grade: materialOffer.grade,
  n: -2.9,
});
assert.equal(purchaser.data.mats[materialOffer.mat][materialOffer.grade], materialBefore + 1);
assert.equal(
  purchaser.data.credits,
  creditsBefore - 3 * materialOffer.price + Math.round(2 * materialOffer.price * 0.6),
);
console.log(
  'Port purchase schemas, malformed no-mutation denials, legacy routing and authoritative material buy/sell passed.',
);

// Remaining action families share their executable discriminants across transports.
const { commandFields, parseClientAction } = await import('../shared/wire-commands.ts');
const registryTypes = new Set(Object.create(Game.prototype).createMessageHandlers().types);
assert.deepEqual(
  new Set([
    ...Object.keys(commandFields),
    'trade',
    'buyship',
    'outfit',
    'buymat',
    'refinery',
    'miningOrder',
    'towing',
    'industrial',
  ]),
  registryTypes,
  'every authenticated route has exactly one shared family contract',
);
const dispatches: unknown[] = [];
const commandPilot = refineryPilot(game, 'Command Denials');
const commandGame = mockGame({
  sessions: new Map([[commandPilot.id, commandPilot]]),
  db: { economicFrozen: false },
  messageHandlers: { dispatch: (...args: unknown[]) => dispatches.push(args) },
});
for (const [type, schema] of Object.entries(commandFields)) {
  for (const [field, guard] of Object.entries(schema)) {
    for (const invalid of [[], Infinity, NaN, 'x'.repeat(65537)]) {
      assert.equal(
        guard(invalid),
        false,
        `${type}.${field} rejects non-scalar/nonfinite/oversized values`,
      );
      commandPilot.msgs = 0;
      Game.prototype.onMessage.call(commandGame, commandPilot, { t: type, [field]: invalid });
    }
  }
  commandPilot.msgs = 0;
  Game.prototype.onMessage.call(commandGame, commandPilot, { t: type, mintedCredits: 999999 });
}
assert.deepEqual(
  dispatches,
  [],
  'malformed fields and unexpected authority never reach any service',
);
const commands = [
  { t: 'portrait', portraitId: 'fixture', name: 'Other', target: 123 },
  { t: 'input', seq: '7.9', th: 1, tu: '-99', nav: true, x: 999999, credits: 999999, dt: 99999 },
  { t: 'station', op: 'process', id: 'ore', all: 1, lots: { pure: 3 } },
  { t: 'docks', op: 'assign', k: '1', slot: 'lead', uid: null },
  { t: 'shuttle', op: 'crew', sid: 2, oid: null },
  { t: 'armada', op: 'contractReady', id: 'plan', revision: 4 },
  {
    t: 'trade2',
    op: 'offer',
    give: { credits: '15.9', items: { food: '3' }, lots: { food: { pure: 3 } } },
  },
  { t: 'bank', op: 'pay', amt: '17.9' },
  { t: 'hailin', op: 'answer', key: 'hail', k: 'repair' },
  { t: 'jettison', cid: 'ore', n: '4', lots: { pure: 4 } },
];
for (const command of commands) {
  assert.equal(parseClientAction(command), command, 'valid legacy selectors remain verbatim');
  commandPilot.msgs = 0;
  Game.prototype.onMessage.call(commandGame, commandPilot, command);
}
assert.equal(
  dispatches.length,
  commands.length,
  'bounded commands reach the common local/native dispatcher',
);
for (const incoming of [
  { t: 'trade2', op: 'offer', give: { credits: Infinity } },
  { t: 'trade2', op: 'offer', give: { items: [] } },
  { t: 'trade2', op: 'offer', give: { lots: { food: { pure: -1 } } } },
  { t: 'trade2', op: 'offer', give: { items: { constructor: 9 } } },
  { t: 'trade2', op: 'offer', give: { credits: 0, owner: 'Other' } },
  { t: 'station', op: 'not-an-operation' },
  { t: 'hailin', op: [] },
  { t: 'bank', op: 'borrow', amt: null },
]) {
  assert.equal(parseClientAction(incoming), null);
  const accountBefore = JSON.stringify({ player: session.data, world: game.db.world });
  session.msgs = 0;
  game.onMessage(session, incoming);
  assert.equal(
    JSON.stringify({ player: session.data, world: game.db.world }),
    accountBefore,
    'malformed non-economic commands cannot initialize/advance saved service state',
  );
}
console.log(
  'All authenticated action families, scalar bounds, nested trade offers and legacy selectors passed.',
);

for (const incoming of [
  { t: 'note', text: 'x'.repeat(4097) },
  { t: 'note', text: '😀'.repeat(2200) },
  {
    t: 'trade2',
    op: 'offer',
    give: {
      items: Object.fromEntries(
        Array.from({ length: 129 }, (_, index) => ['commodity' + index, 1]),
      ),
    },
  },
  { t: 'colony', op: 'build', kind: '__proto__' },
  { t: 'colony', op: 'build', kind: 'constructor' },
  { t: 'lower', op: 'hire', kind: 'constructor' },
])
  assert.equal(
    parseClientAction(incoming),
    null,
    'shared text, UTF-8, dictionary and prototype-selector bounds',
  );
const colonyPort = session.data.stellar!;
game.db.world.colonies[colonyPort] = {
  owner: game.db.key(session.data.name),
  lv: 1,
  buildings: [],
  store: {},
  t: Date.now(),
  name: 'Wire fixture colony',
};
const colonyBefore = JSON.stringify({ player: session.data, world: game.db.world });
for (const kind of ['__proto__', 'constructor', 'prototype']) {
  session.msgs = 0;
  game.onMessage(session, { t: 'colony', op: 'build', kind });
}
assert.equal(
  JSON.stringify({ player: session.data, world: game.db.world }),
  colonyBefore,
  'prototype catalog selectors cannot corrupt credits or append a colony building',
);
assert.ok(parseClientAction({ t: 'note', text: 'x'.repeat(4096) }));
console.log(
  'Common command text/UTF-8 envelope limits and real colony prototype-selector denials passed.',
);
