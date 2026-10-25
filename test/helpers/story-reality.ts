import assert from 'node:assert/strict';
import { storyShipOpacity, realityCaptain, storyScenery } from '../../client/story-reality.ts';
import type { RealityShip, RealityState } from '../../client/story-reality.ts';

/** Exercise viewer-only precedence and ownership without DOM or a live server. */
export function checkStoryReality(): void {
  const own = { id: 1, fl: 16 };
  const other: RealityShip = { id: 2, fl: 16 };
  const escort = { id: 3, fl: 0, owner: 2 };
  const fighter = { id: 4, fl: 0, owner: 3 };
  const traffic: RealityShip = { id: 5, fl: 0 };
  const state: RealityState = {
    myId: 1,
    ents: new Map([own, other, escort, fighter, traffic].map((ship) => [ship.id, ship])),
    you: { story: { flags: { breach_started: true } } },
  };
  assert.equal(realityCaptain(state, fighter), other);
  assert.equal(storyShipOpacity(state, own, 0), 1);
  assert.equal(storyShipOpacity(state, traffic, 0), 1);
  assert.ok(storyShipOpacity(state, other, 0) >= 0.3 && storyShipOpacity(state, other, 0) <= 0.5);
  assert.equal(storyShipOpacity(state, fighter, 0), storyShipOpacity(state, other, 0));
  state.opts = { reducedEffects: true };
  assert.equal(storyShipOpacity(state, other, 0), 0.5);
  assert.equal(storyShipOpacity(state, other, 20000), 0.5);
  state.isAlly = (ship) => ship.id === 2;
  assert.equal(storyShipOpacity(state, fighter, 0), 1);
  state.isAlly = undefined;
  state.friendGame = true;
  assert.equal(storyShipOpacity(state, other, 0), 1);
  state.friendGame = false;
  state.solo = true;
  assert.equal(storyShipOpacity(state, other, 0), 1);
  state.solo = false;
  state.opts = {};
  state.you!.story!.flags = { main_ending: 'table' };
  other.storyEnding = 'table';
  assert.equal(storyShipOpacity(state, other, 0), 1);
  other.storyEnding = 'long_dream';
  assert.equal(storyShipOpacity(state, other, 0), 0.75);
  state.opts = { reducedEffects: true };
  assert.equal(storyShipOpacity(state, other, 0), 1);
  state.you!.story!.flags = { main_ending: 'unsettling', unsettled_with: 'quantum' };
  traffic.fac = 'spacer';
  state.friendGame = true;
  assert.equal(
    storyShipOpacity(state, traffic, 0),
    0.5,
    'friend games keep captains solid, not unrelated NPC peoples',
  );
  state.friendGame = false;
  assert.equal(storyShipOpacity(state, traffic, 0), 0.5);
  traffic.fac = 'quantum';
  assert.equal(storyShipOpacity(state, traffic, 0), 1);
  assert.equal(storyShipOpacity(state, other, 0), 0.5);
  state.you!.story!.flags = { main_ending: 'captains_watch' };
  assert.equal(storyShipOpacity(state, other, 0), 1);
  assert.equal(storyScenery().dormantArk, true);
  assert.equal(storyScenery({ main_ending: 'table' }).dormantArk, false);
  assert.equal(storyScenery({ main_ending: 'table' }).core, 'gone');
  assert.equal(storyScenery({ main_ending: 'unsettling', breach_started: true }).core, 'dark');
  assert.equal(storyScenery({ main_ending: 'captains_watch' }).dormantArk, false);
  assert.equal(storyScenery({ main_ending: 'long_dream' }).core, 'asleep');
  assert.equal(storyScenery({ breach_started: true }).core, 'awake');
  assert.equal(storyScenery({ founding_vigil: true }).foundingVigil, true);
  assert.equal(storyScenery({ breach_started: true }).breachSetpieces, true);
  assert.equal(storyScenery({ breach_started: true, main_ending: 'table' }).breachSetpieces, false);
  const cycle = { id: 9, fl: 0, owner: 9 };
  state.ents = new Map([[9, cycle]]);
  assert.equal(realityCaptain(state, cycle), null);
  console.log(
    'PASS viewer-only reality precedence, owner chains, reduced effects and private scenery',
  );
}
