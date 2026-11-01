import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { DB } from '../server/db.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { DT, makeLoadout } from '../shared/rules.ts';
import { ARCS } from '../shared/arcs.ts';

const game = refineryGame(new DB(tempDataDir('rift-quest-recovery-')));
const owner = refineryPilot(game, 'Recovery owner');
const other = refineryPilot(game, 'Recovery neighbour');
owner.data.stellar = other.data.stellar = null;
other.data.sys = owner.data.sys;
game.spawnPlayer(owner, 0, 0, 0, 0);
game.spawnPlayer(other, 0, 0, 0, 0);
const space = game.spaces[owner.data.sys];
owner.data.missions = [
  {
    title: 'Recovery',
    reward: 100,
    text: 'Recover crew',
    id: 'recovery-wreck',
    type: 'rescue',
    sys: space.id,
    hull: 707,
    faction: 'quantum',
    wreckName: 'Recovery fixture',
    spawned: true,
  },
];
game.features.fronts.missionArrive(owner, space);
const wrecks = () =>
  [...space.ships.values()].filter((entity) => entity.rescueOf?.id === 'recovery-wreck');
assert.equal(wrecks().length, 1, 'missing wreck recovers even with persisted spawn flag');
const wreck = wrecks()[0];
owner.ent!.x = other.ent!.x = wreck.x;
owner.ent!.y = other.ent!.y = wreck.y;
for (const act of ['rescue', 'capture', 'plunder'] as const) {
  game.features.hangar.board(other, { id: wreck.id, act });
  assert.equal(space.ships.get(wreck.id), wreck, 'another captain cannot consume reserved wreck');
}
for (const act of ['capture', 'plunder'] as const) {
  game.features.hangar.board(owner, { id: wreck.id, act });
  assert.equal(space.ships.get(wreck.id), wreck, 'owner must rescue mission wreck');
}
assert.equal(space.canHit(other.ent!, wreck), false);
const patrol = space.makeShip({ hull: 742, faction: 'hollow', ai: 'raid' });
assert.equal(space.canHit(patrol, wreck), false, 'NPC fire cannot hit required wreck');
space.kill(wreck, patrol);
game.features.fronts.missionArrive(owner, space);
assert.equal(wrecks().length, 1, 'removed wreck recovers on next arrival');
game.features.fronts.missionArrive(owner, space);
assert.equal(wrecks().length, 1, 'arrival does not duplicate existing wreck');
const replacement = wrecks()[0];
owner.ent!.x = replacement.x;
owner.ent!.y = replacement.y;
game.features.hangar.board(owner, { id: replacement.id, act: 'rescue' });
assert.equal(owner.data.missions[0].done, true);
game.features.fronts.missionArrive(owner, space);
assert.equal(wrecks().length, 0, 'finished rescue never respawns');

owner.data.missions = [
  {
    title: 'Target',
    text: 'Stop target',
    reward: 100,
    id: 'recovery-target',
    type: 'assassinate',
    sys: space.id,
    hull: 711,
    faction: 'hollow',
    guard: 711,
    spawned: true,
  },
];
game.features.fronts.missionArrive(owner, space);
const contractTarget = [...space.ships.values()].find(
  (target) => target.mission?.id === 'recovery-target',
)!;
assert.ok(contractTarget, 'missing contract target recovers');
space.kill(contractTarget, patrol);
assert.equal(
  owner.data.missions[0].done,
  true,
  'patrol final blow completes present owner contract',
);

const [faction, arc] = Object.entries(ARCS).find(([, arc]) =>
  arc.steps.some((step) => step.type === 'kill'),
)!;
const stepIndex = arc.steps.findIndex((step) => step.type === 'kill');
owner.data.arcs[faction] = { step: stepIndex, active: { got: 0, ready: false }, done: false };
owner.data.sys = arc.steps[stepIndex].sys!;
game.spawnPlayer(owner, 0, 0, 0, 0);
const arcSpace = game.spaces[owner.data.sys];
const targets = () =>
  [...arcSpace.ships.values()].filter((entity) => entity.arcOf?.sid === owner.id);
