import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { missionTargets } from '../client/missions.ts';
import { missionDetails } from '../client/mission-details.ts';
import type { ClientGameState } from '../client/main.ts';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { hullCombatPower } from '../shared/hostile.ts';
import { makeLoadout, type GameAssets } from '../shared/rules.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { mockMission } from './helpers/mocks.ts';

process.env.SEEDS_FILE = '/nonexistent';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new DB(tempDataDir('combat-jobs-')));
const socket = legacySocket();
const messages: LegacyPacket[] = [];
socket.open = true;
socket.backlog = 0;
socket.send = (message: string) =>
  messages.push(typeof message === 'string' ? JSON.parse(message) : message);
socket.close = () => {};
game.connect(socket, '127.0.0.91');
socket.emit('message', JSON.stringify({ t: 'hello', name: 'Combat Jobs QA', pass: 'disposable' }));
const session = requiredFixtureValue([...game.sessions.values()].pop());
const captain = session.data;
const home = STELLARS.qstation;
captain.sys = home.system;
captain.stellar = home.id;
const originalNow = Date.now;
try {
  let checked = 0;
  for (const hull of [703, 708, 715]) {
    captain.ship = makeLoadout(assets, hull);
    const power = game.features.hostile.myPower(captain);
    for (let window = 0; window < 100; window++) {
      Date.now = () => 1800000000000 + window * 600000;
      for (const offer of game.offers(home, captain).filter((offer) => offer.type === 'bounty')) {
        assert.ok(!offer.elite, 'starter hub never offers elite capital contracts');
        assert.ok(
          hullCombatPower(assets, offer.hull!) <= power * 0.75,
          'ordinary bounty fits current combat power',
        );
        assert.ok(
          offer.reward >= (assets.ships[offer.hull!].cost || 0) * 0.025 - 1,
          'two comparable contracts cover one insurance loss',
        );
        checked++;
      }
    }
  }
  assert.ok(checked > 20, 'sample actual board bounty offers across hulls and rotations');
  captain.stellar = home.id;
  const creditsBefore = captain.credits;
  const missionsBefore = captain.missions.length;
  messages.length = 0;
  game.accept(session, 'expired-window-offer');
  assert.equal(captain.missions.length, missionsBefore);
  assert.equal(captain.credits, creditsBefore);
  assert.ok(
    messages.some((message) => message.t === 'toast' && /expired.*refreshed/.test(message.msg)),
  );
  assert.ok(
    messages.some((message) => message.t === 'landed'),
    'stale accept refreshes actual landed board',
  );

  const pickup = STELLARS.concordia;
  const destination = requiredFixtureValue(
    Object.values(STELLARS).find(
      (port) => !port.site && port.svc.includes('L') && port.system !== pickup.system,
    ),
  );
  game.db.world.states[pickup.system] = {
    kind: 'refugees',
    start: Date.now(),
    until: Date.now() + 600000,
    got: 0,
    need: 100,
  };
  const reliefOffer = requiredFixtureValue(
    game.features.living
      .stateOffers(
        home,
        captain,
        () => 0,
        [
          [pickup.system, 1],
          [destination.system, 2],
        ],
        1,
      )
      .find((offer) => offer.type === 'passenger'),
  );
  assert.equal(
    STELLARS[reliefOffer.pickup!].system,
    pickup.system,
    'generated relief offer records its real source-system pickup',
  );
  assert.equal(reliefOffer.boarded, false);
  assert.notEqual(reliefOffer.pickup, reliefOffer.dest);
  assert.match(reliefOffer.text, /Collect.*at/);
  captain.missions = [
    mockMission({
      id: 'relief',
      type: 'passenger',
      pickup: pickup.id,
      boarded: false,
      dest: destination.id,
      sys: destination.system,
      pax: 1,
      reward: 12345,
      title: 'Relief passage',
    }),
  ];
  game.db.touch();
  game.db.flush();
  const unboardedSave = requiredFixtureValue(new DB(game.db.dir).get(session.name!));
  assert.equal(unboardedSave.missions[0].pickup, pickup.id);
  assert.equal(
    unboardedSave.missions[0].boarded,
    false,
    'unboarded pickup survives durable save reload',
  );
  const client = {
    A: assets,
    sys: home.system,
    you: {
      ...captain,
      arcs: [],
      quests: { active: [] },
      shipStats: { cargo: 100 },
      cargoUsed: 0,
      power: game.features.hostile.myPower(captain),
    },
  } as unknown as ClientGameState;
  const relief = captain.missions[0];
  const objective = requiredFixtureValue(
    missionTargets(client).find((objective) => objective.key === relief.id),
  );
  assert.equal(objective.stellar, pickup.id, 'mission marker routes to pickup before boarding');
  assert.equal(objective.sys, pickup.system);
  assert.match(missionDetails(client, objective, true).turnIn, /Collect passengers/);
  const bountyDetails = missionDetails(client, { type: 'bounty', hull: 760, sys: home.system });
  assert.ok(
    bountyDetails.risk.includes(`threat ${Math.round(hullCombatPower(assets, 760))}`),
    'combat UI uses actual fitted threat rating',
  );
  game.completeOnLanding(session, destination);
  assert.equal(captain.credits, creditsBefore, 'destination before pickup pays nothing');
  assert.equal(captain.missions.length, 1);
  game.completeOnLanding(session, home);
  assert.equal(captain.missions[0].boarded, false, 'unrelated landing cannot board passengers');
  game.completeOnLanding(session, pickup);
  assert.equal(captain.missions[0].boarded, true);
  game.db.touch();
  game.db.flush();
  assert.equal(
    requiredFixtureValue(new DB(game.db.dir).get(session.name!)).missions[0].boarded,
    true,
    'boarded status survives durable save reload',
  );
  client.you!.missions = captain.missions;
  const boardedObjective = requiredFixtureValue(
    missionTargets(client).find((objective) => objective.key === relief.id),
  );
  assert.equal(
    boardedObjective.stellar,
    destination.id,
    'boarding switches navigation to destination',
  );
  game.completeOnLanding(session, destination);
  assert.equal(captain.credits, creditsBefore + 12345, 'pickup followed by destination pays once');
  game.completeOnLanding(session, destination);
  assert.equal(captain.credits, creditsBefore + 12345);

  captain.missions = [];
  captain.sys = home.system;
  captain.stellar = home.id;
  captain.ship = makeLoadout(assets, 715);
  game.depart(session);
  const player = requiredFixtureValue(session.ent);
  const space = game.spaces[captain.sys];
  const npc = space.makeShip({ hull: 708, faction: 'quantum', x: 0, y: 0, ai: 'patrol' });
  function bounty(id: string) {
    const mission = mockMission({
      id,
      type: 'bounty',
      owner: session.id,
      sys: captain.sys,
      hull: 703,
      faction: 'hollow',
      targetName: 'Test target',
      reward: 9999,
    });
    captain.missions.push(mission);
    const target = requiredFixtureValue(space.spawnMissionTarget(mission));
    return { mission, target };
  }
  const participated = bounty('participated');
  space.damage(participated.target, 1, 1, player);
  const killsBefore = captain.stats.kills;
  space.damage(participated.target, 1e8, 1e8, npc);
  assert.equal(
    participated.mission.done,
    true,
    'NPC finishing a damaged accepted bounty preserves contract credit',
  );
  assert.equal(captain.stats.kills, killsBefore, 'NPC finish does not invent a player kill');
  const completedNotices = messages.filter((message) =>
    /Bounty complete/.test(message.msg || ''),
  ).length;
  space.kill(participated.target, npc);
  assert.equal(
    messages.filter((message) => /Bounty complete/.test(message.msg || '')).length,
    completedNotices,
    'repeated death cannot repeat credit',
  );
  const untouched = bounty('untouched');
  space.damage(untouched.target, 1e8, 1e8, npc);
  assert.ok(!untouched.mission.done, 'NPC-only kills do not complete a bounty');
  const zero = bounty('zero');
  space.damage(zero.target, 0, 0, player);
  space.damage(zero.target, 1e8, 1e8, npc);
  assert.ok(!zero.mission.done, 'zero damage does not count as participation');
  captain.missions = [untouched.mission];
  game.completeOnLanding(session, home);
  assert.equal(
    untouched.mission.spawned,
    false,
    'uncredited target becomes available again after landing',
  );
  const replacement = requiredFixtureValue(space.spawnMissionTarget(untouched.mission));
  assert.notEqual(replacement.id, untouched.target.id);
  assert.ok(!replacement.dead, 'uncredited bounty can be retried rather than stranded');

  captain.missions = [];
  captain.stellar = home.id;
  captain.sys = home.system;
  captain.ship = makeLoadout(assets, 708);
  let actualOffer;
  for (let window = 0; window < 100 && !actualOffer; window++) {
    Date.now = () => 1800000000000 + window * 600000;
    actualOffer = game.offers(home, captain).find((offer) => offer.type === 'bounty');
    if (actualOffer) break;
  }
  const offer = requiredFixtureValue(actualOffer);
  game.accept(session, offer.id);
  const accepted = requiredFixtureValue(
    captain.missions.find((mission) => mission.id === offer.id),
  );
  captain.sys = accepted.sys;
  const targetSpace = game.spaces[captain.sys];
  const acceptedTarget = requiredFixtureValue(targetSpace.spawnMissionTarget(accepted));
  const paidBefore = captain.credits;
  const lead = targetSpace.makeShip({
    hull: Number(captain.ship.hull),
    faction: 'quantum',
    x: 0,
    y: 0,
    ai: 'patrol',
    player: game.pref(session),
  });
  targetSpace.damage(acceptedTarget, 1e8, 1e8, lead);
  assert.equal(
    accepted.done,
    true,
    'accepted board target earns completion through production damage',
  );
  const turnIn = requiredFixtureValue(
    Object.values(STELLARS).find((port) => port.system === captain.sys && port.svc.includes('L')),
  );
  game.completeOnLanding(session, turnIn);
  const actualIncome = captain.credits - paidBefore;
  assert.ok(actualIncome >= accepted.reward, 'actual kill bounty and contract reward are paid');
  assert.ok(
    actualIncome * 2 >= (assets.ships[accepted.hull!].cost || 0) * 0.05,
    'two comparable successful contracts cover target-hull insurance',
  );
  console.log(
    `Actual bounty income ${actualIncome}; contract ${accepted.reward}; comparable hull insurance ${Math.round((assets.ships[accepted.hull!].cost || 0) * 0.05)}.`,
  );

  console.log(
    `Combat jobs: ${checked} power-limited offers; stale-board feedback; pickup enforcement; NPC finishing and no-participation/duplicate denial passed.`,
  );
} finally {
  Date.now = originalNow;
}
process.exit(0);
