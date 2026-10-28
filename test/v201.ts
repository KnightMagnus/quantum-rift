import type { PlayerInput } from '../server/game.ts';
import { mockSavedDockWing } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.0.1 tests: NPC traders actually settle over a planet and land (they used to circle forever), and escorts keep
// formation on a moving leader with the new arrival steering.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game, type PlayerData } from '../server/game.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { makeLoadout, step, DT as simulationStepSeconds, wrap } from '../shared/rules.ts';
import assert from 'node:assert/strict';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v201-')));
const wingUp = (game: Game, playerData: PlayerData, hulls: (string | number)[]) => {
  playerData.docks[playerData.activeDock].wings = hulls.map((hull2: string | number) => {
    const ship = makeLoadout(assets, hull2, 'Wing');
    ship.uid = game.features.docks.shipUid(playerData);
    playerData.dock.push({ ship, bridge: {} });
    return mockSavedDockWing({ uid: ship.uid });
  });
}; // 2.1: wingmates are stored ships in your dock
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
const space = game.spaces.meridian;
// oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
for (const entity of [...space.ships.values()]) space.remove(entity);
const planets = systemsById.meridian.stellars.filter((player) =>
    requiredFixtureValue(player.svc).includes('L'),
  ),
  hulls = [704, 706, 712, 703, 713, 736].filter((hull3) => assets.ships[hull3]);
// Reproduce sideways cruise at the arrival speed ceiling, then run the actual
// NPC AI and physics through its existing landing event for planet and station.
for (const kind of ['planet', 'station']) {
  const port = Object.values(systemsById)
    .flatMap((session) => session.stellars)
    .find(
      (stellarBody) =>
        stellarBody.kind === kind && requiredFixtureValue(stellarBody.svc).includes('L'),
    );
  assert.ok(port, kind + ' destination exists');
  for (const hull of [703, 704, 736])
    for (const fraction of [0.94, 0.95, 1]) {
      const shipEntity = space.makeShip({
        hull,
        faction: 'spacer',
        x: port.x,
        y: port.y + 12000,
        a: Math.PI / 2,
        ai: 'trade',
      });
      shipEntity.vy = -shipEntity.st.maxSpeed * fraction;
      shipEntity.vx = 1;
      shipEntity.dest = port;
      shipEntity.life = 1e9;
      const beforeFuel = shipEntity.fuel;
      for (
        let tickIndex = 0;
        tickIndex < Math.ceil((Math.PI / shipEntity.st.turn + 1) / simulationStepSeconds);
        tickIndex++
      ) {
        space.ai(shipEntity);
        step(shipEntity, shipEntity.st, shipEntity.inp);
      }
      assert.ok(
        Math.abs(wrap(shipEntity.a - Math.atan2(port.x - shipEntity.x, -(port.y - shipEntity.y)))) <
          0.08,
        kind + ' hull ' + hull + ' faces destination instead of perpendicular at cruise',
      );
      let event = false;
      for (
        let tickIndex2 = 0;
        tickIndex2 < 300 / simulationStepSeconds && space.ships.has(shipEntity.id);
        tickIndex2++
      ) {
        space.ai(shipEntity);
        if (!space.ships.has(shipEntity.id)) {
          event = space.events.some((value) => value[0] === 'land' && value[1] === shipEntity.id);
          break;
        }
        step(shipEntity, shipEntity.st, shipEntity.inp);
      }
      assert.ok(event, kind + ' hull ' + hull + ' settles and emits landing event');
      assert.ok(
        Math.hypot(shipEntity.x - port.x, shipEntity.y - port.y) < Math.max(40, port.r * 0.5),
      );
      assert.ok(Math.hypot(shipEntity.vx, shipEntity.vy) < 45);
      assert.equal(shipEntity.fuel, beforeFuel, 'NPC approach does not use afterburner fuel');
    }
}
// At maximum speed the ordinary landing engine remains visibly on until a turn is needed.
for (const hull of [704, 706, 712]) {
  const trader = space.makeShip({ hull, faction: 'spacer', x: 0, y: 20000, a: 0, ai: 'trade' });
  trader.vy = -trader.st.maxSpeed;
  trader.dest = { x: 0, y: 0, r: 70 } as typeof trader.dest;
  space.ai(trader);
  assert.equal(trader.inp.thrust, 1, 'NPC landing cruise keeps thrust at its speed cap');
  assert.ok(!trader.inp.ab, 'NPC landing cruise never forces afterburner');
  space.remove(trader);
}
console.log('Planet/station NPC cruise alignment and actual landing events passed (18 cases).');
let landed = 0,
  worst = 0;
