import { mockSavedDockWing, mockMission, mockPlayerData } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.0.3 tests: newcomer protection in inner space, calmer raider spawns, and gameplay edge cases.
import filesystem from 'node:fs';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS, SYSTEMS, TRAFFIC } from '../shared/galaxy.ts';

const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
process.env.SEEDS_FILE = '/nonexistent';
const game = new Game(assets, new Database(tempDataDir('rift-v203-')));
Object.assign(game.features.fronts, { event: () => null });
game.features.fronts.anomalies = () => ({}); // 2.6: traffic counts must not depend on the weekday's event (Bounty Week brings 50% more raiders)
let ipSequence = 1;
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  const output: LegacyPacket[] = [];
  legacySocket2.send = (message: string) =>
    output.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '9.9.9.' + ipSequence++);
  const send = (message: Record<string, unknown>) =>
    legacySocket2.emit('message', JSON.stringify(message));
  send({ t: 'hello', name, pass: 'secret' });
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  return {
    s: session,
    d: requiredFixtureValue(session).data,
    out: output,
    send,
    toasts: () => output.filter((message) => message.t === 'toast').map((message) => message.msg),
  };
}
function arrive(captainFixture: ReturnType<typeof fake>, systemId: string) {
  // jump a captain into a system the normal way
  const { s: session, d: playerData } = captainFixture;
  if (session.ent) {
    const space = game.spaces[playerData.sys];
    game.dropEscorts(space, session.ent);
    space.remove(session.ent);
    space.players--;
    session.ent = null;
  }
  const from = systemsById[systemId].links[0];
  playerData.sys = from;
  playerData.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
  const entity = session.ent;
  requiredFixtureValue<FixtureEntity>(entity).fuel = 1000;
  requiredFixtureValue<FixtureEntity>(entity).jumpTo = systemId;
  requiredFixtureValue<FixtureEntity>(entity).jumpCost = 0;
  game.finishJump(requiredFixtureValue<FixtureEntity>(entity), game.spaces[from]);
  return requiredFixtureValue<FixtureEntity>(session.ent);
}
function survive(captainFixture: ReturnType<typeof fake>, systemId: string, secs = 20) {
  const message = game.spaces[systemId];
  const _event2 = <Value>(session: Value) => session;
  for (
    let tickIndex = 0;
    tickIndex < 30 * secs && requiredFixtureValue(captainFixture.s).ent;
    tickIndex++
  )
    message.tick();
  return requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture.s).ent);
}

// ---- newcomer protection
const captainFixture = fake('Fresh One');
assertCondition(
  captainFixture.toasts().some((toastText: string) => toastText.includes('Newcomer protection')),
  'new captains are told about newcomer protection',
);
assertCondition(
  requiredFixtureValue(captainFixture.out.filter((message) => message.t === 'you').pop()).d
    .newcomer === true,
  'and the HUD knows they are protected',
);
let lost = 0;
for (let index = 0; index < 8; index++) {
  arrive(captainFixture, 'farmouth');
  if (!survive(captainFixture, 'farmouth')) lost++;
}
assertCondition(
  lost === 0,
  `a fresh Gnat survives eight arrivals in Far Mouth, where 2.0.2 lost 11 of 12 (${lost} lost)`,
);
const message = game.spaces.farmouth,
  shipEntity = arrive(captainFixture, 'farmouth');
