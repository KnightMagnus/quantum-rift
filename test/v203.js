import { seedCargo } from './helpers/cargo-fixture.js';
import { tempDataDir } from './helpers/temp-data.js';
// 2.0.3 tests: newcomer protection in inner space, calmer raider spawns, and gameplay edge cases.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS, STELLARS, SYSTEMS, TRAFFIC } from '../shared/galaxy.ts';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
process.env.SEEDS_FILE = '/nonexistent';
const g = new Game(A, new DB(tempDataDir('rift-v203-')));
g.features.fronts.event = () => null;
g.features.fronts.anomalies = () => ({}); // 2.6: traffic counts must not depend on the weekday's event (Bounty Week brings 50% more raiders)
let ipn = 1;
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  const out = [];
  sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  g.connect(sock, '9.9.9.' + ipn++);
  const send = (m) => sock.emit('message', JSON.stringify(m));
  send({ t: 'hello', name, pass: 'secret' });
  const s = [...g.sessions.values()].pop();
  return {
    s,
    d: s.data,
    out,
    send,
    toasts: () => out.filter((m) => m.t === 'toast').map((m) => m.msg),
  };
}
function arrive(P, sysId) {
  // jump a captain into a system the normal way
  const { s, d } = P;
  if (s.ent) {
    const sp = g.spaces[d.sys];
    g.dropEscorts(sp, s.ent);
    sp.remove(s.ent);
    sp.players--;
    s.ent = null;
  }
  const from = SYS[sysId].links[0];
  d.sys = from;
  d.stellar = null;
  g.spawnPlayer(s, 0, 0, 0, 0);
  const e = s.ent;
  e.fuel = 1000;
  e.jumpTo = sysId;
  e.jumpCost = 0;
  g.finishJump(e, g.spaces[from]);
  return s.ent;
}
function survive(P, sysId, secs = 20) {
  const sp = g.spaces[sysId];
  const _e = (s) => s;
  for (let t = 0; t < 30 * secs && P.s.ent; t++) sp.tick();
  return P.s.ent;
}

// ---- newcomer protection
const N = fake('Fresh One');
ok(
  N.toasts().some((t) => t.includes('Newcomer protection')),
  'new captains are told about newcomer protection',
);
ok(
  N.out.filter((m) => m.t === 'you').pop().d.newcomer === true,
  'and the HUD knows they are protected',
);
let lost = 0;
for (let i = 0; i < 8; i++) {
  arrive(N, 'farmouth');
  if (!survive(N, 'farmouth')) lost++;
}
ok(
  lost === 0,
  `a fresh Gnat survives eight arrivals in Far Mouth, where 2.0.2 lost 11 of 12 (${lost} lost)`,
);
const sp = g.spaces.farmouth,
  me = arrive(N, 'farmouth');
const pir = sp.makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: me.x + 300,
  y: me.y,
  a: 0,
  ai: 'raid',
});
ok(sp.spared(pir, me), 'a pirate next to a newly arrived captain leaves them alone');
me.graceT = 0;
ok(
  sp.spared(pir, me) && sp.findTarget(pir, 2200) !== me,
  'protected captains are never picked as targets in inner space',
);
pir.aggro.add(me.id);
ok(!sp.spared(pir, me), 'shooting first ends the truce for that fight');
sp.remove(pir);
const tgt = sp.makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: me.x + 300,
  y: me.y,
  a: 0,
  ai: 'raid',
  mission: { id: 'x', owner: N.s.id },
});
ok(!sp.spared(tgt, me), "a job's own target still fights");
sp.remove(tgt);
const lawless = SYSTEMS.find((x) => x.danger >= 3 && x.faction === 'frontier').id;
const me2 = arrive(N, lawless);
me2.graceT = 0;
const p2 = g.spaces[lawless].makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: me2.x + 300,
  y: me2.y,
  a: 0,
  ai: 'raid',
});
ok(g.spaces[lawless].spared(p2, me2), 'main-map lawless space now has newcomer targeting truce');
ok(
  !N.toasts().some((t) => t.includes('does not reach')),
  'main-map lawless entry no longer gives an inaccurate protection warning',
);
const p3 = g.spaces[lawless].makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: me2.x + 300,
  y: me2.y,
  a: 0,
  ai: 'raid',
});
me2.graceT = g.spaces[lawless].t + 6;
ok(
  g.spaces[lawless].spared(p3, me2),
  'everyone gets a few seconds of grace after a jump, even in lawless space',
);
N.d.station.ops = 3;
me.graceT = 0;
ok(!g.newcomer(N.d), 'protection ends at Ops 3');
// calmer inner space: no destroyers and no pile-up of raiders
const cal = g.spaces.farmouth;
cal.players++;
for (let i = 0; i < 30 * 600; i++) cal.tick();
cal.players--;
const raids = [...cal.ships.values()].filter((e) => e.ai === 'raid' && !e.owner && !e.mission);
ok(
  raids.length <= 2,
  `raider groups don't pile up in inner space (${raids.length} after ten minutes)`,
);
ok(
  ![...cal.ships.values()].some(
    (e) =>
      e.faction === 'hollow' &&
      e.hull === [...TRAFFIC.hollow.war].sort((a, b) => A.ships[b].cost - A.ships[a].cost)[0],
  ),
  'and the heaviest raider hull stays out of inner space',
);

