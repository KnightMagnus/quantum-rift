// Difficulty curve around Station Tier 3: the carried-over newcomer truce, raid groups sized to
// the captain, power-based danger ratings, the career practice raider and the Caravel's stock gun.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { mockGame, mockSession, mockEntity, type FixtureShape } from './helpers/mocks.ts';
import type { Entity } from '../server/space.ts';
import type { PlayerData, Session } from '../server/game.ts';
import type { ClientGameState } from '../client/main.ts';
import { Game } from '../server/game.ts';
import { Space } from '../server/space.ts';
import { augmentAssets, makeLoadout, allOutfits } from '../shared/rules.ts';
import { SYS as systemsById, TRAFFIC } from '../shared/galaxy.ts';
import { TUTORIAL } from '../shared/tutorial.ts';
import {
  PRACTICE_RAIDER,
  TIER3_TRUCE,
  dangerTier,
  fitRaidToBudget,
  raidBudget,
} from '../shared/hostile.ts';
import { missionDetails } from '../client/mission-details.ts';

const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
const strengthOf = (hull: number) => assets.ships[hull]?.strength || 10;

// ------------------------------------------------------------------ raid budget
assert.equal(raidBudget(100, 0), 80);
assert.equal(raidBudget(72, 2), 72 * 1.6);
assert.equal(raidBudget(100, 5), 280);
{
  const hollowPool = TRAFFIC.hollow.war; // Kestrel 30, Cutlass 80, Bramble 180, Tempest 520
  assert.deepEqual(
    fitRaidToBudget([711, 711, 711], hollowPool, strengthOf, 115),
    [708],
    'a Caravel at danger 2 meets one Cutlass, not three Gunboats',
  );
  assert.deepEqual(
    fitRaidToBudget([708, 705, 705], hollowPool, strengthOf, 140),
    [708, 705, 705],
    'groups within budget are unchanged',
  );
  assert.deepEqual(
    fitRaidToBudget([708, 708, 705], hollowPool, strengthOf, 115),
    [708, 705],
    'escorts that would exceed the budget are dropped',
  );
  assert.deepEqual(
    fitRaidToBudget([716], hollowPool, strengthOf, 5),
    [705],
    'a tiny budget still spawns the weakest raider',
  );
  assert.deepEqual(fitRaidToBudget([], hollowPool, strengthOf, 100), []);
}

// ------------------------------------------------------------------ danger tiers
assert.equal(dangerTier(100, 80), 'low');
assert.equal(dangerTier(100, 81), 'moderate');
assert.equal(dangerTier(100, 160), 'moderate');
assert.equal(dangerTier(100, 260), 'high');
assert.equal(dangerTier(100, 261), 'deadly');
assert.equal(dangerTier(72, 540), 'deadly', 'the three-Gunboat patrol from the playtest');

// ------------------------------------------------------------------ carried-over truce after Tier 3
const captain = (station: FixtureShape<PlayerData['station']>, kills = 0, jumps = 0) =>
  ({
    station,
    stats: { kills, jumps, earned: 0 },
    log: [],
    ship: { hull: 824 },
  }) as unknown as PlayerData;
{
  const game = Object.create(Game.prototype) as Game;
  assert.equal(game.newcomer(captain({ ops: 2 })), true, 'below Tier 3 is protected');
  assert.equal(game.newcomer(captain({ ops: 3 })), false, 'old Tier 3 saves stay unprotected');
  const ends = { kills: 7, jumps: 40 };
  assert.equal(game.newcomer(captain({ ops: 3, truceEnds: ends }, 6, 39)), true);
  assert.equal(game.newcomer(captain({ ops: 3, truceEnds: ends }, 7, 0)), false, 'kills end it');
  assert.equal(game.newcomer(captain({ ops: 4, truceEnds: ends }, 0, 40)), false, 'jumps end it');
  const optOut = captain({ ops: 3, truceEnds: ends });
  optOut.noShield = true;
  assert.equal(game.newcomer(optOut), false, 'the protection opt-out still applies');
  assert.deepEqual(game.truceLeft(captain({ ops: 3, truceEnds: ends }, 4, 25)), {
    kills: 3,
    jumps: 15,
  });
  assert.equal(game.truceLeft(captain({ ops: 2 })), null);
}
const truceGame = (power: number) => {
  const toasts: string[] = [];
  const game = mockGame({
    // oxlint-disable-next-line typescript/unbound-method -- Production method under test.
    newcomer: Game.prototype.newcomer,
    // oxlint-disable-next-line typescript/unbound-method -- Production method under test.
    checkTier3Truce: Game.prototype.checkTier3Truce,
    // oxlint-disable-next-line typescript/unbound-method -- Production method under test.
    log: Game.prototype.log,
    toast: (_session: Session, message: string) => void toasts.push(message),
    db: { touch() {} },
    features: { hostile: { myPower: () => power } },
  });
  return { game, toasts };
};
{
  const { game, toasts } = truceGame(72);
  const session = mockSession({ data: captain({ ops: 3, truceEnds: { kills: 5, jumps: 30 } }) });
  game.checkTier3Truce(session);
  assert.ok(session.data.station.truceEnds, 'a weak ship keeps the carried-over truce');
  assert.equal(toasts.length, 0);
  session.data.stats.kills = 5;
  game.checkTier3Truce(session);
  assert.equal(session.data.station.truceEnds, undefined, 'the truce ends after enough kills');
  assert.match(toasts[0], /Newcomer protection has ended/);
  assert.match(session.data.log.at(-1)!.text, /protection ended/);
}
{
  const { game, toasts } = truceGame(TIER3_TRUCE.power);
  const session = mockSession({ data: captain({ ops: 3, truceEnds: { kills: 5, jumps: 30 } }) });
  game.checkTier3Truce(session);
  assert.equal(session.data.station.truceEnds, undefined, 'a strong enough ship ends the truce');
  assert.equal(toasts.length, 1);
}

