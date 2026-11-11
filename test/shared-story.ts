import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import {
  liveSharedHelpers,
  sharedEncounterScale,
  storyParticipant,
} from '../server/shared-story.ts';
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
const beforeDefeatLog = defeat.data.log.length;
space.kill(defeat.ent!, attacker);
const defeatReports = defeat.data.log
  .slice(beforeDefeatLog)
  .filter((entry) => entry.text.startsWith('Ship destroyed'));
assert.equal(defeatReports.length, 1, 'Death records exactly one new defeat report');
assert.match(defeatReports[0].text, /Enemy battery: 123/);
assert.match(defeatReports[0].text, /Other damage: 42/);
assert.match(defeatReports[0].text, /Known attacker: 50% hull/);
assert.match(defeatReports[0].text, /Before retrying/);

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
for (const actor of sharedTargets) space.kill(actor, helper.ent!);
assert.equal(owner.data.story.active!.ready, true);
assert.equal(helper.data.story.active!.ready, true, 'Eligible helper finishes the same objective');
assert.equal(
  stranger.data.story.active!.ready,
  true,
  'An unrelated earlier choice does not exclude a helper from shared progress',
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
armadaAction(owner, 'storyStop');
armadaAction(stranger, 'storyStop');

// A different Part II campaign is a different objective: no shared credit, and the helper is told.
const fleet = STORY.find((entry) => entry.id === 'p2-fleet')!;
const fleetSpace = game.spaces['mw-sol'];
const campaigns: Array<[FixtureSession, 'border' | 'ascendant']> = [
  [owner, 'border'],
  [helper, 'border'],
  [stranger, 'ascendant'],
];
for (const [session, campaign] of campaigns) {
  session.data.armada = 'test';
  session.data.story = {
    step: STORY.indexOf(fleet),
    done: [],
    flags: {
      main_ending: 'table',
      crossed_quantum_rift: true,
      p2_campaign: campaign,
      d1: session === helper ? 'hollow' : 'concord',
    },
    active: { id: fleet.id, got: 0, spawned: true, ready: false, stage: 1 },
  };
  session.data.sys = 'mw-sol';
  session.data.stellar = null;
  game.spawnPlayer(session, 49000, -9000, 0, 0);
}
armadaAction(helper, 'storyAssist', owner.name!);
armadaAction(stranger, 'storyAssist', owner.name!);
const strangerToasts = stranger.sock.out.length;
const helperToasts = helper.sock.out.length;
armadaAction(owner, 'storyShare');
assert.deepEqual(owner.sharedStory!.progressHelpers, [helper.id]);
const notice = /fight is not your current story step, so it won't advance your chapter/;
assert.ok(
  stranger.sock.out
    .slice(strangerToasts)
    .some((packet) => packet.t === 'toast' && notice.test(packet.msg)),
  'An excluded helper is told why their progress does not move',
);
assert.equal(
  helper.sock.out
    .slice(helperToasts)
    .some((packet) => packet.t === 'toast' && notice.test(packet.msg)),
  false,
  'An included helper gets no exclusion notice',
);
const fleetTargets = [...fleetSpace.ships.values()].filter(
  (actor) => actor.story === owner.id && actor.storyKill && actor.storyMission === fleet.id,
);
assert.ok(fleetTargets.length >= 2);
for (const [index, actor] of fleetTargets.entries()) {
  if (index === 1) stranger.data.story.flags!.p2_campaign = 'border';
  fleetSpace.kill(actor, helper.ent!);
}
assert.equal(helper.data.story.active!.got, fleetTargets.length);
assert.equal(
  stranger.data.story.active!.got,
  0,
  'Branch-ineligible helper cannot gain chapter credit partway through a frozen fight',
);
armadaAction(owner, 'storyStop');
armadaAction(helper, 'storyStop');
armadaAction(stranger, 'storyStop');
for (const actor of fleetSpace.ships.values())
  if (actor.story && party.some((session) => actor.story === session.id)) fleetSpace.remove(actor);
for (const session of party) {
  session.data.story = {
    step: STORY.indexOf(mission),
    done: [],
    active: { id: mission.id, got: 0, spawned: false, ready: false },
  };
  session.data.sys = mission.sys!;
  session.data.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
}

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
assert.ok(roster && 'members' in roster && roster.members);
assert.equal(
  roster.members.find((member) => member.name === helper.data.name)?.followStatus,
  'Cannot follow: story access required',
);
console.log(
  'Shared story wire ingress, same-step completion, branch denial, recovery and gated following passed.',
);

// Shared boss fights scale with the live roster and never heal or break targets on change.
const anchorMission = STORY.find((entry) => entry.id === 'qv4')!;
const anchorSpace = game.spaces[anchorMission.sys!];
const anchorParty = [owner, helper, stranger];
for (const session of anchorParty) {
  delete session.sharedStory;
  delete session.storyAssistOwner;
  delete session.storyAssistFlight;
}
for (const actor of anchorSpace.ships.values())
  if (actor.story && anchorParty.some((session) => actor.story === session.id))
    anchorSpace.remove(actor);
for (const session of anchorParty) {
  session.data.armada = 'test';
  session.data.story = {
    step: STORY.indexOf(anchorMission),
    done: [],
    active: { id: anchorMission.id, got: 0, spawned: false, ready: false },
  };
  session.data.sys = anchorMission.sys!;
  session.data.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
}
if (!game.db.world.armadas.test.members.includes(helper.data.name))
  game.db.world.armadas.test.members.push(helper.data.name);
const anchor = [...anchorSpace.ships.values()].find(
  (actor) => actor.story === owner.id && actor.storyKill && actor.storyMission === 'qv4',
)!;
assert.ok(anchor, 'Owner arrival spawns the Night Anchor');
const anchorEscorts = [...anchorSpace.ships.values()].filter(
  (actor) => actor.owner === anchor.id && !actor.storyAlly,
);
assert.equal(anchorEscorts.length, 2, 'The Anchor keeps its two escorts');
const choir = [...anchorSpace.ships.values()].find(
  (actor) => actor.storyAlly && actor.owner === owner.ent!.id,
)!;
assert.ok(choir, "The owner's Que'vari allies are present");
const soloAnchor = { ...anchor.st };
const soloEscort = { ...anchorEscorts[0].st };
const soloChoir = { ...choir.st };
const helperArmor = helper.ent!.st.armor;
// The story tick is the production scaling hook; calling it alone keeps combat from moving health.
const tickAnchor = () => game.features.story.storyTick(owner, anchorSpace, 0);

anchorSpace.tick();
assert.equal(anchor.st.armor, soloAnchor.armor, 'No roster leaves the solo encounter unchanged');

armadaAction(helper, 'storyAssist', owner.name!);
armadaAction(stranger, 'storyAssist', owner.name!);
armadaAction(owner, 'storyShare');
assert.equal(liveSharedHelpers(game, owner), 2);
anchorSpace.tick();
assert.equal(
  anchor.st.armor,
  soloAnchor.armor * sharedEncounterScale(2).durability,
  'A real space tick applies roster scaling',
);
anchor.armor = anchor.st.armor * 0.5;
anchor.shield = 0;
tickAnchor();
const twoHelpers = sharedEncounterScale(2);
assert.ok(twoHelpers.durability > 1 && twoHelpers.damage > 1);
assert.equal(anchor.st.armor, soloAnchor.armor * twoHelpers.durability, 'Anchor armor scales');
assert.equal(anchor.st.shield, soloAnchor.shield * twoHelpers.durability, 'Anchor shield scales');
assert.equal(anchor.st.damageMul, soloAnchor.damageMul * twoHelpers.damage, 'Anchor damage scales');
assert.ok(
  Math.abs(anchor.armor / anchor.st.armor - 0.5) < 0.01,
  'Scaling up keeps the damaged fraction and does not heal',
);
assert.equal(
  anchorEscorts[0].st.armor,
  soloEscort.armor * twoHelpers.durability,
  'Escorts commanded by the Anchor scale with it',
);
assert.equal(choir.st.armor, soloChoir.armor, 'Allied story ships keep their solo stats');
assert.equal(helper.ent!.st.armor, helperArmor, 'Player ships are never scaled');
const scaledArmor = anchor.st.armor;
tickAnchor();
assert.equal(anchor.st.armor, scaledArmor, 'Repeated ticks do not compound scaling');

armadaAction(stranger, 'storyStop');
tickAnchor();
assert.equal(liveSharedHelpers(game, owner), 1);
assert.equal(
  anchor.st.armor,
  soloAnchor.armor * sharedEncounterScale(1).durability,
  'A helper leaving the roster lowers the scale',
);
assert.ok(
  Math.abs(anchor.armor / anchor.st.armor - 0.5) < 0.02,
  'Scaling down keeps the damaged fraction',
);

game.sessions.delete(helper.id);
tickAnchor();
assert.equal(anchor.st.armor, soloAnchor.armor, 'A disconnected helper no longer counts');
game.sessions.set(helper.id, helper);
tickAnchor();
assert.equal(
  anchor.st.armor,
  soloAnchor.armor * sharedEncounterScale(1).durability,
  'A helper still on the frozen roster counts again once the live checks pass',
);
armadaAction(owner, 'storyStop');
tickAnchor();
assert.equal(anchor.st.armor, soloAnchor.armor, 'Stopping assistance restores the solo fight');
assert.equal(anchor.st.damageMul, soloAnchor.damageMul);
assert.equal(anchorEscorts[0].st.armor, soloEscort.armor);
assert.deepEqual(
  sharedEncounterScale(40),
  sharedEncounterScale(4),
  'Large rosters stop adding scale at the cap',
);
console.log(
  'Shared story scaling: live roster durability and damage, allies untouched, health fraction kept, withdrawal/disconnect/stop restore passed.',
);
