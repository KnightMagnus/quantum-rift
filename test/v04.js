import { seedCargo } from './helpers/cargo-fixture.js';
import { tempDataDir } from './helpers/temp-data.js';
// 0.4 tests: the 200-system galaxy, sleeping systems, region traffic, mining, ore processing, charting, routes.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYSTEMS, SYS, SITES, FACTIONS, ORE_PROCESS } from '../shared/galaxy.ts';
import { route } from '../shared/rules.ts';
import { expandGalaxy } from '../shared/gen.ts';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v04-')));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  game.connect(sock, '5.5.5.5');
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
// galaxy
ok(SYS.qgate.name === 'Concordia', 'home system displays Concordia under its stable save ID');
ok(
  SYS.qgate.stellars.some((body) => body.id === 'qstation' && body.name === 'Quantum Station'),
  'Concordia retains Quantum Station and its stable body ID',
);
ok(
  SYSTEMS.filter((s) => s.anchor || s.gen).length === 200 && SYSTEMS.length === 217,
  `200 generated systems, plus Sol and the 16 Farside systems (${SYSTEMS.length})`,
);
const seen = new Set(['qgate']),
  q = ['qgate'];
while (q.length) {
  const c = SYS[q.shift()];
  for (const l of [...c.links, ...(c.gate ? [c.gate] : [])])
    if (!seen.has(l)) {
      seen.add(l);
      q.push(l);
    }
}
ok(
  seen.size === SYSTEMS.length,
  'every system can be reached from Concordia (Farside through the Sol Gateway)',
);
ok(
  SYSTEMS.every((s) => s.links.every((l) => SYS[l].links.includes(s.id))),
  'routes go both ways',
);
const by = {};
for (const s of SYSTEMS) by[s.faction] = (by[s.faction] || 0) + 1;
ok(
  by.farside === 16 &&
    by.frontier >= 25 &&
    by.frontier <= 70 &&
    by.deep >= 6 &&
    Object.keys(FACTIONS)
      .filter((f) => !FACTIONS[f].hidden)
      .every((f) => by[f]),
  'every power has territory, plus Frontier and the Deep: ' + JSON.stringify(by),
);
ok(
  SYS.qgate.stellars.some((p) => p.hub) && SYS.qgate.links.includes('meridian'),
  'the hand-made anchors keep their worlds and routes',
);
// determinism: regenerating from the same anchors gives the same galaxy
const _raw = fs.readFileSync(new URL('../shared/galaxy.ts', import.meta.url), 'utf8');
ok(SITES.length >= 25, `${SITES.length} claimable hulls (17 + Frontier)`);
const copy = JSON.parse(JSON.stringify(SYSTEMS.filter((s) => s.anchor))).map((s) => ({
  ...s,
  links: s.links.filter((l) => SYS[l].anchor),
  stellars: s.stellars.filter((p) => !p.site),
}));
// undo the scale so expandGalaxy can be run again
for (const s of copy) {
  s.x = Math.round(495 + (s.x - 495) / 1.7);
  s.y = Math.round(370 + (s.y - 370) / 1.7);
  delete s.anchor;
}
expandGalaxy(copy, FACTIONS);
ok(
  copy.length === 200 && copy.slice(30).every((s, i) => s.name === SYSTEMS[30 + i].name),
  'the generator is deterministic (same names, same order)',
);
// routes
const far = SYSTEMS.find((s) => s.faction === 'deep');
const r = route(SYS, 'qgate', far.id);
ok(
  r.length >= 3 &&
    r[r.length - 1] === far.id &&
    r.every((x, i) => SYS[i ? r[i - 1] : 'qgate'].links.includes(x)),
  `route to ${far.name}: ${r.length} jumps`,
);
// sleeping systems
ok(Object.keys(game.live).length === 0, 'no systems are simulated before anyone arrives');
const a = fake('Miner');
const d = a.s.data;
a.send({ t: 'depart' });
ok(Object.keys(game.live).length === 1, 'departing wakes only the system you are in');
const sp0 = game.live.qgate;
sp0.remove(a.s.ent);
sp0.players = 0;
a.s.ent = null;
for (let i = 0; i < 15 * 30 * 9; i++) game.tick(); // ~2 min of quiet ticks
ok(!game.live.qgate, 'an empty system goes back to sleep');
d.stellar = 'qstation';
// region traffic flies real flags
const fr = SYSTEMS.find((s) => s.faction === 'frontier' && s.danger >= 3),
  spF = game.spaces[fr.id];
