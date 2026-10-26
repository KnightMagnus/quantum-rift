import { legacySocket, type LegacySocket } from './helpers/legacy-fixture.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Deterministic network-fault regressions: replayed claims, evicted connections and restarts.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DB as Database } from '../server/db.ts';
import { Game, type Session } from '../server/game.ts';
import type { GamePlatform } from '../server/game-platform.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const assets = JSON.parse(
  fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const saveDirectory = tempDataDir('rift-network-faults-');
const captainName = 'Fault Captain';
const platform: GamePlatform = {
  automaticClock: false,
  seedDefinitions: [],
  randomUUID,
  defer: (callback) => callback(),
};

/** A fixture connection whose packets travel through Game.connect's socket listener. */
interface FaultClient {
  /** Controlled transport registered through Game.connect. */
  socket: LegacySocket;
  /** Whether Game asked this transport to close. */
  closeRequested: () => boolean;
  /** Authoritative session associated with this transport. */
  session: Session;
  /** Deliver one packet as the transport would, including after the socket closed. */
  deliver: (packet: Record<string, unknown>) => void;
}

let addressCounter = 1;
function connect(game: Game): FaultClient {
  const socket = legacySocket();
  let closeRequested = false;
  socket.open = true;
  socket.backlog = 0;
  socket.out = [];
  socket.send = (message: string) =>
    socket.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  socket.close = () => {
    closeRequested = true;
  };
  game.connect(socket, 'fixture-fault-' + addressCounter++);
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  return {
    socket,
    session,
    closeRequested: () => closeRequested,
    deliver: (packet) => socket.emit('message', JSON.stringify(packet)),
  };
}
function signIn(game: Game): FaultClient {
  const client = connect(game);
  client.deliver({ t: 'hello', name: captainName, pass: 'fixture-pass' });
  assert.ok(client.session.data, 'fixture captain signs in');
  return client;
}

const firstGame = new Game(assets, new Database(saveDirectory), platform);
const original = signIn(firstGame);
const captain = original.session.data;
captain.credits = 200000;
const homePort = STELLARS[requiredFixtureValue(captain.stellar)];

// Replayed reward claims settle once.
{
  const goal = firstGame.features.fronts.goalsFor(captain).daily[0];
  goal.got = goal.n;
  const beforeClaim = captain.credits;
  original.deliver({ t: 'goal', period: 'daily', i: 0 });
  const afterClaim = captain.credits;
  assert.ok(afterClaim > beforeClaim, 'completed goal pays its reward');
  original.deliver({ t: 'goal', period: 'daily', i: 0 });
  original.deliver({ t: 'goal', period: 'daily', i: 0 });
  assert.equal(captain.credits, afterClaim, 'replayed goal claims cannot pay twice');
}

// A replayed job acceptance records one contract, and a repeated landing pays it once.
{
  const holdSpace =
    requiredFixtureValue(firstGame.features.shipStats.stats(captain)).cargo -
    firstGame.holdUsed(captain);
  const cargoJob = firstGame
    .offers(homePort, captain)
    .find(
      (offer) =>
        offer.type === 'cargo' &&
        requiredFixtureValue(offer.qty) <= holdSpace &&
        !!offer.dest &&
        !!STELLARS[offer.dest],
    );
  const job = requiredFixtureValue(cargoJob);
  original.deliver({ t: 'accept', id: job.id });
  original.deliver({ t: 'accept', id: job.id });
  assert.equal(
    captain.missions.filter((mission) => mission.id === job.id).length,
    1,
    'replayed accept cannot duplicate a contract',
  );
  const destination = STELLARS[requiredFixtureValue(job.dest)];
  captain.sys = destination.system;
  captain.stellar = destination.id;
  const beforeLanding = captain.credits;
  firstGame.completeOnLanding(original.session, destination);
  const afterLanding = captain.credits;
  assert.ok(afterLanding >= beforeLanding + job.reward, 'first landing pays the contract');
  firstGame.completeOnLanding(original.session, destination);
  assert.equal(captain.credits, afterLanding, 'a repeated landing cannot pay the contract again');
  assert.ok(!captain.missions.some((mission) => mission.id === job.id));
  captain.sys = homePort.system;
  captain.stellar = homePort.id;
}

