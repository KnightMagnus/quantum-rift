import { tempDataDir } from './helpers/temp-data.js';
// 0.7 tests: colonies, station defense raids, ship mastery, the arena, the exchange, leaderboards and profiles.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS, FACTIONS } from '../shared/galaxy.js';
import { BUILDINGS, MASTERY, ARENA, DEFENSE } from '../shared/frontier.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v07-')));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
let ip = 1;
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  game.connect(sock, '8.8.8.' + ip++);
  const s = [...game.sessions.values()].pop();
  const c = {
    sock,
    s,
    send: (m) => sock.emit('message', JSON.stringify(m)),
    last: (t) => [...sock.out].reverse().find((m) => m.t === t),
    all: (t) => sock.out.filter((m) => m.t === t),
  };
  c.send({ t: 'hello', name, pass: 'secret' });
  return c;
}
const rich = (d) => {
  d.credits = 5e8;
  for (const m of ['alloy', 'crystal', 'isotope']) d.mats[m] = [30, 30, 30, 30, 30];
};
const a = fake('Settler'),
  da = a.s.data;
rich(da);
// colonies
const planet = Object.values(STELLARS).find((p) => game.features.frontier.colonizable(p));
ok(
  planet && FACTIONS[SYS[planet.system].faction].region,
  `${planet.name} in ${SYS[planet.system].name} can be settled`,
);
ok(
  !game.features.frontier.colonizable(STELLARS['meridian-yards']),
  'core worlds cannot be settled',
);
da.sys = planet.system;
da.stellar = planet.id;
a.send({ t: 'colony', op: 'found' });
const col = game.db.world.colonies[planet.id];
ok(col && col.lv === 1, 'founded a colony');
ok(
  a.last('landed').colony.own && a.last('world').colonies[planet.id] === 'Settler',
  'the colony shows on landing and on the world map',
);
a.send({ t: 'colony', op: 'build', kind: 'habitat' });
a.send({ t: 'colony', op: 'build', kind: 'mine' });
a.send({ t: 'colony', op: 'build', kind: 'farm' });
ok(col.buildings.length === 2, 'level 1 colonies have two building slots');
a.send({ t: 'colony', op: 'upgrade' });
a.send({ t: 'colony', op: 'build', kind: 'shieldgen' });
ok(
  col.lv === 2 && col.buildings.includes('shieldgen'),
  'upgraded to level 2 and built a Shield Array',
);
ok(
  game.features.bonuses.bonus(da).shieldPct >= 3,
  'the Shield Array gives a permanent shield bonus',
);
col.t = Date.now() - 3 * 3600000;
const c0 = da.credits;
a.send({ t: 'colony', op: 'collect' });
ok(
  da.credits - c0 >= 2500 * 1.25 * 2.9 && (da.cargo.ore || 0) >= 14,
  `collected three hours of production (${da.credits - c0} cr, ${da.cargo.ore} t ore)`,
);
const p2 = Object.values(STELLARS).filter(
  (p) => game.features.frontier.colonizable(p) && p.id !== planet.id,
);
da.stellar = p2[0].id;
da.sys = p2[0].system;
a.send({ t: 'colony', op: 'found' });
da.stellar = p2[1].id;
da.sys = p2[1].system;
a.send({ t: 'colony', op: 'found' });
ok(game.features.frontier.coloniesOf(da).length === 2, 'two colonies until Ops 5');
// station defense
Object.assign(da.station, { claimed: true, ops: 3, site: 'site-meridian', defense: 0 });
game.db.world.sites['site-meridian'] = game.db.key(da.name);
const r0 = game.features.frontier.defenseRating(da);
da.stellar = 'site-meridian';
da.sys = 'meridian';
a.send({ t: 'station', op: 'defense' });
ok(
  da.station.defense === 1 && game.features.frontier.defenseRating(da) > r0,
  `upgraded the station turrets (defense ${r0} -> ${game.features.frontier.defenseRating(da)})`,
);
da.station.raidWin = 0;
da.station.refUnits = 3;
game.features.frontier.raidCheck(a.s);
ok(
  da.log.some((l) => /raid/i.test(l.text)) && a.all('notify').length >= 1,
  'an offline raid resolves against the station defense, with a notification',
);
// live wave: the owner is in the station system
da.stellar = null;
game.spawnPlayer(a.s, 0, 0, 0, 0);
da.station.raidWin = 0;
game.features.frontier.raidCheck(a.s);
const w = game.waves[da.name],
  spW = game.spaces.meridian;
