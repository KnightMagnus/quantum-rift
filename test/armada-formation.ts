import { mockArmadaState } from './helpers/mocks.ts';
import type { FixtureMessage } from './helpers/refinery-fixture.ts';
const observedMessage = (message: string | object): FixtureMessage =>
  (typeof message === 'string' ? JSON.parse(message) : message) as FixtureMessage;
import { requiredFixtureValue } from './helpers/required.ts';
// Production Space.tick / normal ship physics; seeded disposable captains, no save edits.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { FixtureSocket, type FixtureSession } from './helpers/refinery-fixture.ts';
import type { Entity } from '../server/space.ts';
import { Game } from '../server/game.ts';
import { DB as Database } from '../server/db.ts';
import { makeLoadout } from '../shared/rules.ts';
import { ARMADA } from '../shared/coop.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { formationTargets, fleetFootprint } from '../server/armada-formation.ts';
const assets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-v-'));
process.on('exit', () => filesystem.rmSync(directory, { recursive: true, force: true }));
const game = new Game(assets, new Database(directory));
const space = game.spaces.sol;
space.ships.clear();
space.players = 0;
const sessions: (FixtureSession & { ent: Entity })[] = [];
for (let index = 0; index < 5; index++) {
  const name = 'V Captain ' + index,
    playerData = { ...game.fresh(), name };
  playerData.sys = 'sol';
  playerData.stellar = null;
  playerData.name = name;
  playerData.tut = 999;
  playerData.ship = makeLoadout(game.A, index === 2 ? 714 : 704, name);
  game.db.create(name, 'fixture', playerData);
  const sock = new FixtureSocket();
  sock.send = () => {};
  game.connect(sock);
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  game.onMessage(session, { t: 'hello', name, pass: 'fixture' });
  requiredFixtureValue(session).data.sys = 'sol';
  requiredFixtureValue(session).data.stellar = null;
  game.spawnPlayer(session, 500 * index, 500, 0, 0);
  sessions.push(session as FixtureSession & { ent: Entity });
}
const [maybeLeader, ...followers] = sessions;
const leader = requiredFixtureValue(maybeLeader);
game.features.coop.armadaOp(leader, { op: 'form', name: 'V Fixture' });
const identifier = requiredFixtureValue(leader).data.armada;
assert.ok(typeof identifier === 'string');
for (const session of followers) {
  game.features.coop.armadaOp(leader, {
    op: 'invite',
    name: requiredFixtureValue(session).data.name,
  });
  game.features.coop.armadaOp(session, { op: 'accept', id: identifier });
  game.features.coop.armadaOp(session, { op: 'follow', on: true });
}
// oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
for (const entity of [...space.ships.values()]) if (!entity.player) space.remove(entity);
const wing = space.makeShip({ hull: 704, faction: 'quantum', x: 0, y: 0 });
wing.owner = requiredFixtureValue(followers[1]).ent.id;
wing.ai = 'escort';
wing.slot = 3;
wing.x = requiredFixtureValue(followers[1]).ent.x + 200;
wing.y = requiredFixtureValue(followers[1]).ent.y + 200;
space.players = 0;
space.spawnT = 1e9;
const bigGap = requiredFixtureValue(formationTargets(space).get(followers[0].ent.id)).gap;
assert.ok(bigGap > 2 * fleetFootprint(space, requiredFixtureValue(followers[1]).ent));
const trace: { name: string; x: number; y: number; v: number }[][] = [];
function runScenario(seconds: number, input = {}) {
  requiredFixtureValue(leader).lastInput = input;
  for (let index = 0; index < seconds * 30; index++) {
    space.tick();
    if (index % 30 === 0)
      trace.push(
        sessions.map((session) => ({
          name: session.data.name,
          x: session.ent.x,
          y: session.ent.y,
          v: Math.hypot(session.ent.vx, session.ent.vy),
        })),
      );
  }
}
function errors() {
  return followers.map((session) => {
    const formationTarget = requiredFixtureValue(session).armadaFormationTarget;
    return Math.hypot(
      requiredFixtureValue(session).ent.x - requiredFixtureValue(formationTarget).x,
      requiredFixtureValue(session).ent.y - requiredFixtureValue(formationTarget).y,
    );
  });
}
runScenario(160);
console.log('stationary initial', errors());
assert.ok(
  errors().every((formationError) => formationError < 100),
  'captains assemble into V using actual physics',
);
const before = followers.map((session) => ({
  x: requiredFixtureValue(session).ent.x,
  y: requiredFixtureValue(session).ent.y,
}));
runScenario(8, { thrust: 1 });
runScenario(50);
console.log('moving', errors());
assert.ok(
  followers.every(
    (session, index) =>
      Math.hypot(
        requiredFixtureValue(session).ent.x - before[index].x,
        requiredFixtureValue(session).ent.y - before[index].y,
      ) > 100,
  ),
);
runScenario(1.5, { turn: 1 });
runScenario(80, { rev: 1, thrust: 1 });
runScenario(160);
console.log('turned and stop input', errors());
// Explicitly brake the leader with ordinary inputs, then hold stationary.
for (
  let index = 0;
  index < 2000 &&
  Math.hypot(requiredFixtureValue(leader).ent.vx, requiredFixtureValue(leader).ent.vy) > 3;
  index++
) {
  const shipEntity = requiredFixtureValue(leader).ent,
    want = Math.atan2(-requiredFixtureValue(shipEntity).vx, requiredFixtureValue(shipEntity).vy),
    leaderAngle = Math.atan2(
      Math.sin(want - requiredFixtureValue(shipEntity).a),
      Math.cos(want - requiredFixtureValue(shipEntity).a),
    );
  requiredFixtureValue(leader).lastInput = {
    turn:
      Math.abs(leaderAngle) < requiredFixtureValue(shipEntity).st.turn / 30
        ? 0
        : Math.sign(leaderAngle),
    thrust: Math.abs(leaderAngle) < 0.2 ? 1 : 0,
  };
  space.tick();
}
requiredFixtureValue(leader).lastInput = {};
runScenario(160);
console.log(
  'final stop',
  errors(),
  sessions.map((session) =>
    Math.hypot(requiredFixtureValue(session).ent.vx, requiredFixtureValue(session).ent.vy),
  ),
);
assert.ok(
  errors().every((formationError2) => formationError2 < 120),
  'settles after leader turns/moves/stops',
);
for (let index = 0; index < followers.length; index++)
  for (let secondaryIndex = index + 1; secondaryIndex < followers.length; secondaryIndex++) {
    const shipEntity = requiredFixtureValue(followers[index]).ent,
      shipEntity2 = requiredFixtureValue(followers[secondaryIndex]).ent;
    assert.ok(
      Math.hypot(
        requiredFixtureValue(shipEntity).x - requiredFixtureValue(shipEntity2).x,
        requiredFixtureValue(shipEntity).y - requiredFixtureValue(shipEntity2).y,
      ) >
        fleetFootprint(space, shipEntity) + fleetFootprint(space, shipEntity2),
    );
  }