// ------------------------------------------------------------------ raids sized to the captain present
const raidSpace = (power: number, danger: number, faction = 'hollow') => {
  const spawned: number[][] = [];
  let group: number[] = [];
  const space = Object.assign(Object.create(Space.prototype) as Space, {
    id: 'raid-fixture',
    sys: { id: 'raid-fixture', danger, faction, links: [], stellars: [] },
    A: assets,
    t: 0,
    ships: new Map<number, Entity>(),
    events: [],
    game: mockGame({
      features: {
        living: { stateOf: () => null },
        hostile: { myPower: () => power },
      },
    }),
    ports: () => [],
    makeShip(options: { hull: number; owner?: number | null }) {
      if (!options.owner) spawned.push((group = []));
      group.push(options.hull);
      return mockEntity({ id: spawned.length * 10 + group.length, ai: 'raid' });
    },
  });
  const player = mockEntity({
    id: 1,
    player: { id: 1, s: mockSession({ data: captain({ ops: 3 }) }) },
  });
  player.player!.s.ent = player;
  space.ships.set(1, player);
  return { space, spawned };
};
for (const [power, danger] of [
  [72, 4],
  [72, 6],
  [300, 5],
] as const) {
  const { space, spawned } = raidSpace(power, danger);
  for (let index = 0; index < 300; index++) space.spawnTraffic(false);
  const budget = raidBudget(power, danger);
  assert.ok(spawned.length > 50, 'pirate havens keep spawning raids');
  for (const group of spawned) {
    const total = group.reduce((sum, hull) => sum + strengthOf(hull), 0);
    assert.ok(
      total <= budget || (group.length === 1 && group[0] === 705),
      `raid ${group.join(',')} (${total}) fits a ${budget} budget`,
    );
  }
  if (power === 300)
    assert.ok(
      spawned.some((group) => group.length > 1),
      'strong captains still face multi-ship raids',
    );
}
{
  const { space } = raidSpace(72, 4);
  space.ships.clear();
  assert.equal(space.raidBudget(), null, 'raids are not scaled when no captain is present');
  const farside = raidSpace(72, 4).space;
  farside.sys = { ...farside.sys, farside: true };
  assert.equal(farside.raidBudget(), null, 'Farside keeps full-strength raids');
}

