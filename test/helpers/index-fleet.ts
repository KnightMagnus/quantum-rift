import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Space } from '../../server/space.ts';
import type { Entity } from '../../server/space.ts';
import type { GameAssets } from '../../shared/rules.ts';
import { augmentAssets, DT, makeLoadout } from '../../shared/rules.ts';
import type { IndexFleetCapabilities, IndexFleetWorld } from '../../server/index-fleet.ts';
import { IndexFleetOperations, indexFleetType } from '../../server/index-fleet.ts';
import { INDEX_FLEET_HULLS, INDEX_FLEET_LIMITS } from '../../shared/index-fleet.ts';
import { NHAL_HULLS, NHAL_WEAPONS } from '../../shared/nhal.ts';
import { SYS } from '../../shared/galaxy.ts';
import { mockPlayerReference, mockSession, mockSpace } from './mocks.ts';

/** Real Space ship construction and stats, with deterministic clock/steering boundaries. */
export function verifyIndexFleet(): void {
  const assets: GameAssets = augmentAssets(
    JSON.parse(
      filesystem.readFileSync(new URL('../../shared/assets.json', import.meta.url), 'utf8'),
    ),
  );
  for (const hull of [...INDEX_FLEET_HULLS, ...NHAL_HULLS]) assets.ships[hull.id] = hull;
  for (const weapon of NHAL_WEAPONS) assets.weapons[weapon.id] = weapon;
  let clock = 0;
  const worlds: Record<string, IndexFleetWorld> = {};
  const notices: string[] = [];
  const extracts: number[] = [];
  let selectedRock = 10;
  const capabilities: IndexFleetCapabilities = {
    fleets: () => worlds,
    clock: () => clock,
    key: (entity) => (entity.player ? `captain:${entity.player.id}` : null),
    provoked: () => false,
    touch() {},
    toast: (_session, text) => notices.push(text),
    virginRock: () => ({
      id: selectedRock,
      key: `finite:${selectedRock}`,
      x: 2600,
      y: 1800,
      hp: 100,
      max: 100,
      down: 0,
      r: 20,
      ore: 'ore',
      rich: 1,
      evT: 0,
    }),
    extract: (space, rock, amount) => {
      extracts.push(amount);
      rock.hp -= amount;
      space.loot.push({
        id: -100,
        x: rock.x,
        y: rock.y,
        vx: 0,
        vy: 0,
        it: { ore: 'ore', generationKey: `finite:${rock.id}` },
        t: space.t,
        kind: 1,
      });
    },
  };
  function fixture(type = 912): Space {
    const system = Object.values(SYS).find(
      (star) => star.farside && indexFleetType(star.id) === type,
    )!;
    assert.ok(system, `a Farside workgroup exercises type ${type}`);
    const space = mockSpace({
      id: system.id,
      sys: system,
      A: assets,
      t: 0,
      ships: new Map(),
      loot: [],
      events: [],
      beams: [],
      rocks: [
        {
          id: selectedRock,
          x: 2600,
          y: 1800,
          r: 20,
          hp: 100,
          max: 100,
          ore: 'ore',
          rich: 1,
          down: 0,
          evT: 0,
        },
      ],
      // oxlint-disable-next-line typescript/unbound-method -- The fixture installs this as a Space method, preserving its receiver.
      makeShip: Space.prototype.makeShip,
      // oxlint-disable-next-line typescript/unbound-method -- The fixture installs this as a Space method, preserving its receiver.
      remove: Space.prototype.remove,
      // oxlint-disable-next-line typescript/unbound-method -- The fixture installs this as a Space method, preserving its receiver.
      root: Space.prototype.root,
      steer: (entity) => {
        entity.inp = { thrust: 1 };
        return 0;
      },
      fight: (entity, target) => {
        entity.fireAt = target;
      },
    });
    IndexFleetOperations.open.call(capabilities, space);
    return space;
  }
  function human(space: Space, id: number): Entity {
    const world = worlds[space.id];
    return space.makeShip({
      loadout: makeLoadout(assets, 704),
      faction: 'quantum',
      x: world.site.x,
      y: world.site.y,
      player: mockPlayerReference({ id, s: mockSession({}) }),
    });
  }
  function find(space: Space, hull: number): Entity {
    const entity = [...space.ships.values()].find((entity) => Number(entity.hull) === hull);
    assert.ok(entity, `expected hull ${hull}`);
    return entity;
  }
  function advance(space: Space, amount: number): void {
    clock += amount;
    space.t += amount;
  }
  const mutableSpace = fixture();
  const mutable = find(mutableSpace, 912);
  const offender = human(mutableSpace, 71);
  const bystander = human(mutableSpace, 72);
  assert.equal(
    IndexFleetOperations.allow.call(capabilities, mutableSpace, mutable, offender),
    false,
    'neutral worksite ignores faction standing',
  );
  offender.x = mutable.x + 100;
  offender.y = mutable.y;
  const health = mutable.armor;
  const shield = mutable.shield;
  mutable.guns[0].cd = 1.5;
  IndexFleetOperations.damaged.call(capabilities, mutableSpace, mutable, offender, 10);
  assert.equal(
    IndexFleetOperations.allow.call(capabilities, mutableSpace, mutable, offender),
    true,
  );
  assert.equal(
    IndexFleetOperations.allow.call(capabilities, mutableSpace, mutable, bystander),
    false,
    'no collective guilt',
  );
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  assert.match(mutable.name!, /changing form/);
  advance(mutableSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  assert.equal(mutable.hull, 913);
  assert.equal(mutable.armor, health);
  assert.equal(mutable.shield, shield);
  assert.equal(mutable.guns[0].cd, 1.5, 'form changes preserve weapon cooldowns');
  assert.equal(IndexFleetOperations.damageScale.call(capabilities, mutableSpace, mutable), 0.65);
  offender.x = worlds[mutableSpace.id].site.x + INDEX_FLEET_LIMITS.radius + 2000;
  assert.equal(
    IndexFleetOperations.allow.call(capabilities, mutableSpace, mutable, offender),
    true,
    'direct attackers remain defensive targets outside the original worksite',
  );
  assert.equal(
    IndexFleetOperations.allow.call(capabilities, mutableSpace, mutable, bystander),
    false,
    'remote self-defense does not implicate innocent captains',
  );
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  assert.equal(mutable.target, offender, 'armed machines acquire their remote direct attacker');
  assert.equal(mutable.fireAt, offender, 'self-defense enters the real combat steering path');
  assert.equal(mutable.inp.fire1, 1, 'self-defense requests weapon fire');
  const oldSpeed = mutable.st.maxSpeed;
  advance(mutableSpace, 46);
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  advance(mutableSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  assert.equal(mutable.hull, 912);
  assert.ok(mutable.st.maxSpeed > oldSpeed, 'transit/siege exchange real mobility');
  const kernel = find(mutableSpace, 909);
  mutableSpace.remove(kernel);
  IndexFleetOperations.killed.call(capabilities, mutableSpace, kernel, offender);
  assert.equal(worlds[mutableSpace.id].kernelLost, true);
  const rebootEnd = worlds[mutableSpace.id].rebootUntil;
  IndexFleetOperations.killed.call(capabilities, mutableSpace, kernel, offender);
  assert.equal(
    worlds[mutableSpace.id].rebootUntil,
    rebootEnd,
    'one Kernel death cannot restart a stun loop',
  );
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  assert.equal(mutable.fireAt, null);
  assert.match(mutable.name!, /reboot/);
  advance(mutableSpace, 7);
  IndexFleetOperations.ai.call(capabilities, mutableSpace, mutable);
  assert.doesNotMatch(mutable.name!, /reboot/);
  const tridentSpace = fixture(916);
  const trident = find(tridentSpace, 916);
  const tridentOwner = human(tridentSpace, 81);
  const originalArmor = trident.armor,
    originalShield = trident.shield;
  IndexFleetOperations.damaged.call(capabilities, tridentSpace, trident, tridentOwner, 10);
  advance(tridentSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, tridentSpace, trident);
  const blades = [...tridentSpace.ships.values()].filter((entity) => Number(entity.hull) === 918);
  assert.equal(blades.length, 3, 'split uses three independently targetable entities');
  assert.ok(!tridentSpace.ships.has(trident.id));
  assert.ok(Math.abs(blades.reduce((sum, blade) => sum + blade.armor, 0) - originalArmor) < 0.001);
  assert.ok(
    Math.abs(blades.reduce((sum, blade) => sum + blade.shield, 0) - originalShield) < 0.001,
  );
  const lootBeforeBlade = tridentSpace.loot.filter((parcel) => parcel.it.cargo).length;
  tridentSpace.remove(blades[0]);
  IndexFleetOperations.killed.call(capabilities, tridentSpace, blades[0], tridentOwner);
  assert.equal(
    tridentSpace.loot.filter((parcel) => parcel.it.cargo).length,
    lootBeforeBlade,
    'partial split kills do not mint three rewards',
  );
  advance(tridentSpace, 46);
  const tridentWorld = worlds[tridentSpace.id];
  const logical = tridentWorld.actors.find((actor) => actor.base === 916)!;
  const surviving = blades.slice(1);
  for (const blade of surviving) {
    blade.target = null;
    blade.x = logical.x;
    blade.y = logical.y;
  }
  IndexFleetOperations.fleetTick.call(capabilities, tridentSpace);
  const rejoined = find(tridentSpace, 916);
  assert.equal(rejoined.armor, (originalArmor * 2) / 3, 'rejoin never heals a missing blade');
  advance(tridentSpace, 13);
  IndexFleetOperations.damaged.call(capabilities, tridentSpace, rejoined, tridentOwner, 10);
  advance(tridentSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, tridentSpace, rejoined);
  const secondSplit = [...tridentSpace.ships.values()].filter(
    (entity) => Number(entity.hull) === 918,
  );
  assert.equal(secondSplit.length, 2, 'a destroyed blade stays destroyed through later splits');
  for (const blade of secondSplit) {
    tridentSpace.remove(blade);
    IndexFleetOperations.killed.call(capabilities, tridentSpace, blade, tridentOwner);
  }
  assert.equal(
    tridentSpace.loot.filter((parcel) => parcel.it.cargo).length,
    lootBeforeBlade + 1,
    'the complete logical Trident pays once',
  );
  // A fresh group starts its survey tour dwelling at the worksite, where the Loom deploys.
  clock = 0;
  const loomSpace = fixture(919);
  const loom = find(loomSpace, 919);
  const obstacle = human(loomSpace, 91);
  obstacle.x = loom.x + 50;
  obstacle.y = loom.y;
  IndexFleetOperations.ai.call(capabilities, loomSpace, loom);
  advance(loomSpace, 3);
  IndexFleetOperations.ai.call(capabilities, loomSpace, loom);
  assert.equal(loom.hull, 919, 'clearance prevents expansion through another ship');
  obstacle.x += 2000;
  // Other members of the survey group must also be clear of the folding arms.
  for (const other of loomSpace.ships.values())
    if (other !== loom) {
      other.x = loom.x + 1500;
      other.y = loom.y + 1500;
    }
  advance(loomSpace, 2);
  IndexFleetOperations.ai.call(capabilities, loomSpace, loom);
  assert.equal(loom.hull, 920);
  assert.equal(loom.st.size, 260);
  assert.equal(loom.guns.length, 0, 'mining emitters are not hidden combat weapons');
  advance(loomSpace, 10);
  IndexFleetOperations.fleetTick.call(capabilities, loomSpace);
  assert.ok(extracts.length > 0 && extracts.every((amount) => amount === 12));
  assert.equal(loomSpace.beams.filter((beam) => beam.id === loom.id).length, 6);
  assert.ok(loomSpace.loot.some((parcel) => parcel.it.indexClaim));
  // A travelling Loom must fold; a deployed miner elsewhere cannot extract remotely.
  const previousClock = clock;
  clock = 100;
  IndexFleetOperations.ai.call(capabilities, loomSpace, loom);
  advance(loomSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, loomSpace, loom);
  assert.equal(loom.hull, 919, 'Loom folds while travelling between stops');
  const extractedBeforeTravel = extracts.length;
  for (const machine of loomSpace.ships.values()) {
    machine.x += 10000;
    machine.y += 10000;
  }
  advance(loomSpace, 10);
  IndexFleetOperations.fleetTick.call(capabilities, loomSpace);
  assert.equal(
    extracts.length,
    extractedBeforeTravel,
    'distant miners cannot extract a claimed rock',
  );
  clock = previousClock;
  selectedRock = 999;
  assert.equal(
    worlds[loomSpace.id].claim,
    10,
    'a claim does not silently jump onto another working rock',
  );
  const talonSpace = fixture(921);
  const talon = find(talonSpace, 921);
  const held = human(talonSpace, 101);
  held.x = talon.x + 100;
  held.y = talon.y;
  IndexFleetOperations.damaged.call(capabilities, talonSpace, talon, held, 1);
  IndexFleetOperations.ai.call(capabilities, talonSpace, talon);
  advance(talonSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, talonSpace, talon);
  assert.equal(talon.hull, 922);
  const immunity = worlds[talonSpace.id].holdImmunity['captain:101'];
  assert.ok(immunity > clock);
  held.vx = 100;
  held.inp = { thrust: 1 };
  for (let tick = 0; tick < Math.ceil(1.2 / DT); tick++) {
    advance(talonSpace, DT);
    IndexFleetOperations.fleetTick.call(capabilities, talonSpace);
  }
  const escapedVelocity = held.vx;
  IndexFleetOperations.fleetTick.call(capabilities, talonSpace);
  assert.equal(held.vx, escapedVelocity, 'a short thrust window releases the hold');
  IndexFleetOperations.ai.call(capabilities, talonSpace, talon);
  assert.equal(
    worlds[talonSpace.id].holdImmunity['captain:101'],
    immunity,
    'repeated cage contact does not refresh control denial',
  );
  const hiveSpace = fixture(923);
  const hive = find(hiveSpace, 923);
  const hiveEnemy = human(hiveSpace, 111);
  hiveEnemy.x = hive.x + 100;
  hiveEnemy.y = hive.y;
  assert.equal(IndexFleetOperations.damageScale.call(capabilities, hiveSpace, hive), 0.65);
  IndexFleetOperations.damaged.call(capabilities, hiveSpace, hive, hiveEnemy, 1);
  IndexFleetOperations.ai.call(capabilities, hiveSpace, hive);
  advance(hiveSpace, 2.1);
  IndexFleetOperations.ai.call(capabilities, hiveSpace, hive);
  assert.equal(hive.hull, 924);
  assert.equal(IndexFleetOperations.damageScale.call(capabilities, hiveSpace, hive), 1.25);
  for (let launch = 0; launch < 40; launch++) {
    advance(hiveSpace, 9);
    IndexFleetOperations.fleetTick.call(capabilities, hiveSpace);
  }
  const hiveWorld = worlds[hiveSpace.id];
  const hiveSlot = hiveWorld.actors.findIndex((actor) => actor.base === 923);
  const children = hiveWorld.actors.filter((actor) => actor.parent === hiveSlot && !actor.dead);
  assert.ok(children.length <= 12);
  assert.ok(hiveWorld.remaining >= 0);
  assert.ok(
    [...hiveSpace.ships.values()].filter((entity) => entity.faction === 'index').length <=
      INDEX_FLEET_LIMITS.live,
  );
  const remaining = hiveWorld.remaining;
  const savedHull = hive.hull;
  hive.armor -= 100;
  IndexFleetOperations.fleetTick.call(capabilities, hiveSpace);
  const savedArmor = hive.armor;
  // Reconstruct a system with the same persisted roster, not a fresh world budget.
  const reloaded = fixture(923);
  const restoredHive = find(reloaded, savedHull);
  assert.equal(restoredHive.armor, savedArmor);
  assert.equal(
    worlds[reloaded.id].remaining,
    remaining,
    'unload preserves form, damage and launch budget',
  );
  assert.equal(
    [...reloaded.ships.values()].filter((entity) => Number(entity.hull) === 909).length,
    1,
  );
  for (const hull of INDEX_FLEET_HULLS) assert.ok(hull.npcOnly && hull.faction === 'index');
  const coreSite = worlds[mutableSpace.id];
  assert.equal(
    coreSite.claim,
    undefined,
    'Glasswake never acquires a second independently mined claim',
  );
  console.log(
    'Index fleet: five transformations, neutral attribution, persistent finite drones, safe mining, real split health/reward accounting, Kernel reboot and Talon escape passed.',
  );
}
