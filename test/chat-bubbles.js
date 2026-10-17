import assert from 'node:assert/strict';
import {
  receiveShipChat,
  drawShipChat,
  wrapShipChat,
  CHAT_BUBBLE_MS,
} from '../client/chat_bubbles.js';

const player = (id, x = 180) => ({ id, hull: 1, fl: 16, ar: 100, rx: x, ry: 200 });
const G = {
  sys: 'alpha',
  myId: 1,
  view: { ...player(1), armor: 100 },
  ents: new Map([
    [1, player(1)],
    [2, player(2, 240)],
  ]),
  zoom: 1,
  spriteScale: 1.25,
  A: { ships: { 1: { size: 40 } } },
};
const message = { ch: 'sys', sys: 'alpha', ship: 2, msg: 'Hello, traveller' };
for (const ch of ['all', 'armada', 'fleet', 'dm', undefined])
  assert.equal(receiveShipChat(G, { ...message, ch }, 100), false);
for (const ship of [undefined, null, '2', 0, -1, Infinity])
  assert.equal(receiveShipChat(G, { ...message, ship }, 100), false);
assert.equal(receiveShipChat(G, { ...message, sys: 'beta' }, 100), false);
assert.equal(receiveShipChat(G, { ...message, msg: '\n\t' }, 100), false);
assert.equal(receiveShipChat(G, message, 100), true);
assert.equal(G.chatBubbles.get(2).until, 100 + CHAT_BUBBLE_MS);
receiveShipChat(G, { ...message, msg: 'Replaced' }, 200);
assert.equal(G.chatBubbles.size, 1);
assert.equal(G.chatBubbles.get(2).text, 'Replaced');
assert.equal(receiveShipChat({ ...G, landed: {} }, message, 200), false);

const calls = [];
const ctx = {
  save() {},
  restore() {},
  beginPath() {},
  rect() {},
  fill() {},
  stroke() {},
  strokeRect() {},
  fillRect() {},
  moveTo() {},
  lineTo() {},
  measureText: (s) => ({ width: Array.from(s).length * 7 }),
  fillText: (...args) => calls.push(args),
};
const draw = (now = 300) => {
  calls.length = 0;
  drawShipChat(
    G,
    ctx,
    640,
    480,
    (x) => x,
    (y) => y,
    now,
  );
  return calls.map((c) => c[0]);
};
assert.deepEqual(draw(), ['Replaced']);
const priorX = calls[0][1];
G.ents.get(2).rx += 50;
draw();
assert.equal(calls[0][1], priorX + 50, 'bubble follows entity position, not chat-time coordinates');
G.ents.get(2).rx = -1;
assert.deepEqual(draw(), [], 'offscreen ships have no bubble');
G.ents.get(2).rx = 240;
G.ents.get(2).fl = 0;
assert.deepEqual(draw(), [], 'NPC or mismatched entity does not receive player speech');
G.ents.get(2).fl = 16;
assert.deepEqual(draw(200 + CHAT_BUBBLE_MS), []);
assert.equal(G.chatBubbles.size, 0);
receiveShipChat(G, message, 100);
G.ents.delete(2);
assert.deepEqual(draw(), []);
assert.equal(G.chatBubbles.size, 0, 'departed or landed sender is removed');
G.ents.set(2, player(2));
receiveShipChat(G, message, 100);
G.ents.get(2).ar = 0;
assert.deepEqual(draw(), []);
assert.equal(G.chatBubbles.size, 0, 'destroyed sender is removed');
G.ents.set(2, player(2));
receiveShipChat(G, message, 100);
G.sys = 'beta';
assert.deepEqual(draw(), []);
assert.equal(G.chatBubbles.size, 0, 'system transition discards old speech');
G.sys = 'alpha';
receiveShipChat(G, message, 100);
G.view.armor = 0;
assert.deepEqual(draw(), []);
assert.equal(G.chatBubbles.size, 0, 'dead recipient has no floating speech');
G.view.armor = 100;

// Canvas text is literal, never interpreted as HTML; grapheme wrapping preserves emoji sequences.
const markup = '<img src=x onerror=alert(1)>';
receiveShipChat(G, { ...message, msg: markup }, 100);
assert.deepEqual(draw(), [markup]);
const cluster = '👩‍🚀';
assert.deepEqual(
  wrapShipChat(
    cluster.repeat(4),
    (s) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length,
    2,
  ),
  [cluster.repeat(2), cluster.repeat(2)],
);
const lines = wrapShipChat('abcdefghijklmno', (s) => s.length, 4, 3);
assert.equal(lines.length, 3);
assert.equal(lines[2], 'ijk…');
assert(lines.every((s) => s.length <= 4));
receiveShipChat(G, { ...message, msg: cluster.repeat(300) }, 100);
assert.equal(
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(G.chatBubbles.get(2).text)]
    .length,
  240,
);
console.log(
  'System-chat speech bubbles: receive filters, identity, follow, expiry, visibility, literal text and Unicode wrapping passed.',
);
