import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { mockMission } from './helpers/mocks.ts';
import { requiredFixtureValue as required } from './helpers/required.ts';
import { SYS, STELLARS, FACTIONS } from '../shared/galaxy.ts';
import { TICK } from '../shared/rules.ts';
import type { SnapshotMessage } from '../client/protocol.ts';
const game = refineryGame();
const system = Object.values(SYS).find(
  (system) =>
    !FACTIONS[system.faction].region &&
    !FACTIONS[system.faction].pirate &&
    system.danger <= 2 &&
    !system.gate,
)!;
const stellar = system.stellars.find((stellar) => stellar.svc?.includes('L'))!;
assert.ok(stellar);
const alpha = refineryPilot(game, 'Attention Alpha'),
  bravo = refineryPilot(game, 'Attention Bravo'),
  docked = refineryPilot(game, 'Attention Docked');
for (const session of [alpha, bravo, docked]) {
  session.data.sys = system.id;
  session.data.stellar = stellar.id;
}
const space = game.spaces[system.id];
for (const entity of space.ships.values()) space.remove(entity);
space.spawnT = 1e9;
for (const [session, y] of [
  [alpha, 0],
  [bravo, 3000],
] as const) {
  session.data.stellar = null;
  game.spawnPlayer(session, 10000, 10000 + y, 0, 0);
}
const recipient = required(alpha.ent);
const attacker = space.makeShip({
  hull: 711,
  faction: system.faction,
  x: 10050,
  y: 10000,
  ai: 'patrol',
});
attacker.aggro.add(recipient.id);
attacker.target = recipient;
attacker.think = 100;
const patrol = space.makeShip({
  hull: 711,
  faction: system.faction,
  x: 10020,
  y: 10000,
  ai: 'patrol',
});
patrol.think = 100;
alpha.data.missions = [
  mockMission({
    id: 'attention-scan',
    type: 'smuggle',
    reward: 100,
    title: 'Sealed cargo',
    done: false,
  }),
];
const random = Math.random;
function last(session: typeof alpha, type: 'snap' | 'scene') {
  return required(
    session.sock.out.filter((packet) => packet.t === type).at(-1),
  ) as unknown as SnapshotMessage;
}
function advance() {
  game.tickN += game.tickN % 2;
  game.tick();
  game.tick();
  assert.equal(space.errs || 0, 0, 'Real space tick does not swallow fixture failures');
}
try {
  Math.random = () => 0.99999;
  game.tickN = TICK * 2 - 1;
  game.tick();
  assert.equal(
    last(alpha, 'snap').attention?.targeted,
    true,
    'Real NPC AI/fight selects the recipient',
  );
  assert.equal(
    last(alpha, 'snap').attention?.scanned,
    true,
    'Real missionIdle scan reaches the same snapshot',
  );
  assert.deepEqual(
    last(bravo, 'snap').attention,
    { targeted: false, scanned: false },
    'Shared snapshot never copies private flags to another captain',
  );
  assert.equal(
    last(docked, 'scene').attention,
    undefined,
    'Docked scene does not publish private attention',
  );
  assert.equal('attention' in space.snapshot(), false, 'Shared snapshot stays public');
  assert.deepEqual(Object.keys(required(last(alpha, 'snap').attention)).sort(), [
    'scanned',
    'targeted',
  ]);
  const publicShips = space.snapshot().ships;
  for (const ship of publicShips) {
    assert.ok(
      ship.length === 14 || ship.length === 15,
      'public snapshot retains the 14-field base with one optional ending',
    );
    for (let index = 0; index < 14; index++) {
      if (index === 11)
        assert.ok(
          ship[index] === null || typeof ship[index] === 'string',
          'name field remains nullable text',
        );
      else
        assert.ok(
          typeof ship[index] === 'number' && Number.isFinite(ship[index]),
          `base field ${index} remains a finite number`,
        );
    }
    if (ship.length === 15)
      assert.ok(
        ship[14] === null ||
          (typeof ship[14] === 'string' &&
            ['long_dream', 'table', 'unsettling', 'captains_watch'].includes(ship[14])),
        'only a public ending enum or null follows the base tuple',
      );
    assert.equal(ship.length, 15, 'current producer appends exactly one public ending field');
  }
  assert.ok(
    publicShips.every((ship) => ship[14] === null),
    'captains without endings and NPCs expose no story decisions',
  );
  const story = game.features.story.storyInit(alpha.data);
  const priorFlags = story.flags;
  for (const ending of ['long_dream', 'table', 'unsettling', 'captains_watch'] as const) {
    story.flags = { main_ending: ending, d1: 'hollow', d2: 'umbral' };
    const published = required(space.snapshot().ships.find((ship) => ship[0] === recipient.id));
    assert.deepEqual(
      published.slice(14),
      [ending],
      'only the exact ending enum is appended, not private choices',
    );
  }
  story.flags = priorFlags;
  attacker.armor = attacker.st.armor * 0.1;
  advance();
  assert.equal(attacker.disabled, true, 'Actual production NPC disable threshold reached');
  assert.equal(
    last(alpha, 'snap').attention?.targeted,
    false,
    'Disabled attacker no longer sustains red',
  );
  attacker.armor = attacker.st.armor;
  attacker.disabled = false;
  attacker.target = recipient;
  attacker.aggro.add(recipient.id);
  advance();
  assert.equal(last(alpha, 'snap').attention?.targeted, true);
  attacker.target = null;
  attacker.aggro.clear();
  recipient.aggro.clear();
  attacker.ai = 'leave';
  attacker.think = 0;
  advance();
  assert.equal(
    last(alpha, 'snap').attention?.targeted,
    false,
    'Real AI cancellation clears stale fire intent',
  );
  attacker.target = recipient;
  attacker.aggro.add(recipient.id);
  advance();
  attacker.dead = true;
  advance();
  assert.equal(last(alpha, 'snap').attention?.targeted, false, 'Real source death clears');
  delete alpha.attentionScan;
  alpha.data.missions[0].scanT = 0;
  for (const state of ['disabled', 'dead', 'jumpout']) {
    space.ships.delete(attacker.id);
    patrol.disabled = state === 'disabled';
    patrol.dead = state === 'dead';
    patrol.state = state === 'jumpout' ? 'jumpout' : 'fly';
    game.features.fronts.missionIdle(alpha);
    assert.equal(alpha.attentionScan, undefined, 'Incapable patrol cannot scan: ' + state);
  }
  patrol.disabled = false;
  patrol.dead = false;
  patrol.state = 'fly';
  game.features.fronts.missionIdle(alpha);
  const scan = () => alpha.attentionScan;
  assert.ok(scan(), 'Live patrol can scan');
  const initial = required(scan()).until;
  game.features.fronts.missionIdle(alpha);
  assert.equal(required(scan()).until, initial, 'Cooldown does not extend the event');
  assert.equal(STELLARS[docked.data.stellar!].system, system.id);
  console.log(
    'Actual Game/Space ticks: recipient-only snapshot isolation, real scan producer, AI cancellation, disabled/dead sources and incapable patrol denial passed.',
  );
} finally {
  Math.random = random;
}
