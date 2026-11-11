// Unsworn hull catalog: registration, artwork, traffic pools and Commonhold exclusion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { milkyWayTraffic } from '../shared/part-two-ships.ts';
import { augmentAssets, type GameAssets } from '../shared/rules.ts';
import { COMMON_HULLS, FACTION_HULLS, STELLARS, SYS, TRAFFIC } from '../shared/galaxy.ts';
import { SPRITES } from '../shared/sprites26.ts';
import { makeLoadout } from '../shared/rules.ts';
import { refineryGame, refineryPilot, type FixtureSession } from './helpers/refinery-fixture.ts';
import {
  UNSWORN_PASSAGE_OPTION,
  UNSWORN_PASSAGE_REWARD,
  isUnswornPassage,
  unswornPassageDestination,
} from '../server/unsworn-passage.ts';
import {
  UNSWORN_COMMAND_ID,
  UNSWORN_HULLS,
  UNSWORN_IDS,
  UNSWORN_SOLD_IDS,
} from '../shared/ships-unsworn.ts';

const assets = augmentAssets(
  JSON.parse(
    fs.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  ) as GameAssets,
);

assert.deepEqual(UNSWORN_IDS, [1050, 1051, 1052, 1053, 1054, 1055]);
assert.deepEqual(UNSWORN_SOLD_IDS, [1050, 1051, 1052, 1053, 1054]);
assert.equal(UNSWORN_COMMAND_ID, 1055);

for (const hull of UNSWORN_HULLS) {
  const registered = assets.ships[hull.id];
  assert.ok(registered, `hull ${hull.id} is registered`);
  assert.equal(registered.name, hull.name, `hull ${hull.id} is not shadowed by an older asset`);
  assert.equal(registered.faction, 'unsworn');
  assert.equal(registered.fastJump, true);
  assert.ok(registered.shield > 0 && registered.armor > 0 && registered.speed > 0);
  for (const suffix of ['', '_glow', '_yard'])
    assert.ok(
      fs.existsSync(new URL(`../client/assets/ships/${hull.id}${suffix}.webp`, import.meta.url)),
      `ships/${hull.id}${suffix}.webp exists`,
    );
  assert.equal(registered.img, `ships/${hull.id}_yard.webp`);
  const sprite = SPRITES[hull.id];
  assert.ok(sprite, `sprite sheet ${hull.id} is registered`);
  assert.equal(sprite.cols, 12);
  assert.ok(sprite.banks && sprite.glow && sprite.packed);
  for (const [weaponId] of hull.weapons) assert.ok(assets.weapons[weaponId], `weapon ${weaponId}`);
}

// Only the Shrike escort carries a gun.
const armed = UNSWORN_HULLS.filter((hull) => hull.weapons.length).map((hull) => hull.id);
assert.deepEqual(armed, [1052]);

// Unsworn traffic flies Unsworn hulls only; the escort pool is the Shrike.
assert.deepEqual(TRAFFIC.unsworn, { traders: [1050, 1051, 1053, 1054], war: [1052] });
assert.deepEqual(FACTION_HULLS.unsworn, UNSWORN_SOLD_IDS);
let unswornRolls = 0;
for (const faction of ['confederation', 'index'])
  for (let step = 0; step < 1000; step++) {
    const traffic = milkyWayTraffic(faction, step / 1000);
    if (traffic.faction !== 'unsworn') {
      for (const id of traffic.pool) assert.ok(!UNSWORN_IDS.includes(id), 'Unsworn hull leaked');
      continue;
    }
    unswornRolls++;
    assert.equal(traffic.kind, 'trade');
    assert.deepEqual(traffic.pool, [1050, 1051, 1053, 1054]);
  }
assert.ok(unswornRolls > 0, 'Confederation space produces Unsworn traffic');

// Commonhold is a stationary NPC location ship: never in a traffic pool, shipyard list or common catalog.
assert.ok(!COMMON_HULLS.includes(UNSWORN_COMMAND_ID));
assert.equal(assets.ships[UNSWORN_COMMAND_ID].npcOnly, true, 'Commonhold is NPC only');
for (const id of UNSWORN_SOLD_IDS)
  assert.ok(!assets.ships[id].npcOnly, `hull ${id} stays obtainable`);
for (const [faction, pools] of Object.entries(TRAFFIC))
  assert.ok(
    !pools.traders.includes(UNSWORN_COMMAND_ID) && !pools.war.includes(UNSWORN_COMMAND_ID),
    `Commonhold is absent from ${faction} traffic`,
  );
