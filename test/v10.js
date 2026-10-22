import { tempDataDir } from './helpers/temp-data.js';
// 1.0 tests: the Que'vari storyline and the Deep gate (part 1). Career, solo mode and balance follow in later sections.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS, STELLARS, SYSTEMS } from '../shared/galaxy.ts';
import { STORY } from '../shared/story.ts';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const game = new Game(A, new DB(tempDataDir('rift-v10-')));
export const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
let ip = 1;
export function fake(name, g = game) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  g.connect(sock, '11.0.0.' + ip++);
  const s = [...g.sessions.values()].pop();
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
const land = (c, sid) => {
  const d = c.s.data,
    p = STELLARS[sid];
  if (c.s.ent) {
    const sp = game.spaces[d.sys];
    sp.remove(c.s.ent);
    sp.players--;
    c.s.ent = null;
  }
  d.sys = p.system;
  d.stellar = sid;
  game.landed(c.s);
  game.features.story.storyOnLand(c.s, p);
};
const toSpace = (c, sys) => {
  const d = c.s.data;
  if (c.s.ent) {
    const sp = game.spaces[d.sys];
    sp.remove(c.s.ent);
    sp.players--;
    c.s.ent = null;
  }
  d.sys = sys;
  d.stellar = null;
  game.spawnPlayer(c.s, 0, 0, 0, 0);
  return c.s.ent;
};
const a = fake('Lightbearer'),
  d = a.s.data;
d.credits = 1e6;
d.ship.hull = 736;
// the Deep is locked until the Que'vari charts
const deep = SYSTEMS.find(
    (s) => s.faction === 'deep' && s.links.some((l) => SYS[l].faction !== 'deep'),
  ),
  edge = SYS[deep.links.find((l) => SYS[l].faction !== 'deep')];
const e0 = toSpace(a, edge.id);
e0.x = 3000;
e0.y = 3000;
a.send({ t: 'jump', to: deep.id });
ok(
  e0.state === 'fly' && a.all('toast').some((t) => /Deep is uncharted/.test(t.msg)),
  'the Deep is locked until the story opens it',
);
ok(
  STORY.length === 5 && STORY.every((s) => STELLARS[s.at]),
  'five story missions, each offered at a real world',
);
land(a, 'threshold');
const pop = a.last('story');
ok(
  pop && pop.id === 'qv1' && /Sel'ani/.test(pop.text),
  'landing at the Threshold Spire offers the first story mission in a pop-up',
);
ok(
  a.last('landed').story && a.last('landed').story.id === 'qv1',
  'and it shows as a golden card on the job board',
);
a.send({ t: 'storyacc', id: 'qv1' });
ok(d.story.active && d.story.active.id === 'qv1', "accepted: carry Sel'ani to Ina Lumen");
const c0 = d.credits;
land(a, 'inalumen');
ok(
  d.story.done.includes('qv1') &&
    d.credits === c0 + STORY[0].pay &&
    a.all('story').some((m) => m.id === 'qv1' && m.done),
  'delivered: paid, with the story conclusion pop-up',
);
const qv2 = a
  .all('story')
  .filter((m) => m.id === 'qv2')
  .pop();
ok(qv2 && !qv2.done, 'and the next mission is offered right away');
a.send({ t: 'storyacc', id: 'qv2' });
const e2 = toSpace(a, 'dimmer'),
  sp2 = game.spaces.dimmer;
const sloops = [...sp2.ships.values()].filter((x) => x.storyBoard);
ok(
  sloops.length === 3 && sloops.every((x) => x.disabled),
  'three becalmed sloops wait in Dimmer Reach',
);
for (const sl of sloops) {
  e2.x = sl.x + 20;
  e2.y = sl.y;
  e2.vx = sl.vx;
  e2.vy = sl.vy;
  a.send({ t: 'board', id: sl.id, act: 'rescue' });
}
ok(d.story.active.ready, 'boarded and rescued all three');
land(a, 'inalumen');
ok(d.story.done.includes('qv2'), 'Becalmed complete');
d.rep.quevari = 10;
const n3 = a.all('story').length;
land(a, 'inalumen');
ok(
  a.all('story').length === n3 && /standing/.test(a.last('landed').story.locked || ''),
  'the elders want more standing before the next mission',
);
d.rep.quevari = 30;
land(a, 'inalumen');
a.send({ t: 'storyacc', id: 'qv3' });
toSpace(a, 'shoalight');
const hunters = [...game.spaces.shoalight.ships.values()].filter((x) => x.storyKill);
ok(hunters.length === 4, 'four Umbral hunters close in at Shoalight');
for (const h of hunters) game.spaces.shoalight.kill(h, a.s.ent);
ok(d.story.active.ready, 'all four destroyed');
land(a, 'inalumen');
ok(
  d.story.done.includes('qv3') && !game.features.story.deepLocked(d, deep.id),
  'Shades on the Wind complete, and the Deep is open',
);
d.rep.quevari = 60;
land(a, 'inalumen');
a.send({ t: 'storyacc', id: 'qv4' });
const e4 = toSpace(a, 'umbra'),
  sp4 = game.spaces.umbra;
