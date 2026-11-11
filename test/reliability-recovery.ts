import assert from 'node:assert/strict';
import { DB } from '../server/db.ts';
import { STORY } from '../shared/story.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { GENERATED_SPREAD } from '../shared/gen.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { mockSpace, mockMission } from './helpers/mocks.ts';
import { tempDataDir } from './helpers/temp-data.ts';

// The released spread moves field centres, not asteroid mass or extraction ledgers.
const database = new DB(tempDataDir('rift-recovery-'));
const game = refineryGame(database);
const fields = [{ x: 1000, y: -1200, r: 500, rocks: 2, rich: 2, ore: 'ore' }];
const oldSpace = mockSpace({
  id: 'legacy-generated',
  sys: { gen: true, fields },
  rocks: [],
  loot: [],
  events: [],
  t: 0,
});
game.features.mining.openSpace(oldSpace);
const saved = database.world.mining!.systems[oldSpace.id];
const rock = saved.rocks[0];
rock.hp /= 2;
Object.assign(rock, { budget: 4, pending: 1, accepted: 1, discarded: 1 });
saved.parcels.push({
  id: database.world.mining!.nextId--,
  x: rock.x + 5,
  y: rock.y,
  vx: 0,
  vy: 0,
  t: 0,
  kind: 2,
  expires: 1000,
  it: {
    ore: 'ore',
    rich: 2,
    n: 1,
    remainingLots: { common: 1, rich: 0, pure: 0 },
    generationKey: rock.key,
    parcelKey: `${rock.key}:0:0`,
    progressionTokens: [],
  },
});
Object.assign(saved.rocks[1], { down: 1000, hp: 0 });
const before = structuredClone(saved);
const nextFields = fields.map((field) => ({
  ...field,
  x: Math.round(field.x * GENERATED_SPREAD),
  y: Math.round(field.y * GENERATED_SPREAD),
}));
const nextSpace = mockSpace({
  id: oldSpace.id,
  sys: { gen: true, fields: nextFields },
  rocks: [],
  loot: [],
  events: [],
  t: 0,
});
game.features.mining.openSpace(nextSpace);
assert.deepEqual(
  saved.geometryBackup,
  before,
  'original field checkpoint is retained before migration',
);
for (let index = 0; index < saved.rocks.length; index++) {
  const translated = {
    ...before.rocks[index],
    x: before.rocks[index].x + 900,
    y: before.rocks[index].y - 1080,
  };
  assert.deepEqual(
    saved.rocks[index],
    translated,
    'only position changes; no healing, refill, rekey or remint',
  );
}
assert.deepEqual(
  saved.parcels,
  before.parcels,
  'outstanding ore parcels retain exact remainder and original claim',
);
assert.equal(nextSpace.loot.length, 1, 'migration exposes the original parcel once');
const migrated = structuredClone(saved);
nextSpace.loot.length = 0;
game.features.mining.openSpace(nextSpace);
assert.deepEqual(saved, migrated, 'repeated wake does not migrate twice');
database.flush();
const restored = refineryGame(new DB(database.dir));
const restartedSpace = mockSpace({
  id: oldSpace.id,
  sys: { gen: true, fields: nextFields },
  rocks: [],
  loot: [],
  events: [],
  t: 0,
});
restored.features.mining.openSpace(restartedSpace);
assert.deepEqual(
  restored.db.world.mining!.systems[oldSpace.id],
  migrated,
  'migration and backup survive storage reload',
);
const wrongGeometry = mockSpace({
  id: oldSpace.id,
  sys: { gen: true, fields: [{ ...nextFields[0], x: nextFields[0].x + 1 }] },
  rocks: [],
  loot: [],
  events: [],
  t: 0,
});
assert.throws(
  () => restored.features.mining.openSpace(wrongGeometry),
  /explicit migration/,
  'unreviewed geometry changes still fail closed',
);
assert.deepEqual(
  restored.db.world.mining!.systems[oldSpace.id],
  migrated,
  'failed migration leaves field unchanged',
);

// Login must distinguish a real in-flight save from stale flight data on a docked account.
for (const at of ['mw-mercury', 'vigil-lamp']) {
  const captain = refineryPilot(game, `Dock ${at}`);
  captain.data.sys = STELLARS[at].system;
  captain.data.stellar = at;
  captain.data.story.flags = { main_ending: 'table', crossed_quantum_rift: true };
  captain.data.story.flight = { sys: 'mw-sol', x: 700, y: 800, a: 0 };
  game.disconnect(captain);
  const returned = refineryPilot(game, `Dock ${at}`);
  assert.equal(
    returned.data.stellar,
    at,
    'saved dock takes precedence over stale flight coordinates',
  );
  assert.equal(returned.ent, null);
  assert.equal(returned.data.story.flight, undefined);
}

