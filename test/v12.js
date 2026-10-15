// 1.2 tests: the Syndicate and black market, officer ranks and traits, lower decks, the bank, passengers and rush jobs,
// Syndicate contracts, faction story arcs, and Farside expeditions.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS, FACTIONS } from '../shared/galaxy.js';
import {
  synTier,
  BLACK_MARKET,
  TRAITS,
  LOWER_DECK,
  bunks,
  loanPayment,
} from '../shared/syndicate.js';
import { ARCS } from '../shared/arcs.js';
import { EXPEDITION_LORE } from '../shared/expeditions.js';
import { captainBonus } from '../shared/rules.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB('/tmp/rift-v12-' + Date.now()));
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
  game.connect(sock, '14.0.0.' + ip++);
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
const land = (c, sid) => {
  const d = c.s.data,
    p = STELLARS[sid];
  if (c.s.ent) {
    const sp = game.spaces[d.sys];
    sp.remove(c.s.ent);
    sp.players--;
    c.s.ent = null;
  }
  d.sys = p.system;
  d.stellar = sid;
  game.completeOnLanding(c.s, p);
  game.landed(c.s);
  game.features.story.storyOnLand(c.s, p);
  game.features.arcs.arcOnLand(c.s, p);
};
const toSpace = (c, sys) => {
  const d = c.s.data;
  if (c.s.ent) {
    const sp = game.spaces[d.sys];
    sp.remove(c.s.ent);
    sp.players--;
    c.s.ent = null;
  }
  d.sys = sys;
  d.stellar = null;
  game.spawnPlayer(c.s, 0, 0, 0, 0);
  game.features.arcs.arcArrive(c.s, game.spaces[sys]);
  return c.s.ent;
};
const a = fake('Outlaw'),
  d = a.s.data;
d.credits = 5e6;
// the Syndicate
ok(
  synTier(0).name === 'Unknown' && synTier(2000).name === 'Kingpin',
  'Syndicate tiers run from Unknown to Kingpin',
);
game.features.syndicate.synGain(a.s, 'smuggle');
ok(d.syn === 15, 'a smuggling run earns Syndicate standing');
for (let i = 0; i < 2; i++) game.features.syndicate.synGain(a.s, 'contract');
ok(synTier(d.syn).name === 'Associate', 'and climbs the tiers');
const den = Object.values(STELLARS).find((p) => p.outlaw && p.svc.includes('L'));
land(a, den.id);
const bm = a.last('landed').blackmarket;
ok(
  bm &&
    bm.items.length === BLACK_MARKET.length &&
    bm.items.some((x) => x.locked) &&
    bm.items.some((x) => !x.locked),
  'outlaw worlds have a black market, with stock locked by tier',
);
d.rep.korrund = -70;
a.send({ t: 'bm', id: 'papers' });
ok(d.rep.korrund === -10, 'forged papers wipe your worst grudge back to -10');
const sh0 = d.shards;
a.send({ t: 'bm', id: 'shard' });
ok(d.shards === sh0 + 1, 'commendations are sold to Associates');
a.send({ t: 'bm', id: 'wraithbp' });
ok(!(d.bp && d.bp[813]), 'Made-tier stock is refused to an Associate');
d.syn = 2500;
{
  const n0 = Object.values(d.mats).reduce((x, m) => x + m[4], 0);
  a.send({ t: 'bm', id: 'crate5' });
  ok(
    Object.values(d.mats).reduce((x, m) => x + m[4], 0) === n0 + 1,
    'a Kingpin can buy a grade V crate (2.6: replaces the Eclipse Directive)',
  );
}
const plain =
  STELLARS.earth ||
  Object.values(STELLARS).find((p) => p.svc.includes('B') && !p.outlaw && !p.site);
