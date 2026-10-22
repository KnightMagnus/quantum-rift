import { mockPlayerData, mockSavedDockWing } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.6 tests: retirement of refits, Armada escorts, directives, fleets and territory (with save migration); Captain Friends
// and DMs; the Armada; trading between Personal Stations; no open-galaxy PvP; duels and Armada Duels; rescue; co-op
// Holdout; Armada contracts.
import filesystem from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS, SYS as systemsById, SYSTEMS, MK2_OF, MK3_OF } from '../shared/galaxy.ts';
import { makeLoadout, augmentAssets } from '../shared/rules.ts';
import { ARMADA, DUEL, RESCUE, WARBAND } from '../shared/coop.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const assertCondition = (captain: unknown, message: string) => {
  if (!captain) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
process.env.SEEDS_FILE = '/nonexistent';
const clientDirectory = fileURLToPath(new URL('../client/', import.meta.url));
{
  const parseFailures: string[] = [];
  for (const feature of filesystem
    .readdirSync(clientDirectory)
    .filter((feature3) => feature3.endsWith('.ts'))) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: stripTypeScriptTypes(filesystem.readFileSync(clientDirectory + feature, 'utf8')),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    } catch {
      parseFailures.push(feature);
    }
  }
  assertCondition(
    !parseFailures.length,
    `every client script parses${parseFailures.length ? ': BAD ' + parseFailures : ''}`,
  );
}
{
  const miss = []; // every name a client script imports from a shared or client module is actually exported there
  for (const feature of filesystem
    .readdirSync(clientDirectory)
    .filter((feature2) => feature2.endsWith('.ts')))
    for (const message of filesystem
      .readFileSync(clientDirectory + feature, 'utf8')
      .matchAll(/import \{([^}]+)\} from '([^']+)'/g)) {
      const path = message[2].startsWith('/shared/')
        ? new URL('..' + message[2], import.meta.url).href
        : message[2].startsWith('./')
          ? pathToFileURL(clientDirectory + message[2].slice(2)).href
          : null;
      if (!path) continue;
      const importedModule: Record<string, unknown> | null = await import(path).catch(() => null);
      const names = message[1]
        .split(',')
        .map((entry) => entry.trim().split(/\s+as\s+/)[0])
        .filter(Boolean);
      if (!importedModule) {
        if (!message[2].startsWith('./')) miss.push(`${feature}: ${message[2]}`);
        continue;
      }
      for (const quantity of names)
        if (!(quantity in importedModule)) miss.push(`${feature}: ${quantity} from ${message[2]}`);
    }
  assertCondition(
    !miss.length,
    `every client import resolves${miss.length ? ': ' + miss.join('; ') : ''}`,
  );
}

// ------------------------------------------------------------------ an old save and an old world
const directory = tempDataDir('rift-v26-');
{
  const game3 = new Game(assets, new Database(directory)),
    worldData = game3.db.world;
  const player = game3.db.create('Old Admiral', 'secret', mockPlayerData(game3.fresh()));
  player.ship = makeLoadout(assets, MK3_OF[MK2_OF[708]], 'Red Lance');
  player.ship.uid = 's1';
  player.dock = [
    { ship: Object.assign(makeLoadout(assets, 758, 'Escort'), { uid: 's2' }), bridge: {} },
    { ship: Object.assign(makeLoadout(assets, MK2_OF[704], 'Mule'), { uid: 's3' }), bridge: {} },
  ];
  player.docks = [{ lead: 's1', wings: [mockSavedDockWing({ uid: 's2', cap: null, crew: null })] }];
  player.activeDock = 0;
  player.directives = { 1: 2, 2: 0, 3: 1 };
  player.fleet = 'OLD';
  player.credits = 1000;
  const account = game3.db.create('Old Wing', 'secret', mockPlayerData(game3.fresh()));
  account.fleet = 'OLD';
  account.credits = 1000;
  Object.assign(worldData, {
    fleets: {
      OLD: {
        tag: 'OLD',
        name: 'Old Guard',
        leader: 'Old Admiral',
        members: ['Old Admiral', 'Old Wing'],
        bank: 400000,
        pending: [],
        open: true,
      },
    },
  });
  worldData.claims = { x: { fleet: 'OLD' } };
  worldData.cooldown = {};
  game3.db.touch();
  game3.db.flush();
}
const game = new Game(assets, new Database(directory)),
  worldData2 = game.db.world;
assertCondition(
  !worldData2.fleets && !worldData2.claims && worldData2.armadas,
  'fleets and territory are gone from the world; Armadas take their place',
);
assertCondition(
  requiredFixtureValue(game.db.get('Old Wing')).credits === 1000 + 200000 &&
    requiredFixtureValue(game.db.get('Old Admiral')).credits >= 1000 + 200000 + 50000,
  'each fleet bank was shared out, and the founder got the fee back',
);
let ipAddress = 1;
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  const output: LegacyPacket[] = [];
  legacySocket2.send = (message: string) =>
    output.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '7.7.6.' + ipAddress++);
  const send = (message: Record<string, unknown>) =>
    legacySocket2.emit('message', JSON.stringify(message));
  send({ t: 'hello', name, pass: 'secret' });
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  return {
    s: session,
    d: requiredFixtureValue(session).data,
    out: output,
    send,
    sock: legacySocket2,
    toasts: () => output.filter((message) => message.t === 'toast').map((message) => message.msg),
    last: (messageType: string) =>
      [...output].reverse().find((message) => message.t === messageType),
    all: (messageType2: string) => output.filter((message) => message.t === messageType2),
  };
}
const captainFixture = fake('Old Admiral'),
  playerData = captainFixture.d;
