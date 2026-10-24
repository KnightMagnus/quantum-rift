import assert from 'node:assert/strict';
import {
  parseTradeAction,
  parseRefineryAction,
  parseTowingAction,
} from '../shared/wire-actions.ts';
import { validEconomicPayload } from '../shared/wire-payloads.ts';
import { Game } from '../server/game.ts';
import { mockGame, mockSession } from './helpers/mocks.ts';
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
