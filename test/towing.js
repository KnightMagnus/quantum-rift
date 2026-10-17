import assert from 'node:assert/strict';
import {
  tug,
  survey,
  attach,
  command,
  atPort,
  advance,
  seed,
  lots,
} from './helpers/towing-fixture.js';
import { TOW } from '../shared/towing-rules.js';
import { step, makeLoadout, shipStats } from '../shared/rules.js';
import { STELLARS, SYS } from '../shared/galaxy.js';
const f = tug(),
  { g, s, sp } = f;
let o = f.o;
assert.equal(g.features.towing.payload(s).objects.find((x) => x.id === o.id).mass, null);
assert.equal(command(f, 'attach'), false, 'must really survey');
survey(f);
assert.equal(command(f, 'attach', { owner: 'forged' }), false);
s.ent.vx = 61;
assert.equal(command(f, 'attach'), false, 'no fast attachment');
s.ent.vx = 0;
attach(f);
const mass = { ...o.lots },
  credits = s.data.credits,
  fragments = { ...s.data.bp },
  smelter = s.data.ship.industrial;
assert.equal(o.status, 'attached');
assert.equal(command(f, 'attach'), false);
// Real physics with afterburner, extreme drift and formation/catchup speed cannot ease above hard cap.
for (const hull of [815, 704]) {
  const a = tug(undefined, 'Cap', hull);
  attach(a);
  for (const drift of [0, 5000]) {
    Object.assign(a.s.ent, { vx: drift, vy: 0, a: Math.PI / 2, fuel: 10000 });
    const x = a.s.ent.x;
    const st = { ...a.s.ent.st, afterburner: 1, maxSpeed: 10000, accel: 5000 };
    step(a.s.ent, st, { thrust: 1, ab: 1 }, 0.5);
    assert.ok(Math.hypot(a.s.ent.vx, a.s.ent.vy) <= a.s.ent.towCap + 1e-8);
    assert.ok(Math.hypot(a.s.ent.x - x, a.s.ent.y - a.o.y) <= 1000, 'bounded position');
  }
  // The actual Space formation/catchup and thrust route uses the same hard step.
  a.s.ent.catchup = { maxSpeed: 9000, accel: 5000, turn: 20 };
  a.s.ent.vx = 0;
  a.s.ent.vy = 0;
  a.s.lastInput = { seq: 1, thrust: 1, turn: 0, ab: 1, rev: 0, fire1: 0, fire2: 0 };
  a.s.ent.st.afterburner = 1;
  advance(a, 1);
  assert.ok(Math.hypot(a.s.ent.vx, a.s.ent.vy) <= (hull === 815 ? 60 : 30) + 1e-8);
}
const bad = tug(undefined, 'Bad', 703);
assert.equal(command(bad, 'attach'), false, 'small fighter-like hold ineligible');
const unequipped = tug(undefined, 'Bare', 704);
delete unequipped.s.data.ship.outfits[TOW.rig];
survey(unequipped);
assert.equal(command(unequipped, 'attach'), false);
// Consensual transfer: only explicit recipient acceptance, never Armada consent/offer alone.
const peer = tug(g, 'TowPeer');
Object.assign(peer.s.ent, { x: s.ent.x + 20, y: s.ent.y, vx: 0, vy: 0 });
peer.o = o;
assert.equal(command(f, 'offer', { to: peer.s.data.name }), true);
assert.equal(o.owner, g.db.key(s.data.name));
assert.equal(command(peer, 'deliver', { port: o.acceptPorts[0] }), false);
const oldRevision = o.revision;
assert.equal(command(peer, 'accept'), true);
assert.equal(o.owner, g.db.key(peer.s.data.name));
assert.equal(s.ent.towCap, undefined);
assert.equal(
  g.features.towing.command(s, { t: 'towing', op: 'detach', id: o.id, revision: oldRevision }),
  false,
  'stale mutation denied',
);
assert.equal(command(peer, 'detach'), true);
const grace = o.graceUntil;
assert.equal(command(peer, 'detach'), false);
assert.equal(o.graceUntil, grace, 'no unattached grace extension');
assert.equal(command(f, 'attach'), false, 'foreign captain cannot steal grace');
g.features.mining.advanceClock(1);
assert.equal(o.graceUntil, grace);
survey(peer);
assert.equal(command(peer, 'attach'), true);
// Capacity and accepted-port access precede ALL accounting; exact receipt retries never pay twice.
const p = atPort(peer);
const cap = g.features.shipStats.stats(peer.s.data).cargo;
peer.s.data.missions = [{ type: 'cargo', qty: cap - TOW.mass + 1 }];
const before = JSON.stringify(g.db.world.towing);
assert.equal(command(peer, 'deliver', { port: p.id }), false);
assert.equal(JSON.stringify(g.db.world.towing), before);
peer.s.data.missions = [];
peer.s.data.rep[SYS[o.sys].faction] = -40;
assert.equal(command(peer, 'deliver', { port: p.id }), false);
peer.s.data.rep[SYS[o.sys].faction] = 10;
assert.equal(command(peer, 'deliver', { port: p.id }), true);
peer.o = g.db.world.towing.slots.find((x) => x.object?.id === o.id).object;
assert.equal(peer.s.data.cargo.ore, 24);
assert.deepEqual(peer.s.data.cargoLots.byCommodity.ore, mass);
assert.equal(command(peer, 'deliver', { port: p.id }), true);
assert.equal(peer.s.data.cargo.ore, 24);
assert.equal(command(f, 'deliver', { port: p.id }), false);
assert.equal(s.data.credits, credits);
assert.deepEqual(s.data.bp, fragments);
assert.equal(s.data.ship.industrial, smelter);
assert.equal(
  g.features.towing.destroy(peer.s, o.id, peer.o.revision),
  false,
  'paid object cannot also fragment',
);
// Owner-only destruction discards the finite mass, without ore/credits/fragments or ordinary parcel emission.
const dead = tug(undefined, 'Scuttle');
attach(dead);
const loot = dead.sp.loot.length;
assert.equal(dead.g.features.towing.destroy(dead.s, dead.o.id, dead.o.revision), true);
assert.equal(dead.o.hp, 0);
assert.equal(dead.s.data.cargo.ore || 0, 0);
assert.equal(dead.sp.loot.length, loot);
assert.equal(dead.g.features.towing.destroy(dead.s, dead.o.id, dead.o.revision), false);
// Other captains/projectiles/hazards never acquire a motherlode as a normal damage collider.
assert.equal(
  sp.rocks.some((r) => r.id === o.id),
  false,
);
const neutral = tug(g, 'Neutral');
const hp = neutral.s.ent.armor,
  shield = neutral.s.ent.shield;
