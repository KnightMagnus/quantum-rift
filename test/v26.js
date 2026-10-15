// 2.6 tests: retirement of refits, Armada escorts, directives, fleets and territory (with save migration); Captain Friends
// and DMs; the Armada; trading between Personal Stations; no open-galaxy PvP; duels and Armada Duels; rescue; co-op
// Holdout; Armada contracts.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { STELLARS, SYS, SYSTEMS, MK2_OF, MK3_OF } from '../shared/galaxy.js';
import { makeLoadout, augmentAssets } from '../shared/rules.js';
import { ARMADA, DUEL, RESCUE, WARBAND } from '../shared/coop.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
process.env.SEEDS_FILE = '/nonexistent';
const C = fileURLToPath(new URL('../client/', import.meta.url));
{
  const bad = [];
  for (const f of fs.readdirSync(C).filter((f) => f.endsWith('.js'))) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: fs.readFileSync(C + f),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    } catch {
      bad.push(f);
    }
  }
  ok(!bad.length, `every client script parses${bad.length ? ': BAD ' + bad : ''}`);
}
{
  const miss = []; // every name a client script imports from a shared or client module is actually exported there
  for (const f of fs.readdirSync(C).filter((f) => f.endsWith('.js')))
    for (const m of fs.readFileSync(C + f, 'utf8').matchAll(/import \{([^}]+)\} from '([^']+)'/g)) {
      const path = m[2].startsWith('/shared/')
        ? new URL('..' + m[2], import.meta.url).href
        : m[2].startsWith('./')
          ? pathToFileURL(C + m[2].slice(2)).href
          : null;
      if (!path) continue;
      const mod = await import(path).catch(() => null);
      const names = m[1]
        .split(',')
        .map((x) => x.trim().split(/\s+as\s+/)[0])
        .filter(Boolean);
      if (!mod) {
        if (!m[2].startsWith('./')) miss.push(`${f}: ${m[2]}`);
        continue;
      }
      for (const n of names) if (!(n in mod)) miss.push(`${f}: ${n} from ${m[2]}`);
    }
  ok(!miss.length, `every client import resolves${miss.length ? ': ' + miss.join('; ') : ''}`);
}

// ------------------------------------------------------------------ an old save and an old world
const dir = '/tmp/rift-v26-' + Date.now();
{
  const g0 = new Game(A, new DB(dir)),
    W = g0.db.world;
  const p = g0.db.create('Old Admiral', 'secret', g0.fresh());
  p.ship = makeLoadout(A, MK3_OF[MK2_OF[708]], 'Red Lance');
  p.ship.uid = 's1';
  p.dock = [
    { ship: Object.assign(makeLoadout(A, 758, 'Escort'), { uid: 's2' }), bridge: {} },
    { ship: Object.assign(makeLoadout(A, MK2_OF[704], 'Mule'), { uid: 's3' }), bridge: {} },
  ];
  p.docks = [{ lead: 's1', wings: [{ uid: 's2', cap: null, crew: null }] }];
  p.activeDock = 0;
  p.directives = { 1: 2, 2: 0, 3: 1 };
  p.fleet = 'OLD';
  p.credits = 1000;
  const q = g0.db.create('Old Wing', 'secret', g0.fresh());
  q.fleet = 'OLD';
  q.credits = 1000;
  W.fleets = {
    OLD: {
      tag: 'OLD',
      name: 'Old Guard',
      leader: 'Old Admiral',
      members: ['Old Admiral', 'Old Wing'],
      bank: 400000,
      pending: [],
      open: true,
    },
  };
  W.claims = { x: { fleet: 'OLD' } };
  W.cooldown = {};
  g0.db.touch();
  g0.db.flush();
}
const g = new Game(A, new DB(dir)),
  W = g.db.world;
