// Real contacts and actual shield/armor checks across hazard and encounter scopes.
import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.js';
import { weaponParams, DT } from '../shared/rules.js';
import { DB } from '../server/db.js';
function fly(g, s, sys = 'meridian', adult = true) {
  s.data.sys = sys;
  s.data.stellar = null;
  s.data.station.ops = adult ? 3 : 0;
  g.spawnPlayer(s, 100000, 100000, 0, 0);
  s.ent.guns = [];
  s.ent.inp = {};
  return s.ent;
}
const g = refineryGame(),
  a = refineryPilot(g, 'Noise Owner'),
  b = refineryPilot(g, 'Neutral'),
  c = refineryPilot(g, 'Armada'),
  d = refineryPilot(g, 'Optin');
const e = fly(g, a),
  neutral = fly(g, b),
  armada = fly(g, c),
  peer = fly(g, d),
  sp = g.spaces.meridian;
sp.ships = new Map([e, neutral, armada, peer].map((e) => [e.id, e]));
// Owner must stay scope index0 even if peers precede them in connection order.
g.sessions = new Map([...g.sessions.entries()].reverse());
a.data.armada = c.data.armada = d.data.armada = 'fixture-miners';
g.features.pressure.consent(a, { op: 'join' });
g.features.pressure.consent(d, { op: 'join' });
const wing = sp.makeShip({
  hull: 704,
  faction: 'quantum',
  x: e.x,
  y: e.y,
  owner: e.id,
  ai: 'escort',
});
const rock = sp.rocks.find((r) => r.ore === 'gas') || sp.rocks[0];
rock.ore = 'gas';
rock.x = e.x + 100;
rock.y = e.y;
rock.hp = rock.max = 1e9;
rock.seam = Math.PI;
e.a = Math.PI / 2;
const gun = {
  w: 9101,
  n: 1,
  p: weaponParams(g.A.weapons[9101]),
  cd: 0,
  ammo: Infinity,
  snd: 'laser',
  sec: false,
  sndT: 0,
};
const before = [e, neutral, armada, peer, wing].map((e) => [e.shield, e.armor]);
function step(fire = true) {
  g.features.mining.advanceClock(DT);
  sp.t += DT;
  if (fire) sp.fire(e, gun, null, e.a);
  g.features.mining.endTick(sp);
  g.features.pressure.pressureTick(sp);
}
step();
const hazard = g.db.world.miningPressure.hazards.find((h) => h.id === rock.key);
assert.ok(hazard);
assert.ok(hazard.detonateAt - hazard.triggerAt >= 2);
assert.deepEqual([e.shield, e.armor], before[0], 'no immediate damage');
const noise = g.features.pressure.payload(a).noise;
sp.fire(e, gun, null, e.a);
g.features.mining.endTick(sp);
assert.equal(g.features.pressure.payload(a).noise, noise, 'duplicate contact cannot add noise');
for (let i = 0; i < 62; i++) step();
assert.ok(e.shield < before[0][0], 'source captain receives own telegraphed blast');
assert.ok(peer.shield < before[3][0], 'explicit optin receives scoped blast');
for (const [ship, prior] of [
  [neutral, before[1]],
  [armada, before[2]],
  [wing, before[4]],
])
  assert.deepEqual(
    [ship.shield, ship.armor],
    prior,
    'neutral/unconsentingArmada/friendlywing immune',
  );
const after = e.shield;
for (let i = 0; i < 15; i++) step(false);
assert.equal(e.shield, after, 'same blast cannot replay');
for (let i = 0; i < 550 && !g.db.world.miningPressure.encounters.some((x) => x.active); i++) step();
const group = g.db.world.miningPressure.encounters.find((x) => x.active);
assert.ok(group);
assert.equal(group.ids.length, 2);
const raider = sp.ships.get(group.ids[0]);
assert.equal(sp.canAcquire(raider, neutral), false);
assert.equal(sp.canHit(raider, armada), false);
assert.equal(sp.canHit(raider, wing), false);
assert.equal(sp.canHit(raider, e), true);
assert.equal(sp.canHit(raider, peer), true);
const neutralHP = [neutral.shield, neutral.armor];
sp.damage(neutral, 999, 999, raider);
assert.deepEqual(
  [neutral.shield, neutral.armor],
  neutralHP,
  'damage authority itself blocks collateral',
);
g.features.pressure.consent(d, { op: 'leave' });
const hp = [peer.shield, peer.armor];
sp.damage(peer, 999, 999, raider);
assert.deepEqual(
  [peer.shield, peer.armor],
  hp,
  'withdrawal removes existinggroup damage eligibility',
);
assert.equal(g.features.pressure.shotAllowed(sp, group.id, neutral), false);
assert.equal(g.features.pressure.shotAllowed(sp, group.id, peer), false);
assert.equal(g.features.pressure.shotAllowed(sp, group.id, e), true);
// The blast can hit an explicitly enrolled hostile, never an ambient neutral NPC.
const vent = sp.rocks.find((r) => r.key !== rock.key);
vent.ore = 'gas';
vent.captain = g.db.key(a.data.name);
raider.x = vent.x;
raider.y = vent.y;
const bystander = sp.makeShip({ hull: 704, faction: 'spacer', x: vent.x, y: vent.y, ai: 'trader' }),
  npcHP = [bystander.shield, bystander.armor],
  hostileShield = raider.shield;
