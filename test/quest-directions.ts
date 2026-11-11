import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { SIDE_STORIES, type QuestRecord } from '../shared/quests.ts';
import { SYS, STELLARS, OPS } from '../shared/galaxy.ts';
import { TUTORIAL } from '../shared/tutorial.ts';

const game = refineryGame();
const session = refineryPilot(game, 'Directions test');
let stepsChecked = 0;
for (const story of SIDE_STORIES) {
  const quest: QuestRecord = {
    qid: 's:' + story.id,
    side: story.id,
    name: story.name,
    giver: story.giver,
    at: story.at,
    plan: { W: story.at, Wsys: STELLARS[story.at].system, contact: story.giver },
    steps: structuredClone(story.steps),
    step: 0,
    started: 1800000000000,
    tries: 0,
  };
  for (let index = 0; index < story.steps.length; index++) {
    const step = story.steps[index];
    const mission = game.features.quests.questStepJob(session.data, quest, index);
    if (step.brief.includes('{system}')) assert.ok(mission.text!.includes(SYS[mission.sys].name));
    if (step.brief.includes('{destination}'))
      assert.ok(mission.text!.includes(STELLARS[mission.dest!].name));
    assert.ok(!/\{(?:system|destination)\}/.test(mission.text! + mission.title));
    for (const identifier of [step.sys, step.dest]) {
      if (!identifier) continue;
      const name = SYS[identifier]?.name || STELLARS[identifier]?.name;
      if (identifier !== name)
        assert.ok(
          !new RegExp(`(^|[^a-zA-Z0-9-])${identifier}([^a-zA-Z0-9-]|$)`).test(
            mission.text! + ' ' + mission.title,
          ),
          'displayed directions use names, not raw identifiers',
        );
    }
    // A copied historical step gets current structured directions without changing its target.
    if (step.brief.includes('{system}')) {
      quest.steps[index].brief = 'Old directions in the wrong system.';
      const migrated = game.features.quests.questStepJob(session.data, quest, index);
      assert.equal(migrated.sys, mission.sys);
      assert.equal(migrated.text, mission.text);
    }
    session.data.quests.active[quest.qid] = quest;
    session.data.missions = [{ ...mission, text: 'Old copied directions.' }];
    game.features.quests.questReconcile(session);
    assert.equal(
      session.data.missions[0].text,
      mission.text,
      'active saved objectives refresh their display only',
    );
    delete session.data.quests.active[quest.qid];
    stepsChecked++;
  }
}
for (const level of [2, 3]) {
  const definition = OPS.find((tier) => tier.lv === level)!;
  const tutorial = TUTORIAL.find((step) => step.title.endsWith(`(Station Tier ${level})`))!;
  assert.equal(tutorial.title, `${definition.title} (Station Tier ${level})`);
  assert.ok(tutorial.text.includes(definition.unlock));
}
assert.ok(
  !TUTORIAL.some((step) => /station HANGAR|The OPS tab|captain panel \(I\)/.test(step.text)),
);
console.log(
  `Quest directions: ${stepsChecked} authored steps, copied-save presentation and current tier/menu hints passed.`,
);

// Starting a local delivery/report step must not require a launch-and-land cycle.
const localSide = {
  ...structuredClone(SIDE_STORIES[0]),
  afterSides: [],
  afterStory: [],
  flag: undefined,
  fragments: undefined,
  excludedEndings: [],
  id: 'local-report-fixture',
  at: 'qstation',
  steps: [
    {
      type: 'cargo' as const,
      title: 'Local report',
      brief: 'Deliver the report here.',
      sys: STELLARS.qstation.system,
      dest: 'qstation',
      cid: 'medical',
      qty: 1,
    },
  ],
};
SIDE_STORIES.push(localSide);
try {
  session.data.stellar = 'qstation';
  session.data.sys = STELLARS.qstation.system;
  session.data.missions = [];
  session.data.quests.active = {};
  game.features.quests.questStart(session, { side: localSide.id });
  assert.ok(
    session.data.quests.sides[localSide.id],
    'local delivery completes immediately on acceptance',
  );
  assert.ok(!session.data.missions.some((mission) => mission.quest?.qid === 's:' + localSide.id));
} finally {
  SIDE_STORIES.splice(SIDE_STORIES.indexOf(localSide), 1);
}

const originalMoreOffers = game.features.fronts.moreOffers;
try {
  const duplicate = {
    id: 'duplicate-board-fixture',
    title: 'One contract',
    text: 'Only one offer.',
    type: 'rescue',
    sys: session.data.sys,
    hull: 707,
    faction: 'spacer',
    wreckName: 'Fixture',
    reward: 10,
  };
  game.features.fronts.moreOffers = () => [duplicate, { ...duplicate }];
  assert.equal(
    game.offers(STELLARS.qstation, session.data).filter((offer) => offer.id === duplicate.id)
      .length,
    1,
  );
} finally {
  game.features.fronts.moreOffers = originalMoreOffers;
}