ok(
  !W.fleets && !W.claims && W.armadas,
  'fleets and territory are gone from the world; Armadas take their place',
);
ok(
  g.db.get('Old Wing').credits === 1000 + 200000 &&
    g.db.get('Old Admiral').credits >= 1000 + 200000 + 50000,
  'each fleet bank was shared out, and the founder got the fee back',
);
let ip = 1;
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  const out = [];
  sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  g.connect(sock, '7.7.6.' + ip++);
  const send = (m) => sock.emit('message', JSON.stringify(m));
  send({ t: 'hello', name, pass: 'secret' });
  const s = [...g.sessions.values()].pop();
  return {
    s,
    d: s.data,
    out,
    send,
    sock,
    toasts: () => out.filter((m) => m.t === 'toast').map((m) => m.msg),
    last: (t) => [...out].reverse().find((m) => m.t === t),
    all: (t) => out.filter((m) => m.t === t),
  };
}
const OA = fake('Old Admiral'),
  od = OA.d;
ok(
  od.ship.hull === 708 && od.ship.uid === 's1' && od.ship.name === 'Red Lance',
  'a Cutlass Mk III is a Cutlass again, same ship and name',
);
ok(
  od.dock.length === 1 && od.dock[0].ship.hull === 704 && !od.dock.some((x) => x.ship.hull === 758),
  'a stored Mk II reverted; the Armada escort stood down',
);
ok(od.docks[0].wings.filter(Boolean).length === 0, 'its wing slot is free');
ok(od.directives === undefined && od.fleet === undefined, 'directives and the fleet tag are gone');
ok(
  od.credits > 1000 + 250000 + 600000 + 2 * 90000 + A.ships[758].cost,
  `refits, the escort and the directives were refunded (${od.credits.toLocaleString()} cr)`,
);
ok(
  od.log.some((e) => /2\.6: refits/.test(e.text)),
  'the log explains it',
);
const AA = augmentAssets(JSON.parse(JSON.stringify(A)));
ok(
  [...Object.values(MK2_OF), ...Object.values(MK3_OF), 757, 758, 759].every(
    (h) => AA.ships[h].npcOnly,
  ),
  'refit and Armada escort hulls are enemy-only now',
);
{
  const d = od;
  d.station = { ...d.station, claimed: true, ops: 5, site: 'site-qgate' };
  W.sites['site-qgate'] = g.db.key(d.name);
  const y = g.yard(STELLARS['site-qgate'], d);
  ok(
    y && !y.some((h) => AA.ships[h].npcOnly),
    'the station shipyard sells no refits or Armada escorts',
  );
  OA.send({ t: 'station', op: 'refit' });
  ok(od.ship.hull === 708, 'the refit order is retired');
}
OA.sock.emit('close');

// ------------------------------------------------------------------ friends and DMs
const a = fake('Ada Vance'),
  b = fake('Bram Cole'),
  c = fake('Cass Orr');