// ---- gameplay edge cases
const P = fake('Bug Hunter'),
  d = P.d;
const land = (id) => {
  if (P.s.ent) {
    const sp = g.spaces[d.sys];
    g.dropEscorts(sp, P.s.ent);
    sp.remove(P.s.ent);
    sp.players--;
    P.s.ent = null;
  }
  d.stellar = id;
  d.sys = STELLARS[id].system;
};
land('qstation');
d.ship = (await import('../shared/rules.ts')).makeLoadout(A, 704, 'Hauler');
// Mission offers depend on the ten-minute wall-clock window, not just test RNG.
const realNow = Date.now;
Date.now = () => 1792339200000;
const job = g
  .offers(STELLARS.qstation, d)
  .find((o) => o.type === 'cargo' && o.qty < g.features.shipStats.stats(d).cargo);
P.send({ t: 'accept', id: job.id });
Date.now = realNow;
const cid = g.market(STELLARS.qstation)[0].id;
P.send({ t: 'trade', cid, qty: 99 });
ok(
  d.missions.length === 1 && (d.cargo[cid] || 0) + job.qty <= g.features.shipStats.stats(d).cargo,
  'job cargo takes up hold space when buying goods',
);
ok(P.out.filter((m) => m.t === 'you').pop().d.jobCargo === job.qty, 'and the HUD is told about it');
seedCargo(d, {});
d.missions = [];
const noO = Object.values(STELLARS).find(
  (p) => p.svc.includes('L') && !p.svc.includes('O') && !p.site,
);
land(noO.id);
const oid = Object.keys(d.ship.outfits)[0],
  had = d.ship.outfits[oid];
P.send({ t: 'outfit', id: +oid, n: -1 });
ok(d.ship.outfits[oid] === had, 'outfits can only be sold where there is an outfitter');
P.send({ t: 'rename', name: '  <>  ' });
ok(d.ship.name === A.ships[d.ship.hull].name, 'a blank ship name falls back to the hull name');
land('qstation');
g.features.docks.docksInit(d);
for (const h of [703, 704]) {
  const ship = (await import('../shared/rules.ts')).makeLoadout(A, h, 'W' + h);
  ship.uid = g.features.docks.shipUid(d);
  d.dock.push({ ship, bridge: {} });
  d.docks[d.activeDock].wings.push({ uid: ship.uid });
}
P.send({ t: 'depart' });
const sp3 = g.spaces[d.sys],
  eid = P.s.ent.id;
ok([...sp3.ships.values()].filter((x) => x.owner === eid).length === 2, 'escorts launch with you');
sp3.remove(P.s.ent);
g.onPlayerDeath(P.s.ent.player, sp3, null);
ok(
  ![...sp3.ships.values()].some((x) => x.owner === eid),
  'escorts no longer linger after you are destroyed',
);
// abandon removes bounty target
d.missions = [];
let b = null;
for (const p of Object.values(STELLARS).filter((x) => x.svc.includes('B') && !x.site)) {
  b = g.offers(p, d).find((o) => o.type === 'bounty');
  if (b) {
    land(p.id);
    break;
  }
} // job boards reroll every ten minutes
P.send({ t: 'accept', id: b.id });
land(SYS[b.sys].stellars.find((p) => p.svc.includes('L')).id);
P.send({ t: 'depart' });
const bsp = g.spaces[b.sys],
  bt = [...bsp.ships.values()].find((x) => x.mission && x.mission.id === b.id);
