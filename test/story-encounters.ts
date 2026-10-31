import assert from 'node:assert/strict';
import { DB } from '../server/db.ts';
import { STORY } from '../shared/story.ts';
import { DT, step } from '../shared/rules.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const game = refineryGame(new DB(tempDataDir('rift-story-encounters-')));
const owner = refineryPilot(game, 'Encounter owner');
const other = refineryPilot(game, 'Other captain');
function begin(session: typeof owner, id = 'qv3') {
  const mission = STORY.find((entry) => entry.id === id)!;
  session.data.story = {
    step: STORY.indexOf(mission),
    done: STORY.slice(0, STORY.indexOf(mission)).map((entry) => entry.id),
    active: { id, got: 0, spawned: false, ready: false },
  };
  session.data.sys = mission.sys!;
  session.data.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
  return game.spaces[mission.sys!];
}
const space = begin(owner);
begin(other);
const targets = (captain = owner) =>
  [...space.ships.values()].filter((entity) => entity.story === captain.id && entity.storyKill);
assert.equal(targets().length, 4);
const patrol = space.makeShip({ hull: 742, faction: 'quevari', ai: 'patrol' });
const killsBefore = owner.data.stats.kills;
const otherKillsBefore = other.data.stats.kills;
const patrolTarget = targets()[0];
space.kill(patrolTarget, patrol);
assert.equal(owner.data.story.active!.got, 1, 'patrol final hit advances encounter owner');
assert.equal(other.data.story.active!.got, 0, 'another captain has independent progress');
assert.equal(owner.data.stats.kills, killsBefore, 'patrol credit grants no personal kill reward');
space.kill(patrolTarget, patrol);
game.features.story.storyProgress(owner, patrolTarget);
assert.equal(owner.data.story.active!.got, 1, 'repeated destruction/progress is idempotent');
const wing = space.makeShip({ hull: 741, faction: 'quevari', ai: 'escort', owner: owner.ent!.id });
space.kill(targets()[0], wing);
assert.equal(owner.data.story.active!.got, 2, 'wing final hit advances encounter owner');
space.kill(targets()[0], other.ent);
assert.equal(owner.data.story.active!.got, 3, 'owner rather than final-hit captain progresses');
assert.equal(other.data.story.active!.got, 0);
assert.equal(
  other.data.stats.kills,
  otherKillsBefore + 1,
  'generic final-hit accounting is unchanged',
);
const wrongChapter = targets()[0];
wrongChapter.storyMission = 'qv4';
space.kill(wrongChapter, patrol);
assert.equal(owner.data.story.active!.got, 3, 'a stale target cannot advance another chapter');

// Leave one captain in the same loaded system while the owner dies and returns.
const ownerEntity = owner.ent!;
const survivor = targets(other)[0];
space.kill(ownerEntity, patrol);
assert.equal(owner.ent, null);
const absentTarget = space.makeShip({ hull: 761, faction: 'umbral', ai: 'raid' });
absentTarget.story = owner.id;
absentTarget.storyMission = 'qv3';
absentTarget.storyKill = true;
space.kill(absentTarget, patrol);
assert.equal(owner.data.story.active!.got, 3, 'dead/docked owner receives no remote credit');
owner.data.sys = 'shoalight';
owner.data.stellar = null;
game.spawnPlayer(owner, 0, 0, 0, 0);
assert.equal(targets().length, 1, 'reentry spawns only the unfinished objective');
assert.equal(targets(other)[0], survivor, 'another captain’s encounter is not reset');
space.kill(targets()[0], owner.ent);
assert.equal(owner.data.story.active!.got, 4);
assert.equal(owner.data.story.active!.ready, true);
game.features.story.storyProgress(owner, patrolTarget);
assert.equal(owner.data.story.active!.got, 4, 'ready encounters cannot overcount');

// Reproduce the reported post-death drift using the actual AI and movement integration.
const driftSpace = begin(owner);
const drifting = targets()[0];
const deceased = owner.ent!;
space.kill(deceased, patrol);
for (const entity of driftSpace.ships.values()) if (entity !== drifting) driftSpace.remove(entity);
drifting.target = deceased;
drifting.x = 1400;
drifting.y = 0;
drifting.a = 0;
drifting.think = 0;
drifting.dest = null;
drifting.vx = 60;
drifting.vy = 0;
const originalRandom = Math.random;
let seed = 74123;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
let maximumDistance = 0;
try {
  for (let frame = 0; frame < 1200 / DT; frame++) {
    driftSpace.t += DT;
    driftSpace.ai(drifting);
    step(drifting, drifting.st, drifting.inp);
    maximumDistance = Math.max(maximumDistance, Math.hypot(drifting.x, drifting.y));
  }
} finally {
  Math.random = originalRandom;
}
assert.ok(maximumDistance > 12000, 'seeded 20-minute run reproduces abandoned hunter drift');
owner.data.sys = 'shoalight';
owner.data.stellar = null;
drifting.armor *= 0.75;
drifting.shield *= 0.5;
const survivingArmor = drifting.armor;
const survivingShield = drifting.shield;
game.spawnPlayer(owner, 0, 0, 0, 0);
assert.equal(targets().length, 1, 'reentry does not duplicate a surviving objective');
assert.equal(drifting.armor, survivingArmor, 'reentry does not heal surviving targets');
assert.equal(drifting.shield, survivingShield, 'reentry does not refill surviving shields');
assert.ok(Math.hypot(drifting.x - owner.ent!.x, drifting.y - owner.ent!.y) <= 1500);
assert.equal(drifting.target, owner.ent, 'recovered hunter resumes the encounter');
const recoveredCount = targets().length;
game.features.story.storyArrive(owner, space);
assert.equal(targets().length, recoveredCount, 'repeated arrival cannot duplicate objectives');
const combatTarget = space.makeShip({ hull: 742, faction: 'quevari', ai: 'patrol' });
drifting.x = 80000;
drifting.target = combatTarget;
game.features.story.storyArrive(owner, space);
assert.equal(drifting.x, 80000, 'a surviving target fighting someone else is not moved');
drifting.target = null;
combatTarget.target = drifting;
game.features.story.storyArrive(owner, space);
assert.equal(drifting.x, 80000, 'a target under attack is not moved');
combatTarget.target = null;
combatTarget.combatTarget = drifting;
game.features.story.storyArrive(owner, space);
assert.equal(drifting.x, 80000, 'Combat Assist engagement prevents recovery');
combatTarget.combatTarget = null;
game.features.story.storyArrive(owner, space);
assert.ok(Math.hypot(drifting.x, drifting.y) <= 1500);

space.kill(drifting, owner.ent);
assert.equal(owner.data.story.active!.got, 1, 'survivor remains creditable after death/reentry');
console.log(
  `Story encounters passed; seeded 20-minute post-death drift max distance ${maximumDistance.toFixed(0)}.`,
);
