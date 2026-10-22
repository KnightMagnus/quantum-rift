import { tempDataDir } from './helpers/temp-data.js';
// 0.6 tests: Umbral hostility fix, the Armada (2.6: replaced fleets; territory removed), invasions, anomalies, events, goals,
// faction stores and the new job types.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS, STELLARS, SYSTEMS, FACTIONS } from '../shared/galaxy.ts';
import { anomaliesAt, eventAt, eventCalendar, SCAN } from '../shared/fronts.ts';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v06-')));
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
  game.connect(sock, '7.7.7.' + ip++);
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

// Umbral fix
const a = fake('Fleet Admiral'),
  b = fake('Wing Two'),
  da = a.s.data,
  db_ = b.s.data;
da.credits = db_.credits = 5e7;
const umSys = SYSTEMS.find((s) => s.faction === 'umbral');
const ea = toSpace(a, umSys.id),
  sp0 = game.spaces[umSys.id];
const um = sp0.makeShip({ hull: 761, faction: 'umbral', x: 300, y: 0, ai: 'raid' });
ok(sp0.isHostile(um, ea), 'Umbral ships now attack captains on sight (they were peaceful before)');
const cr0 = da.credits,
  rep0 = da.rep.umbral;
sp0.kill(um, ea);
ok(
  da.credits > cr0 && da.rep.umbral === rep0,
  'destroying Umbral pays a bounty and costs no standing',
);
// 2.6: the Armada replaces fleets (the full co-op suite is test/v26.js)
const fr = SYSTEMS.find(
  (s) => s.faction === 'frontier' && s.stellars.some((p) => p.svc.includes('T')),
);
toSpace(a, 'qgate');
toSpace(b, 'qgate');
a.send({ t: 'armada', op: 'form', name: 'Expanse Wardens' });
const AR = game.features.coop.armadaOf(da);
ok(AR && AR.name === 'Expanse Wardens', 'formed an Armada');
a.send({ t: 'armada', op: 'invite', name: 'Wing Two' });
b.send({ t: 'armada', op: 'accept', id: AR.id });
ok(
  db_.armada === AR.id && AR.members.length === 2,
  'a captain in the same system joined by invite',
);
const c = fake('Outsider');
a.send({ t: 'chat', msg: 'form up', ch: 'armada' });
ok(
  b.all('chat').some((m) => m.msg === 'form up' && m.ch === 'armada') &&
    !c.all('chat').some((m) => m.msg === 'form up'),
  'Armada chat reaches only members',
);
const pvp = SYSTEMS.find((s) => s.danger >= 3 && s.faction === 'frontier');
const e1 = toSpace(a, pvp.id, 0, 0),
  e2 = toSpace(b, pvp.id, 50, 0),
  e3 = toSpace(c, pvp.id, 100, 0),
  spP = game.spaces[pvp.id];
ok(
  !spP.isHostile(e1, e2) && !spP.isHostile(e1, e3),
  'Armada members never fight, and there is no open-galaxy PvP even in lawless space',
);
const crB = db_.credits,
  pir = spP.makeShip({ hull: 711, faction: 'hollow', x: 20, y: 20 });
spP.kill(pir, e1);
ok(db_.credits > crB, 'Armada members in the same system share bounties');
// invasion
const invSys = SYSTEMS.find(
  (s) => s.danger >= 2 && s.faction !== 'quantum' && s.stellars.length && s.id !== fr.id,
);
const boss = game.features.fronts.startInvasion(1, invSys.id);
ok(
  boss && game.invasion && game.live[invSys.id].keep,
  `the ${game.invasion.boss.name} invades ${invSys.name}`,
);
ok(
  a.all('chat').some((m) => /INVASION/.test(m.msg)) && a.last('world').invasion.sys === invSys.id,
  'the invasion is announced and shown on the map',
);
const ia = toSpace(a, invSys.id, boss.x + 200, boss.y),
  ib = toSpace(b, invSys.id, boss.x - 200, boss.y),
  spI = game.spaces[invSys.id];
ok(spI.isHostile(boss, ia), 'the boss attacks every captain');
const c1 = da.credits,
  c2 = db_.credits;
spI.damage(boss, 3000, 3000, ia);
spI.damage(boss, 1000, 1000, ib);
boss.shield = 0;
boss.armor = 1;
spI.damage(boss, 10, 10, ia);
ok(
  !game.invasion && da.credits - c1 > db_.credits - c2 && db_.credits > c2,
  'killing the boss pays everyone by damage share',
);
// anomalies and events
const an = anomaliesAt(SYSTEMS);
ok(
  Object.keys(an).length === 9 && JSON.stringify(anomaliesAt(SYSTEMS)) === JSON.stringify(an),
  'nine anomalies, the same for everyone in a 6-hour window',
);
const shearSys = Object.entries(an).find(([, k]) => k === 'shear');
if (shearSys)
  ok(game.features.fronts.mods(shearSys[0]).jumpFuel === 2, 'gravity shear doubles jump fuel');
