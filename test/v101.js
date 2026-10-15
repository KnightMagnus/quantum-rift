// 1.0.1 tests: respawn at your own station hull or the hub (never at someone else's base or wherever you last landed).
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { STELLARS, START, SITES } from '../shared/galaxy.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB('/tmp/rift-v101-' + Date.now()));
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
  game.connect(sock, '12.0.0.' + ip++);
  const s = [...game.sessions.values()].pop();
  const c = {
    sock,
    s,
    send: (m) => sock.emit('message', JSON.stringify(m)),
    last: (t) => [...sock.out].reverse().find((m) => m.t === t),
  };
  c.send({ t: 'hello', name, pass: 'secret' });
  return c;
}
const die = (c, sys) => {
  const d = c.s.data;
  d.sys = sys;
  d.stellar = null;
  game.spawnPlayer(c.s, 0, 0, 0, 0);
  const sp = game.spaces[sys];
  game.onPlayerDeath({ s: c.s }, sp, null);
  return d;
};
// a captain with no base who last landed at another player's station hull
const owner = fake('Baron'),
  od = owner.s.data,
  site = SITES[0];
od.station.site = site.id;
game.db.world.sites[site.id] = game.db.key(od.name);
const a = fake('Drifter'),
  d = a.s.data;
d.lastStellar = site.id;
die(a, STELLARS[site.id].system);
ok(
  d.stellar === START.stellar,
  `no base of your own: rebuilt at the hub (${STELLARS[d.stellar].name}), not at someone else's station`,
);
ok(
  a.last('dead') && a.last('dead').at === STELLARS[START.stellar].name,
  'the death notice names the hub',
);
// a captain with their own station hull respawns there
d.lastStellar = 'concordia';
die(owner, 'meridian');
ok(od.stellar === site.id, 'with a station hull of your own you are rebuilt there');
// 1.0.2: storing your only ship leaves you with no active ship (no free Gnat), and you cannot depart until you choose one
od.station.ops = 4;
od.cargo = {};
od.stellar = site.id;
od.sys = STELLARS[site.id].system;
od.dock = [];
const h0 = od.ship.hull;
owner.send({ t: 'dock', op: 'store' });
ok(
  od.shipless && od.dock.length === 1 && od.dock[0].ship.hull === h0,
  'stored the only ship: no active ship, and no free Gnat',
);
owner.send({ t: 'dock', op: 'store' });
owner.send({ t: 'dock', op: 'store' });
ok(od.dock.length === 1, 'storing again does nothing');
owner.send({ t: 'depart' });
ok(!owner.s.ent && /no active ship/i.test(owner.last('toast').msg), 'cannot depart without a ship');
owner.send({ t: 'dock', op: 'store', i: 0 });
ok(
  !od.shipless && od.ship.hull === h0 && od.dock.length === 0,
  'FLY THIS takes the stored ship out of its berth',
);
owner.send({ t: 'depart' });
ok(!!owner.s.ent, 'and now you can depart');
console.log('ALL 1.0.1 TESTS PASSED');
process.exit(0);
