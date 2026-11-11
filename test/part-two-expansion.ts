import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import {
  PART_TWO,
  PART_TWO_OBJECTIVES,
  partTwoAftercare,
  partTwoMemorial,
  partTwoBattle,
} from '../shared/part-two-story.ts';
import { STELLARS } from '../shared/galaxy.ts';
import type { Entity } from '../server/space.ts';
import type { SavedStory, StoryFlags } from '../server/save-contracts.ts';
import { foldLegacyMemorialChapter } from '../server/story.ts';

// Chapters through the campaign keep their indices; the memorial visit is part of the last chapter.
assert.equal(
  PART_TWO.findIndex((mission) => mission.id === 'p2-fleet'),
  14,
);
assert.deepEqual(
  PART_TWO.slice(15).map((mission) => mission.id),
  ['p2-freefolk', 'p2-unsworn', 'p2-aftercare'],
);
assert.ok(
  STORY.every((mission) => mission.id !== 'p2-names'),
  'the memorial has one scene, not a separate chapter',
);
const game = refineryGame();
const captain = refineryPilot(game, 'Recovery Captain');
const other = refineryPilot(game, 'Independent Captain');
const unrelated = structuredClone(other.data);
const messages = captain.sock.out as Array<{ id?: string; text?: string; done?: boolean }>;
const dock = (port: string) => {
  captain.ent = null;
  captain.data.stellar = port;
  captain.data.sys = STELLARS[port].system;
  game.features.story.storyOnLand(captain, STELLARS[port]);
};
for (const ending of ['border', 'armistice', 'dormancy', 'ascendant', 'ashfall'] as const) {
  captain.data.story = {
    step: STORY.findIndex((mission) => mission.id === 'p2-freefolk'),
    active: null,
    done: ['p2-fleet'],
    flags: {
      main_ending: 'table',
      crossed_quantum_rift: true,
      p2_ending: ending,
      p2_supply: 'battery',
    },
  };
  const beforeRep = captain.data.rep.freefolk || 0;
  for (const id of ['p2-freefolk', 'p2-unsworn', 'p2-aftercare']) {
    const mission = STORY.find((entry) => entry.id === id)!;
    dock(mission.at);
    game.features.story.storyAccept(captain, { id });
    assert.equal(captain.data.story.active?.id, id);
    let guard = 0;
    while (captain.data.story.active && guard++ < 10) {
      const active: NonNullable<SavedStory['active']> = captain.data.story.active;
      const stages =
        id === 'p2-aftercare'
          ? partTwoAftercare(captain.data.story.flags!)
          : PART_TWO_OBJECTIVES[id];
      const objective = stages[active.stage || 0];
      if (objective.type !== 'carry') {
        captain.data.stellar = null;
        captain.data.sys = objective.sys!;
        for (let index = 0; index < objective.count!; index++)
          game.features.story.storyProgress(captain, {
            story: captain.id,
            storyMission: id,
            storyStage: active.stage || 0,
            storyBoard: objective.type === 'board',
            storyKill: objective.type === 'kill',
          } as Entity);
        assert.equal(active.ready, true, 'recovery requires all real target credit');
      }
      dock(objective.dest || objective.back!);
      if (captain.data.story.active === active && mission.decision) {
        game.features.story.storyAccept(captain, {
          id,
          choice: id === 'p2-freefolk' ? 'clinic' : 'protected',
        });
      }
    }
    assert.ok(captain.data.story.done.includes(id));
    const credits = captain.data.credits;
    game.features.story.storyComplete(captain, mission);
    assert.equal(captain.data.credits, credits, 'repeat completion cannot duplicate rewards');
  }
  assert.equal(captain.data.rep.freefolk, beforeRep + 8);
  assert.equal(
    captain.data.story.flags?.p2_ending,
    ending,
    'recovery does not rewrite the campaign',
  );
  assert.ok(
    messages.some(
      (packet) =>
        packet.id === 'p2-aftercare' &&
        packet.done &&
        /clinic/.test(packet.text || '') &&
        /sealed/.test(packet.text || '') &&
        /The memorial lists those who died/.test(packet.text || '') &&
        /The battery crews send a repaired shield plate/.test(packet.text || ''),
    ),
    'the closing scene carries the memorial and its saved decision callbacks',
  );
  assert.equal(
    messages.filter((packet) => packet.done && /The memorial lists/.test(packet.text || '')).length,
    ['border', 'armistice', 'dormancy', 'ascendant', 'ashfall'].indexOf(ending) + 1,
    'each run reaches exactly one memorial scene',
  );
}
assert.deepEqual(other.data, unrelated, 'another captain’s ending and standing remain untouched');
const peaceful = partTwoAftercare({ p2_ending: 'armistice', p2_supply: 'grain' });
const offensive = partTwoAftercare({ p2_ending: 'ashfall', p2_supply: 'battery' });
assert.notEqual(
  peaceful[0].sys,
  offensive[0].sys,
  'campaign changes the playable recovery location',
);
assert.equal(peaceful[0].count, 2);
assert.equal(offensive[0].count, 3);
assert.notEqual(
  peaceful[1].dest,
  offensive[1].dest,
  'supply decision changes the actual collection route',
);
for (const [field, left, right] of [
  ['p2_entry', 'hearing', 'salvage'],
  ['p2_route', 'private', 'command'],
  ['p2_supply', 'grain', 'battery'],
  ['p2_prisoners', 'free', 'sentence'],
  ['p2_records', 'publish', 'official'],
  ['p2_witness', 'reject', 'rebuild'],
  ['p2_relay', 'independent', 'destroy'],
  ['p2_contact', 'family', 'scholarly'],
  ['p2_expedition', 'joint', 'military'],
  ['p2_makers', 'talks', 'maps'],
]) {
  assert.notEqual(
    partTwoMemorial({ [field]: left } as StoryFlags),
    partTwoMemorial({ [field]: right } as StoryFlags),
    `${field} has a distinct callback`,
  );
}
// Saves from before the memorial visit moved into the last chapter keep their place.
const freefolkStep = STORY.findIndex((entry) => entry.id === 'p2-freefolk');
const legacyFlags: StoryFlags = {
  main_ending: 'table',
  crossed_quantum_rift: true,
  p2_ending: 'border',
};
const legacyCaptain = refineryPilot(game, 'Legacy Captain');
const legacySaves: Array<[string, SavedStory, number, string | null]> = [
  [
    'before the campaign ends',
    { step: freefolkStep - 1, active: null, done: [], flags: { ...legacyFlags } } as SavedStory,
    freefolkStep - 1,
    null,
  ],
  [
    'memorial on offer',
    {
      step: freefolkStep,
      active: null,
      done: ['p2-fleet'],
      flags: { ...legacyFlags },
    } as SavedStory,
    freefolkStep,
    null,
  ],
  [
    'memorial accepted',
    {
      step: freefolkStep,
      active: { id: 'p2-names', got: 0, ready: false, spawned: false, stage: 0 },
      done: ['p2-fleet'],
      flags: { ...legacyFlags },
    } as SavedStory,
    freefolkStep,
    null,
  ],
  [
    'Freefolk chapter mid-way',
    {
      step: freefolkStep + 1,
      active: { id: 'p2-freefolk', got: 0, ready: false, spawned: false, stage: 1 },
      done: ['p2-fleet', 'p2-names'],
      flags: { ...legacyFlags },
    } as SavedStory,
    freefolkStep,
    'p2-freefolk',
  ],
  [
    'last chapter mid-way',
    {
      step: freefolkStep + 3,
      active: { id: 'p2-aftercare', got: 0, ready: false, spawned: false, stage: 2 },
      done: ['p2-fleet', 'p2-names', 'p2-freefolk', 'p2-unsworn'],
      flags: { ...legacyFlags },
    } as SavedStory,
    freefolkStep + 2,
    'p2-aftercare',
  ],
  [
    'Part II finished',
    {
      step: STORY.length + 1,
      active: null,
      done: ['p2-fleet', 'p2-names', 'p2-freefolk', 'p2-unsworn', 'p2-aftercare'],
      flags: { ...legacyFlags },
    } as SavedStory,
    STORY.length,
    null,
  ],
];
for (const [label, saved, expectedStep, expectedActive] of legacySaves) {
  legacyCaptain.data.story = saved;
  const payload = game.features.story.storyPayload(legacyCaptain.data);
  assert.equal(payload.step, expectedStep, `${label}: chapter index realigned`);
  assert.equal(payload.active?.id ?? null, expectedActive, `${label}: active chapter kept`);
  assert.ok(!payload.done.includes('p2-names'), `${label}: retired chapter removed`);
  if (expectedActive) assert.ok(payload.active!.stage! > 0, `${label}: objective stage kept`);
  assert.equal(
    foldLegacyMemorialChapter(legacyCaptain.data.story),
    false,
    `${label}: migration runs once`,
  );
}
legacyCaptain.data.story = legacySaves[2][1];
legacyCaptain.data.story.active = {
  id: 'p2-names',
  got: 0,
  ready: false,
  spawned: false,
  stage: 0,
};
legacyCaptain.data.story.done = ['p2-fleet'];
legacyCaptain.data.stellar = 'saint-orra';
legacyCaptain.data.sys = STELLARS['saint-orra'].system;
assert.equal(
  game.features.story.storyOffer(legacyCaptain.data, STELLARS['saint-orra'])?.id,
  'p2-freefolk',
  'an unfinished legacy memorial visit continues with the Freefolk chapter',
);

