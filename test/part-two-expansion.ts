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

// Existing saves keep every pre-expansion chapter index, including the former terminal step.
assert.equal(
  PART_TWO.findIndex((mission) => mission.id === 'p2-names'),
  15,
);
assert.deepEqual(
  PART_TWO.slice(16).map((mission) => mission.id),
  ['p2-freefolk', 'p2-unsworn', 'p2-aftercare'],
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
    done: ['p2-names'],
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
        /sealed/.test(packet.text || ''),
    ),
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
