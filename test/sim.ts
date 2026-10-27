import type { StellarBody } from '../shared/galaxy.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import type { LegacyPacket } from './helpers/legacy-fixture.ts';
import type { ClientGameState } from '../client/main.ts';
import { mockMission } from './helpers/mocks.ts';
type SimulationPacket = LegacyPacket & NonNullable<ClientGameState['landed']>;
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// In-process server test: station progression, wingmates, fighter bays, pirates, bounties, death and respawn.
import filesystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
const assets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const directory = tempDataDir('rift-sim-');
const game = new Game(assets, new Database(directory));
const sleep = (milliseconds: number | undefined) =>
  new Promise((result) => setTimeout(result, milliseconds));
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
function fake(name: string) {
  const sock = legacySocket();
  sock.open = true;
  sock.backlog = 0;
  sock.out = [];
  sock.send = (message: string) =>
    sock.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  sock.close = () => {};
  game.connect(sock);
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock,
    s: session,
    send: (message: object) => sock.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      requiredFixtureValue(
        [...sock.out].reverse().find((message) => message.t === messageType),
      ) as SimulationPacket,
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
(async () => {
  const firstEntry = fake('SimCaptain'),
    secondEntry = fake('Rival');
  assertCondition(
    secondEntry.last('landed').community &&
      secondEntry.last('landed').community!.online.length === 2,
    'the hub shows the community board',
  );
  assertCondition(
    requiredFixtureValue(firstEntry.s).data && firstEntry.last('landed'),
    'logged in and landed',
  );
  const playerData = requiredFixtureValue(firstEntry.s).data;
  // ---- station all the way to Ops 5
  playerData.credits = 5e7;
  for (const message of ['alloy', 'crystal', 'isotope']) playerData.mats[message] = [9, 9, 9, 9, 9];
  firstEntry.send({ t: 'station', op: 'claim' });
  assertCondition(!playerData.station.claimed, 'the hub itself cannot be claimed');
  playerData.sys = 'meridian';
  playerData.stellar = 'site-meridian';
  game.landed(firstEntry.s);
  assertCondition(
    firstEntry.last('landed').site && firstEntry.last('landed').site!.owner === null,
    'landed at an unclaimed derelict hull',
  );
  firstEntry.send({ t: 'station', op: 'claim' });
  assertCondition(
    playerData.station.site === 'site-meridian' &&
      game.db.world.sites['site-meridian'] === 'simcaptain',
    'claimed the hull',
  );
  for (let index = 0; index < 5; index++) firstEntry.send({ t: 'station', op: 'upgrade' });
  assertCondition(playerData.station.ops === 5, 'station built to Ops 5');
  const yard = requiredFixtureValue(firstEntry.last('landed').yard);
  assertCondition(
    yard.includes(785) && yard.includes(736),
    'Exotics and the Concordance are on sale at Ops 5',
  );
  firstEntry.send({ t: 'station', op: 'research', id: 'shield1' });
  assertCondition(
    playerData.station.active && playerData.station.active.id === 'shield1',
    'research started',
  );
  requiredFixtureValue(playerData.station.active).ends = Date.now() - 1;
  game.checkStation(playerData);
  assertCondition(playerData.station.done.includes('shield1'), 'research completes on time');
  playerData.station.refT -= 60 * 60000;
  game.checkStation(playerData);
  assertCondition(playerData.station.refUnits === 3, 'refinery filled its silos while away');
  firstEntry.send({ t: 'station', op: 'collect' });
  assertCondition(playerData.station.refUnits === 0, 'collected refinery output');
  // ---- 2.6: refits are retired
  firstEntry.send({ t: 'buyship', hull: 708 });
  assertCondition(playerData.ship.hull === 708, 'bought a Cutlass');
  firstEntry.send({ t: 'station', op: 'refit' });
  assertCondition(playerData.ship.hull === 708, 'refits are retired: the Cutlass stays a Cutlass');
  // ---- wingmates
  firstEntry.send({ t: 'buyship', hull: 753, store: true });
  firstEntry.send({ t: 'buyship', hull: 754, store: true }); // 2.1: wingmates are ships in a dock
  for (const [secondaryIndex, entry] of playerData.dock
    .filter((entry2) => [753, 754].includes(Number(entry2.ship.hull)))
    .entries())
    firstEntry.send({
      t: 'docks',
      op: 'assign',
      k: playerData.activeDock,
      slot: secondaryIndex,
      uid: entry.ship.uid,
    });
  assertCondition(
    game.features.docks.activeWings(playerData).length === 2,
    'bought Ines Varro and Old Mags Pell into the hangar and assigned them as wingmates',
  );
  firstEntry.send({ t: 'depart' });
  await sleep(300);
  const space = game.spaces[playerData.sys],
    playerEntity = requiredFixtureValue(firstEntry.s).ent;
  const escort = [...space.ships.values()].filter(
    (entity) => entity.owner === requiredFixtureValue(playerEntity).id,
  );
  assertCondition(
    escort.length === 2 && escort.every((shipEntity) => shipEntity.ai === 'escort'),
    'wingmates launch with you',
  );
  // fly forward 3 s, escorts should keep up
  for (let index = 0; index < 90; index++) {
    firstEntry.send({ t: 'input', seq: index + 1, th: 1 });
    await sleep(33);
  }
  const farLayer = escort.map((shipEntity) =>
    Math.hypot(
      shipEntity.x - requiredFixtureValue(playerEntity).x,
      shipEntity.y - requiredFixtureValue(playerEntity).y,
    ),
  );
  assertCondition(
    farLayer.every((horizontalPosition3) => horizontalPosition3 < 600),
    `escorts keep formation (${farLayer.map((horizontalPosition4) => horizontalPosition4.toFixed(0)).join(', ')} px behind)`,
  );
  // ---- a pirate attacks: escorts engage it
  const pirate = space.makeShip({
    hull: 716,
    faction: 'hollow',
    x: requiredFixtureValue(playerEntity).x + 500,
    y: requiredFixtureValue(playerEntity).y,
    a: 0,
    ai: 'raid',
  });
  await sleep(2500);
  assertCondition(
    escort.some((shipEntity) => shipEntity.target === pirate) || pirate.dead,
    'wingmates engage a Hollow raider',
  );
  await sleep(8000);
  assertCondition(
    pirate.dead || pirate.armor < pirate.st.armor || pirate.shield < pirate.st.shield,
    `the raider takes damage (shield ${Math.round(pirate.shield)}, armor ${Math.round(pirate.armor)})`,
  );
  // ---- fighter bay: a Hive Tender launches Mite drones at a target
  const hive = space.makeShip({
    hull: 715,
    faction: 'quantum',
    x: requiredFixtureValue(playerEntity).x - 800,
    y: requiredFixtureValue(playerEntity).y,
    ai: 'patrol',
  });
  const enemyEntity = space.makeShip({
    hull: 708,
    faction: 'hollow',
    x: requiredFixtureValue(playerEntity).x - 1100,
    y: requiredFixtureValue(playerEntity).y + 200,
    ai: 'raid',
  });
  await sleep(4000);
  assertCondition(
    [...space.ships.values()].some((shipEntity) => shipEntity.fighterOf === hive.id) ||
      enemyEntity.dead,
    'Hive Tender launches Mite drones',
  );
  // ---- bounty: accept, the target spawns in the target system, killing it completes the job and pays on landing
  const credits = playerData.credits;
  playerData.missions.push(
    mockMission({
      id: 'test-bounty',
      type: 'bounty',
      title: 'Bounty: test',
      sys: playerData.sys,
      hull: 708,
      faction: 'hollow',
      targetName: 'Hollow captain Test',
      reward: 9999,
      owner: requiredFixtureValue(firstEntry.s).id,
    }),
  );
  requiredFixtureValue(firstEntry.s).ent && (playerData.missions[0].spawned = true);
  const target = space.spawnMissionTarget({
    ...playerData.missions[playerData.missions.length - 1],
    owner: requiredFixtureValue(firstEntry.s).id,
  });
  space.damage(
    requiredFixtureValue(target),
    1e6,
    1e6,
    requiredFixtureValue(requiredFixtureValue(firstEntry.s).ent),
  );
  assertCondition(
    requiredFixtureValue(playerData.missions.find((mission) => mission.id === 'test-bounty')).done,
    'killing the bounty target completes the job',
  );
  // ---- death and respawn
  space.damage(requiredFixtureValue(requiredFixtureValue(firstEntry.s).ent), 1e7, 1e7, null);
  await sleep(200);
  assertCondition(
    !requiredFixtureValue(firstEntry.s).ent && playerData.stellar && firstEntry.last('dead'),
    'player death: rebuilt at the last landing point',
  );
  assertCondition(
    game.features.docks.activeWings(playerData).length === 2 &&
      ![...space.ships.values()].some(
        (shipEntity) => shipEntity.wingOf === requiredFixtureValue(firstEntry.s).id,
      ),
    'wingmates fly home with the insurers, not lost',
  );
  game.completeOnLanding(firstEntry.s, {
    id: playerData.stellar,
    system: playerData.sys,
  } as StellarBody);
  assertCondition(
    playerData.credits > credits - 1e6 &&
      !playerData.missions.some((mission) => mission.id === 'test-bounty'),
    'bounty paid on landing',
  );
  // ---- persistence
  game.db.touch();
  game.db.flush();
  const saved = JSON.parse(filesystem.readFileSync(directory + '/players.json', 'utf8'));
  requiredFixtureValue(secondEntry.s).data.sys = 'meridian';
  requiredFixtureValue(secondEntry.s).data.stellar = 'site-meridian';
  game.landed(secondEntry.s);
  assertCondition(
    secondEntry.last('landed').site!.owner === 'SimCaptain' &&
      secondEntry.last('landed').market &&
      !secondEntry.last('landed').yard,
    'other captains can trade at your station but not use its shipyard',
  );
  secondEntry.send({ t: 'station', op: 'claim' });
  assertCondition(
    !requiredFixtureValue(secondEntry.s).data.station.claimed,
    'a claimed hull cannot be taken',
  );
  const sites = [...secondEntry.sock.out].reverse().find((message) => message.t === 'sites') as
    | (LegacyPacket & { sites: Record<string, { ops: number }> })
    | undefined;
  assertCondition(
    sites && sites.sites['site-meridian'].ops === 5,
    'everyone is told about the station and its Ops level',
  );
  assertCondition(
    saved.simcaptain &&
      saved.simcaptain.station.ops === 5 &&
      saved.simcaptain.salt &&
      !saved.simcaptain.pass,
    'progress is saved, password stored only as a hash',
  );
  console.log('ALL SIM TESTS PASSED');
  process.exit(0);
})().catch((entity) => {
  console.error(entity);
  process.exit(1);
});
