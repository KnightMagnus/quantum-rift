// Observable production collision, finite accounting and checkpoint recovery; no player saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { Space } from '../server/space.js';
import { DT, makeLoadout } from '../shared/rules.js';
import { contactTime, rollGrades, randomOf, stageCount } from '../shared/mining-rules.js';
import { assertLots, clearLots } from '../shared/cargo-lots.js';
import { tempDataDir } from './helpers/temp-data.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
function game(db = new DB(tempDataDir('rift-mining-'))) {
  const interval = globalThis.setInterval;
  try {
    globalThis.setInterval = () => ({ unref() {} });
    return new Game(structuredClone(A), db);
  } finally {
    globalThis.setInterval = interval;
  }
}
function pilot(g, name) {
  const sock = Object.assign(new EventEmitter(), {
    open: true,
    backlog: 0,
    out: [],
    send(m) {
      this.out.push(typeof m === 'string' ? JSON.parse(m) : m);
    },
    close() {},
  });
  g.connect(sock, '127.0.0.1');
  const s = [...g.sessions.values()].at(-1);
  g.onMessage(s, { t: 'hello', name, pass: 'fixture' });
  s.data.tut = 999;
  s.data.stellar = null;
  s.data.sys = 'meridian';
  s.data.ship = makeLoadout(g.A, 704, 'Miner');
  g.spawnPlayer(s, 0, 0, 0, 0);
  return s;
}
const g = game(),
  s = pilot(g, 'Cutter'),
  sp = g.spaces.meridian;
sp.ships = new Map([[s.ent.id, s.ent]]);
sp.players = 1;
let tokenCalls = 0;
g.features.specialists.specGain = () => {
  tokenCalls++;
};
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    g.features.mining.advanceClock(DT);
    sp.tick();
  }
}
function choose(radius) {
  const r =
    sp.rocks.find((r) => !r.down && r.r === radius) ||
    sp.rocks.find((r) => !r.down && stageCount(r.r) === stageCount(radius));
  assert.ok(r);
  return r;
}
function setup(w, r) {
  const e = s.ent;
  r.x = 100000 + Math.abs(r.id) * 1000;
  r.y = 100000;
  e.guns = []; // Use actual weapon parameters and production Space.fire rather than trusted contact messages.
  const p = g.A.weapons[w];
  return import('../shared/rules.js').then(({ weaponParams }) => {
    const gun = {
      w,
      n: 1,
      p: weaponParams(p),
      cd: 0,
      ammo: Infinity,
      snd: 'laser',
      sec: false,
      sndT: 0,
    };
    e.guns = [gun];
    e.x = r.x + r.r + 100;
    e.y = r.y;
    e.a = -Math.PI / 2;
    e.vx = e.vy = 0;
    e.inp = {};
    e.player.lastInput = null;
    r.seam = 0;
    return gun;
  });
}
function invariant(r) {
  const f = g.db.world.mining.systems.meridian;
  const floating = f.parcels
    .filter((p) => p.it.generationKey === r.key)
    .reduce((n, p) => n + Object.values(p.it.remainingLots).reduce((a, b) => a + b, 0), 0);
  if (r.budget >= 0)
    assert.equal(r.accepted + floating + r.pending + r.expired + r.discarded, r.budget);
  assertLots(s.data.cargo, s.data.cargoLots);
}
assert.deepEqual([stageCount(20), stageCount(30), stageCount(44)], [1, 2, 3]);
for (const hz of [30, 60]) {
  let work = 0;
  for (let i = 0; i < hz * 3; i++)
    work += contactTime(
      [
        { from: 0, to: 3, seam: true },
        { from: 1, to: 2, seam: false },
      ],
      i / hz,
      (i + 1) / hz,
    ).seconds;
  assert.ok(Math.abs(work - 3) < 1e-10);
}
assert.deepEqual(rollGrades(100, true, randomOf(42)), rollGrades(100, true, randomOf(42)));
console.log(
  'Deterministic grading/stage thresholds; contact union invariant at30/60Hz helper rates.',
);
// Real beams: latch readiness without immediate payout; maintain contact until clean heat, release once.
for (const w of [9101, 9102]) {
  const r = choose(20);
  const before = sp.loot.length;
  const gun = await setup(w, r);
  for (let i = 0; i < 100; i++) {
    g.features.mining.advanceClock(DT);
    sp.t += DT;
    sp.fire(s.ent, gun, null, s.ent.a);
    g.features.mining.endTick(sp);
  }
  assert.ok(r.ready);
  assert.ok(r.heat >= 60 && r.heat <= 80);
  assert.equal(sp.loot.length, before);
  const hp = r.hp;
  const work = r.work;
  sp.fire(s.ent, gun, null, s.ent.a);
  sp.fire(s.ent, gun, null, s.ent.a);
  g.features.mining.endTick(sp);
  assert.equal(r.hp, hp, 'duplicate beam frame suppressed');
  assert.equal(r.work, work, 'same-time duplicate cannot advance work');
  step(8);
  assert.equal(r.stage, 1);
  assert.ok(r.down);
  invariant(r);
}
console.log(
  'Both real beam weapons reach ready then clean release; duplicate frames cannot mint work/reward.',
);
// Fresh rock for actual Tapper flight/cadence, with deliberate cooling breaks before overheat.
const tap = choose(30),
  gun = await setup(181, tap);
