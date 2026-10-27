import { mockGame, mockSession, mockEntity, type FixtureShape } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import type { Entity } from '../server/game.ts';
// Actual damage, hostility, protection and help dispatch; no saved immunity flag.
import assert from 'node:assert/strict';
import { Space } from '../server/space.ts';
import { Game } from '../server/game.ts';

let next = 1;
const ship = (faction: string, extra: FixtureShape<Entity> = {}) =>
  mockEntity({
    id: next++,
    faction,
    x: 0,
    y: 0,
    state: 'fly',
    ai: 'patrol',
    shield: 1000,
    armor: 1000,
    st: { armor: 1000 },
    aggro: new Set(),
    target: null,
    ...extra,
  });
const game = mockGame({
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  newcomer: Game.prototype.newcomer,
  // oxlint-disable-next-line typescript/unbound-method -- Preserve the production method for receiver-bound fixture calls and exact restoration.
  onHit: Game.prototype.onHit,
  features: { rivals: { rivalOnHit() {} }, specialists: {}, coop: {} },
});
const space = (identifier: string) =>
  Object.assign(Object.create(Space.prototype) as Space, {
    id: identifier,
    game,
    t: 10,
    sys: { danger: 1, faction: 'quantum' },
    ships: new Map(),
  });
const first = space('home');
const session = mockSession({
  id: 1,
  data: { sys: 'home', station: { ops: 0 }, rep: { hollow: 0, quantum: 0 } },
});
const player = () =>
  ship('quantum', {
    player: { id: session.id, s: session, rep: session.data.rep },
    graceT: 100,
  });
session.ent = player();
first.ships.set(requiredFixtureValue(session.ent).id, session.ent);
first.beginVisit(session);
const target = ship('hollow'),
  ally = ship('hollow'),
  outsider = ship('umbral');
for (const entity of [target, ally, outsider]) first.ships.set(entity.id, entity);
assert.equal(first.spared(target, session.ent), true, 'Ops 0 newcomer is initially protected');
assert.equal(first.spared(ally, session.ent), true);
assert.equal(
  requiredFixtureValue(session.retaliationVisit).factions.size,
  0,
  'selection/firing without a hit changes nothing',
);
first.damage(target, 0, 0, session.ent);
assert.equal(
  requiredFixtureValue(session.retaliationVisit).factions.size,
  0,
  'zero actual damage does not authorize retaliation',
);
assert.equal(ally.target, null);
// Incidental damage permits only the victim and its wing to defend themselves.
first.damage(target, 1, 1, session.ent);
assert.equal(first.spared(target, session.ent), false);
assert.equal(first.spared(ally, session.ent), true, 'stray fire does not recruit the faction');
assert.equal(ally.target, null);
assert.equal(session.retaliationVisit!.factions.size, 0);
// A deliberately selected attack still starts the normal faction fight.
session.ent.target = target;
first.damage(target, 1, 1, session.ent);
assert.equal(
  session.retaliationVisit!.factions.size,
  0,
  'defending against the accidental victim does not widen the fight',
);
session.ent.target = ally;
first.damage(ally, 1, 1, session.ent);
assert.equal(
  first.spared(target, session.ent),
  false,
  'the hit victim may retaliate even during arrival grace',
);
assert.equal(first.spared(ally, session.ent), false, 'same-faction allies may help a victim');
assert.equal(ally.target, session.ent, 'actual callHelp dispatch targets the attacker');
assert.equal(
  first.spared(outsider, session.ent),
  true,
  'unhit faction retains newcomer protection',
);
const late = ship('hollow');
first.ships.set(late.id, late);
assert.equal(
  first.spared(late, session.ent),
  false,
  'later same-faction arrivals share current-visit hostility',
);

// Landing replaces the player entity; an idle system may also be recreated while landed.
session.ent = player();
const relaunched = space('home');
relaunched.beginVisit(session);
relaunched.ships.set(requiredFixtureValue(session.ent).id, session.ent);
const returnAlly = ship('hollow');
relaunched.ships.set(returnAlly.id, returnAlly);
assert.equal(relaunched.isHostile(returnAlly, session.ent), true);
assert.equal(
  relaunched.spared(returnAlly, session.ent),
  false,
  'same-system landing/relaunch does not reset retaliation',
);
assert.equal(session.data.station.ops, 0, 'no permanent progression/immunity mutation');
assert.equal(
  'retaliationVisit' in session.data,
  false,
  'visit hostility is not saved on player data',
);