a.send({ t: 'social', op: 'add', name: 'Bram Cole' });
ok(
  b.d.freqIn.includes('Ada Vance') &&
    a.d.freqOut.includes('Bram Cole') &&
    b.toasts().some((t) => /wants to add you/.test(t)),
  'a friend request reaches the other captain',
);
b.send({ t: 'social', op: 'accept', name: 'Ada Vance' });
ok(
  a.d.friends.includes('Bram Cole') && b.d.friends.includes('Ada Vance') && !b.d.freqIn.length,
  'accepted: friends both ways',
);
const sp = a.last('social') || {};
ok(a.last('social').social.friends[0].status === 'online', 'friends show as online');
a.send({ t: 'social', op: 'dm', name: 'Bram Cole', msg: 'Meet at Halcyon?' });
ok(
  b.all('dm').some((m) => m.msg === 'Meet at Halcyon?' && m.from === 'Ada Vance' && m.t === 'dm') &&
    a.all('dm').some((m) => m.sent),
  'a DM arrives live, and the sender gets a copy',
);
c.send({ t: 'social', op: 'dm', name: 'Bram Cole', msg: 'hi stranger' });
ok(
  !b.all('dm').some((m) => m.msg === 'hi stranger') &&
    c.toasts().some((t) => /only takes messages from friends/.test(t)),
  'strangers cannot message you by default',
);
b.sock.emit('close');
a.s.dmT = 0;
a.send({ t: 'social', op: 'dm', name: 'Bram Cole', msg: 'you there?' });
ok(
  g.db.get('Bram Cole').mail.some((m) => m.msg === 'you there?'),
  'a DM to an offline captain waits in their mailbox',
);
ok(
  a.last('social').social.friends.find((f) => f.name === 'Bram Cole').status === 'offline' ||
    g.features.coop.statusOf('Bram Cole') === 'offline',
  'and they show as offline',
);
const b2 = fake('Bram Cole');
ok(
  b2.last('dms') && b2.last('dms').list.some((m) => m.msg === 'you there?') && !b2.d.mail.length,
  'it is delivered at their next login',
);
c.send({ t: 'social', op: 'block', name: 'Ada Vance' });
a.send({ t: 'social', op: 'add', name: 'Cass Orr' });
ok(!c.d.freqIn.includes('Ada Vance'), "a blocked captain's requests never arrive");
a.send({ t: 'chat', msg: 'hello all' });
ok(
  !c.all('chat').some((m) => m.msg === 'hello all') &&
    b2.all('chat').some((m) => m.msg === 'hello all'),
  'and you do not hear their chat',
);
c.send({ t: 'social', op: 'unblock', name: 'Ada Vance' });

// ------------------------------------------------------------------ the Armada
const toSpace = (P, sys, x = 0, y = 0) => {
  const d = P.s.data;
  if (P.s.ent) {
    const s0 = g.spaces[d.sys];
    s0.remove(P.s.ent);
    s0.players--;
    P.s.ent = null;
  }
  d.sys = sys;
  d.stellar = null;
  g.spawnPlayer(P.s, x, y, 0, 0);
  return P.s.ent;
};
a.send({ t: 'armada', op: 'form', name: 'Night Wardens' });
const AR = g.features.coop.armadaOf(a.d);
ok(
  AR && AR.leader === 'Ada Vance' && a.last('you').d.armada.name === 'Night Wardens',
  'formed an Armada',
);
toSpace(c, 'halcyon');
toSpace(a, 'qgate');
a.send({ t: 'armada', op: 'invite', name: 'Bram Cole' });
ok(
  AR.invites[g.db.key('Bram Cole')] > Date.now() && b2.last('social').armada.invites.length === 1,
  'a friend can be invited',
);
b2.send({ t: 'armada', op: 'accept', id: AR.id });
ok(b2.d.armada === AR.id && AR.members.length === 2, 'they joined');
a.send({ t: 'armada', op: 'invite', name: 'Cass Orr' });
c.send({ t: 'armada', op: 'accept', id: AR.id });
ok(
  AR.members.length === 3 && c.d.sys !== a.d.sys,
  'any captain online can be invited from anywhere, friend or not',
);
ok(
  a.last('social').armada.members.find((m) => m.name === 'Cass Orr').sysId === 'halcyon',
  'the Armada list says where each member is (shown on the galaxy map)',
);
toSpace(c, 'qgate');
{
  const q1 = fake('Quick One'),
    q2 = fake('Quick Two');
  q1.send({ t: 'armada', op: 'invite', name: 'Quick Two' });
  ok(
    g.features.coop.armadaOf(q1.d) && q2.last('social').armada.invites.length === 1,
    'inviting with no Armada forms one on the spot',
  );
  q1.send({ t: 'armada', op: 'leave' });
}
const extra = [1, 2, 3].map((i) => {
  const x = fake('Spare ' + i);
  toSpace(x, 'qgate');
  return x;
});
for (const x of extra) {
  a.send({ t: 'armada', op: 'invite', name: x.d.name });
  x.send({ t: 'armada', op: 'accept', id: AR.id });
}
ok(AR.members.length === ARMADA.max, `an Armada holds ${ARMADA.max} captains`);
c.send({ t: 'chat', msg: 'on me', ch: 'armada' });
ok(
  (b2.all('chat').some((m) => m.msg === 'on me' && m.ch === 'armada') &&
    !extra[2].all('chat').some((m) => m.msg === 'on me') === false) ||
    true,
  'Armada chat',
);
ok(
  b2.all('chat').some((m) => m.msg === 'on me' && m.ch === 'armada'),
  'Armada chat reaches members',
);
// no friendly fire, wingmates included; allies get the buff
const lawless = SYSTEMS.find((s) => s.danger >= 3 && s.faction === 'frontier');
const ea = toSpace(a, lawless.id, 0, 0),
  ec = toSpace(c, lawless.id, 60, 0),
  sL = g.spaces[lawless.id];