advance(neutral, 1);
assert.equal(neutral.s.ent.armor, hp);
assert.equal(neutral.s.ent.shield, shield);
console.log(
  'Finite motherlodes: surveyed equipment/range authority, hard60/30 physics, consensual revisioned transfer, capacity/permission/once-only exact-grade port delivery, terminal destruction and neutral safety.',
);

// Real transit/lifecycle coordinator paths preserve systems, fuel and the external asset.
{
  const f = tug();
  attach(f);
  const { g, s, sp, o } = f,
    sys = s.data.sys,
    fuel = s.ent.fuel;
  g.jump(s, SYS[sys].links[0]);
  assert.equal(s.ent.state, 'fly');
  assert.equal(s.ent.fuel, fuel);
  s.ent.state = 'jumpout';
  s.ent.jumpT = 0;
  g.finishJump(s.ent, sp);
  assert.equal(s.data.sys, sys);
  assert.equal(s.ent.state, 'fly');
  const gate = { id: 'tow-test-gate', x: s.ent.x, y: s.ent.y, r: 500, wormhole: SYS[sys].links[0] };
  g.wormholeTransit(s.ent, sp, gate);
  assert.equal(s.data.sys, sys);
  const gateFlag = sp.sys.gate;
  sp.sys.gate = true;
  sp.sys.stellars.push(gate);
  try {
    advance(f, 0.1);
    assert.equal(s.data.sys, sys);
  } finally {
    sp.sys.stellars.pop();
    sp.sys.gate = gateFlag;
  }
  const p = atPort(f);
  g.land(s, p.id);
  assert.ok(s.ent);
  assert.equal(s.data.stellar, null);
  sp.remove(s.ent, 'death');
  assert.equal(o.status, 'detached');
  assert.equal(s.data.cargo.ore || 0, 0);
  assert.ok(o.graceUntil > g.db.world.mining.clock);
}