const slots = followers.map((session) => requiredFixtureValue(session).armadaFormationTarget!.slot);
game.features.coop.armadaOp(followers[0], { op: 'follow', on: false });
space.tick();
assert.deepEqual(
  followers.slice(1).map((session) => requiredFixtureValue(session).armadaFormationTarget!.slot),
  slots.slice(1),
);
game.features.coop.armadaOp(followers[0], { op: 'follow', on: true });
game.onMessage(followers[0], { t: 'input', seq: 1, th: 1, nav: true });
space.tick();
assert.equal(
  requiredFixtureValue(followers[0]).data.armadaFollow,
  true,
  'navigation preserves consent for jumps',
);
assert.equal(
  requiredFixtureValue(followers[0]).armadaFormationTarget,
  null,
  'navigation yields authoritative formation',
);
assert.equal(
  requiredFixtureValue(followers[0]).ent.inp.thrust,
  1,
  'navigation controls reach normal physics',
);
game.onMessage(followers[0], { t: 'input', seq: 2 });
space.tick();
assert.ok(
  requiredFixtureValue(followers[0]).armadaFormationTarget,
  'formation resumes when navigation ends',
);
game.onMessage(followers[0], { t: 'input', seq: 3, th: 1 });
space.tick();
assert.equal(
  requiredFixtureValue(followers[0]).data.armadaFollow,
  false,
  'manual takeover disables Follow',
);
assert.equal(requiredFixtureValue(followers[0]).ent.inp.thrust, 1);
game.features.coop.armadaOp(followers[0], { op: 'follow', on: true });
requiredFixtureValue(followers[0]).ent.autoCombat = true;
assert.equal(
  formationTargets(space).has(requiredFixtureValue(followers[0]).ent.id),
  false,
  'combat priority',
);
requiredFixtureValue(followers[0]).ent.autoCombat = false;
// Every captain follows the human root, while owned NPC wings keep their owner.
assert.equal(
  space.root(wing),
  requiredFixtureValue(followers[1]).ent,
  'NPC wing is rooted in its own captain',
);
for (const session of followers) {
  assert.equal(
    requiredFixtureValue(session).armadaFormationLeader,
    requiredFixtureValue(leader).data.name,
    'all captains follow the actual Armada leader',
  );
  const shipEntity = requiredFixtureValue(session).ent;
  requiredFixtureValue(shipEntity).disabled = true;
  assert.equal(
    formationTargets(space).has(requiredFixtureValue(shipEntity).id),
    false,
    'disabled follower suspends formation',
  );
  requiredFixtureValue(shipEntity).disabled = false;
  requiredFixtureValue(shipEntity).state = 'jumpout';
  assert.equal(
    formationTargets(space).has(requiredFixtureValue(shipEntity).id),
    false,
    'jumping follower suspends formation',
  );
  requiredFixtureValue(shipEntity).state = 'fly';
  assert.equal(
    requiredFixtureValue(session).data.armadaFollow,
    true,
    'temporary suspension retains explicit consent',
  );
}
const leaderEntity = requiredFixtureValue(leader).ent;
Reflect.set(requiredFixtureValue(leader), 'ent', null);
assert.equal(
  formationTargets(space).size,
  0,
  'landed/offline leader suspends flight without hijack',
);
requiredFixtureValue(leader).ent = leaderEntity;
requiredFixtureValue(leader).data.sys = 'meridian';
assert.equal(formationTargets(space).size, 0);
requiredFixtureValue(leader).data.sys = 'sol';
const sent: FixtureMessage[] = [];
// The production jump method dispatches through socket.send; observe actual packets.
for (const session of followers)
  requiredFixtureValue(session).sock.send = (message) => sent.push(observedMessage(message));