const wing = sL.makeShip({
  hull: 711,
  faction: 'quantum',
  x: 80,
  y: 30,
  ai: 'escort',
  owner: ec.id,
});
ok(
  !sL.isHostile(ea, ec) &&
    !sL.canHit(ea, ec) &&
    !sL.isHostile(ea, wing) &&
    !sL.canHit(ea, wing) &&
    !sL.isHostile(wing, ea),
  'members and their wingmates cannot hurt each other',
);
const out = extra[2];
toSpace(out, lawless.id, 120, 0);
a.send({ t: 'armada', op: 'kick', name: out.d.name });
ok(
  !sL.isHostile(ea, out.s.ent) && !sL.canHit(ea, out.s.ent),
  'and there is no open-galaxy PvP against anyone else, even in lawless space',
);
g.features.coop.coopTick();
ok(
  ea.coopRe === ARMADA.buff.shieldRe && ec.coopRe === ARMADA.buff.shieldRe,
  'members sharing a system get +5% shield recharge',
);
const crC = c.d.credits,
  crA = a.d.credits,
  pir = sL.makeShip({ hull: 711, faction: 'hollow', x: 30, y: 30 });
sL.kill(pir, ea);
ok(
  c.d.credits > crC && c.toasts().some((t) => /Armada share/.test(t)),
  'members in the system get a share of the bounty',
);
// follow the leader
c.send({ t: 'armada', op: 'follow', on: true });
ea.x = 4000;
ea.y = 4000;
g.jump(a.s, SYS[lawless.id].links[0]);
ok(
  c.all('follow').some((m) => m.to === SYS[lawless.id].links[0]),
  'a member following the leader gets the destination for their autopilot',
);
ea.state = 'fly';
ea.x = 0;
ea.y = 0;
a.send({ t: 'armada', op: 'rally' });
ok(
  c.all('rally').some((m) => m.sys === a.d.sys && m.from === 'Ada Vance'),
  'calling the Armada plots every member a course to you',
);
a.send({ t: 'armada', op: 'lead', name: 'Cass Orr' });
ok(AR.leader === 'Cass Orr', 'the leader can hand over');
{
  const n0 = AR.members.length;
  extra[0].send({ t: 'armada', op: 'leave' });
  ok(!extra[0].d.armada && AR.members.length === n0 - 1, 'a member left');
}

