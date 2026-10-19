import assert from 'node:assert/strict';
import { refineryGame, refineryPilot, seed, lots } from './helpers/refinery-fixture.js';
import { RADIO_STATIONS } from '../shared/radio-stations.js';
import { SYS, STELLARS } from '../shared/galaxy.js';
import { radioTourOffer, TOUR_ODDS, discoverRadio } from '../server/radio-discovery.js';
import { occupiedPassengerSeats } from '../shared/passengers.js';
import { DB } from '../server/db.js';
import { advanceRadioTour } from '../server/radio-discovery.js';
import { makeLoadout } from '../shared/rules.js';
function fixtureGame(dir) {
  const interval = globalThis.setInterval,
    timeout = globalThis.setTimeout;
  try {
    globalThis.setInterval = globalThis.setTimeout = () => ({ unref() {} });
    return dir ? refineryGame(new DB(dir)) : refineryGame();
  } finally {
    globalThis.setInterval = interval;
    globalThis.setTimeout = timeout;
  }
}
let game = fixtureGame(),
  pilot = refineryPilot(game, 'Radio Explorer'),
  d = pilot.data;
assert.deepEqual(
  RADIO_STATIONS.map((s) => s.name),
  [
    'Wave Function Collapse',
    "QVRI Que'vari Radio",
    'Interdimensional Radio',
    'Signal Superposition Radio',
    'Super-Idol Radio',
  ],
);
assert.deepEqual(d.radioStations, ['wave-function-collapse']);
assert.equal(RADIO_STATIONS[4].playback, 'album');
for (const station of RADIO_STATIONS)
  assert.equal(station.tracks.length, 0, 'owner audio is still pending');
const notifications = () =>
  pilot.sock.out.filter((m) => m.t === 'toast' && m.msg.includes('Discovered a new radio station'));