for (const [faction, hullIds] of Object.entries(FACTION_HULLS)) {
  assert.ok(!hullIds.includes(UNSWORN_COMMAND_ID), `Commonhold is absent from ${faction} hulls`);
  if (faction !== 'unsworn')
    for (const id of UNSWORN_IDS)
      assert.ok(!hullIds.includes(id), `${faction} does not build Unsworn hull ${id}`);
}

// No public shipyard sells Unsworn hulls: no system is Unsworn-owned.
assert.ok(!Object.values(SYS).some((system) => system.faction === 'unsworn'));

// Hailing ordinary Unsworn traffic offers a courier job; delivering it opens Unsworn hulls
// at Confederation shipyards for that captain only.
const game = refineryGame();
const captain = refineryPilot(game, 'Unsworn courier');
const bystander = refineryPilot(game, 'Other captain');
captain.data.ship = makeLoadout(game.A, 704, 'Courier');
captain.data.sys = 'mw-wolf-359';
captain.data.stellar = null;
captain.data.missions = [];
captain.data.credits = 1_000_000;
captain.data.station.site = undefined;
// The Unsworn fly in the Milky Way, which a captain reaches after the Rift crossing.
assert.equal(
  unswornPassageDestination('mw-wolf-359', captain.data),
  null,
  'hidden lanes give no job',
);
captain.data.story.flags = {
  ...captain.data.story.flags,
  main_ending: 'table',
  crossed_quantum_rift: true,
};
bystander.data.story.flags = { ...captain.data.story.flags };
game.spawnPlayer(captain, 0, 0, 0, 0);
const space = game.spaces[captain.data.sys];
const lastHail = (session: FixtureSession) =>
  [...session.sock.out].reverse().find((packet) => packet.t === 'hail') as unknown as
    | { text: string; opts: Array<{ k: string; label: string }> }
    | undefined;
const hailOptions = (shipId: number) => {
  captain.sock.out.length = 0;
  game.features.hail.hail(captain, { t: 'hail', id: shipId });
  return (lastHail(captain)?.opts || []).map((option) => option.k);
};
const choosePassage = (shipId: number) =>
  game.features.hail.hailOpt(captain, { t: 'hailopt', id: shipId, k: UNSWORN_PASSAGE_OPTION });
const passageJobs = () => captain.data.missions.filter((mission) => isUnswornPassage(mission));

const unswornTrader = space.makeShip({ hull: 1050, faction: 'unsworn', x: 200, y: 0, ai: 'trade' });
const unswornEscort = space.makeShip({
  hull: 1052,
  faction: 'unsworn',
  x: 220,
  y: 0,
  ai: 'escort',
});
unswornEscort.owner = unswornTrader.id;
const otherTrader = space.makeShip({
  hull: 1050,
  faction: 'confederation',
  x: 240,
  y: 0,
  ai: 'trade',
});
const namedUnsworn = space.makeShip({ hull: 1051, faction: 'unsworn', x: 260, y: 0, ai: 'trade' });
namedUnsworn.name = 'Named Unsworn captain';
const storyUnsworn = space.makeShip({ hull: 1053, faction: 'unsworn', x: 280, y: 0, ai: 'trade' });
storyUnsworn.story = captain.id;
const farUnsworn = space.makeShip({ hull: 1054, faction: 'unsworn', x: 9000, y: 0, ai: 'trade' });

assert.ok(
  hailOptions(unswornTrader.id).includes(UNSWORN_PASSAGE_OPTION),
  'Unsworn trader offers it',
);
assert.ok(hailOptions(unswornEscort.id).includes(UNSWORN_PASSAGE_OPTION), 'its escort offers it');
for (const [ship, reason] of [
  [otherTrader, 'non-Unsworn traffic'],
  [namedUnsworn, 'named ship'],
  [storyUnsworn, 'story ship'],
] as const) {
  assert.ok(!hailOptions(ship.id).includes(UNSWORN_PASSAGE_OPTION), `${reason} has no offer`);
  choosePassage(ship.id);
  assert.equal(passageJobs().length, 0, `forged option on ${reason} is ignored`);
}
choosePassage(farUnsworn.id);
assert.equal(passageJobs().length, 0, 'out of hail range');

const destination = unswornPassageDestination(captain.data.sys, captain.data)!;
assert.ok(destination, 'a Confederation shipyard is in reach');
assert.equal(SYS[destination.system].faction, 'confederation');
assert.notEqual(destination.system, captain.data.sys, 'delivery needs at least one jump');
assert.ok(destination.svc.includes('Y') && destination.svc.includes('L') && !destination.site);