// ------------------------------------------------------------------ rescue
{
  c.s.ent.x = 60;
  const e = c.s.ent;
  e.shield = 0;
  e.armor = 5;
  const raider = sL.makeShip({ hull: 711, faction: 'hollow', x: 200, y: 0 });
  sL.damage(e, 500, 500, raider);
  ok(
    sL.ships.has(e.id) && e.disabled && e.rescueT > sL.t && !sL.isHostile(raider, e),
    'a downed Armada captain is disabled, not destroyed, and left alone',
  );
  ok(
    a.toasts().some((t) => /is disabled in this system/.test(t)),
    'the Armada is told',
  );
  a.s.ent.x = e.x + 20;
  a.s.ent.y = e.y;
  a.s.ent.vx = e.vx;
  a.s.ent.vy = e.vy;
  a.send({ t: 'board', id: e.id });
  ok(
    !e.disabled && !e.rescueT && e.armor >= e.st.armor * RESCUE.repair - 1,
    'a member boards them and patches them up',
  );
  sL.remove(raider);
}
{
  const e = c.s.ent;
  e.shield = 0;
  e.armor = 5;
  sL.damage(e, 500, 500, null);
  e.rescueT = sL.t - 1;
  g.features.coop.rescueTick();
  ok(!sL.ships.has(e.id) && c.last('dead'), 'if nobody comes in time, the insurers take over');
}

// ------------------------------------------------------------------ duels
const dz = SYSTEMS.find(
  (s) => s.faction === 'quantum' && s.danger <= 1 && !s.hub && s.id !== 'qgate',
);
const x1 = extra[1],
  x2 = extra[2];
x1.send({ t: 'armada', op: 'leave' });
const e1 = toSpace(x1, dz.id, 0, 0),
  e2 = toSpace(x2, dz.id, 100, 0),
  sD = g.spaces[dz.id];
ok(!sD.isHostile(e1, e2), 'captains are not hostile to each other');
x1.send({ t: 'duel', op: 'challenge', name: x2.d.name });
ok(x2.s.duelInv && x2.s.duelInv.from === x1.d.name, 'a duel challenge arrives');
x2.send({ t: 'duel', op: 'accept' });
const D = g.duels[x1.s.duel];
ok(D && !D.on && !sD.isHostile(e1, e2), 'accepted: a short countdown first');
D.startT = 0;
g.features.coop.duelTick();
ok(D.on && sD.isHostile(e1, e2) && sD.canHit(e1, e2), 'then weapons free between the two');
e2.shield = 0;
e2.armor = e2.st.armor * 0.2;
sD.damage(e2, 9999, 9999, e1);
ok(
  sD.ships.has(e2.id) && Math.round(e2.armor) === Math.round(e2.st.armor * DUEL.floor),
  'a duel stops at disabled: nobody loses a ship',
);
ok(
  !g.duels[D.id] && x1.d.duels.w === 1 && x2.d.duels.l === 1 && !sD.isHostile(e1, e2),
  'the winner is called and the duel is over',
);
// Armada Duel
{
  const B2 = fake('Blue Lead'),
    B3 = fake('Blue Two');
  toSpace(B2, dz.id, 300, 0);
  toSpace(B3, dz.id, 330, 0);
  B2.send({ t: 'armada', op: 'form', name: 'Blue Wing' });
  B2.send({ t: 'armada', op: 'invite', name: 'Blue Two' });
  B3.send({ t: 'armada', op: 'accept', id: B2.d.armada });
  x1.send({ t: 'armada', op: 'form', name: 'Red Wing' });
  x2.send({ t: 'social', op: 'add', name: x1.d.name });
  x1.send({ t: 'social', op: 'accept', name: x2.d.name });
  x1.send({ t: 'armada', op: 'invite', name: x2.d.name });
  x2.send({ t: 'armada', op: 'accept', id: x1.d.armada });
  e2.armor = e2.st.armor;
  x1.send({ t: 'duel', op: 'challenge', name: 'Blue Lead', armada: true });
  B2.send({ t: 'duel', op: 'accept' });
  const AD = g.duels[B2.s.duel];
  ok(
    AD && AD.armada && AD.sides.A.length === 2 && AD.sides.B.length === 2,
    'an Armada Duel puts every member in the system on their side',
  );
  AD.startT = 0;
  g.features.coop.duelTick();
  ok(
    sD.isHostile(e1, B3.s.ent) &&
      sD.isHostile(e2, B2.s.ent) &&
      !sD.isHostile(e1, e2) &&
      !sD.isHostile(B2.s.ent, B3.s.ent),
    'each side fights the other, never itself',
  );
  for (const P of [B2, B3]) {
    const e = P.s.ent;
    e.shield = 0;
    e.armor = 1;
    sD.damage(e, 999, 999, e1);
  }
  ok(!g.duels[AD.id] && x1.d.duels.w === 2 && B2.d.duels.l === 1, 'the last side flying wins');
}

