// Observable production collision, finite accounting and checkpoint recovery; no player saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { DT, makeLoadout } from '../shared/rules.ts';
import { contactTime, rollGrades, randomOf, stageCount } from '../shared/mining-rules.ts';
import { assertLots, clearLots } from '../shared/cargo-lots.ts';
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
let _tokenCalls = 0;
g.features.specialists.specGain = () => {
  _tokenCalls++;
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
  return import('../shared/rules.ts').then(({ weaponParams }) => {
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
// Same real departed-source Tapper collision, sampled populated vs quiet. A
// threshold reached during a lease must survive cooling before the next sample.
async function tapperSampling(quiet, ready) {
  const game_ = game(),
    session = pilot(game_, `Heat${quiet}${ready}`),
    space = game_.spaces.meridian;
  space.ships = new Map([[session.ent.id, session.ent]]);
  const rock = space.rocks.find((r) => stageCount(r.r) === 2);
  rock.x = 100000;
  rock.y = 100000;
  rock.seam = 0;
  rock.hp = ready ? 1 : rock.max;
  const { weaponParams } = await import('../shared/rules.ts');
  const weapon = {
    w: 181,
    n: 1,
    p: weaponParams(game_.A.weapons[181]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  };
  const entity = session.ent;
  entity.x = rock.x + rock.r + 100;
  entity.y = rock.y;
  entity.a = -Math.PI / 2;
  entity.guns = [weapon];
  space.fire(entity, weapon, null, entity.a);
  const shot = space.shots.at(-1);
  space.ships.delete(entity.id); // Captured real provenance survives departure.
  for (let i = 0; i < 30 && !Object.hasOwn(rock.seen, shot.mining.contactId); i++) {
    game_.features.mining.advanceClock(DT);
    space.tick();
  }
  assert.ok(Object.hasOwn(rock.seen, shot.mining.contactId));
  assert.equal(rock.captain, game_.db.key(session.name));
  assert.equal(rock.ready, ready);
  rock.heat = 87;
  rock.work = 3;
  for (let i = 1; i <= 30; i++) {
    game_.features.mining.advanceClock(DT);
    if (!quiet || i % 15 === 0) game_.features.mining.endTick(space);
  }
  assert.equal(rock.penalty, true, 'crossing remains latched after cooling');
  assert.equal(rock.stage, ready ? 1 : 0);
  if (ready) assert.equal(rock.lastCut, 'overheat');
  else {
    assert.equal(rock.budget, -1, 'not-ready crossing does not freeze rewards early');
    assert.equal(rock.discarded, 0);
    game_.features.mining.ordinary(space, rock, 1e9);
  }
  const discarded = rock.discarded;
  assert.ok(discarded > 0, 'one prospective penalty applied');
  while (rock.stage < rock.stages) game_.features.mining.ordinary(space, rock, 1e9);
  assert.equal(rock.discarded, discarded, 'later stage cannot reapply penalty');
  const parcels = game_.db.world.mining.systems.meridian.parcels.filter(
    (p) => p.it.generationKey === rock.key,
  );
  const floating = parcels.reduce(
    (n, p) => n + Object.values(p.it.remainingLots).reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(rock.accepted + floating + rock.pending + rock.expired + discarded, rock.budget);
  return {
    discarded,
    budget: rock.budget,
    floating,
    grades: parcels.map((p) => p.it.remainingLots),
    penalty: rock.penalty,
    penaltyApplied: rock.penaltyApplied,
    stage: rock.stage,
    lastCut: rock.lastCut,
  };
}
for (const ready of [true, false])
  assert.deepEqual(await tapperSampling(true, ready), await tapperSampling(false, ready));
console.log(
  'Real departed Tapper threshold crossings agree at30Hz and quiet0.5s, ready and not-ready; one penalty and conserved mass.',
);
// Replay two real Tapper impacts exactly one second apart. The first ready
// stage's release deadline must settle before the later collision is admitted.
async function separatedTapper(quiet, secondBeam = false) {
  const cg = game(),
    cs = pilot(cg, `Separated${quiet}${secondBeam}`),
    space = cg.spaces.meridian;
  space.ships = new Map([[cs.ent.id, cs.ent]]);
  const r = space.rocks.find((rock) => stageCount(rock.r) === 2),
    e = cs.ent;
  r.x = 100000;
  r.y = 100000;
  r.seam = 0;
  r.hp = 1;
  const { weaponParams } = await import('../shared/rules.ts');
  const gun = {
    w: 181,
    n: 1,
    p: weaponParams(cg.A.weapons[181]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  };
  e.x = r.x + r.r + 100;
  e.y = r.y;
  e.a = -Math.PI / 2;
  e.vx = e.vy = 0;
  e.inp = {};
  e.guns = [];
  space.fire(e, gun, null, e.a);
  const first = space.shots.at(-1);
  let flight = 0;
  while (!Object.hasOwn(r.seen, first.mining.contactId) && flight < 30) {
    cg.features.mining.advanceClock(DT);
    space.tick();
    flight++;
  }
  assert.ok(r.ready);
  assert.ok(flight < 30);
  r.heat = 65;
  r.work = 2;
  const start = cg.db.world.mining.clock,
    endTick = cg.features.mining.endTick;
  let frame = 0,
    second;
  cg.features.mining.endTick = (sp_) => {
    if (!quiet || frame % 15 === 0) endTick(sp_);
  };
  for (frame = 1; frame <= 75; frame++) {
    if (!secondBeam && frame === 31 - flight) {
      space.fire(e, gun, null, e.a);
      second = space.shots.at(-1);
    }
    cg.features.mining.advanceClock(DT);
    if (secondBeam && frame === 30)
      space.fire(e, { ...gun, w: 9101, p: weaponParams(cg.A.weapons[9101]) }, null, e.a);
    space.tick();
    if (frame === 30 && !secondBeam) {
      assert.ok(Object.hasOwn(r.seen, second.mining.contactId), 'second real impact at1s');
      assert.ok(Math.abs(r.seen[second.mining.contactId] - start - 1) < 1e-9);
    }
  }
  assert.equal(r.stage, 1);
  assert.equal(r.lastCut, 'clean');
  assert.equal(r.ready, false, 'later shot belongs to next stage, not old readiness');
  assert.ok(r.hp < r.max && r.hp > 0);
  const parcels = cg.db.world.mining.systems.meridian.parcels.filter(
      (p) => p.it.generationKey === r.key,
    ),
    lots = parcels.map((p) => p.it.remainingLots),
    floating = lots.reduce((n, p) => n + Object.values(p).reduce((a, b) => a + b, 0), 0);
  assert.equal(r.accepted + floating + r.pending + r.expired + r.discarded, r.budget);
  return {
    stage: r.stage,
    lastCut: r.lastCut,
    ready: r.ready,
    hp: r.hp,
    work: r.work,
    heat: r.heat,
    lots,
    budget: r.budget,
    floating,
    pending: r.pending,
  };
}
for (const beam of [false, true]) {
  const quietSeparated = await separatedTapper(true, beam),
    fineSeparated = await separatedTapper(false, beam);
  for (const k of ['heat', 'work']) {
    assert.ok(
      Math.abs(quietSeparated[k] - fineSeparated[k]) < 1e-9,
      `${beam ? 'beam' : 'Tapper'} ${k} sampling parity`,
    );
    delete quietSeparated[k];
    delete fineSeparated[k];
  }
  assert.deepEqual(quietSeparated, fineSeparated);
}
console.log(
  'Separated real Tapper-to-Tapper and Tapper-to-beam contacts settle old clean release and preserve first-frame next-stage work at populated/quiet cadence.',
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
// Repeated production regrowth with accepted/TTL-settled ledgers is bounded.
// Keep one original generation alive through many faster regrowth cycles, then
// collect it exactly once through onLoot; unrelated old ledgers must not pin it.
{
  const cg = game(),
    cs = pilot(cg, 'History'),
    space = cg.spaces.meridian,
    field = cg.db.world.mining.systems.meridian;
  const first = space.rocks.find((r) => stageCount(r.r) === 1);
  const slot = field.rocks.indexOf(first);
  const mods = cg.features.fronts.mods;
  cg.features.fronts.mods = (...args) => ({ ...mods(...args), regrow: 100 });
  function advanceTo(time) {
    while (cg.db.world.mining.clock < time)
      cg.features.mining.advanceClock(Math.min(1, time - cg.db.world.mining.clock));
    cg.features.mining.endTick(space);
  }
  function exhaust(r) {
    while (!r.down) cg.features.mining.ordinary(space, r, 1e9);
    const floating = field.parcels
      .filter((p) => p.it.generationKey === r.key)
      .reduce((n, p) => n + Object.values(p.it.remainingLots).reduce((a, b) => a + b, 0), 0);
    assert.equal(r.accepted + floating + r.expired + r.discarded + r.pending, r.budget);
  }
  exhaust(first);
  const originalBudget = first.budget;
  const originalParcels = field.parcels.filter((p) => p.it.generationKey === first.key);
  advanceTo(first.down + 0.001);
  for (let cycle = 0; cycle < 32; cycle++) {
    const r = field.rocks[slot];
    exhaust(r);
    const parcels = field.parcels.filter((p) => p.it.generationKey === r.key);
    if (cycle < 24 || cycle % 2) {
      clearLots(cs.data.cargo, cs.data.cargoLots);
      for (const p of parcels) cg.onLoot(cg.pref(cs), p.it);
    } else {
      // Production TTL processing; leave the deliberately live old parcels intact.
      advanceTo(Math.max(...parcels.map((p) => p.expires)) + 0.001);
    }
    if (cg.db.world.mining.clock < r.down) advanceTo(r.down + 0.001);
    else cg.features.mining.endTick(space);
    if (cycle >= 24 && cycle % 2 === 0)
      assert.equal(r.expired, r.budget, 'real TTL settles the whole uncollected generation');
    assert.equal(r.pending, 0);
    assert.equal(r.accepted + r.expired + r.discarded, r.budget);
    assert.ok(!field.history.some((x) => x.key === r.key));
    assert.ok(
      field.history.length <= (cycle < 24 ? 1 : 0),
      'settled history cannot grow per regrowth',
    );
    if (cycle < 24) {
      assert.ok(field.history.includes(first), 'live original parcels pin their ledger');
      assert.equal(first.accepted + first.expired, 0);
    }
    if (cycle === 23) {
      clearLots(cs.data.cargo, cs.data.cargoLots);
      const mined = cs.data.stats.mined || 0;
      for (const p of originalParcels) cg.onLoot(cg.pref(cs), p.it);
      assert.equal(cs.data.stats.mined, mined + originalBudget);
      for (const p of originalParcels) cg.onLoot(cg.pref(cs), p.it);
      assert.equal(cs.data.stats.mined, mined + originalBudget, 'old generation accepted once');
      assert.equal(first.accepted, originalBudget);
      cg.features.mining.endTick(space);
      assert.equal(field.history.length, 0);
      cg.db.touch();
      cg.db.flush();
      const reloaded = game(new DB(cg.db.dir));
      assert.equal(reloaded.db.world.mining.systems.meridian.history.length, 0);
    }
  }
}
console.log(
  '32 real regrowth/collection/TTL cycles retain only live generations, collectible exactly once with conserved original budget.',
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
  (r) => (r.id = 0),
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
