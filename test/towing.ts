import { mockShipStats, mockMission, mockRawStellarBody } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import {
  tug as createTugFixture,
  survey,
  attach,
  command,
  atPort,
  advance,
} from './helpers/towing-fixture.ts';
import { TOW as towingRules } from '../shared/towing-rules.ts';
import { step } from '../shared/rules.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
const feature = createTugFixture(),
  { g: game, s: session, sp: space } = feature;
let options = feature.o;
assert.equal(
  requiredFixtureValue(game.features.towing.payload(session)).objects.find(
    (entry) => entry.id === requiredFixtureValue(options).id,
  )!.mass,
  null,
);
assert.equal(command(feature, 'attach'), false, 'must really survey');
survey(feature);
assert.equal(command(feature, 'attach', { owner: 'forged' }), false);
requiredFixtureValue(session).ent.vx = 61;
assert.equal(command(feature, 'attach'), false, 'no fast attachment');
requiredFixtureValue(session).ent.vx = 0;
attach(feature);
const mass = { ...requiredFixtureValue(options).lots },
  credits = requiredFixtureValue(session).data.credits,
  fragments = { ...requiredFixtureValue(session).data.bp },
  smelter = requiredFixtureValue(session).data.ship.industrial;
assert.equal(requiredFixtureValue(options).status, 'attached');
assert.equal(command(feature, 'attach'), false);
// Real physics with afterburner, extreme drift and formation/catchup speed cannot ease above hard cap.
for (const hull of [815, 704]) {
  const pilotFixture = createTugFixture(undefined, 'Cap', hull);
  attach(pilotFixture);
  for (const drift of [0, 5000]) {
    Object.assign(requiredFixtureValue(pilotFixture.s).ent, {
      vx: drift,
      vy: 0,
      a: Math.PI / 2,
      fuel: 10000,
    });
    const horizontalPosition2 = requiredFixtureValue(pilotFixture.s).ent.x;
    const shipStats = {
      ...requiredFixtureValue(pilotFixture.s).ent.st,
      afterburner: 1,
      maxSpeed: 10000,
      accel: 5000,
    };
    step(requiredFixtureValue(pilotFixture.s).ent, shipStats, { thrust: 1, ab: 1 }, 0.5);
    assert.ok(
      Math.hypot(
        requiredFixtureValue(pilotFixture.s).ent.vx,
        requiredFixtureValue(pilotFixture.s).ent.vy,
      ) <=
        requiredFixtureValue(pilotFixture.s).ent.towCap! + 1e-8,
    );
    assert.ok(
      Math.hypot(
        requiredFixtureValue(pilotFixture.s).ent.x - horizontalPosition2,
        requiredFixtureValue(pilotFixture.s).ent.y - requiredFixtureValue(pilotFixture.o).y,
      ) <= 1000,
      'bounded position',
    );
  }
  // The actual Space formation/catchup and thrust route uses the same hard step.
  requiredFixtureValue(pilotFixture.s).ent.catchup = mockShipStats({
    maxSpeed: 9000,
    accel: 5000,
    turn: 20,
  });
  requiredFixtureValue(pilotFixture.s).ent.vx = 0;
  requiredFixtureValue(pilotFixture.s).ent.vy = 0;
  requiredFixtureValue(pilotFixture.s).lastInput = {
    seq: 1,
    thrust: 1,
    turn: 0,
    ab: 1,
    rev: 0,
    fire1: 0,
    fire2: 0,
  };
  requiredFixtureValue(pilotFixture.s).ent.st.afterburner = 1;
  advance(pilotFixture, 1);
  assert.ok(
    Math.hypot(
      requiredFixtureValue(pilotFixture.s).ent.vx,
      requiredFixtureValue(pilotFixture.s).ent.vy,
    ) <=
      (hull === 815 ? 60 : 30) + 1e-8,
  );
}
const invalidValue = createTugFixture(undefined, 'Bad', 703);
assert.equal(command(invalidValue, 'attach'), false, 'small fighter-like hold ineligible');
const unequipped = createTugFixture(undefined, 'Bare', 704);
delete requiredFixtureValue(unequipped.s).data.ship.outfits[towingRules.rig];
survey(unequipped);
assert.equal(command(unequipped, 'attach'), false);
// Consensual transfer: only explicit recipient acceptance, never Armada consent/offer alone.
const peer = createTugFixture(game, 'TowPeer');
Object.assign(requiredFixtureValue(peer.s).ent, {
  x: requiredFixtureValue(session).ent.x + 20,
  y: requiredFixtureValue(session).ent.y,
  vx: 0,
  vy: 0,
});
peer.o = options;
assert.equal(command(feature, 'offer', { to: requiredFixtureValue(peer.s).data.name }), true);
assert.equal(
  requiredFixtureValue(options).owner,
  game.db.key(requiredFixtureValue(session).data.name),
);
assert.equal(
  command(peer, 'deliver', { port: requiredFixtureValue(options).acceptPorts[0] }),
  false,
);
const oldRevision = requiredFixtureValue(options).revision;
assert.equal(command(peer, 'accept'), true);
assert.equal(
  requiredFixtureValue(options).owner,
  game.db.key(requiredFixtureValue(peer.s).data.name),
);
assert.equal(requiredFixtureValue(session).ent.towCap, undefined);
assert.equal(
  game.features.towing.command(session, {
    t: 'towing',
    op: 'detach',
    id: requiredFixtureValue(options).id,
    revision: oldRevision,
  }),
  false,
  'stale mutation denied',
);
assert.equal(command(peer, 'detach'), true);
const grace = requiredFixtureValue(options).graceUntil;
assert.equal(command(peer, 'detach'), false);
assert.equal(requiredFixtureValue(options).graceUntil, grace, 'no unattached grace extension');
assert.equal(command(feature, 'attach'), false, 'foreign captain cannot steal grace');
game.features.mining.advanceClock(1);
assert.equal(requiredFixtureValue(options).graceUntil, grace);
survey(peer);
assert.equal(command(peer, 'attach'), true);
// Capacity and accepted-port access precede ALL accounting; exact receipt retries never pay twice.
const player = atPort(peer);
const capacity = requiredFixtureValue(game.features.shipStats.stats(peer.s.data)).cargo;
requiredFixtureValue(peer.s).data.missions = [
  mockMission({ type: 'cargo', qty: capacity - towingRules.mass + 1 }),
];
const before = JSON.stringify(game.db.world.towing);
assert.equal(command(peer, 'deliver', { port: player.id }), false);
assert.equal(JSON.stringify(game.db.world.towing), before);
requiredFixtureValue(peer.s).data.missions = [];
requiredFixtureValue(peer.s).data.rep[systemsById[requiredFixtureValue(options).sys].faction] = -40;
assert.equal(command(peer, 'deliver', { port: player.id }), false);
requiredFixtureValue(peer.s).data.rep[systemsById[requiredFixtureValue(options).sys].faction] = 10;
assert.equal(command(peer, 'deliver', { port: player.id }), true);
peer.o = requiredFixtureValue(
  requiredFixtureValue(
    requiredFixtureValue(game.db.world.towing).slots.find(
      (slot) => slot.object?.id === requiredFixtureValue(options).id,
    ),
  ).object,
);
assert.equal(requiredFixtureValue(peer.s).data.cargo.ore, 24);
assert.deepEqual(requiredFixtureValue(peer.s).data.cargoLots.byCommodity.ore, mass);
assert.equal(command(peer, 'deliver', { port: player.id }), true);
assert.equal(requiredFixtureValue(peer.s).data.cargo.ore, 24);
assert.equal(command(feature, 'deliver', { port: player.id }), false);
assert.equal(requiredFixtureValue(session).data.credits, credits);
assert.deepEqual(requiredFixtureValue(session).data.bp, fragments);
assert.equal(requiredFixtureValue(session).data.ship.industrial, smelter);
assert.equal(
  game.features.towing.destroy(
    peer.s,
    requiredFixtureValue(options).id,
    requiredFixtureValue(peer.o).revision,
  ),
  false,
  'paid object cannot also fragment',
);
// Owner-only destruction discards the finite mass, without ore/credits/fragments or ordinary parcel emission.
const dead = createTugFixture(undefined, 'Scuttle');
attach(dead);
const loot = dead.sp.loot.length;
assert.equal(
  dead.g.features.towing.destroy(
    dead.s,
    requiredFixtureValue(dead.o).id,
    requiredFixtureValue(dead.o).revision,
  ),
  true,
);
assert.equal(requiredFixtureValue(dead.o).hp, 0);
assert.equal(requiredFixtureValue(dead.s).data.cargo.ore || 0, 0);
assert.equal(dead.sp.loot.length, loot);
assert.equal(
  dead.g.features.towing.destroy(
    dead.s,
    requiredFixtureValue(dead.o).id,
    requiredFixtureValue(dead.o).revision,
  ),
  false,
);
// Other captains/projectiles/hazards never acquire a motherlode as a normal damage collider.
assert.equal(
  space.rocks.some((result) => result.id === requiredFixtureValue(options).id),
  false,
);
const neutral = createTugFixture(game, 'Neutral');
const hitPoints = requiredFixtureValue(neutral.s).ent.armor,
  shield = requiredFixtureValue(neutral.s).ent.shield;
