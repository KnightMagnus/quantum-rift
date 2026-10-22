import { mockCanvasContext } from './helpers/mocks.ts';
import type { ShipChatState, ShipChatMessage } from '../client/chat_bubbles.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import {
  receiveShipChat,
  drawShipChat,
  wrapShipChat,
  CHAT_BUBBLE_MS,
} from '../client/chat_bubbles.ts';

const player = (identifier: number, horizontalPosition = 180) => ({
  id: identifier,
  hull: 1,
  fl: 16,
  ar: 100,
  rx: horizontalPosition,
  ry: 200,
});
const game: ShipChatState = {
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
for (const channel of ['all', 'armada', 'fleet', 'dm', undefined])
  assert.equal(receiveShipChat(game, { ...message, ch: channel }, 100), false);
for (const ship of [undefined, null, '2', 0, -1, Infinity])
  assert.equal(receiveShipChat(game, { ...message, ship } as ShipChatMessage, 100), false);
assert.equal(receiveShipChat(game, { ...message, sys: 'beta' }, 100), false);
assert.equal(receiveShipChat(game, { ...message, msg: '\n\t' }, 100), false);
assert.equal(receiveShipChat(game, message, 100), true);
assert.equal(
  requiredFixtureValue(requiredFixtureValue(game.chatBubbles).get(2)).until,
  100 + CHAT_BUBBLE_MS,
);
receiveShipChat(game, { ...message, msg: 'Replaced' }, 200);
assert.equal(requiredFixtureValue(game.chatBubbles).size, 1);
assert.equal(requiredFixtureValue(requiredFixtureValue(game.chatBubbles).get(2)).text, 'Replaced');
assert.equal(receiveShipChat({ ...game, landed: {} }, message, 200), false);

const calls: Parameters<CanvasRenderingContext2D['fillText']>[] = [];
const context = mockCanvasContext({
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
  measureText: (session: string) => ({ width: Array.from(session).length * 7 }),
  fillText: (...args) => calls.push(args),
});
const draw = (currentTime = 300) => {
  calls.length = 0;
  drawShipChat(
    game,
    context,
    640,
    480,
    (horizontalPosition2) => horizontalPosition2,
    (verticalPosition) => verticalPosition,
    currentTime,
  );
  return calls
    .filter((textCall) => textCall[0] !== 'SYSTEM COMMS')
    .map((textCall2) => textCall2[0]);
};
assert.deepEqual(draw(), ['Replaced']);
assert.equal(calls[0][0], 'SYSTEM COMMS', 'Speech frame has a separate transmission header');
const priorX = calls[0][1];
requiredFixtureValue(game.ents.get(2)).rx += 50;
draw();
assert.equal(calls[0][1], priorX + 50, 'bubble follows entity position, not chat-time coordinates');
requiredFixtureValue(game.ents.get(2)).rx = -1;
assert.deepEqual(draw(), [], 'offscreen ships have no bubble');
requiredFixtureValue(game.ents.get(2)).rx = 240;
requiredFixtureValue(game.ents.get(2)).fl = 0;
assert.deepEqual(draw(), [], 'NPC or mismatched entity does not receive player speech');
requiredFixtureValue(game.ents.get(2)).fl = 16;
assert.deepEqual(draw(200 + CHAT_BUBBLE_MS), []);
assert.equal(requiredFixtureValue(game.chatBubbles).size, 0);
receiveShipChat(game, message, 100);
game.ents.delete(2);
assert.deepEqual(draw(), []);
assert.equal(
  requiredFixtureValue(game.chatBubbles).size,
  0,
  'departed or landed sender is removed',
);
game.ents.set(2, player(2));
receiveShipChat(game, message, 100);
requiredFixtureValue(game.ents.get(2)).ar = 0;
assert.deepEqual(draw(), []);
assert.equal(requiredFixtureValue(game.chatBubbles).size, 0, 'destroyed sender is removed');
game.ents.set(2, player(2));
receiveShipChat(game, message, 100);
game.sys = 'beta';
assert.deepEqual(draw(), []);
assert.equal(
  requiredFixtureValue(game.chatBubbles).size,
  0,
  'system transition discards old speech',
);
game.sys = 'alpha';
receiveShipChat(game, message, 100);
requiredFixtureValue(game.view).armor = 0;
assert.deepEqual(draw(), []);
assert.equal(
  requiredFixtureValue(game.chatBubbles).size,
  0,
  'dead recipient has no floating speech',
);
requiredFixtureValue(game.view).armor = 100;

// Canvas text is literal, never interpreted as HTML; grapheme wrapping preserves emoji sequences.
const markup = '<img src=x onerror=alert(1)>';
receiveShipChat(game, { ...message, msg: markup }, 100);
assert.deepEqual(draw(), [markup]);
const cluster = '👩‍🚀';
assert.deepEqual(
  wrapShipChat(
    cluster.repeat(4),
    (session) =>
      [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(session)].length,
    2,
  ),
  [cluster.repeat(2), cluster.repeat(2)],
);
const lines = wrapShipChat('abcdefghijklmno', (session) => session.length, 4, 3);
assert.equal(lines.length, 3);
assert.equal(lines[2], 'ijk…');
assert(lines.every((session) => session.length <= 4));
receiveShipChat(game, { ...message, msg: cluster.repeat(300) }, 100);
assert.equal(
  [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      requiredFixtureValue(requiredFixtureValue(game.chatBubbles).get(2)).text,
    ),
  ].length,
  240,
);
console.log(
  'System-chat speech bubbles: receive filters, identity, follow, expiry, visibility, literal text and Unicode wrapping passed.',
);