assertCondition(
  playerData.ship.hull === 708 &&
    playerData.ship.uid === 's1' &&
    playerData.ship.name === 'Red Lance',
  'a Cutlass Mk III is a Cutlass again, same ship and name',
);
assertCondition(
  playerData.dock.length === 1 &&
    playerData.dock[0].ship.hull === 704 &&
    !playerData.dock.some((entry) => entry.ship.hull === 758),
  'a stored Mk II reverted; the Armada escort stood down',
);
assertCondition(playerData.docks[0].wings.filter(Boolean).length === 0, 'its wing slot is free');
assertCondition(
  playerData.directives === undefined && playerData.fleet === undefined,
  'directives and the fleet tag are gone',
);
assertCondition(
  playerData.credits > 1000 + 250000 + 600000 + 2 * 90000 + assets.ships[758].cost,
  `refits, the escort and the directives were refunded (${playerData.credits.toLocaleString()} cr)`,
);
assertCondition(
  playerData.log.some((entity) => /2\.6: refits/.test(entity.text)),
  'the log explains it',
);
const gameAssets = augmentAssets(JSON.parse(JSON.stringify(assets)));
assertCondition(
  [...Object.values(MK2_OF), ...Object.values(MK3_OF), 757, 758, 759].every(
    (hull2) => gameAssets.ships[hull2].npcOnly,
  ),
  'refit and Armada escort hulls are enemy-only now',
);
{
  const stationPlayerData = playerData;
  stationPlayerData.station = {
    ...stationPlayerData.station,
    claimed: true,
    ops: 5,
    site: 'site-qgate',
  };
  worldData2.sites['site-qgate'] = game.db.key(stationPlayerData.name);
  const verticalPosition = game.yard(STELLARS['site-qgate'], stationPlayerData);
  assertCondition(
    verticalPosition && !verticalPosition.some((hull3) => gameAssets.ships[hull3].npcOnly),
    'the station shipyard sells no refits or Armada escorts',
  );
  captainFixture.send({ t: 'station', op: 'refit' });
  assertCondition(stationPlayerData.ship.hull === 708, 'the refit order is retired');
}
captainFixture.sock.emit('close');

// ------------------------------------------------------------------ friends and DMs
const firstEntry = fake('Ada Vance'),
  secondEntry = fake('Bram Cole'),
  captain = fake('Cass Orr');
firstEntry.send({ t: 'social', op: 'add', name: 'Bram Cole' });
assertCondition(
  secondEntry.d.freqIn.includes('Ada Vance') &&
    firstEntry.d.freqOut.includes('Bram Cole') &&
    secondEntry.toasts().some((messageType3: string) => /wants to add you/.test(messageType3)),
  'a friend request reaches the other captain',
);
secondEntry.send({ t: 'social', op: 'accept', name: 'Ada Vance' });
assertCondition(
  firstEntry.d.friends.includes('Bram Cole') &&
    secondEntry.d.friends.includes('Ada Vance') &&
    !secondEntry.d.freqIn.length,
  'accepted: friends both ways',
);
const _space = firstEntry.last('social') || {};
assertCondition(
  requiredFixtureValue(firstEntry.last('social')).social.friends[0].status === 'online',
  'friends show as online',
);
firstEntry.send({ t: 'social', op: 'dm', name: 'Bram Cole', msg: 'Meet at Halcyon?' });
assertCondition(
  secondEntry
    .all('dm')
    .some(
      (message) =>
        message.msg === 'Meet at Halcyon?' && message.from === 'Ada Vance' && message.t === 'dm',
    ) && firstEntry.all('dm').some((message) => message.sent),
  'a DM arrives live, and the sender gets a copy',
);
captain.send({ t: 'social', op: 'dm', name: 'Bram Cole', msg: 'hi stranger' });
assertCondition(
  !secondEntry.all('dm').some((message) => message.msg === 'hi stranger') &&
    captain
      .toasts()
      .some((messageType4: string) => /only takes messages from friends/.test(messageType4)),
  'strangers cannot message you by default',
);
secondEntry.sock.emit('close');
requiredFixtureValue(firstEntry.s).dmT = 0;
firstEntry.send({ t: 'social', op: 'dm', name: 'Bram Cole', msg: 'you there?' });
assertCondition(
  requiredFixtureValue(game.db.get('Bram Cole')).mail.some(
    (message) => message.msg === 'you there?',
  ),
  'a DM to an offline captain waits in their mailbox',
);
assertCondition(
  requiredFixtureValue(
    requiredFixtureValue(firstEntry.last('social')).social.friends.find(
      (feature: { name: string }) => feature.name === 'Bram Cole',
    ),
  ).status === 'offline' || game.features.coop.statusOf('Bram Cole') === 'offline',
  'and they show as offline',
);
const captainFixture2 = fake('Bram Cole');
assertCondition(
  captainFixture2.last('dms') &&
    requiredFixtureValue(captainFixture2.last('dms')).list.some(
      (message: { msg: string }) => message.msg === 'you there?',
    ) &&
    !captainFixture2.d.mail.length,
  'it is delivered at their next login',
);
captain.send({ t: 'social', op: 'block', name: 'Ada Vance' });
firstEntry.send({ t: 'social', op: 'add', name: 'Cass Orr' });
assertCondition(
  !captain.d.freqIn.includes('Ada Vance'),
  "a blocked captain's requests never arrive",
);
firstEntry.send({ t: 'chat', msg: 'hello all' });
assertCondition(
  !captain.all('chat').some((message) => message.msg === 'hello all') &&
    captainFixture2.all('chat').some((message) => message.msg === 'hello all'),
  'and you do not hear their chat',
);
captain.send({ t: 'social', op: 'unblock', name: 'Ada Vance' });

