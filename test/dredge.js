import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dredgePilot, control, industrialStep, seed, lots } from './helpers/dredge-fixture.js';
import { SPECIALISTS, BUILD, SPEC, BP_NEED, specPower } from '../shared/specialty.js';
import { STELLARS } from '../shared/galaxy.js';
const f = dredgePilot(),
  { g, s, sp } = f,
  d = s.data;
assert.equal(g.A.ships[815].cost, 2400000);
assert.equal(g.A.ships[815].cargo, 400);
assert.equal(g.A.ships[815].role, 'survey');
assert.equal(g.A.ships[815].fuelRe, 0);

// Preserve every legacy constructor price, not a regenerated roster snapshot.

assert.deepEqual(
  SPECIALISTS.filter((x) => x.id !== 815).map((x) => x.cost),
  [980000, 1190000, 1540000, 1820000, 1680000, 1400000, 1330000, 2100000, 1260000, 1960000],
);
assert.equal(SPEC[805].cost, 980000);
assert.equal(SPECIALISTS.filter((x) => x.id !== 815).length, 10);
const normalBonus = g.features.bonuses.bonus(d).miningPct;
const other = dredgePilot(undefined, 'Precision', 805);
other.s.data.specState[805] = { tier: 5, comp: { special: 5 } };
assert.ok(
  other.g.features.bonuses.bonus(other.s.data).miningPct >=
    200 * specPower(other.s.data.specState[805]),
);
// Actual build requires normal fragments/materials/T3, no plasma; job cargo/passengers checked.
g.dropEscorts(sp, s.ent);
sp.remove(s.ent);
s.ent = null;
const home =
  Object.values(STELLARS).find((p) => p.site && p.system === 'meridian') ||
  Object.values(STELLARS).find((p) => p.site);
d.sys = home.system;
d.stellar = home.id;
d.station.site = home.id;
d.station.ops = BUILD.ops;
g.db.world.sites[home.id] = d.name;
d.bp[815] = BP_NEED;
for (const [cid, grade, n] of BUILD.mats) {
  d.mats[cid] ??= [0, 0, 0, 0, 0];
  d.mats[cid][grade] = n;
}
seed(d, {});
const credits = d.credits,
  trade = g.tradeIn(d);
const formerMissions = d.missions;
d.missions = [{ type: 'cargo', qty: 401 }];
g.features.specialists.specOp(s, { t: 'spec', op: 'build', id: 815 });
assert.equal(d.bp[815], BP_NEED);
assert.equal(d.credits, credits, 'job cargo preserved on denied build');
d.missions = formerMissions;
g.features.specialists.specOp(s, { t: 'spec', op: 'build', id: 815 });
assert.equal(d.ship.hull, 815);
assert.equal(d.credits, credits - (2400000 - trade));
assert.equal(d.bp[815], 0);
assert.equal(d.cargo.plasma || 0, 0);
seed(d, { plasma: lots(5) });
g.features.specialists.specOp(s, { t: 'spec', op: 'parts', id: 815 });
assert.equal(d.cargo.plasma, 0);
assert.equal(d.parts[815], 1);
assert.equal(d.spec.plasma || 0, 0);
// Back to an actual Dredge flight with forward root work and finite original generation.
d.sys = 'meridian';
d.stellar = null;
g.spawnPlayer(s, 10000, 10000, 0, 0);
s.ent.guns = [];
const e = s.ent;
e.a = Math.PI / 2;
e.vx = 80;
e.vy = 0;
const r = sp.rocks.find((r) => r.stages === 1 && !r.down),
  large = sp.rocks.find((r) => r.stages > 1 && !r.down);
