import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 0.3 tests: weapon colours, hit events with damage, escort slots, disabled wreck clean-up, login throttle, tutorial.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { weaponColor, weaponLook, weaponParams } from '../shared/rules.ts';
import { TUTORIAL } from '../shared/tutorial.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v03-')));
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
function fake(name: string, pass = 'secret', ipAddress = '1.2.3.4') {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, ipAddress);
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
  };
  captain.send({ t: 'hello', name, pass });
  return captain;
}
// colours
const black = Object.values(assets.weapons).filter(
  (weapon) => /^#0{6}$/i.test(weaponColor(weapon)) || /^#0{6}$/i.test(weaponParams(weapon).color),
);
assertCondition(black.length === 0, 'no weapon draws black (was 30)');
assertCondition(
  weaponLook(assets.weapons[197]) === 'rail' &&
    weaponLook(assets.weapons[350]) === 'sing' &&
    weaponLook(assets.weapons[128]) === 'bolt',
  'projectile looks by weapon class',
);
assertCondition(
  weaponColor(assets.weapons[132]) !== '#000000',
  'Concordance heavy blaster turrets are coloured: ' + weaponColor(assets.weapons[132]),
);
// hit events
const firstEntry = fake('Tester');
const playerData = requiredFixtureValue(firstEntry.s).data;
firstEntry.send({ t: 'depart' });
const space = game.spaces[playerData.sys];
const shipEntity = space.makeShip({
  hull: 705,
  faction: 'hollow',
  x: requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).x + 200,
  y: requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).y,
  ai: 'raid',
});
space.events = [];
const result = space.damage(shipEntity, 5, 20, requiredFixtureValue(firstEntry.s).ent);
space.hitEv(shipEntity.x, shipEntity.y, 128, shipEntity, result);
const event = space.events.find((entity) => entity[0] === 'hit');
assertCondition(
  event &&
    event[4] === shipEntity.id &&
    typeof event[5] === 'number' &&
    event[5] > 0 &&
    event[6] === requiredFixtureValue<FixtureEntity>(requiredFixtureValue(firstEntry.s).ent).id &&
    event[7] === 1,
  `hit event carries target, damage ${event && event[5]}, shooter, shield flag`,
);
// escort slots are unique
const owner = space.makeShip({ hull: 708, faction: 'quantum', x: 0, y: 0, ai: 'patrol' });
const entitys = [0, 1, 2, 3].map(() =>
  space.makeShip({ hull: 705, faction: 'quantum', x: 10, y: 10, ai: 'escort', owner: owner.id }),
);
for (let index = 0; index < 3; index++)
  for (const shipEntity2 of entitys) {
    shipEntity2.think = 0;
    space.ai(shipEntity2);
  }
assertCondition(
  new Set(entitys.map((shipEntity2) => shipEntity2.slot)).size === 4,
  'four escorts take four different formation slots',
);
// disabled wrecks are towed away
const wreck = space.makeShip({ hull: 705, faction: 'hollow', x: 900, y: 900, ai: 'raid' });
wreck.armor = 1;
space.ai(wreck);
assertCondition(wreck.disabled, 'wreck is disabled');
space.t += 80;
space.ai(wreck);
assertCondition(!space.ships.has(wreck.id), 'unboarded wreck leaves after 75 s');
// tutorial
assertCondition(playerData.tut === 0, 'new captain starts the tutorial');
const credits = playerData.credits;
firstEntry.send({ t: 'target', id: shipEntity.id });
assertCondition(
  playerData.tut === 1 && playerData.credits === credits + TUTORIAL[0].reward,
  'targeting a ship completes goal 1',
);
firstEntry.send({ t: 'tutskip' });
assertCondition(playerData.tut === TUTORIAL.length, 'tutorial can be skipped');
// login throttle
for (let index = 0; index < 6; index++) fake('Tester', 'wrong!', '9.9.9.9');
const captainFixture = fake('Tester', 'secret', '9.9.9.9');
assertCondition(
  captainFixture.last('error') &&
    /Too many/.test(requiredFixtureValue(captainFixture.last('error')).msg),
  'six bad passwords lock the name for a while',
);
console.log('ALL 0.3 TESTS PASSED');
process.exit(0);
