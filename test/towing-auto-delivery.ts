import { mockMission } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { tug as createTugFixture, attach, atPort, command } from './helpers/towing-fixture.ts';
import { STELLARS, SYS as systemsById } from '../shared/galaxy.ts';
import { TOW as towingRules } from '../shared/towing-rules.ts';
const live = (feature: ReturnType<typeof createTugFixture>) =>
  requiredFixtureValue(
    requiredFixtureValue(
      requiredFixtureValue(feature.g.db.world.towing).slots.find(
        (session) => session.object?.id === feature.o.id,
      ),
    ).object,
  );
// The load, not the ship centre or its rotation/velocity, determines delivery.
for (const firstValue of [0, Math.PI / 2, Math.PI, 4.2]) {
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const player = atPort(pilotFixture),
    radius = player.r + towingRules.deliveryApron;
  Object.assign(pilotFixture.o, { x: player.x + radius - 0.5, y: player.y, vx: 60, vy: 0 });
  Object.assign(requiredFixtureValue(pilotFixture.s).ent, {
    x: requiredFixtureValue(pilotFixture.o).x + 150,
    y: player.y,
    a: firstValue,
    vx: 60,
    vy: 0,
  });
  const credits = requiredFixtureValue(pilotFixture.s).data.credits,
    lots = { ...requiredFixtureValue(pilotFixture.o).lots };
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(
    live(pilotFixture).status,
    'delivered',
    'moving/turning load auto-delivers; tug can be outside',
  );
  assert.equal(requiredFixtureValue(pilotFixture.s).ent.towCap, undefined);
  assert.equal(
    requiredFixtureValue(pilotFixture.s).data.cargo[requiredFixtureValue(pilotFixture.o).ore],
    requiredFixtureValue(pilotFixture.o).mass,
  );
  assert.deepEqual(
    requiredFixtureValue(pilotFixture.s).data.cargoLots.byCommodity[
      requiredFixtureValue(pilotFixture.o).ore
    ],
    lots,
  );
  assert.equal(requiredFixtureValue(pilotFixture.s).data.credits, credits, 'no bonus credits');
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(
    command(pilotFixture, 'deliver', { port: player.id }),
    true,
    'receipt retry idempotent',
  );
  assert.equal(
    requiredFixtureValue(pilotFixture.s).data.cargo[requiredFixtureValue(pilotFixture.o).ore],
    requiredFixtureValue(pilotFixture.o).mass,
  );
  const peer = createTugFixture(pilotFixture.g, 'Stranger');
  peer.o = pilotFixture.o;
  assert.equal(
    command(peer, 'deliver', { port: player.id }),
    false,
    'another captain cannot claim receipt',
  );
}
// A segment can enter and leave the circle within one authoritative tick.
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const stellarBody = atPort(pilotFixture),
    result = stellarBody.r + towingRules.deliveryApron;
  Object.assign(pilotFixture.o, { x: stellarBody.x - 0.5, y: stellarBody.y + result - 0.0001 });
  Object.assign(requiredFixtureValue(pilotFixture.s).ent, {
    x: requiredFixtureValue(pilotFixture.o).x + 120,
    y: requiredFixtureValue(pilotFixture.o).y - 120,
    a: 0,
    vx: 60,
  });
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(live(pilotFixture).status, 'delivered', 'swept tangent crossing is captured');
}
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const stellarBody = atPort(pilotFixture),
    result = stellarBody.r + towingRules.deliveryApron;
  Object.assign(pilotFixture.o, { x: stellarBody.x + result + 20, y: stellarBody.y });
  Object.assign(requiredFixtureValue(pilotFixture.s).ent, {
    x: stellarBody.x + result - 20,
    y: stellarBody.y,
    a: 0,
  });
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(live(pilotFixture).status, 'attached', 'ship in range alone is insufficient');
  assert.equal(
    requiredFixtureValue(pilotFixture.s).data.cargo[requiredFixtureValue(pilotFixture.o).ore] || 0,
    0,
  );
}
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const wrong = Object.values(STELLARS).find(
    (stellarBody) =>
      stellarBody.system === requiredFixtureValue(pilotFixture.o).sys &&
      !requiredFixtureValue(pilotFixture.o).acceptPorts.includes(stellarBody.id),
  );
  assert.ok(wrong);
  Object.assign(pilotFixture.o, { x: wrong.x, y: wrong.y });
  Object.assign(requiredFixtureValue(pilotFixture.s).ent, { x: wrong.x, y: wrong.y - 100 });
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(live(pilotFixture).status, 'attached', 'unaccepted stellar is not a delivery port');
}
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const stellarBody = atPort(pilotFixture);
  requiredFixtureValue(pilotFixture.s).data.rep[
    systemsById[requiredFixtureValue(pilotFixture.o).sys].faction
  ] = -40;
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(
    live(pilotFixture).status,
    'attached',
    'hostile port permission remains authoritative',
  );
  const refusals = () =>
    requiredFixtureValue(pilotFixture.s).sock.out.filter(
      (message: { t: string; msg: string | string[] }) =>
        message.t === 'toast' && message.msg.includes('Port refuses'),
    ).length;
  assert.equal(refusals(), 1, 'automatic refusal is explained');
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(refusals(), 1, 'no per-tick refusal toast spam');
  requiredFixtureValue(pilotFixture.s).data.missions = [
    mockMission({
      type: 'cargo',
      qty: requiredFixtureValue(pilotFixture.g.features.shipStats.stats(pilotFixture.s.data)).cargo,
    }),
  ];
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(
    live(pilotFixture).status,
    'attached',
    'full hold cannot auto-release at a port that refuses permission',
  );
  requiredFixtureValue(pilotFixture.s).data.rep[
    systemsById[requiredFixtureValue(pilotFixture.o).sys].faction
  ] = 10;
  requiredFixtureValue(pilotFixture.s).data.missions = [
    mockMission({
      type: 'cargo',
      qty: requiredFixtureValue(pilotFixture.g.features.shipStats.stats(pilotFixture.s.data)).cargo,
    }),
  ];
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(
    live(pilotFixture).status,
    'detached',
    'full hold safely releases intact reserved load',
  );
  assert.equal(
    live(pilotFixture).owner,
    pilotFixture.g.db.key(requiredFixtureValue(pilotFixture.s).data.name),
  );
  assert.equal(live(pilotFixture).mass, towingRules.mass);
  assert.equal(requiredFixtureValue(pilotFixture.s).ent.towCap, undefined);
  assert.equal(
    requiredFixtureValue(pilotFixture.s).data.cargo[requiredFixtureValue(pilotFixture.o).ore] || 0,
    0,
  );
  const peer = createTugFixture(pilotFixture.g, 'Other');
  peer.o = live(pilotFixture);
  Object.assign(requiredFixtureValue(peer.s).ent, {
    x: requiredFixtureValue(peer.o).x,
    y: requiredFixtureValue(peer.o).y,
  });
  assert.equal(command(peer, 'attach'), false, 'reserved load cannot be stolen');
  requiredFixtureValue(pilotFixture.s).data.missions = [];
  pilotFixture.o = live(pilotFixture);
  attach(pilotFixture);
  pilotFixture.g.features.towing.towingTick(pilotFixture.sp);
  assert.equal(live(pilotFixture).status, 'delivered', 'unload and reclaim completes once');
  assert.equal(command(pilotFixture, 'deliver', { port: stellarBody.id }), true);
  assert.equal(
    requiredFixtureValue(pilotFixture.s).data.cargo[requiredFixtureValue(pilotFixture.o).ore],
    towingRules.mass,
  );
}
console.log(
  'Automatic load-centred delivery: speed, rotation, swept crossing, wrong port, full hold/reclaim, permissions and duplicate/foreign receipts passed.',
);
// Transactions clone world state; a tick must still process the next captain's
// independent load against the new live slots rather than mutate stale records.
{
  const first = createTugFixture();
  attach(first);
  const second = createTugFixture(first.g, 'Second');
  second.o = requiredFixtureValue(
    requiredFixtureValue(first.g.db.world.towing).slots.find(
      (entry) =>
        entry.sys === requiredFixtureValue(first.o).sys &&
        requiredFixtureValue(entry.object).id !== requiredFixtureValue(first.o).id,
    )!.object,
  );
  Object.assign(requiredFixtureValue(second.s).ent, {
    x: requiredFixtureValue(second.o).x,
    y: requiredFixtureValue(second.o).y - 90,
  });
  attach(second);
  atPort(first);
  atPort(second);
  first.g.features.towing.towingTick(first.sp);
  assert.equal(live(first).status, 'delivered');
  assert.equal(live(second).status, 'delivered');
  assert.equal(
    requiredFixtureValue(first.s).data.cargo[requiredFixtureValue(first.o).ore],
    towingRules.mass,
  );
  assert.equal(
    requiredFixtureValue(second.s).data.cargo[requiredFixtureValue(second.o).ore],
    towingRules.mass,
  );
}