r.x = e.x + 120;
r.y = e.y;
r.hp = r.max = 25;
large.x = e.x + 130;
large.y = e.y;
const hp = large.hp;
control(f, 'sweep');
industrialStep(f, 1);
assert.equal(r.lastCut, 'sweep');
assert.equal(large.hp, hp, 'intact multistage excluded');
const parcels = g.db.world.mining.systems.meridian.parcels.filter(
  (p) => p.it.generationKey === r.key,
);
assert.equal(
  parcels.reduce((n, p) => n + p.it.remainingLots.pure, 0),
  0,
);
assert.equal(
  parcels.reduce((n, p) => n + Object.values(p.it.remainingLots).reduce((a, b) => a + b, 0), 0) +
    r.accepted,
  r.budget,
);
assert.equal([...sp.ships.values()].filter((x) => x.industrialRoot === e.id).length, 2);
const sum = r.budget;
for (let i = 0; i < 2; i++) for (const p of parcels) g.onLoot(e.player, p.it);
assert.ok(Object.values(d.cargo).reduce((a, b) => a + b, 0) <= sum);
assert.ok(r.accepted <= sum);
control(f, 'off');
industrialStep(f, 0.1);
assert.equal([...sp.ships.values()].filter((x) => x.industrialRoot).length, 0);
// Wrong hull, forged authority and stationary sweep cannot mutate work.
const before = r.accepted;
control(f, 'sweep', { heat: 0 });
assert.equal(d.ship.industrial.sweep, false);
assert.equal(r.accepted, before);
console.log(
  'Real no-plasma build/parts, legacy Lodestar, root sweep finite mass, multistage exclusion, two collectors and forged requests.',
);
// Real large-rock work in a nonspecialist earns one independent generation opportunity.
{
  const f = dredgePilot(undefined, 'Blueprint', 704),
    { g, s, sp } = f;
  const r = sp.rocks.find((r) => r.stages > 1);
  r.x = 100000;
  r.y = 100000;
  r.hp = r.max = 1800;
  s.ent.x = r.x + r.r + 100;
  s.ent.y = r.y;
  s.ent.a = -Math.PI / 2;
  const { weaponParams } = await import('../shared/rules.js');
  const gun = {
    w: 9102,
    n: 1,
    p: weaponParams(g.A.weapons[9102]),
    cd: 0,
    ammo: Infinity,
    snd: 'laser',
    sec: false,
    sndT: 0,
  };
  s.ent.guns = [gun];
  const random = Math.random;
  try {
    Math.random = () => 0;
    for (let i = 0; i < 1500 && !r.down; i++) {
      g.features.mining.advanceClock(1 / 30);
      sp.t += 1 / 30;
      sp.fire(s.ent, gun, null, s.ent.a);
      g.features.mining.endTick(sp);
    }
  } finally {
    Math.random = random;
  }
  assert.ok(r.down);
  assert.equal(s.data.bp[815], 1, 'one token, not per stage or visible parcel');
  for (let i = 0; i < 10; i++) g.features.mining.endTick(sp);
  assert.equal(s.data.bp[815], 1);
  const unworked = sp.rocks.find((x) => x !== r && x.stages > 1 && !x.down);
  const before = s.data.bp[815];
  g.features.mining.ordinary(sp, unworked, unworked.hp, s.data.name);
  assert.equal(
    s.data.bp[815],
    before,
    'ordinary damage without useful mining work grants no fragment',
  );
}
// Append-only industrial-field migration preserves original rock identity, heat and budget.
{
  const f = dredgePilot(undefined, 'Migration'),
    { g, sp } = f,
    w = g.db.world.mining.systems.meridian,
    all = JSON.parse(w.config),
    old = all.filter((x) => !x.industrial);
  w.config = JSON.stringify(old);
  w.rocks = w.rocks.filter((r) => Number(r.key.split(':')[1]) < old.length);
  sp.rocks = w.rocks;
  sp.loot = [];
  const first = w.rocks[0];
  first.heat = 42;
  const id = first.id,
    budget = first.budget;
  g.features.mining.openSpace(sp);
  assert.equal(w.rocks[0].id, id);
  assert.equal(w.rocks[0].heat, 42);
  assert.equal(w.rocks[0].budget, budget);
  const count = w.rocks.length;
  g.features.mining.openSpace(sp);
  assert.equal(w.rocks.length, count, 'migration idempotent');
  assert.equal(
    w.rocks.filter((r) => r.r <= 23 && Number(r.key.split(':')[1]) >= old.length).length,
    20,
  );
  const valid = w.config;
  w.config = JSON.stringify([{ ...old[0], x: old[0].x + 1 }, ...old.slice(1)]);
  assert.throws(() => g.features.mining.openSpace(sp), /explicit migration/);
  w.config = valid;
}

// Useful-work provenance survives restart and cooperative contact; ordinary finishing
// damage never steals another captain's generation opportunity.
for (const restart of [false, true]) {
  let f = dredgePilot(undefined, 'UsefulWorker', 704);
  const { refineryPilot, refineryGame } = await import('./helpers/refinery-fixture.js');
  const { DB } = await import('../server/db.js');
  const finisher = refineryPilot(f.g, 'OnlyFinisher');
  const r = f.sp.rocks.find((r) => r.stages > 1);
  r.hp = r.max = 1800;
  for (let i = 0; i < 60; i++) {
    f.g.features.mining.advanceClock(1 / 30);
    // Both useful contributors overlap: one opportunity, deterministic account order.
    for (const name of [f.s.data.name, finisher.data.name]) {
      if (name === finisher.data.name && i >= 15) continue;
      f.g.features.mining.contact(f.sp, r, {
        source: {
          captain: f.g.db.key(name),
          source: 1,
          mount: 0,
          weapon: 9102,
          cadence: 1 / 30,
          contactId: `${name}-${i}`,
        },
        damage: 0.01,
        x: r.x,
        y: r.y,
        projectile: false,
      });
    }
    f.g.features.mining.endTick(f.sp);
  }
  assert.equal(r.dredgeContributors[f.g.db.key(finisher.data.name)] < 1.5, true);
  let g = f.g,
    sp = f.sp,
    rock = r;
  const workerName = f.s.data.name,
    finisherName = finisher.data.name;
  if (restart) {
    g.db.flush();
    g = refineryGame(new DB(g.db.dir));
    const resumed = dredgePilot(g, workerName, 704);
    sp = resumed.sp;
    rock = sp.rocks.find((x) => x.key === r.key);
  }
  const random = Math.random;
  try {
    Math.random = () => 0;
    g.features.mining.ordinary(sp, rock, rock.hp, g.db.key(finisherName));
  } finally {
    Math.random = random;
  }
  assert.equal(g.db.get(workerName).bp[815], 1);
  assert.equal(g.db.get(finisherName).bp[815] || 0, 0);
  g.features.mining.ordinary(sp, rock, rock.hp, g.db.key(finisherName));
  assert.equal(g.db.get(workerName).bp[815], 1, 'once per generation, not once per stage');
}

// Persisted provenance fails closed; legacy unattributed totals cannot mint a winner.
{
  const f = dredgePilot(undefined, 'Provenance', 704),
    r = f.sp.rocks.find((r) => r.stages > 1);
  r.dredgeContributors = { [f.g.db.key(f.s.data.name)]: -1 };
  assert.throws(() => f.g.features.mining.init(), /industrial mining contributors/);
  delete r.dredgeContributors;
  r.dredgeWork = 99;
  const random = Math.random;
  try {
    Math.random = () => 0;
    f.g.features.mining.ordinary(f.sp, r, r.hp, f.g.db.key(f.s.data.name));
  } finally {
    Math.random = random;
  }
  assert.equal(f.s.data.bp[815] || 0, 0);
}
