import { mockPlayerData, mockSavedDockWing } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.1 tests: docks A-E with a lead ship and wingmates each, stored ships, officers crewing wingmates, buying to the hangar.
import filesystem from 'node:fs';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS, WINGMATES } from '../shared/galaxy.ts';
import { makeLoadout } from '../shared/rules.ts';
import { SPEC } from '../shared/specialty.ts';
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
const directory = tempDataDir('rift-v21-');
// an old (2.0.3) save with two hired escorts and a stored ship preset
{
  const game3 = new Game(assets, new Database(directory));
  const player = game3.db.create('Old Hand', 'secret', mockPlayerData(game3.fresh()));
  player.station.claimed = true;
  player.station.ops = 4;
  player.station.site = 'site-qgate';
  game3.db.world.sites['site-qgate'] = game3.db.key('Old Hand');
  player.escorts = [751, 752];
  player.ship = makeLoadout(assets, 708, 'Old Blade');
  Object.assign(player, {
    dock: [{ ship: makeLoadout(assets, 704, 'Hauler'), escorts: [752], bridge: {} }],
  });
  player.stellar = 'site-qgate';
  player.sys = STELLARS['site-qgate'].system;
  game3.db.touch();
  game3.db.flush();
}
const game = new Game(assets, new Database(directory));
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  const output: LegacyPacket[] = [];
  legacySocket2.send = (message: string) =>
    output.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '7.7.7.' + name.length);
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
    you: () => requiredFixtureValue(output.filter((message) => message.t === 'you').pop()).d,
  };
}
const captainFixture = fake('Old Hand'),
  playerData = captainFixture.d;
assertCondition(
  Array.isArray(playerData.docks) && playerData.docks.length === 3 && playerData.activeDock === 0,
  'an Ops 4 captain gets three docks, Dock A active',
);
assertCondition(
  playerData.docks[0].lead === playerData.ship.uid,
  'Dock A leads with the ship you fly',
);
assertCondition(
  playerData.docks[0].wings.filter(Boolean).length === 2 &&
    playerData.dock.some((entry) => entry.ship.hull === 751) &&
    playerData.dock.some((entry) => entry.ship.hull === 752),
  'hired escorts became stored ships flying as Dock A wingmates',
);
assertCondition(
  !playerData.escorts.length && !playerData.dock.some((entry) => entry.escorts),
  'old escort lists are retired (a stored preset escort is refunded)',
);
const playerData3 = captainFixture.you();
assertCondition(
  playerData3.docks &&
    playerData3.docks.list.length === 3 &&
    playerData3.docks.list[0].wings.length === 2 &&
    playerData3.docks.cap === 11,
  'the client gets docks, wing slots and berth count',
);
// wingmates launch with their own loadouts and officers
const options = {
  id: game.features.hangar.uid(playerData),
  name: 'Wing Boss',
  race: 'quantum',
  role: 'captain',
  rarity: 3,
  lv: 10,
  xp: 0,
};
playerData.officers.push(options);
captainFixture.send({ t: 'docks', op: 'crew', k: 0, w: 0, role: 'cap', oid: options.id });
assertCondition(
  requiredFixtureValue(playerData.docks[0].wings[0]).cap === options.id,
  'an officer captains a wingmate',
);
playerData.bridge.captain = options.id;
captainFixture.send({ t: 'officer', op: 'assign', oid: options.id, slot: 'captain' });
assertCondition(
  playerData.bridge.captain === options.id &&
    !requiredFixtureValue(playerData.docks[0].wings[0]).cap,
  'moving them to your bridge takes them off the wingmate',
);
captainFixture.send({ t: 'docks', op: 'crew', k: 0, w: 0, role: 'cap', oid: options.id });
assertCondition(
  requiredFixtureValue(playerData.docks[0].wings[0]).cap === options.id &&
    !playerData.bridge.captain,
  '...and back again: one post at a time',
);
captainFixture.send({ t: 'depart' });
const space = game.spaces[playerData.sys],
  entity = requiredFixtureValue(captainFixture.s).ent;