game.features.coop.armadaLeaderJump(leader, 'meridian');
assert.equal(
  sent.filter((message) => message.t === 'follow').length,
  4,
  'opted-in leader jump routing preserved',
);
// Follow routes a request, not jump permission. The ordinary server jump gates
// remain authoritative for every human follower; no fuel or transit bypass.
const jumpFollower = followers[0],
  jumpShip = requiredFixtureValue(jumpFollower).ent;
const messages: FixtureMessage[] = [];
requiredFixtureValue(jumpFollower).sock.send = (message) => messages.push(observedMessage(message));
const savedFuel = requiredFixtureValue(jumpShip).fuel;
requiredFixtureValue(jumpShip).fuel = 0;
game.jump(jumpFollower, systemsById[requiredFixtureValue(jumpFollower).data.sys].links[0]);
assert.equal(requiredFixtureValue(jumpShip).state, 'fly', 'no-fuel follower cannot jump');
assert.ok(
  messages.some((message) => message.t === 'toast' && /fuel/i.test(message.msg)),
  'fuel denial is explained',
);
requiredFixtureValue(jumpShip).fuel = savedFuel;
requiredFixtureValue(jumpShip).disabled = true;
game.jump(jumpFollower, systemsById[requiredFixtureValue(jumpFollower).data.sys].links[0]);
assert.equal(requiredFixtureValue(jumpShip).state, 'fly', 'disabled follower cannot jump');
requiredFixtureValue(jumpShip).disabled = false;
game.jump(jumpFollower, 'nonexistent-system');
assert.equal(requiredFixtureValue(jumpShip).state, 'fly', 'invalid route cannot jump');
assert.equal(requiredFixtureValue(jumpShip).fuel, savedFuel, 'denials consume no fuel');
const leaderSession = [...game.sessions.entries()].find(([, session]) => session === leader);
game.sessions.delete(requiredFixtureValue(leaderSession)[0]);
assert.equal(
  formationTargets(space).size,
  0,
  'actual missing leader session suspends every follower',
);
game.sessions.set(...requiredFixtureValue(leaderSession));
assert.equal(formationTargets(space).size, 4, 'leader session return resumes unchanged consent');
game.features.coop.armadaOp(leader, {
  op: 'lead',
  name: requiredFixtureValue(followers[1]).data.name,
});
space.tick();
assert.equal(
  requiredFixtureValue(followers[0]).data.armadaFollow,
  false,
  'leader transfer revokes old flight consent',
);
assert.equal(requiredFixtureValue(followers[2]).data.armadaFollow, false);

// Idle cleanup may retain names from removed/imported accounts or older membership.
// Expiring one group must not throw or revoke consent belonging to a different group.
const idleId = 'expired-formation-fixture';
const idleOwner = game.db.create('Idle Formation', 'fixture', game.fresh());
idleOwner.armada = idleId;
idleOwner.armadaFollow = true;
const movedOwner = game.db.create('Moved Formation', 'fixture', game.fresh());
movedOwner.armada = identifier;
movedOwner.armadaFollow = true;
game.db.world.armadas[idleId] = mockArmadaState({
  id: idleId,
  name: 'Expired fixture',
  leader: 'Deleted Formation',
  members: ['Deleted Formation', idleOwner.name, movedOwner.name],
  invites: {},
  emptyT: Date.now() - ARMADA.idleMin * 60000 - 1000,
});
assert.doesNotThrow(() => game.features.coop.coopTick(), 'missing idle member is safe');
assert.equal(game.db.world.armadas[idleId], undefined, 'expired group is removed');
assert.equal(idleOwner.armada, null, 'actual member leaves expired group');
assert.equal(idleOwner.armadaFollow, false, 'actual member loses stale Follow consent');
assert.equal(movedOwner.armada, identifier, 'new membership survives obsolete group cleanup');
assert.equal(movedOwner.armadaFollow, true, 'new group Follow consent remains intact');
if (process.env.RIFT_FORMATION_EVIDENCE)
  filesystem.writeFileSync(
    process.env.RIFT_FORMATION_EVIDENCE,
    JSON.stringify({ gap: bigGap, trace, finalErrors: errorsSafe() }, null, 2),
  );
function errorsSafe() {
  return followers.map((session) => ({
    name: requiredFixtureValue(session).data.name,
    follow: requiredFixtureValue(session).data.armadaFollow,
  }));
}
console.log(
  'Five production captains: assembly, large hull + wing spacing, movement/turn/stop, slots, manual input, combat priority, leader loss/transfer and jump routing passed.',
);
process.exit(0);
