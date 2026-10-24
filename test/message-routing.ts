import { mockSession } from './helpers/mocks.ts';
import type { Session } from '../server/game.ts';
import { requiredFixtureValue } from './helpers/required.ts';
type TraceRecorder = (...argumentsList: unknown[]) => unknown;
type RoutingContext = {
  game: Game;
  session: Session;
  space: object;
  escort: { mission: { id: string }; ai: string; target: string; life: number };
  spy: (name: string, result?: unknown) => TraceRecorder;
};
// Independent routing characterization from source commit 680a6f8.
// These spies check routing/argument coercion/order, not the delegated game rules.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game } from '../server/game.ts';

export function characterizeRouting(GameClass: typeof Game) {
  const traces: {
    label: string;
    calls: [string, unknown[]][];
    changes: Record<string, unknown>;
  }[] = [];
  const probe = Object.create(GameClass.prototype) as Game;
  // Route construction must not read mutable services before their late setup.
  // Portrait selection is new behavior, covered by portrait-persistence.ts; retain
  // the independent pre-extraction baseline for every original route unchanged.
  const types = [...probe.createMessageHandlers().types].filter((type) => type !== 'portrait');
  const messages: Record<string, Record<string, unknown>> = {
    input: { seq: '7', th: 1, tu: 9, ab: 1, rv: 0, f1: 1, f2: 0, nav: true },
    target: { id: 'enemy' },
    trade: { cid: 'food', qty: '3', lots: 'common-first' },
    buyship: { hull: '201' },
    outfit: { id: '5', n: '2' },
    buymat: { mat: 'alloy', grade: '2', n: '3' },
    questdrop: { qid: 'repair' },
    abandon: { id: 'job' },
    rename: { name: ' <New> ship ' },
    note: { text: 'captain note' },
    order: { o: 'attack' },
    jettison: { cid: 'ore', n: '4', lots: { pure: 4 } },
  };
  function runScenario(
    label: string,
    type: string,
    message = {},
    prepare: (context: RoutingContext) => void = () => {},
  ) {
    const calls: [string, unknown[]][] = [];
    const game = Object.create(GameClass.prototype);
    const session = mockSession({
      data: {
        name: 'Route Fixture',
        sys: 'sol',
        stellar: 'earth',
        tut: 0,
        ship: { hull: 1, name: 'Old ship' },
        missions: [
          {
            id: 'job',
            type: 'cargo',
            title: 'Fixture freight',
            sys: 'sol',
            quest: { qid: 'repair' },
          },
        ],
      },
      ent: { order: 'hold', target: null },
      inputs: [],
    });
    function record(value: unknown): unknown {
      if (value === session) return '[session]';
      if (value === session.data) return '[save]';
      if (value === undefined) return '[undefined]';
      if (value === space) return '[space]';
      if (Array.isArray(value)) return value.map(record);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([propertyKey2, value3]) => [propertyKey2, record(value3)]),
        );
      return value;
    }
    const recordCall =
      (name: string, result?: unknown) =>
      (...args: unknown[]) => {
        calls.push([name, args.map(record)]);
        return result;
      };
    const enemy = { id: 'enemy' };
    const escort = { mission: { id: 'job' }, ai: 'escort', target: 'enemy', life: 90 };
    const space = {
      ships: new Map<string, object>([
        ['enemy', enemy],
        ['escort', escort],
      ]),
    };
    Object.assign(game, { A: { ships: { 1: { name: 'Default hull' } } } });
    Object.assign(game, { spaces: { sol: space } });
    Object.assign(game, { live: { sol: space } });
    Object.assign(game, { solo: true });
    Object.assign(game, { paused: false });
    Object.assign(game, { sessions: new Map([[1, session]]) });
    Object.assign(game, { db: { touch: recordCall('db.touch') } });
    Object.assign(game, {
      combatAssist: Object.fromEntries(
        ['command', 'manual', 'selected', 'stop', 'attack'].map((propertyKey3) => [
          propertyKey3,
          recordCall('combat.' + propertyKey3),
        ]),
      ),
    });
    Object.assign(game, { hails: { request: recordCall('hails.request') } });
    Object.assign(game, {
      features: Object.fromEntries(
        Object.entries({
          towing: ['command'],
          industrial: ['command'],
          pressure: ['consent'],
          refinery: ['command'],
          mining: ['survey'],
          docks: ['buyToHangar', 'docksOp'],
          quests: ['questFail'],
          hangar: ['officerOp', 'shuttleOp', 'dockOp', 'board'],
          specialists: ['specOp'],
          coop: ['armadaOp', 'socialOp', 'tradeOp', 'duelOp'],
          hostile: ['holdoutStart'],
          story: ['storyAccept'],
          fronts: ['claimGoal', 'storeBuy'],
          frontier: ['colonyOp', 'arenaOp', 'exchangeOp', 'leaderboard', 'profile'],
          hail: ['hail', 'hailOpt'],
          fleetcmd: ['fleetOrder', 'jettison'],
          rivals: ['rivalsPayload'],
          syndicate: ['bmBuy', 'promote', 'lowerDeck', 'bankOp'],
          arcs: ['arcAccept'],
        }).map(([name, operations]) => [
          name,
          Object.fromEntries(
            operations.map((propertyKey4) => [
              propertyKey4,
              recordCall(
                name + '.' + propertyKey4,
                propertyKey4 === 'leaderboard' || propertyKey4 === 'rivalsPayload' ? [] : undefined,
              ),
            ]),
          ),
        ]),
      ),
    });
    for (const propertyKey of [
      'accept',
      'buyMat',
      'buyShip',
      'chat',
      'depart',
      'jump',
      'land',
      'landed',
      'log',
      'outfit',
      'send',
      'setPaused',
      'station',
      'trade',
      'tut',
      'you',
    ])
      Object.assign(game, { [propertyKey]: recordCall(propertyKey) });
    // Build first, then configure: capabilities must remain live, not snapshots.
    const registry = game.createMessageHandlers();
    prepare({ game, session, space, escort, spy: recordCall });
    const state = () => ({ save: session.data, ent: session.ent, inputs: session.inputs, escort });
    const before = JSON.parse(JSON.stringify(state()));
    registry.dispatch(type, session, { t: type, ...message });
    const changes = Object.fromEntries(
      Object.entries(state()).filter(
        ([propertyKey, value]) => JSON.stringify(value) !== JSON.stringify(before[propertyKey]),
      ),
    );
    traces.push({ label, calls, changes });
  }
  for (const type of types) runScenario(type, type, messages[type] || {});
  runScenario('input-negative', 'input', { seq: 1, tu: -99 });
  runScenario('input-cap', 'input', { th: 1 }, ({ session }) => {
    Object.assign(session, { inputs: Array(8).fill({ seq: 0 }) });
  });
  runScenario('input-manual', 'input', { th: 1 }, ({ session }) => {
    Object.assign(session, { combat: { consent: true } });
  });
  runScenario('target-clear', 'target', {});
  runScenario('target-no-ship', 'target', { id: 'enemy' }, ({ session }) => {
    session.ent = null;
  });
  runScenario('buyship-store', 'buyship', { hull: '201', store: true });
  runScenario('questdrop-invalid', 'questdrop', { qid: 12 });
  runScenario('abandon-missing', 'abandon', { id: 'absent' });
  runScenario('abandon-mining-order', 'abandon', { id: 'job' }, ({ session }) => {
    session.data.missions[0].type = 'miningOrder';
    session.data.missions[0].dest = 'earth';
  });
  runScenario('rename-empty', 'rename', { name: '<>' });
  runScenario('rename-shipless', 'rename', { name: 'Replacement' }, ({ session }) => {
    session.data.shipless = true;
  });
  runScenario('note-empty', 'note', { text: '  ' });
  runScenario('order-hold', 'order', { o: 'hold' });
  runScenario('pause-online', 'pause', {}, ({ game }) => {
    Object.assign(game, { solo: false });
  });
  runScenario('pause-two-captains', 'pause', {}, ({ game }) => {
    game.sessions.set(2, mockSession({ data: {} }));
  });
  runScenario('pause-already-paused', 'pause', {}, ({ game }) => {
    Object.assign(game, { paused: true });
  });
  runScenario('live-method', 'trade', { cid: 'food', qty: '4' }, ({ game, spy: recordCall }) => {
    Object.assign(game, { trade: recordCall('replacement.trade') });
  });
  runScenario('live-service', 'hail', {}, ({ game, spy: recordCall }) => {
    Object.assign(game, { features: { hail: { hail: recordCall('replacement.hail') } } });
  });
  runScenario('live-space', 'target', { id: 'new' }, ({ game }) => {
    Object.assign(game, { spaces: { sol: { ships: new Map([['new', { id: 'new' }]]) } } });
  });
  for (const type of ['unknown', '__proto__', 'constructor', 'toString']) runScenario(type, type);
  return { types, traces };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const expected = JSON.parse(
    filesystem.readFileSync(
      new URL('./fixtures/message-routing-v33.json', import.meta.url),
      'utf8',
    ),
  );
  const actual = characterizeRouting(Game);
  assert.deepEqual(
    actual,
    expected,
    'route order, argument coercion, mutations and live dependencies match untouched main',
  );
  assert.equal(new Set(actual.types).size, actual.types.length);
  console.log(
    `${actual.types.length} routes and ${actual.traces.length} dispatch scenarios match pre-extraction behavior.`,
  );

  // Exercise the actual entry gate separately from the route spies. No sockets,
  // persistent saves, timers or production data are needed for this boundary.
  const game = Object.create(Game.prototype) as Game;
  const events: string[] = [];
  Object.assign(game, { db: { economicFrozen: false } });
  Object.assign(game, { hello: () => events.push('hello') });
  Object.assign(game, { toast: (_session: unknown, text: string) => events.push(text) });
  Object.assign(game, { messageHandlers: { dispatch: (type: string) => events.push(type) } });
  const session = { data: null, msgs: 0, msgT: Date.now(), actT: 0 } as unknown as Session;
  game.onMessage(session, { t: 'trade' });
  assert.deepEqual(events, [], 'unauthenticated trade never reaches a route');
  game.onMessage(session, { t: 'hello' });
  assert.deepEqual(events, ['hello']);
  Object.assign(session, { data: {} });
  game.onMessage(session, { t: 'ping' });
  assert.equal(session.actT, 0, 'ping does not count as player activity');
  game.db.economicFrozen = true;
  game.onMessage(session, { t: 'trade' });
  assert.match(requiredFixtureValue(events.at(-1)), /economic actions frozen/);
  assert.equal(session.actT, 0, 'frozen economic action does not pass the activity gate');
  for (const type of ['input', 'chat', 'ping']) game.onMessage(session, { t: type });
  assert.deepEqual(events.slice(-3), ['input', 'chat', 'ping']);
  assert.ok(session.actT > 0);
  const count = events.length;
  session.msgs = 120;
  game.onMessage(session, { t: 'chat' });
  assert.equal(events.length, count, 'flood limit runs even for freeze-allowed chat');
  session.msgT = Date.now() - 2000;
  game.onMessage(session, { t: 'chat' });
  assert.equal(events.at(-1), 'chat', 'next rate window permits dispatch again');
  assert.equal(session.msgs, 1);
  console.log('Authentication, economic freeze, activity and flood gates retain their ordering.');

  const receiver = Object.create(Game.prototype);
  const routes = receiver.createMessageHandlers();
  let received;
  receiver.trade = function (...args: Parameters<Game['trade']>) {
    assert.equal(this, receiver, 'forwarded core method retains its Game receiver');
    received = args;
  };
  routes.dispatch('trade', session, { t: 'trade', cid: 'food', qty: '4', lots: 'common-first' });
  assert.deepEqual(received, [session, 'food', 4, 'common-first']);
}