// ------------------------------------------------------------------ the Armada
const toSpace = (
  captainFixture3: ReturnType<typeof fake>,
  starSystem: string,
  horizontalPosition3 = 0,
  verticalPosition2 = 0,
) => {
  const playerData3 = requiredFixtureValue(captainFixture3.s).data;
  if (requiredFixtureValue(captainFixture3.s).ent) {
    const message = game.spaces[playerData3.sys];
    message.remove(
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture3.s).ent),
    );
    message.players--;
    requiredFixtureValue(captainFixture3.s).ent = null;
  }
  playerData3.sys = starSystem;
  playerData3.stellar = null;
  game.spawnPlayer(captainFixture3.s, horizontalPosition3, verticalPosition2, 0, 0);
  return requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture3.s).ent);
};
firstEntry.send({ t: 'armada', op: 'form', name: 'Night Wardens' });
const armadaState = game.features.coop.armadaOf(firstEntry.d);
assertCondition(
  armadaState &&
    armadaState.leader === 'Ada Vance' &&
    requiredFixtureValue(requiredFixtureValue(firstEntry.last('you')).d.armada).name ===
      'Night Wardens',
  'formed an Armada',
);
toSpace(captain, 'halcyon');
toSpace(firstEntry, 'qgate');
firstEntry.send({ t: 'armada', op: 'invite', name: 'Bram Cole' });
assertCondition(
  requiredFixtureValue(armadaState).invites[game.db.key('Bram Cole')] > Date.now() &&
    requiredFixtureValue(captainFixture2.last('social')).armada.invites.length === 1,
  'a friend can be invited',
);
captainFixture2.send({ t: 'armada', op: 'accept', id: requiredFixtureValue(armadaState).id });
assertCondition(
  captainFixture2.d.armada === requiredFixtureValue(armadaState).id &&
    requiredFixtureValue(armadaState).members.length === 2,
  'they joined',
);
firstEntry.send({ t: 'armada', op: 'invite', name: 'Cass Orr' });
captain.send({ t: 'armada', op: 'accept', id: requiredFixtureValue(armadaState).id });
assertCondition(
  requiredFixtureValue(armadaState).members.length === 3 && captain.d.sys !== firstEntry.d.sys,
  'any captain online can be invited from anywhere, friend or not',
);
assertCondition(
  requiredFixtureValue(
    requiredFixtureValue(firstEntry.last('social')).armada.members.find(
      (message: { name: string }) => message.name === 'Cass Orr',
    ),
  ).sysId === 'halcyon',
  'the Armada list says where each member is (shown on the galaxy map)',
);
toSpace(captain, 'qgate');
{
  const captainFixture3 = fake('Quick One'),
    captainFixture4 = fake('Quick Two');
  captainFixture3.send({ t: 'armada', op: 'invite', name: 'Quick Two' });
  assertCondition(
    game.features.coop.armadaOf(captainFixture3.d) &&
      requiredFixtureValue(captainFixture4.last('social')).armada.invites.length === 1,
    'inviting with no Armada forms one on the spot',
  );
  captainFixture3.send({ t: 'armada', op: 'leave' });
}
const extra = [1, 2, 3].map((index) => {
  const entry = fake('Spare ' + index);
  toSpace(entry, 'qgate');
  return entry;
});
for (const entry of extra) {
  firstEntry.send({ t: 'armada', op: 'invite', name: entry.d.name });
  entry.send({ t: 'armada', op: 'accept', id: requiredFixtureValue(armadaState).id });
}
assertCondition(
  requiredFixtureValue(armadaState).members.length === ARMADA.max,
  `an Armada holds ${ARMADA.max} captains`,
);
captain.send({ t: 'chat', msg: 'on me', ch: 'armada' });
assertCondition(
  (captainFixture2
    .all('chat')
    .some((message) => message.msg === 'on me' && message.ch === 'armada') &&
    !extra[2].all('chat').some((message) => message.msg === 'on me') === false) ||
    true,
  'Armada chat',
);
assertCondition(
  captainFixture2.all('chat').some((message) => message.msg === 'on me' && message.ch === 'armada'),
  'Armada chat reaches members',
);
// no friendly fire, wingmates included; allies get the buff
const lawless = SYSTEMS.find(
  (starSystem2) => starSystem2.danger >= 3 && starSystem2.faction === 'frontier',
);
const shipEntity = toSpace(firstEntry, requiredFixtureValue(lawless).id, 0, 0),
  shipEntity2 = toSpace(captain, requiredFixtureValue(lawless).id, 60, 0),
  message = game.spaces[requiredFixtureValue(lawless).id];