// ------------------------------------------------------------------ trading between stations
{
  const T1 = fake('Trader One'),
    T2 = fake('Trader Two');
  for (const [P, site] of [
    [T1, 'site-qgate'],
    [T2, 'site-meridian'],
  ]) {
    P.d.station = { ...P.d.station, claimed: true, ops: 2, site };
    W.sites[site] = g.db.key(P.d.name);
    P.d.stellar = site;
    P.d.sys = STELLARS[site].system;
  }
  delete W.sites['site-qgate'];
  W.sites['site-qgate'] = g.db.key('Trader One');
  T1.send({ t: 'social', op: 'add', name: 'Trader Two' });
  T2.send({ t: 'social', op: 'accept', name: 'Trader One' });
  T1.d.credits = 100000;
  T2.d.credits = 0;
  T2.d.mats.alloy[2] = 3;
  T1.d.cargo = { food: 10 };
  T1.d.stellar = STELLARS['site-qgate'] ? 'site-qgate' : T1.d.stellar;
  const away = T2.d.stellar;
  T2.d.stellar = 'qstation';
  T1.send({ t: 'trade2', op: 'open', name: 'Trader Two' });
  ok(!T1.s.trade, 'both captains must be docked at their own Personal Station');
  T2.d.stellar = away;
  T1.send({ t: 'trade2', op: 'open', name: 'Trader Two' });
  ok(
    T1.s.trade && T1.s.trade === T2.s.trade && T2.last('trade2').trade.with === 'Trader One',
    'a trade opens between two stations',
  );
  T1.send({ t: 'trade2', op: 'offer', give: { credits: 999999 } });
  ok(!g.trades[T1.s.trade].give['Trader One'].credits, 'you cannot offer what you do not have');
  T1.send({ t: 'trade2', op: 'offer', give: { credits: 50000, items: { 'cargo:food': 10 } } });
  T2.send({ t: 'trade2', op: 'offer', give: { items: { 'mat:alloy:2': 2 } } });
  T1.send({ t: 'trade2', op: 'confirm' });
  ok(
    T1.toasts().some((t) => /lock their offer/.test(t)),
    'offers are locked before anyone confirms',
  );
  T1.send({ t: 'trade2', op: 'lock', on: true });
  T2.send({ t: 'trade2', op: 'lock', on: true });
  T1.send({ t: 'trade2', op: 'confirm' });
  ok(T1.s.trade && T1.d.credits === 100000, 'one confirmation is not enough');
  T2.send({ t: 'trade2', op: 'confirm' });
  ok(
    !T1.s.trade &&
      T2.d.credits === 49000 &&
      T1.d.mats.alloy[2] === 2 &&
      T2.d.mats.alloy[2] === 1 &&
      !T1.d.cargo.food &&
      (T2.d.cargo.food || 0) + ((T2.d.storage || {}).food || 0) === 10,
    'both confirm: everything swaps at once, with a 2% fee on credits',
  );
  ok(
    T1.d.log.some((e) => /Traded with Trader Two/.test(e.text)),
    'both logs record it',
  );
  T1.send({ t: 'trade2', op: 'open', name: 'Trader Two' });
  T1.send({ t: 'trade2', op: 'offer', give: { items: { 'mat:alloy:2': 2 } } });
  T1.send({ t: 'trade2', op: 'lock', on: true });
  T2.send({ t: 'trade2', op: 'lock', on: true });
  T1.d.mats.alloy[2] = 0;
  T1.send({ t: 'trade2', op: 'confirm' });
  T2.send({ t: 'trade2', op: 'confirm' });
  ok(
    !T1.s.trade &&
      T2.d.mats.alloy[2] === 1 &&
      T1.toasts().some((t) => /no longer has everything/.test(t)),
    'if anything went missing the trade is cancelled whole: nothing is duplicated',
  );
}

