import { createHash } from 'node:crypto';
import { packetSeed, packetRandom } from './helpers/fuzz-random.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { parseClientAction } from '../shared/wire-commands.ts';
// 2.0.2 fuzzer: many fake clients send every message type the server knows, with random and malformed fields, while
// the systems tick. Any error the server logs is a bug. Run: node test/fuzz.ts [rounds] [seed]
import filesystem from 'node:fs';
import assert from 'node:assert/strict';
import { FixtureSocket } from './helpers/refinery-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS, SYSTEMS } from '../shared/galaxy.ts';
const assets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const errors: string[] = [];
const origErr = console.error;
console.error = (...firstEntry) => {
  errors.push(
    firstEntry
      .map((horizontalPosition) =>
        horizontalPosition && horizontalPosition.stack
          ? horizontalPosition.stack
          : String(horizontalPosition),
      )
      .join(' '),
  );
};
const game = new Game(assets, new Database(tempDataDir('rift-fuzz-')));
// The runtime registry is the authoritative source of message routes.
const TYPES = [...game.messageHandlers.types];
assert.ok(TYPES.length, 'the authenticated message registry must not be empty');
assert.equal(new Set(TYPES).size, TYPES.length, 'registered message types must be unique');
const seed = packetSeed(process.argv[3]);
const nextPacketRandom = packetRandom(seed);
const packetTrace = createHash('sha256');
const randomFraction = () => {
  const value = nextPacketRandom();
  packetTrace.update(`${value};`);
  return value;
};
console.log(
  `Packet seed: ${seed}; scenario seed: ${process.env.RIFT_TEST_SEED ?? '123456789'} (with seed-random preload)`,
);
console.log(
  `Replay: RIFT_TEST_SEED=${process.env.RIFT_TEST_SEED ?? '123456789'} node --import ./test/seed-random.ts test/fuzz.ts ${process.argv[2] ?? '4000'} ${seed}`,
);
const dispatch = game.messageHandlers.dispatch,
  covered = new Set();
game.messageHandlers = {
  ...game.messageHandlers,
  dispatch(type, ...args) {
    if (TYPES.includes(type)) covered.add(type);
    return dispatch(type, ...args);
  },
};
const pick = <Value>(values: readonly Value[]): Value =>
  values[Math.floor(randomFraction() * values.length)]!;
const stellarIds = Object.keys(STELLARS),
  SYSI = SYSTEMS.map((session) => session.id),
  HULLS = Object.keys(assets.ships).map(Number);
const junk = () =>
  pick([
    undefined,
    null,
    -1,
    0,
    1,
    3,
    99999,
    1e12,
    -1e12,
    NaN,
    '',
    'x',
    'a'.repeat(300),
    [],
    {},
    { a: 1 },
    true,
    pick(stellarIds),
    pick(SYSI),
    pick(HULLS),
    '__proto__',
    'constructor',
  ]);