assert.ok(targets().length);
const target = targets()[0];
target.x = 50000;
target.target = owner.ent;
target.armor *= 0.5;
const health = target.armor;
const nearby = arcSpace.makeShip({ hull: 742, faction: 'quantum', x: target.x, y: target.y });
target.target = nearby;
game.features.arcs.arcArrive(owner, arcSpace);
assert.equal(target.x, 50000, 'do not teleport a target fighting a nearby ship');
arcSpace.remove(nearby);
target.target = owner.ent;
game.features.arcs.arcArrive(owner, arcSpace);
assert.equal(Math.round(Math.hypot(target.x - owner.ent!.x, target.y - owner.ent!.y)), 1400);
assert.equal(target.armor, health, 'recovery does not heal target');
const arcPatrol = arcSpace.makeShip({ hull: 742, faction: 'quantum', ai: 'patrol' });
arcSpace.kill(target, arcPatrol);
assert.equal(owner.data.arcs[faction].active!.got, 1, 'NPC final blow credits present owner');
arcSpace.kill(target, arcPatrol);
assert.equal(owner.data.arcs[faction].active!.got, 1, 'duplicate kill cannot double credit');

const stale = arcSpace.makeShip({ hull: 711, faction: 'hollow' });
stale.arcOf = { sid: owner.id, fac: faction, step: stepIndex + 1 };
arcSpace.kill(stale, arcPatrol);
assert.equal(
  owner.data.arcs[faction].active!.got,
  1,
  'unrelated arc step cannot advance current objective',
);
const absent = arcSpace.makeShip({ hull: 711, faction: 'hollow' });
absent.arcOf = { sid: owner.id, fac: faction, step: stepIndex };
const ownerEntity = owner.ent;
owner.ent = null;
arcSpace.kill(absent, arcPatrol);
owner.ent = ownerEntity;
assert.equal(owner.data.arcs[faction].active!.got, 1, 'absent owner gains no arc credit');

// Disable the last capable captain: nobody remains able to perform a rescue.
const down = refineryPilot(game, 'Downed captain');
down.data.sys = owner.data.sys;
down.data.stellar = null;
down.data.armada = owner.data.armada = 'recovery-team';
game.spawnPlayer(down, 0, 0, 0, 0);
assert.equal(game.features.coop.rescueHold(down.ent!, null, arcSpace), true);
const downEntity = down.ent!;
owner.ent!.disabled = true;
assert.equal(
  game.features.coop.rescueHold(owner.ent!, null, arcSpace),
  false,
  'disabled mate cannot offer rescue',
);
game.features.coop.rescueTick();
assert.equal(down.ent, null, 'team wipe ends existing hold without waiting for full timer');
assert.equal(arcSpace.ships.has(downEntity.id), false);
console.log(
  'Quest recovery: owner-only rescue, missing-wreck retry, patrol arc credit/drift, no-rescuer insurance passed.',
);

for (const hull of [744, 774]) {
  owner.data.ship = makeLoadout(game.A, hull, 'Capital fixture');
  game.spawnPlayer(owner, 0, 0, 0, 0);
  const attacker = owner.ent!;
  const combatSpace = game.spaces[owner.data.sys];
  for (const actor of combatSpace.ships.values()) if (actor !== attacker) combatSpace.remove(actor);
  combatSpace.spawnT = Infinity;
  const target = combatSpace.makeShip({ hull: 774, faction: 'hollow', x: 425, y: 0 });
  target.st.armor = target.armor = 1e9;
  target.st.shield = target.shield = 0;
  attacker.target = target;
  game.combatAssist.command(owner, { op: 'assist', on: true });
  target.guns = [];
  target.vx = 30;
  target.ai = null;
  for (const mount of attacker.guns) if (Number.isFinite(mount.ammo)) mount.ammo = 0;
  let damage = 0;
  const applyDamage = combatSpace.damage.bind(combatSpace);
  combatSpace.damage = (...args) => {
    const result = applyDamage(...args);
    if (args[0] === target && args[3] === attacker && result) damage += result[0];
    return result;
  };
  let previousDamage = 0;
  for (let frame = 0; frame < 90 / DT; frame++) {
    target.inp = {};
    target.vx = 30;
    combatSpace.tick();
    if ((frame + 1) % Math.round(30 / DT) === 0) {
      assert.ok(
        damage > previousDamage,
        `capital ${hull} damages moving target in every 30-second window`,
      );
      previousDamage = damage;
    }
  }
  assert.ok(damage > 0, `capital ${hull} deals weapon damage after expendable ammunition runs out`);
  combatSpace.damage = applyDamage;
}
