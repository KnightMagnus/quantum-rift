// Readable research and trait bonus labels, and off-screen arrows that stay clear of HUD cards.
import assert from 'node:assert/strict';
import { RESEARCH } from '../shared/galaxy.ts';
import { statBonusText } from '../shared/hangar.ts';
import { TRAITS } from '../shared/syndicate.ts';
import { EDGE_ARROW_MARGIN, edgeArrowAnchor } from '../client/edge-arrow.ts';

assert.equal(statBonusText({ shieldPct: 10 }), '+10% shields');
assert.equal(
  statBonusText({ shieldPct: 12, shieldRePct: 10 }),
  '+12% shields, +10% shield recharge',
);
assert.equal(statBonusText({ speedPct: 5, fuel: 100 }), '+5% top speed, +100 fuel capacity');
assert.equal(statBonusText({ tradePct: 2 }), '2% better buy and sell prices');
assert.equal(statBonusText({ silo: 3 }), '+3 Workshop silo slots');
assert.equal(statBonusText({ shuttleSafe: 40 }), '-40% shuttle damage risk');
// Every research and trait bonus reads as words, never as a raw stat key.
for (const bonus of [...RESEARCH, ...Object.values(TRAITS)].map((entry) => entry.bonus)) {
  const text = statBonusText(bonus);
  assert.doesNotMatch(text, /[a-z][A-Z]/, `camelCase stat key shown raw in "${text}"`);
}

const width = 2524,
  height = 880;
const careerCard = { left: 12, top: 12, right: 342, bottom: 139 };
assert.equal(
  edgeArrowAnchor(width, height, 900, 400, [careerCard]),
  null,
  'on-screen targets need no arrow',
);
const upperLeft = { x: width / 2 - 2 * 1262, y: height / 2 - 2 * 440 };
const unobstructed = edgeArrowAnchor(width, height, upperLeft.x, upperLeft.y)!;
assert.ok(
  unobstructed.x > careerCard.left &&
    unobstructed.x < careerCard.right &&
    unobstructed.y < careerCard.bottom,
  'without obstacles the upper-left arrow sits where the career card is drawn',
);
const clearance = { x: 90, y: 30 };
const cleared = edgeArrowAnchor(width, height, upperLeft.x, upperLeft.y, [careerCard], clearance)!;
const insidePadded =
  cleared.x > careerCard.left - clearance.x + 1 &&
  cleared.x < careerCard.right + clearance.x - 1 &&
  cleared.y > careerCard.top - clearance.y + 1 &&
  cleared.y < careerCard.bottom + clearance.y - 1;
assert.ok(
  !insidePadded,
  `arrow ${JSON.stringify(cleared)} clears the career card and its label room`,
);
// The arrow keeps pointing the same way, only nearer the centre.
const direction = (point: { x: number; y: number }) =>
  Math.atan2(point.y - height / 2, point.x - width / 2);
assert.ok(Math.abs(direction(cleared) - direction(upperLeft)) < 1e-9, 'same bearing');
// Arrows elsewhere on the border are unaffected by the card.
const right = edgeArrowAnchor(width, height, width + 500, height / 2, [careerCard], clearance)!;
assert.ok(
  Math.abs(right.x - (width - EDGE_ARROW_MARGIN)) < 1e-6 && Math.abs(right.y - height / 2) < 1e-6,
);
// Overlapping padded cards must be cleared regardless of their DOM order.
const cards = [
  { left: 650, right: 850, top: 200, bottom: 400 },
  { left: 800, right: 1000, top: 200, bottom: 400 },
];
for (const order of [cards, [...cards].reverse()]) {
  const anchor = edgeArrowAnchor(1000, 600, 1500, 300, order, { x: 0, y: 0 })!;
  assert.equal(anchor.x, 650, 'clear both cards independently of obstacle order');
}
console.log('PASS readable research/trait bonuses and HUD-clear edge arrows');
