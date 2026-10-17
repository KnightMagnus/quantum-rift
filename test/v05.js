import { tempDataDir } from './helpers/temp-data.js';
// 0.5 tests: shuttles, officers (stats, synergy, xp), research queue, refining up, drydock presets, boarding.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS, RESEARCH } from '../shared/galaxy.js';
import { SHUTTLES, RARITY } from '../shared/hangar.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v05-')));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  game.connect(sock, '6.6.6.' + Math.floor(Math.random() * 200));
  const s = [...game.sessions.values()].pop();
  const c = {
    sock,
    s,
    send: (m) => sock.emit('message', JSON.stringify(m)),
    last: (t) => [...sock.out].reverse().find((m) => m.t === t),
    toasts: () => sock.out.filter((m) => m.t === 'toast').map((m) => m.msg),
  };
  c.send({ t: 'hello', name, pass: 'secret' });
  return c;
}
const a = fake('Hangar Chief'),
  d = a.s.data;
ok(
  Array.isArray(d.shuttles) &&
    Array.isArray(d.officers) &&
    d.bridge &&
    Array.isArray(d.dock) &&
    Array.isArray(d.station.queue),
  'saves get hangar, crew and drydock fields',
);
// a station section at Meridian, Ops 2
d.credits = 5e7;
for (const m of ['alloy', 'crystal', 'isotope']) d.mats[m] = [20, 20, 20, 20, 20];
Object.assign(d.station, { claimed: true, ops: 2, site: 'site-meridian' });
game.db.world.sites['site-meridian'] = game.db.key(d.name);
d.sys = 'meridian';
d.stellar = 'site-meridian';
ok(
  game.features.hangar.bays(d) === 1 && game.features.hangar.dockSlots(d) === 5,
  'Ops 2: one shuttle bay, five stored-ship berths',
);
a.send({ t: 'shuttle', op: 'build', kind: 'salvage' });
ok(d.shuttles.length === 0, 'the Salvage Tender needs Ops 3');
a.send({ t: 'shuttle', op: 'build', kind: 'courier' });
ok(d.shuttles.length === 1 && d.shuttles[0].state === 'idle', 'built a Courier Shuttle');
a.send({ t: 'shuttle', op: 'build', kind: 'survey' });
ok(d.shuttles.length === 1, 'one bay means one shuttle');
// job board
const board = game.features.hangar.shuttleBoard(d);
ok(
  board.length >= 5 && new Set(board.map((j) => j.kind)).size >= 5,
  `the hangar board posts ${board.length} jobs of every kind`,
);
ok(
  board.every((j) => j.minutes >= 15 && j.minutes <= 480 && SYS[j.sys]),
  'jobs run 15 minutes to 8 hours, to real systems',
);
ok(
  JSON.stringify(game.features.hangar.shuttleBoard(d).map((j) => j.id)) ===
    JSON.stringify(board.map((j) => j.id)),
  'the board is stable within its window',
);
const job = board.find((j) => j.kind === 'delivery') || board[0];
const sh = d.shuttles[0],
  c0 = d.credits;
