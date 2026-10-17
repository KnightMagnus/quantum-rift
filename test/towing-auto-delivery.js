import assert from 'node:assert/strict';
import { tug, attach, atPort, command } from './helpers/towing-fixture.js';
import { STELLARS, SYS } from '../shared/galaxy.js';
import { TOW } from '../shared/towing-rules.js';
const live = (f) => f.g.db.world.towing.slots.find((s) => s.object?.id === f.o.id).object;
// The load, not the ship centre or its rotation/velocity, determines delivery.
for (const a of [0, Math.PI / 2, Math.PI, 4.2]) {
  const f = tug();
  attach(f);
  const p = atPort(f),
    radius = p.r + TOW.deliveryApron;
  Object.assign(f.o, { x: p.x + radius - 0.5, y: p.y, vx: 60, vy: 0 });
  Object.assign(f.s.ent, { x: f.o.x + 150, y: p.y, a, vx: 60, vy: 0 });
  const credits = f.s.data.credits,
    lots = { ...f.o.lots };
  f.g.features.towing.towingTick(f.sp);
  assert.equal(
    live(f).status,
    'delivered',
    'moving/turning load auto-delivers; tug can be outside',
  );
  assert.equal(f.s.ent.towCap, undefined);
  assert.equal(f.s.data.cargo[f.o.ore], f.o.mass);
  assert.deepEqual(f.s.data.cargoLots.byCommodity[f.o.ore], lots);
  assert.equal(f.s.data.credits, credits, 'no bonus credits');
  f.g.features.towing.towingTick(f.sp);
  assert.equal(command(f, 'deliver', { port: p.id }), true, 'receipt retry idempotent');
  assert.equal(f.s.data.cargo[f.o.ore], f.o.mass);
  const peer = tug(f.g, 'Stranger');
  peer.o = f.o;
  assert.equal(
    command(peer, 'deliver', { port: p.id }),
    false,
    'another captain cannot claim receipt',
  );
}
// A segment can enter and leave the circle within one authoritative tick.
{
  const f = tug();
  attach(f);
  const p = atPort(f),
    r = p.r + TOW.deliveryApron;
  Object.assign(f.o, { x: p.x - 0.5, y: p.y + r - 0.0001 });
  Object.assign(f.s.ent, { x: f.o.x + 120, y: f.o.y - 120, a: 0, vx: 60 });
  f.g.features.towing.towingTick(f.sp);
  assert.equal(live(f).status, 'delivered', 'swept tangent crossing is captured');
}
{
  const f = tug();
  attach(f);
  const p = atPort(f),
    r = p.r + TOW.deliveryApron;
  Object.assign(f.o, { x: p.x + r + 20, y: p.y });
  Object.assign(f.s.ent, { x: p.x + r - 20, y: p.y, a: 0 });
  f.g.features.towing.towingTick(f.sp);
  assert.equal(live(f).status, 'attached', 'ship in range alone is insufficient');
  assert.equal(f.s.data.cargo[f.o.ore] || 0, 0);
}
{
  const f = tug();
  attach(f);
  const wrong = Object.values(STELLARS).find(
    (p) => p.system === f.o.sys && !f.o.acceptPorts.includes(p.id),
  );
  assert.ok(wrong);
  Object.assign(f.o, { x: wrong.x, y: wrong.y });
  Object.assign(f.s.ent, { x: wrong.x, y: wrong.y - 100 });
  f.g.features.towing.towingTick(f.sp);
  assert.equal(live(f).status, 'attached', 'unaccepted stellar is not a delivery port');
}
{
  const f = tug();
  attach(f);
  const p = atPort(f);
  f.s.data.rep[SYS[f.o.sys].faction] = -40;
  f.g.features.towing.towingTick(f.sp);
  assert.equal(live(f).status, 'attached', 'hostile port permission remains authoritative');
  f.s.data.rep[SYS[f.o.sys].faction] = 10;
  f.s.data.missions = [{ type: 'cargo', qty: f.g.features.shipStats.stats(f.s.data).cargo }];
  f.g.features.towing.towingTick(f.sp);
  assert.equal(live(f).status, 'detached', 'full hold safely releases intact reserved load');
  assert.equal(live(f).owner, f.g.db.key(f.s.data.name));
  assert.equal(live(f).mass, TOW.mass);
  assert.equal(f.s.ent.towCap, undefined);
  assert.equal(f.s.data.cargo[f.o.ore] || 0, 0);
  const peer = tug(f.g, 'Other');
  peer.o = live(f);
  Object.assign(peer.s.ent, { x: peer.o.x, y: peer.o.y });
  assert.equal(command(peer, 'attach'), false, 'reserved load cannot be stolen');
  f.s.data.missions = [];
  f.o = live(f);
  attach(f);
  f.g.features.towing.towingTick(f.sp);
  assert.equal(live(f).status, 'delivered', 'unload and reclaim completes once');
  assert.equal(command(f, 'deliver', { port: p.id }), true);
  assert.equal(f.s.data.cargo[f.o.ore], TOW.mass);
}
console.log(
  'Automatic load-centred delivery: speed, rotation, swept crossing, wrong port, full hold/reclaim, permissions and duplicate/foreign receipts passed.',
);
// Transactions clone world state; a tick must still process the next captain's
// independent load against the new live slots rather than mutate stale records.
{
  const first = tug();
  attach(first);
  const second = tug(first.g, 'Second');
  second.o = first.g.db.world.towing.slots.find(
    (x) => x.sys === first.o.sys && x.object.id !== first.o.id,
  ).object;
  Object.assign(second.s.ent, { x: second.o.x, y: second.o.y - 90 });
  attach(second);
  atPort(first);
  atPort(second);
  first.g.features.towing.towingTick(first.sp);
  assert.equal(live(first).status, 'delivered');
  assert.equal(live(second).status, 'delivered');
  assert.equal(first.s.data.cargo[first.o.ore], TOW.mass);
  assert.equal(second.s.data.cargo[second.o.ore], TOW.mass);
}
