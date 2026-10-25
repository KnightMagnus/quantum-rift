import assert from 'node:assert/strict';
import type { Game } from '../../server/game.ts';
import { STORY } from '../../shared/story.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { mockPlayerData, mockSession } from './mocks.ts';

/** Advance a prepared captain's real Dreamer encounter without a wall-clock wait. */
export function checkPreparedWitness(game: Game): void {
  const player = mockPlayerData({ ...game.fresh(), name: 'Prepared Witness', tut: 999 });
  game.features.hangar.hangarInit(player);
  game.features.quests.questInit(player);
  const dreamerIndex = STORY.findIndex((mission) => mission.id === 'dreamer');
  player.story = {
    step: dreamerIndex,
    done: STORY.slice(0, dreamerIndex).map((mission) => mission.id),
    active: { id: 'dreamer', got: 0, ready: false, spawned: false },
    flags: { d2: 'umbral', breach_started: true },
  };
  player.quests.sides['nhal-eye'] = 1;
  player.sys = 'maw';
  player.stellar = null;
  const session = mockSession({
    id: 287901,
    name: player.name,
    data: player,
    sock: { open: true, backlog: 0, send() {} },
  });
  game.sessions.set(session.id, session);
  game.spawnPlayer(session, 0, 700, 0, 0);
  const space = game.spaces.maw;
  const dreamer = [...space.ships.values()].find(
    (entity) => entity.story === session.id && entity.hull === 908,
  );
  assert.ok(dreamer, 'the prepared captain receives the real story Dreamer');
  game.features.story.storyTick(session, space, 29);
  assert.equal(
    player.story.active!.ready,
    false,
    'listening must last the full encounter interval',
  );
  game.features.story.storyTick(session, space, 1);
  assert.equal(player.story.active!.ready, true);
  assert.equal(dreamer.dead, false, 'the witness route does not kill the Dreamer');
  assert.notEqual(player.story.flags!.dreamer_defeated, true);
  space.remove(session.ent!);
  space.players--;
  session.ent = null;
  player.sys = 'qgate';
  player.stellar = 'qstation';
  game.features.story.storyOnLand(session, STELLARS.qstation);
  game.features.story.storyAccept(session, { id: 'dreamer', choice: 'witness' });
  assert.equal(player.story.flags!.nhal_ending, 'witness');
  assert.ok(player.story.done.includes('dreamer'));
  assert.equal(player.story.step, dreamerIndex + 1);
  game.sessions.delete(session.id);
  console.log(
    'PASS prepared Dreamer listening survival resolves the real witness decision without a kill',
  );
}
