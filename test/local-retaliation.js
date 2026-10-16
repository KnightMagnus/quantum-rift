// Actual damage, hostility, protection and help dispatch; no saved immunity flag.
import assert from 'node:assert/strict';
import { Space } from '../server/space.js';
import { Game } from '../server/game.js';

let next = 1;
const ship = (faction, extra = {}) => ({
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
const game = {
  newcomer: Game.prototype.newcomer,
  onHit: Game.prototype.onHit,
  features: { rivals: { rivalOnHit() {} }, specialists: {}, coop: {} },
};
const space = (id) =>
  Object.assign(Object.create(Space.prototype), {
    id,
    game,
    t: 10,
    sys: { danger: 1, faction: 'quantum' },
    ships: new Map(),
  });
const first = space('home');
const session = {
  id: 1,
  data: { sys: 'home', station: { ops: 0 }, rep: { hollow: 0, quantum: 0 } },
};
const player = () =>
  ship('quantum', {
    player: { id: session.id, s: session, rep: session.data.rep },
    graceT: 100,
  });
session.ent = player();
first.ships.set(session.ent.id, session.ent);
first.beginVisit(session);
const target = ship('hollow'),
  ally = ship('hollow'),
  outsider = ship('umbral');
for (const e of [target, ally, outsider]) first.ships.set(e.id, e);
assert.equal(first.spared(target, session.ent), true, 'Ops 0 newcomer is initially protected');
assert.equal(first.spared(ally, session.ent), true);
assert.equal(
  session.retaliationVisit.factions.size,
  0,
  'selection/firing without a hit changes nothing',
);
first.damage(target, 0, 0, session.ent);
assert.equal(
  session.retaliationVisit.factions.size,
  0,
  'zero actual damage does not authorize retaliation',
);
assert.equal(ally.target, null);
first.damage(target, 1, 1, session.ent);
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
relaunched.ships.set(session.ent.id, session.ent);
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
const wing = ship('quantum', { owner: session.ent.id });
const civilian = ship('quantum');
relaunched.ships.set(wing.id, wing);
relaunched.ships.set(civilian.id, civilian);
const repBefore = session.data.rep.quantum;
relaunched.damage(civilian, 1, 1, wing);
assert.equal(session.data.rep.quantum, repBefore - 1, 'ordinary reputation penalty still applies');
assert.equal(
  session.retaliationVisit.factions.has('quantum'),
  true,
  'wingmate hit is attributed to its owner',
);

// A successful jump enters a different system and a later return starts another visit.
space('away').beginVisit(session);
const returned = space('home');
returned.beginVisit(session);
session.ent = player();
returned.ships.set(session.ent.id, session.ent);
const pirate = ship('hollow'),
  civilianAfter = ship('quantum');
returned.ships.set(pirate.id, pirate);
returned.ships.set(civilianAfter.id, civilianAfter);
assert.equal(session.retaliationVisit.factions.size, 0);
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
console.log(
  'Local retaliation passed: actual hits, allied help, later arrivals, unhit factions, wingmate attribution, same-system relaunch, visit reset and normal reputation.',
);