const shipEntity2 = message.makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: requiredFixtureValue(shipEntity).x + 300,
  y: requiredFixtureValue(shipEntity).y,
  a: 0,
  ai: 'raid',
});
assertCondition(
  message.spared(shipEntity2, requiredFixtureValue(shipEntity)),
  'a pirate next to a newly arrived captain leaves them alone',
);
requiredFixtureValue(shipEntity).graceT = 0;
assertCondition(
  message.spared(shipEntity2, requiredFixtureValue(shipEntity)) &&
    message.findTarget(shipEntity2, 2200) !== shipEntity,
  'protected captains are never picked as targets in inner space',
);
shipEntity2.aggro.add(requiredFixtureValue(shipEntity).id);
assertCondition(
  !message.spared(shipEntity2, requiredFixtureValue(shipEntity)),
  'shooting first ends the truce for that fight',
);
message.remove(shipEntity2);
const shipEntity3 = message.makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: requiredFixtureValue(shipEntity).x + 300,
  y: requiredFixtureValue(shipEntity).y,
  a: 0,
  ai: 'raid',
  mission: { id: 'x', owner: requiredFixtureValue(captainFixture.s).id },
});
assertCondition(
  !message.spared(shipEntity3, requiredFixtureValue(shipEntity)),
  "a job's own target still fights",
);
message.remove(shipEntity3);
const lawless = requiredFixtureValue(
  SYSTEMS.find((starSystem) => starSystem.danger >= 3 && starSystem.faction === 'frontier'),
).id;
const shipEntity4 = arrive(captainFixture, lawless);
requiredFixtureValue(shipEntity4).graceT = 0;
const shipEntity5 = game.spaces[lawless].makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: requiredFixtureValue(shipEntity4).x + 300,
  y: requiredFixtureValue(shipEntity4).y,
  a: 0,
  ai: 'raid',
});
assertCondition(
  game.spaces[lawless].spared(shipEntity5, requiredFixtureValue(shipEntity4)),
  'main-map lawless space now has newcomer targeting truce',
);
assertCondition(
  !captainFixture.toasts().some((toastText2: string) => toastText2.includes('does not reach')),
  'main-map lawless entry no longer gives an inaccurate protection warning',
);
const shipEntity6 = game.spaces[lawless].makeShip({
  hull: TRAFFIC.hollow.war[0],
  faction: 'hollow',
  x: requiredFixtureValue(shipEntity4).x + 300,
  y: requiredFixtureValue(shipEntity4).y,
  a: 0,
  ai: 'raid',
});
requiredFixtureValue(shipEntity4).graceT = game.spaces[lawless].t + 6;
assertCondition(
  game.spaces[lawless].spared(shipEntity6, requiredFixtureValue(shipEntity4)),
  'everyone gets a few seconds of grace after a jump, even in lawless space',
);
captainFixture.d.station.ops = 3;
requiredFixtureValue(shipEntity).graceT = 0;
assertCondition(!game.newcomer(captainFixture.d), 'protection ends at Ops 3');
// calmer inner space: no destroyers and no pile-up of raiders
const message2 = game.spaces.farmouth;
message2.players++;
for (let index = 0; index < 30 * 600; index++) message2.tick();
message2.players--;
const raids = [...message2.ships.values()].filter(
  (shipEntity7) => shipEntity7.ai === 'raid' && !shipEntity7.owner && !shipEntity7.mission,
);
assertCondition(
  raids.length <= 2,
  `raider groups don't pile up in inner space (${raids.length} after ten minutes)`,
);
assertCondition(
  ![...message2.ships.values()].some(
    (shipEntity7) =>
      shipEntity7.faction === 'hollow' &&
      shipEntity7.hull ===
        [...TRAFFIC.hollow.war].sort(
          (firstValue, secondValue) =>
            assets.ships[secondValue].cost - assets.ships[firstValue].cost,
        )[0],
  ),
  'and the heaviest raider hull stays out of inner space',
);

// ---- gameplay edge cases
const captainFixture2 = fake('Bug Hunter'),
  playerData = captainFixture2.d;
