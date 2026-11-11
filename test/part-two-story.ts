import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import {
  PART_TWO,
  PART_TWO_OBJECTIVES,
  partTwoBattle,
  partTwoEndings,
  partTwoAftercare,
  PART_TWO_PAY,
  partTwoMemorial,
  partTwoMemorialText,
} from '../shared/part-two-story.ts';
import { STELLARS, SYS } from '../shared/galaxy.ts';
import type { StoryFlags } from '../server/save-contracts.ts';
import type { Entity } from '../server/space.ts';
import { storyReportAccess } from '../server/story.ts';

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
  assert.ok(PART_TWO_PAY[mission.id] > 0, `${mission.id} has authored pay`);
  assert.equal(mission.pay, PART_TWO_PAY[mission.id], `${mission.id} pays its authored rate`);
}
const actOneTopPay = Math.max(
  ...STORY.filter((item) => /^qv\d$/.test(item.id)).map((item) => item.pay),
);
const payOf = (id: string) => PART_TWO.find((mission) => mission.id === id)!.pay;
assert.ok(payOf('p2-voice') >= actOneTopPay, 'Part II opens at or above the top Act I reward');
assert.equal(
  Math.max(...PART_TWO.map((mission) => mission.pay)),
  payOf('p2-fleet'),
  'the final battle pays the most',
);
assert.ok(payOf('p2-makers') > payOf('p2-voice'), 'pay rises through the main chapters');
assert.ok(payOf('p2-names') < payOf('p2-voice'), 'the memorial visit pays a token amount');
const partTwoTotal = PART_TWO.reduce((sum, mission) => sum + mission.pay, 0);
assert.ok(
  partTwoTotal >= 5_000_000 && partTwoTotal <= 8_000_000,
  `Part II total pay stays near forgone freight income: ${partTwoTotal}`,
);
let paidTotal = 0;
for (const mission of PART_TWO) {
  dock(mission.at);
  const creditsBefore = data.credits;
  story.storyAccept(captain, {
    id: mission.id,
    ...(mission.id === 'p2-fleet' ? { choice: 'armistice' } : {}),
  });
  assert.equal(data.story.active?.id, mission.id);
  let guard = 0;
  while (data.story.active && guard++ < 12) completeStage();
  assert.ok(data.story.done.includes(mission.id), `${mission.title} completes`);
  assert.equal(data.credits - creditsBefore, mission.pay, `${mission.title} pays on completion`);
  paidTotal += mission.pay;
  if (mission.id === 'p2-observation')
    assert.equal(
      data.story.flags?.p2_objectives?.independent_backup,
      true,
      'rejecting companionship preserves navigation',
    );
}
assert.equal(paidTotal, partTwoTotal, 'a full run pays every chapter once');
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

// Required reports do not strand a captain whose mission combat cost faction standing.
const reportPort = STELLARS['vigils-rest'];
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-fleet'),
  active: { id: 'p2-fleet', got: 2, ready: false, spawned: true, stage: 1 },
  done: [],
  flags: {
    p2_campaign: 'border',
    main_ending: 'table',
    crossed_quantum_rift: true,
    p2_objectives: { corridor: true },
  },
};
data.rep.confederation = -80;
data.sys = reportPort.system;
data.stellar = null;
game.spawnPlayer(captain, reportPort.x, reportPort.y, 0, 0);
captain.ent!.vx = captain.ent!.vy = 0;
game.land(captain, reportPort.id);
assert.ok(captain.ent, 'an unfinished report grants no landing exception');
data.story.active!.got = 3;
data.story.active!.ready = true;
assert.equal(storyReportAccess(data, 'saint-orra'), false, 'no clearance at unrelated ports');
game.land(captain, reportPort.id);
assert.equal(
  data.stellar,
  reportPort.id,
  'ready mandatory combat report permits its assigned landing',
);
assert.ok(data.story.done.includes('p2-fleet'));
assert.equal(data.rep.confederation, -80, 'report access never clears faction consequences');
const fleetCompletion = captain.sock.out
  .filter((packet) => packet.t === 'story' && (packet as unknown as { done?: boolean }).done)
  .at(-1) as unknown as { text: string };
