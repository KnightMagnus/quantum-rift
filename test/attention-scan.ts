import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { requiredFixtureValue as required } from './helpers/required.ts';
import { mockMission } from './helpers/mocks.ts';
import { SYS, FACTIONS } from '../shared/galaxy.ts';
import { SCAN } from '../shared/fronts.ts';
import { attentionPayload } from '../server/attention.ts';
const game = refineryGame();
const system = Object.values(SYS).find(
  (system) =>
    !FACTIONS[system.faction].region && !FACTIONS[system.faction].pirate && system.danger <= 2,
)!;
const session = refineryPilot(game, 'Scan Captain');
session.data.sys = system.id;
session.data.stellar = null;
const space = game.spaces[system.id];
for (const entity of space.ships.values()) space.remove(entity);
space.spawnT = 1e9;
game.spawnPlayer(session, 10000, 10000, 0, 0);
const recipient = required(session.ent);
const patrol = space.makeShip({
  hull: 711,
  x: 10001,
  y: 10000,
  ai: 'patrol',
  faction: system.faction,
});
const random = Math.random;
const scan = () => session.attentionScan;
try {
  for (const caught of [false, true]) {
    session.data.missions = [
      mockMission({
        id: 'scan-contract',
        type: 'smuggle',
        done: false,
        reward: 100,
        title: 'Sealed cargo',
      }),
    ];
    delete session.attentionScan;
    Math.random = () => (caught ? 0 : 0.99999);
    const previousCredits = session.data.credits;
    game.features.fronts.missionIdle(session);
    const event = required(scan());
    assert.equal(event.entity, recipient.id);
    assert.equal(event.system, system.id);
    assert.equal(attentionPayload(session, space, event.until - 1).scanned, true);
    assert.equal(attentionPayload(session, space, event.until).scanned, false);
    const notices = session.sock.out.filter((packet) => packet.t === 'toast');
    assert.match(required(notices.at(-1)).msg, caught ? /found the contraband/ : /found nothing/);
    assert.equal(session.data.missions.length, caught ? 0 : 1);
    assert.equal(
      session.data.credits < previousCredits,
      caught,
      'Detection preserves actual fine outcome',
    );
  }
  function fresh() {
    session.data.missions = [
      mockMission({ id: 'scan-contract', type: 'smuggle', done: false, reward: 100 }),
    ];
    delete session.attentionScan;
  }
  fresh();
  patrol.x = recipient.x + SCAN.range;
  game.features.fronts.missionIdle(session);
  assert.equal(scan(), undefined, 'Exact scan boundary is excluded');
  fresh();
  patrol.x = recipient.x + 1;
  session.data.missions[0].scanT = Date.now();
  game.features.fronts.missionIdle(session);
  assert.equal(scan(), undefined, 'Cooldown creates no new event');
  fresh();
  session.data.missions = [];
  game.features.fronts.missionIdle(session);
  assert.equal(scan(), undefined, 'Nearby patrol without a smuggling mission is not a scan');
  fresh();
  session.data.missions[0].done = true;
  game.features.fronts.missionIdle(session);
  assert.equal(scan(), undefined, 'Completed mission cannot scan');
} finally {
  Math.random = random;
}
console.log(
  'Production patrol scans: both detection outcomes, actual fines, exact range, cooldown, no/completed mission and expiry passed.',
);