// A native final-strike spawn has a command opponent, not three anonymous escorts.
captain.data.story = {
  step: STORY.findIndex((entry) => entry.id === 'p2-fleet'),
  active: { id: 'p2-fleet', got: 0, ready: false, spawned: false, stage: 1 },
  done: [],
  flags: { main_ending: 'table', crossed_quantum_rift: true, p2_campaign: 'border' },
};
assert.equal(partTwoBattle(captain.data.story.flags!)[1].mark, 'final_strike');
captain.data.stellar = null;
captain.data.sys = 'mw-sol';
game.spawnPlayer(captain, 15000, 15000, 0, 0);
assert.ok(
  [...game.spaces['mw-sol'].ships.values()].some(
    (entity) => entity.storyKill && entity.name === 'Ash Mandate · Admiral Rauth',
  ),
);
console.log(
  'Part II expansion: human identities, regional traffic, three recovery chapters, five campaign callbacks, choice routes, once-only personal rewards and named command encounter passed.',
);

// Real boarding, not injected completion, recovers the authored Freefolk crews.
captain.data.story = {
  step: STORY.findIndex((entry) => entry.id === 'p2-freefolk'),
  active: { id: 'p2-freefolk', got: 0, ready: false, spawned: false, stage: 0 },
  done: [],
  flags: { main_ending: 'table', crossed_quantum_rift: true, p2_ending: 'border' },
};
captain.data.stellar = null;
captain.data.sys = 'mw-ledger-nine';
game.spawnPlayer(captain, 12000, 12000, 0, 0);
const recoverySpace = game.spaces[captain.data.sys];
const tenders = [...recoverySpace.ships.values()].filter(
  (entity) =>
    entity.story === captain.id && entity.storyMission === 'p2-freefolk' && entity.storyBoard,
);
assert.equal(tenders.length, 2);
for (const tender of tenders) {
  assert.equal(tender.hull, 1043);
  assert.equal(tender.faction, 'freefolk');
  assert.equal(tender.guns.length, 1);
  assert.equal(tender.guns[0].w, 130);
  assert.equal(tender.guns[0].n, 1);
  assert.equal(
    tender.guns[0].p.turret,
    true,
    'a real small defensive turret can track an attacker',
  );
  captain.ent!.state = 'fly';
  captain.ent!.x = tender.x;
  captain.ent!.y = tender.y;
  tender.vx = tender.vy = captain.ent!.vx = captain.ent!.vy = 0;
  game.features.hangar.board(captain, { id: tender.id, act: 'rescue' });
}
assert.equal(captain.data.story.active!.ready, true);
assert.equal(captain.data.story.active!.got, 2);
console.log('Native Freefolk recovery boarding and operational defensive turret mounts passed.');