// A replacement sign-in evicts the old connection; its late packets cannot act.
const replacement = signIn(firstGame);
{
  assert.equal(replacement.session.data, captain, 'replacement controls the same captain');
  assert.ok(original.closeRequested(), 'old connection is closed on replacement');
  assert.ok(!firstGame.sessions.has(original.session.id), 'old session is unregistered');
  assert.equal(original.session.data, captain, 'evicted session still references the captain');

  const material = requiredFixtureValue(firstGame.matsFor(homePort, captain)[0]);
  const creditsBefore = captain.credits;
  const materialBefore = captain.mats[material.mat][material.grade];
  const missionsBefore = captain.missions.length;
  const logBefore = captain.log.length;
  original.deliver({ t: 'buymat', mat: material.mat, grade: material.grade, n: 3 });
  original.deliver({ t: 'note', text: 'stale note' });
  const staleJob = firstGame.offers(homePort, captain)[0];
  if (staleJob) original.deliver({ t: 'accept', id: staleJob.id });
  original.deliver({ t: 'depart' });
  assert.equal(captain.credits, creditsBefore, 'evicted connection cannot spend credits');
  assert.equal(captain.mats[material.mat][material.grade], materialBefore);
  assert.equal(captain.missions.length, missionsBefore, 'evicted connection cannot accept jobs');
  assert.equal(captain.log.length, logBefore, 'evicted connection cannot write the captain log');
  assert.equal(original.session.ent, null, 'evicted connection cannot launch the ship');
  assert.equal(replacement.session.ent, null, 'replacement stays docked until it departs');

  // The live connection still acts normally.
  replacement.deliver({ t: 'buymat', mat: material.mat, grade: material.grade, n: 1 });
  assert.equal(captain.credits, creditsBefore - material.price, 'live connection still trades');
  assert.equal(captain.mats[material.mat][material.grade], materialBefore + 1);
}

// Flight controls belong to the current connection only.
{
  replacement.deliver({ t: 'depart' });
  const ship = requiredFixtureValue(replacement.session.ent);
  assert.equal(
    replacement.session.inputs.length,
    0,
    'a fresh flight starts without queued controls',
  );
  original.deliver({ t: 'input', seq: 1, th: 1, tu: 1, f1: 1 });
  assert.equal(replacement.session.inputs.length, 0, 'stale controls never reach the live ship');
  assert.equal(original.session.inputs.length, 0, 'stale controls are not queued for replay');
  replacement.deliver({ t: 'input', seq: 2, th: 1, tu: -1 });
  assert.equal(replacement.session.inputs.length, 1, 'live controls are accepted');
  assert.equal(requiredFixtureValue(replacement.session.inputs[0]).turn, -1);
  assert.equal(replacement.session.ent, ship);

  // Dropping mid-flight docks the captain; the reconnection starts with clean controls.
  replacement.socket.emit('close');
  assert.equal(replacement.session.ent, null);
  assert.ok(captain.stellar, 'a flight disconnect docks the captain');
  const closedQueue = replacement.session.inputs.length;
  replacement.deliver({ t: 'input', seq: 3, th: 1 });
  replacement.deliver({ t: 'depart' });
  assert.equal(replacement.session.inputs.length, closedQueue, 'packets after close are ignored');
  assert.equal(replacement.session.ent, null, 'a closed connection cannot relaunch');
  const reconnected = signIn(firstGame);
  assert.equal(reconnected.session.ent, null, 'reconnection restores the docked state');
  assert.equal(reconnected.session.inputs.length, 0);
  assert.equal(reconnected.session.lastInput, null, 'reconnection carries no stale controls');
}

// Restart: only committed progress survives, and a replay after restart cannot pay again.
const committedCredits = captain.credits;
const committedMissions = captain.missions.map((mission) => mission.id);
firstGame.db.touch();
firstGame.db.flush();
captain.credits += 777; // changed in memory but never flushed before the "crash"
firstGame.features.fronts.goalsFor(captain).daily[1].claimed = true;
firstGame.db.touch();

const restartedGame = new Game(assets, new Database(saveDirectory), platform);
const restored = signIn(restartedGame);
const restoredCaptain = restored.session.data;
assert.equal(restoredCaptain.credits, committedCredits, 'committed credits survive a restart');
assert.deepEqual(
  restoredCaptain.missions.map((mission) => mission.id),
  committedMissions,
  'committed contracts survive a restart',
);
const restoredGoals = restartedGame.features.fronts.goalsFor(restoredCaptain).daily;
assert.equal(restoredGoals[0].claimed, true, 'a committed claim stays claimed');
assert.ok(!restoredGoals[1].claimed, 'an uncommitted claim is not restored');
restored.deliver({ t: 'goal', period: 'daily', i: 0 });
assert.equal(
  restoredCaptain.credits,
  committedCredits,
  'replaying a committed claim after restart cannot pay twice',
);

console.log(
  'Network faults: replayed claims/accepts/landings settle once, evicted and closed connections cannot act or steer, reconnection has clean controls, restarts keep only committed progress.',
);