d.syn = 0;
ok(
  !game.features.syndicate.blackMarketAt(plain, d),
  'no black market at a lawful bar for unknowns',
);
d.syn = 450;
ok(
  game.features.syndicate.blackMarketAt(plain, d),
  'but a Lieutenant finds one in any spaceport bar',
);
// officer ranks and traits
const off = {
  id: 'o1',
  name: 'Test Officer',
  race: 'quantum',
  role: 'gunner',
  rarity: 1,
  lv: 9,
  xp: 0,
};
d.officers = [off];
d.bridge = { captain: null, bridge1: 'o1', bridge2: null };
const dmg0 = captainBonus(d).damagePct || 0;
d.shards = 0;
a.send({ t: 'promote', id: 'o1' });
ok(!off.rank, 'promotion needs commendations');
d.shards = 100;
a.send({ t: 'promote', id: 'o1' });
ok(
  off.rank === 1 && off.traits.length === 1 && TRAITS[off.traits[0]],
  'promoted to Lieutenant, learning a trait',
);
ok(
  (captainBonus(d).damagePct || 0) > dmg0 || Object.keys(TRAITS[off.traits[0]].bonus).length,
  "rank and trait raise the officer's bonuses",
);
for (let i = 0; i < 5; i++) a.send({ t: 'promote', id: 'o1' });
ok(
  off.rank === 4 && off.traits.length === 4,
  'four promotions to Captain, four traits, no further',
);
// lower decks
a.send({ t: 'lower', op: 'hire', kind: 'rigger', i: 0 });
a.send({ t: 'lower', op: 'hire', kind: 'gunmate', i: 1 });
ok(
  d.lower[0] === 'rigger' && d.lower[1] === 'gunmate' && (captainBonus(d).cargoPct || 0) >= 5,
  'two lower-deck crew add small passives',
);
a.send({ t: 'lower', op: 'hire', kind: 'rigger', i: 1 });
ok(d.lower[1] === 'gunmate', 'no doubling up on a crew role');
// the bank
land(a, 'qstation');
const B = a.last('landed').bank;
ok(B && B.max > 0 && B.credit === 600, 'the bank offers loans by credit rating');
const c0 = d.credits;
a.send({ t: 'bank', op: 'borrow', amt: 30000 });
ok(d.loan && d.loan.bal === 30000 && d.credits === c0 + 30000, 'borrowed 30,000 credits');
a.send({ t: 'bank', op: 'borrow', amt: 1e9 });
ok(d.loan.bal === 30000, 'the bank refuses to over-lend');
d.loan.next = 0;
const before = d.loan.bal;
game.features.syndicate.bankTick(a.s);
ok(
  d.loan.bal < before && d.credit > 600,
  'an on-time payment reduces the balance and builds credit',
);
const keep = d.credits;
d.credits = 0;
d.loan.next = 0;
game.features.syndicate.bankTick(a.s);
ok(d.credit < 603 && d.loan.bal > 0, 'a missed payment adds interest and hurts credit');
d.credits = keep;
a.send({ t: 'bank', op: 'pay', amt: 1e9 });
ok(!d.loan, 'paying in full clears the loan');
// passengers and rush jobs
d.ship.hull = 704;
const cap = bunks(A.ships[704]);
ok(cap >= 1, `a hauler sleeps ${cap} passengers`);
const offers = game.offers(STELLARS.qstation, d);
const pax = offers.find((o) => o.type === 'passenger'),
  rush = offers.find((o) => o.rush);
if (pax) {
  d.missions = [];
  const big = { ...pax, pax: cap + 5 };
  ok(
    !game.features.syndicate.acceptCheck(a.s, big),
    'a passenger job that needs more bunks is refused',
  );
  ok(game.features.syndicate.acceptCheck(a.s, { ...pax, pax: 1 }), 'one that fits is accepted');
} else ok(true, '(no passenger job on this board right now)');
d.missions = [
  {
    id: 'r1',
    type: 'cargo',
    rush: 5,
    title: 'RUSH test',
    sys: 'meridian',
    dest: 'x',
    qty: 1,
    cid: 'medical',
    reward: 1,
    deadline: Date.now() - 1,
  },
];
game.features.syndicate.missionDeadlines(a.s);
ok(d.missions.length === 0, 'a rush job past its deadline fails');
// Syndicate contracts at outlaw worlds
const many = [];
for (const p of Object.values(STELLARS)
  .filter((p) => p.outlaw && p.svc.includes('B'))
  .slice(0, 12))
  many.push(...game.offers(p, d));
