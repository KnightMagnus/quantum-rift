import type { PlayerData } from '../server/game.ts';
import { mockPlayerReference, mockMission, mockPlayerData } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { refineryGame, refineryPilot, seed, lots } from './helpers/refinery-fixture.ts';
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { radioTourOffer, TOUR_ODDS, discoverRadio, radioState } from '../server/radio-discovery.ts';
import { occupiedPassengerSeats } from '../shared/passengers.ts';
import { DB as Database } from '../server/db.ts';
import { advanceRadioTour } from '../server/radio-discovery.ts';
import { makeLoadout } from '../shared/rules.ts';
function fixtureGame(directory?: string) {
  const interval = globalThis.setInterval,
    timeout = globalThis.setTimeout;
  try {
    globalThis.setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;
    globalThis.setTimeout = (() => ({ unref() {} })) as unknown as typeof setTimeout;
    return directory ? refineryGame(new Database(directory)) : refineryGame();
  } finally {
    globalThis.setInterval = interval;
    globalThis.setTimeout = timeout;
  }
}
let game = fixtureGame(),
  pilot = refineryPilot(game, 'Radio Explorer'),
  playerData = requiredFixtureValue(pilot).data;
assert.deepEqual(
  RADIO_STATIONS.map((session) => session.name),
  [
    'Wave Function Collapse',
    "QVRI Que'vari Radio",
    'Interdimensional Radio',
    'Signal Superposition Radio',
    'Super-Idol Radio',
  ],
);
assert.deepEqual(playerData.radioStations, ['wave-function-collapse']);
assert.equal(RADIO_STATIONS[4].playback, 'album');
assert.deepEqual(
  RADIO_STATIONS.map((session) => session.tracks.length),
  [9, 4, 7, 6, 8],
);
assert.deepEqual(radioState(mockPlayerData({ name: 'kNiGhT', radioStations: [] })), [
  'wave-function-collapse',
]);
assert.deepEqual(radioState(mockPlayerData({ name: 'Knightly', radioStations: [] })), [
  'wave-function-collapse',
]);
assert.deepEqual(
  radioState(
    mockPlayerData({
      name: 'Saved Listener',
      radioStations: RADIO_STATIONS.map((station) => station.id),
    }),
  ),
  RADIO_STATIONS.map((station) => station.id),
);
const notifications = () =>
  requiredFixtureValue(pilot).sock.out.filter(
    (message: { t: string; msg: string | string[] }) =>
      message.t === 'toast' && message.msg.includes('Discovered a new radio station'),
  );