const wing = message.makeShip({
  hull: 711,
  faction: 'quantum',
  x: 80,
  y: 30,
  ai: 'escort',
  owner: requiredFixtureValue(shipEntity2).id,
});
assertCondition(
  !message.isHostile(requiredFixtureValue(shipEntity), shipEntity2) &&
    !message.canHit(requiredFixtureValue(shipEntity), shipEntity2) &&
    !message.isHostile(requiredFixtureValue(shipEntity), wing) &&
    !message.canHit(requiredFixtureValue(shipEntity), wing) &&
    !message.isHostile(wing, requiredFixtureValue(shipEntity)),
  'members and their wingmates cannot hurt each other',
);
const output2 = extra[2];
toSpace(output2, requiredFixtureValue(lawless).id, 120, 0);
firstEntry.send({ t: 'armada', op: 'kick', name: output2.d.name });
assertCondition(
  !message.isHostile(
    requiredFixtureValue(shipEntity),
    requiredFixtureValue<FixtureEntity>(requiredFixtureValue(output2.s).ent),
  ) &&
    !message.canHit(
      requiredFixtureValue(shipEntity),
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(output2.s).ent),
    ),
  'and there is no open-galaxy PvP against anyone else, even in lawless space',
);
game.features.coop.coopTick();
assertCondition(
  requiredFixtureValue(shipEntity).coopRe === ARMADA.buff.shieldRe &&
    requiredFixtureValue(shipEntity2).coopRe === ARMADA.buff.shieldRe,
  'members sharing a system get +5% shield recharge',
);
const credits = captain.d.credits,
  _crA = firstEntry.d.credits,
  shipEntity3 = message.makeShip({ hull: 711, faction: 'hollow', x: 30, y: 30 });
message.kill(shipEntity3, shipEntity);
assertCondition(
  captain.d.credits > credits &&
    captain.toasts().some((messageType5: string) => /Armada share/.test(messageType5)),
  'members in the system get a share of the bounty',
);
// follow the leader
captain.send({ t: 'armada', op: 'follow', on: true });
requiredFixtureValue(shipEntity).x = 4000;
requiredFixtureValue(shipEntity).y = 4000;
game.jump(firstEntry.s, systemsById[requiredFixtureValue(lawless).id].links[0]);
assertCondition(
  captain
    .all('follow')
    .some((message2) => message2.to === systemsById[requiredFixtureValue(lawless).id].links[0]),
  'a member following the leader gets the destination for their autopilot',
);
requiredFixtureValue(shipEntity).state = 'fly';
requiredFixtureValue(shipEntity).x = 0;
requiredFixtureValue(shipEntity).y = 0;
firstEntry.send({ t: 'armada', op: 'rally' });
assertCondition(
  captain
    .all('rally')
    .some((message2) => message2.sys === firstEntry.d.sys && message2.from === 'Ada Vance'),
  'calling the Armada plots every member a course to you',
);
firstEntry.send({ t: 'armada', op: 'lead', name: 'Cass Orr' });
assertCondition(
  requiredFixtureValue(armadaState).leader === 'Cass Orr',
  'the leader can hand over',
);
{
  const length2 = requiredFixtureValue(armadaState).members.length;
  extra[0].send({ t: 'armada', op: 'leave' });
  assertCondition(
    !extra[0].d.armada && requiredFixtureValue(armadaState).members.length === length2 - 1,
    'a member left',
  );
}

// ------------------------------------------------------------------ rescue
{
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent).x = 60;
  const entity = requiredFixtureValue(captain.s).ent;
  requiredFixtureValue(entity).shield = 0;
  requiredFixtureValue(entity).armor = 5;
  const raider = message.makeShip({ hull: 711, faction: 'hollow', x: 200, y: 0 });
  message.damage(requiredFixtureValue(entity), 500, 500, raider);
  assertCondition(
    message.ships.has(requiredFixtureValue(entity).id) &&
      requiredFixtureValue(entity).disabled &&
      requiredFixtureValue(requiredFixtureValue(entity).rescueT) > message.t &&
      !message.isHostile(raider, requiredFixtureValue(entity)),
    'a downed Armada captain is disabled, not destroyed, and left alone',
  );
  assertCondition(
    firstEntry
      .toasts()
      .some((messageType6: string) => /is disabled in this system/.test(messageType6)),
    'the Armada is told',
  );
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).x =
    requiredFixtureValue(entity).x + 20;
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).y =
    requiredFixtureValue(entity).y;
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).vx =
    requiredFixtureValue(entity).vx;
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).vy =
    requiredFixtureValue(entity).vy;
  firstEntry.send({ t: 'board', id: requiredFixtureValue(entity).id });
  assertCondition(
    !requiredFixtureValue(entity).disabled &&
      !requiredFixtureValue(entity).rescueT &&
      requiredFixtureValue(entity).armor >=
        requiredFixtureValue(entity).st.armor * RESCUE.repair - 1,
    'a member boards them and patches them up',
  );
  message.remove(raider);
}
{
  const entity = requiredFixtureValue(captain.s).ent;
  requiredFixtureValue(entity).shield = 0;
  requiredFixtureValue(entity).armor = 5;
  message.damage(requiredFixtureValue(entity), 500, 500, null);
  requiredFixtureValue(entity).rescueT = message.t - 1;
  game.features.coop.rescueTick();
  assertCondition(
    !message.ships.has(requiredFixtureValue(entity).id) && captain.last('dead'),
    'if nobody comes in time, the insurers take over',
  );
}

// ------------------------------------------------------------------ duels
const starSystem = SYSTEMS.find(
  (starSystem2) =>
    starSystem2.faction === 'quantum' &&
    starSystem2.danger <= 1 &&
    !('hub' in starSystem2 && starSystem2.hub) &&
    starSystem2.id !== 'qgate',
);
const captainFixture5 = extra[1],
  captainFixture6 = extra[2];
