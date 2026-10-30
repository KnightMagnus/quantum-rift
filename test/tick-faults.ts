import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import assets from '../shared/assets.json' with { type: 'json' };
import { Game } from '../server/game.ts';
import type { Session } from '../server/game.ts';
import { NakamaDatabase } from '../server/nakama-storage.ts';
import { AuthorityCallbacks } from '../server/authority-callbacks.ts';
import { advanceWorld } from '../server/nakama-world.ts';
import { HealthMonitor } from '../shared/health.ts';

class Connection extends EventEmitter {
  open = true;
  backlog = 0;
  send(): void {}
  close(): void {
    this.open = false;
  }
}
function fixture() {
  const health = new HealthMonitor(3);
  const backend = { read: () => null, write: () => '1' };
  const database = new NakamaDatabase(backend, health);
  const game = new Game(JSON.parse(JSON.stringify(assets)), database, {
    health,
    automaticClock: false,
    seedDefinitions: [],
    randomUUID: () => '00000000-0000-4000-8000-000000000150',
    defer: () => {},
  });
  const state = {
    game,
    database,
    authorityReady: true,
    connections: new Map(),
    deferred: new AuthorityCallbacks(() => 0),
    lastCheckpointAt: -100000,
    pendingEconomicCheckpoint: true,
  };
  const logs: unknown[][] = [];
  const run = () =>
    Reflect.apply(advanceWorld, undefined, [
      {},
      { error: (...args: unknown[]) => logs.push(args) },
      {},
      {},
      1,
      { world: () => state },
      [],
    ]);
  return { game, health, database, backend, state, run, logs };
}
const secret = 'captain-name/token/backend-save-content';
// A deferred failure must not allow simulation or checkpoint to run.
{
  const { game, health, database, state, run, logs } = fixture();
  let ticks = 0,
    writes = 0;
  game.tick = () => {
    ticks++;
  };
  database.flush = () => {
    writes++;
  };
  for (let index = 0; index < 25; index++) {
    state.deferred.schedule(() => {
      throw new TypeError(secret);
    }, 0);
    run();
  }
  assert.equal(ticks, 0);
  assert.equal(writes, 0);
  assert.equal(health.report().faultDeferred?.count, 25);
  assert.equal(health.report().faultType?.count, 25);
  assert.equal(logs.length, 19);
  assert.equal(JSON.stringify([logs, health.report(), game.tickFaults]).includes(secret), false);
}
// Exercise every maintenance boundary, with a successful two-captain control.
// Injected partial writes are fixture evidence, not rollback or live-incident proof.
for (const failingOperation of [
  null,
  'idle',
  'mission-idle',
  'deadlines',
  'quest-sweep',
  'quest-salvage',
  'bank',
  'raid',
  'specialist',
  'holdout',
]) {
  const { game, health, database, run, logs } = fixture();
  const captains: Session[] = [];
  for (const name of ['First captain', 'Second captain']) {
    game.connect(new Connection());
    const session = [...game.sessions.values()].at(-1)!;
    database.withAuthenticatedCaptain(name, () =>
      game.onMessage(session, { t: 'hello', name, pass: 'fixture-only' }),
    );
    assert.ok(session.data);
    captains.push(session);
  }
  const order: string[] = [];
  const hook = (operation: string) => (session: Session) => {
    order.push(`${captains.indexOf(session)}:${operation}`);
    if (operation === failingOperation) {
      session.data.credits -= 7;
      database.touch();
      throw new RangeError(secret);
    }
  };
  game.idleCheck = hook('idle');
  game.features.fronts.missionIdle = hook('mission-idle');
  game.features.syndicate.missionDeadlines = hook('deadlines');
  game.features.quests.questSweep = hook('quest-sweep');
  game.features.quests.questSalvageIdle = hook('quest-salvage');
  game.features.syndicate.bankTick = hook('bank');
  game.features.frontier.raidCheck = hook('raid');
  game.features.specialists.specIdle = hook('specialist');
  game.features.hostile.holdoutTick = hook('holdout');
  game.features.fronts.invasionTick = () => {
    order.push('world');
  };
  game.features.frontier.waveTick = () => {};
  game.features.frontier.arenaTick = () => {};
  game.features.coop.coopTick = () => {};
  game.hails.tick = () => {};
  game.spaces.meridian.tick = () => {
    order.push('space');
  };
  database.flush = () => {
    order.push('checkpoint');
  };
  game.tickN = 59;
  const credits = captains[0].data.credits;
  const secondCredits = captains[1].data.credits;
  run();
  const operations = [
    'idle',
    'mission-idle',
    'deadlines',
    'quest-sweep',
    'quest-salvage',
    'bank',
    'raid',
    'specialist',
    'holdout',
  ];
  if (failingOperation === null) {
    assert.deepEqual(order, [
      ...operations.map((operation) => `0:${operation}`),
      ...operations.map((operation) => `1:${operation}`),
      'world',
      'space',
      'checkpoint',
    ]);
    assert.equal(game.tickFaults.count, 0);
  } else {
    assert.deepEqual(
      order,
      operations
        .slice(0, operations.indexOf(failingOperation) + 1)
        .map((operation) => `0:${operation}`),
      failingOperation,
    );
    assert.equal(captains[0].data.credits, credits - 7);
    assert.equal(captains[1].data.credits, secondCredits);
    assert.equal(game.tickFaults.lastOperation, failingOperation);
    assert.equal(health.report().faultMaintenance?.count, 1);
    assert.equal(health.report().faultRange?.count, 1);
    assert.equal(health.report().tickFailures?.count, 1);
    assert.equal(JSON.stringify([logs, health.report(), game.tickFaults]).includes(secret), false);
  }
}
// Real banking mutates balance and schedule before notifying the captain.
// A notification failure cannot safely turn this into a read-only isolated hook.
{
  const { game, database, run } = fixture();
  game.connect(new Connection());
  const captain = [...game.sessions.values()][0];
  database.withAuthenticatedCaptain('Bank fixture', () =>
    game.onMessage(captain, { t: 'hello', name: 'Bank fixture', pass: 'fixture-only' }),
  );
  captain.data.credits = 100000;
  captain.data.credit = 600;
  captain.data.loan = { bal: 30000, next: 0 };
  game.idleCheck = () => {};
  game.features.fronts.missionIdle = () => {};
  game.features.syndicate.missionDeadlines = () => {};
  game.features.quests.questSweep = () => {};
  game.features.quests.questSalvageIdle = () => {};
  captain.sock.send = () => {
    throw new Error(secret);
  };
  let checkpoints = 0;
  database.flush = () => {
    checkpoints++;
  };
  game.tickN = 59;
  run();
  assert.ok(captain.data.credits < 100000);
  assert.ok(captain.data.loan.bal < 30000);
  assert.ok(captain.data.loan.next > 0);
  assert.equal(game.tickFaults.lastOperation, 'bank');
  assert.equal(checkpoints, 0);
}

{
  const { game, health, database, run } = fixture();
  let writes = 0;
  game.features.mining.advanceClock = () => {
    throw secret;
  };
  database.flush = () => {
    writes++;
  };
  run();
  assert.equal(writes, 0);
  assert.equal(health.report().faultSimulation?.count, 1);
  assert.equal(health.report().faultOther?.count, 1);
}
// Real checkpoint ambiguity still freezes authority and retires the world.
{
  const { game, health, database, backend, run, logs } = fixture();
  game.tick = () => {};
  backend.write = () => {
    throw new Error(secret);
  };
  database.touch();
  assert.equal(run(), null);
  assert.equal(database.economicFrozen, true);
  assert.equal(health.report().faultCheckpoint?.count, 1);
  assert.equal(health.report().checkpointFreezes?.count, 1);
  assert.equal(JSON.stringify([logs, health.report()]).includes(secret), false);
}
console.log(
  'Tick origins, sanitized classifications, bounded logs and fail-closed downstream ordering verified.',
);
