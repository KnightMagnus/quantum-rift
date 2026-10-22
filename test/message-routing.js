// Independent routing characterization from source commit 680a6f8.
// These spies check routing/argument coercion/order, not the delegated game rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game } from '../server/game.ts';

export function characterizeRouting(GameClass) {
  const traces = [];
  const probe = Object.create(GameClass.prototype);
  // Route construction must not read mutable services before their late setup.
  const types = [...probe.createMessageHandlers().types];
  const messages = {
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
  function run(label, type, message = {}, prepare = () => {}) {
    const calls = [];
    const game = Object.create(GameClass.prototype);
    const session = {
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
    };
    function record(value) {
      if (value === session) return '[session]';
      if (value === session.data) return '[save]';
      if (value === undefined) return '[undefined]';
      if (value === space) return '[space]';
      if (Array.isArray(value)) return value.map(record);
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, record(v)]));
      return value;
    }
    const spy =
      (name, result) =>
      (...args) => {
        calls.push([name, args.map(record)]);
        return result;
      };
    const enemy = { id: 'enemy' };
    const escort = { mission: { id: 'job' }, ai: 'escort', target: 'enemy', life: 90 };
    const space = {
      ships: new Map([
        ['enemy', enemy],
        ['escort', escort],
      ]),
    };
    game.A = { ships: { 1: { name: 'Default hull' } } };
    game.spaces = { sol: space };
    game.live = { sol: space };
    game.solo = true;
    game.paused = false;
    game.sessions = new Map([[1, session]]);
    game.db = { touch: spy('db.touch') };
    game.combatAssist = Object.fromEntries(
      ['command', 'manual', 'selected', 'stop', 'attack'].map((k) => [k, spy('combat.' + k)]),
    );
    game.hails = { request: spy('hails.request') };
    game.features = Object.fromEntries(
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
          operations.map((k) => [
            k,
            spy(name + '.' + k, k === 'leaderboard' || k === 'rivalsPayload' ? [] : undefined),
          ]),
        ),
      ]),
    );
    for (const key of [
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
      game[key] = spy(key);
    // Build first, then configure: capabilities must remain live, not snapshots.
    const registry = game.createMessageHandlers();
    prepare({ game, session, space, escort, spy });
    const state = () => ({ save: session.data, ent: session.ent, inputs: session.inputs, escort });
    const before = JSON.parse(JSON.stringify(state()));
    registry.dispatch(type, session, { t: type, ...message });
    const changes = Object.fromEntries(
      Object.entries(state()).filter(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key]),
      ),
    );
    traces.push({ label, calls, changes });
  }
  for (const type of types) run(type, type, messages[type] || {});
  run('input-negative', 'input', { seq: 1, tu: -99 });
  run('input-cap', 'input', { th: 1 }, ({ session }) => {
    session.inputs = Array(8).fill({ seq: 0 });
  });
  run('input-manual', 'input', { th: 1 }, ({ session }) => {
    session.combat = { consent: true };
  });
  run('target-clear', 'target', {});
  run('target-no-ship', 'target', { id: 'enemy' }, ({ session }) => {
    session.ent = null;
  });
  run('buyship-store', 'buyship', { hull: '201', store: true });
  run('questdrop-invalid', 'questdrop', { qid: 12 });
  run('abandon-missing', 'abandon', { id: 'absent' });
  run('abandon-mining-order', 'abandon', { id: 'job' }, ({ session }) => {
    session.data.missions[0].type = 'miningOrder';
    session.data.missions[0].dest = 'earth';
  });
  run('rename-empty', 'rename', { name: '<>' });
  run('rename-shipless', 'rename', { name: 'Replacement' }, ({ session }) => {
    session.data.shipless = true;
  });
  run('note-empty', 'note', { text: '  ' });
  run('order-hold', 'order', { o: 'hold' });
  run('pause-online', 'pause', {}, ({ game }) => {
    game.solo = false;
  });
  run('pause-two-captains', 'pause', {}, ({ game }) => {
    game.sessions.set(2, { data: {} });
  });
  run('pause-already-paused', 'pause', {}, ({ game }) => {
    game.paused = true;
  });
  run('live-method', 'trade', { cid: 'food', qty: '4' }, ({ game, spy }) => {
    game.trade = spy('replacement.trade');
  });
  run('live-service', 'hail', {}, ({ game, spy }) => {
    game.features = { hail: { hail: spy('replacement.hail') } };
  });
  run('live-space', 'target', { id: 'new' }, ({ game }) => {
    game.spaces = { sol: { ships: new Map([['new', { id: 'new' }]]) } };
  });
  for (const type of ['unknown', '__proto__', 'constructor', 'toString']) run(type, type);
  return { types, traces };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const expected = JSON.parse(
    fs.readFileSync(new URL('./fixtures/message-routing-v33.json', import.meta.url)),
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
  const game = Object.create(Game.prototype);
  const events = [];
  game.db = { economicFrozen: false };
  game.hello = () => events.push('hello');
  game.toast = (_s, text) => events.push(text);
  game.messageHandlers = { dispatch: (type) => events.push(type) };
  const session = { data: null, msgs: 0, msgT: Date.now(), actT: 0 };
  game.onMessage(session, { t: 'trade' });
  assert.deepEqual(events, [], 'unauthenticated trade never reaches a route');
  game.onMessage(session, { t: 'hello' });
  assert.deepEqual(events, ['hello']);
  session.data = {};
  game.onMessage(session, { t: 'ping' });
  assert.equal(session.actT, 0, 'ping does not count as player activity');
  game.db.economicFrozen = true;
  game.onMessage(session, { t: 'trade' });
  assert.match(events.at(-1), /economic actions frozen/);
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
  receiver.trade = function (...args) {
    assert.equal(this, receiver, 'forwarded core method retains its Game receiver');
    received = args;
  };
  routes.dispatch('trade', session, { t: 'trade', cid: 'food', qty: '4', lots: 'common-first' });
  assert.deepEqual(received, [session, 'food', 4, 'common-first']);
}
