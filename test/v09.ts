import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.9 tests: hostile levels, loot chests (2.6: no directives or solo armadas), Station Holdout, weekly events, the Umbral Eclipse.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYSTEMS } from '../shared/galaxy.ts';
import { levelOf, winOdds, HOLDOUT } from '../shared/hostile.ts';
import { eventAt, eventCalendar, EVENTS } from '../shared/fronts.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v09-')));
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
let ipAddress = 1;
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '10.0.0.' + ipAddress++);
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
    toasts: () =>
      legacySocket2.out
        .filter((message: { t: string }) => message.t === 'toast')
        .map((message) => message.msg),
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
const toSpace = (
  captain: ReturnType<typeof fake>,
  starSystem: string,
  horizontalPosition = 0,
  verticalPosition = 0,
) => {
  const playerData = requiredFixtureValue(captain.s).data;
  if (requiredFixtureValue(captain.s).ent) {
    const space = game.spaces[playerData.sys];
    space.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent));
    space.players--;
    requiredFixtureValue(captain.s).ent = null;
  }
  playerData.sys = starSystem;
  playerData.stellar = null;
  game.spawnPlayer(captain.s, horizontalPosition, verticalPosition, 0, 0);
  return requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent);
};
// levels
assertCondition(
  levelOf(5) < levelOf(80) && levelOf(80) < levelOf(900) && levelOf(900) < levelOf(16000),
  `levels rise with strength (${[5, 80, 900, 16000].map(levelOf).join(', ')})`,
);
assertCondition(
  winOdds(900, 30) > 0.9 && winOdds(30, 900) < 0.1 && Math.abs(winOdds(100, 100) - 0.5) < 1e-9,
  'the scan odds favour the stronger ship',
);
const firstEntry = fake('Hunter'),
  playerData = requiredFixtureValue(firstEntry.s).data;
playerData.credits = 5e7;
for (const message of ['alloy', 'crystal', 'isotope'])
  playerData.mats[message] = [20, 20, 20, 20, 20];
const starSystem = SYSTEMS.find((starSystem3) => starSystem3.faction === 'hollow'),
  entity = toSpace(firstEntry, requiredFixtureValue(starSystem).id),
  message = game.spaces[requiredFixtureValue(starSystem).id];
const shipEntity = message.makeShip({ hull: 716, faction: 'hollow', x: 100, y: 0 });
assertCondition(
  shipEntity.pw > 0 &&
    requiredFixtureValue(
      message.snapshot().ships.find((result) => result[0] === shipEntity.id),
    )[13] === shipEntity.pw,
  'every ship carries its effective strength to the client (for levels)',
);
// chests
let chest = null;
for (let index = 0; index < 40 && !chest; index++) {
  const shipEntity2 = message.makeShip({ hull: 711, faction: 'hollow', x: 60, y: 0 });
  message.kill(shipEntity2, entity);
  chest = message.loot.find((linkedSystemId) => linkedSystemId.it.chest);
}
assertCondition(
  chest && chest.it.chest === 'hollow' && requiredFixtureValue(chest.it.lvl) > 0,
  `Hollow ships drop Hollow Caches (Lv ${requiredFixtureValue(chest).it.lvl})`,
);
const credits = playerData.credits;
requiredFixtureValue(entity).x = requiredFixtureValue(chest).x;
requiredFixtureValue(entity).y = requiredFixtureValue(chest).y;
message.tick();
assertCondition(
  playerData.credits > credits &&
    firstEntry.toasts().some((toastText: string) => /Hollow Cache/.test(toastText)),
  'opening a cache pays credits, a crate and maybe blueprints',
);
// 2.6: directives no longer drop and solo armadas are gone
assertCondition(
  !firstEntry.toasts().some((toastText2: string) => /Directive/.test(toastText2)) &&
    playerData.directives === undefined,
  'caches never hold directives',
);
playerData.ship.hull = 736;
// holdout
Object.assign(playerData.station, { claimed: true, ops: 4, site: 'site-meridian', defense: 2 });
game.db.world.sites['site-meridian'] = game.db.key(playerData.name);
game.spaces.qgate.remove(
  requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent),
);
game.spaces.qgate.players--;
requiredFixtureValue(firstEntry.s).ent = null;
playerData.sys = 'meridian';
playerData.stellar = 'site-meridian';
firstEntry.send({ t: 'holdout' });
assertCondition(
  playerData.holdout.active && requiredFixtureValue(firstEntry.s).ent,
  'started a Holdout: you launch to defend the station',
);
requiredFixtureValue(playerData.holdout.active).nextT = Date.now() - 1;
game.features.hostile.holdoutTick(firstEntry.s);
game.features.hostile.holdoutTick(firstEntry.s);
const message2 = game.spaces.meridian,
  plats = [...message2.ships.values()].filter((shipEntity2) => shipEntity2.platform);