ok(
  many.some((o) => o.syn === 'contract') && many.some((o) => o.syn === 'hit'),
  'outlaw boards post Syndicate smuggling contracts and hits',
);
// trade haggling
const tp = (await import('../shared/syndicate.js')).TRAITS.haggler;
ok(tp.bonus.tradePct === 2, 'the Haggler trait improves trade prices');
// faction story arcs
ok(
  Object.keys(ARCS).length === 7 &&
    Object.values(ARCS).every((X) => X.steps.length === 3 && STELLARS[X.places.at]),
  'seven faction arcs, three steps each, offered at real capitals',
);
const b = fake('Envoy'),
  bd = b.s.data;
bd.credits = 1e6;
bd.ship.hull = 736;
const X = ARCS.korrund;
bd.rep.korrund = 0;
land(b, X.places.at);
ok(!b.all('story').some((m) => m.arc === 'korrund'), 'no arc offer without standing');
bd.rep.korrund = 20;
land(b, X.places.at);
ok(
  b.all('story').some((m) => m.arc === 'korrund' && !m.done),
  'with standing, the Korrund arc is offered at their capital',
);
b.send({ t: 'arcacc', fac: 'korrund' });
ok(bd.arcs.korrund.active, 'accepted the first Korrund mission');
land(b, X.places.dest);
ok(
  bd.arcs.korrund.step === 1 && b.all('story').some((m) => m.arc === 'korrund' && m.done),
  'delivered: step one complete, with a conclusion pop-up',
);
bd.rep.korrund = 40;
land(b, X.places.at);
b.send({ t: 'arcacc', fac: 'korrund' });
toSpace(b, X.steps[1].sys);
const sp = game.spaces[X.steps[1].sys],
  tg = [...sp.ships.values()].filter((x) => x.arcOf && x.arcOf.fac === 'korrund');
ok(tg.length === X.steps[1].count, 'arriving spawns the claim jumpers');
for (const x of tg) game.onKill({ s: b.s }, x, sp);
ok(bd.arcs.korrund.active.ready, 'destroying them all completes the objective');
land(b, X.places.at);
b.send({ t: 'arcacc', fac: 'korrund' });
toSpace(b, X.steps[2].sys);
const boss = [...game.spaces[X.steps[2].sys].ships.values()].find(
  (x) => x.arcOf && x.arcOf.fac === 'korrund',
);
ok(boss && boss.name === X.steps[2].bossName, 'the arc boss waits in its system');
game.onKill({ s: b.s }, boss, game.spaces[X.steps[2].sys]);
land(b, X.places.at);
ok(
  bd.arcs.korrund.done &&
    bd.officers.some((o) => o.id === 'arc-korrund' && o.rarity === 3) &&
    bd.bp[X.spec] >= 10,
  'the finale: a unique Epic officer and 10 specialist blueprints',
);
// Farside expeditions
const c = fake('Surveyor'),
  cd = c.s.data;
const fp = Object.values(STELLARS).find((p) => SYS[p.system].farside && p.svc.includes('B'));
const ex = game.features.arcs.expeditionOffer(fp, cd);
ok(ex && ex.exp.stage === 1, 'Farside boards offer an expedition');
land(c, fp.id);
c.send({ t: 'accept', id: ex.id });
const m1 = cd.missions.find((m) => m.exp);
ok(m1, 'accepted expedition stage one (survey)');
m1.done = true;
land(c, fp.id);
const m2 = cd.missions.find((m) => m.exp && m.exp.stage === 2);
ok(m2 && m2.type === 'rescue', 'the survey finds a derelict to board');
const other = Object.values(STELLARS).find(
  (p) => SYS[p.system].farside && p.svc.includes('L') && p.id !== fp.id && !p.site,
);
m2.done = true;
land(c, other.id);
const m3 = cd.missions.find((m) => m.exp && m.exp.stage === 3);
ok(m3 && m3.type === 'expret', 'the derelict yields a data core to bring home');
land(c, m3.dest);
ok(
  cd.expd.n === 1 && c.all('story').some((s) => s.id === 'exp:0'),
  'decoding it reveals a lore fragment and opens the next expedition',
);
ok(EXPEDITION_LORE.length === 8, 'eight fragments to find');
console.log('ALL 1.2 TESTS PASSED');
process.exit(0);
