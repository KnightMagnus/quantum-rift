import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import {
  PART_TWO,
  PART_TWO_OBJECTIVES,
  partTwoBattle,
  partTwoEndings,
  partTwoAftercare,
} from '../shared/part-two-story.ts';
import { STELLARS, SYS } from '../shared/galaxy.ts';
import type { StoryFlags } from '../server/save-contracts.ts';
import type { Entity } from '../server/space.ts';

const game = refineryGame();
const captain = refineryPilot(game, 'Part Two');
const story = game.features.story;
const data = captain.data;
function dock(port: string) {
  assert.ok(STELLARS[port], `authored port exists: ${port}`);
  captain.ent = null;
  data.stellar = port;
  data.sys = STELLARS[port].system;
  story.storyOnLand(captain, STELLARS[port]);
}
for (const mission of PART_TWO) {
  assert.ok(STELLARS[mission.at], mission.at);
  for (const objective of PART_TWO_OBJECTIVES[mission.id] || partTwoBattle({})) {
    if (objective.sys) assert.ok(SYS[objective.sys], objective.sys);
    if (objective.dest) assert.ok(STELLARS[objective.dest], objective.dest);
    if (objective.back) assert.ok(STELLARS[objective.back], objective.back);
  }
}
const initial = STORY.findIndex((mission) => mission.id === 'p2-voice');
data.story = { step: initial, active: null, done: [], flags: {} };
dock('cinder-anchorage');
assert.equal(
  story.storyOffer(data, STELLARS['cinder-anchorage']),
  null,
  'Part II cannot be forged before crossing',
);
const decisions: Record<string, string> = {
  'p2-papers': 'hearing',
  'p2-flag': 'private',
  'p2-bread': 'grain',
  'p2-regiment': 'unsworn',
  'p2-broadcast': 'publish',
  'p2-observation': 'reject',
  'p2-mind': 'independent',
  'p2-moon': 'family',
  'p2-report': 'joint',
  'p2-makers': 'talks',
  'p2-freefolk': 'clinic',
  'p2-unsworn': 'protected',
};
function completeStage() {
  const active = data.story.active!;
  const mission = STORY.find((item) => item.id === active.id)!;
  const stages =
    active.id === 'p2-fleet'
      ? partTwoBattle(data.story.flags!)
      : active.id === 'p2-aftercare'
        ? partTwoAftercare(data.story.flags!)
        : PART_TWO_OBJECTIVES[active.id];
  const objective = stages[active.stage || 0];
  if (objective.type !== 'carry') {
    data.sys = objective.sys!;
    for (let count = 0; count < (objective.count || 1); count++) {
      story.storyProgress(captain, {
        story: captain.id,
        storyMission: active.id,
        storyStage: active.stage || 0,
        storyBoard: objective.type === 'board',
        storyKill: objective.type === 'kill',
      } as Entity);
    }
    assert.equal(active.ready, true);
  }
  dock(objective.dest || objective.back!);
  if (data.story.active === active && mission.decision)
    story.storyAccept(captain, { id: mission.id, choice: decisions[mission.id] });
}
data.story.flags = { main_ending: 'table', crossed_quantum_rift: true };
for (const mission of PART_TWO) {
  dock(mission.at);
  story.storyAccept(captain, {
    id: mission.id,
    ...(mission.id === 'p2-fleet' ? { choice: 'armistice' } : {}),
  });
  assert.equal(data.story.active?.id, mission.id);
  let guard = 0;
  while (data.story.active && guard++ < 12) completeStage();
  assert.ok(data.story.done.includes(mission.id), `${mission.title} completes`);
  if (mission.id === 'p2-observation')
    assert.equal(
      data.story.flags?.p2_objectives?.independent_backup,
      true,
      'rejecting companionship preserves navigation',
    );
}
assert.equal(data.story.flags?.p2_ending, 'armistice');
assert.equal(data.story.flags?.p2_objectives?.final_strike, true);
assert.equal(data.story.flags?.p2_objectives?.negotiated, true);
const flags: StoryFlags = { p2_route: 'command', p2_relay: 'custody', p2_makers: 'maps' };
assert.ok(partTwoEndings(flags).includes('ascendant'));
assert.ok(!partTwoEndings(flags).includes('armistice'));
flags.p2_relay = 'destroy';
assert.ok(partTwoEndings(flags).includes('ashfall'));
assert.deepEqual(partTwoEndings({}), ['border']);
// The prison decision must survive completion's objective-mark settlement.
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-regiment'),
  active: { id: 'p2-regiment', got: 3, spawned: false, ready: true, stage: 0 },
  done: [],
  flags: {
    main_ending: 'table',
    crossed_quantum_rift: true,
    p2_records: 'publish',
    p2_relay: 'independent',
    p2_makers: 'talks',
    p2_objectives: { records: true, signatory: true },
  },
};
dock('hearthline');
story.storyAccept(captain, { id: 'p2-regiment', choice: 'sentence' });
assert.ok(data.story.done.includes('p2-regiment'), 'the sentence decision completes the mission');
assert.equal(data.story.flags?.p2_objectives?.signatory, undefined);
assert.ok(
  !partTwoEndings(data.story.flags!).includes('armistice'),
  'sentenced prisoners cannot sign an armistice',
);
data.story.flags!.p2_makers = 'stand_down';
assert.ok(
  !partTwoEndings(data.story.flags!).includes('dormancy'),
  'sentenced prisoners cannot sign dormancy terms',
);
for (const ending of ['border', 'ascendant', 'ashfall', 'dormancy'] as const) {
  data.story = {
    step: STORY.findIndex((mission) => mission.id === 'p2-fleet'),
    active: null,
    done: [],
    flags: { main_ending: 'table', crossed_quantum_rift: true, p2_campaign: ending },
  };
  dock('black-anchorage');
  story.storyAccept(captain, { id: 'p2-fleet' });
  assert.equal(data.story.flags?.p2_ending, undefined, 'choosing campaign never awards ending');
  let guard = 0;
  while (data.story.active && guard++ < 12) completeStage();
  assert.equal(data.story.flags?.p2_ending, ending);
}
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-fleet'),
  active: { id: 'p2-fleet', got: 0, ready: false, spawned: false, stage: 1 },
  done: [],
  flags: { p2_campaign: 'ashfall', main_ending: 'table', crossed_quantum_rift: true },
};
dock('ledger-nine');
story.storyAccept(captain, { id: 'p2-abandon', choice: 'border' });
assert.equal(data.story.flags?.p2_campaign, 'border');
assert.equal(data.story.active?.stage, 0, 'withdrawal starts replacement transport recovery');
assert.equal(data.story.flags?.p2_ending, undefined);
console.log(
  'Part II: all 19 missions, all five outcomes, navigation rejection, ending gates and withdrawal passed.',
);