ok(bt, 'the bounty target appears');
P.send({ t: 'abandon', id: b.id });
for (let i = 0; i < 30 * 30; i++) bsp.tick();
ok(!bt.mission && (bt.dead || bt.ai === 'leave'), 'abandoning the bounty sends its target away');
// drydock: Tender name no longer deletes, ship swaps check job cargo
const site = Object.values(STELLARS).find((p) => p.site && !g.siteOwner(p.id));
land(site.id);
P.send({ t: 'station', op: 'claim' });
d.credits = 1e6;
d.station.ops = 3;
d.dock = [];
d.docks = null;
g.features.docks.docksInit(d);
d.ship.name = 'Tender';
seedCargo(d, {});
P.send({ t: 'dock', op: 'store' });
ok(d.shipless && d.dock.length === 1, 'store the ship named Tender');
d.dock.push({
  ship: { ...d.dock[0].ship, name: 'Second', uid: g.features.docks.shipUid(d) },
  bridge: {},
});
P.send({ t: 'dock', op: 'store', i: 1 });
ok(
  d.ship.name === 'Second' && d.dock.some((x) => x.ship.name === 'Tender'),
  'a ship named Tender survives a drydock swap',
);
P.send({ t: 'dock', op: 'store', i: 0 });
ok(
  d.dock.some((x) => x.ship.name === 'Second'),
  'swapping back stores the other ship',
);
d.missions = [
  {
    id: 'jc',
    type: 'cargo',
    qty: 999,
    dest: 'qstation',
    sys: STELLARS.qstation.system,
    title: 'heavy',
  },
];
P.send({ t: 'dock', op: 'store', i: 0 });
ok(
  d.ship.name === 'Tender' && P.toasts().pop().includes("can't hold"),
  'a drydock swap checks your job cargo fits',
);
d.missions = [];
const before = d.credits,
  sx = d.dock[0],
  O = g.O,
  stockValue = Math.round(A.ships[sx.ship.hull].cost * 0.5);
ok(
  g.features.hangar.storedValue(sx) === stockValue,
  'stored factory equipment is already included in half the hull purchase price',
);
// A separately purchased upgrade still contributes its own half-retail resale value.
const upgrade = Object.values(O).find((o) => o.eff.shield && !sx.ship.outfits[o.id]);
sx.ship.outfits[upgrade.id] = 1;
const want = Math.round(A.ships[sx.ship.hull].cost * 0.5 + upgrade.cost * 0.5);
P.send({ t: 'dock', op: 'sell', i: 0 });
ok(
  d.credits - before === want && want > stockValue,
  'stored ships sell for half the inclusive hull price plus half separately purchased outfits',
);
// lower deck
d.lower = ['medic'];
P.send({
  t: 'lower',
  op: 'hire',
  kind: Object.keys((await import('../shared/syndicate.ts')).LOWER_DECK).find((k) => k !== 'medic'),
  i: 0,
});
ok(d.lower[0] === 'medic', 'hiring into a filled lower-deck berth is refused');
// save import ignores __proto__
const sv = JSON.parse(JSON.stringify(g.db.get('Bug Hunter')));
delete sv.salt;
delete sv.hash;
sv.name = 'Proto Test';
// Isolate key filtering: a renamed save cannot take the original captain's station.
sv.station = g.fresh().station;
const evil = JSON.parse(JSON.stringify(sv).replace(/^\{/, '{"__proto__":{"polluted":1},'));
g.importSave(evil);
ok(
  Object.getPrototypeOf(g.db.get('Proto Test')) === Object.prototype &&
    !g.db.get('Proto Test').polluted,
  'save imports copy only plain keys',
);
// unique bounty names
let dup = false;
for (const p of Object.values(STELLARS)
  .filter((x) => x.svc.includes('B'))
  .slice(0, 60)) {
  const ns = g
    .offers(p, d)
    .filter((o) => o.type === 'bounty' && !o.elite && !o.syn)
    .map((o) => o.targetName);
  if (new Set(ns).size !== ns.length) dup = true;
}
ok(!dup, 'one job board never offers two bounties on the same name');
// solo pause stops rush deadlines and loans
g.solo = true;
d.missions = [
  {
    id: 'r1',
    type: 'cargo',
    qty: 1,
    deadline: Date.now() + 60000,
    title: 'rush',
    dest: 'qstation',
    sys: 'quantum-gate',
  },
];
d.loan = { bal: 1000, next: Date.now() + 60000 };
const dl = d.missions[0].deadline,
  ln = d.loan.next;
g.setPaused(true);
g.pausedAt -= 30000;
g.setPaused(false);
ok(
  d.missions[0].deadline - dl >= 30000 && d.loan.next - ln >= 30000,
  'pausing a solo game stops the clock on rush deadlines and loan payments',
);
g.solo = false;
d.missions = [];
d.loan = null;
// rivals flying with you are released, not deleted, when you land
land('qstation');
P.send({ t: 'depart' });
const qs = g.spaces[d.sys],
  pe = P.s.ent;
const riv = qs.makeShip({
  hull: 703,
  faction: 'spacer',
  x: pe.x + 100,
  y: pe.y,
  a: 0,
  ai: 'escort',
  owner: pe.id,
});
riv.rival = 'test';
riv.rivalAi = 'patrol';
g.land(P.s, 'qstation');
ok(
  qs.ships.has(riv.id) && !riv.owner && riv.ai === 'patrol',
  'a rival flying alongside goes back to their own business when you land',
);
console.log('ALL 2.0.3 TESTS PASSED');
process.exit(0);