for (let index = 0; index < 24; index++) {
  const stellarBody = planets[index % planets.length],
    angle = Math.random() * 6.283,
    distance = 1500 + Math.random() * 1000;
  const shipEntity = space.makeShip({
    hull: hulls[index % hulls.length],
    faction: 'spacer',
    x: stellarBody.x + Math.cos(angle) * distance,
    y: stellarBody.y + Math.sin(angle) * distance,
    a: Math.random() * 6.28,
    vx: (Math.random() - 0.5) * 200,
    vy: (Math.random() - 0.5) * 200,
    ai: 'trade',
  });
  shipEntity.dest = stellarBody;
  shipEntity.life = 1e9;
  let tickIndex3 = 0;
  while (space.ships.has(shipEntity.id) && tickIndex3 < 90 * 30) {
    space.tick();
    tickIndex3++;
  }
  if (!space.ships.has(shipEntity.id)) {
    landed++;
    worst = Math.max(worst, tickIndex3 / 30);
  } else space.remove(shipEntity);
}
assertCondition(
  landed >= 23,
  `traders settle over the pad and land (${landed}/24, slowest ${worst.toFixed(0)} s)`,
);
// escorts on a moving leader
const legacySocket2 = legacySocket();
legacySocket2.open = true;
legacySocket2.backlog = 0;
legacySocket2.send = () => {};
legacySocket2.close = () => {};
game.connect(legacySocket2, '15.0.0.1');
const session = requiredFixtureValue([...game.sessions.values()].pop());
legacySocket2.emit('message', JSON.stringify({ t: 'hello', name: 'Leader', pass: 'secret' }));
const playerData = requiredFixtureValue(session).data;
playerData.ship.hull = 736;
wingUp(game, playerData, [751, 751]);
playerData.sys = 'halcyon';
playerData.stellar = null;
game.spawnPlayer(session, 0, 0, 0, 0);
const message = game.spaces.halcyon,
  entity = requiredFixtureValue(session).ent,
  entitys = [...message.ships.values()].filter(
    (shipEntity) => shipEntity.owner === requiredFixtureValue(entity).id,
  );
for (let index = 0; index < 300; index++) {
  requiredFixtureValue(session).inputs.push({
    seq: index,
    thrust: 1,
    turn: index % 120 < 30 ? 1 : 0,
  } as PlayerInput);
  message.tick();
}
const dists = entitys.map((shipEntity) =>
  Math.hypot(
    shipEntity.x - requiredFixtureValue(entity).x,
    shipEntity.y - requiredFixtureValue(entity).y,
  ),
);
assertCondition(
  entitys.length === 2 && dists.every((value) => value < 600),
  `escorts keep up with a manoeuvring leader (max ${Math.round(Math.max(...dists))} units behind)`,
);
// Landing traffic keeps its nose within ~57 degrees of the port while it closes from far
// out, instead of turning sideways and coasting in on a small velocity error.
{
  const portalSpace = game.spaces.meridian;
  for (const entity of portalSpace.ships.values()) portalSpace.remove(entity);
  let samples = 0,
    sideways = 0;
  for (let index = 0; index < 16; index++) {
    const stellarBody = planets[index % planets.length],
      angle = (index / 16) * 6.283,
      distance = 2600;
    const trader = portalSpace.makeShip({
      hull: hulls[index % hulls.length],
      faction: 'spacer',
      x: stellarBody.x + Math.cos(angle) * distance,
      y: stellarBody.y + Math.sin(angle) * distance,
      a: angle + 1.4,
      vx: Math.cos(angle + 1.4) * 120,
      vy: Math.sin(angle + 1.4) * 120,
      ai: 'trade',
    });
    trader.dest = stellarBody;
    trader.life = 1e9;
    for (let tick = 0; tick < 90 * 30 && portalSpace.ships.has(trader.id); tick++) {
      portalSpace.ai(trader);
      if (!portalSpace.ships.has(trader.id)) break;
      step(trader, trader.st, trader.inp);
      const deltaX = stellarBody.x - trader.x,
        deltaY = stellarBody.y - trader.y,
        range = Math.hypot(deltaX, deltaY),
        closing = (trader.vx * deltaX + trader.vy * deltaY) / range,
        offset = Math.abs(wrap(Math.atan2(deltaX, -deltaY) - trader.a));
      // Ignore the first second of turning in and the committed retrograde brake.
      if (tick < 30 || range < 300 || closing < 40 || offset > 2.2) continue;
      samples++;
      if (offset > 1.05 && !trader.inp.thrust) sideways++;
    }
    portalSpace.remove(trader);
  }
  assertCondition(
    samples > 500 && sideways / samples < 0.03,
    `landing approach rarely coasts side-on (${sideways}/${samples} samples)`,
  );
  // An NPC convoy wing matches its leader's heading without shimmying every tick.
  const leader = portalSpace.makeShip({ hull: 704, faction: 'spacer', x: 0, y: 4000, ai: 'trade' });
  leader.dest = { x: 0, y: -8000, out: true } as typeof leader.dest;
  leader.life = 1e9;
  const wing = portalSpace.makeShip({
    hull: 704,
    faction: 'spacer',
    x: 60,
    y: 4050,
    ai: 'escort',
    owner: leader.id,
  });
  wing.tradeMate = true;
  wing.life = 1e9;
  let previousTurn = 0,
    reversals = 0;
  for (let tick = 0; tick < 20 * 30; tick++) {
    portalSpace.ai(leader);
    portalSpace.ai(wing);
    step(leader, leader.st, leader.inp);
    step(wing, wing.st, wing.inp);
    const turn = wing.inp.turn || 0;
    if (turn && previousTurn && turn !== previousTurn) reversals++;
    if (turn) previousTurn = turn;
  }
  assertCondition(reversals < 20, `convoy wing holds formation without shimmying (${reversals})`);
  // When the leader lands, its wing follows it to the same port.
  const port = planets[0];
  leader.x = port.x;
  leader.y = port.y;
  leader.vx = leader.vy = 0;
  leader.dest = port;
  portalSpace.ai(leader);
  assert.ok(!portalSpace.ships.has(leader.id), 'convoy leader lands');
  assert.equal(wing.dest, port, 'convoy wing inherits the leader’s port');
  portalSpace.remove(wing);
}
console.log('ALL 2.0.1 TESTS PASSED');
process.exit(0);