assert.match(fleetCompletion.text, /The Border That Holds/);
dock('vigils-rest');
story.storyAccept(captain, { id: 'p2-names' });
const memorialPort = STELLARS['saint-orra'];
data.story.flags!.p2_supply = 'grain';
data.sys = memorialPort.system;
data.stellar = null;
game.spawnPlayer(captain, memorialPort.x, memorialPort.y, 0, 0);
captain.ent!.vx = captain.ent!.vy = 0;
game.land(captain, memorialPort.id);
assert.equal(
  data.stellar,
  memorialPort.id,
  'the required memorial remains accessible after combat',
);
const memorialCompletion = captain.sock.out
  .filter(
    (packet) =>
      packet.t === 'story' &&
      (packet as unknown as { id?: string; done?: boolean }).id === 'p2-names' &&
      (packet as unknown as { done?: boolean }).done,
  )
  .at(-1) as unknown as { text: string };
assert.match(memorialCompletion.text, /At Saint Orra, the memorial/);
assert.doesNotMatch(memorialCompletion.text, /The Border That Holds/);
assert.match(
  memorialCompletion.text,
  /The grain-line workers bring bread/,
  'the distinct memorial retains the saved supply decision callback',
);
data.sys = reportPort.system;
data.stellar = null;
game.spawnPlayer(captain, reportPort.x, reportPort.y, 0, 0);
captain.ent!.vx = captain.ent!.vy = 0;
game.land(captain, reportPort.id);
assert.ok(captain.ent, 'the completed report grants no permanent landing immunity');

// Ashfall leaves Index standing at -100; Ledger Nine must still accept the Freefolk
// pump delivery and the Unsworn chapter it offers next.
const ledgerNine = STELLARS['ledger-nine'];
const ferrum = STELLARS.ferrum;
function launchAt(port: (typeof STELLARS)[string]) {
  data.sys = port.system;
  data.stellar = null;
  game.spawnPlayer(captain, port.x, port.y, 0, 0);
  captain.ent!.vx = captain.ent!.vy = 0;
}
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-freefolk'),
  active: { id: 'p2-freefolk', got: 0, ready: false, spawned: false, stage: 1 },
  done: [],
  flags: { p2_ending: 'ashfall', main_ending: 'table', crossed_quantum_rift: true },
};
data.rep.index = -100;
data.landPass = {};
assert.equal(
  storyReportAccess(data, ledgerNine.id),
  false,
  'a later carry stage grants no clearance at its port',
);
launchAt(ledgerNine);
game.land(captain, ledgerNine.id);
assert.ok(captain.ent, 'Ledger Nine still refuses before the pumps are collected');
assert.equal(storyReportAccess(data, ferrum.id), true, 'the active carry destination is cleared');
data.story.active!.stage = 2;
assert.equal(
  storyReportAccess(data, ferrum.id),
  false,
  'a finished carry stage keeps no clearance',
);
game.land(captain, ledgerNine.id);
assert.equal(data.stellar, ledgerNine.id, 'the pump delivery lands at Ledger Nine');
assert.ok(!data.landPass?.[ledgerNine.id], 'no landing pass was bought');
story.storyAccept(captain, { id: 'p2-freefolk', choice: 'clinic' });
assert.ok(data.story.done.includes('p2-freefolk'), 'the delivery completes the chapter');
assert.equal(data.story.active, null);
assert.equal(STORY[data.story.step].id, 'p2-unsworn');
launchAt(ledgerNine);
assert.equal(storyReportAccess(data, ferrum.id), false, 'no clearance away from the offer port');
game.land(captain, ledgerNine.id);
assert.equal(data.stellar, ledgerNine.id, 'the next chapter offer port accepts the captain');
assert.ok(
  captain.sock.out.some(
    (packet) => packet.t === 'story' && (packet as unknown as { id?: string }).id === 'p2-unsworn',
  ),
  'the Unsworn chapter is offered after landing',
);
assert.equal(data.rep.index, -100, 'story landings never clear Index standing');
data.story.flags = { main_ending: 'unsettling' };
assert.equal(storyReportAccess(data, ledgerNine.id), false, 'Part II access needs the crossing');