// Destruction objectives stay combat targets below the ordinary disable threshold.
const captain = refineryPilot(game, 'Recovery captain');
const chapter = STORY.find((entry) => entry.id === 'qv3')!;
captain.data.story = {
  step: STORY.indexOf(chapter),
  done: STORY.slice(0, STORY.indexOf(chapter)).map((entry) => entry.id),
  active: { id: chapter.id, got: 0, ready: false, spawned: false },
};
captain.data.sys = chapter.sys!;
captain.data.stellar = null;
game.spawnPlayer(captain, 0, 0, 0, 0);
const space = game.spaces[captain.data.sys];
const hunter = [...space.ships.values()].find(
  (ship) => ship.story === captain.id && ship.storyKill,
)!;
hunter.armor = hunter.st.armor * 0.1;
space.ai(hunter);
assert.equal(hunter.noDisable, true);
assert.notEqual(
  hunter.disabled,
  true,
  'low armor does not turn a mandatory kill into an abandoned wreck',
);
space.kill(hunter, captain.ent);
assert.equal(captain.data.story.active!.got, 1);

const contractTarget = space.spawnMissionTarget(
  mockMission({
    id: 'destroy-only',
    type: 'bounty',
    hull: 761,
    faction: 'umbral',
    owner: captain.id,
  }),
)!;
contractTarget.armor = contractTarget.st.armor * 0.1;
space.ai(contractTarget);
assert.equal(
  contractTarget.noDisable,
  true,
  'ordinary destruction contracts also remain finishable',
);
assert.notEqual(contractTarget.disabled, true);

// Convoys retain their destination under attack; every removal has an outcome.
const destination = Object.values(STELLARS).find(
  (body) => body.system === captain.data.sys && body.svc?.includes('L'),
)!;
function convoy(id: string) {
  const mission = mockMission({
    id,
    type: 'convoy',
    title: 'Recovery escort',
    sys: captain.data.sys,
    dest: destination.id,
    hull: 704,
    faction: 'spacer',
    convoyName: 'Recovery freighter',
    raiders: 0,
  });
  captain.data.missions.push(mission);
  game.features.fronts.missionArrive(captain, space);
  return [...space.ships.values()].find((ship) => ship.convoyOf?.id === id)!;
}
const protectedShip = convoy('attacked');
const intendedDestination = protectedShip.dest;
protectedShip.aggro.add(hunter.id);
protectedShip.think = 0;
space.ai(protectedShip);
assert.equal(
  protectedShip.ai,
  'trade',
  'escort objective does not switch to generic flee behavior',
);
assert.equal(protectedShip.dest, intendedDestination);
space.remove(protectedShip, 'jump');
assert.equal(
  captain.data.missions.some((mission) => mission.id === 'attacked'),
  false,
  'escaped convoy fails instead of stranding the mission',
);
const vanished = convoy('vanished');
space.ships.delete(vanished.id);
game.features.fronts.missionIdle(captain);
assert.equal(
  captain.data.missions.some((mission) => mission.id === 'vanished'),
  false,
  'missing convoy is detected by the mission sweep',
);
const landed = convoy('landed');
game.features.fronts.onConvoyLanded(landed);
space.remove(landed);
game.features.fronts.missionIdle(captain);
assert.equal(
  captain.data.missions.find((mission) => mission.id === 'landed')?.done,
  true,
  'successful landing is never treated as missing',
);
const destroyed = convoy('destroyed');
space.kill(destroyed, captain.ent);
assert.equal(
  captain.data.missions.some((mission) => mission.id === 'destroyed'),
  false,
  'destroyed convoy fails',
);
console.log(
  'Reliability recovery passed: generated layout migration, docked login, kill targets, convoy outcomes.',
);

const mouth = {
  ...destination,
  id: 'synthetic-rescue-mouth',
  x: 1300,
  y: 0,
  r: 150,
  wormhole: 'meridian',
};
space.sys.stellars.push(mouth);
try {
  const rescue = mockMission({
    id: 'mouth-rescue',
    type: 'rescue',
    title: 'Mouth rescue',
    sys: captain.data.sys,
    hull: 704,
    faction: 'spacer',
    eventide: true,
    rescuePoint: [mouth.x, mouth.y],
  });
  captain.data.missions.push(rescue);
  game.features.fronts.missionArrive(captain, space);
  const wreck = [...space.ships.values()].find((ship) => ship.rescueOf?.id === rescue.id)!;
  assert.ok(wreck, 'synthetic rescue spawns');
  assert.ok(
    Math.hypot(wreck.x - mouth.x, wreck.y - mouth.y) >= mouth.r + 1200,
    'rescue initially inside a transit mouth is relocated outside boarding clearance',
  );
} finally {
  space.sys.stellars.splice(space.sys.stellars.indexOf(mouth), 1);
}