const land = (identifier: string | null) => {
  if (requiredFixtureValue(captainFixture2.s).ent) {
    const message3 = game.spaces[playerData.sys];
    game.dropEscorts(
      message3,
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture2.s).ent),
    );
    message3.remove(
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture2.s).ent),
    );
    message3.players--;
    requiredFixtureValue(captainFixture2.s).ent = null;
  }
  playerData.stellar = identifier;
  playerData.sys = STELLARS[requiredFixtureValue(identifier)].system;
};
land('qstation');
playerData.ship = (await import('../shared/rules.ts')).makeLoadout(assets, 704, 'Hauler');
// Mission offers depend on the ten-minute wall-clock window, not just test RNG.
const realNow = Date.now;
Date.now = () => 1792339200000;
const mission = game
  .offers(STELLARS.qstation, playerData)
  .find(
    (options) =>
      options.type === 'cargo' &&
      requiredFixtureValue(options.qty) <
        requiredFixtureValue(game.features.shipStats.stats(playerData)).cargo,
  );
captainFixture2.send({ t: 'accept', id: requiredFixtureValue(mission).id });
Date.now = realNow;
const captainId = requiredFixtureValue(game.market(STELLARS.qstation))[0].id;
captainFixture2.send({ t: 'trade', cid: captainId, qty: 99 });
assertCondition(
  playerData.missions.length === 1 &&
    (playerData.cargo[captainId] || 0) + requiredFixtureValue(requiredFixtureValue(mission).qty) <=
      requiredFixtureValue(game.features.shipStats.stats(playerData)).cargo,
  'job cargo takes up hold space when buying goods',
);
assertCondition(
  requiredFixtureValue(captainFixture2.out.filter((message3) => message3.t === 'you').pop()).d
    .jobCargo === requiredFixtureValue(mission).qty,
  'and the HUD is told about it',
);
seedCargo(playerData, {});
playerData.missions = [];
const stellarBody = Object.values(STELLARS).find(
  (stellarBody2) =>
    stellarBody2.svc.includes('L') && !stellarBody2.svc.includes('O') && !stellarBody2.site,
);
land(requiredFixtureValue(stellarBody).id);
const officerId = Object.keys(playerData.ship.outfits)[0],
  outfit = playerData.ship.outfits[officerId];
captainFixture2.send({ t: 'outfit', id: +officerId, n: -1 });
assertCondition(
  playerData.ship.outfits[officerId] === outfit,
  'outfits can only be sold where there is an outfitter',
);
captainFixture2.send({ t: 'rename', name: '  <>  ' });
assertCondition(
  playerData.ship.name === assets.ships[playerData.ship.hull].name,
  'a blank ship name falls back to the hull name',
);
land('qstation');
game.features.docks.docksInit(playerData);
for (const hull2 of [703, 704]) {
  const ship = (await import('../shared/rules.ts')).makeLoadout(assets, hull2, 'W' + hull2);
  ship.uid = game.features.docks.shipUid(playerData);
  playerData.dock.push({ ship, bridge: {} });
  playerData.docks[playerData.activeDock].wings.push(mockSavedDockWing({ uid: ship.uid }));
}
captainFixture2.send({ t: 'depart' });
const message3 = game.spaces[playerData.sys],
  entityId = requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture2.s).ent).id;
assertCondition(
  [...message3.ships.values()].filter((shipEntity7) => shipEntity7.owner === entityId).length === 2,
  'escorts launch with you',
);
message3.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture2.s).ent));
game.onPlayerDeath(
  requiredFixtureValue(
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture2.s).ent).player,
  ),
  message3,
  null,
);
assertCondition(
  ![...message3.ships.values()].some((shipEntity7) => shipEntity7.owner === entityId),
  'escorts no longer linger after you are destroyed',
);
// abandon removes bounty target
playerData.missions = [];
let secondEntry = null;
for (const stellarBody2 of Object.values(STELLARS).filter(
  (stellarBody3) => stellarBody3.svc.includes('B') && !stellarBody3.site,
)) {
  secondEntry = game
    .offers(stellarBody2, playerData)
    .find((mission2) => mission2.type === 'bounty');
  if (secondEntry) {
    land(stellarBody2.id);
    break;
  }
} // job boards reroll every ten minutes
captainFixture2.send({ t: 'accept', id: requiredFixtureValue(secondEntry).id });
land(
  requiredFixtureValue(
    systemsById[requiredFixtureValue(secondEntry).sys].stellars.find((stellarBody2) =>
      requiredFixtureValue(stellarBody2.svc).includes('L'),
    ),
  ).id,
);
captainFixture2.send({ t: 'depart' });
const message4 = game.spaces[requiredFixtureValue(secondEntry).sys],
  entity = [...message4.ships.values()].find(
    (shipEntity7) =>
      shipEntity7.mission && shipEntity7.mission.id === requiredFixtureValue(secondEntry).id,
  );