let fired = 0,
  cooling = false;
for (let i = 0; i < 2400 && tap.stage === 0; i++) {
  if (!tap.ready && tap.heat >= 45) cooling = true;
  if (cooling && tap.heat < 1) cooling = false;
  if (i % 22 === 0 && (!cooling || tap.ready) && tap.heat < 64) {
    sp.fire(s.ent, gun, null, s.ent.a);
    fired++;
  }
  step();
}
assert.ok(fired > 1);
assert.equal(tap.stage, 1, 'Tapper clean/ordinary release succeeds through real cadence');
assert.equal(tap.lastCut, 'clean', 'Tapper clean release attainable');
assert.equal(tap.penalty, false, 'controlled Tapper work avoids overheat');
invariant(tap);
console.log(
  'Real projectile Tapper cadence/travel creates bounded contact leases and a staged parcel.',
);
// Early release retains HP/work, no parcel; target switching cannot reset rock state.
const early = choose(44),
  heavy = await setup(9102, early);
const initial = early.hp;
g.features.mining.advanceClock(DT);
sp.t += DT;
sp.fire(s.ent, heavy, null, s.ent.a);
g.features.mining.endTick(sp);
const earlyWork = early.work;
assert.ok(early.hp < initial);
step(10);
assert.ok(early.work >= earlyWork);
assert.equal(early.stage, 0);
assert.ok(!early.ready);
const savedWork = early.work;
const beforeHeat = early.heat;
g.features.mining.advanceClock(1);
g.features.mining.endTick(sp);
assert.equal(early.work, savedWork);
assert.equal(early.heat, Math.max(0, beforeHeat - 10));
// Overheat has a single prospective penalty over all stages.
for (let i = 0; i < 160; i++) {
  g.features.mining.advanceClock(DT);
  sp.t += DT;
  sp.fire(s.ent, heavy, null, s.ent.a);
  g.features.mining.endTick(sp);
}
assert.ok(early.penalty);
const discarded = early.discarded;
assert.ok(discarded > 0);
for (let stage = early.stage; stage < early.stages; stage++) {
  g.features.mining.ordinary(sp, early, 1e9);
  invariant(early);
}
assert.equal(early.discarded, discarded);
assert.equal(early.pending, 0);
// Partial pickups: the real onLoot path debits fixed lots; collectors/bonuses cannot reroll.
const parcel = sp.loot.find((p) => p.it.generationKey === early.key);
assert.ok(parcel);
const original = structuredClone(parcel.it.remainingLots);
clearLots(s.data.cargo, s.data.cargoLots);
const cap = g.features.shipStats.stats(s.data).cargo;
s.data.cargo.food = cap;
assert.equal(g.onLoot(g.pref(s), parcel.it), false);
assert.deepEqual(parcel.it.remainingLots, original);
s.data.cargo.food = cap - 1;
const mined = s.data.stats.mined || 0;
g.onLoot(g.pref(s), parcel.it);
assert.equal(s.data.stats.mined, mined + 1);
invariant(early);
delete s.data.cargo.food;
g.onLoot(g.pref(s), parcel.it);
const remaining = Object.values(parcel.it.remainingLots).reduce((a, b) => a + b, 0);
if (!remaining) {
  const mined2 = s.data.stats.mined;
  g.onLoot(g.pref(s), parcel.it);
  assert.equal(s.data.stats.mined, mined2);
}
invariant(early);
console.log(
  'Early release/target persistence, prospective overheat once, partial/full holds, repeated collection conserve lots.',
);
// Original economic progression opportunities are shared across clusters/stages/retries.
const tokenRock = choose(30);
let opportunities = 0;
const onMine = g.features.specialists.specOnMine;
g.features.specialists.specOnMine = () => {
  opportunities++;
};
clearLots(s.data.cargo, s.data.cargoLots);
for (let i = 0; i < tokenRock.stages; i++) g.features.mining.ordinary(sp, tokenRock, 1e9);
for (const p of [...g.db.world.mining.systems.meridian.parcels].filter(
  (p) => p.it.generationKey === tokenRock.key,
)) {
  g.onLoot(g.pref(s), p.it);
  g.onLoot(g.pref(s), p.it);
  invariant(tokenRock);
}
assert.equal(
  opportunities,
  tokenRock.tokens.length,
  'visual splits preserve original opportunity count',
);
g.features.specialists.specOnMine = onMine;
// Duplicate projectile evidence is denied, and its captured captain survives source departure.
const departed = choose(44),
  departedGun = await setup(181, departed);