advance(neutral, 1);
assert.equal(requiredFixtureValue(neutral.s).ent.armor, hitPoints);
assert.equal(requiredFixtureValue(neutral.s).ent.shield, shield);
console.log(
  'Finite motherlodes: surveyed equipment/range authority, hard60/30 physics, consensual revisioned transfer, capacity/permission/once-only exact-grade port delivery, terminal destruction and neutral safety.',
);

// Real transit/lifecycle coordinator paths preserve systems, fuel and the external asset.
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const { g: game3, s: session3, sp: message, o: options3 } = pilotFixture,
    systemId = requiredFixtureValue(session3).data.sys,
    fuel = requiredFixtureValue(session3).ent.fuel;
  game3.jump(session3, systemsById[systemId].links[0]);
  assert.equal(requiredFixtureValue(session3).ent.state, 'fly');
  assert.equal(requiredFixtureValue(session3).ent.fuel, fuel);
  requiredFixtureValue(session3).ent.state = 'jumpout';
  requiredFixtureValue(session3).ent.jumpT = 0;
  game3.finishJump(requiredFixtureValue(session3).ent, message);
  assert.equal(requiredFixtureValue(session3).data.sys, systemId);
  assert.equal(requiredFixtureValue(session3).ent.state, 'fly');
  const gate = mockRawStellarBody({
    id: 'tow-test-gate',
    x: requiredFixtureValue(session3).ent.x,
    y: requiredFixtureValue(session3).ent.y,
    r: 500,
    wormhole: systemsById[systemId].links[0],
  });
  game3.wormholeTransit(requiredFixtureValue(session3).ent, message, gate);
  assert.equal(requiredFixtureValue(session3).data.sys, systemId);
  const gateFlag = message.sys.gate;
  Reflect.set(message.sys, 'gate', true);
  message.sys.stellars.push(gate);
  try {
    advance(pilotFixture, 0.1);
    assert.equal(requiredFixtureValue(session3).data.sys, systemId);
  } finally {
    message.sys.stellars.pop();
    message.sys.gate = gateFlag;
  }
  const stellarBody = atPort(pilotFixture);
  game3.land(session3, stellarBody.id);
  assert.ok(requiredFixtureValue(session3).ent);
  assert.equal(requiredFixtureValue(session3).data.stellar, null);
  message.remove(requiredFixtureValue(session3).ent, 'death');
  assert.equal(requiredFixtureValue(options3).status, 'detached');
  assert.equal(requiredFixtureValue(session3).data.cargo.ore || 0, 0);
  assert.ok(
    requiredFixtureValue(options3).graceUntil > requiredFixtureValue(game3.db.world.mining).clock,
  );
}

