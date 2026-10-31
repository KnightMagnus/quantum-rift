import assert from 'node:assert/strict';
import type { Game, Session } from '../../server/game.ts';
import { STORY } from '../../shared/story.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { mockOfficer } from './mocks.ts';
import { endingText } from '../../shared/story-world.ts';

/** Check captain-specific hints and text through the authoritative story service. */
export function verifyStoryClarity(
  game: Game,
  captain: (name: string, id: number) => Session,
  packets: Array<Record<string, unknown>>,
): void {
  const session = captain('Clarity', 28100);
  const player = session.data;
  const breach = STORY.findIndex((mission) => mission.id === 'breach');
  player.story.step = breach;
  player.story.flags = {};
  const offer = () => game.features.story.storyOffer(player, STELLARS['glasswake-foundry'])!;
  assert.match(offer().brief, /The Last Survey at Shardwright Foundry/);
  assert.match(offer().text, /The Deep Stirs at Tide/);
  assert.doesNotMatch(offer().text, /The Table|Captain’s Watch/);
  for (const [completed, next] of [
    ['index-last-survey', 'Not Answering'],
    ['index-report', 'The Kernel’s Request'],
    ['index-records', 'answer the Kernel'],
    ['nhal-stirs', 'Soundings'],
    ['nhal-soundings', 'The Ossuary'],
    ['nhal-ossuary', 'The Watcher’s Eye'],
  ]) {
    player.quests.sides[completed] = 1;
    assert.ok(offer().brief.includes(next), `completed ${completed} points to ${next}`);
  }
  player.story.active = { id: 'breach', got: 0, spawned: false, ready: false };
  assert.match(game.features.story.storyPayload(player).active!.brief, /The Watcher’s Eye/);
  player.story.active = null;
  for (const outcome of ['survey_complete', 'concord_property', 'silence'] as const) {
    player.story.flags.index_ending = outcome;
    assert.doesNotMatch(offer().text, /answer the Kernel/);
  }
  player.quests.sides['nhal-eye'] = 1;
  assert.doesNotMatch(offer().brief, /To learn the song/);
  delete player.quests.sides['nhal-eye'];
  player.story.flags.dreamer_defeated = true;
  assert.doesNotMatch(offer().brief, /To learn the song/);
  player.story.flags.main_ending = 'unsettling';
  assert.equal(offer().brief, STORY[breach].brief, 'resolved endings have no prerequisite hints');
  player.story.flags = {};
  player.story.step = 0;
  assert.equal(
    game.features.story.storyOffer(player, STELLARS[STORY[0].at])!.brief,
    STORY[0].brief,
    'early chapters do not reveal later investigations',
  );

  for (const [chapter, count, expected] of [
    ['qv3', 1, '1 Umbral hunter is closing in.'],
    ['qv3', 4, '4 Umbral hunters are closing in.'],
    ['breach', 1, '1 Nhal is closing in.'],
    ['breach', 3, '3 Nhal are closing in.'],
  ] as const) {
    const encounter = captain(`Clarity ${chapter} ${count}`, 28101 + packets.length);
    const mission = STORY.find((mission) => mission.id === chapter)!;
    encounter.data.sys = mission.sys!;
    encounter.data.stellar = null;
    encounter.data.story.active = {
      id: chapter,
      got: mission.count! - count,
      ready: false,
      spawned: false,
    };
    const start = packets.length;
    game.spawnPlayer(encounter, 0, 100, 0, 0);
    assert.ok(
      packets.slice(start).some((packet) => packet.t === 'toast' && packet.msg === expected),
    );
    game.spaces[mission.sys!].remove(encounter.ent!);
    encounter.ent = null;
  }

  for (const rep of [0, 5]) {
    const rewarded = captain(`Clarity reward ${rep}`, 29100 + rep);
    game.features.story.storyComplete(rewarded, { ...STORY[0], pay: 0, rep });
    const result = [...packets].reverse().find((packet) => packet.t === 'story' && packet.done)!;
    if (rep) assert.match(String(result.text), /Rewards: \+5 Que'vari standing\./);
    else assert.doesNotMatch(String(result.text), /Rewards:|standing/);
  }
  for (const seren of [false, true]) {
    const finale = captain(`Clarity finale ${seren}`, seren ? 29201 : 29200);
    finale.data.sys = 'qgate';
    finale.data.stellar = 'qstation';
    finale.data.story.step = STORY.findIndex((mission) => mission.id === 'choice');
    finale.data.story.flags = { index_ending: 'survey_complete', nhal_ending: 'witness' };
    finale.data.officers = seren
      ? [mockOfficer({ id: 'seren', name: 'Seren Of-The-Veil', role: 'scout' })]
      : [];
    game.features.story.storyAccept(finale, { id: 'choice', choice: 'table' });
    const result = [...packets].reverse().find((packet) => packet.t === 'story' && packet.done)!;
    assert.equal(String(result.text).includes('Seren points'), seren);
  }
  for (const nhal_ending of ['witness', 'seal'] as const) {
    for (const seren of [false, true]) {
      const text = endingText({ main_ending: 'table', nhal_ending }, seren);
      assert.equal(text.includes('Seren points'), seren);
      assert.equal(text.includes('The Dreamer takes it.'), nhal_ending === 'witness');
    }
  }
}