for (const system of Object.values(SYS).filter((s) => s.faction === 'quevari')) {
  d.sys = system.id;
  discoverRadio(game, pilot);
}
assert.equal(notifications().length, 1, 'any Quevari system, one discovery only');
assert.match(notifications()[0].msg, /QVRI Que'vari Radio/);
d.sys = 'free-harbor';
discoverRadio(game, pilot);
assert.ok(
  !d.radioStations.includes('signal-superposition'),
  'retired locations no longer award it',
);
d.sys = 'lost-signal';
discoverRadio(game, pilot);
discoverRadio(game, pilot);
assert.equal(notifications().length, 2);
assert.ok(!d.radioStations.includes('interdimensional') && !d.radioStations.includes('super-idol'));
// A real accepted story, real spawned salvage loot and the ordinary completion boundary.
d.sys = 'ninefold';
d.stellar = 'ninefold-prime';
d.ship = makeLoadout(game.A, 704, 'Radio QA');
d.cargo = {};
d.cargoLots = { version: 1, byCommodity: {} };
d.missions = [];
const story = game.offers(STELLARS['ninefold-prime'], d).find((o) => o.side === 'sideways-apology');
assert.ok(story);
assert.match(story.rewardText, /Interdimensional Radio/);
seed(d, { food: lots(game.features.shipStats.stats(d).cargo) });
game.accept(pilot, story.id);
assert.ok(!d.quests.active['s:sideways-apology'], 'full hold cannot start the repair job');
seed(d, {});
game.accept(pilot, story.id);
const q = d.quests.active['s:sideways-apology'];
assert.ok(q);
assert.equal(q.steps.length, 3);
game.accept(pilot, story.id);
assert.equal(
  d.missions.filter((m) => m.quest?.qid === q.qid).length,
  1,
  'duplicate accept cannot add another repair job',
);
for (let step = 0; step < 2; step++) {
  const m = d.missions.find((m) => m.quest?.qid === q.qid);
  assert.equal(m.type, 'salvage');
  assert.ok(!d.radioStations.includes('interdimensional'));
  d.sys = m.sys;
  d.stellar = SYS[m.sys].stellars.find((p) => p.svc.includes('L')).id;
  const landing = STELLARS[d.stellar];
  game.onMessage(pilot, { t: 'depart' });
  const space = game.spaces[d.sys];
  pilot.ent.x = m.point[0] + 100;
  pilot.ent.y = m.point[1];
  game.features.quests.questSalvageIdle(pilot);
  const loot = space.loot.find((l) => l.it.salvage === m.id);
  assert.ok(loot);
  const stranger = refineryPilot(game, 'Radio Stranger');
  assert.equal(
    game.onLoot({ s: stranger }, loot.it),
    false,
    'another captain cannot take the materials',
  );
  assert.equal(game.onLoot({ s: pilot }, loot.it), true);
  assert.ok(m.done);
  Object.assign(pilot.ent, { x: landing.x, y: landing.y, vx: 0, vy: 0 });
  game.land(pilot, landing.id);
}
const final = d.missions.find((m) => m.quest?.qid === q.qid);
assert.equal(final.dest, 'ninefold-prime');
assert.equal(final.qty, 2);
game.completeOnLanding(pilot, STELLARS.earth);
assert.ok(!d.radioStations.includes('interdimensional'));
d.sys = 'ninefold';
d.stellar = 'ninefold-prime';
game.completeOnLanding(pilot, STELLARS['ninefold-prime']);
assert.ok(d.radioStations.includes('interdimensional'));
const credited = d.credits,
  count = notifications().length;
game.completeOnLanding(pilot, STELLARS['ninefold-prime']);
game.features.quests.questFinish(pilot, q);
assert.equal(d.credits, credited);
assert.equal(notifications().length, count);
assert.ok(!game.offers(STELLARS['ninefold-prime'], d).some((o) => o.side === 'sideways-apology'));
// Deterministic rare offer: board refresh does not redraw the chance or itinerary.
d.sys = 'meridian';
d.stellar = 'meridian-yards';
d.missions = [];
const port = STELLARS['meridian-yards'];
let offer;
for (let n = 0; n < 20000 && !offer; n++) {
  d.stats.jumps = n;
  offer = radioTourOffer(port, d);
}
assert.ok(offer);
assert.equal(TOUR_ODDS, 1000);
assert.deepEqual(radioTourOffer(port, d), offer);
assert.equal(offer.pax, 3);
assert.equal(new Set(offer.radioTour.stops.map((id) => STELLARS[id].system)).size, 5);
assert.equal(game.offers(port, d).find((o) => o.id === offer.id)?.type, 'passenger');
d.ship = makeLoadout(game.A, 703, 'Too small');
game.accept(pilot, offer.id);
assert.ok(!d.missions.some((m) => m.radioTour), 'insufficient passenger seats are refused');
d.ship = makeLoadout(game.A, 704, 'Tour bus');
game.accept(pilot, offer.id);
let tour = d.missions.find((m) => m.radioTour);
assert.ok(tour);
assert.equal(occupiedPassengerSeats(d.missions), 3);
assert.equal(radioTourOffer(port, d), null, 'one tour at a time');
const before = d.credits;
for (let n = 0; n < 5; n++) {
  if (n === 2) {
    // Stop the only save owner, then authenticate against a newly loaded database.
    game.db.touch();
    game.db.flush();
    const oldInterval = globalThis.setInterval,
      oldTimeout = globalThis.setTimeout;
    try {
      globalThis.setInterval = globalThis.setTimeout = () => ({ unref() {} });
      game = refineryGame(new DB(game.db.dir));
    } finally {
      globalThis.setInterval = oldInterval;
      globalThis.setTimeout = oldTimeout;
    }
    pilot = refineryPilot(game, 'Radio Explorer');
    d = pilot.data;
    tour = d.missions.find((m) => m.radioTour);
    assert.equal(tour.radioTour.stop, 2, 'two completed shows survive an actual save reload');
    assert.equal(occupiedPassengerSeats(d.missions), 3);
    assert.equal(d.credits, before);
    assert.ok(d.radioStations.includes('interdimensional'));
    assert.deepEqual(refineryPilot(game, 'Radio Stranger').data.radioStations, [
      'wave-function-collapse',
    ]);
  }
  const target = STELLARS[tour.dest];
  game.completeOnLanding(pilot, port);
  assert.equal(tour.radioTour.stop, n);
  assert.equal(d.credits, before);
  d.sys = target.system;
  d.stellar = target.id;
  game.completeOnLanding(pilot, target);
  if (n < 4) {
    assert.equal(d.credits, before);
    assert.equal(d.missions.length, 1);
    assert.equal(occupiedPassengerSeats(d.missions), 3);
    assert.ok(!d.radioStations.includes('super-idol'));
  }
}
assert.equal(d.credits, before + 60000);
assert.equal(occupiedPassengerSeats(d.missions), 0);
assert.ok(d.radioStations.includes('super-idol'));
assert.equal(radioTourOffer(port, d), null);
game.completeOnLanding(pilot, STELLARS[tour.dest]);
assert.equal(d.credits, before + 60000);
game.db.touch();
game.db.flush();
const restored = fixtureGame(game.db.dir).db.get('Radio Explorer');
assert.deepEqual(restored.radioStations, d.radioStations);
assert.ok(restored.quests.sides['sideways-apology']);
// Untrusted/corrupt itineraries cannot skip the reward boundary.
for (const change of [
  { stops: tour.radioTour.stops.slice(0, 4), stop: 4 },
  { stops: Array(5).fill(tour.radioTour.stops[0]), stop: 4 },
  { stops: [...tour.radioTour.stops.slice(0, 4), 'missing-port'], stop: 4 },
  { stops: tour.radioTour.stops, stop: -1 },
  { stops: tour.radioTour.stops, stop: 5 },
]) {
  const bad = { ...tour, paid: false, radioTour: change };
  assert.equal(advanceRadioTour(game, pilot, bad, STELLARS[tour.dest]), true);
  assert.equal(d.credits, before + 60000);
}
const clean = refineryPilot(game, 'Radio Abandon');
clean.data.sys = port.system;
clean.data.stellar = port.id;
let rare;
for (let jumps = 0; jumps < 20000 && !rare; jumps++) {
  clean.data.stats.jumps = jumps;
  rare = radioTourOffer(port, clean.data);
}
assert.ok(rare);
clean.data.missions = Array.from({ length: 6 }, (_, i) => ({ id: 'full-' + i, type: 'cargo' }));
game.accept(clean, rare.id);
assert.equal(clean.data.missions.length, 6, 'tour obeys the normal six-job limit');
clean.data.missions = [{ id: 'other-passenger', type: 'passenger', pax: 1 }];
game.accept(clean, rare.id);
assert.equal(clean.data.missions.length, 1, 'other passengers occupy seats too');
clean.data.missions = [];
game.accept(clean, rare.id);
assert.ok(clean.data.missions.some((m) => m.radioTour));
game.onMessage(clean, { t: 'abandon', id: rare.id });
assert.equal(occupiedPassengerSeats(clean.data.missions), 0);
assert.ok(!clean.data.radioStations.includes('super-idol'), 'abandoning gives no album');
console.log(
  'PASS five station names; faction/system discoveries; real scientist salvage/reward; rare five-stop three-passenger tour; no early/duplicate payout; saved unlocks',
);