for (const system of Object.values(systemsById).filter(
  (starSystem) => starSystem.faction === 'quevari',
)) {
  playerData.sys = system.id;
  discoverRadio(game, pilot);
}
assert.equal(notifications().length, 1, 'any Quevari system, one discovery only');
assert.match(notifications()[0].msg, /QVRI Que'vari Radio/);
playerData.sys = 'free-harbor';
discoverRadio(game, pilot);
assert.ok(
  !playerData.radioStations.includes('signal-superposition'),
  'retired locations no longer award it',
);
playerData.sys = 'lost-signal';
discoverRadio(game, pilot);
discoverRadio(game, pilot);
assert.equal(notifications().length, 2);
assert.ok(
  !playerData.radioStations.includes('interdimensional') &&
    !playerData.radioStations.includes('super-idol'),
);
// A real accepted story, real spawned salvage loot and the ordinary completion boundary.
playerData.sys = 'ninefold';
playerData.stellar = 'ninefold-prime';
playerData.ship = makeLoadout(game.A, 704, 'Radio QA');
playerData.cargo = {};
playerData.cargoLots = { version: 1, byCommodity: {} };
playerData.missions = [];
const story = game
  .offers(STELLARS['ninefold-prime'], playerData)
  .find((options) => options.side === 'sideways-apology');
assert.ok(story);
assert.match(story.rewardText!, /Interdimensional Radio/);
seed(playerData, {
  food: lots(requiredFixtureValue(game.features.shipStats.stats(playerData)).cargo),
});
game.accept(pilot, story.id);
assert.ok(!playerData.quests.active['s:sideways-apology'], 'full hold cannot start the repair job');
seed(playerData, {});
game.accept(pilot, story.id);
const fixtureState = (playerData as PlayerData).quests.active['s:sideways-apology'];
assert.ok(fixtureState);
assert.equal(fixtureState.steps.length, 3);
game.accept(pilot, story.id);
assert.equal(
  playerData.missions.filter((mission) => mission.quest?.qid === fixtureState.qid).length,
  1,
  'duplicate accept cannot add another repair job',
);
for (let step = 0; step < 2; step++) {
  const message = playerData.missions.find((mission) => mission.quest?.qid === fixtureState.qid);
  assert.equal(requiredFixtureValue(message).type, 'salvage');
  assert.ok(!playerData.radioStations.includes('interdimensional'));
  playerData.sys = requiredFixtureValue(message).sys;
  playerData.stellar = requiredFixtureValue(
    systemsById[message!.sys].stellars.find((player) => player.svc!.includes('L')),
  ).id;
  const landing = STELLARS[playerData.stellar];
  game.onMessage(pilot, { t: 'depart' });
  const space = game.spaces[playerData.sys];
  requiredFixtureValue(pilot).ent!.x = requiredFixtureValue(message).point![0] + 100;
  requiredFixtureValue(pilot).ent!.y = requiredFixtureValue(message).point![1];
  game.features.quests.questSalvageIdle(pilot);
  const loot = space.loot.find(
    (linkedSystemId) => linkedSystemId.it.salvage === requiredFixtureValue(message).id,
  );
  assert.ok(loot);
  const stranger = refineryPilot(game, 'Radio Stranger');
  assert.equal(
    game.onLoot(mockPlayerReference({ s: stranger }), loot.it),
    false,
    'another captain cannot take the materials',
  );
  assert.equal(game.onLoot(mockPlayerReference({ s: pilot }), loot.it), true);
  assert.ok(requiredFixtureValue(message).done);
  Object.assign(requiredFixtureValue(pilot).ent!, { x: landing.x, y: landing.y, vx: 0, vy: 0 });
  game.land(pilot, landing.id);
}
const final = playerData.missions.find((mission) => mission.quest?.qid === fixtureState.qid);
assert.equal(requiredFixtureValue(final).dest, 'ninefold-prime');
assert.equal(requiredFixtureValue(final).qty, 2);
game.completeOnLanding(pilot, STELLARS.earth);
assert.ok(!playerData.radioStations.includes('interdimensional'));
playerData.sys = 'ninefold';
playerData.stellar = 'ninefold-prime';
game.completeOnLanding(pilot, STELLARS['ninefold-prime']);
assert.ok(playerData.radioStations.includes('interdimensional'));
const credited = playerData.credits,
  count = notifications().length;
game.completeOnLanding(pilot, STELLARS['ninefold-prime']);
game.features.quests.questFinish(pilot, fixtureState);
assert.equal(playerData.credits, credited);
assert.equal(notifications().length, count);
assert.ok(
  !game
    .offers(STELLARS['ninefold-prime'], playerData)
    .some((mission) => mission.side === 'sideways-apology'),
);
// Deterministic rare offer: board refresh does not redraw the chance or itinerary.
playerData.sys = 'meridian';
playerData.stellar = 'meridian-yards';
playerData.missions = [];
const port = STELLARS['meridian-yards'];
let offer;
for (let quantity = 0; quantity < 20000 && !offer; quantity++) {
  playerData.stats.jumps = quantity;
  offer = radioTourOffer(port, playerData);
}
assert.ok(offer);
assert.equal(TOUR_ODDS, 1000);
assert.deepEqual(radioTourOffer(port, playerData), offer);
assert.equal(offer.pax, 3);
assert.equal(
  new Set(offer.radioTour.stops.map((identifier) => STELLARS[identifier].system)).size,
  5,
);
assert.equal(
  game.offers(port, playerData).find((mission) => mission.id === offer.id)?.type,
  'passenger',
);
playerData.ship = makeLoadout(game.A, 703, 'Too small');
game.accept(pilot, offer.id);
assert.ok(
  !playerData.missions.some((mission) => mission.radioTour),
  'insufficient passenger seats are refused',
);
playerData.ship = makeLoadout(game.A, 704, 'Tour bus');
game.accept(pilot, offer.id);
let tour = playerData.missions.find((mission) => mission.radioTour);
assert.ok(tour);
assert.equal(occupiedPassengerSeats(playerData.missions), 3);
assert.equal(radioTourOffer(port, playerData), null, 'one tour at a time');
const before = playerData.credits;
for (let quantity = 0; quantity < 5; quantity++) {
  if (quantity === 2) {
    // Stop the only save owner, then authenticate against a newly loaded database.
    game.db.touch();
    game.db.flush();
    const oldInterval = globalThis.setInterval,
      oldTimeout = globalThis.setTimeout;
    try {
      globalThis.setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;
      globalThis.setTimeout = (() => ({ unref() {} })) as unknown as typeof setTimeout;
      game = refineryGame(new Database(game.db.dir));
    } finally {
      globalThis.setInterval = oldInterval;
      globalThis.setTimeout = oldTimeout;
    }
    pilot = refineryPilot(game, 'Radio Explorer');
    playerData = requiredFixtureValue(pilot).data;
    tour = playerData.missions.find((mission) => mission.radioTour);
    assert.equal(
      requiredFixtureValue(tour).radioTour!.stop,
      2,
      'two completed shows survive an actual save reload',
    );
    assert.equal(occupiedPassengerSeats(playerData.missions), 3);
    assert.equal(playerData.credits, before);
    assert.ok(requiredFixtureValue(playerData.radioStations).includes('interdimensional'));
    assert.deepEqual(
      requiredFixtureValue(refineryPilot(game, 'Radio Stranger')).data.radioStations,
      ['wave-function-collapse'],
    );
  }
  const target = STELLARS[requiredFixtureValue(tour).dest!];
  game.completeOnLanding(pilot, port);
  assert.equal(requiredFixtureValue(tour).radioTour!.stop, quantity);
  assert.equal(playerData.credits, before);
  playerData.sys = target.system;
  playerData.stellar = target.id;
  game.completeOnLanding(pilot, target);
  if (quantity < 4) {
    assert.equal(playerData.credits, before);
    assert.equal(playerData.missions.length, 1);
    assert.equal(occupiedPassengerSeats(playerData.missions), 3);
    assert.ok(!requiredFixtureValue(playerData.radioStations).includes('super-idol'));
  }
}
assert.equal(playerData.credits, before + 60000);
assert.equal(occupiedPassengerSeats(playerData.missions), 0);
assert.ok(requiredFixtureValue(playerData.radioStations).includes('super-idol'));
assert.equal(radioTourOffer(port, playerData), null);
game.completeOnLanding(pilot, STELLARS[requiredFixtureValue(tour).dest!]);
assert.equal(playerData.credits, before + 60000);
game.db.touch();
game.db.flush();
const restored = fixtureGame(game.db.dir).db.get('Radio Explorer');
assert.deepEqual(requiredFixtureValue(restored).radioStations, playerData.radioStations);
assert.ok(requiredFixtureValue(restored).quests.sides['sideways-apology']);
// Untrusted/corrupt itineraries cannot skip the reward boundary.
for (const change of [
  { stops: requiredFixtureValue(tour).radioTour!.stops.slice(0, 4), stop: 4 },
  { stops: Array(5).fill(requiredFixtureValue(tour).radioTour!.stops[0]), stop: 4 },
  { stops: [...requiredFixtureValue(tour).radioTour!.stops.slice(0, 4), 'missing-port'], stop: 4 },
  { stops: requiredFixtureValue(tour).radioTour!.stops, stop: -1 },
  { stops: requiredFixtureValue(tour).radioTour!.stops, stop: 5 },
]) {
  const invalidValue = { ...tour!, paid: false, radioTour: change };
  assert.equal(
    advanceRadioTour(game, pilot, invalidValue!, STELLARS[requiredFixtureValue(tour).dest!]),
    true,
  );
  assert.equal(playerData.credits, before + 60000);
}
const clean = refineryPilot(game, 'Radio Abandon');
requiredFixtureValue(clean).data.sys = port.system;
requiredFixtureValue(clean).data.stellar = port.id;
let rare;
for (let jumps = 0; jumps < 20000 && !rare; jumps++) {
  requiredFixtureValue(clean).data.stats.jumps = jumps;
  rare = radioTourOffer(port, requiredFixtureValue(clean).data);
}
assert.ok(rare);
requiredFixtureValue(clean).data.missions = Array.from({ length: 6 }, (_unused, index) =>
  mockMission({ id: 'full-' + index, type: 'cargo' }),
);
game.accept(clean, rare.id);
assert.equal(
  requiredFixtureValue(clean).data.missions.length,
  6,
  'tour obeys the normal six-job limit',
);
requiredFixtureValue(clean).data.missions = [
  mockMission({ id: 'other-passenger', type: 'passenger', pax: 1 }),
];
game.accept(clean, rare.id);
assert.equal(
  requiredFixtureValue(clean).data.missions.length,
  1,
  'other passengers occupy seats too',
);
requiredFixtureValue(clean).data.missions = [];
game.accept(clean, rare.id);
assert.ok(requiredFixtureValue(clean).data.missions.some((mission) => mission.radioTour));
game.onMessage(clean, { t: 'abandon', id: rare.id });
assert.equal(occupiedPassengerSeats(requiredFixtureValue(clean).data.missions), 0);
assert.ok(
  !requiredFixtureValue(clean).data.radioStations!.includes('super-idol'),
  'abandoning gives no album',
);
console.log(
  'PASS five station names; faction/system discoveries; real scientist salvage/reward; rare five-stop three-passenger tour; no early/duplicate payout; saved unlocks',
);
