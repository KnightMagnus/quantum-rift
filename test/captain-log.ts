import assert from 'node:assert/strict';
import type { ClientGameState } from '../client/main.ts';
import { captainLogHtml } from '../client/captain-log.ts';
import { filterMissions } from '../client/mission-details.ts';
import { missionTargets } from '../client/missions.ts';
import { STORY } from '../shared/story.ts';

const state = {
  sys: 'emberlight',
  A: { ships: { 1: { strength: 10 } } },
  you: {
    tut: 999,
    ship: { hull: 1, outfits: {} },
    missions: [],
    arcs: [],
    transportCapacity: { cargo: 20, passengerSeats: 2 },
    log: [{ t: 1, text: 'Ship destroyed. Insurance charge 123 credits. <unsafe>' }],
    story: { pass: true },
  },
} as unknown as ClientGameState;
assert.equal(captainLogHtml({} as ClientGameState), '');
const empty = captainLogHtml(state);
assert.match(empty, /No main objective is active/);
assert.match(empty, /Insurance charge 123 credits/);
assert.match(empty, /&lt;unsafe&gt;/);
assert.doesNotMatch(empty, /<unsafe>/);
assert.match(empty, /not the outcome of a fight/);
const original = [...state.you!.log];
captainLogHtml(state);
assert.deepEqual(state.you!.log, original, 'Rendering cannot reorder saved history');
const offers = [
  { id: 'large', type: 'cargo', qty: 21 },
  { id: 'small', type: 'cargo', qty: 1 },
  { id: 'seats', type: 'passenger', pax: 3 },
  { id: 'fits', type: 'passenger', pax: 2 },
];
assert.deepEqual(
  filterMissions(state, offers).map((offer) => offer.id),
  ['small', 'fits', 'large', 'seats'],
);
assert.equal(offers[0].id, 'large', 'Board sorting must not mutate authoritative offers');
assert.deepEqual(
  filterMissions(state, offers, 'mission', true).map((offer) => offer.id),
  offers.map((offer) => offer.id),
);
state.jobFeasible = true;
assert.deepEqual(
  filterMissions(state, offers).map((offer) => offer.id),
  ['small', 'fits'],
);
state.you!.story = {
  active: { id: STORY[0].id, brief: 'Disclosed preparation: repair first.', ready: false },
  pass: false,
} as NonNullable<ClientGameState['you']>['story'];
const current = missionTargets(state).find((target) => target.kind === 'story');
assert.equal(current?.text, 'Disclosed preparation: repair first.');
const active = captainLogHtml(state);
assert.match(active, /Disclosed preparation: repair first/);
assert.doesNotMatch(active, new RegExp(STORY.at(-1)!.title));
console.log(
  'Captain log: disclosed objectives, preparation, saved history, escaping and eligible-first board order passed.',
);
