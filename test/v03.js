// 0.3 tests: weapon colours, hit events with damage, escort slots, disabled wreck clean-up, login throttle, tutorial.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { weaponColor, weaponLook, weaponParams } from '../shared/rules.js';
import { TUTORIAL } from '../shared/tutorial.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB('/tmp/rift-v03-' + Date.now()));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
function fake(name, pass = 'secret', ip = '1.2.3.4') {
  const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; sock.out = []; sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  game.connect(sock, ip); const s = [...game.sessions.values()].pop();
  const c = { sock, s, send: (m) => sock.emit('message', JSON.stringify(m)), last: (t) => [...sock.out].reverse().find(m => m.t === t) };
  c.send({ t: 'hello', name, pass }); return c;
}
// colours
const black = Object.values(A.weapons).filter(w => /^#0{6}$/i.test(weaponColor(w)) || /^#0{6}$/i.test(weaponParams(w).color));
ok(black.length === 0, 'no weapon draws black (was 30)');
ok(weaponLook(A.weapons[197]) === 'rail' && weaponLook(A.weapons[350]) === 'sing' && weaponLook(A.weapons[128]) === 'bolt', 'projectile looks by weapon class');
ok(weaponColor(A.weapons[132]) !== '#000000', 'Constitution heavy blaster turrets are coloured: ' + weaponColor(A.weapons[132]));
// hit events
const a = fake('Tester'); const d = a.s.data;
a.send({ t: 'depart' }); const sp = game.spaces[d.sys];
const npc = sp.makeShip({ hull: 705, faction: 'hollow', x: a.s.ent.x + 200, y: a.s.ent.y, ai: 'raid' });
sp.events = []; const r = sp.damage(npc, 5, 20, a.s.ent); sp.hitEv(npc.x, npc.y, 128, npc, r);
const ev = sp.events.find(e => e[0] === 'hit');
ok(ev && ev[4] === npc.id && ev[5] > 0 && ev[6] === a.s.ent.id && ev[7] === 1, `hit event carries target, damage ${ev && ev[5]}, shooter, shield flag`);
// escort slots are unique
const owner = sp.makeShip({ hull: 708, faction: 'quantum', x: 0, y: 0, ai: 'patrol' });
const es = [0, 1, 2, 3].map(() => sp.makeShip({ hull: 705, faction: 'quantum', x: 10, y: 10, ai: 'escort', owner: owner.id }));
for (let i = 0; i < 3; i++) for (const e of es) { e.think = 0; sp.ai(e); }
ok(new Set(es.map(e => e.slot)).size === 4, 'four escorts take four different formation slots');
// disabled wrecks are towed away
const wreck = sp.makeShip({ hull: 705, faction: 'hollow', x: 900, y: 900, ai: 'raid' }); wreck.armor = 1; sp.ai(wreck); ok(wreck.disabled, 'wreck is disabled');
sp.t += 80; sp.ai(wreck); ok(!sp.ships.has(wreck.id), 'unboarded wreck leaves after 75 s');
// tutorial
ok(d.tut === 0, 'new captain starts the tutorial');
const c0 = d.credits; a.send({ t: 'target', id: npc.id }); ok(d.tut === 1 && d.credits === c0 + TUTORIAL[0].reward, 'targeting a ship completes goal 1');
a.send({ t: 'tutskip' }); ok(d.tut === TUTORIAL.length, 'tutorial can be skipped');
// login throttle
for (let i = 0; i < 6; i++) fake('Tester', 'wrong!', '9.9.9.9');
const z = fake('Tester', 'secret', '9.9.9.9'); ok(z.last('error') && /Too many/.test(z.last('error').msg), 'six bad passwords lock the name for a while');
console.log('ALL 0.3 TESTS PASSED'); process.exit(0);