ok(eventAt() && eventCalendar().length === 7, `server event now: ${eventAt().name}`);
// goals
const G0 = game.features.fronts.goalsFor(da);
ok(G0.daily.length === 3 && G0.weekly.length === 3, 'three daily and three weekly goals');
G0.daily[0].got = G0.daily[0].n;
const c3 = da.credits;
a.send({ t: 'goal', period: 'daily', i: 0 });
ok(
  da.credits > c3 && G0.daily[0].claimed && da.tokens.any >= 2,
  'claimed a daily goal: credits and Rift scrip',
);
const gj = G0.weekly.find((g) => g.type === 'jumps') || G0.daily.find((g) => g.type === 'jumps');
if (gj) {
  const n0 = gj.got;
  game.features.fronts.goal(a.s, 'jumps');
  ok(gj.got === n0 + 1, 'jumps count toward goals');
}
// stores
const kw = STELLARS['meridian-yards'];
da.sys = 'meridian';
if (a.s.ent) {
  game.spaces[invSys.id].remove(a.s.ent);
  game.spaces[invSys.id].players--;
  a.s.ent = null;
}
da.stellar = kw.id;
ok(game.features.fronts.storeFor(kw) === 'quantum', 'Concord worlds run a Concord store');
da.tokens = { quantum: 3, any: 20 };
da.rep.quantum = 35;
const al = da.mats.alloy[2];
a.send({ t: 'store', id: 'crate3' });
ok(
  da.mats.alloy[2] === al + 1 && da.tokens.quantum === 0 && da.tokens.any === 9,
  'bought a grade III crate with tokens topped up by scrip',
);
a.send({ t: 'store', id: 'epic' });
ok(!da.officers.some((o) => o.rarity === 3), 'Epic contracts need Exalted standing');
// jobs
const offers = SYSTEMS.flatMap((s) =>
  s.stellars.filter((p) => p.svc.includes('B') && !p.site).slice(0, 1),
)
  .slice(0, 25)
  .flatMap((p) => game.offers(STELLARS[p.id], da));
const kinds = new Set(offers.map((o) => o.type));
ok(
  ['convoy', 'smuggle', 'rescue', 'survey', 'assassinate'].every((k) => kinds.has(k)),
  `job boards post the new jobs: ${[...kinds].join(', ')}`,
);
ok(
  offers.some((o) => o.chain),
  'faction commissions (job chains) are offered',
);
// convoy: accept, arrive, the freighter lands
const cv = offers.find((o) => o.type === 'convoy');
da.missions = [{ ...cv, owner: a.s.id }];
toSpace(a, cv.sys, 0, 0);
const spC = game.spaces[cv.sys],
  conv = [...spC.ships.values()].find((e) => e.convoyOf);
ok(conv && conv.name === cv.convoyName, `the convoy ${cv.convoyName} joins you on arrival`);
const dest = STELLARS[cv.dest];
conv.x = dest.x;
conv.y = dest.y;
conv.vx = conv.vy = 0;
for (let i = 0; i < 40; i++) spC.tick();
ok(da.missions[0].done, 'the convoy landed: job done');
const cv2 = offers.filter((o) => o.type === 'convoy')[1] || cv;
da.missions = [{ ...cv2, id: 'cv2', owner: a.s.id, spawned: false }];
toSpace(a, cv2.sys, 0, 0);
const conv2 = [...game.spaces[cv2.sys].ships.values()].find(
  (e) => e.convoyOf && e.convoyOf.id === 'cv2',
);
game.spaces[cv2.sys].kill(conv2, null);
ok(!da.missions.length, 'a destroyed convoy fails the job');
// rescue
const rs = offers.find((o) => o.type === 'rescue');
da.missions = [{ ...rs, owner: a.s.id }];
const er = toSpace(a, rs.sys, 0, 0),
  spR = game.spaces[rs.sys],
  wreck = [...spR.ships.values()].find((e) => e.rescueOf);
ok(wreck && wreck.disabled, 'the stranded ship is waiting, disabled');
er.x = wreck.x + 30;
er.y = wreck.y;
er.vx = wreck.vx;
er.vy = wreck.vy;
a.send({ t: 'board', id: wreck.id, act: 'rescue' });
ok(da.missions[0].done, 'boarding and rescuing completes the job');
// survey
const sv = offers.find((o) => o.type === 'survey' && !o.chain);
da.missions = [{ ...sv, owner: a.s.id }];
const es = toSpace(a, sv.sys, 0, 0);
for (const p of sv.points) {
  es.x = p[0];
  es.y = p[1];
  game.features.fronts.missionIdle(a.s);
}
ok(da.missions[0].done, 'flew over every survey point');
const land = SYS[sv.sys].stellars.find((p) => p.svc.includes('L')) || STELLARS['meridian-yards'];
const c5 = da.credits;
game.completeOnLanding(a.s, STELLARS[land.id]);
ok(da.credits > c5 && !da.missions.length, 'paid on landing, with faction tokens');
// smuggling scan
const sm = offers.find((o) => o.type === 'smuggle');
da.missions = [{ ...sm, owner: a.s.id }];
const lawSys = SYSTEMS.find(
  (s) =>
    !FACTIONS[s.faction].region &&
    !FACTIONS[s.faction].pirate &&
    s.danger <= 2 &&
    s.faction !== 'umbral',
);
const _em = toSpace(a, lawSys.id, 0, 0),
  _cop = game.spaces[lawSys.id].makeShip({
    hull: 711,
    faction: lawSys.faction,
    x: 60,
    y: 0,
    ai: 'patrol',
  });
SCAN.chance = 1;
const rp = da.rep[lawSys.faction];
game.features.fronts.missionIdle(a.s);
ok(
  !da.missions.length && da.rep[lawSys.faction] === rp - 5,
  'a patrol scan catches smugglers: fined, cargo seized, standing lost',
);
// chain
const ch = offers.find((o) => o.chain);
da.missions = [{ ...ch, owner: a.s.id, done: true }];
da.chains = {};
game.completeOnLanding(a.s, STELLARS['meridian-yards']);
ok(da.chains[ch.chain.fac] === 1, 'finishing a commission step unlocks the next');
console.log('ALL 0.6 TESTS PASSED');
process.exit(0);
