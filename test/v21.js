// 2.1 tests: docks A-E with a lead ship and wingmates each, stored ships, officers crewing wingmates, buying to the hangar.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { STELLARS, WINGMATES } from '../shared/galaxy.js';
import { makeLoadout } from '../shared/rules.js';
import { SPEC } from '../shared/specialty.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
process.env.SEEDS_FILE = '/nonexistent';
const dir = '/tmp/rift-v21-' + Date.now();
// an old (2.0.3) save with two hired escorts and a stored ship preset
{ const g0 = new Game(A, new DB(dir)); const p = g0.db.create('Old Hand', 'secret', g0.fresh());
  p.station.claimed = true; p.station.ops = 4; p.station.site = 'site-qgate'; g0.db.world.sites['site-qgate'] = g0.db.key('Old Hand');
  p.escorts = [751, 757]; p.ship = makeLoadout(A, 708, 'Old Blade'); p.dock = [{ ship: makeLoadout(A, 704, 'Hauler'), escorts: [752], bridge: {} }]; p.stellar = 'site-qgate'; p.sys = STELLARS['site-qgate'].system;
  g0.db.touch(); g0.db.flush(); }
const g = new Game(A, new DB(dir));
function fake(name) { const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; const out = []; sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  g.connect(sock, '7.7.7.' + name.length); const send = (m) => sock.emit('message', JSON.stringify(m)); send({ t: 'hello', name, pass: 'secret' });
  const s = [...g.sessions.values()].pop(); return { s, d: s.data, out, send, toasts: () => out.filter(m => m.t === 'toast').map(m => m.msg), you: () => out.filter(m => m.t === 'you').pop().d }; }