g.features.pressure.work(sp, vent, 0.1);
for (let i = 0; i < 3; i++) g.features.mining.advanceClock(1);
g.features.pressure.pressureTick(sp);
assert.ok(raider.shield < hostileShield, 'enrolled hostile in real radius receives blast');
assert.deepEqual([bystander.shield, bystander.armor], npcHP, 'ambient neutral NPC immune');
const last = g.db.world.miningPressure.captains.find(
  (x) => x.owner === g.db.key(a.data.name),
).lastEncounter;
for (const id of group.ids) sp.ships.delete(id);
g.features.pressure.pressureTick(sp);
assert.equal(group.active, false);
for (let i = 0; i < 20; i++) step();
assert.equal(
  g.db.world.miningPressure.encounters.filter((x) => x.active).length,
  0,
  'kill cannot reset300s cooldown',
);
assert.equal(
  g.db.world.miningPressure.captains.find((x) => x.owner === g.db.key(a.data.name)).lastEncounter,
  last,
);
const count = g.db.world.miningPressure.hazards.length;
g.db.touch();
g.db.flush();
const reload = refineryGame(new DB(g.db.dir));
assert.equal(
  reload.db.world.miningPressure.captains.find((x) => x.owner === g.db.key(a.data.name))
    .lastEncounter,
  last,
);
assert.ok(
  reload.db.world.miningPressure.hazards.every((h) => h.resolved),
  'restart cannot replay stale effects',
);
assert.equal(reload.db.world.miningPressure.consent.length, 0);
assert.ok(count > 0);
const oldNoise = g.features.pressure.payload(a).noise;
for (let i = 0; i < 10; i++) {
  g.features.mining.advanceClock(1);
  g.features.pressure.pressureTick(sp);
}
assert.ok(g.features.pressure.payload(a).noise < oldNoise, 'leaving/cooling usespersistentclock');
// Main-galaxy newcomer owns the noise but cannot be attacked; Farside retains no truce.
for (const [sys, expected] of [
  ['meridian', false],
  ['mirrorfall', true],
]) {
  const h = refineryGame(),
    s = refineryPilot(h, `Protected${expected}`),
    ship = fly(h, s, sys, false),
    space = h.spaces[sys];
  space.ships = new Map([[ship.id, ship]]);
  const r = space.rocks[0];
  r.captain = h.db.key(s.data.name);
  h.features.pressure.work(space, r, 30);
  h.features.pressure.pressureTick(space);
  assert.equal(
    h.db.world.miningPressure.encounters.some((e) => e.active),
    expected,
  );
  const p = h.db.world.miningPressure.captains[0];
  assert.ok(p.noise >= 70);
  if (!expected) assert.equal(h.features.pressure.shotAllowed(space, 'nonexistent', ship), false);
}
// Real simultaneous captains share one useful-time union, neither the last
// collision nor duplicate mounts can offload/multiply all of another miner's noise.
{
  const h = refineryGame(),
    a = refineryPilot(h, 'UnionA'),
    b = refineryPilot(h, 'UnionB'),
    ea = fly(h, a),
    eb = fly(h, b),
    space = h.spaces.meridian;
  space.ships = new Map([
    [ea.id, ea],
    [eb.id, eb],
  ]);
  const r = space.rocks[0];
  r.x = 100100;
  r.y = 100000;
  r.hp = r.max = 1e9;
  r.seam = Math.PI;
  ea.x = eb.x = 100000;
  ea.y = eb.y = 100000;
  ea.a = eb.a = Math.PI / 2;
  const gun = {
    w: 9101,
    n: 1,
    p: weaponParams(h.A.weapons[9101]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  };
  h.features.mining.advanceClock(DT);
  space.t += DT;
  space.fire(ea, gun, null, ea.a);
  space.fire(eb, gun, null, eb.a);
  h.features.mining.endTick(space);
  const na = h.features.pressure.payload(a).noise,
    nb = h.features.pressure.payload(b).noise;
  assert.ok(na > 0 && nb > 0);
  assert.ok(Math.abs(na - nb) < 1e-10);
  assert.ok(Math.abs(na + nb - DT * 7) < 1e-10, 'one real union, split attribution');
}
console.log('ALL REAL MINING PRESSURE / TELEGRAPH / CONSENT / NEWCOMER / PERSISTENCE TESTS PASSED');
