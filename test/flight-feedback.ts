import assert from 'node:assert/strict';
import { flightFeedbackPayload } from '../server/flight-feedback.ts';
import { ammoReadout, rescueReadout, contactEdge } from '../client/flight-feedback.ts';
import { mockEntity, mockSpace, mockSession, mockPlayerReference } from './helpers/mocks.ts';
const entity = mockEntity({ id: 1, dead: false, state: 'fly', rescueT: 130 });
const session = mockSession({ ent: entity, data: { armada: 'team', stellar: null } });
const mate = mockEntity({
  id: 2,
  dead: false,
  state: 'fly',
  x: 4500,
  y: 0,
  player: mockPlayerReference({ name: 'Wing', s: mockSession({ data: { armada: 'team' } }) }),
});
const outsider = mockEntity({
  id: 3,
  state: 'fly',
  player: mockPlayerReference({ s: mockSession({ data: { armada: 'other' } }) }),
});
const space = mockSpace({
  t: 100,
  ships: new Map([
    [1, entity],
    [2, mate],
    [3, outsider],
  ]),
});
const read = () => flightFeedbackPayload(session, space);
assert.equal(read().rescueSeconds, 30);
space.t = 140;
assert.equal(read().rescueSeconds, 0, 'Expired rescue deadlines never become negative');
space.t = 100;
assert.deepEqual(
  read().contacts.map((contact) => contact.id),
  [2],
  'Unrelated captains remain private',
);
assert.match(rescueReadout(read(), 0, 0), /Nearest rescuer: Wing, 10 km/);
mate.disabled = true;
assert.match(rescueReadout(read(), 0, 0), /No eligible rescuer/);
mate.state = 'jumpout';
assert.equal(read().contacts.length, 0, 'Departed rescuer disappears');
mate.state = 'fly';
mate.dead = true;
assert.equal(read().contacts.length, 0);
entity.rescueT = 0;
assert.equal(read().rescueSeconds, 0);
mate.dead = false;
mate.rescueT = 120;
assert.match(rescueReadout(read(), 0, 0), /RESCUE Wing: 20s/);
session.data.stellar = 'port';
assert.deepEqual(read(), { rescueSeconds: 0, contacts: [] });
session.data.stellar = null;
session.data.armada = undefined;
assert.deepEqual(read(), { rescueSeconds: 0, contacts: [] });
assert.equal(ammoReadout('Rockets', 0), 'Rockets: 0 — EMPTY');
assert.equal(ammoReadout('Rockets', 5), 'Rockets: 5 — LOW');
assert.equal(ammoReadout('Rockets', 6), 'Rockets: 6');
assert.equal(ammoReadout('Rockets', undefined), 'Rockets: ?');
assert.equal(contactEdge(500, 400, 1000, 800), null);
assert.deepEqual(contactEdge(1500, 400, 1000, 800), { x: 940, y: 400, angle: 0 });
assert.equal(contactEdge(500, -400, 1000, 800)?.y, 60);
console.log('Flight ammo, rescue eligibility/privacy, expiry and edge indicators passed.');
