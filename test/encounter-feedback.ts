import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { encounterFeedback } from '../server/encounter-feedback.ts';
import { nhalTelegraph } from '../server/nhal.ts';
import { drawEncounterFeedback } from '../client/encounter-feedback.ts';

const game = refineryGame();
const owner = refineryPilot(game, 'Encounter owner');
owner.data.stellar = null;
game.spawnPlayer(owner, 0, 0, 0, 0);
const space = game.spaces[owner.data.sys];
const creature = game.features.nhal.storyCreature(space, 908, owner.id, 200, 0, 0)!;
creature.storyKill = true;
creature.storyMission = 'test-fight';
const visible = new Set([creature.id]);
assert.equal(encounterFeedback(game, owner, space, visible)[0]?.health, 1);
assert.equal(nhalTelegraph(space, creature), undefined, 'no invented idle countdown');
space.t = 3;
game.features.nhal.ai(space, creature);
assert.deepEqual(nhalTelegraph(space, creature), { name: 'Pulse', radius: 900, seconds: 3 });
const payload = encounterFeedback(game, owner, space, visible);
assert.equal(payload[0].ability?.seconds, 3);
space.t = 4;
assert.equal(encounterFeedback(game, owner, space, visible)[0].ability?.seconds, 2);
assert.deepEqual(
  encounterFeedback(game, owner, space, new Set()),
  [],
  'filtered actors reveal no metadata',
);
const stranger = refineryPilot(game, 'Encounter stranger');
stranger.data.stellar = null;
game.spawnPlayer(stranger, 300, 0, 0, 0);
assert.deepEqual(
  encounterFeedback(game, stranger, space, visible),
  [],
  'private story boss is hidden',
);
owner.data.armada = 'test-team';
stranger.data.armada = 'test-team';
owner.data.story.active = { id: 'test-fight' } as typeof owner.data.story.active;
owner.sharedStory = {
  mission: 'test-fight',
  ownerEntity: owner.ent!.id,
  helperEntities: { [stranger.id]: stranger.ent!.id },
  armada: 'test-team',
  sys: space.id,
  helpers: [stranger.id],
  until: Date.now() + 60000,
};
stranger.storyAssistOwner = owner.id;
assert.equal(
  encounterFeedback(game, stranger, space, visible).length,
  1,
  'live consent shares boss feedback',
);
stranger.storyAssistOwner = undefined;
assert.deepEqual(
  encounterFeedback(game, stranger, space, visible),
  [],
  'revoked consent removes feedback',
);
space.t = 6;
game.features.nhal.ai(space, creature);
assert.equal(
  nhalTelegraph(space, creature),
  undefined,
  'pulse resolution removes danger countdown',
);
creature.armor *= 0.5;
assert.equal(encounterFeedback(game, owner, space, visible)[0]?.health, 0.5);
creature.dead = true;
assert.deepEqual(encounterFeedback(game, owner, space, visible), [], 'dead bosses disappear');

for (const [hull, radius, duration] of [
  [901, 900, 5],
  [906, 500, 2],
]) {
  const attacker = game.features.nhal.storyCreature(space, hull, owner.id, 200, 0, hull - 900)!;
  space.t += 3;
  game.features.nhal.ai(space, attacker);
  assert.equal(nhalTelegraph(space, attacker)?.radius, radius);
  assert.equal(nhalTelegraph(space, attacker)?.seconds, duration);
  attacker.x = 1800;
  game.features.nhal.ai(space, attacker);
  assert.equal(
    nhalTelegraph(space, attacker),
    undefined,
    'leaving the real break range clears telegraph',
  );
  attacker.dead = true;
}
const ordinaryBoss = space.makeShip({ hull: 704, faction: 'hollow', x: 400, y: 0, ai: 'raid' });
ordinaryBoss.boss = 'fixture';
const generic = encounterFeedback(game, stranger, space, new Set([ordinaryBoss.id]));
assert.equal(generic[0]?.health, 1);
assert.equal(
  generic[0]?.ability,
  undefined,
  'ordinary boss has health but no fabricated attack timer',
);

const labels: string[] = [];
const circles: number[][] = [];
const bars: number[][] = [];
const labelPositions: number[][] = [];
const context = {
  save() {},
  restore() {},
  beginPath() {},
  fill() {},
  stroke() {},
  setLineDash() {},
  arc(...values: number[]) {
    circles.push(values);
  },
  fillRect(...values: number[]) {
    bars.push(values);
  },
  fillText(text: string, x: number, y: number) {
    labels.push(text);
    labelPositions.push([x, y]);
  },
} as unknown as CanvasRenderingContext2D;
drawEncounterFeedback(
  context,
  payload,
  240,
  320,
  (x) => 10 + x / 2,
  (y) => 20 + y / 2,
);
assert.equal(circles[0][2], 450, 'danger radius follows world-to-screen scale');
assert.ok(labels.some((label) => label.includes('Pulse: 3s') && label.includes('900')));
assert.ok(labels.some((label) => label.includes('100%')));
assert.ok(
  bars.every((bar) => bar[0] >= 0 && bar[2] <= 240),
  'compact HUD fits narrow canvas',
);
labels.length = circles.length = 0;
drawEncounterFeedback(
  context,
  [],
  240,
  320,
  (x) => x,
  (y) => y,
);
assert.equal(labels.length + circles.length, 0, 'empty authoritative payload leaves no HUD');
for (const height of [32, 64, 100, 160, 240]) {
  labels.length = labelPositions.length = bars.length = 0;
  const encounters = Array.from({ length: 6 }, (_, index) => ({
    ...payload[0],
    id: index,
    name: `Encounter ${index}`,
    ability: index === 5 ? { name: 'Urgent pulse', seconds: 1, radius: 900 } : undefined,
  }));
  drawEncounterFeedback(
    context,
    encounters,
    240,
    height,
    (x) => x,
    (y) => y,
  );
  assert.ok(
    labelPositions.every((position) => position[1] <= height - 4),
    'every label fits short canvas',
  );
  assert.ok(
    bars.every((bar) => bar[1] + bar[3] <= height),
    'every card fits short canvas',
  );
  if (height >= 42) {
    assert.ok(
      labels.some((label) => label.startsWith('+')),
      'omitted encounters have a summary',
    );
  } else assert.equal(labels.length, 0, 'tiny canvas omits text without hiding zones');
  if (height >= 100)
    assert.match(labels[0], /Encounter 5/, 'active windup precedes generic health');
  assert.equal(encounters[0].id, 0, 'prioritization does not mutate snapshot order');
}
console.log('Encounter health, real windups, visible-ID/privacy gates and scaled HUD passed.');