const P = fake('Old Hand'), d = P.d;
ok(Array.isArray(d.docks) && d.docks.length === 4 && d.activeDock === 0, 'an Ops 4 captain gets four docks, Dock A active');
ok(d.docks[0].lead === d.ship.uid, 'Dock A leads with the ship you fly');
ok(d.docks[0].wings.filter(Boolean).length === 2 && d.dock.some(x => x.ship.hull === 751) && d.dock.some(x => x.ship.hull === 757), 'hired escorts became stored ships flying as Dock A wingmates');
ok(!d.escorts.length && !d.dock.some(x => x.escorts), 'old escort lists are retired (a stored preset escort is refunded)');
const Y = P.you(); ok(Y.docks && Y.docks.list.length === 4 && Y.docks.list[0].wings.length === 2 && Y.docks.cap === 11, 'the client gets docks, wing slots and berth count');
// wingmates launch with their own loadouts and officers
const o1 = { id: g.uid(d), name: 'Wing Boss', race: 'quantum', role: 'captain', rarity: 3, lv: 10, xp: 0 }; d.officers.push(o1);
P.send({ t: 'docks', op: 'crew', k: 0, w: 0, role: 'cap', oid: o1.id });
ok(d.docks[0].wings[0].cap === o1.id, 'an officer captains a wingmate');
d.bridge.captain = o1.id; P.send({ t: 'officer', op: 'assign', oid: o1.id, slot: 'captain' });
ok(d.bridge.captain === o1.id && !d.docks[0].wings[0].cap, 'moving them to your bridge takes them off the wingmate');
P.send({ t: 'docks', op: 'crew', k: 0, w: 0, role: 'cap', oid: o1.id });
ok(d.docks[0].wings[0].cap === o1.id && !d.bridge.captain, '...and back again: one post at a time');
P.send({ t: 'depart' }); const sp = g.spaces[d.sys], me = P.s.ent;
const wings = [...sp.ships.values()].filter(e => e.owner === me.id && e.wingUid);
ok(wings.length === 2, 'both wingmates launch in formation');
const w0 = wings.find(e => e.wingUid === d.docks[0].wings[0].uid), plain = sp.makeShip({ hull: w0.hull, faction: 'quantum' });
ok(w0.st.shield > plain.st.shield, 'the captained wingmate is stronger than a bare hull');
// a wingmate knocked out goes in for repairs
sp.damage(w0, 1e7, 1e7, null);
const X = d.dock.find(x => x.ship.uid === w0.wingUid); ok(X.repairT > Date.now() && P.toasts().some(t => t.includes('towed home')), 'a wingmate knocked out is towed home for repairs');
ok(g.activeWings(d).length === 1, 'and sits out until repaired');
d.credits = 1e7; P.send({ t: 'docks', op: 'repair', uid: X.ship.uid }); ok(!X.repairT, 'rush repairs put her back in service');
// back at the station: build Dock B and switch
g.land(P.s, d.stellar || 'site-qgate'); if (P.s.ent) { const s2 = g.spaces[d.sys]; g.dropEscorts(s2, P.s.ent); s2.remove(P.s.ent); s2.players--; P.s.ent = null; } d.stellar = 'site-qgate'; d.sys = STELLARS['site-qgate'].system;
P.send({ t: 'buyship', hull: 710, store: true }); const nb = d.dock.find(x => x.ship.hull === 710);
ok(nb && d.credits < 1e7, 'bought a ship straight into the hangar, no trade-in');
P.send({ t: 'buyship', hull: WINGMATES[2] }); ok(d.dock.some(x => x.ship.hull === WINGMATES[2]) && d.ship.hull === 708, 'wingmate ships always go to the hangar');
const wm = d.dock.find(x => x.ship.hull === WINGMATES[2]);
P.send({ t: 'docks', op: 'assign', k: 1, slot: 'lead', uid: wm.ship.uid }); ok(!d.docks[1].lead && P.toasts().pop().includes('only as a wingmate'), 'wingmate hulls cannot lead a dock');
P.send({ t: 'docks', op: 'assign', k: 1, slot: 'lead', uid: nb.ship.uid });
P.send({ t: 'docks', op: 'assign', k: 1, slot: 0, uid: wm.ship.uid });
ok(d.docks[1].lead === nb.ship.uid && d.docks[1].wings[0].uid === wm.ship.uid, 'Dock B: a lead and a wingmate');
const aw = d.docks[0].wings[1].uid; P.send({ t: 'docks', op: 'assign', k: 1, slot: 1, uid: aw });
ok(d.docks[1].wings[1].uid === aw && !d.docks[0].wings.some(w => w && w.uid === aw), 'a ship moves between docks, never in two at once');
P.send({ t: 'docks', op: 'assign', k: 1, slot: 0, uid: d.ship.uid }); ok(d.docks[1].wings[0].uid === wm.ship.uid, "the ship you fly can't be put in another slot");
const old = d.ship; d.cargo = { food: 9999 };
P.send({ t: 'docks', op: 'activate', k: 1 }); ok(d.activeDock === 0, "switching docks checks your cargo fits the new lead");
d.cargo = {}; P.send({ t: 'docks', op: 'activate', k: 1 });
ok(d.activeDock === 1 && d.ship === nb.ship && d.dock.includes(d.dock.find(x => x.ship === old)) && d.docks[0].lead === old.uid, 'fly with Dock B: its lead is your ship, the old one waits as Dock A lead');
ok(g.activeWings(d).map(o => o.x.ship.uid).sort().join() === [wm.ship.uid, aw].sort().join(), "Dock B's wingmates now fly with you");
P.send({ t: 'docks', op: 'activate', k: 0 }); ok(d.activeDock === 0 && d.ship === old, 'and back to Dock A');
// Herald leads command a third wingmate
const her = makeLoadout(A, Object.values(SPEC).find(s => s.key === 'herald').id, 'Halo'); her.uid = g.shipUid(d); d.dock.push({ ship: her, bridge: {} });
P.send({ t: 'docks', op: 'assign', k: 2, slot: 'lead', uid: her.uid }); ok(g.wingMax(d, 2) === 3 && g.wingMax(d, 1) === 2, 'a Herald lead opens a third wingmate slot');
// selling a stored ship frees its slot; hangar capacity is enforced
P.send({ t: 'dock', op: 'sell', uid: wm.ship.uid }); ok(!d.dock.some(x => x === wm) && !d.docks[1].wings.some(w => w && w.uid === wm.ship.uid), 'selling a stored ship empties its slot');
while (d.dock.length < g.dockSlots(d)) { const sh = makeLoadout(A, 703, 'filler'); sh.uid = g.shipUid(d); d.dock.push({ ship: sh, bridge: {} }); }
P.send({ t: 'buyship', hull: 704, store: true }); ok(P.toasts().pop().includes('hangar is full'), 'the hangar holds only so many ships');
// the hire op is retired
P.send({ t: 'station', op: 'hire', hull: 751 }); ok(P.toasts().pop().includes('Wingmates are ships now'), 'hiring wingmates at the station is retired');
// a fresh captain without a station: Dock A only, no wingmates
const N = fake('New Pilot'); ok(N.d.docks.length === 1 && N.you().docks.cap === 0 && g.activeWings(N.d).length === 0, 'a captain without a station has Dock A and no hangar');
// your own guns hit any ship now (EV-style): a friendly trader takes damage, turns hostile, and you lose standing
{ const T = fake('Trigger Happy'); T.send({ t: 'depart' }); const sp4 = g.spaces[T.d.sys], me4 = T.s.ent;
  const tr = sp4.makeShip({ hull: 704, faction: 'quantum', x: me4.x + Math.sin(me4.a) * 150, y: me4.y - Math.cos(me4.a) * 150, a: 0, ai: 'trade' }); tr.dest = { x: tr.x, y: tr.y, out: true };
  const a0 = tr.armor + tr.shield, r0 = T.d.rep.quantum; for (let i = 0; i < 60; i++) { T.s.inputs.push({ seq: i + 1, thrust: 0, turn: 0, ab: 0, rev: 0, fire1: 1, fire2: 0 }); sp4.tick(); }
  ok(tr.armor + tr.shield < a0 && T.d.rep.quantum < r0 && sp4.isHostile(tr, me4), 'your guns hit a friendly trader: it turns hostile and you lose standing');
  const esc = sp4.makeShip({ hull: 704, faction: 'quantum', x: me4.x, y: me4.y, ai: 'escort', owner: me4.id }); ok(!sp4.canHit(me4, esc), 'but never your own wingmates'); }
console.log('ALL 2.1 TESTS PASSED'); process.exit(0);
