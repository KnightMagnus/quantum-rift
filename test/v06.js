// 0.6 tests: Umbral hostility fix, fleets, territory and Dreadnoughts, invasions, anomalies, events, goals,
// faction stores and the new job types.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS, FACTIONS } from '../shared/galaxy.js';
import { anomaliesAt, eventAt, eventCalendar, SCAN, CLAIM, DREADNOUGHTS } from '../shared/fronts.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB('/tmp/rift-v06-' + Date.now()));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
let ip = 1;
function fake(name) {
  const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; sock.out = []; sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  game.connect(sock, '7.7.7.' + (ip++)); const s = [...game.sessions.values()].pop();
  const c = { sock, s, send: (m) => sock.emit('message', JSON.stringify(m)), last: (t) => [...sock.out].reverse().find(m => m.t === t), all: (t) => sock.out.filter(m => m.t === t) };
  c.send({ t: 'hello', name, pass: 'secret' }); return c;
}
const toSpace = (c, sys, x = 0, y = 0) => { const d = c.s.data; if (c.s.ent) { const sp = game.spaces[d.sys]; sp.remove(c.s.ent); sp.players--; c.s.ent = null; } d.sys = sys; d.stellar = null; game.spawnPlayer(c.s, x, y, 0, 0); return c.s.ent; };

