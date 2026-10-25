import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../../server/game.ts';
import { DB } from '../../server/db.ts';
import { mockSession } from './mocks.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { SIDE_STORIES } from '../../shared/quests.ts';

/** Multi-captain worksite authority, finite budgets and actual quest completion. */
export function verifyIndexWorksite(directory: string): void {
  const assets = JSON.parse(filesystem.readFileSync('shared/assets.json', 'utf8'));
  const db = new DB(path.join(directory, 'index-worksite'));
  const game = new Game(assets, db);
  const captain = (name: string, id: number) => {
    const data = { ...game.fresh(), name, sys: 'glasswake', stellar: null, tut: 999 };
    const session = mockSession({ id, name, data, sock: { open: true, backlog: 0, send() {} } });
    game.sessions.set(id, session);
    game.spawnPlayer(session, 1200, 600, 0, 0);
    return session;
  };
  const offender = captain('Index responsible', 18001);
  const innocent = captain('Index innocent', 18002);
  const space = game.spaces.glasswake;
  game.features.index.indexTick(space);
  const site = space.indexWorksite!;
  const machines = [...space.ships.values()].filter((entity) => entity.indexWorksite);
  assert.equal(machines.length, 10, 'one pair of parents and eight capped children');
  game.features.index.open(space);
  assert.equal(
    [...space.ships.values()].filter((entity) => entity.indexWorksite).length,
    10,
    'opening twice cannot duplicate actors',
  );
  const quarry = machines.find((entity) => entity.hull === 910)!;
  const archive = machines.find((entity) => entity.hull === 911)!;
  assert.ok(site.claim !== null, 'site marks one untouched rock');
  offender.data.rep.index = -300;
  assert.equal(
    space.isHostile(quarry, offender.ent!),
    false,
    'negative standing cannot provoke machines',
  );
  assert.equal(space.isHostile(offender.ent!, quarry), false);
  const npc = space.makeShip({ hull: 705, faction: 'hollow', x: 1200, y: 600 });
  assert.equal(
    space.isHostile(npc, quarry),
    false,
    'NPC factions use the same neutrality override',
  );
  space.damage(quarry, 0, 1, offender.ent!);
  assert.equal(
    space.isHostile(quarry, offender.ent!),
    true,
    'actual outgoing damage provokes the responsible account',
  );
  assert.equal(
    space.isHostile(quarry, innocent.ent!),
    false,
    'nearby independent captain stays safe',
  );
  assert.equal(
    offender.retaliationVisit?.factions.has('index') || false,
    false,
    'no generic visit-wide permanent retaliation',
  );
  const originalArmor = archive.armor;
  space.damage(archive, 1, 1, npc);
  assert.equal(
    space.isHostile(archive, innocent.ent!),
    false,
    'NPC damage never assigns a nearby captain blame',
  );
  assert.ok(archive.armor <= originalArmor);
  offender.ent!.x = 3000;
  assert.equal(
    space.isHostile(quarry, offender.ent!),
    false,
    'defenders do not pursue outside the marked worksite',
  );
  offender.ent!.x = 1200;
  db.world.mining!.clock += 46;
  assert.equal(
    space.isHostile(quarry, offender.ent!),
    false,
    'defined disengagement timer expires',
  );
  const claimed = space.rocks.find((rock) => rock.id === site.claim)!;
  const other = space.rocks.find((rock) => rock.id !== site.claim)!;
  const owner = db.key(offender.data.name);
  assert.equal(
    game.features.mining.sweep(space, claimed, 20, owner),
    0,
    'automatic sweep does not disturb a marked rock',
  );
  game.features.mining.ordinary(space, other, 1, owner);
  assert.equal(db.world.indexWorksite!.offenders[owner].warning, 0, 'unmarked mining is harmless');
  game.features.mining.ordinary(space, claimed, 1, owner);
  assert.equal(
    space.isHostile(quarry, offender.ent!),
    false,
    'first marked extraction warns, not attacks',
  );
  db.world.mining!.clock += 5;
  game.features.mining.ordinary(space, claimed, 1, owner);
  assert.equal(
    space.isHostile(quarry, offender.ent!),
    true,
    'continued marked extraction after warning provokes',
  );
  assert.equal(space.isHostile(quarry, innocent.ent!), false);
  const escort = space.makeShip({
    hull: 705,
    owner: innocent.ent!.id,
    faction: 'quantum',
    x: 1200,
    y: 600,
  });
  space.damage(quarry, 1, 1, escort);
  assert.equal(
    space.isHostile(quarry, innocent.ent!),
    true,
    'owned wing damage attributes to its actual root captain',
  );
  const clock = db.world.mining!.clock;
  const shield = quarry.shield;
  game.features.index.indexTick(space);
  const replacements = db.world.indexWorksite!.replacements;
  // Reopening the same persisted encounter cannot heal it, refill its roster or clear aggression.
  delete game.spaces.glasswake;
  delete game.live.glasswake;
  const restored = game.spaces.glasswake;
  offender.ent = null;
  innocent.ent = null;
  game.spawnPlayer(offender, 1200, 600, 0, 0);
  game.spawnPlayer(innocent, 1200, 600, 0, 0);
  const restoredQuarry = [...restored.ships.values()].find((entity) => entity.hull === 910)!;
  assert.equal(restoredQuarry.shield, shield);
  assert.equal(db.world.indexWorksite!.replacements, replacements);
  assert.ok(db.world.indexWorksite!.offenders[owner].until > clock);
  assert.equal(restored.indexWorksite!.claim, site.claim, 'exact claim survives unload');
  // The same finite mining root emits Index parcels, not newly created ore.
  const generation = db.world.mining!.systems.glasswake.rocks.find(
    (rock) => rock.id === site.claim,
  )!;
  generation.hp = 1;
  db.world.mining!.clock += 30;
  game.features.index.indexTick(restored);
  assert.ok(generation.emitted > 0, 'Quarry performs real extraction');
  assert.equal(generation.pending + generation.emitted + generation.discarded, generation.budget);
  const parcel = restored.loot.find((parcel) => parcel.it.generationKey === generation.key)!;
  assert.ok(parcel.it.indexClaim, 'real extracted parcel retains the worksite claim');
  const cargo = JSON.stringify(offender.data.cargo);
  assert.equal(
    game.onLoot(offender.ent!.player!, parcel.it),
    false,
    'passive collection never steals marked salvage',
  );
  assert.equal(JSON.stringify(offender.data.cargo), cargo);
  offender.ent!.x = parcel.x;
  offender.ent!.y = parcel.y;
  assert.equal(
    game.features.index.take(offender, restored),
    true,
    'explicit close-range theft opts in',
  );
  assert.equal(parcel.it.indexClaim, false);
  db.world.mining!.clock += 2;
  game.features.index.indexTick(restored);
  assert.equal(
    parcel.it.indexClaim,
    false,
    'acknowledged theft is not reclaimed each extraction tick',
  );
  assert.equal(
    game.onLoot(innocent.ent!.player!, parcel.it),
    false,
    'a bystander cannot accidentally take another captain’s released parcel',
  );
  const drone = [...restored.ships.values()].find((entity) => entity.indexParent)!;
  const lootCount = restored.loot.length;
  restored.kill(drone, offender.ent!);
  assert.equal(restored.loot.length, lootCount, 'drones never mint generic bounty/salvage');
  game.features.index.indexTick(restored);
  db.world.mining!.clock += 31;
  game.features.index.indexTick(restored);
  assert.equal(
    db.world.indexWorksite!.replacements,
    replacements - 1,
    'replacement consumes one finite group budget',
  );
  for (const parent of [...restored.ships.values()].filter(
    (entity) => entity.indexWorksite && !entity.indexParent,
  ))
    restored.kill(parent);
  for (const entity of restored.ships.values()) if (entity.indexWorksite) restored.ai(entity);
  game.features.index.indexTick(restored);
  assert.equal(
    [...restored.ships.values()].filter((entity) => entity.indexWorksite).length,
    0,
    'parent loss cleans up children',
  );
  assert.equal(restored.indexWorksite, undefined, 'expired site releases its rock');
  assert.equal(
    restored.loot.some((parcel) => parcel.it.indexClaim),
    false,
    'expired site releases its parcels',
  );
  // Authored opener follows the existing native quest lifecycle without kills or early reveals.
  const story = SIDE_STORIES.find((story) => story.id === 'index-last-survey')!;
  assert.ok(story.intro.startsWith('They have surveyed this fragment nine times.'));
  assert.doesNotMatch(JSON.stringify(story), /Riftweaver|Milky Way|Sol.*pulled/i);
  offender.data.sys = 'glasswake';
  offender.data.stellar = story.at;
  offender.data.missions = [];
  offender.ent = null;
  game.features.quests.questStart(offender, { side: story.id });
  const quest = offender.data.quests!.active['s:' + story.id];
  assert.ok(quest);
  let mission = offender.data.missions[0];
  assert.deepEqual(
    mission.points,
    story.steps[0].points,
    'survey actually visits the Index worksite',
  );
  game.spawnPlayer(offender, 0, 0, 0, 0);
  for (const point of mission.points!) {
    offender.ent!.x = point[0];
    offender.ent!.y = point[1];
    game.features.fronts.missionIdle(offender);
  }
  assert.equal(mission.done, true);
  offender.data.stellar = story.at;
  game.completeOnLanding(offender, STELLARS[story.at]);
  mission = offender.data.missions.find((mission) => mission.quest?.qid === quest.qid)!;
  assert.equal(mission.type, 'salvage');
  assert.deepEqual(mission.point, story.steps[1].point);
  assert.equal(
    game.features.quests.questLoot(innocent, { salvage: mission.id }),
    false,
    'one captain cannot turn in another captain’s story record',
  );
  game.features.quests.questLoot(offender, { salvage: mission.id });
  game.completeOnLanding(offender, STELLARS[story.at]);
  assert.ok(offender.data.quests!.sides[story.id]);
  assert.equal(innocent.data.quests?.sides?.[story.id], undefined);
  const paid = offender.data.credits;
  game.features.quests.questStart(offender, { side: story.id });
  assert.equal(offender.data.credits, paid, 'completed opener cannot pay twice');
  console.log(
    'Index: neutral passage, account attribution, warning/decay, claimed salvage, finite extraction/drones, unload safety and personal peaceful story.',
  );
}