// Campaign choices describe missing prerequisites without opening unavailable choices.
data.story = {
  step: STORY.findIndex((mission) => mission.id === 'p2-fleet'),
  active: null,
  done: [],
  flags: { main_ending: 'table', crossed_quantum_rift: true },
};
dock('black-anchorage');
story.storyAccept(captain, { id: 'p2-fleet' });
const prompt = captain.sock.out.filter((packet) => packet.t === 'story').at(-1) as unknown as {
  text: string;
  choices: { value: string }[];
};
assert.match(prompt.text, /missing independent copies of both records/);
assert.match(prompt.text, /deaths and destroyed archives cannot be undone/);
assert.deepEqual(
  prompt.choices.map((choice) => choice.value),
  ['border'],
);
story.storyAccept(captain, { id: 'p2-fleet', choice: 'ashfall' });
assert.equal(data.story.active, null, 'explanation does not weaken the campaign gate');

// Combat progress names destruction rather than claiming a recovered objective.
data.story.active = { id: 'p2-fleet', got: 0, ready: false, spawned: true, stage: 1 };
data.story.flags!.p2_campaign = 'border';
data.sys = 'mw-sol';
story.storyProgress(captain, {
  story: captain.id,
  storyMission: 'p2-fleet',
  storyStage: 1,
  storyKill: true,
} as Entity);
assert.match(
  captain.sock.out.filter((packet) => packet.t === 'toast').at(-1)!.msg,
  /Mission target destroyed/,
);
console.log('Part II report access, memorial, campaign explanations and combat feedback passed.');

// Part II text names places as the map shows them and follows the saved ending.
{
  const objectiveText = (id: string) =>
    (PART_TWO_OBJECTIVES[id] || []).map((objective) => objective.brief).join(' ');
  assert.equal(SYS['mw-sol'].desc, "Sol. The Milky Way's familiar band crosses the sky.");
  assert.match(SYS['mw-wolf-359'].desc ?? '', /^Wolf 359, \d+(\.\d+)? light-years from Sol\./);
  assert.match(objectiveText('p2-moon'), /At the Threshold Spire in the Rift/);
  assert.match(
    Object.values(PART_TWO_OBJECTIVES)
      .flat()
      .map((objective) => objective.brief)
      .join(' '),
    /Under the local ceasefire, rescue/,
  );
  const broadcast = PART_TWO.find((mission) => mission.id === 'p2-broadcast')!;
  assert.doesNotMatch(JSON.stringify(broadcast), /broadcast booth/, 'one broadcast room');
  const aftercareText = (ending: string) =>
    partTwoAftercare({ p2_ending: ending } as StoryFlags)
      .map((objective) => objective.brief)
      .join(' ');
  assert.match(aftercareText('ascendant'), /relay and yard crews/);
  assert.match(aftercareText('ashfall'), /archive crews/);
  const memorialFlags = { p2_supply: 'grain' } as StoryFlags;
  assert.equal(
    `${partTwoMemorialText(memorialFlags)} ${partTwoMemorial(memorialFlags)}`.match(
      /At Saint Orra/g,
    )?.length,
    1,
    'the memorial names Saint Orra once',
  );
  assert.match(
    partTwoBattle({ p2_campaign: 'dormancy' } as StoryFlags)
      .map((objective) => objective.brief)
      .join(' '),
    /The Index chooses whether to sleep/,
  );
}

const harnessCaptain = refineryPilot(game, 'Harness reward');
const harnessData = harnessCaptain.data;
harnessData.story.flags = { main_ending: 'table' };
harnessData.sys = STELLARS['vigil-lamp'].system;
harnessData.stellar = 'vigil-lamp';
for (const side of ['rift-alloy', 'rift-lattice', 'rift-tuning', 'rift-song', 'rift-route'])
  harnessData.quests.sides[side] = 1;
game.features.quests.questStart(harnessCaptain, { side: 'rift-harness' });
const harnessQuest = harnessData.quests.active['s:rift-harness'];
assert.ok(harnessQuest, 'completed components permit the fitting assignment');
game.features.quests.questFinish(harnessCaptain, harnessQuest);
assert.equal(harnessData.ship.outfits[9021], 1);
const harnessCompletion = harnessCaptain.sock.out
  .filter((packet) => packet.t === 'story' && (packet as unknown as { done?: boolean }).done)
  .at(-1) as unknown as { text: string; tag: string };
assert.match(harnessCompletion.tag, /^RIFT PREPARATION COMPLETE/);
assert.match(harnessCompletion.text, /Rewards: Rift Harness fitted to your ship/);
assert.doesNotMatch(harnessCompletion.text, /Rewards: \./);
