// 0.9 tests: hostile levels, loot chests, directives and solo armadas, Station Holdout, weekly events, the Umbral Eclipse.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS } from '../shared/galaxy.js';
import { levelOf, winOdds, HOLDOUT, DIRECTIVES } from '../shared/hostile.js';
import { eventAt, eventCalendar, EVENTS } from '../shared/fronts.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB('/tmp/rift-v09-' + Date.now()));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
let ip = 1;
function fake(name) {
  const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; sock.out = []; sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  game.connect(sock, '10.0.0.' + (ip++)); const s = [...game.sessions.values()].pop();
  const c = { sock, s, send: (m) => sock.emit('message', JSON.stringify(m)), last: (t) => [...sock.out].reverse().find(m => m.t === t), toasts: () => sock.out.filter(m => m.t === 'toast').map(m => m.msg) };
  c.send({ t: 'hello', name, pass: 'secret' }); return c;
}
const toSpace = (c, sys, x = 0, y = 0) => { const d = c.s.data; if (c.s.ent) { const sp = game.spaces[d.sys]; sp.remove(c.s.ent); sp.players--; c.s.ent = null; } d.sys = sys; d.stellar = null; game.spawnPlayer(c.s, x, y, 0, 0); return c.s.ent; };
// levels
ok(levelOf(5) < levelOf(80) && levelOf(80) < levelOf(900) && levelOf(900) < levelOf(16000), `levels rise with strength (${[5, 80, 900, 16000].map(levelOf).join(', ')})`);
ok(winOdds(900, 30) > 0.9 && winOdds(30, 900) < 0.1 && Math.abs(winOdds(100, 100) - 0.5) < 1e-9, 'the scan odds favour the stronger ship');
const a = fake('Hunter'), d = a.s.data; d.credits = 5e7; for (const m of ['alloy', 'crystal', 'isotope']) d.mats[m] = [20, 20, 20, 20, 20];
const hs = SYSTEMS.find(s => s.faction === 'hollow'), e = toSpace(a, hs.id), sp = game.spaces[hs.id];
const pir = sp.makeShip({ hull: 716, faction: 'hollow', x: 100, y: 0 }); ok(pir.pw > 0 && sp.snapshot().ships.find(r => r[0] === pir.id)[13] === pir.pw, 'every ship carries its effective strength to the client (for levels)');
// chests
let chest = null; for (let i = 0; i < 40 && !chest; i++) { const t = sp.makeShip({ hull: 711, faction: 'hollow', x: 60, y: 0 }); sp.kill(t, e); chest = sp.loot.find(l => l.it.chest); }
ok(chest && chest.it.chest === 'hollow' && chest.it.lvl > 0, `Hollow ships drop Hollow Caches (Lv ${chest.it.lvl})`);
const cr0 = d.credits; e.x = chest.x; e.y = chest.y; sp.tick(); ok(d.credits > cr0 && a.toasts().some(t => /Hollow Cache/.test(t)), 'opening a cache pays credits, a crate and maybe blueprints or a directive');
// directives and armadas
d.ship.hull = 736; d.directives = { 1: 1, 2: 0, 3: 0 }; toSpace(a, hs.id); a.send({ t: 'armada', tier: 2 }); ok(!(Object.values(game.spaces[hs.id].ships).length) || d.directives[1] === 1, 'no Umbral Directive, no tier 2 armada');
a.send({ t: 'armada', tier: 1 }); const lead = [...sp.ships.values()].find(x => x.armada); const eNow = a.s.ent;
ok(lead && d.directives[1] === 0 && [...sp.ships.values()].filter(x => x.owner === lead.id).length === 3, 'a Hollow Directive summons a flagship and three escorts');
ok(lead.pw > A.ships[717].strength, `the armada is scaled to you (Lv ${levelOf(lead.pw)} vs your Lv ${levelOf(game.myPower(d))})`);
const cr1 = d.credits, bp0 = Object.values(d.bp || {}).reduce((x, y) => x + y, 0); lead.shield = 0; lead.armor = 1; sp.damage(lead, 50, 50, eNow);
ok(d.credits >= cr1 + DIRECTIVES[1].reward && Object.values(d.bp).reduce((x, y) => x + y, 0) >= bp0 + DIRECTIVES[1].bp, 'destroying the flagship pays out credits, crates and specialist blueprints');
ok(sp.loot.some(l => l.it.chest), 'and armadas always drop a chest');
toSpace(a, 'qgate'); d.directives[1] = 1; a.send({ t: 'armada', tier: 1 }); ok(d.directives[1] === 1, 'no armada beacons in the Concord core');
// holdout
Object.assign(d.station, { claimed: true, ops: 4, site: 'site-meridian', defense: 2 }); game.db.world.sites['site-meridian'] = game.db.key(d.name);
game.spaces.qgate.remove(a.s.ent); game.spaces.qgate.players--; a.s.ent = null; d.sys = 'meridian'; d.stellar = 'site-meridian';
a.send({ t: 'holdout' }); ok(d.holdout.active && a.s.ent, 'started a Holdout: you launch to defend the station');
d.holdout.active.nextT = Date.now() - 1; game.holdoutTick(a.s); game.holdoutTick(a.s);
const spH = game.spaces.meridian, plats = [...spH.ships.values()].filter(x => x.platform);
ok(plats.length === HOLDOUT.platforms(2) && plats.every(p => !spH.isHostile(p, a.s.ent)), `${plats.length} defense platforms deploy on your side`);
ok(d.holdout.active.wave === 1 && d.holdout.active.ids.length >= 2, `wave 1: ${d.holdout.active.ids.length} hostiles`);
for (let w = 1; w <= 3; w++) { for (const id of d.holdout.active.ids) { const x = spH.ships.get(id); if (x) spH.kill(x, a.s.ent); } game.holdoutTick(a.s); if (w < 3) { d.holdout.active.nextT = Date.now() - 1; game.holdoutTick(a.s); } }
ok(d.holdout.active.cleared === 3, 'cleared three waves');
const cr2 = d.credits; spH.remove(a.s.ent); spH.players--; a.s.ent = null; game.holdoutTick(a.s);
ok(!d.holdout.active && d.holdout.best === 3 && d.credits > cr2 && !plats.some(p => spH.ships.has(p.id)), 'leaving ends the Holdout: paid for three waves, platforms withdrawn');
d.stellar = 'site-meridian'; a.send({ t: 'holdout' }); ok(!d.holdout.active, 'Holdouts have a cooldown');
// weekly events
ok(EVENTS.length === 7 && new Set(EVENTS.map(e => e.day)).size === 7, 'a themed event for each day of the week');
const sun = Date.UTC(2026, 9, 18, 12), thu = Date.UTC(2026, 9, 15, 12), goldSat = Date.UTC(2026, 10, 7, 12);
ok(eventAt(sun).id === 'swarm' && eventAt(thu).id === 'eclipse' && eventAt(goldSat).id === 'gold', 'Swarm Sunday, Umbral Eclipse Thursday, and the Gold Vein weekend');
ok(eventCalendar().length === 7, 'the calendar shows the coming week');
// eclipse
const us = SYSTEMS.find(s => s.faction === 'deep' && s.danger >= 3) || SYSTEMS.find(s => s.faction === 'umbral'), spE = game.spaces[us.id]; let ec = false;
for (let i = 0; i < 120 && !ec; i++) { spE.spawnTraffic(false); ec = [...spE.ships.values()].some(x => x.faction === 'eclipse'); }
ok(ec, `Umbral Eclipse cells roam ${us.name}`);
console.log('ALL 0.9 TESTS PASSED'); process.exit(0);
