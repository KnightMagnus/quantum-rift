// Production Space.tick / normal ship physics; seeded disposable captains, no save edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Game } from '../server/game.js';
import { DB } from '../server/db.js';
import { makeLoadout } from '../shared/rules.js';
import { formationTargets, fleetFootprint } from '../server/armada-formation.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-v-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
const game = new Game(A, new DB(dir));
const sp = game.spaces.sol;
sp.ships.clear();
sp.players = 0;
const sessions = [];
for (let i = 0; i < 5; i++) {
  const name = 'V Captain ' + i,
    d = game.fresh();
  d.sys = 'sol';
  d.stellar = null;
  d.name = name;
  d.tut = 999;
  d.ship = makeLoadout(game.A, i === 2 ? 714 : 704, name);
  game.db.create(name, 'fixture', d);
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  sock.send = () => {};
  sock.close = () => {};
  game.connect(sock);
  const s = [...game.sessions.values()].at(-1);
  game.onMessage(s, { t: 'hello', name, pass: 'fixture' });
  s.data.sys = 'sol';
  s.data.stellar = null;
  game.spawnPlayer(s, 500 * i, 500, 0, 0);
  sessions.push(s);
}
const [leader, ...followers] = sessions;
game.features.coop.armadaOp(leader, { op: 'form', name: 'V Fixture' });
const id = leader.data.armada;
for (const s of followers) {
  game.features.coop.armadaOp(leader, { op: 'invite', name: s.data.name });
  game.features.coop.armadaOp(s, { op: 'accept', id });
  game.features.coop.armadaOp(s, { op: 'follow', on: true });
}
for (const e of [...sp.ships.values()]) if (!e.player) sp.remove(e);
const wing = sp.makeShip({ hull: 704, faction: 'quantum', x: 0, y: 0 });
wing.owner = followers[1].ent.id;
wing.ai = 'escort';
wing.slot = 3;
wing.x = followers[1].ent.x + 200;
wing.y = followers[1].ent.y + 200;
sp.players = 0;
sp.spawnT = 1e9;
const bigGap = formationTargets(sp).get(followers[0].ent.id).gap;
assert.ok(bigGap > 2 * fleetFootprint(sp, followers[1].ent));
const trace = [];
function run(seconds, input = {}) {
  leader.lastInput = input;
  for (let i = 0; i < seconds * 30; i++) {
    sp.tick();
    if (i % 30 === 0)
      trace.push(
        sessions.map((s) => ({
          name: s.data.name,
          x: s.ent.x,
          y: s.ent.y,
          v: Math.hypot(s.ent.vx, s.ent.vy),
        })),
      );
  }
}
function errors() {
  return followers.map((s) => {
    const t = s.armadaFormationTarget;
    return Math.hypot(s.ent.x - t.x, s.ent.y - t.y);
  });
}
run(160);
console.log('stationary initial', errors());
assert.ok(
  errors().every((d) => d < 100),
  'captains assemble into V using actual physics',
);
const before = followers.map((s) => ({ x: s.ent.x, y: s.ent.y }));
run(8, { thrust: 1 });
run(50);
console.log('moving', errors());
assert.ok(
  followers.every((s, i) => Math.hypot(s.ent.x - before[i].x, s.ent.y - before[i].y) > 100),
);
run(1.5, { turn: 1 });
run(80, { rev: 1, thrust: 1 });
run(160);
console.log('turned and stop input', errors());
// Explicitly brake the leader with ordinary inputs, then hold stationary.
for (let i = 0; i < 2000 && Math.hypot(leader.ent.vx, leader.ent.vy) > 3; i++) {
  const e = leader.ent,
    want = Math.atan2(-e.vx, e.vy),
    da = Math.atan2(Math.sin(want - e.a), Math.cos(want - e.a));
  leader.lastInput = {
    turn: Math.abs(da) < e.st.turn / 30 ? 0 : Math.sign(da),
    thrust: Math.abs(da) < 0.2 ? 1 : 0,
  };
  sp.tick();
}
leader.lastInput = {};
run(160);
console.log(
  'final stop',
  errors(),
  sessions.map((s) => Math.hypot(s.ent.vx, s.ent.vy)),
);
assert.ok(
  errors().every((d) => d < 120),
  'settles after leader turns/moves/stops',
);
for (let i = 0; i < followers.length; i++)
  for (let j = i + 1; j < followers.length; j++) {
    const a = followers[i].ent,
      b = followers[j].ent;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > fleetFootprint(sp, a) + fleetFootprint(sp, b));
  }
const slots = followers.map((s) => s.armadaFormationTarget.slot);
game.features.coop.armadaOp(followers[0], { op: 'follow', on: false });
sp.tick();
assert.deepEqual(
  followers.slice(1).map((s) => s.armadaFormationTarget.slot),
  slots.slice(1),
);
game.features.coop.armadaOp(followers[0], { op: 'follow', on: true });
game.onMessage(followers[0], { t: 'input', seq: 1, th: 1, nav: true });
sp.tick();
assert.equal(followers[0].data.armadaFollow, true, 'navigation preserves consent for jumps');
assert.equal(followers[0].armadaFormationTarget, null, 'navigation yields authoritative formation');
assert.equal(followers[0].ent.inp.thrust, 1, 'navigation controls reach normal physics');
game.onMessage(followers[0], { t: 'input', seq: 2 });
sp.tick();
assert.ok(followers[0].armadaFormationTarget, 'formation resumes when navigation ends');
game.onMessage(followers[0], { t: 'input', seq: 3, th: 1 });
sp.tick();
assert.equal(followers[0].data.armadaFollow, false, 'manual takeover disables Follow');
assert.equal(followers[0].ent.inp.thrust, 1);
game.features.coop.armadaOp(followers[0], { op: 'follow', on: true });
followers[0].ent.autoCombat = true;
assert.equal(formationTargets(sp).has(followers[0].ent.id), false, 'combat priority');
followers[0].ent.autoCombat = false;
const le = leader.ent;
leader.ent = null;
assert.equal(formationTargets(sp).size, 0, 'landed/offline leader suspends flight without hijack');
leader.ent = le;
leader.data.sys = 'meridian';
assert.equal(formationTargets(sp).size, 0);
leader.data.sys = 'sol';
const sent = [];
// The production jump method dispatches through socket.send; observe actual packets.
for (const s of followers) s.sock.send = (m) => sent.push(m);
game.features.coop.armadaLeaderJump(leader, 'meridian');
assert.equal(
  sent.filter((m) => m.t === 'follow').length,
  4,
  'opted-in leader jump routing preserved',
);
game.features.coop.armadaOp(leader, { op: 'lead', name: followers[1].data.name });
sp.tick();
assert.equal(followers[0].data.armadaFollow, false, 'leader transfer revokes old flight consent');
assert.equal(followers[2].data.armadaFollow, false);
if (process.env.RIFT_FORMATION_EVIDENCE)
  fs.writeFileSync(
    process.env.RIFT_FORMATION_EVIDENCE,
    JSON.stringify({ gap: bigGap, trace, finalErrors: errorsSafe() }, null, 2),
  );
function errorsSafe() {
  return followers.map((s) => ({ name: s.data.name, follow: s.data.armadaFollow }));
}
console.log(
  'Five production captains: assembly, large hull + wing spacing, movement/turn/stop, slots, manual input, combat priority, leader loss/transfer and jump routing passed.',
);
process.exit(0);