// Umbral fix
const a = fake('Fleet Admiral'), b = fake('Wing Two'), da = a.s.data, db_ = b.s.data;
da.credits = db_.credits = 5e7;
const umSys = SYSTEMS.find(s => s.faction === 'umbral');
const ea = toSpace(a, umSys.id), sp0 = game.spaces[umSys.id];
const um = sp0.makeShip({ hull: 761, faction: 'umbral', x: 300, y: 0, ai: 'raid' });
ok(sp0.isHostile(um, ea), 'Umbral ships now attack captains on sight (they were peaceful before)');
const cr0 = da.credits, rep0 = da.rep.umbral; sp0.kill(um, ea);
ok(da.credits > cr0 && da.rep.umbral === rep0, 'destroying Umbral pays a bounty and costs no standing');
// fleets
a.send({ t: 'fleet', op: 'create', tag: 'ex', name: 'Expanse Wardens' });
ok(da.fleet === 'EX' && game.db.world.fleets.EX && da.credits < cr0 + 1e7, 'founded fleet [EX] for 50,000 credits');
b.send({ t: 'fleet', op: 'join', tag: 'EX' }); ok(db_.fleet === 'EX' && game.db.world.fleets.EX.members.length === 2, 'joined an open fleet');
const c = fake('Outsider'); c.send({ t: 'chat', msg: 'hello fleet', ch: 'fleet' });
a.send({ t: 'chat', msg: 'form up', ch: 'fleet' });
ok(b.all('chat').some(m => m.msg === 'form up' && m.ch === 'fleet') && !c.all('chat').some(m => m.msg === 'form up'), 'fleet chat reaches only fleetmates');
const pvp = SYSTEMS.find(s => s.danger >= 3 && s.faction === 'frontier');
const e1 = toSpace(a, pvp.id, 0, 0), e2 = toSpace(b, pvp.id, 50, 0), e3 = toSpace(c, pvp.id, 100, 0), spP = game.spaces[pvp.id];
ok(!spP.isHostile(e1, e2) && spP.isHostile(e1, e3), 'fleetmates never fight; outsiders are fair game in lawless space');
const snapName = spP.snapshot().ships.find(r => r[0] === e1.id)[11]; ok(snapName === '[EX] Fleet Admiral', 'fleet tags show on names in space');
const crB = db_.credits, pir = spP.makeShip({ hull: 711, faction: 'hollow', x: 20, y: 20 }); spP.kill(pir, e1);
ok(db_.credits > crB, 'fleetmates in the same system share bounties');
// closed fleet
a.send({ t: 'fleet', op: 'open', open: false }); c.send({ t: 'fleet', op: 'join', tag: 'EX' });
ok(!c.s.data.fleet && game.db.world.fleets.EX.pending.includes('Outsider'), 'a closed fleet takes join requests');
a.send({ t: 'fleet', op: 'accept', name: 'Outsider' }); ok(c.s.data.fleet === 'EX', 'the leader accepted the request');
c.send({ t: 'fleet', op: 'leave' }); ok(!c.s.data.fleet && game.db.world.fleets.EX.members.length === 2, 'left the fleet');
// territory
a.send({ t: 'fleet', op: 'deposit', n: 2e7 }); ok(game.db.world.fleets.EX.bank === 2e7, 'paid 20M into the fleet bank');
const lawfulSys = 'meridian'; toSpace(a, lawfulSys); a.send({ t: 'fleet', op: 'anchor', model: 0 }); ok(!game.db.world.claims[lawfulSys], 'only Frontier systems can be claimed');
const fr = SYSTEMS.find(s => s.faction === 'frontier' && s.stellars.some(p => p.svc.includes('T')));
toSpace(a, fr.id, 500, 500); a.send({ t: 'fleet', op: 'anchor', model: 1 });
const spF = game.spaces[fr.id], dread = [...spF.ships.values()].find(e => e.dread);
ok(game.db.world.claims[fr.id] && dread && dread.st.armor > A.ships[DREADNOUGHTS[1].hull].armor * 5, `anchored a ${DREADNOUGHTS[1].name} in ${fr.name} (armor ${dread.st.armor})`);
ok(a.last('world').claims[fr.id].tag === 'EX', 'the claim is broadcast to everyone');
const buffed = game.bonus(da); ok(buffed.damagePct >= CLAIM.buff.damagePct, 'fleet members get the territory buff in a held system');
const h = new Date().getUTCHours();
process.env.FRONT_HOURS = `${(h + 2) % 24}-${(h + 3) % 24}`; const ar0 = dread.armor; const e3b = toSpace(c, fr.id, 520, 520);
spF.damage(dread, 5000, 5000, e3b); ok(dread.armor === ar0, 'outside the front window a Dreadnought cannot be hurt');
ok(!spF.isHostile(dread, a.s.ent) && spF.isHostile(dread, e3b), 'the Dreadnought defends against those who attack it, never its own fleet');
// tax
const tp = fr.stellars.find(p => p.svc.includes('T')); const bank0 = game.db.world.fleets.EX.bank;
spF.remove(e3b); spF.players--; c.s.ent = null; c.s.data.sys = fr.id; c.s.data.stellar = tp.id; c.s.data.credits = 1e6;
const cid = game.market(tp)[0].id; c.send({ t: 'trade', cid, qty: 10 });
ok(game.db.world.fleets.EX.bank > bank0, `outsiders trading in ${fr.name} pay ${CLAIM.taxPct}% to the holding fleet`);
process.env.FRONT_HOURS = `${h}-${(h + 1) % 24}`; const e4 = toSpace(c, fr.id, 520, 520);
dread.shield = 0; dread.armor = 10; spF.damage(dread, 50, 50, e4);
ok(!game.db.world.claims[fr.id], 'during the front window the Dreadnought can be destroyed, and the claim falls');
delete process.env.FRONT_HOURS;
// invasion
const invSys = SYSTEMS.find(s => s.danger >= 2 && s.faction !== 'quantum' && s.stellars.length && s.id !== fr.id);
const boss = game.startInvasion(1, invSys.id); ok(boss && game.invasion && game.live[invSys.id].keep, `the ${game.invasion.boss.name} invades ${invSys.name}`);
ok(a.all('chat').some(m => /INVASION/.test(m.msg)) && a.last('world').invasion.sys === invSys.id, 'the invasion is announced and shown on the map');
const ia = toSpace(a, invSys.id, boss.x + 200, boss.y), ib = toSpace(b, invSys.id, boss.x - 200, boss.y), spI = game.spaces[invSys.id];
ok(spI.isHostile(boss, ia), 'the boss attacks every captain');
const c1 = da.credits, c2 = db_.credits;
spI.damage(boss, 3000, 3000, ia); spI.damage(boss, 1000, 1000, ib); boss.shield = 0; boss.armor = 1; spI.damage(boss, 10, 10, ia);
ok(!game.invasion && da.credits - c1 > db_.credits - c2 && db_.credits > c2, 'killing the boss pays everyone by damage share');
// anomalies and events
const an = anomaliesAt(SYSTEMS); ok(Object.keys(an).length === 9 && JSON.stringify(anomaliesAt(SYSTEMS)) === JSON.stringify(an), 'nine anomalies, the same for everyone in a 6-hour window');
const shearSys = Object.entries(an).find(([, k]) => k === 'shear');
if (shearSys) ok(game.mods(shearSys[0]).jumpFuel === 2, 'gravity shear doubles jump fuel');
ok(eventAt() && eventCalendar().length === 7, `server event now: ${eventAt().name}`);
// goals
const G0 = game.goalsFor(da); ok(G0.daily.length === 3 && G0.weekly.length === 3, 'three daily and three weekly goals');
G0.daily[0].got = G0.daily[0].n; const c3 = da.credits; a.send({ t: 'goal', period: 'daily', i: 0 });
ok(da.credits > c3 && G0.daily[0].claimed && da.tokens.any >= 2, 'claimed a daily goal: credits and Rift scrip');
const gj = G0.weekly.find(g => g.type === 'jumps') || G0.daily.find(g => g.type === 'jumps');
if (gj) { const n0 = gj.got; game.goal(a.s, 'jumps'); ok(gj.got === n0 + 1, 'jumps count toward goals'); }
// stores
const kw = STELLARS['meridian-yards']; da.sys = 'meridian'; if (a.s.ent) { game.spaces[invSys.id].remove(a.s.ent); game.spaces[invSys.id].players--; a.s.ent = null; } da.stellar = kw.id;
ok(game.storeFor(kw) === 'quantum', 'Concord worlds run a Concord store');
da.tokens = { quantum: 3, any: 20 }; da.rep.quantum = 35; const al = da.mats.alloy[2];
a.send({ t: 'store', id: 'crate3' }); ok(da.mats.alloy[2] === al + 1 && da.tokens.quantum === 0 && da.tokens.any === 9, 'bought a grade III crate with tokens topped up by scrip');
a.send({ t: 'store', id: 'epic' }); ok(!da.officers.some(o => o.rarity === 3), 'Epic contracts need Exalted standing');
// jobs
const offers = SYSTEMS.flatMap(s => s.stellars.filter(p => p.svc.includes('B') && !p.site).slice(0, 1)).slice(0, 25).flatMap(p => game.offers(STELLARS[p.id], da));
const kinds = new Set(offers.map(o => o.type)); ok(['convoy', 'smuggle', 'rescue', 'survey', 'assassinate'].every(k => kinds.has(k)), `job boards post the new jobs: ${[...kinds].join(', ')}`);
ok(offers.some(o => o.chain), 'faction commissions (job chains) are offered');
// convoy: accept, arrive, the freighter lands
const cv = offers.find(o => o.type === 'convoy'); da.missions = [{ ...cv, owner: a.s.id }];
toSpace(a, cv.sys, 0, 0); const spC = game.spaces[cv.sys], conv = [...spC.ships.values()].find(e => e.convoyOf);
ok(conv && conv.name === cv.convoyName, `the convoy ${cv.convoyName} joins you on arrival`);
const dest = STELLARS[cv.dest]; conv.x = dest.x; conv.y = dest.y; conv.vx = conv.vy = 0; for (let i = 0; i < 40; i++) spC.tick();
ok(da.missions[0].done, 'the convoy landed: job done');
const cv2 = offers.filter(o => o.type === 'convoy')[1] || cv; da.missions = [{ ...cv2, id: 'cv2', owner: a.s.id, spawned: false }];
toSpace(a, cv2.sys, 0, 0); const conv2 = [...game.spaces[cv2.sys].ships.values()].find(e => e.convoyOf && e.convoyOf.id === 'cv2');
game.spaces[cv2.sys].kill(conv2, null); ok(!da.missions.length, 'a destroyed convoy fails the job');
// rescue
const rs = offers.find(o => o.type === 'rescue'); da.missions = [{ ...rs, owner: a.s.id }];
const er = toSpace(a, rs.sys, 0, 0), spR = game.spaces[rs.sys], wreck = [...spR.ships.values()].find(e => e.rescueOf);
ok(wreck && wreck.disabled, 'the stranded ship is waiting, disabled');
er.x = wreck.x + 30; er.y = wreck.y; er.vx = wreck.vx; er.vy = wreck.vy; a.send({ t: 'board', id: wreck.id, act: 'rescue' }); ok(da.missions[0].done, 'boarding and rescuing completes the job');
// survey
const sv = offers.find(o => o.type === 'survey' && !o.chain); da.missions = [{ ...sv, owner: a.s.id }];
const es = toSpace(a, sv.sys, 0, 0); for (const p of sv.points) { es.x = p[0]; es.y = p[1]; game.missionIdle(a.s); }
ok(da.missions[0].done, 'flew over every survey point');
const land = SYS[sv.sys].stellars.find(p => p.svc.includes('L')) || STELLARS['meridian-yards'];
const c5 = da.credits; game.completeOnLanding(a.s, STELLARS[land.id]); ok(da.credits > c5 && !da.missions.length, 'paid on landing, with faction tokens');
// smuggling scan
const sm = offers.find(o => o.type === 'smuggle'); da.missions = [{ ...sm, owner: a.s.id }];
const lawSys = SYSTEMS.find(s => !FACTIONS[s.faction].region && !FACTIONS[s.faction].pirate && s.danger <= 2 && s.faction !== 'umbral');
const em = toSpace(a, lawSys.id, 0, 0), cop = game.spaces[lawSys.id].makeShip({ hull: 711, faction: lawSys.faction, x: 60, y: 0, ai: 'patrol' });
SCAN.chance = 1; const rp = da.rep[lawSys.faction]; game.missionIdle(a.s);
ok(!da.missions.length && da.rep[lawSys.faction] === rp - 5, 'a patrol scan catches smugglers: fined, cargo seized, standing lost');
// chain
const ch = offers.find(o => o.chain); da.missions = [{ ...ch, owner: a.s.id, done: true }]; da.chains = {};
game.completeOnLanding(a.s, STELLARS['meridian-yards']); ok(da.chains[ch.chain.fac] === 1, 'finishing a commission step unlocks the next');
console.log('ALL 0.6 TESTS PASSED'); process.exit(0);