// Transfer has the same relative-motion boundary as attachment, immediately.
{
  const pilotFixture = createTugFixture();
  attach(pilotFixture);
  const pilotFixture2 = createTugFixture(pilotFixture.g, 'Moving Peer', 704);
  pilotFixture2.o = pilotFixture.o;
  Object.assign(requiredFixtureValue(pilotFixture2.s).ent, {
    x: requiredFixtureValue(pilotFixture.s).ent.x + 20,
    y: requiredFixtureValue(pilotFixture.s).ent.y,
    vx: -30,
    vy: 0,
  });
  Object.assign(requiredFixtureValue(pilotFixture.s).ent, { vx: 60, vy: 0 });
  Object.assign(pilotFixture.o, { vx: 60, vy: 0 });
  assert.equal(
    command(pilotFixture, 'offer', { to: requiredFixtureValue(pilotFixture2.s).data.name }),
    true,
  );
  const before = JSON.stringify(pilotFixture.g.db.world.towing);
  assert.equal(
    command(pilotFixture2, 'accept'),
    false,
    'opposing90 relative speed cannot transfer',
  );
  assert.equal(
    JSON.stringify(pilotFixture.g.db.world.towing),
    before,
    'denial preserves owner revision and offer',
  );
  requiredFixtureValue(pilotFixture2.s).ent.vx = 30;
  assert.equal(command(pilotFixture2, 'accept'), true, 'safe30 relative moving handoff');
  assert.equal(
    requiredFixtureValue(pilotFixture.o).owner,
    pilotFixture.g.db.key(requiredFixtureValue(pilotFixture2.s).data.name),
  );
  assert.ok(
    Math.hypot(requiredFixtureValue(pilotFixture.o).vx, requiredFixtureValue(pilotFixture.o).vy) <=
      30,
  );
  assert.ok(
    Math.hypot(
      requiredFixtureValue(pilotFixture2.s).ent.vx,
      requiredFixtureValue(pilotFixture2.s).ent.vy,
    ) <= 30,
  );
}
