import assert from 'node:assert/strict';
import { AuthorityCallbacks } from '../server/authority-callbacks.ts';
import { cloneGameState } from '../server/portable-clone.ts';
import { credits } from '../shared/rules.ts';
let now = 1000;
const callbacks = new AuthorityCallbacks(() => now);
const calls: string[] = [];
callbacks.schedule(() => calls.push('first'), 50);
now = 1049;
callbacks.advance();
assert.deepEqual(calls.slice(), []);
now = 1050;
callbacks.advance();
callbacks.advance();
assert.deepEqual(calls.slice(), ['first']);
callbacks.schedule(() => {
  calls.push('second');
  callbacks.schedule(() => calls.push('nested'), 0);
}, 50);
now = 1099;
callbacks.advance();
assert.deepEqual(calls.slice(), ['first']);
now = 1100;
callbacks.advance();
assert.deepEqual(calls.slice(), ['first', 'second']);
callbacks.advance();
callbacks.advance();
assert.deepEqual(calls.slice(), ['first', 'second', 'nested']);
assert.throws(() => callbacks.schedule(() => {}, -1), /Invalid callback delay/);
const original = {
  map: new Map([['one', { value: 1 }]]),
  set: new Set([1]),
  date: new Date(1000),
  list: [1, 2],
};
const copied = cloneGameState(original);
assert.deepEqual(copied, original);
assert.notEqual(copied.map.get('one'), original.map.get('one'));
copied.list.push(3);
assert.deepEqual(original.list, [1, 2]);
const cycle: { self?: object } = {};
cycle.self = cycle;
const clone = cloneGameState(cycle);
assert.equal(clone.self, clone);
const poisoned = JSON.parse('{"__proto__":{"polluted":true}}');
assert.equal(Object.prototype.hasOwnProperty.call(cloneGameState(poisoned), '__proto__'), true);
assert.throws(() => cloneGameState(() => {}), /Uncloneable/);
assert.equal(credits(25000), '25,000');
assert.equal(credits(-1000), '-1,000');
assert.equal(credits(2.5), '3');
assert.equal(credits(1000000), '1M');
assert.equal(credits(1250000), '1.25M');
console.log(
  'Authority callbacks: repeated drains, nested scheduling, no early/duplicate execution and portable clone isolation passed.',
);
