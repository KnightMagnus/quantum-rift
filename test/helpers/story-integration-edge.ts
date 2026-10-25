import assert from 'node:assert/strict';
import type { Game, Session } from '../../server/game.ts';
import type { Entity, Space } from '../../server/space.ts';
import type { QuestRecord } from '../../shared/quests.ts';
import { SIDE_STORIES } from '../../shared/quests.ts';
import { STORY } from '../../shared/story.ts';
import { STELLARS, SYS } from '../../shared/galaxy.ts';
import { makeLoadout } from '../../shared/rules.ts';
import { INDEX_FLEET_LIMITS } from '../../shared/index-fleet.ts';
import { indexFleetType } from '../../server/index-fleet.ts';
import { mockMission, mockPlayerData, mockSession } from './mocks.ts';

/** Exercise repaired authority/economy edges against real Game services without another save store. */
export function verifyStoryIntegrationEdges(game: Game): void {
  // Fork only this synchronous fixture's world. Live spaces and captains belonging
  // to the caller are restored by identity, even if an assertion fails.
  const originalWorld = game.db.world;
  const originalLive = new Map(Object.entries(game.live));
  const captains: Session[] = [];
  game.db.world = structuredClone(originalWorld);
  game.db.world.indexFleets = {};
  delete game.db.world.indexWorksite;
  game.db.world.nhal = {};
  function captain(name: string, id: number): Session {
    assert.ok(!game.sessions.has(id), 'edge fixture captain identities are reserved');
    const data = mockPlayerData({ ...game.fresh(), name, tut: 999 });
    game.features.hangar.hangarInit(data);
    game.features.story.storyInit(data);
    game.features.quests.questInit(data);
    const session = mockSession({ id, name, data, sock: { open: true, backlog: 0, send() {} } });
    game.sessions.set(id, session);
    captains.push(session);
    return session;
  }
  function isolatedSpace(system: string): Space {
    delete game.live[system];
    return game.spaces[system];
  }
  function fly(session: Session, space: Space, x: number, y: number): Entity {
    session.data.sys = space.id;
    session.data.stellar = null;
    session.ent = null;
    game.spawnPlayer(session, x, y, 0, 0);
    return session.ent!;
  }
  function indexShips(space: Space): Entity[] {
    return [...space.ships.values()].filter((entity) => entity.faction === 'index');
  }
  function rosterAgrees(space: Space): void {
    const world = game.db.world.indexFleets![space.id];
    const visible = world.actors.filter((actor) => !actor.dead && !actor.hidden);
    assert.equal(
      indexShips(space).length,
      visible.length,
      'legacy initializer and fleet share one live roster',
    );
    assert.ok(visible.length <= INDEX_FLEET_LIMITS.live, 'complete system group remains capped');
    for (const [slot, actor] of world.actors.entries()) {
      if (actor.dead || actor.hidden) continue;
      assert.ok(
        world.actors.filter((child) => child.parent === slot && !child.dead && !child.blade)
          .length <= INDEX_FLEET_LIMITS.drones,
        'a carrying parent cannot own more than twelve drones',
      );
    }
  }
  function wire(space: Space, entity: Entity): Array<string | number | null> {
    const row = space.snapshot().ships.find((candidate) => candidate[0] === entity.id);
    assert.ok(row, 'live machine appears in the actual wire snapshot');
    assert.equal(
      row.length,
      19,
      'Index snapshot extends the ordinary tuple with exactly four fields',
    );
    return row;
  }
  function clock(seconds: number, space: Space): void {
    game.db.world.mining!.clock += seconds;
    space.t += seconds;
  }
  try {
    const fitter = captain('Story edges Harness', 74101);
    fitter.data.sys = 'emberlight';
    fitter.data.stellar = 'vigil-lamp';
    fitter.data.ship = makeLoadout(game.A, 704);
    for (const outfit of [572, 576, 560, 565, 580, 583, 584, 585])
      fitter.data.ship.outfits[outfit] = 1;
    assert.equal(
      game.features.shipStats.stats(fitter.data)!.free,
      3,
      'real equipped ship has insufficient fitting space',
    );
    const harness = SIDE_STORIES.find((story) => story.id === 'rift-harness')!;
    const assembly: QuestRecord = {
      qid: 's:rift-harness',
      side: 'rift-harness',
      name: harness.name,
      giver: harness.giver,
      at: harness.at,
      plan: { W: harness.at, Wsys: 'emberlight', contact: harness.giver },
      steps: harness.steps,
      step: harness.steps.length - 1,
      started: 0,
      tries: 0,
    };
    fitter.data.quests.active[assembly.qid] = assembly;
    game.features.quests.questPush(fitter, assembly, true);
    const finalDelivery = fitter.data.missions[0];
    assert.equal(finalDelivery.reward, 4988, 'final delivery retains its existing payment');
    const startCredits = fitter.data.credits;
    game.completeOnLanding(fitter, STELLARS['vigil-lamp']);
    assert.equal(fitter.data.credits, startCredits + 4988);
    assert.equal(
      assembly.completionPending,
      'vigil-lamp',
      'fitting waits at its real assembly port',
    );
    assert.equal(fitter.data.ship.outfits[9021], undefined);
    assert.equal(fitter.data.quests.sides['rift-harness'], undefined);
    assert.ok(
      !fitter.data.missions.some((mission) => mission.id === finalDelivery.id),
      'paid final delivery is not re-issued',
    );
    const waitingStanding = fitter.data.rep.lamp;
    const waitingMaterials = structuredClone(fitter.data.mats);
    for (let retry = 0; retry < 3; retry++) {
      game.completeOnLanding(fitter, STELLARS['vigil-lamp']);
      game.features.quests.questSweep(fitter);
    }
    assert.equal(
      fitter.data.credits,
      startCredits + 4988,
      'waiting cannot repay the last delivery',
    );
    assert.equal(fitter.data.rep.lamp, waitingStanding, 'waiting cannot farm standing');
    assert.deepEqual(fitter.data.mats, waitingMaterials, 'waiting cannot reroll material rewards');
    delete fitter.data.ship.outfits[585];
    assert.ok(game.features.shipStats.stats(fitter.data)!.free >= 5);
    game.features.quests.questSweep(fitter);
    assert.equal(
      fitter.data.ship.outfits[9021],
      1,
      'freeing space finishes the real pending outfit installation',
    );
    assert.equal(fitter.data.story.flags?.harness_built, true);
    assert.ok(fitter.data.quests.sides['rift-harness']);
    assert.equal(fitter.data.quests.active[assembly.qid], undefined);
    const finishedCredits = fitter.data.credits;
    const finishedStanding = fitter.data.rep.lamp;
    game.features.quests.questSweep(fitter);
    game.completeOnLanding(fitter, STELLARS['vigil-lamp']);
    game.features.quests.questFinish(fitter, assembly);
    assert.equal(fitter.data.credits, finishedCredits, 'finished assembly cannot replay rewards');
    assert.equal(fitter.data.rep.lamp, finishedStanding);
    assert.equal(
      fitter.data.ship.outfits[9021],
      1,
      'finished assembly cannot mint a second harness',
    );

    const hunter = captain('Story edges native kills', 74102);
    const deep = isolatedSpace('maw');
    const hunterEntity = fly(hunter, deep, 0, 0);
    hunter.data.missions = [
      mockMission({
        id: 'edges-deep-patrol',
        type: 'patrol',
        sys: deep.id,
        need: 2,
        got: 0,
        reward: 1000,
        title: 'Deep patrol',
        owner: hunter.id,
      }),
    ];
    const creature = [...deep.ships.values()].find((entity) => entity.faction === 'nhal');
    assert.ok(creature, 'real Deep traffic supplies a native creature');
    const kills = hunter.data.stats.kills;
    const combat = hunter.data.stats.combat || 0;
    const credits = hunter.data.credits;
    const reputation = structuredClone(hunter.data.rep);
    deep.kill(creature, hunterEntity);
    assert.equal(hunter.data.stats.kills, kills + 1);
    assert.ok((hunter.data.stats.combat || 0) > combat);
    assert.equal(
      hunter.data.missions[0].got,
      1,
      'native Nhal count toward actual patrol objectives',
    );
    assert.equal(
      hunter.data.credits,
      credits,
      'native kills do not receive generic pirate bounties',
    );
    assert.deepEqual(hunter.data.rep, reputation, 'native kills do not farm faction standing');

    const witness = captain('Story edges lethal choice', 74103);
    witness.data.sys = 'qgate';
    witness.data.stellar = 'qstation';
    const dreamerStep = STORY.findIndex((mission) => mission.id === 'dreamer');
    witness.data.story = {
      step: dreamerStep,
      done: STORY.slice(0, dreamerStep).map((mission) => mission.id),
      active: { id: 'dreamer', got: 1, spawned: true, ready: true },
      flags: { d1: 'concord', d2: 'umbral', dreamer_defeated: true },
    };
    witness.data.quests.sides['nhal-eye'] = 1;
    const decisionCredits = witness.data.credits;
    for (const choice of ['witness', 'seal'])
      game.features.story.storyAccept(witness, { id: 'dreamer', choice });
    assert.equal(
      witness.data.story.flags?.nhal_ending,
      undefined,
      'even complete investigations cannot witness or seal a dead Dreamer',
    );
    assert.equal(witness.data.credits, decisionCredits);
    game.features.story.storyAccept(witness, { id: 'dreamer', choice: 'kill' });
    assert.equal(witness.data.story.flags?.nhal_ending, 'kill');
    assert.equal(witness.data.credits, decisionCredits + 150000);
    game.features.story.storyAccept(witness, { id: 'dreamer', choice: 'kill' });
    assert.equal(
      witness.data.credits,
      decisionCredits + 150000,
      'lethal completion pays exactly once',
    );

    const surveyor = captain('Story edges Index roster', 74104);
    let glasswake = isolatedSpace('glasswake');
    let surveyorEntity = fly(surveyor, glasswake, 1300, 600);
    game.features.indexFleet.fleetTick(glasswake);
    const legacyDrone = indexShips(glasswake).find((entity) => entity.indexParent !== undefined);
    assert.ok(legacyDrone, 'legacy Glasswake initialization supplies an adopted drone');
    glasswake.kill(legacyDrone, surveyorEntity);
    clock(31, glasswake);
    game.features.index.indexTick(glasswake);
    game.features.indexFleet.fleetTick(glasswake);
    rosterAgrees(glasswake);
    const fleet = game.db.world.indexFleets!.glasswake;
    const mutableSlot = fleet.actors.findIndex((actor) => actor.base === 912);
    const mutable = indexShips(glasswake).find((entity) => entity.hull === 912)!;
    clock(9, glasswake);
    glasswake.damage(mutable, 1, 10, surveyorEntity);
    game.features.indexFleet.fleetTick(glasswake);
    const mutableArmor = mutable.armor;
    const mutableShield = mutable.shield;
    const beforeReload = wire(glasswake, mutable);
    assert.equal(beforeReload[15], mutableSlot);
    assert.equal(beforeReload[16], -1, 'parent machine has no carrying parent');
    assert.ok(
      Number(beforeReload[17]) > 0 && Number(beforeReload[17]) <= 2000,
      'late joiner receives remaining form windup',
    );
    const replacements = fleet.remaining;
    glasswake.remove(surveyorEntity);
    glasswake = isolatedSpace('glasswake');
    surveyorEntity = fly(surveyor, glasswake, 1300, 600);
    game.features.indexFleet.fleetTick(glasswake);
    rosterAgrees(glasswake);
    const restoredMutable = indexShips(glasswake).find(
      (entity) => entity.indexState?.[0] === mutableSlot,
    )!;
    assert.ok(restoredMutable);
    assert.equal(restoredMutable.armor, mutableArmor);
    assert.equal(
      restoredMutable.shield,
      mutableShield,
      'reload does not heal the changing machine',
    );
    assert.equal(
      game.db.world.indexFleets!.glasswake.remaining,
      replacements,
      'reload cannot refill replacement allowance',
    );
    assert.deepEqual(
      wire(glasswake, restoredMutable).slice(15),
      beforeReload.slice(15),
      'slot, parent and transition metadata survive reload',
    );

    const tridentSystem = Object.values(SYS).find(
      (system) => system.farside && indexFleetType(system.id) === 916,
    )!.id;
    const bladeCaptain = captain('Story edges Trident wire', 74105);
    let tridentSpace = isolatedSpace(tridentSystem);
    game.features.indexFleet.fleetTick(tridentSpace);
    const tridentWorld = game.db.world.indexFleets![tridentSystem];
    const bladeEntity = fly(bladeCaptain, tridentSpace, tridentWorld.site.x, tridentWorld.site.y);
    const trident = indexShips(tridentSpace).find((entity) => entity.hull === 916)!;
    assert.ok(trident);
    const parentSlot = tridentWorld.actors.findIndex((actor) => actor.base === 916);
    tridentSpace.damage(trident, 1, 1, bladeEntity);
    clock(2.1, tridentSpace);
    game.features.indexFleet.ai(tridentSpace, trident);
    game.features.indexFleet.fleetTick(tridentSpace);
    const pieces = tridentWorld.actors[parentSlot].pieces!;
    assert.equal(pieces.length, 3);
    const blades = indexShips(tridentSpace).filter((entity) => entity.hull === 918);
    assert.equal(blades.length, 3);
    for (const blade of blades) {
      const row = wire(tridentSpace, blade);
      assert.equal(
        row[16],
        parentSlot,
        'each independently targetable blade identifies one logical parent',
      );
      assert.equal(row[18], 7, 'all three surviving identities are replicated');
    }
    const firstBlade = blades.find((entity) => entity.indexState![0] === pieces[0])!;
    tridentSpace.kill(firstBlade, bladeEntity);
    game.features.indexFleet.fleetTick(tridentSpace);
    for (const blade of indexShips(tridentSpace).filter((entity) => entity.hull === 918))
      assert.equal(
        wire(tridentSpace, blade)[18],
        6,
        'destroyed blade is removed from the replicated survivor mask',
      );
    const survivingSlots = pieces.slice(1);
    const remainingBudget = tridentWorld.remaining;
    tridentSpace.remove(bladeEntity);
    tridentSpace = isolatedSpace(tridentSystem);
    fly(bladeCaptain, tridentSpace, tridentWorld.site.x, tridentWorld.site.y);
    game.features.indexFleet.fleetTick(tridentSpace);
    rosterAgrees(tridentSpace);
    const restoredBlades = indexShips(tridentSpace).filter((entity) => entity.hull === 918);
    assert.equal(restoredBlades.length, 2, 'unloading cannot restore the destroyed third blade');
    assert.deepEqual(
      restoredBlades
        .map((entity) => Number(wire(tridentSpace, entity)[15]))
        .sort((left, right) => left - right),
      survivingSlots.sort((left, right) => left - right),
    );
    for (const blade of restoredBlades)
      assert.deepEqual(wire(tridentSpace, blade).slice(16), [parentSlot, 0, 6]);
    assert.equal(game.db.world.indexFleets![tridentSystem].remaining, remainingBudget);
    console.log(
      'Story integration edges: one-time Harness fitting/payment, native kill/patrol progression, lethal choice denial, shared roster reload caps and stable Index wire identities passed.',
    );
  } finally {
    for (const session of captains) {
      if (session.ent && game.live[session.data.sys]?.ships.has(session.ent.id))
        game.live[session.data.sys].remove(session.ent);
      session.ent = null;
      game.sessions.delete(session.id);
    }
    for (const key of Object.keys(game.live)) delete game.live[key];
    for (const [key, value] of originalLive) game.live[key] = value;
    game.db.world = originalWorld;
  }
}