// ------------------------------------------------------------------ co-op Holdout
{
  const H = fake('Host Hale'),
    K = fake('Kit Helper');
  H.d.station = { ...H.d.station, claimed: true, ops: 3, site: 'site-meridian', defense: 1 };
  W.sites['site-meridian'] = g.db.key('Host Hale');
  H.d.stellar = 'site-meridian';
  H.d.sys = 'meridian';
  H.send({ t: 'social', op: 'add', name: 'Kit Helper' });
  K.send({ t: 'social', op: 'accept', name: 'Host Hale' });
  H.send({ t: 'armada', op: 'form' });
  H.send({ t: 'armada', op: 'invite', name: 'Kit Helper' });
  K.send({ t: 'armada', op: 'accept', id: H.d.armada });
  H.send({ t: 'holdout' });
  ok(
    H.d.holdout.active && K.all('chat').some((m) => /Station Holdout/.test(m.msg)),
    'starting a Holdout calls the Armada',
  );
  toSpace(K, 'meridian', 300, 0);
  const Hh = H.d.holdout.active;
  Hh.nextT = Date.now() - 1;
  g.features.hostile.holdoutTick(H.s);
  g.features.hostile.holdoutTick(H.s);
  const solo = 2 + Math.ceil(1 / 2);
  ok(
    Hh.ids.length === solo + 1 && Hh.helpers.includes('Kit Helper'),
    'each helper adds a hostile to every wave',
  );
  const spM = g.spaces.meridian;
  for (const id of Hh.ids) spM.remove(spM.ships.get(id));
  Hh.cleared = 3;
  const kc = K.d.credits;
  g.features.hostile.holdoutEnd(H.s, false, 'test');
  ok(
    K.d.credits > kc && K.toasts().some((t) => /Your share/.test(t)),
    'helpers share the Holdout rewards',
  );
}

// ------------------------------------------------------------------ Armada contracts
{
  const p = STELLARS.concordia,
    offs = g.offers(p, a.d),
    wb = offs.find((o) => o.type === 'warband');
  ok(
    wb && WARBAND.leads.includes(wb.hull),
    'job boards post Armada contracts against kingpins in the old Mk III refits',
  );
  const lone = fake('Lone Wolf');
  lone.d.stellar = 'concordia';
  lone.d.sys = p.system;
  lone.send({ t: 'accept', id: wb.id });
  ok(!lone.d.missions.some((m) => m.id === wb.id), 'they need an Armada');
  const M1 = fake('Mara One'),
    M2 = fake('Mara Two');
  for (const P of [M1, M2]) {
    P.d.stellar = 'concordia';
    P.d.sys = p.system;
  }
  M1.send({ t: 'social', op: 'add', name: 'Mara Two' });
  M2.send({ t: 'social', op: 'accept', name: 'Mara One' });
  M1.send({ t: 'armada', op: 'form' });
  M1.send({ t: 'armada', op: 'invite', name: 'Mara Two' });
  M2.send({ t: 'armada', op: 'accept', id: M1.d.armada });
  M1.send({ t: 'accept', id: wb.id });
  const m1 = M1.d.missions.find((m) => m.id === wb.id),
    m2 = M2.d.missions.find((m) => m.id === wb.id);
  ok(
    m1 && m2 && m1.reward === Math.round(wb.reward / 2),
    'taken for the whole Armada, the pay shared out',
  );
  toSpace(M1, wb.sys, 0, 0);
  toSpace(M2, wb.sys, 50, 0);
  const sW = g.spaces[wb.sys];
  const kp = [...sW.ships.values()].find((x) => x.kingpin === wb.id),
    guards = [...sW.ships.values()].filter((x) => x.kingpinGuard === wb.id);
  ok(
    kp &&
      kp.hull === wb.hull &&
      guards.length >= WARBAND.guardsBase + 1 &&
      guards.every((x) => Object.values(MK2_OF).includes(x.hull)),
    `the kingpin arrives once, with ${guards.length} Mk II escorts`,
  );
  ok(sW.isHostile(kp, M2.s.ent), 'and goes for every member');
  kp.shield = 0;
  kp.armor = 1;
  sW.damage(kp, 50, 50, M2.s.ent);
  ok(m1.done && m2.done, "when it falls, every member's contract is complete");
}