// ------------------------------------------------------------------ danger labels compare power
{
  const gloam = systemsById.gloam,
    emberlight = systemsById.emberlight;
  assert.equal(gloam.danger, 4);
  assert.equal(emberlight.danger, 2);
  const state = {
    A: assets,
    sys: 'qgate',
    you: {
      power: 72,
      missions: [],
      cargoUsed: 0,
      shipStats: { cargo: 160 },
      ship: { hull: 824 },
      armada: null,
    },
  } as unknown as ClientGameState;
  assert.equal(
    missionDetails(state, { type: 'patrol', sys: 'emberlight', reward: 1 }).risk,
    '◆ Moderate (threat 115 vs your 72)',
  );
  assert.equal(
    missionDetails(state, { type: 'patrol', sys: 'gloam', reward: 1 }).risk,
    '▲ High (threat 173 vs your 72)',
  );
  assert.equal(
    missionDetails(state, { type: 'bounty', hull: 711, sys: 'gloam', reward: 1 }).risk,
    '▲ High (threat 180 vs your 72)',
  );
  assert.equal(
    missionDetails(state, { type: 'bounty', hull: 716, sys: 'emberlight', reward: 1 }).risk,
    '☠ Deadly (threat 520 vs your 72)',
  );
  assert.equal(
    missionDetails(state, { type: 'bounty', hull: 705, sys: 'gloam', reward: 1 }).risk,
    '● Low (threat 30 vs your 72)',
    'a weak target is Low even in a dangerous system',
  );
  assert.equal(
    missionDetails(state, { type: 'cargo', qty: 1, sys: 'gloam', reward: 1 }).risk,
    '▲ High',
    'non-combat jobs keep the system rating',
  );
}

// ------------------------------------------------------------------ career practice raider
const killStep = TUTORIAL.findIndex((step) => step.ev === 'kill');
assert.ok(killStep >= 0);
const practiceFixture = (power: number, tut: number, sys: FixtureShape<Space['sys']> = {}) => {
  const toasts: string[] = [];
  const spawned: Entity[] = [];
  const space = mockEntity({}) as unknown as Space;
  Object.assign(space, {
    sys: { danger: 0, faction: 'quantum', ...sys },
    ships: new Map<number, Entity>(),
    events: [],
    makeShip(options: { hull: number; name: string; faction: string }) {
      const raider = mockEntity({ id: 100 + spawned.length, ...options, dead: false });
      spawned.push(raider);
      space.ships.set(raider.id, raider);
      return raider;
    },
  });
  const session = mockSession({ id: 7, data: { tut } });
  session.ent = mockEntity({ id: 1, x: 0, y: 0 });
  const game = mockGame({
    A: assets,
    toast: (_session: Session, message: string) => void toasts.push(message),
    features: { hostile: { myPower: () => power } },
  });
  return { game, space, session, spawned, toasts };
};
{
  const { game, space, session, spawned, toasts } = practiceFixture(4, killStep);
  Game.prototype.practiceRaider.call(game, session, space);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].hull, PRACTICE_RAIDER.hulls[0], 'a starter Gnat meets a Gnat');
  assert.equal(spawned[0].huntOf, session.id, 'the straggler ignores the newcomer truce');
  assert.equal(spawned[0].practiceOf, session.id);
  assert.match(toasts[0], /Hollow straggler/);
  Game.prototype.practiceRaider.call(game, session, space);
  assert.equal(spawned.length, 1, 'only one straggler at a time');
  spawned[0].dead = true;
  Game.prototype.practiceRaider.call(game, session, space);
  assert.equal(spawned.length, 2, 'another arrives if the goal is still open');
}
{
  const { game, space, session, spawned } = practiceFixture(72, killStep);
  Game.prototype.practiceRaider.call(game, session, space);
  assert.equal(spawned[0].hull, 705, 'a Caravel meets a Kestrel Scout');
}
for (const [tut, sys] of [
  [killStep + 1, {}],
  [killStep - 1, {}],
  [killStep, { farside: true }],
  [killStep, { arena: true }],
  [killStep, { faction: 'deep' }],
] as const) {
  const { game, space, session, spawned } = practiceFixture(72, tut, sys);
  Game.prototype.practiceRaider.call(game, session, space);
  assert.equal(spawned.length, 0, `no straggler for step ${tut} in ${JSON.stringify(sys)}`);
}

// ------------------------------------------------------------------ Caravel stock loadout
{
  const caravel = makeLoadout(assets, 824);
  const outfits = allOutfits(assets);
  const weapons = Object.keys(caravel.outfits).map((id) => outfits[id].eff?.weapon);
  assert.ok(weapons.includes(129), 'the Caravel ships with a Cinder Driver in its gun mount');
  assert.ok(weapons.includes(130), 'and keeps its two Mica Sentinel turrets');
}

console.log('PASS difficulty curve: Tier 3 truce, raid budgets, danger ratings, practice raider');