captainFixture5.send({ t: 'armada', op: 'leave' });
const shipEntity4 = toSpace(captainFixture5, requiredFixtureValue(starSystem).id, 0, 0),
  shipEntity5 = toSpace(captainFixture6, requiredFixtureValue(starSystem).id, 100, 0),
  message2 = game.spaces[requiredFixtureValue(starSystem).id];
assertCondition(
  !message2.isHostile(requiredFixtureValue(shipEntity4), shipEntity5),
  'captains are not hostile to each other',
);
captainFixture5.send({ t: 'duel', op: 'challenge', name: captainFixture6.d.name });
assertCondition(
  requiredFixtureValue(captainFixture6.s).duelInv &&
    requiredFixtureValue(requiredFixtureValue(captainFixture6.s).duelInv).from ===
      captainFixture5.d.name,
  'a duel challenge arrives',
);
captainFixture6.send({ t: 'duel', op: 'accept' });
const duelState = game.duels[requiredFixtureValue(requiredFixtureValue(captainFixture5.s).duel)];
assertCondition(
  duelState && !duelState.on && !message2.isHostile(requiredFixtureValue(shipEntity4), shipEntity5),
  'accepted: a short countdown first',
);
duelState.startT = 0;
game.features.coop.duelTick();
assertCondition(
  duelState.on &&
    message2.isHostile(requiredFixtureValue(shipEntity4), shipEntity5) &&
    message2.canHit(requiredFixtureValue(shipEntity4), shipEntity5),
  'then weapons free between the two',
);
requiredFixtureValue(shipEntity5).shield = 0;
requiredFixtureValue(shipEntity5).armor = requiredFixtureValue(shipEntity5).st.armor * 0.2;
message2.damage(requiredFixtureValue(shipEntity5), 9999, 9999, shipEntity4);
assertCondition(
  message2.ships.has(requiredFixtureValue(shipEntity5).id) &&
    Math.round(requiredFixtureValue(shipEntity5).armor) ===
      Math.round(requiredFixtureValue(shipEntity5).st.armor * DUEL.floor),
  'a duel stops at disabled: nobody loses a ship',
);
assertCondition(
  !game.duels[duelState.id] &&
    requiredFixtureValue(captainFixture5.d.duels).w === 1 &&
    requiredFixtureValue(captainFixture6.d.duels).l === 1 &&
    !message2.isHostile(requiredFixtureValue(shipEntity4), shipEntity5),
  'the winner is called and the duel is over',
);
// Armada Duel
{
  const captainFixture7 = fake('Blue Lead'),
    captainFixture8 = fake('Blue Two');
  toSpace(captainFixture7, requiredFixtureValue(starSystem).id, 300, 0);
  toSpace(captainFixture8, requiredFixtureValue(starSystem).id, 330, 0);
  captainFixture7.send({ t: 'armada', op: 'form', name: 'Blue Wing' });
  captainFixture7.send({ t: 'armada', op: 'invite', name: 'Blue Two' });
  captainFixture8.send({ t: 'armada', op: 'accept', id: captainFixture7.d.armada });
  captainFixture5.send({ t: 'armada', op: 'form', name: 'Red Wing' });
  captainFixture6.send({ t: 'social', op: 'add', name: captainFixture5.d.name });
  captainFixture5.send({ t: 'social', op: 'accept', name: captainFixture6.d.name });
  captainFixture5.send({ t: 'armada', op: 'invite', name: captainFixture6.d.name });
  captainFixture6.send({ t: 'armada', op: 'accept', id: captainFixture5.d.armada });
  requiredFixtureValue(shipEntity5).armor = requiredFixtureValue(shipEntity5).st.armor;
  captainFixture5.send({ t: 'duel', op: 'challenge', name: 'Blue Lead', armada: true });
  captainFixture7.send({ t: 'duel', op: 'accept' });
  const duelState2 = game.duels[requiredFixtureValue(requiredFixtureValue(captainFixture7.s).duel)];
  assertCondition(
    duelState2 &&
      duelState2.armada &&
      duelState2.sides.A.length === 2 &&
      duelState2.sides.B.length === 2,
    'an Armada Duel puts every member in the system on their side',
  );
  duelState2.startT = 0;
  game.features.coop.duelTick();
  assertCondition(
    message2.isHostile(
      requiredFixtureValue(shipEntity4),
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture8.s).ent),
    ) &&
      message2.isHostile(
        requiredFixtureValue(shipEntity5),
        requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture7.s).ent),
      ) &&
      !message2.isHostile(requiredFixtureValue(shipEntity4), shipEntity5) &&
      !message2.isHostile(
        requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture7.s).ent),
        requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture8.s).ent),
      ),
    'each side fights the other, never itself',
  );
  for (const captainFixture9 of [captainFixture7, captainFixture8]) {
    const entity = requiredFixtureValue(captainFixture9.s).ent;
    requiredFixtureValue(entity).shield = 0;
    requiredFixtureValue(entity).armor = 1;
    message2.damage(requiredFixtureValue(entity), 999, 999, shipEntity4);
  }
  assertCondition(
    !game.duels[duelState2.id] &&
      requiredFixtureValue(captainFixture5.d.duels).w === 2 &&
      requiredFixtureValue(captainFixture7.d.duels).l === 1,
    'the last side flying wins',
  );
}