// Native simulation spawns actual new hulls and custody requires the Capture interaction.
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-fleet'),
  active: { id: 'p2-fleet', got: 0, ready: false, spawned: false, stage: 1 },
  done: [],
  flags: {
    p2_campaign: 'ascendant',
    p2_prisoners: 'transfer',
    main_ending: 'table',
    crossed_quantum_rift: true,
  },
};
data.sys = 'mw-sirius-bastion';
data.stellar = null;
game.spawnPlayer(captain, 15000, 15000, 0, 0);
const space = game.spaces[data.sys];
const target = [...space.ships.values()].find(
  (entity) => entity.storyCapture && entity.story === captain.id,
)!;
assert.ok(target, 'native campaign capture target spawned');
assert.ok(
  [...space.ships.values()].some((entity) => entity.name?.includes('Iona Vey')),
  'earned Vey support spawns',
);
captain.ent!.state = 'fly';
captain.ent!.x = target.x;
captain.ent!.y = target.y;
target.vx = target.vy = captain.ent!.vx = captain.ent!.vy = 0;
game.features.hangar.board(captain, { id: target.id, act: 'rescue' });
assert.equal(data.story.active!.got, 0, 'rescuing crew cannot assert installation custody');
game.features.hangar.board(captain, { id: target.id, act: 'capture' });
assert.equal(data.story.active!.got, 1, 'physical boarding records installation custody');
console.log('Part II native capture action and earned fleet spawning passed.');

// Sol arrivals are far from the origin; the campaign must be playable at the arrival position.
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-fleet'),
  active: { id: 'p2-fleet', got: 0, ready: false, spawned: false, stage: 1 },
  done: [],
  flags: { p2_campaign: 'border', main_ending: 'table', crossed_quantum_rift: true },
};
data.sys = 'mw-sol';
data.stellar = null;
game.spawnPlayer(captain, 49000, -9000, 0, 0);
const battleSpace = game.spaces[data.sys];
const combatTargets = [...battleSpace.ships.values()].filter(
  (entity) => entity.story === captain.id && entity.storyMission === 'p2-fleet' && entity.storyKill,
);
assert.equal(combatTargets.length, 3, 'all final-strike targets spawn');
for (const combatTarget of combatTargets) {
  assert.ok(
    Math.abs(Math.hypot(combatTarget.x - captain.ent!.x, combatTarget.y - captain.ent!.y) - 1400) <
      1,
    'campaign combat spawns alongside the captain, not at the Sol origin',
  );
  assert.equal(combatTarget.target, captain.ent, 'campaign enemies engage the arriving captain');
}