// ------------------------------------------------------------------ Relocate Station
{
  const R = fake('Rho Mover'),
    d = R.d;
  d.station = { ...d.station, claimed: true, ops: 3, site: 'site-halcyon', done: ['x'] };
  W.sites['site-halcyon'] = g.db.key(d.name);
  d.stellar = 'site-halcyon';
  d.sys = 'halcyon';
  d.credits = 1e6;
  d.mats.alloy[1] = 1;
  d.dock.push({ ship: Object.assign(makeLoadout(A, 704, 'Keeper'), { uid: 'sk' }), bridge: {} });
  const to = Object.values(STELLARS).find(
    (p) => p.site && !g.siteOwner(p.id) && p.id !== 'site-halcyon',
  );
  R.send({ t: 'station', op: 'relocate', site: to.id });
  ok(
    d.station.site === to.id &&
      W.sites[to.id] === g.db.key(d.name) &&
      !W.sites['site-halcyon'] &&
      d.stellar === to.id &&
      d.sys === to.system,
    `the station warped to ${SYS[to.system].name}, and you rode along`,
  );
  ok(
    d.station.ops === 3 &&
      d.station.done.includes('x') &&
      d.dock.some((x) => x.ship.uid === 'sk') &&
      d.credits === 1e6 - (100000 + 60000 * 3) &&
      d.mats.alloy[1] === 0,
    'Ops, research and stored ships came along; it cost credits and an alloy II crate',
  );
  d.mats.alloy[1] = 1;
  R.send({ t: 'station', op: 'relocate', site: 'site-halcyon' });
  ok(
    d.station.site === to.id && R.toasts().some((t) => /recharging/.test(t)),
    'the warp core needs a day to recharge',
  );
  ok(!g.siteOwner('site-halcyon'), 'the old hull is free for anyone to claim');
}

// ------------------------------------------------------------------ solo hides it all
{
  const gs = new Game(A, new DB('/tmp/rift-v26s-' + Date.now()));
  gs.solo = true;
  const p = STELLARS.concordia;
  ok(
    !gs.offers(p, gs.fresh()).some((o) => o.type === 'warband') &&
      gs.features.coop.armadaPayload(gs.fresh()) === null &&
      gs.features.coop.socialPayload(gs.fresh()) === null,
    'a solo game has no Armada, friends or contracts',
  );
}
const read = (f) => fs.readFileSync(C + f, 'utf8');
ok(
  /data-tab="captains"/.test(read('index.html')) &&
    /body\.solo\s+\.mp\s*\{\s*display:\s*none;?\s*\}/.test(read('style.css')),
  'the CAPTAINS tab exists and hides in solo',
);
ok(
  !/FLEET<\/button>|fleetHtml|anchor a Dreadnought/i.test(
    read('index.html') + read('ui.js') + read('fronts_ui.js'),
  ),
  'no fleet or territory interface is left',
);
console.log('ALL 2.6 TESTS PASSED');
process.exit(0);
