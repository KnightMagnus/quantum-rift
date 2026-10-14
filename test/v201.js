// 2.0.1 tests: NPC traders actually settle over a planet and land (they used to circle forever), and escorts keep
// formation on a moving leader with the new arrival steering.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS } from '../shared/galaxy.js';
import { makeLoadout } from '../shared/rules.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB('/tmp/rift-v201-' + Date.now()));
const wingUp = (game, d, hulls) => { d.docks[d.activeDock].wings = hulls.map(h => { const ship = makeLoadout(A, h, 'Wing'); ship.uid = game.shipUid(d); d.dock.push({ ship, bridge: {} }); return { uid: ship.uid }; }); };   // 2.1: wingmates are stored ships in your dock
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
const sp = game.spaces.meridian; for (const e of [...sp.ships.values()]) sp.remove(e);
const planets = SYS.meridian.stellars.filter(p => p.svc.includes('L')), hulls = [704, 706, 712, 703, 713, 736].filter(h => A.ships[h]);
let landed = 0, worst = 0;
for (let i = 0; i < 24; i++) {
  const p = planets[i % planets.length], ang = Math.random() * 6.283, dist = 1500 + Math.random() * 1000;
  const e = sp.makeShip({ hull: hulls[i % hulls.length], faction: 'spacer', x: p.x + Math.cos(ang) * dist, y: p.y + Math.sin(ang) * dist, a: Math.random() * 6.28, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, ai: 'trade' });
  e.dest = p; e.life = 1e9; let t = 0; while (sp.ships.has(e.id) && t < 90 * 30) { sp.tick(); t++; }
  if (!sp.ships.has(e.id)) { landed++; worst = Math.max(worst, t / 30); } else sp.remove(e);
}
ok(landed >= 23, `traders settle over the pad and land (${landed}/24, slowest ${worst.toFixed(0)} s)`);
// escorts on a moving leader
const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; sock.send = () => {}; sock.close = () => {};
game.connect(sock, '15.0.0.1'); const s = [...game.sessions.values()].pop(); sock.emit('message', JSON.stringify({ t: 'hello', name: 'Leader', pass: 'secret' }));
const d = s.data; d.ship.hull = 736; wingUp(game, d, [751, 751]); d.sys = 'halcyon'; d.stellar = null; game.spawnPlayer(s, 0, 0, 0, 0);
const sp2 = game.spaces.halcyon, me = s.ent, esc = [...sp2.ships.values()].filter(x => x.owner === me.id);
for (let i = 0; i < 300; i++) { s.inputs.push({ seq: i, thrust: 1, turn: i % 120 < 30 ? 1 : 0 }); sp2.tick(); }
const dists = esc.map(x => Math.hypot(x.x - me.x, x.y - me.y));
ok(esc.length === 2 && dists.every(v => v < 600), `escorts keep up with a manoeuvring leader (max ${Math.round(Math.max(...dists))} units behind)`);
console.log('ALL 2.0.1 TESTS PASSED'); process.exit(0);