assertCondition(entity, 'the bounty target appears');
captainFixture2.send({ t: 'abandon', id: requiredFixtureValue(secondEntry).id });
for (let index = 0; index < 30 * 30; index++) message4.tick();
assertCondition(
  !requiredFixtureValue(entity).mission &&
    (requiredFixtureValue(entity).dead || requiredFixtureValue(entity).ai === 'leave'),
  'abandoning the bounty sends its target away',
);
// drydock: Tender name no longer deletes, ship swaps check job cargo
const site = Object.values(STELLARS).find(
  (stellarBody2) => stellarBody2.site && !game.siteOwner(stellarBody2.id),
);
land(requiredFixtureValue(site).id);
captainFixture2.send({ t: 'station', op: 'claim' });
playerData.credits = 1e6;
playerData.station.ops = 3;
playerData.dock = [];
Object.assign(playerData, { docks: null });
game.features.docks.docksInit(playerData);
playerData.ship.name = 'Tender';
seedCargo(playerData, {});
captainFixture2.send({ t: 'dock', op: 'store' });
assertCondition(playerData.shipless && playerData.dock.length === 1, 'store the ship named Tender');
playerData.dock.push({
  ship: {
    ...playerData.dock[0].ship,
    name: 'Second',
    uid: game.features.docks.shipUid(playerData),
  },
  bridge: {},
});
captainFixture2.send({ t: 'dock', op: 'store', i: 1 });
assertCondition(
  playerData.ship.name === 'Second' &&
    playerData.dock.some((entry) => entry.ship.name === 'Tender'),
  'a ship named Tender survives a drydock swap',
);
captainFixture2.send({ t: 'dock', op: 'store', i: 0 });
assertCondition(
  playerData.dock.some((entry) => entry.ship.name === 'Second'),
  'swapping back stores the other ship',
);
playerData.missions = [
  mockMission({
    id: 'jc',
    type: 'cargo',
    qty: 999,
    dest: 'qstation',
    sys: STELLARS.qstation.system,
    title: 'heavy',
  }),
];
captainFixture2.send({ t: 'dock', op: 'store', i: 0 });
assertCondition(
  playerData.ship.name === 'Tender' &&
    requiredFixtureValue(captainFixture2.toasts().pop()).includes("can't hold"),
  'a drydock swap checks your job cargo fits',
);
playerData.missions = [];
const before = playerData.credits,
  storedShip = playerData.dock[0],
  outfits2 = game.O,
  stockValue = Math.round(assets.ships[storedShip.ship.hull].cost * 0.5);
