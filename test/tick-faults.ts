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
// World maintenance faults keep their exact origin without enabling unsafe continuation.
for (const failingOperation of [
  null,
  'invasion',
  'wave',
  'arena',
  'coop',
  'hails',
  'rivals',
  'living',
  'rival-sync',
  'rival-sync-control',
]) {
  const { game, health, database, run, logs } = fixture();
  const order: string[] = [];
  const hook = (operation: string) => () => {
    order.push(operation);
    if (operation === failingOperation) {
      database.world.news.push({ text: secret, t: 1 });
      database.touch();
      throw new TypeError(secret);
    }
  };
  game.features.fronts.invasionTick = hook('invasion');
  game.features.frontier.waveTick = hook('wave');
  game.features.frontier.arenaTick = hook('arena');
  game.features.coop.coopTick = hook('coop');
  game.hails.tick = hook('hails');
  game.features.rivals.rivalsTick = hook('rivals');
  game.features.living.livingTick = hook('living');
  game.features.rivals.rivalSync = hook('rival-sync');
  const space = game.spaces.meridian;
  space.players = 1;
  space.tick = hook('space');
  database.flush = hook('checkpoint');
  const operations = failingOperation?.startsWith('rival-sync')
    ? ['rival-sync']
    : ['invasion', 'wave', 'arena', 'coop', 'hails', 'rivals', 'living'];
  const newsCount = database.world.news.length;
  game.tickN = failingOperation?.startsWith('rival-sync') ? 60 : 599;
  run();
  if (failingOperation === null || failingOperation === 'rival-sync-control') {
    assert.deepEqual(order, [...operations, 'space', 'checkpoint']);
    assert.equal(game.tickFaults.count, 0);
    assert.equal(database.world.news.length, newsCount);
  } else {
    assert.deepEqual(order, operations.slice(0, operations.indexOf(failingOperation) + 1));
    assert.equal(database.world.news.length, newsCount + 1);
    assert.equal(game.tickFaults.lastOperation, failingOperation);
    assert.equal(game.tickFaults.count, 1);
    assert.equal(health.report().faultMaintenance?.count, 1);
    assert.equal(health.report().faultType?.count, 1);
    assert.equal(health.report().tickFailures?.count, 1);
    assert.equal(logs.length, 1);
    assert.equal(JSON.stringify([logs, health.report(), game.tickFaults]).includes(secret), false);
  }
}
// World projection, signature encoding and broadcast are separate fail-closed stages.
for (const failure of [null, 'world-payload', 'world-signature', 'world-broadcast'] as const) {
  const { game, health, database, run, logs } = fixture();
  const order: string[] = [];
  for (const name of ['World first', 'World second']) {
    game.connect(new Connection());
    const session = [...game.sessions.values()].at(-1)!;
    database.withAuthenticatedCaptain(name, () =>
      game.onMessage(session, { t: 'hello', name, pass: 'fixture-only' }),
    );
    session.sock.send = (message) => {
      if (typeof message !== 'string' || JSON.parse(message).t !== 'world') return;
      order.push(name);
      if (name === 'World second' && failure === 'world-broadcast') throw new TypeError(secret);
    };
  }
  game.idleCheck = () => {};
  game.features.fronts.missionIdle = () => {};
  game.features.syndicate.missionDeadlines = () => {};
  game.features.quests.questSweep = () => {};
  game.features.quests.questSalvageIdle = () => {};
  game.features.syndicate.bankTick = () => {};
  game.features.frontier.raidCheck = () => {};
  game.features.specialists.specIdle = () => {};
  game.features.hostile.holdoutTick = () => {};
  game.features.fronts.invasionTick = () => {};
  game.features.frontier.waveTick = () => {};
  game.features.frontier.arenaTick = () => {};
  game.features.coop.coopTick = () => {};
  game.hails.tick = () => {};
  game.features.world.worldPayload = () => {
    order.push('payload');
    if (failure === 'world-payload') throw new RangeError(secret);
    return {
      t: 'world',
      anomalies: {},
      states: {},
      colonies: {},
      invasion: null,
      event: { id: 'fixture' },
      ...(failure === 'world-signature'
        ? {
            anomalies: Object.defineProperty({}, 'toJSON', {
              value: () => {
                throw new TypeError(secret);
              },
            }),
          }
        : {}),
    } as ReturnType<typeof game.features.world.worldPayload>;
  };
  game.worldKey = 'previous';
  game.spaces.meridian.tick = () => {
    order.push('space');
  };
  database.flush = () => {
    order.push('checkpoint');
  };
  game.tickN = 899;
  run();
  if (failure === null) {
    assert.deepEqual(order, ['payload', 'World first', 'World second', 'space', 'checkpoint']);
    assert.equal(game.tickFaults.count, 0);
  } else {
    assert.deepEqual(
      order,
      failure === 'world-broadcast' ? ['payload', 'World first', 'World second'] : ['payload'],
    );
    assert.equal(game.tickFaults.lastOperation, failure);
    assert.equal(health.report().faultMaintenance?.count, 1);
    assert.equal(health.report().tickFailures?.count, 1);
    assert.equal(JSON.stringify([logs, health.report(), game.tickFaults]).includes(secret), false);
  }
  assert.equal(
    game.worldKey === 'previous',
    failure === 'world-payload' || failure === 'world-signature',
  );
}
// Only a prebuilt refinery notification is safe to retry; authority stays outside the catch.
for (const failure of ['transport', 'closed', 'backlog', 'payload', 'serialize']) {
  const { game, health, database, run } = fixture();
  const captains: Session[] = [];
  const sockets: Connection[] = [];
  for (const name of ['Notification first', 'Notification second']) {
    const socket = new Connection();
    sockets.push(socket);
    game.connect(socket);
    const session = [...game.sessions.values()].at(-1)!;
    database.withAuthenticatedCaptain(name, () =>
      game.onMessage(session, { t: 'hello', name, pass: 'fixture-only' }),
    );
    captains.push(session);
  }
  const order: string[] = [];
  const refinery = database.world.refinery!;
  assert.ok(refinery);
  for (const captain of captains)
    refinery.orders.push({
      id: String(captain.id),
      owner: database.key(captain.data.name),
      port: '',
      cid: 'ore',
      grade: 'common',
      qty: 1,
      reward: 1,
      deadline: Date.now() + 1e9,
      status: 'accepted',
      demand: '',
      event: null,
    });
  const payload = game.features.refinery.payload;
  game.features.refinery.payload = (session) => {
    order.push(`${captains.indexOf(session)}:payload`);
    if (session === captains[0] && failure === 'payload') {
      session.data.credits -= 7;
      database.touch();
      throw new RangeError(secret);
    }
    const result = payload(session);
    if (session === captains[0] && failure === 'serialize')
      Object.defineProperty(result, 'toJSON', {
        value: () => {
          throw new TypeError(secret);
        },
      });
    return result;
  };
  for (const captain of captains) {
    captain.sock.send = (message) => {
      if (typeof message !== 'string' || JSON.parse(message).t !== 'refinery') return;
      order.push(`${captains.indexOf(captain)}:send`);
      if (captain === captains[0] && failure === 'transport') throw new TypeError(secret);
    };
  }
  if (failure === 'closed') captains[0].sock.open = false;
  if (failure === 'backlog') sockets[0].backlog = 4e6;
  game.idleCheck = (session) => {
    order.push(`${captains.indexOf(session)}:idle`);
  };
  game.features.fronts.missionIdle = () => {};
  game.features.syndicate.missionDeadlines = () => {};
  game.features.quests.questSweep = () => {};
  game.features.quests.questSalvageIdle = () => {};
  game.features.syndicate.bankTick = () => {};
  game.features.frontier.raidCheck = () => {};
  game.features.specialists.specIdle = () => {};
  game.features.hostile.holdoutTick = () => {};
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
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => {
    logs.push(args);
  };
  try {
    game.tickN = 59;
    run();
  } finally {
    console.error = originalError;
  }
  assert.equal(captains[0].refinerySignature, undefined);
  if (failure === 'payload' || failure === 'serialize') {
    assert.deepEqual(order, ['0:payload']);
    assert.equal(game.tickFaults.lastOperation, 'refinery');
    assert.equal(health.report().tickFailures?.count, 1);
  } else {
    assert.deepEqual(order, [
      '0:payload',
      ...(failure === 'transport' ? ['0:send'] : []),
      '1:payload',
      '1:send',
      '0:idle',
      '1:idle',
      'world',
      'space',
      'checkpoint',
    ]);
    assert.ok(captains[1].refinerySignature);
    assert.equal(health.report().tickFailures, undefined);
    if (failure === 'transport') {
      assert.equal(game.tickFaults.lastOperation, 'refinery-notify');
      assert.equal(health.report().faultMaintenance?.count, 1);
      assert.equal(health.report().faultType?.count, 1);
      assert.equal(logs.length, 1);
    } else assert.equal(game.tickFaults.count, 0);
    // Retry the unchanged payload, then suppress it only after a successful send.
    captains[0].sock.open = true;
    sockets[0].backlog = 0;
    let delivered = 0;
    captains[0].sock.send = (message) => {
      if (typeof message === 'string' && JSON.parse(message).t === 'refinery') delivered++;
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      game.tickN = 59;
      run();
    }
    assert.equal(delivered, 1);
    assert.ok(captains[0].refinerySignature);
    assert.equal(refinery.orders.length, 2, 'notification retry cannot duplicate economic orders');
  }
  assert.equal(JSON.stringify([logs, health.report(), game.tickFaults]).includes(secret), false);
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