// A wingmate landing a hit attributes faction retaliation and normal standing loss to its lead.
session.ent.graceT = 0;
const wing = ship('quantum', { owner: requiredFixtureValue(session.ent).id });
const civilian = ship('quantum');
relaunched.ships.set(wing.id, wing);
relaunched.ships.set(civilian.id, civilian);
const repBefore = session.data.rep.quantum;
session.ent.target = civilian;
relaunched.damage(civilian, 1, 1, wing);
assert.equal(session.data.rep.quantum, repBefore - 1, 'ordinary reputation penalty still applies');
assert.equal(
  requiredFixtureValue(session.retaliationVisit).factions.has('quantum'),
  true,
  'wingmate hit is attributed to its owner',
);

// A successful jump enters a different system and a later return starts another visit.
space('away').beginVisit(session);
const returned = space('home');
returned.beginVisit(session);
session.ent = player();
returned.ships.set(requiredFixtureValue(session.ent).id, session.ent);
const pirate = ship('hollow'),
  civilianAfter = ship('quantum');
returned.ships.set(pirate.id, pirate);
returned.ships.set(civilianAfter.id, civilianAfter);
assert.equal(requiredFixtureValue(session.retaliationVisit).factions.size, 0);
assert.equal(
  returned.spared(pirate, session.ent),
  true,
  'new visit restores ordinary newcomer protection',
);
assert.equal(
  returned.isHostile(civilianAfter, session.ent),
  false,
  'temporary lawful-faction hostility ends on departure',
);
assert.equal(
  session.data.rep.quantum,
  repBefore - 1,
  'standing loss persists after temporary retaliation expires',
);
// Lawful ships tolerate one accidental broadside, but repeated separated volleys allow local defense.
session.ent.target = null;
returned.damage(civilianAfter, 1, 1, session.ent);
assert.equal(civilianAfter.aggro.size, 0);
for (let pellet = 0; pellet < 10; pellet++) returned.damage(civilianAfter, 1, 1, session.ent);
assert.equal(civilianAfter.aggro.size, 0, 'one volley is not ten separate provocations');
returned.t += 1.6;
returned.damage(civilianAfter, 1, 1, session.ent);
assert.equal(civilianAfter.aggro.size, 0);
returned.t += 1.6;
returned.damage(civilianAfter, 1, 1, session.ent);
assert.equal(civilianAfter.aggro.size, 0, 'minor crossfire cannot mobilize a capital wing');
returned.damage(civilianAfter, 100, 100, session.ent);
assert.equal(
  civilianAfter.aggro.has(session.ent.id),
  true,
  'sustained unselected fire permits local defense',
);
assert.equal(
  session.retaliationVisit!.factions.size,
  0,
  'sustained unselected fire still does not recruit the whole faction',
);
// Carrier-owned drones share a defense decision, but tiny clips cannot summon the entire wing.
const carrier = ship('quantum', { st: { shield: 1000, armor: 1000 } });
const drone = ship('quantum', { owner: carrier.id, shield: 100, armor: 100 });
returned.ships.set(carrier.id, carrier);
returned.ships.set(drone.id, drone);
for (let volley = 0; volley < 3; volley++) {
  returned.t += 1.6;
  returned.damage(drone, 1, 1, session.ent);
}
assert.equal(carrier.aggro.size, 0, 'drone crossfire uses commanding hull durability');
returned.damage(carrier, 200, 200, session.ent);
assert.equal(carrier.aggro.has(session.ent.id), true, 'sustained damaging harassment is finite');
const later = ship('quantum', { st: { shield: 1000, armor: 1000 } });
returned.ships.set(later.id, later);
returned.damage(later, 150, 150, session.ent);
returned.t += 11;
for (let volley = 0; volley < 3; volley++) {
  returned.t += 1.6;
  returned.damage(later, 1, 1, session.ent);
}
assert.equal(later.aggro.size, 0, 'old incidental damage expires with the volley window');
session.ent.target = later;
returned.damage(later, 1, 1, session.ent);
assert.equal(later.aggro.has(session.ent.id), true, 'selected attacks bypass crossfire tolerance');
console.log(
  'Local retaliation passed: actual hits, allied help, later arrivals, unhit factions, wingmate attribution, same-system relaunch, visit reset and normal reputation.',
);
