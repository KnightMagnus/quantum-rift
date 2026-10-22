import assert from 'node:assert/strict';
import { tug, attach, command, survey } from './helpers/towing-fixture.js';
import { TOW } from '../shared/towing-rules.ts';
const f = tug(),
  { g, s } = f;
const w = g.db.world.towing,
  initial = w.slots.length;
attach(f);
command(f, 'detach');
const grace = f.o.graceUntil;
const b = tug(g, 'Foreign');
b.o = f.o;
survey(b);
g.db.world.mining.clock = grace - 1;
assert.equal(command(b, 'attach'), false);
g.db.world.mining.clock = grace;
survey(b);
assert.equal(command(b, 'attach'), true);
assert.equal(f.o.owner, g.db.key(b.s.data.name));
// Same pressure ledger, finite retained slots/receipts, never a normal-rock bonus/parcels.
const slot = w.slots.find((x) => x.object?.id === f.o.id);
const beforeLoot = f.sp.loot.length,
  oldId = f.o.id;
assert.equal(g.features.towing.destroy(b.s, f.o.id, f.o.revision), true);
g.features.towing.ensure('meridian');
assert.equal(slot.object.id, oldId, 'no immediate paid respawn');
const nextAt = slot.nextAt;
g.db.world.mining.clock = nextAt - 0.01;
g.features.towing.ensure('meridian');
assert.equal(slot.object.id, oldId);
g.db.world.mining.clock = nextAt;
g.features.towing.ensure('meridian');
assert.ok(slot.object.id > oldId);
assert.equal(slot.object.mass, 24);
assert.equal(slot.object.hp, 100, 'renewed motherlode is full health');
assert.equal(slot.issued, slot.delivered + slot.discarded + slot.object.mass);
const liveId = slot.object.id;
g.db.world.mining.clock += 1e9;
g.features.towing.ensure('meridian');
assert.equal(slot.object.id, liveId, 'lazy time never replaces a live object');
assert.equal(w.slots.length, initial);
assert.equal(f.sp.loot.length, beforeLoot);
for (let i = 0; i < 100; i++) {
  f.o = slot.object;
  Object.assign(s.ent, { x: f.o.x, y: f.o.y - 90, vx: 0, vy: 0 });
  attach(f);
  assert.equal(g.features.towing.destroy(s, f.o.id, f.o.revision), true);
  g.db.world.mining.clock = slot.nextAt;
  g.features.towing.ensure('meridian');
  assert.equal(slot.issued, slot.delivered + slot.discarded + 24);
}
assert.equal(w.slots.length, initial);
assert.ok(w.receipts.length <= TOW.receiptLimit);
const p = g.features.pressure.fieldState('meridian', 0);
assert.ok(p.recovery >= 0 && p.recovery <= 40);
assert.match(p.label, /RECOVERING|STEADY|RICH OPPORTUNITY/);
g.paused = true;
const id = slot.object.id,
  clock = g.db.world.mining.clock;
g.features.mining.advanceClock(1);
g.features.towing.towingTick(f.sp);
assert.equal(g.db.world.mining.clock, clock);
assert.equal(slot.object.id, id);
console.log(
  'Logical-clock grace boundary, same pressure owner, finite authored epochs/recovery and bounded history over 100 generations; no lazy/offline parcels or second rock bounty.',
);
