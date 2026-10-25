import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const directory = tempDataDir('station-progress-');
const database = new DB(path.join(directory, 'data'));
const assets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const originalNow = Date.now;
let currentTime = 1_800_000_000_000;
Date.now = () => currentTime;
try {
  const game = new Game(assets, database, {
    ...database.gamePlatform(),
    automaticClock: false,
    seedDefinitions: [],
  });
  const packets: Record<string, unknown>[] = [];
  const socket = legacySocket();
  socket.open = true;
  socket.backlog = 0;
  socket.send = (raw: string | object) =>
    packets.push(JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)));
  socket.close = () => {};
  game.connect(socket, 'station-progress');
  game.onMessage([...game.sessions.values()][0], {
    t: 'hello',
    name: 'Station Captain',
    pass: 'fixture',
  });
  const session = [...game.sessions.values()][0];
  assert.ok(session.data, 'real login initializes a captain');
  const player = session.data;
  const initial = structuredClone(player);
  const originalHangar = game.features.hangar;
  const originalLog = game.log.bind(game);
  const calls: string[] = [];
  game.features = {
    ...game.features,
    hangar: {
      ...originalHangar,
      hangarInit: (captain) => {
        calls.push('init');
        originalHangar.hangarInit(captain);
      },
      startQueued: (captain) => {
        calls.push('queue:' + (captain.station.active?.id || 'idle'));
        originalHangar.startQueued(captain);
      },
    },
  };
  const trackedHangar = game.features.hangar;
  game.log = (captain, text) => {
    calls.push('log:' + text);
    originalLog(captain, text);
  };
  const trackedLog = game.log.bind(game);
  const traces: Record<string, unknown>[] = [];
  function reset() {
    Object.assign(player, structuredClone(initial));
    player.tut = 999;
    player.log = [];
    Object.assign(player.station, {
      claimed: true,
      ops: 2,
      refUnits: 0,
      refT: currentTime,
      active: null,
      done: [],
      queue: [],
    });
    calls.length = 0;
    packets.length = 0;
  }
  function trace(name: string) {
    traces.push(
      structuredClone({
        name,
        station: player.station,
        credits: player.credits,
        mats: player.mats,
        log: player.log,
        calls,
      }),
    );
  }
  const interval = 15 * 60000;
  const activeProject = () => player.station.active;

  reset();
  player.station.claimed = false;
  delete player.station.queue;
  player.station.refT -= 10 * interval;
  player.station.active = { id: 'shield1', ends: currentTime };
  const unclaimed = structuredClone(player);
  game.checkStation(player);
  assert.deepEqual(player, unclaimed, 'unclaimed stations do not initialize or advance');
  assert.deepEqual([...calls], []);
  trace('unclaimed');

  reset();
  player.station.ops = 0;
  player.station.refT -= 10 * interval;
  game.checkStation(player);
  assert.equal(player.station.refUnits, 0, 'Tier 0 produces nothing');
  assert.equal(player.station.refT, currentTime - 10 * interval);
  assert.deepEqual([...calls], ['init', 'queue:idle']);
  trace('tier-zero');

  reset();
  player.station.refT = currentTime - interval + 1;
  game.checkStation(player);
  assert.equal(player.station.refUnits, 0, 'one millisecond before maturity is not ready');
  trace('before-refinery-threshold');
  currentTime++;
  game.checkStation(player);
  assert.equal(player.station.refUnits, 1, 'exact maturity produces one unit');
  assert.equal(player.station.refT, currentTime);
  trace('at-refinery-threshold');

  reset();
  player.station.refT -= 2 * interval + 123;
  game.checkStation(player);
  assert.equal(player.station.refUnits, 2);
  assert.equal(player.station.refT, currentTime - 123, 'partial intervals remain credited');
  game.checkStation(player);
  assert.equal(player.station.refUnits, 2, 'same-time refresh cannot duplicate output');
  trace('partial-accrual');

  reset();
  player.station.refUnits = 1;
  player.station.refT -= 10 * interval;
  game.checkStation(player);
  assert.equal(player.station.refUnits, 3, 'offline accrual stops at silo capacity');
  assert.equal(player.station.refT, currentTime, 'full silos discard excess elapsed time');
  currentTime += 100;
  game.checkStation(player);
  assert.equal(
    player.station.refT,
    currentTime,
    'full-silo refresh keeps the existing timer reset',
  );
  trace('capped-accrual');

  reset();
  player.station.done = ['silo', 'refine1'];
  player.station.refT -= 7 * 750000;
  game.checkStation(player);
  assert.equal(player.station.refUnits, 6, 'existing silo and speed bonuses apply');
  assert.equal(player.station.refT, currentTime);
  trace('research-bonuses');

  reset();
  player.station.refT -= 10 * interval;
  player.station.active = { id: 'silo', ends: currentTime };
  game.checkStation(player);
  assert.equal(
    player.station.refUnits,
    3,
    'accrual uses bonuses before this check completes research',
  );
  assert.deepEqual(player.station.done, ['silo']);
  assert.deepEqual([...calls], ['init', 'log:Research complete: Silo Expansion.', 'queue:idle']);
  game.checkStation(player);
  assert.equal(player.station.refUnits, 3, 'new capacity does not recover discarded elapsed time');
  assert.equal(player.log.length, 1);
  trace('accrual-before-research');

  reset();
  player.station.ops = 3;
  player.credits = 120000;
  player.mats.crystal[2] = 1;
  player.station.active = { id: 'shield1', ends: currentTime + 1 };
  player.station.queue = ['shield2'];
  game.checkStation(player);
  assert.deepEqual(player.station.done, []);
  assert.equal(player.credits, 120000);
  trace('before-research-threshold');
  calls.length = 0;
  currentTime++;
  game.checkStation(player);
  assert.deepEqual(
    [...calls],
    ['init', 'log:Research complete: Shield Harmonics I.', 'queue:idle'],
  );
  assert.deepEqual(player.station.done, ['shield1']);
  assert.equal(activeProject()?.id, 'shield2');
  assert.equal(activeProject()?.ends, currentTime + 60 * 60000);
  assert.equal(player.credits, 0, 'existing hangar owner settles the next project once');
  assert.equal(player.mats.crystal[2], 0);
  game.checkStation(player);
  assert.equal(player.log.length, 1);
  assert.equal(player.credits, 0);
  assert.deepEqual(player.station.queue, []);
  trace('research-completion-and-next-project');

  reset();
  player.station.queue = ['shield2'];
  const refused = { credits: player.credits, mats: structuredClone(player.mats) };
  game.checkStation(player);
  player.station.ops = 3;
  game.checkStation(player);
  assert.equal(activeProject(), null, 'missing prerequisite denies queued start');
  player.station.done = ['shield1'];
  player.station.ops = 2;
  game.checkStation(player);
  assert.equal(activeProject(), null, 'insufficient tier denies queued start');
  assert.equal(player.credits, refused.credits);
  assert.deepEqual(player.mats, refused.mats);
  player.station.ops = 3;
  player.credits = 0;
  game.checkStation(player);
  assert.equal(player.station.waiting, true);
  player.credits = 120000;
  game.checkStation(player);
  assert.equal(player.station.waiting, true, 'credits cannot substitute missing materials');
  assert.equal(player.credits, 120000);
  assert.deepEqual(player.station.queue, ['shield2']);
  player.mats.crystal[2] = 1;
  game.checkStation(player);
  assert.equal(player.station.waiting, false);
  assert.equal(activeProject()?.id, 'shield2');
  assert.equal(player.credits, 0);
  assert.equal(player.mats.crystal[2], 0);
  trace('queue-refusal-waiting-and-start');

  reset();
  game.features = {
    ...game.features,
    hangar: {
      ...originalHangar,
      hangarInit: (captain) => {
        calls.push('replacement:init');
        originalHangar.hangarInit(captain);
      },
      startQueued: (captain) => {
        calls.push('replacement:queue');
        originalHangar.startQueued(captain);
      },
    },
  };
  game.log = (captain, text) => {
    calls.push('replacement:log');
    originalLog(captain, text);
  };
  player.station.active = { id: 'shield1', ends: currentTime };
  game.checkStation(player);
  assert.deepEqual([...calls], ['replacement:init', 'replacement:log', 'replacement:queue']);
  trace('late-provider-replacement');
  game.features = { ...game.features, hangar: trackedHangar };
  game.log = trackedLog;

  reset();
  player.station.refT -= interval;
  game.you(session);
  const payload = packets.at(-1)!.d as ReturnType<Game['playerPayload']>;
  assert.equal(packets.at(-1)!.t, 'you');
  assert.equal(payload.station.refUnits, 1, 'you projects the advanced authoritative station');
  assert.equal(player.station.refUnits, 1);
  trace('you-integration');

  reset();
  player.station.active = { id: 'shield1', ends: currentTime };
  database.dirty = false;
  game.idleCheck(session);
  assert.equal(database.dirty, true, 'idle owner marks changed progress for persistence');
  assert.equal(packets.filter((packet) => packet.t === 'you').length, 1);
  assert.deepEqual(player.station.done, ['shield1']);
  assert.equal(player.log.length, 1);
  database.dirty = false;
  packets.length = 0;
  game.idleCheck(session);
  assert.equal(database.dirty, false, 'unchanged idle check is not a new save mutation');
  assert.equal(packets.length, 0, 'unchanged idle check sends no duplicate refresh');
  trace('idle-integration');

  reset();
  player.station.site = 'site-meridian';
  player.station.refT -= interval;
  const creditsBefore = player.credits;
  const matsBefore = structuredClone(player.mats);
  game.onMessage(session, { t: 'station', op: 'collect' });
  assert.equal(
    player.station.refUnits,
    1,
    'station request advances timers before location denial',
  );
  assert.equal(player.credits, creditsBefore, 'foreign-port collection cannot settle output');
  assert.deepEqual(player.mats, matsBefore);
  assert.equal(packets.at(-1)?.msg, 'Land at your Personal Station for that.');
  trace('station-route-denial');

  reset();
  player.station.ops = 3;
  player.credits = 120000;
  player.mats.crystal[2] = 1;
  player.station.active = { id: 'shield1', ends: currentTime };
  player.station.queue = ['shield2'];
  game.idleCheck(session);
  database.flush();
  const reopenedDatabase = new DB(database.dir);
  const restored = reopenedDatabase.get(player.name)!;
  assert.deepEqual(restored.station, player.station);
  assert.deepEqual(restored.mats, player.mats);
  assert.equal(restored.credits, player.credits);
  assert.deepEqual(restored.log, player.log);
  const reopenedGame = new Game(assets, reopenedDatabase, {
    ...reopenedDatabase.gamePlatform(),
    automaticClock: false,
    seedDefinitions: [],
  });
  reopenedGame.checkStation(restored);
  assert.equal(restored.credits, 0, 'reopen does not charge the started project twice');
  assert.equal(restored.log.length, 1, 'reopen does not complete the former project again');
  currentTime += 60 * 60000;
  reopenedGame.checkStation(restored);
  assert.deepEqual(restored.station.done, ['shield1', 'shield2']);
  assert.equal(restored.station.active, null);
  assert.equal(restored.log.length, 2);
  traces.push({
    name: 'save-reopen-completion',
    station: restored.station,
    credits: restored.credits,
    log: restored.log,
  });

  const evidence = path.resolve(
    process.env.RIFT_TEST_ARTIFACTS || '.artifacts/regression',
    'station-progress',
  );
  filesystem.mkdirSync(evidence, { recursive: true });
  filesystem.writeFileSync(
    path.join(evidence, 'trace.json'),
    JSON.stringify(traces, null, 2) + '\n',
  );
  console.log(
    'Station timers: thresholds/caps/order, queue denial/settlement, live providers, you/idle/route integration and save/reopen passed.',
  );
} finally {
  Date.now = originalNow;
}
