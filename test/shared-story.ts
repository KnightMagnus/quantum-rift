import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import { storyParticipant } from '../server/shared-story.ts';
const game = refineryGame();
game.solo = false;
const owner = refineryPilot(game, 'Story owner');
const helper = refineryPilot(game, 'Helper');
const stranger = refineryPilot(game, 'Stranger');
const mission = STORY.find((entry) => entry.id === 'qv3')!;
for (const session of [owner, helper, stranger]) {
  session.data.armada = 'test';
  session.data.story = {
    step: STORY.indexOf(mission),
    done: [],
    active: { id: mission.id, got: 0, spawned: false, ready: false },
  };
  session.data.sys = mission.sys!;
  session.data.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
}
game.db.world.armadas.test = {
  id: 'test',
  name: 'Test',
  leader: owner.name!,
  members: [owner.name!, helper.name!, stranger.name!],
  invites: {},
  t: Date.now(),
  emptyT: 0,
} as typeof game.db.world.armadas.test;
const space = game.spaces[mission.sys!];
const target = [...space.ships.values()].find(
  (entity) => entity.story === owner.id && entity.storyKill,
)!;
assert.equal(space.canHit(helper.ent!, target), false);
game.features.coop.armadaOp(owner, { op: 'storyShare' });
assert.equal(owner.sharedStory, undefined, 'Owner cannot opt helpers in');
game.features.coop.armadaOp(helper, { op: 'storyAssist', name: owner.name! });
assert.equal(space.canHit(helper.ent!, target), false, 'Consent alone cannot start fight');
game.features.coop.armadaOp(owner, { op: 'storyShare' });
assert.equal(storyParticipant(game, target, helper.id), true);
assert.equal(space.canHit(helper.ent!, target), true);
assert.equal(space.canHit(target, helper.ent!), true, 'Shared enemies can retaliate');
assert.equal(space.canHit(stranger.ent!, target), false);
game.features.coop.armadaOp(stranger, { op: 'storyAssist', name: owner.name! });
assert.equal(
  storyParticipant(game, target, stranger.id),
  false,
  'Late opt-in cannot join frozen roster',
);
const wing = space.makeShip({ hull: 741, faction: 'quevari', ai: 'escort', owner: helper.ent!.id });
assert.equal(space.canHit(wing, target), true, 'Consenting helper wings participate');
const credits = helper.data.credits;
space.kill(target, helper.ent!);
assert.equal(owner.data.story.active!.got, 1);
assert.equal(helper.data.story.active!.got, 0, 'Helper never inherits owner progress');
const remaining = [...space.ships.values()].find(
  (entity) => entity.story === owner.id && entity.storyKill,
)!;
helper.data.armada = null;
assert.equal(storyParticipant(game, remaining, helper.id), false);
helper.data.armada = 'test';
helper.data.sys = 'emberlight';
assert.equal(storyParticipant(game, remaining, helper.id), false);
helper.data.sys = mission.sys!;
game.sessions.delete(helper.id);
assert.equal(
  storyParticipant(game, remaining, helper.id),
  false,
  'Disconnect invalidates frozen session id',
);
game.sessions.set(helper.id, helper);
owner.sharedStory!.until = 0;
assert.equal(storyParticipant(game, remaining, helper.id), false, 'Expired contracts fail closed');
assert.ok(
  helper.data.credits >= credits,
  'Ordinary bounty may be paid; no story completion was awarded',
);
console.log(
  'Shared story: explicit two-sided consent, frozen roster, retaliating enemies, owner-only progress and departure/disconnect/expiry denial passed.',
);

const defeat = refineryPilot(game, 'Defeat report');
defeat.data.sys = mission.sys!;
defeat.data.stellar = null;
defeat.data.credits = 10000;
game.spawnPlayer(defeat, 0, 0, 0, 0);
defeat.ent!.damageReceived = { 'Enemy battery': 123, 'Other damage': 42 };
const attacker = space.makeShip({
  hull: 708,
  faction: 'pirate',
  name: 'Known attacker',
  x: 0,
  y: 0,
});
attacker.armor = attacker.st.armor / 2;
space.kill(defeat.ent!, attacker);
assert.match(defeat.data.log.at(-1)!.text, /Enemy battery: 123/);
assert.match(defeat.data.log.at(-1)!.text, /50% hull/);
assert.match(defeat.data.log.at(-1)!.text, /Before retrying/);

const nhalMission = STORY.find((entry) => entry.id === 'dreamer')!;
for (const session of [owner, helper]) {
  session.data.armada = 'test';
  session.data.story = {
    step: STORY.indexOf(nhalMission),
    done: [],
    active: { id: nhalMission.id, got: 0, ready: false, spawned: false },
  };
  session.data.sys = nhalMission.sys!;
  session.data.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
}
const nhalSpace = game.spaces[nhalMission.sys!];
const creature = [...nhalSpace.ships.values()].find(
  (entity) => entity.story === owner.id && entity.storyKill,
)!;
assert.ok(creature);
game.features.coop.armadaOp(helper, { op: 'storyAssist', name: owner.name! });
game.features.coop.armadaOp(owner, { op: 'storyShare' });
assert.equal(
  game.features.nhal.allow(nhalSpace, helper.ent!, creature),
  true,
  'Nhal own isolation gate allows consenting helper',
);
assert.equal(nhalSpace.canHit(helper.ent!, creature), true);
owner.sharedStory!.until = 0;
assert.equal(game.features.nhal.allow(nhalSpace, helper.ent!, creature), false);

owner.sharedStory!.until = Date.now() + 60000;
const previousHelperEntity = helper.ent!.id;
game.spawnPlayer(helper, 0, 0, 0, 0);
assert.notEqual(helper.ent!.id, previousHelperEntity);
assert.equal(
  storyParticipant(game, creature, helper.id),
  false,
  'Returning on a new flight cannot revive old assistance',
);
game.features.coop.armadaOp(helper, { op: 'storyAssist', name: owner.name! });
assert.equal(
  storyParticipant(game, creature, helper.id),
  false,
  'New consent cannot rewrite the frozen flight roster',
);
game.features.coop.armadaOp(owner, { op: 'storyStop' });
game.features.coop.armadaOp(owner, { op: 'storyShare' });
assert.equal(
  storyParticipant(game, creature, helper.id),
  true,
  'Owner explicitly starts a new roster',
);
game.features.coop.armadaLeave(helper.data, game.db.world.armadas.test, 'left the Armada');
helper.data.armada = 'test';
game.db.world.armadas.test.members.push(helper.data.name);
assert.equal(
  storyParticipant(game, creature, helper.id),
  false,
  'Leaving and rejoining cannot revive consent',
);
