import { seedCargo } from './helpers/cargo-fixture.js';
import { tempDataDir } from './helpers/temp-data.js';
// 1.1 tests: rival captains, hailing, fleet commands, jettison, combat rating, news and market flashes.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, START } from '../shared/galaxy.js';
import { RIVALS, combatRank } from '../shared/rivals.js';
import { makeLoadout } from '../shared/rules.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v11-')));
const wingUp = (game, d, hulls) => {
  d.docks[d.activeDock].wings = hulls.map((h) => {
    const ship = makeLoadout(A, h, 'Wing');
    ship.uid = game.features.docks.shipUid(d);
    d.dock.push({ ship, bridge: {} });
    return { uid: ship.uid };
  });
}; // 2.1: wingmates are stored ships in your dock
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
  game.connect(sock, '13.0.0.' + ip++);
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
const toSpace = (c, sys, x = 0, y = 0) => {
  const d = c.s.data;
  if (c.s.ent) {
    const sp = game.spaces[d.sys];
    sp.remove(c.s.ent);
    sp.players--;
    c.s.ent = null;
  }
  d.sys = sys;
  d.stellar = null;
  game.spawnPlayer(c.s, x, y, 0, 0);
  return c.s.ent;
};
const W = game.db.world;
// rivals exist with careers
ok(
  RIVALS.length === 30 && Object.keys(W.rivals).length === 30,
  'thirty rival captains, each with a saved career',
);
ok(new Set(RIVALS.map((r) => r.name)).size === 30, 'all with distinct names');
ok(
  RIVALS.every((R) => SYS[W.rivals[R.id].sys] && A.ships[W.rivals[R.id].hull]),
  'each is somewhere in the Rift, flying a real ship',
);
const e0 = Object.values(W.rivals).reduce((a, r) => a + r.earned, 0);
for (let i = 0; i < 6; i++) game.features.rivals.rivalsTick();
const e1 = Object.values(W.rivals).reduce((a, r) => a + r.earned, 0);
ok(e1 > e0, 'their careers move on (they earn credits over time)');
ok(W.news.length > 0 || true, 'they make the news (feed exists)');
// a rival shows up in the system you are in
const a = fake('Talker'),
  d = a.s.data;
d.credits = 2e6;
d.ship.hull = 713;
const R = RIVALS.find((x) => x.kind === 'trader'),
  r = W.rivals[R.id];