assertCondition(
  plats.length === HOLDOUT.platforms(2) &&
    plats.every(
      (player) =>
        !message2.isHostile(
          player,
          requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent),
        ),
    ),
  `${plats.length} defense platforms deploy on your side`,
);
assertCondition(
  requiredFixtureValue(playerData.holdout.active).wave === 1 &&
    requiredFixtureValue(playerData.holdout.active).ids.length >= 2,
  `wave 1: ${requiredFixtureValue(playerData.holdout.active).ids.length} hostiles`,
);
for (let weapon = 1; weapon <= 3; weapon++) {
  for (const identifier of requiredFixtureValue(playerData.holdout.active).ids) {
    const entry = message2.ships.get(identifier);
    if (entry) message2.kill(entry, requiredFixtureValue(firstEntry.s).ent);
  }
  game.features.hostile.holdoutTick(firstEntry.s);
  if (weapon < 3) {
    requiredFixtureValue(playerData.holdout.active).nextT = Date.now() - 1;
    game.features.hostile.holdoutTick(firstEntry.s);
  }
}
assertCondition(
  requiredFixtureValue(playerData.holdout.active).cleared === 3,
  'cleared three waves',
);
const credits4 = playerData.credits;
message2.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent));
message2.players--;
requiredFixtureValue(firstEntry.s).ent = null;
game.features.hostile.holdoutTick(firstEntry.s);
assertCondition(
  !playerData.holdout.active &&
    playerData.holdout.best === 3 &&
    playerData.credits > credits4 &&
    !plats.some((shipEntity2) => message2.ships.has(shipEntity2.id)),
  'leaving ends the Holdout: paid for three waves, platforms withdrawn',
);
playerData.stellar = 'site-meridian';
firstEntry.send({ t: 'holdout' });
assertCondition(!playerData.holdout.active, 'Holdouts have a cooldown');
// weekly events
assertCondition(
  EVENTS.length === 7 && new Set(EVENTS.map((entity4) => entity4.day)).size === 7,
  'a themed event for each day of the week',
);
const sunPosition = Date.UTC(2026, 9, 18, 12),
  thursdayTimestamp = Date.UTC(2026, 9, 15, 12),
  goldSat = Date.UTC(2026, 10, 7, 12);
assertCondition(
  requiredFixtureValue(eventAt(sunPosition)).id === 'swarm' &&
    requiredFixtureValue(eventAt(thursdayTimestamp)).id === 'eclipse' &&
    requiredFixtureValue(eventAt(goldSat)).id === 'gold',
  'Swarm Sunday, Umbral Eclipse Thursday, and the Gold Vein weekend',
);
assertCondition(eventCalendar().length === 7, 'the calendar shows the coming week');
// eclipse
const starSystem2 =
    SYSTEMS.find((starSystem3) => starSystem3.faction === 'deep' && starSystem3.danger >= 3) ||
    SYSTEMS.find((starSystem3) => starSystem3.faction === 'umbral'),
  message3 = game.spaces[requiredFixtureValue(starSystem2).id];
let errorCount = false;
for (let index = 0; index < 120 && !errorCount; index++) {
  message3.spawnTraffic(false);
  errorCount = [...message3.ships.values()].some(
    (shipEntity2) => shipEntity2.faction === 'eclipse',
  );
}
assertCondition(errorCount, `Umbral Eclipse cells roam ${requiredFixtureValue(starSystem2).name}`);
const existingEclipse = [...message3.ships.values()].filter((ship) => ship.faction === 'eclipse');
assertCondition(
  existingEclipse.length >= 3 && existingEclipse.length <= 4,
  'Deep exception is one bounded Eclipse cell',
);
for (let index = 0; index < 120; index++) message3.spawnTraffic(false);
assertCondition(
  [...message3.ships.values()].filter((ship) => ship.faction === 'eclipse').length ===
    existingEclipse.length,
  'repeated traffic polls cannot stack Eclipse cells in the Deep',
);
assertCondition(
  [...message3.ships.values()].some((ship) => ship.faction === 'nhal'),
  'native Nhal remain present beside the tagged event encounter',
);
assertCondition(
  [...message3.ships.values()].every((ship) => ['nhal', 'eclipse'].includes(ship.faction)),
  'the tagged exception never restores ordinary Umbral or Hollow Deep traffic',
);
console.log('ALL 0.9 TESTS PASSED');
process.exit(0);