sp.fire(s.ent, departedGun, null, s.ent.a);
const shot = sp.shots.at(-1);
assert.equal(shot.mining.captain, g.db.key(s.name));
sp.ships.delete(s.ent.id);
for (let i = 0; i < 30 && !departed.seen[shot.mining.contactId]; i++) step();
assert.ok(Object.hasOwn(departed.seen, shot.mining.contactId));
assert.equal(departed.captain, g.db.key(s.name));
const shotHP = departed.hp;
g.features.mining.contact(sp, departed, {
  source: shot.mining,
  damage: 999,
  x: departed.x,
  y: departed.y,
  projectile: true,
});
assert.equal(departed.hp, shotHP, 'same shot cannot debit HP twice');
sp.ships.set(s.ent.id, s.ent);
// Fully exhausted generations roll over once; old floating parcels expire, never remint.
const oldKey = tokenRock.key,
  oldId = tokenRock.id,
  regrow = tokenRock.down;
while (g.db.world.mining.clock <= regrow)
  g.features.mining.advanceClock(Math.min(1, regrow - g.db.world.mining.clock + 0.01));
g.features.mining.endTick(sp);
const next = sp.rocks.find(
  (r) => r.key === oldKey.replace(/:\d+$/, ':' + (tokenRock.generation + 1)),
);
assert.ok(next);
assert.notEqual(next.id, oldId);
assert.equal(next.generation, tokenRock.generation + 1);
assert.equal(next.budget, -1);
assert.equal(next.work, 0);
assert.equal(next.heat, 0);
for (const r of g.db.world.mining.systems.meridian.history) invariant(r);
console.log(
  'Shared original progression tokens, captured departed-source projectile attribution/deduplication, generation rollover and expiry conservation passed.',
);
// Survey private bounded snapshots; unknown authority fields, landed/dead/paused/cooldown denied.
assert.equal(g.features.mining.survey(s, { t: 'mining', op: 'survey', n: 99 }), false);
assert.equal(g.features.mining.survey(s, { t: 'mining', op: 'survey' }), true);
const privateState = g.features.mining.payload(s, sp);
assert.ok(privateState.revealed.length > 0);
assert.equal(g.features.mining.survey(s, { t: 'mining', op: 'survey' }), false);
const clock = g.db.world.mining.clock;
g.paused = true;
g.tick();
assert.equal(g.db.world.mining.clock, clock);
g.paused = false;
// Sleep/reopen and clean DB restart preserve exact geometry/work/budget/parcel remainders.
g.features.mining.endTick(sp);
const records = JSON.stringify(g.db.world.mining.systems.meridian);
g.sleep(sp);
const reopened = g.spaces.meridian;
assert.equal(JSON.stringify(g.db.world.mining.systems.meridian), records);
g.db.touch();
g.db.flush();
const g2 = game(new DB(g.db.dir));
const sp2 = g2.spaces.meridian;
assert.equal(sp2.rocks[0].key, reopened.rocks[0].key);
assert.equal(sp2.rocks[0].x, reopened.rocks[0].x);
assert.equal(g2.db.get('Cutter').miningSurvey.cooldownUntil, s.data.miningSurvey.cooldownUntil);
const corrupt = structuredClone(g2.db.world.mining);
corrupt.version = 99;
g2.db.world.mining = corrupt;
assert.throws(() => g2.features.mining.init(), /Invalid mining/);
assert.equal(g2.db.world.mining.version, 99);
for (const mutate of [
  (r) => (r.releaseHeat = NaN),
  (r) => (r.ready = 'yes'),
  (r) => (r.id = -1),
  (r) => (r.leases = [{ from: 0, to: 99, seam: true }]),
  (r) => (r.seen = { bad: Infinity }),
]) {
  const bad = structuredClone(g.db.world.mining);
  mutate(bad.systems.meridian.rocks[0]);
  g2.db.world.mining = bad;
  assert.throws(
    () => g2.features.mining.init(),
    /Invalid mining/,
    'malformed save rejected before mutation',
  );
}

console.log(
  'Survey denial/private reveal, pause clock, sleep/reload identity and corrupt version fail-closed.',
);
// Real torn-checkpoint fault after players rename but before world rename; recovery rolls BOTH forward.
const dir = tempDataDir('rift-mining-checkpoint-'),
  db = new DB(dir);
db.players = structuredClone(g.db.players);
db.world = structuredClone(g.db.world);
db.touch();
db.flush();
const before = db.get('Cutter').cargo.ore || 0;
db.get('Cutter').cargo.ore = before + 1;
db.world.mining.clock += 7;
const expectedClock = db.world.mining.clock;
db.touch();
const rename = fs.renameSync;
try {
  fs.renameSync = (src, dst) => {
    if (dst === db.wfile) throw new Error('injected between snapshot renames');
    return rename(src, dst);
  };
  assert.throws(() => db.flush(), /injected/);
} finally {
  fs.renameSync = rename;
}
assert.ok(fs.existsSync(db.journal));
assert.throws(() => db.flush(), /requires recovery/);
const recovered = new DB(dir);
assert.equal(recovered.get('Cutter').cargo.ore, before + 1);
assert.equal(recovered.world.mining.clock, expectedClock);
assert.ok(!fs.existsSync(recovered.journal));
console.log(
  'Committed journal recovers both snapshots after injected fault between player/world renames.',
);
console.log('ALL MINING PRODUCTION TESTS PASSED');