assertCondition(
  game.features.hangar.storedValue(storedShip) === stockValue,
  'stored factory equipment is already included in half the hull purchase price',
);
// A separately purchased upgrade still contributes its own half-retail resale value.
const upgrade = Object.values(outfits2).find(
  (outfit2) => requiredFixtureValue(outfit2.eff).shield && !storedShip.ship.outfits[outfit2.id],
);
storedShip.ship.outfits[requiredFixtureValue(upgrade).id] = 1;
const want = Math.round(
  assets.ships[storedShip.ship.hull].cost * 0.5 + requiredFixtureValue(upgrade).cost * 0.5,
);
captainFixture2.send({ t: 'dock', op: 'sell', i: 0 });
assertCondition(
  playerData.credits - before === want && want > stockValue,
  'stored ships sell for half the inclusive hull price plus half separately purchased outfits',
);
// lower deck
playerData.lower = ['medic'];
captainFixture2.send({
  t: 'lower',
  op: 'hire',
  kind: Object.keys((await import('../shared/syndicate.ts')).LOWER_DECK).find(
    (propertyKey) => propertyKey !== 'medic',
  ),
  i: 0,
});
assertCondition(
  playerData.lower[0] === 'medic',
  'hiring into a filled lower-deck berth is refused',
);
// save import ignores __proto__
const parse2 = JSON.parse(JSON.stringify(game.db.get('Bug Hunter')));
delete parse2.salt;
delete parse2.hash;
parse2.name = 'Proto Test';
// Isolate key filtering: a renamed save cannot take the original captain's station.
parse2.station = mockPlayerData(game.fresh()).station;
const evil = JSON.parse(JSON.stringify(parse2).replace(/^\{/, '{"__proto__":{"polluted":1},'));
game.importSave(evil);
assertCondition(
  Object.getPrototypeOf(game.db.get('Proto Test')) === Object.prototype &&
    !('polluted' in requiredFixtureValue(game.db.get('Proto Test'))),
  'save imports copy only plain keys',
);
// unique bounty names
let duplicateDetected = false;
for (const stellarBody2 of Object.values(STELLARS)
  .filter((stellarBody3) => stellarBody3.svc.includes('B'))
  .slice(0, 60)) {
  const neutralSystems = game
    .offers(stellarBody2, playerData)
    .filter((mission2) => mission2.type === 'bounty' && !mission2.elite && !mission2.syn)
    .map((mission2) => mission2.targetName);
  if (new Set(neutralSystems).size !== neutralSystems.length) duplicateDetected = true;
}
assertCondition(!duplicateDetected, 'one job board never offers two bounties on the same name');
// solo pause stops rush deadlines and loans
game.solo = true;
playerData.missions = [
  mockMission({
    id: 'r1',
    type: 'cargo',
    qty: 1,
    deadline: Date.now() + 60000,
    title: 'rush',
    dest: 'qstation',
    sys: 'quantum-gate',
  }),
];
playerData.loan = { bal: 1000, next: Date.now() + 60000 };
const deadline2 = playerData.missions[0].deadline,
  next2 = playerData.loan.next;
game.setPaused(true);
game.pausedAt -= 30000;
game.setPaused(false);
assertCondition(
  requiredFixtureValue(playerData.missions[0].deadline) - requiredFixtureValue(deadline2) >=
    30000 && playerData.loan.next - next2 >= 30000,
  'pausing a solo game stops the clock on rush deadlines and loan payments',
);
game.solo = false;
playerData.missions = [];
playerData.loan = null;
// rivals flying with you are released, not deleted, when you land
land('qstation');
captainFixture2.send({ t: 'depart' });
const message5 = game.spaces[playerData.sys],
  entity2 = requiredFixtureValue(captainFixture2.s).ent;
const shipEntity7 = message5.makeShip({
  hull: 703,
  faction: 'spacer',
  x: requiredFixtureValue(entity2).x + 100,
  y: requiredFixtureValue(entity2).y,
  a: 0,
  ai: 'escort',
  owner: requiredFixtureValue(entity2).id,
});
shipEntity7.rival = 'test';
shipEntity7.rivalAi = 'patrol';
game.land(captainFixture2.s, 'qstation');
assertCondition(
  message5.ships.has(shipEntity7.id) && !shipEntity7.owner && shipEntity7.ai === 'patrol',
  'a rival flying alongside goes back to their own business when you land',
);
console.log('ALL 2.0.3 TESTS PASSED');
process.exit(0);