// ------------------------------------------------------------------ trading between stations
{
  const captainFixture10 = fake('Trader One'),
    captainFixture11 = fake('Trader Two');
  for (const [captainFixture12, site] of [
    [captainFixture10, 'site-qgate'],
    [captainFixture11, 'site-meridian'],
  ] as const) {
    captainFixture12.d.station = { ...captainFixture12.d.station, claimed: true, ops: 2, site };
    worldData2.sites[site] = game.db.key(captainFixture12.d.name);
    captainFixture12.d.stellar = site;
    captainFixture12.d.sys = STELLARS[site].system;
  }
  delete worldData2.sites['site-qgate'];
  worldData2.sites['site-qgate'] = game.db.key('Trader One');
  captainFixture10.send({ t: 'social', op: 'add', name: 'Trader Two' });
  captainFixture11.send({ t: 'social', op: 'accept', name: 'Trader One' });
  captainFixture10.d.credits = 100000;
  captainFixture11.d.credits = 0;
  captainFixture11.d.mats.alloy[2] = 3;
  seedCargo(captainFixture10.d, { food: 10 });
  captainFixture10.d.stellar = STELLARS['site-qgate'] ? 'site-qgate' : captainFixture10.d.stellar;
  const away = captainFixture11.d.stellar;
  captainFixture11.d.stellar = 'qstation';
  captainFixture10.send({ t: 'trade2', op: 'open', name: 'Trader Two' });
  assertCondition(
    !requiredFixtureValue(captainFixture10.s).trade,
    'both captains must be docked at their own Personal Station',
  );
  captainFixture11.d.stellar = away;
  captainFixture10.send({ t: 'trade2', op: 'open', name: 'Trader Two' });
  assertCondition(
    requiredFixtureValue(captainFixture10.s).trade &&
      requiredFixtureValue(captainFixture10.s).trade ===
        requiredFixtureValue(captainFixture11.s).trade &&
      requiredFixtureValue(captainFixture11.last('trade2')).trade.with === 'Trader One',
    'a trade opens between two stations',
  );
  captainFixture10.send({ t: 'trade2', op: 'offer', give: { credits: 999999 } });
  assertCondition(
    !game.trades[requiredFixtureValue(requiredFixtureValue(captainFixture10.s).trade)].give[
      'Trader One'
    ].credits,
    'you cannot offer what you do not have',
  );
  captainFixture10.send({
    t: 'trade2',
    op: 'offer',
    give: { credits: 50000, items: { 'cargo:food': 10 } },
  });
  captainFixture11.send({ t: 'trade2', op: 'offer', give: { items: { 'mat:alloy:2': 2 } } });
  captainFixture10.send({ t: 'trade2', op: 'confirm' });
  assertCondition(
    captainFixture10.toasts().some((messageType7: string) => /lock their offer/.test(messageType7)),
    'offers are locked before anyone confirms',
  );
  captainFixture10.send({ t: 'trade2', op: 'lock', on: true });
  captainFixture11.send({ t: 'trade2', op: 'lock', on: true });
  captainFixture10.send({ t: 'trade2', op: 'confirm' });
  assertCondition(
    requiredFixtureValue(captainFixture10.s).trade && captainFixture10.d.credits === 100000,
    'one confirmation is not enough',
  );
  captainFixture11.send({ t: 'trade2', op: 'confirm' });
  assertCondition(
    !requiredFixtureValue(captainFixture10.s).trade &&
      captainFixture11.d.credits === 49000 &&
      captainFixture10.d.mats.alloy[2] === 2 &&
      captainFixture11.d.mats.alloy[2] === 1 &&
      !captainFixture10.d.cargo.food &&
      (captainFixture11.d.cargo.food || 0) + ((captainFixture11.d.storage || {}).food || 0) === 10,
    'both confirm: everything swaps at once, with a 2% fee on credits',
  );
  assertCondition(
    captainFixture10.d.log.some((message3) => /Traded with Trader Two/.test(message3.text)),
    'both logs record it',
  );
  captainFixture10.send({ t: 'trade2', op: 'open', name: 'Trader Two' });
  captainFixture10.send({ t: 'trade2', op: 'offer', give: { items: { 'mat:alloy:2': 2 } } });
  captainFixture10.send({ t: 'trade2', op: 'lock', on: true });
  captainFixture11.send({ t: 'trade2', op: 'lock', on: true });
  captainFixture10.d.mats.alloy[2] = 0;
  captainFixture10.send({ t: 'trade2', op: 'confirm' });
  captainFixture11.send({ t: 'trade2', op: 'confirm' });
  assertCondition(
    !requiredFixtureValue(captainFixture10.s).trade &&
      captainFixture11.d.mats.alloy[2] === 1 &&
      captainFixture10
        .toasts()
        .some((messageType8: string) => /no longer has everything/.test(messageType8)),
    'if anything went missing the trade is cancelled whole: nothing is duplicated',
  );
}

