// 2.0.2 fuzzer: many fake clients send every message type the server knows, with random and malformed fields, while
// the systems tick. Any error the server logs is a bug. Run: node test/fuzz.js [rounds] [seed]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS } from '../shared/galaxy.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const errors = [];
const origErr = console.error;
console.error = (...a) => {
  errors.push(a.map((x) => (x && x.stack ? x.stack : String(x))).join(' '));
};
const game = new Game(A, new DB('/tmp/rift-fuzz-' + Date.now()));
// The runtime registry is the authoritative source of message routes.
const TYPES = [...game.messageHandlers.types];
assert.ok(TYPES.length, 'the authenticated message registry must not be empty');
assert.equal(new Set(TYPES).size, TYPES.length, 'registered message types must be unique');
const seed = Number(process.argv[3] || 123456789) >>> 0;
let randomState = seed;
const R = () => {
  randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
  return randomState / 4294967296;
};
const dispatch = game.messageHandlers.dispatch,
  covered = new Set();
game.messageHandlers = {
  ...game.messageHandlers,
  dispatch(type, ...args) {
    if (TYPES.includes(type)) covered.add(type);
    return dispatch(type, ...args);
  },
};
const pick = (a) => a[Math.floor(R() * a.length)];
const STL = Object.keys(STELLARS),
  SYSI = SYSTEMS.map((s) => s.id),
  HULLS = Object.keys(A.ships).map(Number);
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
    pick(STL),
    pick(SYSI),
    pick(HULLS),
    '__proto__',
    'constructor',
  ]);
const OPS = [
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
function msg(t = pick(TYPES)) {
  const m = { t };
  for (const k of [
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
    if (R() < 0.35) m[k] = junk();
  if (R() < 0.5) m.op = pick(OPS);
  if (R() < 0.3) m.id = pick([pick(STL), Math.floor(R() * 2000), 'qv1', 'shard', 'papers', 'o1']);
  return m;
}
let ip = 1;
const clients = [];
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.send = () => {};
  sock.close = () => {};
  game.connect(sock, '16.0.' + Math.floor(ip / 250) + '.' + (ip++ % 250));
  const s = [...game.sessions.values()].pop();
  sock.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' }));
  return {
    sock,
    s,
    send: (m) => {
      // Exercise handlers, not just the first 120 packets allowed by the flood guard.
      s.msgs = 0;
      sock.emit('message', JSON.stringify(m));
    },
  };
}
for (let i = 0; i < 12; i++) {
  const c = fake('Fuzz' + i),
    d = c.s.data;
  d.credits = [0, 5e4, 5e7][i % 3];
  if (i % 4 === 0) {
    d.station.claimed = true;
    d.station.ops = 5;
  }
  clients.push(c);
}
const rounds = +(process.argv[2] || 4000);
// Guarantee every registered route reaches authenticated dispatch before random sampling.
for (const [i, type] of TYPES.entries()) clients[i % clients.length].send(msg(type));
assert.deepEqual([...covered].sort(), [...TYPES].sort(), 'all registered routes must be exercised');
for (let r = 0; r < rounds; r++) {
  const c = pick(clients),
    d = c.s.data;
  if (R() < 0.04) {
    // move them around: land somewhere, or go to space somewhere
    if (c.s.ent) {
      const sp = game.spaces[d.sys];
      sp.remove(c.s.ent);
      sp.players--;
      c.s.ent = null;
    }
    if (R() < 0.5) {
      const p = pick(STL);
      d.sys = STELLARS[p].system;
      d.stellar = p;
      try {
        game.completeOnLanding(c.s, STELLARS[p]);
        game.landed(c.s);
      } catch (e) {
        console.error('land helper', e);
      }
    } else {
      d.sys = pick(SYSI);
      d.stellar = null;
      try {
        game.spawnPlayer(c.s, (R() - 0.5) * 3000, (R() - 0.5) * 3000, 0, 0);
      } catch (e) {
        console.error('spawn helper', e);
      }
    }
  }
  c.send(msg());
  if (R() < 0.2)
    c.send({
      t: 'input',
      seq: r,
      th: R() < 0.5 ? 1 : 0,
      tu: pick([-1, 0, 1]),
      ab: R() < 0.2 ? 1 : 0,
      f1: R() < 0.5 ? 1 : 0,
      f2: R() < 0.2 ? 1 : 0,
    });
  if (r % 20 === 0) game.tick();
}
for (let i = 0; i < 3000; i++) game.tick(); // a long soak with everyone where the fuzz left them
for (const sp of Object.values(game.live))
  for (const e of sp.ships.values())
    if (![e.x, e.y, e.vx, e.vy, e.a, e.shield, e.armor].every(Number.isFinite))
      console.error(
        'non-finite ship state',
        sp.id,
        e.hull,
        e.x,
        e.y,
        e.vx,
        e.vy,
        e.shield,
        e.armor,
      );
for (const c of clients) {
  const d = c.s.data;
  if (!Number.isFinite(d.credits)) console.error('non-finite credits', d.name, d.credits);
  for (const [k, v] of Object.entries(d.cargo || {}))
    if (!Number.isFinite(v) || v < 0) console.error('bad cargo', d.name, k, v);
}
console.error = origErr;
const uniq = [...new Set(errors.map((e) => e.split('\n').slice(0, 3).join(' | ')))];
console.log(
  `${rounds} random messages + ${TYPES.length} coverage probes, seed ${seed}, ${covered.size}/${TYPES.length} registered message types: ${errors.length} errors, ${uniq.length} distinct`,
);
for (const u of uniq.slice(0, 25)) console.log(' -', u.slice(0, 400));
process.exit(errors.length ? 1 : 0);
