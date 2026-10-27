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
import { NakamaDatabase } from '../server/nakama-storage.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';
import { makeLoadout } from '../shared/rules.ts';
import { seed, lots } from './helpers/refinery-fixture.ts';
import type { RefineryQuote } from '../shared/refinery-wire.ts';
import type { Motherlode } from '../server/towing-contracts.ts';

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
  /** Hold replies to model delivery loss after a server-side commit. */
  holdReplies: () => void;
  /** Replies withheld from the peer. */
  heldReplies: unknown[];
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
  let holdingReplies = false;
  const heldReplies: unknown[] = [];
  socket.send = (message: string) => {
    const packet = typeof message === 'string' ? JSON.parse(message) : message;
    if (holdingReplies) heldReplies.push(packet);
    else socket.out.push(packet);
  };
  socket.close = () => {
    closeRequested = true;
  };
  game.connect(socket, 'fixture-fault-' + addressCounter++);
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  return {
    socket,
    session,
    heldReplies,
    holdReplies: () => {
      holdingReplies = true;
    },
    closeRequested: () => closeRequested,
    deliver: (packet) => socket.emit('message', JSON.stringify(packet)),
  };
}
function signIn(game: Game, name = captainName): FaultClient {
  const client = connect(game);
  const login = () => client.deliver({ t: 'hello', name, pass: 'fixture-pass' });
  if (game.db instanceof NakamaDatabase) game.db.withAuthenticatedCaptain(name, login);
  else login();
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

/** Virtual delivery order is fixed by test data, without timers or random jitter. */
class FaultQueue {
  private pending: Array<{ at: number; label: string; deliver: () => void }> = [];
  add(at: number, label: string, client: () => FaultClient, packet: Record<string, unknown>) {
    const serialized = JSON.stringify(packet);
    this.pending.push({ at, label, deliver: () => client().deliver(JSON.parse(serialized)) });
  }
  next(expected: string) {
    this.pending.sort((left, right) => left.at - right.at);
    const next = requiredFixtureValue(this.pending.shift());
    assert.equal(next.label, expected, 'fault schedule delivers the intended reordered packet');
    next.deliver();
  }
}

/** Same optimistic write/acknowledgement seam used by NakamaDatabase in the match. */
class FaultStorage implements StorageBackend {
  private row: { value: object; version: string } | null = null;
  private writes = 0;
  failure: 'before-write' | 'lost-ack' | null = null;
  injected = false;
  read() {
    return this.row && structuredClone(this.row);
  }
  write(_key: string, value: object, version: string) {
    if (this.failure === 'before-write') {
      this.injected = true;
      throw Error('fixture before native checkpoint write');
    }
    assert.equal(version, this.row?.version ?? '*', 'the real checkpoint retains CAS ownership');
    const next = String(++this.writes);
    this.row = { value: structuredClone(value), version: next };
    if (this.failure === 'lost-ack') {
      this.injected = true;
      throw Error('fixture native write committed but acknowledgement lost');
    }
    return next;
  }
}

type FaultPoint =
  | 'clean'
  | 'before-journal'
  | 'after-journal'
  | 'between-snapshots'
  | 'final-sync'
  | 'before-write'
  | 'lost-ack';
/** Inject at the real journal boundaries; restore process-wide seams synchronously. */
function interrupt(
  database: Database | NakamaDatabase,
  storage: FaultStorage | null,
  point: FaultPoint,
  deliver: () => void,
) {
  if (storage) {
    if (point === 'before-write' || point === 'lost-ack') storage.failure = point;
    try {
      deliver();
    } finally {
      storage.failure = null;
    }
    if (point !== 'clean') assert.equal(storage.injected, true, point);
    return;
  }
  assert.ok(database instanceof Database);
  const rename = fileSystem.renameSync;
  // oxlint-disable-next-line typescript/unbound-method -- Restore and call with the original database receiver.
  const write = database.writeDurable;
  // oxlint-disable-next-line typescript/unbound-method -- Restore and call with the original database receiver.
  const sync = database.syncDirectory;
  let injected = false;
  let syncs = 0;
  try {
    database.writeDurable = function (file, text) {
      if (point === 'before-journal' && file === this.journal + '.tmp') {
        injected = true;
        throw Error('fixture before journal installation');
      }
      return write.call(this, file, text);
    };
    fileSystem.renameSync = (from, to) => {
      if (point === 'between-snapshots' && to === database.wfile) {
        injected = true;
        throw Error('fixture between player and world snapshots');
      }
      const result = rename(from, to);
      if (point === 'after-journal' && to === database.journal) {
        injected = true;
        throw Error('fixture committed journal acknowledgement lost');
      }
      return result;
    };
    database.syncDirectory = function () {
      if (point === 'final-sync' && ++syncs === 3) {
        injected = true;
        throw Error('fixture after journal unlink');
      }
      return sync.call(this);
    };
    deliver();
  } finally {
    fileSystem.renameSync = rename;
    database.writeDurable = write;
    database.syncDirectory = sync;
  }
  if (point !== 'clean') assert.equal(injected, true, point);
}

function prepareTow(game: Game, client: FaultClient, existing?: Motherlode) {
  const player = client.session.data;
  player.ship = makeLoadout(game.A, 815);
  player.sys = 'meridian';
  player.stellar = null;
  game.spawnPlayer(client.session, 10000, 10000, 0, 0);
  game.features.towing.ensure('meridian');
  const load =
    existing ??
    requiredFixtureValue(
      requiredFixtureValue(game.db.world.towing).slots.find((slot) => slot.sys === 'meridian')
        ?.object,
    );
  const entity = requiredFixtureValue(client.session.ent);
  Object.assign(entity, { x: load.x, y: load.y - 90, vx: 0, vy: 0 });
  player.miningSurvey = {
    version: 1,
    sys: player.sys,
    x: entity.x,
    y: entity.y,
    revealUntil: requiredFixtureValue(game.db.world.mining).clock + 6,
    cooldownUntil: 0,
  };
  client.deliver({ t: 'towing', op: 'attach', id: load.id, revision: load.revision });
  assert.equal(load.status, 'attached');
  const port = STELLARS[load.acceptPorts[0]];
  Object.assign(entity, { x: port.x, y: port.y + port.r + 30, vx: 0, vy: 0 });
  Object.assign(load, { x: port.x, y: port.y + port.r + 90, vx: 0, vy: 0 });
  return {
    load,
    packet: { t: 'towing', op: 'deliver', id: load.id, revision: load.revision, port: port.id },
  };
}

const originalClock = Date.now;
Date.now = () => 1800000000000;
try {
  let interruptedScenarios = 0;
  for (const backend of ['journal', 'native-cas'] as const) {
    const points: FaultPoint[] =
      backend === 'journal'
        ? ['clean', 'before-journal', 'after-journal', 'between-snapshots', 'final-sync']
        : ['clean', 'before-write', 'lost-ack'];
    for (const family of ['refinery', 'towing'] as const)
      for (const point of points) {
        const directory = tempDataDir('rift-economic-fault-');
        const storage = backend === 'native-cas' ? new FaultStorage() : null;
        const open = () => (storage ? new NakamaDatabase(storage) : new Database(directory));
        const database = open();
        const game = new Game(assets, database, platform);
        const name = 'Fault ' + family + ' ' + points.indexOf(point);
        const first = signIn(game, name);
        const player = first.session.data;
        player.tut = 999;
        player.credits = 1e8;
        let packet: Record<string, unknown>;
        let bindingQuote: RefineryQuote | undefined;
        let load: Motherlode | undefined;
        if (family === 'refinery') {
          player.ship = makeLoadout(game.A, 704);
          seed(player, { ore: lots(6) });
          first.deliver({
            t: 'refinery',
            op: 'quote',
            recipe: 'alloy',
            n: 3,
            grade: 'common',
            mode: 'stored',
          });
          bindingQuote = requiredFixtureValue(game.db.world.refinery?.quotes.at(-1));
          packet = { t: 'refinery', op: 'submit', id: bindingQuote.id };
        } else {
          const prepared = prepareTow(game, first);
          load = prepared.load;
          packet = prepared.packet;
        }
        database.touch();
        database.flush();
        const beforeCredits = player.credits;
        const beforeOre = player.cargo.ore || 0;
        const queue = new FaultQueue();
        let current = first;
        // Enqueue in send order but deliver by chosen arrival order; replies disappear.
        queue.add(40, 'stale-delayed', () => first, packet);
        queue.add(10, 'first-arrival', () => first, packet);
        queue.add(30, 'retry-after-restart', () => current, packet);
        queue.add(20, 'replay-before-recovery', () => first, packet);
        first.holdReplies();
        interrupt(database, storage, point, () => queue.next('first-arrival'));
        const committed = !['before-journal', 'before-write'].includes(point);
        assert.equal(
          database.economicFrozen,
          !['clean', 'before-journal'].includes(point),
          'uncertain/native commit failures freeze the original authority',
        );
        const expectedOre =
          beforeOre + (family === 'refinery' ? -3 : requiredFixtureValue(load).mass);
        const expectedCredits = beforeCredits - (bindingQuote?.fee ?? 0);
        if (committed) {
          assert.equal(player.cargo.ore || 0, expectedOre, 'memory retains committed settlement');
          assert.equal(player.credits, expectedCredits);
        } else if (backend === 'journal') {
          assert.equal(
            player.cargo.ore || 0,
            beforeOre,
            'known precommit journal failure rolls memory back',
          );
          assert.equal(player.credits, beforeCredits);
        }
        // A crash before journal installation must not accidentally turn its queued retry into a commit.
        if (point === 'before-journal') game.sessions.clear();
        const replayBefore = JSON.stringify({ player, world: database.world });
        queue.next('replay-before-recovery');
        assert.equal(
          JSON.stringify({ player, world: database.world }),
          replayBefore,
          'receipt replay or frozen checkpoint cannot settle again',
        );
        assert.ok(first.heldReplies.length, 'at least one settlement/denial response was withheld');
        if (point === 'clean') {
          first.socket.emit('close');
          const liveRetry = signIn(game, name);
          liveRetry.deliver(packet);
          assert.equal(
            liveRetry.session.data.cargo.ore || 0,
            expectedOre,
            'lost response followed by graceful reconnect cannot replay receipt output',
          );
          assert.equal(liveRetry.session.data.credits, expectedCredits);
          assert.equal(liveRetry.session.inputs.length, 0);
          assert.equal(liveRetry.session.lastInput, null);
        }
        // Retire the crashed process without a graceful-disconnect flush or autosave.
        game.sessions.clear();
        database.economicFrozen = true;
        const recoveredDatabase = open();
        const recoveredGame = new Game(assets, recoveredDatabase, platform);
        current = signIn(recoveredGame, name);
        const restoredPlayer = current.session.data;
        assert.equal(
          restoredPlayer.cargo.ore || 0,
          committed ? expectedOre : beforeOre,
          'restart distinguishes durable settlement from an uncertain pre-write mutation',
        );
        assert.equal(restoredPlayer.credits, committed ? expectedCredits : beforeCredits);
        assert.equal(current.session.inputs.length, 0);
        assert.equal(current.session.lastInput, null);
        queue.next('retry-after-restart');
        const retiredState = JSON.stringify({ player, world: database.world });
        queue.next('stale-delayed');
        first.deliver({ t: 'input', seq: 887, th: 1, tu: 1 });
        assert.equal(
          current.session.inputs.length,
          0,
          'delayed old controls cannot enter the restored session',
        );
        assert.equal(current.session.lastInput, null);
        assert.equal(
          JSON.stringify({ player, world: database.world }),
          retiredState,
          'a delayed packet cannot act on a retired process/session',
        );
        if (family === 'towing' && !committed) {
          assert.equal(
            restoredPlayer.cargo.ore || 0,
            beforeOre,
            'stale revision cannot mint an uncommitted tow reward',
          );
          const restoredLoad = requiredFixtureValue(
            recoveredDatabase.world.towing?.slots.find(
              (slot) => slot.object?.id === requiredFixtureValue(load).id,
            )?.object,
          );
          const prepared = prepareTow(recoveredGame, current, restoredLoad);
          current.deliver(prepared.packet);
        }
        assert.equal(
          restoredPlayer.cargo.ore || 0,
          expectedOre,
          'one settlement after replay/recovery',
        );
        assert.equal(restoredPlayer.credits, expectedCredits, 'one exact fee, no replay debit');
        if (family === 'refinery') {
          const state = requiredFixtureValue(recoveredDatabase.world.refinery);
          assert.equal(
            state.batches.filter((batch) => batch.quote.id === bindingQuote!.id).length,
            1,
          );
          assert.equal(
            state.operations.filter(
              (receipt) => receipt.kind === 'submit' && receipt.id === bindingQuote!.id,
            ).length,
            1,
          );
        } else
          assert.equal(
            requiredFixtureValue(recoveredDatabase.world.towing).receipts.filter(
              (receipt) => receipt.id === requiredFixtureValue(load).id,
            ).length,
            1,
          );
        // A successful reconnect must observe the same state, not retransmit held intents.
        current.socket.emit('close');
        const rejoined = signIn(recoveredGame, name);
        rejoined.deliver(packet);
        assert.equal(rejoined.session.data.cargo.ore || 0, expectedOre);
        assert.equal(rejoined.session.data.credits, expectedCredits);
        assert.equal(rejoined.session.inputs.length, 0);
        interruptedScenarios++;
      }
  }
  console.log(
    `Deterministic delayed/reordered receipt requests: ${interruptedScenarios} journal/native-CAS interruption/restart scenarios passed.`,
  );

  for (const backend of ['journal', 'native-cas'] as const) {
    const directory = tempDataDir('rift-reward-fault-');
    const storage = backend === 'native-cas' ? new FaultStorage() : null;
    const open = () => (storage ? new NakamaDatabase(storage) : new Database(directory));
    const database = open();
    const game = new Game(assets, database, platform);
    let live = signIn(game, 'Reward Fault');
    const player = live.session.data;
    player.credits = 1e6;
    player.tut = 999;
    const goal = game.features.fronts.goalsFor(player).daily[0];
    goal.got = goal.n;
    database.touch();
    database.flush();
    const queue = new FaultQueue();
    const original = live;
    const claim = { t: 'goal', period: 'daily', i: 0 };
    original.holdReplies();
    queue.add(30, 'old-late-claim', () => original, claim);
    queue.add(10, 'first-claim', () => original, claim);
    queue.add(20, 'new-session-claim', () => live, claim);
    const before = player.credits;
    queue.next('first-claim');
    const after = player.credits;
    assert.ok(after > before, 'first completed goal pays');
    assert.ok(original.heldReplies.length, 'reward update can be lost before the peer sees it');
    original.socket.emit('close');
    live = signIn(game, 'Reward Fault');
    queue.next('new-session-claim');
    queue.next('old-late-claim');
    assert.equal(
      player.credits,
      after,
      'delayed old and new-session reward replays cannot pay twice',
    );
    const rewardEntries = player.log.length;
    database.flush();
    game.sessions.clear();
    database.economicFrozen = true;
    const restarted = new Game(assets, open(), platform);
    live = signIn(restarted, 'Reward Fault');
    live.deliver(claim);
    assert.equal(
      live.session.data.credits,
      after,
      'committed reward remains claimed after restart',
    );
    assert.equal(
      live.session.data.log.length,
      rewardEntries,
      'replayed reward cannot duplicate log history',
    );

    // Legacy actions have no retry token: two explicit live intents must stay distinct.
    const port = STELLARS[requiredFixtureValue(live.session.data.stellar)];
    const material = requiredFixtureValue(restarted.matsFor(port, live.session.data)[0]);
    const purchase = { t: 'buymat', mat: material.mat, grade: material.grade, n: 1 };
    const beforeMaterials = live.session.data.mats[material.mat][material.grade];
    const beforePurchases = live.session.data.credits;
    queue.add(60, 'purchase-intent-first-sent', () => live, purchase);
    queue.add(50, 'purchase-intent-second-sent', () => live, purchase);
    queue.next('purchase-intent-second-sent');
    queue.next('purchase-intent-first-sent');
    assert.equal(
      live.session.data.mats[material.mat][material.grade],
      beforeMaterials + 2,
      'identical live material purchase intents both settle; they are not receipt retries',
    );
    assert.equal(live.session.data.credits, beforePurchases - 2 * material.price);
  }
  console.log(
    'Delayed goal claims survive reconnect/restart once; two identical legacy purchase intents remain distinct on journal and native-CAS storage.',
  );
} finally {
  Date.now = originalClock;
}
