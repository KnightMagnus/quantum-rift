import assert from 'node:assert/strict';
import {
  parseTradeAction,
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
const gated = mockGame({
  db: { economicFrozen: true },
  toast() {
    calls.push(99);
  },
});
const blocked = mockSession({ data: {}, msgT: Date.now(), msgs: 0, actT: 17 });
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
