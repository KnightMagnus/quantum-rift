import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { DB } from '../server/db.ts';
import { STORY } from '../shared/story.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { SIDE_STORIES } from '../shared/quests.ts';

for (const order of ['before', 'after', 'completed', 'legacy'] as const) {
  let game = refineryGame();
  let session = refineryPilot(game, `Order ${order}`);
  let player = session.data;
  player.story.step = STORY.findIndex((step) => step.id === 'choice');
  player.story.done = STORY.slice(0, player.story.step).map((step) => step.id);
  player.story.active = null;
  player.story.flags = { index_ending: 'survey_complete', nhal_ending: 'witness' };
  player.quests.sides['keepers-ring'] = 1;
  const optional = SIDE_STORIES.find((story) => story.id === 'keepers-vigil')!;
  const qid = `s:${optional.id}`;
  const dock = (port: string) => {
    player.stellar = port;
    player.sys = STELLARS[port].system;
  };
  if (order !== 'after') {
    dock(optional.at);
    game.features.quests.questStart(session, { side: optional.id });
    assert.ok(player.quests.active[qid]);
  }
  if (order === 'completed') {
    delete player.quests.active[qid];
    player.missions = player.missions.filter((mission) => mission.quest?.qid !== qid);
    player.quests.sides[optional.id] = 12345;
  }
  const credits = player.credits;
  if (order === 'legacy') {
    player.story.flags.main_ending = 'table';
    game.db.touch();
    game.db.flush();
    game = refineryGame(new DB(game.db.dir));
    session = refineryPilot(game, `Order ${order}`);
    player = session.data;
  } else {
    dock('qstation');
    game.features.story.storyAccept(session, { id: 'choice', choice: 'table' });
    assert.equal(player.story.flags.main_ending, 'table', 'main choice remains available');
  }
  assert.equal(player.quests.active[qid], undefined);
  assert.ok(!player.missions.some((mission) => mission.quest?.qid === qid));
  assert.equal(player.credits, credits, 'retiring unavailable work grants no invented reward');
  if (order === 'completed')
    assert.equal(player.quests.sides[optional.id], 12345, 'completed progress is untouched');
  else assert.equal(player.quests.sides[optional.id], undefined);
  dock(optional.at);
  assert.ok(
    !game.features.quests
      .questOffers(STELLARS[optional.at], player)
      .some((offer) => offer.side === optional.id),
  );
  game.features.quests.questStart(session, { side: optional.id });
  assert.equal(
    player.quests.active[qid],
    undefined,
    'forged acceptance cannot restore incompatible work',
  );
  const notices = session.sock.out.filter(
    (packet) =>
      packet.t === 'toast' && packet.msg.includes('no longer available after your story choice'),
  );
  assert.equal(notices.length, order === 'before' || order === 'legacy' ? 1 : 0);
  game.features.quests.questReconcile(session);
  game.features.quests.questSweep(session);
  assert.equal(
    session.sock.out.filter(
      (packet) =>
        packet.t === 'toast' && packet.msg.includes('no longer available after your story choice'),
    ).length,
    notices.length,
    'migration notice is once-only',
  );
}
console.log(
  'Optional story ordering: before/after/completed/reloaded work, rewards and once-only notices passed.',
);