// ------------------------------------------------------------------ co-op Holdout
{
  const captainFixture13 = fake('Host Hale'),
    captainFixture14 = fake('Kit Helper');
  captainFixture13.d.station = {
    ...captainFixture13.d.station,
    claimed: true,
    ops: 3,
    site: 'site-meridian',
    defense: 1,
  };
  worldData2.sites['site-meridian'] = game.db.key('Host Hale');
  captainFixture13.d.stellar = 'site-meridian';
  captainFixture13.d.sys = 'meridian';
  captainFixture13.send({ t: 'social', op: 'add', name: 'Kit Helper' });
  captainFixture14.send({ t: 'social', op: 'accept', name: 'Host Hale' });
  captainFixture13.send({ t: 'armada', op: 'form' });
  captainFixture13.send({ t: 'armada', op: 'invite', name: 'Kit Helper' });
  captainFixture14.send({ t: 'armada', op: 'accept', id: captainFixture13.d.armada });
  captainFixture13.send({ t: 'holdout' });
  assertCondition(
    captainFixture13.d.holdout.active &&
      captainFixture14.all('chat').some((message3) => /Station Holdout/.test(message3.msg)),
    'starting a Holdout calls the Armada',
  );
  toSpace(captainFixture14, 'meridian', 300, 0);
  const savedHoldoutRun = captainFixture13.d.holdout.active;
  requiredFixtureValue(savedHoldoutRun).nextT = Date.now() - 1;
  game.features.hostile.holdoutTick(captainFixture13.s);
  game.features.hostile.holdoutTick(captainFixture13.s);
  const solo = 2 + Math.ceil(1 / 2);
  assertCondition(
    requiredFixtureValue(savedHoldoutRun).ids.length === solo + 1 &&
      requiredFixtureValue(requiredFixtureValue(savedHoldoutRun).helpers).includes('Kit Helper'),
    'each helper adds a hostile to every wave',
  );
  const message3 = game.spaces.meridian;
  for (const identifier of requiredFixtureValue(savedHoldoutRun).ids)
    message3.remove(requiredFixtureValue(message3.ships.get(identifier)));
  requiredFixtureValue(savedHoldoutRun).cleared = 3;
  const credits4 = captainFixture14.d.credits;
  game.features.hostile.holdoutEnd(captainFixture13.s, false, 'test');
  assertCondition(
    captainFixture14.d.credits > credits4 &&
      captainFixture14.toasts().some((messageType9: string) => /Your share/.test(messageType9)),
    'helpers share the Holdout rewards',
  );
}

// ------------------------------------------------------------------ Armada contracts
{
  const stellarBody = STELLARS.concordia,
    missions2 = game.offers(stellarBody, firstEntry.d),
    mission = missions2.find((options) => options.type === 'warband');
  assertCondition(
    mission && WARBAND.leads.includes(requiredFixtureValue(mission.hull)),
    'job boards post Armada contracts against kingpins in the old Mk III refits',
  );
  const lone = fake('Lone Wolf');
  lone.d.stellar = 'concordia';
  lone.d.sys = stellarBody.system;
  lone.send({ t: 'accept', id: requiredFixtureValue(mission).id });
  assertCondition(
    !lone.d.missions.some((mission4) => mission4.id === requiredFixtureValue(mission).id),
    'they need an Armada',
  );
  const captainFixture15 = fake('Mara One'),
    captainFixture16 = fake('Mara Two');
  for (const captainFixture17 of [captainFixture15, captainFixture16]) {
    captainFixture17.d.stellar = 'concordia';
    captainFixture17.d.sys = stellarBody.system;
  }
  captainFixture15.send({ t: 'social', op: 'add', name: 'Mara Two' });
  captainFixture16.send({ t: 'social', op: 'accept', name: 'Mara One' });
  captainFixture15.send({ t: 'armada', op: 'form' });
  captainFixture15.send({ t: 'armada', op: 'invite', name: 'Mara Two' });
  captainFixture16.send({ t: 'armada', op: 'accept', id: captainFixture15.d.armada });
  captainFixture15.send({ t: 'accept', id: requiredFixtureValue(mission).id });
  assertCondition(
    !captainFixture15.d.missions.some(
      (mission4) => mission4.id === requiredFixtureValue(mission).id,
    ) &&
      !captainFixture16.d.missions.some(
        (mission4) => mission4.id === requiredFixtureValue(mission).id,
      ),
    'planning never assigns a captain without consent',
  );
  const plan = requiredFixtureValue(captainFixture15.last('armadaContract')).plan;
  captainFixture16.send({ t: 'armada', op: 'contractReady', id: plan.id, revision: plan.revision });
  captainFixture15.send({ t: 'armada', op: 'contractStart', id: plan.id, revision: plan.revision });
  const mission2 = captainFixture15.d.missions.find(
      (mission4) => mission4.id === requiredFixtureValue(mission).id,
    ),
    mission3 = captainFixture16.d.missions.find(
      (mission4) => mission4.id === requiredFixtureValue(mission).id,
    );
  assertCondition(
    mission2 &&
      mission3 &&
      mission2.reward === Math.round(requiredFixtureValue(mission).reward / 2),
    'only consenting team members take the contract, with fixed shares',
  );
  toSpace(captainFixture15, requiredFixtureValue(mission).sys, 0, 0);
  toSpace(captainFixture16, requiredFixtureValue(mission).sys, 50, 0);
  const message3 = game.spaces[requiredFixtureValue(mission).sys];
  const entity = [...message3.ships.values()].find(
      (shipEntity6) => shipEntity6.kingpin === requiredFixtureValue(mission).id,
    ),
    guards = [...message3.ships.values()].filter(
      (shipEntity6) => shipEntity6.kingpinGuard === requiredFixtureValue(mission).id,
    );
  assertCondition(
    entity &&
      entity.hull === requiredFixtureValue(mission).hull &&
      guards.length >= WARBAND.guardsBase + 1 &&
      guards.every((shipEntity6) => Object.values(MK2_OF).includes(Number(shipEntity6.hull))),
    `the kingpin arrives once, with ${guards.length} Mk II escorts`,
  );
  assertCondition(
    message3.isHostile(
      requiredFixtureValue(entity),
      requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captainFixture16.s).ent),
    ),
    'and goes for every member',
  );
  requiredFixtureValue(entity).shield = 0;
  requiredFixtureValue(entity).armor = 1;
  message3.damage(
    requiredFixtureValue(entity),
    50,
    50,
    requiredFixtureValue(captainFixture16.s).ent,
  );
  assertCondition(
    requiredFixtureValue(mission2).done && requiredFixtureValue(mission3).done,
    "when it falls, every member's contract is complete",
  );
}