const anchor = [...sp4.ships.values()].find((x) => x.storyKill),
  allies = [...sp4.ships.values()].filter((x) => x.storyAlly);
ok(
  anchor &&
    anchor.hull === 764 &&
    allies.length === 4 &&
    allies.every((x) => !sp4.isHostile(x, e4)),
  "the Night Anchor waits in Umbra, and four Que'vari choirs fight beside you",
);
anchor.shield = 0;
anchor.armor = 1;
sp4.damage(anchor, 10, 10, e4);
ok(d.story.active.ready, 'the Night Anchor is destroyed');
land(a, 'inalumen');
ok(d.story.done.includes('qv4'), 'The Night Anchor complete');
const _old = d.ship.hull;
land(a, 'inalumen');
a.send({ t: 'storyacc', id: 'qv5' });
ok(
  d.ship.hull === 744 && d.story.done.includes('qv5') && d.story.step === 5,
  'the final reward is yours',
);
ok(!game.features.story.storyOffer(d, STELLARS.inalumen), 'the story is complete');
console.log('ok - (story section done)');
// --- solo mode
const sdir = tempDataDir('rift-v10solo-'),
  sdb = new DB(sdir),
  solo = new Game(A, sdb);
solo.solo = true;
const s1 = fake('Lone Wolf', solo);
ok(s1.last('welcome') && !s1.last('error'), 'solo mode: no password needed');
ok(
  solo.slots().some((x) => x.name === 'Lone Wolf'),
  'the new captain appears as a save slot',
);
const s1b = fake('Lone Wolf', solo);
ok(s1b.last('welcome'), 'and loads again without a password');
s1b.send({ t: 'pause' });
ok(solo.paused && s1b.last('paused').on, 'P pauses the solo game');
const tk = solo.tickN;
solo.tick();
ok(solo.tickN === tk, 'nothing moves while paused');
s1b.send({ t: 'pause' });
ok(!solo.paused, 'and P resumes');
const save = JSON.parse(JSON.stringify(solo.db.get('Lone Wolf')));
delete save.salt;
delete save.hash;
save.name = 'Second Wolf';
save.credits = 123456;
ok(
  solo.importSave(save) === 'Second Wolf' && solo.db.get('Second Wolf').credits === 123456,
  'a save file loads as a new slot',
);
let threw = false;
try {
  solo.importSave({ hello: 1 });
} catch {
  threw = true;
}
ok(threw, 'junk files are refused');
sdb.dirty = true;
sdb.flush();
sdb.backup();
ok(
  fs.readdirSync(sdir + '/backups').length >= 1 &&
    fs.existsSync(sdir + '/backups/' + fs.readdirSync(sdir + '/backups')[0] + '/players.json'),
  'rolling backups are written to data/backups',
);
const mp = fake('Online Only');
mp.send({ t: 'pause' });
ok(!game.paused, 'pause only works in solo mode');
// --- career guide
const { TUTORIAL } = await import('../shared/tutorial.ts');
ok(TUTORIAL.length === 23, 'the career guide has twenty-three goals (2.5)');
const cg = fake('Rookie'),
  cd = cg.s.data;
ok(cd.tut === 0, 'new captains start the career at goal 1');
cd.tut = 5;
Object.assign(cd.station, { claimed: true, site: 'site-halcyon' });
game.idleCheck(cg.s);
ok(cd.tut === 6, 'state goals complete on their own (claimed a hull)');
console.log('ALL 1.0 TESTS PASSED');
process.exit(0);