a.send({ t: 'shuttle', op: 'send', sid: sh.id, job: job.id });
ok(
  sh.state === 'out' && sh.ends > Date.now() && sh.chance > 0.15,
  `launched on "${job.title}" (${Math.round(sh.chance * 100)}% odds)`,
);
ok(
  !game.features.hangar.shuttleBoard(d).some((j) => j.id === job.id),
  'a taken job leaves the board',
);
sh.outcome = 'success';
sh.ends = Date.now() - 1;
game.idleCheck(a.s);
ok(
  sh.state === 'idle' && d.credits > c0 && sh.runs === 1,
  `the shuttle came home and paid out (${d.credits - c0} cr)`,
);
// a lost shuttle disappears, a damaged one needs repairs
a.send({ t: 'shuttle', op: 'send', sid: sh.id, job: game.features.hangar.shuttleBoard(d)[0].id });
sh.outcome = 'damaged';
sh.ends = Date.now() - 1;
game.idleCheck(a.s);
ok(sh.state === 'damaged', 'a failed run can bring the shuttle home damaged');
a.send({ t: 'shuttle', op: 'repair', sid: sh.id });
ok(sh.state === 'idle', 'repaired at the station');
a.send({ t: 'shuttle', op: 'send', sid: sh.id, job: game.features.hangar.shuttleBoard(d)[0].id });
sh.outcome = 'lost';
sh.ends = Date.now() - 1;
game.idleCheck(a.s);
ok(d.shuttles.length === 0, 'a lost shuttle is gone');
// officers at a bar
d.stellar = 'meridian-yards';
const bar = game.features.hangar.barOffers(STELLARS['meridian-yards'], d);
ok(
  bar.length === 3 && bar.every((o) => o.race && o.role && RARITY[o.rarity]),
  `the bar at Meridian Yards has three officers (${bar.map((o) => o.name).join(', ')})`,
);
const st0 = game.features.shipStats.stats(d);
a.send({ t: 'officer', op: 'hire', id: bar[0].id });
ok(d.officers.length === 1, `hired ${d.officers[0].name}`);
ok(
  !game.features.hangar.barOffers(STELLARS['meridian-yards'], d).some((o) => o.id === bar[0].id),
  'a hired officer leaves the bar',
);
// force a known officer for the stat check
const g1 = d.officers[0];
Object.assign(g1, { role: 'captain', rarity: 2, lv: 1, race: 'quantum' });
a.send({ t: 'officer', op: 'assign', oid: g1.id, slot: 'captain' });
const st1 = game.features.shipStats.stats(d);
ok(
  st1.shield > st0.shield && st1.damageMul > st0.damageMul,
  `a Rare captain raises shields ${st0.shield} -> ${st1.shield} and damage x${st1.damageMul.toFixed(3)}`,
);
d.officers.push({
  id: game.features.hangar.uid(d),
  name: 'Test Two',
  race: 'quantum',
  role: 'engineer',
  rarity: 0,
  lv: 1,
  xp: 0,
});
const before = game.features.bonuses.bonus(d).shieldPct || 0;
a.send({ t: 'officer', op: 'assign', oid: d.officers[1].id, slot: 'bridge1' });
ok(
  (game.features.bonuses.bonus(d).shieldPct || 0) >= before + 5,
  'two Concord officers on the bridge unlock the Concord synergy (+5% shields)',
);
const lv0 = g1.lv;
game.features.hangar.officerXp(a.s, 5000);
ok(g1.lv > lv0, `bridge officers level up with experience (level ${g1.lv})`);
ok(
  a.last('you').d.officers.length === 2 && a.last('you').d.bonus.shieldPct > 0,
  'the client receives the roster and bonuses',
);
// research queue with prerequisites
d.stellar = 'site-meridian';
d.station.ops = 5;
d.station.done = [];
d.station.active = null;
d.station.queue = [];
a.send({ t: 'station', op: 'research', id: 'shield3' });
ok(
  d.station.active &&
    d.station.active.id === 'shield1' &&
    d.station.queue.join() === 'shield2,shield3',
  'queueing Shield Harmonics III queues I and II first and starts I',
);
d.station.active.ends = Date.now() - 1;
game.idleCheck(a.s);
ok(
  d.station.done.includes('shield1') && d.station.active.id === 'shield2',
  'finished research hands over to the next queued project',
);
a.send({ t: 'station', op: 'unqueue', id: 'shield3' });
ok(!d.station.queue.length, 'projects can be removed from the queue');
ok(
  RESEARCH.length >= 25 && new Set(RESEARCH.map((r) => r.tree)).size === 4,
  `${RESEARCH.length} research projects in four trees`,
);
// refining
d.mats.crystal[0] = 9;
a.send({ t: 'station', op: 'refine', mat: 'crystal', g: 0, n: 3 });
ok(d.mats.crystal[0] === 0 && d.mats.crystal[1] === 23, 'refined 9 crystal I into 3 crystal II');
// stored ships (2.1: the drydock became docks; FLY THIS / STORE still work through the old messages)
d.station.ops = 4;
ok(game.features.hangar.dockSlots(d) === 11, 'Ops 4: eleven stored-ship berths');
d.cargo = {};
if (d.ship.hull === 703) d.ship.hull = 708;
const hull0 = d.ship.hull;
a.send({ t: 'dock', op: 'store' });
ok(
  d.dock.length === 1 &&
    d.dock[0].ship.hull === hull0 &&
    d.dock[0].bridge.captain === g1.id &&
    d.shipless,
  'stored the ship with its bridge crew; no active ship until you choose one',
);
a.send({ t: 'dock', op: 'store', i: 0 });
ok(
  d.ship.hull === hull0 && d.bridge.captain === g1.id && d.dock.length === 0,
  'flying her again restores the bridge crew',
);
a.send({ t: 'dock', op: 'store' });
a.send({ t: 'dock', op: 'store' });
a.send({ t: 'dock', op: 'store' });
ok(d.dock.length === 1 && d.shipless, 'spam-storing does nothing once you have no active ship');
a.send({ t: 'dock', op: 'store', i: 0 });
// boarding
d.stellar = null;
d.sys = 'meridian';
game.spawnPlayer(a.s, 0, 0, 0, 0);
const sp = game.spaces.meridian,
  me = a.s.ent;
const mk = (fac) => {
  const t = sp.makeShip({ hull: 711, faction: fac, x: 40, y: 0 });
  t.disabled = true;
  t.armor = 1;
  return t;
};
let t = mk('hollow');
const cr0 = d.credits;
a.send({ t: 'board', id: t.id, act: 'plunder' });
if (!(d.credits > cr0))
  console.log(
    'DBG',
    a.toasts().slice(-3),
    me.x,
    me.y,
    t.x,
    t.y,
    me.st.size,
    t.st.size,
    me.vx,
    t.vx,
  );
ok(d.credits > cr0 && !sp.ships.has(t.id), 'plundered a disabled Hollow gunboat');
t = mk('spacer');
const rep0 = d.rep.spacer;
a.send({ t: 'board', id: t.id, act: 'rescue' });
ok(d.rep.spacer === rep0 + 6, 'rescuing a Spacer crew earns standing');
t = mk('hollow');
t.strength = 1;
me.st.strength = 9999;
let caught = false;
for (let i = 0; i < 12 && !caught; i++) {
  const n0 = d.dock.length;
  t = mk('hollow');
  t.strength = 1;
  a.send({ t: 'board', id: t.id, act: 'capture' });
  caught = d.dock.length > n0;
}
ok(caught && d.dock.some((x) => x.ship.hull === 711), 'captured a gunboat into the drydock');
t = sp.makeShip({ hull: 711, faction: 'hollow', x: 900, y: 0 });
t.disabled = true;
a.send({ t: 'board', id: t.id, act: 'plunder' });
ok(sp.ships.has(t.id), 'boarding needs you alongside');
// mining yield bonus
const b = game.features.bonuses.bonus(d);
d.station.done.push('mining1', 'mining2');
ok(game.features.bonuses.bonus(d).miningPct >= 60, 'mining research raises ore yield');
console.log('ALL 0.5 TESTS PASSED');
process.exit(0);