for (let i = 0; i < 12; i++) spF.spawnTraffic(false);
ok(
  [...spF.ships.values()].every((e) => !FACTIONS[e.faction].region || FACTIONS[e.faction].hidden),
  `Frontier traffic in ${fr.name} flies real flags: ${[...new Set([...spF.ships.values()].map((e) => e.faction))].join(', ')}`,
);
// mining
const mineSys = SYSTEMS.find(
  (s) => s.fields && s.fields.some((f) => f.ore === 'ore') && s.stellars.length,
);
const spM = game.spaces[mineSys.id];
ok(spM.rocks.length > 0, `${mineSys.name} has ${spM.rocks.length} asteroids`);
d.sys = mineSys.id;
d.stellar = mineSys.stellars.find((p) => p.svc.includes('L')).id;
a.s.ent = null;
game.depart(a.s);
const sm = a.last('space');
ok(sm.rocks && sm.rocks.length === spM.rocks.length, 'the arrival message lists the rocks');
const rock = spM.rocks.find((k) => k.ore === 'ore');
const lootN = spM.loot.length;
// Stages share one finite budget; legacy direct hits remain ordinary, never fake clean contact.
for (let stage = 0; stage < rock.stages; stage++) spM.hitRock(rock, rock.max, true);
ok(rock.down > 0 && spM.loot.length > lootN, 'a mining hit breaks the rock into ore');
const ore = spM.loot.filter((l) => l.it.ore);
const e = a.s.ent;
e.x = ore[0].x;
e.y = ore[0].y;
e.vx = e.vy = 0;
const before = d.cargo.ore || 0;
spM.tick();
ok((d.cargo.ore || 0) > before, `scooped ore into the hold (${d.cargo.ore} t)`);
const generation = rock.generation;
rock.down = game.db.world.mining.clock - 1;
game.features.mining.endTick(spM);
ok(
  spM.rocks.some((k) => k.generation === generation + 1 && k.x === rock.x && k.y === rock.y) ||
    spM.rocks.some((k) => k.generation === generation + 1),
  'broken rocks regrow as a fresh deterministic generation',
);
const k2 = spM.rocks.find((k) => !k.down);
const hp = k2.hp;
spM.hitRock(k2, 10, false);
const dmgN = hp - k2.hp;
k2.hp = hp;
spM.hitRock(k2, 10, true);
ok(hp - k2.hp === dmgN * 6, 'mining weapons are six times as effective on rock');
// processing at your station
d.credits = 1e6;
d.station.claimed = true;
d.station.ops = 3;
d.station.site = 'site-meridian';
game.db.world.sites['site-meridian'] = game.db.key(d.name);
a.s.ent = null;
spM.players--;
d.sys = 'meridian';
d.stellar = 'site-meridian';
seedCargo(d, { ore: 30 });
a.send({ t: 'station', op: 'process', id: 'ore', all: 1 });
ok(
  d.mats.alloy[ORE_PROCESS.grade[3]] >= 2 && d.cargo.ore === 6,
  `processed 24 t of ore into alloy ${['I', 'II', 'III'][ORE_PROCESS.grade[3]]} crates`,
);
// charting
d.stellar = null;
game.spawnPlayer(a.s, 0, 0, 0, 0);
const to = SYS.meridian.links.find((l) => !d.explored.includes(l));
const ex = a.s.ent;
ex.state = 'jumpout';
ex.jumpTo = to;
ex.fuel = 1000;
game.finishJump(ex, game.spaces.meridian);
ok(
  d.explored.includes(to) && a.last('you').d.explored.includes(to),
  `charted ${SYS[to].name} on arrival`,
);
console.log('ALL 0.4 TESTS PASSED');
process.exit(0);