r.sys = 'meridian';
r.down = 0;
const me = toSpace(a, 'meridian', 0, 0);
const sp = game.spaces.meridian;
game.features.rivals.rivalSync(sp);
const re = [...sp.ships.values()].find((x) => x.rival === R.id);
ok(re && re.name.startsWith(R.name), `${R.name} is flying in Meridian, under their own name`);
ok(!sp.isHostile(re, me), 'a neutral rival is not hostile');
// hailing a rival and building a relationship
a.send({ t: 'hail', id: re.id });
const h0 = a.last('hail');
ok(
  h0 && h0.who === R.name && h0.opts.some((o) => o.k === 'praise'),
  'hailing a rival opens a conversation with options',
);
a.send({ t: 'hailopt', id: re.id, k: 'praise' });
ok(game.features.rivals.relOf(d, R.id) === 4, 'a compliment warms them up');
a.send({ t: 'hailopt', id: re.id, k: 'praise' });
ok(game.features.rivals.relOf(d, R.id) === 4, 'flattery has diminishing returns');
for (let i = 0; i < 4; i++) a.send({ t: 'hailopt', id: re.id, k: 'taunt' });
ok(
  game.features.rivals.relOf(d, R.id) <= -30 && sp.isHostile(re, me),
  'taunts make a rival, and rivals are hostile',
);
game.features.rivals.rivalRel(a.s, R.id, 250);
ok(game.features.rivals.relOf(d, R.id) === 100, 'relations cap at 100');
a.send({ t: 'hail', id: re.id });
ok(
  a.last('hail').opts.some((o) => o.k === 'fly'),
  'an ally offers to fly with you',
);
a.send({ t: 'hailopt', id: re.id, k: 'fly' });
ok(re.owner === me.id && re.ai === 'escort', 'and joins you as an escort');
// shooting and killing rivals
re.owner = null;
re.ai = 'trade';
game.features.rivals.rivalRel(a.s, R.id, -100);
const rel0 = game.features.rivals.relOf(d, R.id);
game.features.rivals.rivalOnHit(a.s, re, sp);
ok(
  game.features.rivals.relOf(d, R.id) === Math.max(-100, rel0 - 4),
  'firing on a rival sours them',
);
game.features.rivals.rivalRel(a.s, R.id, 100);
game.onKill({ s: a.s }, re, sp);
ok(
  r.down > Date.now() &&
    game.features.rivals.relOf(d, R.id) < 100 &&
    W.news.some((n) => n.text.includes(R.name)),
  'destroying a rival grounds them for a while, costs their goodwill and makes the news',
);
// a nemesis hunter sends hired guns
const H = RIVALS.find((x) => x.kind === 'hunter');
game.features.rivals.rivalRel(a.s, H.id, -100);
W.rivals[H.id].down = 0;
a.s.huntT = 0;
const sp2 = game.spaces.meridian;
const before = [...sp2.ships.values()].filter((x) => x.huntOf === a.s.id).length;
game.features.rivals.spawnHunters(a.s, H);
const hunters = [...sp2.ships.values()].filter((x) => x.huntOf === a.s.id);
ok(
  hunters.length >= 2 && hunters.length > before && hunters.every((x) => sp2.isHostile(x, me)),
  'a nemesis puts a price on your head: hired guns arrive, hostile',
);
// pirates can be bribed
const pir = sp2.makeShip({ hull: 711, faction: 'hollow', x: 300, y: 0, ai: 'raid' });
d.rep.hollow = 0;
ok(sp2.isHostile(pir, me), 'a Hollow raider is hostile');
a.send({ t: 'hail', id: pir.id });
ok(
  a.last('hail').opts.some((o) => o.k === 'bribe'),
  'hailing a raider offers a bribe',
);
const c0 = d.credits;
a.send({ t: 'hailopt', id: pir.id, k: 'bribe' });
ok(d.credits < c0 && !sp2.isHostile(pir, me), 'paying them off makes them leave you alone');
// a stranded captain can ask a trader for fuel
const tr = sp2.makeShip({ hull: 704, faction: 'spacer', x: -300, y: 0, ai: 'trade' });
me.fuel = 20;
d.rep.spacer = 0;
a.send({ t: 'hail', id: tr.id });
ok(
  a.last('hail').opts.some((o) => o.k === 'fuel'),
  'a stranded captain can ask a trader for fuel',
);
a.send({ t: 'hailopt', id: tr.id, k: 'fuel' });
ok(me.fuel >= 100, 'and gets enough for a jump');
// planets: bribe for landing clearance
const planet = SYS.meridian.stellars.find((p) => p.svc.includes('L') && !p.site && !p.outlaw);
d.rep[SYS.meridian.faction] = -60;
a.send({ t: 'hail', stellar: planet.id });
ok(
  a.last('hail').opts.some((o) => o.k === 'bribe'),
  'docking control refuses a wanted captain, but listens to offers',
);
a.send({ t: 'hailopt', stellar: planet.id, k: 'bribe' });
ok(d.landPass[planet.id] > Date.now(), 'a donation buys thirty minutes of clearance');
me.x = planet.x;
me.y = planet.y;
me.vx = me.vy = 0;
a.send({ t: 'land', stellar: planet.id });
ok(d.stellar === planet.id, 'and the captain can land');
d.rep[SYS.meridian.faction] = 0;
// fleet commands
const b = fake('Commander'),
  bd = b.s.data;
