// Production targeting and damage regression coverage for the main-map newcomer truce.
import assert from 'node:assert/strict';
import { Space } from '../server/space.js';
import { Game } from '../server/game.js';
import { SYS } from '../shared/galaxy.js';

let next = 1;
const ship = (faction, extra = {}) => ({
  id: next++,
  faction,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  a: 0,
  state: 'fly',
  ai: 'patrol',
  shield: 1000,
  armor: 1000,
  st: { armor: 1000, size: 50, maxSpeed: 200 },
  aggro: new Set(),
  target: null,
  think: 0,
  born: 0,
  life: 1000,
  inp: {},
  ...extra,
});
const game = {
  newcomer: Game.prototype.newcomer,
  onHit: Game.prototype.onHit,
  features: { rivals: { rivalOnHit() {} }, specialists: {}, coop: {} },
};
function fixture(sys = { danger: 5, faction: 'umbral', stellars: [] }, ops = 2) {
  const sp = Object.assign(Object.create(Space.prototype), {
    id: 'trial',
    sys,
    game,
    t: 10,
    ships: new Map(),
    events: [],
    loot: [],
    // Navigation is not under test: all acquisition, hostility and damage use production code.
    steer(e) {
      e.inp = { thrust: 1, turn: 0 };
      return 1000;
    },
    fight(e, target) {
      e.fireAt = target;
    },
    mayFlee() {
      return false;
    },
  });
  const s = { id: next++, data: { station: { ops }, rep: { quantum: -50 } } };
  s.ent = ship('quantum', { player: { id: s.id, s, rep: s.data.rep }, graceT: 0 });
  const npc = ship('umbral', { x: 100, ai: 'raid' });
  sp.ships.set(s.ent.id, s.ent);
  sp.ships.set(npc.id, npc);
  sp.beginVisit(s);
  return { sp, s, player: s.ent, npc };
}

let main = 0,
  far = 0;
for (const sys of Object.values(SYS)) {
  const { sp, player, npc } = fixture(sys);
  if (sys.arena) continue;
  assert.equal(sp.newcomerTruce(npc, player), !sys.farside, sys.name);
  assert.equal(sp.spared(npc, player), !sys.farside, sys.name);
  if (sys.farside) far++;
  else main++;
}
assert.ok(main > 0 && far > 0);
for (const danger of [0, 1, 2, 3, 4, 5]) {
  for (const faction of ['quantum', 'hollow', 'umbral', 'deep']) {
    const { sp, player, npc } = fixture({ danger, faction, stellars: [] });
    assert.equal(sp.newcomerTruce(npc, player), true, `${faction} danger ${danger}`);
  }
}
for (const ops of [0, 1, 2, 3, 4]) {
  const { sp, player, npc } = fixture(undefined, ops);
  assert.equal(sp.newcomerTruce(npc, player), ops < 3);
  assert.equal(sp.findTarget(npc), ops < 3 ? null : player);
}
for (const faction of ['quantum', 'hollow', 'umbral', 'deep']) {
  const { sp, player, npc } = fixture();
  npc.faction = faction;
  npc.boss = true;
  assert.equal(sp.newcomerTruce(npc, player), true, `${faction} boss respects truce`);
  assert.equal(sp.findTarget(npc), null, `${faction} cannot acquire newcomer`);
}
for (const sys of [
  { danger: 5, faction: 'umbral', farside: true, stellars: [] },
  { danger: 1, faction: 'quantum', arena: true, stellars: [] },
]) {
  const { sp, player, npc } = fixture(sys);
  assert.equal(sp.newcomerTruce(npc, player), false);
}
{
  const { sp, player, npc, s } = fixture();
  s.data.noShield = true;
  assert.equal(
    sp.newcomerTruce(npc, player),
    false,
    'existing protection opt-out remains effective',
  );
}
{
  const { sp, player, npc } = fixture();
  const patrol = ship('quantum', { x: 300 });
  const wing = ship('quantum', { owner: player.id, ai: 'escort' });
  sp.ships.set(patrol.id, patrol);
  sp.ships.set(wing.id, wing);
  assert.equal(sp.newcomerTruce(npc, wing), true, 'player-owned escorts inherit protection');
  assert.equal(sp.findTarget(npc), patrol, 'ordinary NPC-versus-NPC fighting continues');
}
{
  const { sp, player, npc } = fixture({
    danger: 5,
    faction: 'umbral',
    farside: true,
    stellars: [],
  });
  assert.equal(sp.findTarget(npc), player, 'Farside NPCs still acquire newcomers');
  assert.equal(sp.canHit(npc, player), true);
  player.graceT = 100;
  assert.equal(sp.spared(npc, player), true, 'Farside arrival grace is preserved');
  assert.equal(sp.canHit(npc, player), false, 'arrival grace still blocks physical damage');
  assert.equal(sp.findTarget(npc), null);
}

