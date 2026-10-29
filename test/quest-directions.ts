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