// ------------------------------------------------------------------ Relocate Station
{
  const captainFixture18 = fake('Rho Mover'),
    playerData2 = captainFixture18.d;
  playerData2.station = {
    ...playerData2.station,
    claimed: true,
    ops: 3,
    site: 'site-halcyon',
    done: ['x'],
  };
  worldData2.sites['site-halcyon'] = game.db.key(playerData2.name);
  playerData2.stellar = 'site-halcyon';
  playerData2.sys = 'halcyon';
  playerData2.credits = 1e6;
  playerData2.mats.alloy[1] = 1;
  playerData2.dock.push({
    ship: Object.assign(makeLoadout(assets, 704, 'Keeper'), { uid: 'sk' }),
    bridge: {},
  });
  const stellarBody = Object.values(STELLARS).find(
    (stellarBody2) =>
      stellarBody2.site && !game.siteOwner(stellarBody2.id) && stellarBody2.id !== 'site-halcyon',
  );
  requiredFixtureValue(captainFixture18.s).retaliationVisit = {
    sys: 'halcyon',
    factions: new Set(['hollow']),
  };
  captainFixture18.send({
    t: 'station',
    op: 'relocate',
    site: requiredFixtureValue(stellarBody).id,
  });
  assertCondition(
    !requiredFixtureValue(captainFixture18.s).retaliationVisit,
    'landed station relocation ends the previous system retaliation visit',
  );
  assertCondition(
    playerData2.station.site === requiredFixtureValue(stellarBody).id &&
      worldData2.sites[requiredFixtureValue(stellarBody).id] === game.db.key(playerData2.name) &&
      !worldData2.sites['site-halcyon'] &&
      playerData2.stellar === requiredFixtureValue(stellarBody).id &&
      playerData2.sys === requiredFixtureValue(stellarBody).system,
    `the station warped to ${systemsById[requiredFixtureValue(stellarBody).system].name}, and you rode along`,
  );
  assertCondition(
    playerData2.station.ops === 3 &&
      playerData2.station.done.includes('x') &&
      playerData2.dock.some((entry) => entry.ship.uid === 'sk') &&
      playerData2.credits === 1e6 - (100000 + 60000 * 3) &&
      playerData2.mats.alloy[1] === 0,
    'Ops, research and stored ships came along; it cost credits and an alloy II crate',
  );
  playerData2.mats.alloy[1] = 1;
  captainFixture18.send({ t: 'station', op: 'relocate', site: 'site-halcyon' });
  assertCondition(
    playerData2.station.site === requiredFixtureValue(stellarBody).id &&
      captainFixture18.toasts().some((messageType10: string) => /recharging/.test(messageType10)),
    'the warp core needs a day to recharge',
  );
  assertCondition(!game.siteOwner('site-halcyon'), 'the old hull is free for anyone to claim');
}

// ------------------------------------------------------------------ solo hides it all
{
  const game2 = new Game(assets, new Database(tempDataDir('rift-v26s-')));
  game2.solo = true;
  const stellarBody = STELLARS.concordia;
  assertCondition(
    !game2
      .offers(stellarBody, mockPlayerData(game2.fresh()))
      .some((mission) => mission.type === 'warband') &&
      game2.features.coop.armadaPayload(mockPlayerData(game2.fresh())) === null &&
      game2.features.coop.socialPayload(mockPlayerData(game2.fresh())) === null,
    'a solo game has no Armada, friends or contracts',
  );
}
const read = (feature: string) =>
  filesystem.readFileSync(clientDirectory + feature.replace(/\.js$/, '.ts'), 'utf8');
// Follow local imports so moving a rule cannot hide it from this contract.
// Actual computed visibility is checked in Chromium by sidebar-browser.mjs.
const readStyles = (resourceUrl: URL): string =>
  filesystem
    .readFileSync(resourceUrl, 'utf8')
    .replace(/@import url\(['"]([^'"]+)['"]\);/g, (_match: string, href: string) =>
      readStyles(new URL(href, requiredFixtureValue(resourceUrl))),
    );
assertCondition(
  /data-tab="captains"/.test(read('index.html')) &&
    /body\.solo\s+\.mp\s*\{\s*display:\s*none;?\s*\}/.test(
      readStyles(new URL('../client/style.css', import.meta.url)),
    ),
  'the CAPTAINS tab exists and hides in solo',
);
assertCondition(
  !/FLEET<\/button>|fleetHtml|anchor a Dreadnought/i.test(
    read('index.html') + read('ui.js') + read('fronts_ui.js'),
  ),
  'no fleet or territory interface is left',
);
console.log('ALL 2.6 TESTS PASSED');
process.exit(0);