// Mission danger is scoped to the participant, not every newcomer sharing the system.
for (const owned of [
  (sid) => ({ mission: { owner: sid } }),
  (sid) => ({ storyKill: true, story: sid }),
  (sid) => ({ arcOf: { sid, fac: 'umbral' } }),
  (sid) => ({ huntOf: sid }),
  (sid) => ({ combatOwners: [sid] }),
]) {
  const { sp, player, npc, s } = fixture();
  Object.assign(npc, owned(s.id));
  assert.equal(sp.newcomerTruce(npc, player), false, 'own mission remains dangerous');
  assert.equal(sp.findTarget(npc), player, 'own mission NPC may actually acquire captain');
  Object.assign(npc, owned(s.id + 10000));
  assert.equal(sp.newcomerTruce(npc, player), true, 'another captain mission does not void truce');
  assert.equal(
    sp.findTarget(npc),
    null,
    'another captain mission NPC cannot acquire protected bystander',
  );
}

// All accepting Armada contract members remain participants, not only its spawner.
{
  const { sp, player, npc, s } = fixture();
  npc.kingpin = 'contract-1';
  npc.mission = { owner: s.id + 10000 };
  s.data.missions = [{ type: 'warband', id: 'contract-1', done: false }];
  assert.equal(sp.newcomerTruce(npc, player), false);
  assert.equal(sp.findTarget(npc), player);
  s.data.missions = [];
  assert.equal(sp.newcomerTruce(npc, player), true);
}

// Ambient AI must drop old targets and reject both direct and inherited fleet targets.
{
  const { sp, player, npc } = fixture();
  npc.target = player;
  sp.ai(npc);
  assert.equal(npc.target, null, 'retained ambient target is cleared');
  assert.equal(sp.findTarget(npc), null);
  const escort = ship('umbral', { ai: 'escort', owner: npc.id });
  sp.ships.set(escort.id, escort);
  npc.target = player;
  sp.ai(escort);
  assert.equal(escort.target, null, 'NPC escort cannot inherit protected captain target');
  const wing = ship('quantum', { ai: 'escort', owner: player.id });
  sp.ships.set(wing.id, wing);
  npc.target = null;
  sp.ai(wing);
  assert.equal(wing.target, null, 'passive player wing does not start ambient fight');
  assert.equal(sp.findTarget(wing), null, 'passive wing acquisition respects truce');
  player.order = 'attack';
  player.target = npc;
  wing.think = 0;
  sp.ai(wing);
  assert.equal(wing.target, npc, 'explicit wing attack remains available');
}

// The truce is targeting policy, not invulnerability. Crossing an NPC beam still hurts,
// without accidentally treating the victim captain as an aggressor.
{
  const { sp, player, npc, s } = fixture();
  npc.x = 0;
  npc.y = 100;
  assert.equal(sp.canHit(npc, player), true, 'incidental hostile fire can connect');
  assert.equal(sp.ray(npc, 0, 500)?.s, player, 'production beam collision sees protected captain');
  const shield = player.shield;
  sp.damage(player, 10, 10, npc);
  assert.equal(player.shield, shield - 10);
  assert.equal(
    player.aggro.size,
    0,
    'incidental damage does not authorize retaliatory auto-acquisition',
  );
  assert.equal(s.retaliationVisit.factions.size, 0);
  assert.equal(sp.newcomerTruce(npc, player), true);
  assert.equal(sp.findTarget(npc), null);
}

// Real captain/wing damage opts into a faction fight; zero damage and selection do not.
for (const byWing of [false, true]) {
  const { sp, player, npc, s } = fixture();
  const outsider = ship('hollow', { x: 200 });
  const ally = ship('umbral', { x: 300 });
  const wing = ship('quantum', { owner: player.id, ai: 'escort' });
  for (const e of [outsider, ally, wing]) sp.ships.set(e.id, e);
  player.target = npc;
  const src = byWing ? wing : player;
  sp.damage(npc, 0, 0, src);
  assert.equal(sp.newcomerTruce(npc, player), true);
  sp.damage(npc, 10, 10, src);
  assert.equal(s.retaliationVisit.factions.has('umbral'), true);
  assert.equal(sp.newcomerTruce(npc, player), false);
  assert.equal(sp.newcomerTruce(ally, player), false);
  assert.equal(sp.newcomerTruce(outsider, player), true);
  assert.equal(ally.target, player, 'faction help remains functional');
  player.graceT = 100;
  assert.equal(sp.spared(npc, player), false, 'voluntary aggression still overrides arrival grace');
}

console.log(
  `Main-map protection passed: ${main} main-map and ${far} Farside systems; danger/faction matrix, Ops threshold, owner-scoped missions, production AI, crossfire and voluntary retaliation.`,
);
