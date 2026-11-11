import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import { storyParticipant } from '../server/shared-story.ts';
import { parseClientAction } from '../shared/wire-commands.ts';
import type { FixtureSession } from './helpers/refinery-fixture.ts';

function armadaAction(session: FixtureSession, op: string, name?: string) {
  const packet = { t: 'armada', op, ...(name ? { name } : {}) };
  assert.equal(parseClientAction(packet), packet, 'Story controls survive the wire parser');
  game.onMessage(session, packet);
}

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
armadaAction(owner, 'storyShare');
assert.equal(owner.sharedStory, undefined, 'Owner cannot opt helpers in');
armadaAction(helper, 'storyAssist', owner.name!);
assert.equal(space.canHit(helper.ent!, target), false, 'Consent alone cannot start fight');
armadaAction(owner, 'storyShare');
assert.equal(storyParticipant(game, target, helper.id), true);
assert.equal(space.canHit(helper.ent!, target), true);
assert.equal(space.canHit(target, helper.ent!), true, 'Shared enemies can retaliate');
assert.equal(space.canHit(stranger.ent!, target), false);
armadaAction(stranger, 'storyAssist', owner.name!);
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
assert.equal(
  helper.data.story.active!.got,
  1,
  'Same-step consenting helper shares objective progress',
);
assert.equal(stranger.data.story.active!.got, 0, 'Late consent cannot receive shared credit');
assert.equal(
  [...space.ships.values()].filter((actor) => actor.story === helper.id && actor.storyKill).length,
  0,
  'Frozen same-step helpers do not keep duplicate enemies',
);
game.features.story.storyArrive(helper, space);
assert.equal(
  [...space.ships.values()].filter((actor) => actor.story === helper.id && actor.storyKill).length,
  0,
  'Arrival cannot respawn duplicate encounter during shared fight',
);
game.features.story.storyProgress(owner, target);
assert.equal(
  helper.data.story.active!.got,
  1,
  'Repeated kill notification awards no duplicate credit',
);
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
  'Shared story: explicit two-sided consent, frozen roster, retaliating enemies, same-step objective progress and departure/disconnect/expiry denial passed.',
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
armadaAction(helper, 'storyAssist', owner.name!);
armadaAction(owner, 'storyShare');
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
armadaAction(helper, 'storyAssist', owner.name!);
assert.equal(
  storyParticipant(game, creature, helper.id),
  false,
  'New consent cannot rewrite the frozen flight roster',
);
armadaAction(owner, 'storyStop');
armadaAction(helper, 'storyAssist', owner.name!);
armadaAction(owner, 'storyShare');
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

// A fresh fight exercises full completion, branch denial and recovery after withdrawal.
const party = [owner, helper, stranger];
for (const actor of space.ships.values())
  if (actor.story && party.some((session) => actor.story === session.id)) space.remove(actor);
for (const session of party) {
  session.data.armada = 'test';
  session.data.story = {
    step: STORY.indexOf(mission),
    done: [],
    flags: { d1: 'concord' },
    active: { id: mission.id, got: 0, spawned: false, ready: false },
  };
  session.data.sys = mission.sys!;
  session.data.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
}
stranger.data.story.flags!.d1 = 'hollow';
armadaAction(helper, 'storyAssist', owner.name!);
armadaAction(stranger, 'storyAssist', owner.name!);
armadaAction(owner, 'storyShare');
const sharedTargets = [...space.ships.values()].filter(
  (actor) => actor.story === owner.id && actor.storyKill && actor.storyMission === mission.id,
);
const beforeSharedStep = helper.data.story.step;
for (const [index, actor] of sharedTargets.entries()) {
  if (index === 2) stranger.data.story.flags!.d1 = 'concord';
  space.kill(actor, helper.ent!);
}
assert.equal(owner.data.story.active!.ready, true);
assert.equal(helper.data.story.active!.ready, true, 'Eligible helper finishes the same objective');
assert.equal(
  stranger.data.story.active!.got,
  0,
  'Branch-ineligible helper cannot gain chapter credit partway through a frozen fight',
);
assert.equal(
  helper.data.story.done.includes(mission.id),
  false,
  'Combat cannot skip reporting or grant the chapter reward',
);
assert.equal(
  helper.data.story.step,
  beforeSharedStep,
  'Shared combat does not report or advance the chapter',
);

// Stopping assistance recovers unfinished personal targets without resetting existing progress.
for (const session of [owner, helper]) {
  session.data.story.active = { id: mission.id, got: 1, ready: false, spawned: false };
  game.features.story.storyArrive(session, space);
}
armadaAction(owner, 'storyStop');
armadaAction(helper, 'storyAssist', owner.name!);
armadaAction(owner, 'storyShare');
assert.equal(
  [...space.ships.values()].some((actor) => actor.story === helper.id && actor.storyKill),
  false,
);
armadaAction(helper, 'storyStop');
game.features.story.storyTick(helper, space, 0.1);
assert.equal(helper.data.story.active!.got, 1, 'Recovery retains previously earned progress');
assert.equal(
  [...space.ships.values()].filter((actor) => actor.story === helper.id && actor.storyKill).length,
  mission.count! - 1,
  'Withdrawal resumes only the unfinished personal encounter',
);

// Follow routes respect each captain's gate and warn both sides without granting access.
helper.data.armadaFollow = true;
helper.armadaFormationLeader = owner.data.name;
helper.ent!.state = 'fly';
helper.ent!.autoCombat = false;
helper.data.story.done = [];
const helperBeforeGate = helper.sock.out.length;
const ownerBeforeGate = owner.sock.out.length;
game.features.coop.armadaLeaderJump(owner, 'quantum-rift');
assert.ok(
  helper.sock.out
    .slice(helperBeforeGate)
    .some((packet) => packet.t === 'toast' && /Cannot follow/.test(packet.msg)),
);
assert.ok(
  owner.sock.out
    .slice(ownerBeforeGate)
    .some((packet) => packet.t === 'toast' && packet.msg.includes(helper.data.name)),
);
assert.equal(
  helper.sock.out.slice(helperBeforeGate).some((packet) => packet.t === 'follow'),
  false,
);
assert.equal(game.features.story.deepLocked(helper.data, 'quantum-rift'), true);
owner.data.sys = 'quantum-rift';
const roster = game.features.coop.armadaPayload(owner.data);
assert.ok(roster && 'members' in roster);
assert.equal(
  roster.members.find((member) => member.name === helper.data.name)?.followStatus,
  'Cannot follow: story access required',
);
console.log(
  'Shared story wire ingress, same-step completion, branch denial, recovery and gated following passed.',
);