ok(w && w.ids.size >= 2, `a live raid wave of ${w.ids.size} ships attacks while you are there`);
const credW = da.credits;
for (const id of [...w.ids]) spW.kill(spW.ships.get(id), a.s.ent);
ok(!game.waves[da.name] && da.credits > credW, 'destroying the whole wave wins the raid');
// mastery
const h = da.ship.hull;
da.mastery = { [h]: MASTERY.tiers[4] - 1 };
const sh0 = game.features.shipStats.stats(da).shield;
game.features.frontier.mastery(a.s, 5);
ok(
  game.features.shipStats.stats(da).shield > sh0 && a.s.ent.elite,
  'reaching mastery Tier 5 raises stats and adds the gold trim',
);
ok(
  game.spaces.meridian.snapshot().ships.find((r) => r[0] === a.s.ent.id)[7] & 32,
  'the trim is sent to other players',
);
// arena
const sp0 = game.spaces.meridian;
sp0.remove(a.s.ent);
sp0.players--;
a.s.ent = null;
da.stellar = 'meridian-yards';
const b = fake('Duelist'),
  dbb = b.s.data;
dbb.stellar = 'meridian-yards';
dbb.sys = 'meridian';
a.send({ t: 'arena', op: 'queue', mode: '1v1' });
ok(game.arenaQ['1v1'].length === 1, 'queued for 1v1');
b.send({ t: 'arena', op: 'queue', mode: '1v1' });
const match = Object.values(game.matches)[0];
ok(
  match && a.s.ent && b.s.ent && a.s.ent.team !== b.s.ent.team,
  'a match starts when the queue fills: two teams in the Crucible',
);
const spA = match.sp;
ok(
  spA.isHostile(a.s.ent, b.s.ent) && [...spA.ships.values()].every((e) => e.player),
  'opponents are hostile; no traffic in the arena',
);
ok(a.last('arena').team && SYS[match.id].arena, 'the client is told its team');
const ra = da.arena.rating,
  rb = dbb.arena.rating,
  fee = da.credits;
spA.kill(b.s.ent, a.s.ent);
ok(
  !game.matches[match.id] &&
    da.arena.rating > ra &&
    dbb.arena.rating < rb &&
    da.arena.w === 1 &&
    dbb.arena.l === 1,
  `match over: ratings ${da.arena.rating} / ${dbb.arena.rating}`,
);
ok(
  da.stellar === 'meridian-yards' && dbb.stellar === 'meridian-yards' && !a.s.ent && !b.s.ent,
  'both captains are back where they queued, ships repaired',
);
ok(da.credits > fee && dbb.credits > 0, 'the arena pays both sides, no insurance fee');
// exchange
da.stellar = 'meridian-yards';
dbb.stellar = 'meridian-yards';
rich(dbb);
dbb.mats.crystal[2] = 0;
const alloy = da.mats.alloy[2],
  cB = dbb.credits,
  cA = da.credits;
a.send({
  t: 'exchange',
  op: 'place',
  side: 'sell',
  kind: 'mat',
  mat: 'alloy',
  grade: 2,
  qty: 5,
  price: 40000,
});
ok(
  da.mats.alloy[2] === alloy - 5 && game.db.world.orders.length === 1,
  'a sell order escrows the crates',
);
b.send({
  t: 'exchange',
  op: 'place',
  side: 'buy',
  kind: 'mat',
  mat: 'alloy',
  grade: 2,
  qty: 3,
  price: 45000,
});
ok(
  dbb.mats.alloy[2] === 33 &&
    dbb.credits === cB - 3 * 40000 &&
    da.credits === cA + Math.round(3 * 40000 * 0.98),
  'a crossing buy fills at the resting price, minus a 2% fee for the seller',
);
ok(game.db.world.orders[0].qty === 2, 'the rest of the sell order stays on the book');
a.send({ t: 'exchange', op: 'cancel', id: game.db.world.orders[0].id });
ok(!game.db.world.orders.length && da.mats.alloy[2] === alloy - 3, 'cancelling returns the escrow');
da.cargo = { food: 20 };
a.send({ t: 'exchange', op: 'place', side: 'sell', kind: 'com', cid: 'food', qty: 20, price: 100 });
b.send({ t: 'exchange', op: 'place', side: 'buy', kind: 'com', cid: 'food', qty: 20, price: 100 });
ok(dbb.storage.food === 20, 'bought commodities wait in exchange storage');
dbb.cargo = {};
b.send({ t: 'exchange', op: 'collect' });
ok(
  dbb.cargo.food > 0 && (dbb.storage.food || 0) + dbb.cargo.food === 20,
  'collected into the hold (what fits)',
);
a.send({ t: 'exchange', op: 'transfer', to: 'Duelist', n: 5000 });
ok(
  a.all('toast').some((t) => /Sent 5,000/.test(t.msg)),
  'sent credits to another captain',
);
// boards and profiles
a.send({ t: 'boards', cat: 'arena' });
const bd = a.last('boards');
ok(bd.list[0].name === 'Settler', 'the arena leaderboard ranks the winner first');
a.send({ t: 'profile', name: 'Duelist' });
const pf = a.last('profile').p;
ok(pf && pf.name === 'Duelist' && pf.arena.l === 1, 'captain profiles show records');
console.log('ALL 0.7 TESTS PASSED');
process.exit(0);
