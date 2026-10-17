// Natural renewal is a new finite generation, never a reset of an extracted ledger.
import assert from 'node:assert/strict';
import { refineryGame } from './helpers/refinery-fixture.js';
import { DB } from '../server/db.js';
import { MINING } from '../shared/mining-rules.js';
const fields = ['ore', 'gas', 'shards'].map((ore, i) => ({
  x: i * 1000,
  y: 0,
  r: 500,
  ore,
  rich: 2,
  rocks: 12,
}));
function space(g) {
  const sp = { id: 'meridian', sys: { fields }, rocks: [], loot: [], events: [], t: 0 };
  g.features.mining.openSpace(sp);
  return sp;
}
function at(g, sp, time) {
  g.db.world.mining.clock = time;
  g.features.mining.endTick(sp);
}
function full(g, sp, old) {
  const next = sp.rocks.find(
    (r) => r.key.split(':').slice(0, 3).join(':') === old.key.split(':').slice(0, 3).join(':'),
  );
  assert.notEqual(next.id, old.id);
  assert.equal(next.generation, old.generation + 1);
  assert.equal(next.hp, next.max);
  assert.equal(next.stage, 0);
  assert.equal(next.heat, 0);
  assert.equal(next.work, 0);
  assert.equal(next.budget, -1);
  assert.equal(next.down, 0);
  assert.equal(g.features.mining.rocksPayload(sp).rocks.find((r) => r.id === next.id).hp, 100);
  return next;
}
for (const ore of ['ore', 'gas', 'shards']) {
  const g = refineryGame(),
    sp = space(g),
    m = g.features.mining;
  const damaged = sp.rocks.find((r) => r.ore === ore);
  m.ordinary(sp, damaged, 1);
  at(g, sp, MINING.idleRenewal - 0.01);
  assert.ok(sp.rocks.includes(damaged), `${ore}: no early renewal`);
  at(g, sp, MINING.idleRenewal);
  const renewed = full(g, sp, damaged);
  const hp = renewed.hp;
  m.ordinary(sp, damaged, 1e9);
  m.sweep(sp, damaged, 1e9, 'stale');
  m.contact(sp, damaged, { damage: 1e9 });
  assert.equal(renewed.hp, hp, 'stale object cannot damage/mint from new generation');
  assert.equal(sp.loot.length, 0, 'abandoned unissued rock pays no reward');
  assert.equal(g.db.world.mining.systems.meridian.history.length, 0, 'no unissued history leak');
  const depleted = sp.rocks.find((r) => r.ore === ore && r !== renewed);
  while (!depleted.down) m.ordinary(sp, depleted, 1e9);
  const deadline = depleted.down;
  assert.ok(deadline > g.db.world.mining.clock);
  at(g, sp, deadline - 0.01);
  assert.ok(sp.rocks.includes(depleted));
  at(g, sp, deadline);
  full(g, sp, depleted);
}
// Active/recent contacts restart the quiet timer, across sweep and cutting paths.
{
  const g = refineryGame(),
    sp = space(g),
    m = g.features.mining;
  const r = sp.rocks.find((r) => r.stages === 1);
  m.sweep(sp, r, 1, 'worker');
  at(g, sp, 299);
  m.contact(sp, r, {
    damage: 0,
    x: r.x + r.r,
    y: r.y,
    projectile: true,
    source: { contactId: 'active', captain: null, cadence: 1 },
  });
  at(g, sp, 300);
  assert.ok(sp.rocks.includes(r), 'active cutting not reset at old deadline');
  at(g, sp, 598.99);
  assert.ok(sp.rocks.includes(r));
  at(g, sp, 599);
  full(g, sp, r);
}
// Quiet-space late settlement emits original parcels, preserves original budget, then renews.
{
  const g = refineryGame(),
    sp = space(g),
    m = g.features.mining;
  const r = sp.rocks.find((r) => r.stages > 1);
  m.contact(sp, r, {
    damage: 1e6,
    x: r.x + r.r,
    y: r.y,
    projectile: true,
    source: { contactId: 'ready', captain: null, cadence: 1 },
  });
  at(g, sp, 1); // Contact establishes the release deadline; next observation is lazy.
  at(g, sp, MINING.idleRenewal);
  full(g, sp, r);
  const f = g.db.world.mining.systems.meridian;
  assert.ok(f.history.includes(r));
  const parcels = f.parcels.filter((p) => p.it.generationKey === r.key);
  assert.ok(parcels.length);
  assert.equal(r.pending, 0);
  const floating = parcels.reduce(
    (n, p) => n + Object.values(p.it.remainingLots).reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(r.accepted + floating + r.expired + r.discarded, r.budget);
  const nextId = g.db.world.mining.nextId;
  m.endTick(sp);
  assert.equal(g.db.world.mining.nextId, nextId, 'no repeat issuance in same tick');
  g.db.flush();
  const reopened = refineryGame(new DB(g.db.dir));
  assert.equal(
    reopened.db.world.mining.systems.meridian.history[0].id,
    r.id,
    'ledger validates on restart',
  );
  at(g, sp, MINING.idleRenewal + MINING.parcelTTL);
  assert.ok(!f.history.includes(r), 'settled history remains bounded');
}
// Persisted idle deadline survives restart; no offline/paused catchup or repeated lazy generations.
{
  const g = refineryGame(),
    sp = space(g),
    m = g.features.mining,
    r = sp.rocks[0];
  m.ordinary(sp, r, 1);
  at(g, sp, 200);
  g.paused = true;
  m.advanceClock(1);
  assert.equal(g.db.world.mining.clock, 200);
  g.db.flush();
  const reopened = refineryGame(new DB(g.db.dir)),
    wake = space(reopened);
  assert.equal(reopened.db.world.mining.clock, 200);
  assert.equal(wake.rocks[0].id, r.id);
  at(reopened, wake, 300);
  const next = full(reopened, wake, r);
  at(reopened, wake, 1e6);
  assert.equal(wake.rocks[0].id, next.id, 'healthy deposits are not needlessly churned');
}
// Older version-1 saves gain a conservative deadline without reminting on load.
{
  const g = refineryGame(),
    sp = space(g),
    r = sp.rocks[0];
  g.features.mining.ordinary(sp, r, 1);
  at(g, sp, 400);
  const current = sp.rocks[0];
  g.features.mining.ordinary(sp, current, 1);
  delete current.lastActivity;
  g.db.flush();
  const reopened = refineryGame(new DB(g.db.dir)),
    wake = space(reopened);
  assert.equal(wake.rocks[0].id, current.id);
  at(reopened, wake, 699.99);
  assert.equal(wake.rocks[0].id, current.id);
  at(reopened, wake, 700);
  full(reopened, wake, current);
}
console.log(
  'All ore/gas/shard full-health renewal boundaries, active-work protection, stale identities, exact old escrow, bounded history, restart/legacy/pause and lazy wake passed.',
);
