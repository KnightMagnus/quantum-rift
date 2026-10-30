import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import assets from '../shared/assets.json' with { type: 'json' };
import { Game } from '../server/game.ts';
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
// Per-captain mutation hooks remain fail-closed: later captains, world work,
// simulation and checkpoint must not continue after an uncertain partial mutation.
{
  const { game, health, database, run } = fixture();
  for (const name of ['First captain', 'Second captain']) {
    game.connect(new Connection());
    const session = [...game.sessions.values()].at(-1)!;
    database.withAuthenticatedCaptain(name, () =>
      game.onMessage(session, { t: 'hello', name, pass: 'fixture-only' }),
    );
    assert.ok(session.data);
  }
  const order: string[] = [];
  game.tickN = 59;
  game.idleCheck = () => {
    order.push('idle');
  };
  game.features.fronts.missionIdle = () => {
    order.push('mission');
    throw new RangeError(secret);
  };
  game.features.fronts.invasionTick = () => {
    order.push('world');
  };
  game.spaces.meridian.tick = () => {
    order.push('space');
  };
  database.flush = () => {
    order.push('checkpoint');
  };
  run();
  assert.deepEqual(order, ['idle', 'mission']);
  assert.equal(game.tickFaults.lastOperation, 'mission-idle');
  assert.equal(health.report().faultMaintenance?.count, 1);
  assert.equal(health.report().faultRange?.count, 1);
  assert.equal(health.report().tickFailures?.count, 1);
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