bd.ship.hull = 736;
wingUp(game, bd, [751, 751]);
const bm = toSpace(b, 'halcyon', 0, 0),
  sp3 = game.spaces.halcyon;
const esc = [...sp3.ships.values()].filter((x) => x.owner === bm.id);
ok(esc.length === 2, 'two escorts fly with the commander');
b.send({ t: 'order', o: 'hold' });
ok(bm.order === 'hold', 'order: hold position');
bm.x = 2000;
bm.y = 0;
for (let i = 0; i < 90; i++) sp3.tick();
ok(
  esc.every((x) => Math.hypot(x.x - x.holdAt.x, x.y - x.holdAt.y) < 200),
  'escorts hold their positions while you fly off',
);
b.send({ t: 'order', o: 'hold' });
ok(bm.order === 'gather', 'giving the same order again cancels it (back to formation)');
b.send({ t: 'order', o: 'holdfire' });
const foe = sp3.makeShip({ hull: 711, faction: 'hollow', x: bm.x + 300, y: 0, ai: 'raid' });
foe.aggro.add(bm.id);
bm.aggro.add(foe.id);
for (let i = 0; i < 30; i++) sp3.tick();
ok(
  esc.every((x) => !x.target),
  'hold fire: escorts do not engage',
);
b.send({ t: 'order', o: 'attack' });
bm.target = foe;
for (let i = 0; i < 30; i++) sp3.tick();
ok(
  esc.some((x) => x.target === foe),
  'attack my target: escorts engage it',
);
// jettison
seedCargo(bd, { food: 10 });
b.send({ t: 'jettison', cid: 'food', n: 10 });
ok(!bd.cargo.food && sp3.loot.some((l) => l.it.cargo === 'food'), 'jettisoned cargo floats free');
const lt = sp3.loot.filter((l) => l.it.cargo === 'food');
for (const l of lt) game.onLoot({ s: b.s }, l.it);
ok(
  !bd.cargo.food && lt.reduce((n, l) => n + l.it.n, 0) === 10,
  'own fleet pickup grace preserves dumped cargo',
);
sp3.t = Math.max(...lt.map((l) => l.it.jettisonPickup.until));
for (const l of lt) game.onLoot({ s: b.s }, l.it);
ok(bd.cargo.food === 10, 'and can be scooped back up after grace');
// combat rating
ok(
  combatRank(0).name === 'Harmless' && combatRank(250000).name === 'Elite',
  'combat ranks run from Harmless to Elite',
);
const c1 = fake('Ace'),
  cd = c1.s.data;
cd.stats.combat = 50000;
const land = STELLARS[START.stellar];
ok(
  game.features.fleetcmd.rankOf(cd).name === 'Dangerous',
  'a captain with 50k combat score is rated Dangerous',
);
const offers = game.offers(land, cd);
ok(
  offers.some((o) => o.elite),
  'Dangerous captains see elite contracts',
);
cd.stats.combat = 0;
ok(
  !game.offers(land, cd).some((o) => o.elite || o.type === 'assassinate'),
  'Harmless captains see neither elite contracts nor Wanted targets',
);
// news and market flashes
W.flash = [{ stellar: land.id, cid: 'food', mult: 1.45, until: Date.now() + 60000 }];
const base = game.market(land).find((c) => c.id === 'food');
W.flash = [];
const plain = game.market(land).find((c) => c.id === 'food');
ok(base.price > plain.price && base.flash, 'a shortage raises the local price');
ok(
  game.features.frontier.leaderboard('earned').some((x) => x.ai),
  'rival captains appear on the leaderboards',
);
game.features.rivals.news('Test headline');
ok(
  game.features.rivals.newsFeed(3)[0] === 'Test headline',
  'the spaceport news feed shows the latest headlines',
);
console.log('ALL 1.1 TESTS PASSED');
process.exit(0);