// Before delivery no yard sells Unsworn hulls and a forged purchase is refused.
const yardSells = (portId: string, playerData = captain.data) =>
  game.yard(STELLARS[portId], playerData) || [];
assert.ok(!yardSells(destination.id).some((id) => UNSWORN_IDS.includes(id)));

// A full job list refuses the offer without adding a job.
const savedMissions = captain.data.missions;
captain.data.missions = Array.from({ length: 6 }, (_, index) => ({
  id: `fixture-${index}`,
  type: 'patrol',
  title: 'Fixture patrol',
  sys: captain.data.sys,
  reward: 0,
  text: '',
}));
choosePassage(unswornTrader.id);
assert.equal(passageJobs().length, 0, 'no seventh job');
assert.match(lastHail(captain)!.text, /six jobs/);
captain.data.missions = savedMissions;

const creditsBefore = captain.data.credits;
choosePassage(unswornEscort.id);
assert.equal(passageJobs().length, 1, 'accepting adds one job');
const [passage] = passageJobs();
assert.equal(passage.dest, destination.id);
assert.equal(passage.sys, destination.system);
assert.equal(passage.type, 'cargo');
assert.equal(passage.qty, 0, 'the papers take no hold space');
assert.equal(captain.data.credits, creditsBefore, 'accepting is free');
assert.match(lastHail(captain)!.text, new RegExp(destination.name));
choosePassage(unswornTrader.id);
assert.equal(passageJobs().length, 1, 'replayed option adds no second job');
assert.match(lastHail(captain)!.text, /already carry our papers/);

// Landing somewhere else does not deliver the papers.
const wrongPort = Object.values(STELLARS).find(
  (port) =>
    port.id !== destination.id &&
    SYS[port.system]?.faction === 'confederation' &&
    port.svc.includes('Y') &&
    !port.site,
)!;
game.completeOnLanding(captain, wrongPort);
assert.equal(passageJobs().length, 1, 'wrong port keeps the job');
assert.notEqual(captain.data.unswornYard, true);

// Delivery pays, removes the job and opens Confederation yards for this captain.
captain.data.sys = destination.system;
captain.data.stellar = destination.id;
captain.ent = null;
const creditsAtLanding = captain.data.credits;
game.completeOnLanding(captain, destination);
assert.equal(passageJobs().length, 0, 'job is paid and removed');
assert.equal(captain.data.unswornYard, true);
assert.equal(captain.data.credits, creditsAtLanding + UNSWORN_PASSAGE_REWARD);
game.completeOnLanding(captain, destination);
assert.equal(captain.data.credits, creditsAtLanding + UNSWORN_PASSAGE_REWARD, 'paid once');

for (const port of Object.values(STELLARS)) {
  if (port.site || !port.svc.includes('Y')) continue;
  const sold = yardSells(port.id);
  const confederation = SYS[port.system]?.faction === 'confederation';
  for (const id of UNSWORN_SOLD_IDS)
    assert.equal(
      sold.includes(id),
      confederation,
      `${port.id} ${confederation ? 'sells' : 'does not sell'} ${id}`,
    );
  assert.ok(!sold.includes(UNSWORN_COMMAND_ID), `${port.id} never sells Commonhold`);
}
assert.ok(
  !yardSells(destination.id, bystander.data).some((id) => UNSWORN_IDS.includes(id)),
  'another captain still needs the job',
);

// The unlocked captain can buy one; the Unsworn stop offering the job.
game.buyShip(captain, 1051);
assert.equal(captain.data.ship.hull, 1051, 'Hush bought at a Confederation yard');
bystander.data.stellar = destination.id;
bystander.ent = null;
const bystanderHull = bystander.data.ship.hull;
game.buyShip(bystander, 1051);
assert.equal(bystander.data.ship.hull, bystanderHull, 'forged purchase without the job is refused');
captain.data.sys = 'mw-wolf-359';
captain.data.stellar = null;
game.spawnPlayer(captain, 0, 0, 0, 0);
const returning = game.spaces[captain.data.sys].makeShip({
  hull: 1053,
  faction: 'unsworn',
  x: 200,
  y: 0,
  ai: 'trade',
});
assert.ok(!hailOptions(returning.id).includes(UNSWORN_PASSAGE_OPTION), 'no offer after unlock');
choosePassage(returning.id);
assert.equal(passageJobs().length, 0, 'no repeat job after unlock');

console.log(
  `Unsworn hulls: 6 registered with sheets, ${unswornRolls} Unsworn traffic rolls, Commonhold excluded, passage job opens Confederation yards`,
);