const wings = [...space.ships.values()].filter(
  (wingEntity) => wingEntity.owner === requiredFixtureValue(entity).id && wingEntity.wingUid,
);
assertCondition(wings.length === 2, 'both wingmates launch in formation');
const entity2 = wings.find(
    (shipEntity) =>
      shipEntity.wingUid === String(requiredFixtureValue(playerData.docks[0].wings[0]).uid),
  ),
  plain = space.makeShip({ hull: Number(requiredFixtureValue(entity2).hull), faction: 'quantum' });
assertCondition(
  requiredFixtureValue(entity2).st.shield > plain.st.shield,
  'the captained wingmate is stronger than a bare hull',
);
// a wingmate knocked out goes in for repairs
space.damage(requiredFixtureValue(entity2), 1e7, 1e7, null);
const storedShip = playerData.dock.find(
  (entry) => entry.ship.uid === requiredFixtureValue(entity2).wingUid,
);
assertCondition(
  requiredFixtureValue(requiredFixtureValue(storedShip).repairT) > Date.now() &&
    captainFixture.toasts().some((toastText: string) => toastText.includes('towed home')),
  'a wingmate knocked out is towed home for repairs',
);
assertCondition(
  game.features.docks.activeWings(playerData).length === 1,
  'and sits out until repaired',
);
playerData.credits = 1e7;
captainFixture.send({ t: 'docks', op: 'repair', uid: requiredFixtureValue(storedShip).ship.uid });
assertCondition(!requiredFixtureValue(storedShip).repairT, 'rush repairs put her back in service');
// back at the station: build Dock B and switch
game.land(captainFixture.s, playerData.stellar || 'site-qgate');
if (requiredFixtureValue(captainFixture.s).ent) {
  const message = game.spaces[playerData.sys];
  game.dropEscorts(
    message,
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture.s).ent),
  );
  message.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture.s).ent));
  message.players--;
  requiredFixtureValue(captainFixture.s).ent = null;
}
playerData.stellar = 'site-qgate';
playerData.sys = STELLARS['site-qgate'].system;
captainFixture.send({ t: 'buyship', hull: 710, store: true });
const storedShip2 = playerData.dock.find((entry) => entry.ship.hull === 710);
assertCondition(
  storedShip2 && playerData.credits < 1e7,
  'bought a ship straight into the hangar, no trade-in',
);
captainFixture.send({ t: 'buyship', hull: WINGMATES[2] });
assertCondition(
  playerData.dock.some((entry) => entry.ship.hull === WINGMATES[2]) && playerData.ship.hull === 708,
  'wingmate ships always go to the hangar',
);
const storedShip3 = playerData.dock.find((entry) => entry.ship.hull === WINGMATES[2]);
captainFixture.send({
  t: 'docks',
  op: 'assign',
  k: 1,
  slot: 'lead',
  uid: requiredFixtureValue(storedShip3).ship.uid,
});
assertCondition(
  !playerData.docks[1].lead &&
    requiredFixtureValue(captainFixture.toasts().pop()).includes('only as a wingmate'),
  'wingmate hulls cannot lead a dock',
);
captainFixture.send({
  t: 'docks',
  op: 'assign',
  k: 1,
  slot: 'lead',
  uid: requiredFixtureValue(storedShip2).ship.uid,
});
captainFixture.send({
  t: 'docks',
  op: 'assign',
  k: 1,
  slot: 0,
  uid: requiredFixtureValue(storedShip3).ship.uid,
});
assertCondition(
  playerData.docks[1].lead === requiredFixtureValue(storedShip2).ship.uid &&
    requiredFixtureValue(playerData.docks[1].wings[0]).uid ===
      requiredFixtureValue(storedShip3).ship.uid,
  'Dock B: a lead and a wingmate',
);
const availableWidth = requiredFixtureValue(playerData.docks[0].wings[1]).uid;
captainFixture.send({ t: 'docks', op: 'assign', k: 1, slot: 1, uid: availableWidth });
assertCondition(
  requiredFixtureValue(playerData.docks[1].wings[1]).uid === availableWidth &&
    !playerData.docks[0].wings.some((weapon) => weapon && weapon.uid === availableWidth),
  'a ship moves between docks, never in two at once',
);
captainFixture.send({ t: 'docks', op: 'assign', k: 1, slot: 0, uid: playerData.ship.uid });
assertCondition(
  requiredFixtureValue(playerData.docks[1].wings[0]).uid ===
    requiredFixtureValue(storedShip3).ship.uid,
  "the ship you fly can't be put in another slot",
);
const previousState = playerData.ship;
seedCargo(playerData, { food: 9999 });
captainFixture.send({ t: 'docks', op: 'activate', k: 1 });
assertCondition(playerData.activeDock === 0, 'switching docks checks your cargo fits the new lead');
seedCargo(playerData, {});
captainFixture.send({ t: 'docks', op: 'activate', k: 1 });
assertCondition(
  playerData.activeDock === 1 &&
    playerData.ship === requiredFixtureValue(storedShip2).ship &&
    playerData.dock.includes(
      requiredFixtureValue(playerData.dock.find((entry) => entry.ship === previousState)),
    ) &&
    playerData.docks[0].lead === previousState.uid,
  'fly with Dock B: its lead is your ship, the old one waits as Dock A lead',
);
assertCondition(
  game.features.docks
    .activeWings(playerData)
    .map((options) => options.x.ship.uid)
    .sort((left, right) => String(left).localeCompare(String(right)))
    .join() ===
    [requiredFixtureValue(storedShip3).ship.uid, availableWidth]
      .sort((left, right) => String(left).localeCompare(String(right)))
      .join(),
  "Dock B's wingmates now fly with you",
);
captainFixture.send({ t: 'docks', op: 'activate', k: 0 });
assertCondition(
  playerData.activeDock === 0 && playerData.ship === previousState,
  'and back to Dock A',
);
// Herald leads command a third wingmate
const shipLoadout = makeLoadout(
  assets,
  requiredFixtureValue(Object.values(SPEC).find((shipHull) => shipHull.key === 'herald')).id,
  'Halo',
);
shipLoadout.uid = game.features.docks.shipUid(playerData);
playerData.dock.push({ ship: shipLoadout, bridge: {} });
captainFixture.send({ t: 'docks', op: 'assign', k: 2, slot: 'lead', uid: shipLoadout.uid });
assertCondition(
  game.features.docks.wingMax(playerData, 2) === 3 &&
    game.features.docks.wingMax(playerData, 1) === 2,
  'a Herald lead opens a third wingmate slot',
);
// selling a stored ship frees its slot; hangar capacity is enforced
captainFixture.send({ t: 'dock', op: 'sell', uid: requiredFixtureValue(storedShip3).ship.uid });
assertCondition(
  !playerData.dock.some((entry) => entry === storedShip3) &&
    !playerData.docks[1].wings.some(
      (weapon) => weapon && weapon.uid === requiredFixtureValue(storedShip3).ship.uid,
    ),
  'selling a stored ship empties its slot',
);
while (playerData.dock.length < game.features.hangar.dockSlots(playerData)) {
  const shipLoadout2 = makeLoadout(assets, 703, 'filler');
  shipLoadout2.uid = game.features.docks.shipUid(playerData);
  playerData.dock.push({ ship: shipLoadout2, bridge: {} });
}
captainFixture.send({ t: 'buyship', hull: 704, store: true });
assertCondition(
  requiredFixtureValue(captainFixture.toasts().pop()).includes('hangar is full'),
  'the hangar holds only so many ships',
);
// the hire op is retired
captainFixture.send({ t: 'station', op: 'hire', hull: 751 });
assertCondition(
  requiredFixtureValue(captainFixture.toasts().pop()).includes('Wingmates are ships now'),
  'hiring wingmates at the station is retired',
);
// a fresh captain without a station: Dock A only, no wingmates
const captainFixture2 = fake('New Pilot');
assertCondition(
  captainFixture2.d.docks.length === 1 &&
    captainFixture2.you().docks.cap === 0 &&
    game.features.docks.activeWings(captainFixture2.d).length === 0,
  'a captain without a station has Dock A and no hangar',
);
// Deliberately attacking a selected friendly trader causes damage, hostility and standing loss.
{
  const captainFixture3 = fake('Trigger Happy');
  captainFixture3.send({ t: 'depart' });
  const message = game.spaces[captainFixture3.d.sys],
    entity8 = requiredFixtureValue(captainFixture3.s).ent;
  const shipEntity = message.makeShip({
    hull: 704,
    faction: 'quantum',
    x: requiredFixtureValue(entity8).x + Math.sin(requiredFixtureValue(entity8).a) * 150,
    y: requiredFixtureValue(entity8).y - Math.cos(requiredFixtureValue(entity8).a) * 150,
    a: 0,
    ai: 'trade',
  });
  captainFixture3.send({ t: 'target', id: shipEntity.id });
  shipEntity.dest = { x: shipEntity.x, y: shipEntity.y, out: true };
  const initialAngle0 = shipEntity.armor + shipEntity.shield,
    quantum2 = captainFixture3.d.rep.quantum;
  for (let index = 0; index < 60; index++) {
    requiredFixtureValue(captainFixture3.s).inputs.push({
      seq: index + 1,
      thrust: 0,
      turn: 0,
      ab: 0,
      rev: 0,
      fire1: 1,
      fire2: 0,
    });
    message.tick();
  }
  assertCondition(
    shipEntity.armor + shipEntity.shield < initialAngle0 &&
      captainFixture3.d.rep.quantum < quantum2 &&
      message.isHostile(shipEntity, requiredFixtureValue(entity8)),
    'selected friendly trader takes damage, turns hostile and costs standing',
  );
  const shipEntity2 = message.makeShip({
    hull: 704,
    faction: 'quantum',
    x: requiredFixtureValue(entity8).x,
    y: requiredFixtureValue(entity8).y,
    ai: 'escort',
    owner: requiredFixtureValue(entity8).id,
  });
  assertCondition(
    !message.canHit(requiredFixtureValue(entity8), shipEntity2),
    'but never your own wingmates',
  );
}
// a save with five docks (an earlier 2.1 build), flying Dock E: it folds into four, and you keep flying your ship
{
  const captainFixture4 = fake('Five Docks'),
    playerData4 = captainFixture4.d;
  playerData4.station.claimed = true;
  playerData4.station.ops = 5;
  playerData4.station.site = 'site-halcyon';
  game.db.world.sites['site-halcyon'] = game.db.key('Five Docks');
  const makeElement = (hull2: string | number) => {
    const shipLoadout3 = makeLoadout(assets, hull2, 'S' + hull2);
    shipLoadout3.uid = game.features.docks.shipUid(playerData4);
    playerData4.dock.push({ ship: shipLoadout3, bridge: {} });
    return shipLoadout3.uid;
  };
  playerData4.docks = [
    { lead: null, wings: [] },
    { lead: makeElement(710), wings: [] },
    { lead: makeElement(711), wings: [] },
    { lead: makeElement(712), wings: [] },
    {
      lead: requiredFixtureValue(playerData4.ship.uid),
      wings: [mockSavedDockWing({ uid: makeElement(751) })],
    },
  ];
  playerData4.activeDock = 4;
  game.features.docks.docksInit(playerData4);
  assertCondition(
    playerData4.docks.length === 4 &&
      playerData4.activeDock === 3 &&
      playerData4.docks[3].lead === playerData4.ship.uid &&
      playerData4.docks[3].wings[0] &&
      requiredFixtureValue(
        game.features.docks.stored(playerData4, playerData4.docks[3].wings[0].uid),
      ).ship.hull === 751,
    'five docks fold into four: you keep flying your ship and its wingmate, now in Dock D',
  );
  assertCondition(
    playerData4.dock.some((entry) => entry.ship.hull === 712) &&
      !game.features.docks.slotOf(
        playerData4,
        requiredFixtureValue(
          requiredFixtureValue(playerData4.dock.find((entry) => entry.ship.hull === 712)).ship.uid,
        ),
      ),
    "Dock D's old lead waits in the hangar, unassigned",
  );
}
// K: wingmates go after your target even when it is not hostile; F: drones launch and recall as a toggle
{
  const captainFixture5 = fake('Wing Leader'),
    playerData5 = captainFixture5.d;
  game.features.docks.docksInit(playerData5);
  for (const hull3 of [751, 752]) {
    const shipLoadout3 = makeLoadout(assets, hull3, 'W');
    shipLoadout3.uid = game.features.docks.shipUid(playerData5);
    playerData5.dock.push({ ship: shipLoadout3, bridge: {} });
    playerData5.docks[0].wings.push(mockSavedDockWing({ uid: shipLoadout3.uid }));
  }
  captainFixture5.send({ t: 'depart' });
  const message = game.spaces[playerData5.sys],
    entity5 = requiredFixtureValue(captainFixture5.s).ent;
  const shipEntity = message.makeShip({
    hull: 711,
    faction: 'spacer',
    x: requiredFixtureValue(entity5).x + 1600,
    y: requiredFixtureValue(entity5).y,
    a: 0,
    ai: 'guard',
  });
  shipEntity.home = { x: shipEntity.x, y: shipEntity.y };
  requiredFixtureValue(entity5).target = shipEntity;
  captainFixture5.send({ t: 'order', o: 'attack' });
  const entitys = [...message.ships.values()].filter((shipEntity2) => shipEntity2.wingUid),
    distance = entitys.map((shipEntity2) =>
      Math.hypot(shipEntity2.x - shipEntity.x, shipEntity2.y - shipEntity.y),
    );
  for (let index = 0; index < 30 * 6; index++) {
    requiredFixtureValue(entity5).vx = requiredFixtureValue(entity5).vy = 0;
    message.tick();
  }
  assertCondition(
    entitys.every(
      (shipEntity2, index) =>
        shipEntity2.target === shipEntity &&
        Math.hypot(shipEntity2.x - shipEntity.x, shipEntity2.y - shipEntity.y) <
          distance[index] - 400,
    ),
    'K sends your wingmates out to attack your target, even a neutral one',
  );
}
{
  const captainFixture6 = fake('Carrier Ace'),
    playerData4 = captainFixture6.d;
  playerData4.ship = makeLoadout(assets, 715, 'Hive');
  game.features.docks.leadChanged(playerData4);
  captainFixture6.send({ t: 'depart' });
  const message = game.spaces[playerData4.sys],
    entity5 = requiredFixtureValue(captainFixture6.s).ent;
  const fighters = () =>
      [...message.ships.values()].filter(
        (shipEntity) => shipEntity.fighterOf === requiredFixtureValue(entity5).id,
      ),
    launchBay = () =>
      requiredFixtureValue(requiredFixtureValue(entity5).guns.find((entry) => entry.p.bay)).ammo;
  const tapperRock = () => {
    requiredFixtureValue(captainFixture6.s).inputs.push({
      seq: 1,
      thrust: 0,
      turn: 0,
      ab: 0,
      rev: 0,
      fire1: 0,
      fire2: 1,
    });
    message.tick();
    for (let index = 0; index < 3; index++) {
      requiredFixtureValue(captainFixture6.s).inputs.push({
        seq: 2,
        thrust: 0,
        turn: 0,
        ab: 0,
        rev: 0,
        fire1: 0,
        fire2: 0,
      });
      message.tick();
    }
  };
  const full = launchBay();
  tapperRock();
  assertCondition(
    fighters().length === full && launchBay() === 0,
    'one tap of F launches every drone at once',
  );
  for (let index = 0; index < 30 * 25; index++) {
    requiredFixtureValue(entity5).vx = requiredFixtureValue(entity5).vy = 0;
    message.tick();
  }
  assertCondition(fighters().length === full, 'they stay out until you recall them');
  tapperRock();
  for (let index = 0; index < 30 * 8; index++) {
    requiredFixtureValue(entity5).vx = requiredFixtureValue(entity5).vy = 0;
    message.tick();
  }
  assertCondition(
    fighters().length === 0 && launchBay() === full,
    'a second tap calls them all home into the bays',
  );
  tapperRock();
  game.land(
    captainFixture6.s,
    playerData4.stellar ||
      requiredFixtureValue(
        Object.values((await import('../shared/galaxy.ts')).STELLARS).find(
          (stellarBody) => stellarBody.system === playerData4.sys && stellarBody.svc.includes('L'),
        ),
      ).id,
  );
  if (requiredFixtureValue(captainFixture6.s).ent) {
    game.dropEscorts(message, requiredFixtureValue(entity5));
    for (const weaponMount of requiredFixtureValue(entity5).guns)
      if (weaponMount.ammo !== Infinity) playerData4.ship.ammo[weaponMount.w] = weaponMount.ammo;
  }
  assertCondition(
    playerData4.ship.ammo[
      requiredFixtureValue(requiredFixtureValue(entity5).guns.find((entry) => entry.p.bay)).w
    ] === full,
    'drones still out when you leave go back into the bays',
  );
}
console.log('ALL 2.1 TESTS PASSED');
process.exit(0);