const operationNames = [
  'buy',
  'sell',
  'store',
  'hire',
  'assign',
  'dismiss',
  'launch',
  'recall',
  'claim',
  'upgrade',
  'refine',
  'queue',
  'unqueue',
  'research',
  'build',
  'parts',
  'comp',
  'tierup',
  'refit',
  'defense',
  'borrow',
  'pay',
  'kick',
  'leave',
  'create',
  'join',
  'promote',
  'plunder',
  'capture',
  'rescue',
  'send',
  'bid',
  'ask',
  'cancel',
  'fly',
  'praise',
  'taunt',
  'bribe',
  'threat',
  'settle',
  'fuel',
  'repair',
];
function message(messageType = pick(TYPES)) {
  const message3: Record<string, unknown> = { t: messageType };
  for (const propertyKey of [
    'id',
    'op',
    'i',
    'n',
    'q',
    'qty',
    'cid',
    'hull',
    'to',
    'stellar',
    'name',
    'msg',
    'text',
    'k',
    'fac',
    'kind',
    'amt',
    'o',
    'tier',
    'slot',
    'oid',
    'mat',
    'grade',
    'cat',
    'c',
    'm',
    'g',
    'job',
    'crew',
    'ch',
    'seq',
    'th',
    'tu',
    'f1',
    'f2',
  ])
    if (randomFraction() < 0.35) message3[propertyKey] = junk();
  if (randomFraction() < 0.5) message3.op = pick(operationNames);
  if (randomFraction() < 0.3)
    message3.id = pick([
      pick(stellarIds),
      Math.floor(randomFraction() * 2000),
      'qv1',
      'shard',
      'papers',
      'o1',
    ]);
  return message3;
}
let ipAddress = 1;
const clients = [];
function fake(name: string) {
  const sock = new FixtureSocket();
  sock.send = () => {};
  game.connect(sock, '16.0.' + Math.floor(ipAddress / 250) + '.' + (ipAddress++ % 250));
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  sock.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' }));
  return {
    sock,
    s: session,
    send: (message2: unknown) => {
      // Exercise handlers, not just the first 120 packets allowed by the flood guard.
      requiredFixtureValue(session).msgs = 0;
      sock.emit('message', JSON.stringify(message2));
    },
  };
}
for (let index = 0; index < 12; index++) {
  const captain = fake('Fuzz' + index),
    playerData = requiredFixtureValue(captain.s).data;
  playerData.credits = [0, 5e4, 5e7][index % 3];
  if (index % 4 === 0) {
    playerData.station.claimed = true;
    playerData.station.ops = 5;
  }
  clients.push(captain);
}
const rounds = +(process.argv[2] || 4000);
// Guarantee every registered route reaches authenticated dispatch before random sampling.
const coverageOperations: Record<string, string> = {
  miningPressure: 'leave',
  mining: 'survey',
  combat: 'off',
  docks: 'repair',
  station: 'collect',
  officer: 'dismiss',
  shuttle: 'claim',
  dock: 'sell',
  spec: 'parts',
  armada: 'leave',
  social: 'prefs',
  trade2: 'cancel',
  duel: 'decline',
  colony: 'collect',
  arena: 'leave',
  exchange: 'collect',
  hailin: 'list',
  lower: 'dismiss',
  bank: 'pay',
  industrial: 'off',
  refinery: 'list',
  miningOrder: 'cancelOrder',
  towing: 'detach',
};
const coverageFields: Record<string, Record<string, unknown>> = {
  trade: { cid: 'food', qty: '0' },
  buyship: { hull: '0' },
  outfit: { id: '0', n: '0' },
  buymat: { mat: 'alloy', grade: '0', n: '0' },
  towing: { id: -1, revision: 0 },
  boards: { cat: 'earned' },
  profile: { name: 'Missing Captain' },
};
for (const [index, type] of TYPES.entries()) {
  const packet = {
    t: type,
    ...(coverageOperations[type] ? { op: coverageOperations[type] } : {}),
    ...coverageFields[type],
  };
  assert.ok(parseClientAction(packet), type + ' coverage probe satisfies its shared contract');
  clients[index % clients.length].send(packet);
}
assert.deepEqual(
  [...covered].sort((left, right) => String(left).localeCompare(String(right))),
  [...TYPES].sort(),
  'all registered routes must be exercised',
);
for (let result = 0; result < rounds; result++) {
  const captain = pick(clients),
    playerData = captain.s.data;
  if (randomFraction() < 0.04) {
    // move them around: land somewhere, or go to space somewhere
    if (captain.s.ent) {
      const space = game.spaces[playerData.sys];
      space.remove(captain.s.ent);
      space.players--;
      captain.s.ent = null;
    }
    if (randomFraction() < 0.5) {
      const player = pick(stellarIds);
      playerData.sys = STELLARS[player].system;
      playerData.stellar = player;
      try {
        game.completeOnLanding(captain.s, STELLARS[player]);
        game.landed(captain.s);
      } catch (error2) {
        console.error('land helper', error2);
      }
    } else {
      playerData.sys = pick(SYSI);
      playerData.stellar = null;
      try {
        game.spawnPlayer(
          captain.s,
          (randomFraction() - 0.5) * 3000,
          (randomFraction() - 0.5) * 3000,
          0,
          0,
        );
      } catch (error3) {
        console.error('spawn helper', error3);
      }
    }
  }
  captain.send(message());
  if (randomFraction() < 0.2)
    captain.send({
      t: 'input',
      seq: result,
      th: randomFraction() < 0.5 ? 1 : 0,
      tu: pick([-1, 0, 1]),
      ab: randomFraction() < 0.2 ? 1 : 0,
      f1: randomFraction() < 0.5 ? 1 : 0,
      f2: randomFraction() < 0.2 ? 1 : 0,
    });
  if (result % 20 === 0) game.tick();
}
for (let index = 0; index < 3000; index++) game.tick(); // a long soak with everyone where the fuzz left them
for (const message2 of Object.values(game.live))
  for (const entity of message2.ships.values())
    if (
      ![entity.x, entity.y, entity.vx, entity.vy, entity.a, entity.shield, entity.armor].every(
        Number.isFinite,
      )
    )
      console.error(
        'non-finite ship state',
        message2.id,
        entity.hull,
        entity.x,
        entity.y,
        entity.vx,
        entity.vy,
        entity.shield,
        entity.armor,
      );
for (const captain of clients) {
  const playerData = requiredFixtureValue(captain.s).data;
  if (!Number.isFinite(playerData.credits))
    console.error('non-finite credits', playerData.name, playerData.credits);
  for (const [propertyKey2, value] of Object.entries(playerData.cargo || {}))
    if (!Number.isFinite(value) || value < 0)
      console.error('bad cargo', playerData.name, propertyKey2, value);
}
console.error = origErr;
console.log(`Packet RNG trace SHA-256: ${packetTrace.digest('hex')}`);
const uniq = [...new Set(errors.map((entity) => entity.split('\n').slice(0, 3).join(' | ')))];
console.log(
  `${rounds} random messages + ${TYPES.length} coverage probes, seed ${seed}, ${covered.size}/${TYPES.length} registered message types: ${errors.length} errors, ${uniq.length} distinct`,
);
for (const user of uniq.slice(0, 25)) console.log(' -', user.slice(0, 400));
process.exit(errors.length ? 1 : 0);
