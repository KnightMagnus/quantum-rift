import { mockPlayerData } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 1.0 tests: the Que'vari storyline and the Deep gate (part 1). Career, solo mode and balance follow in later sections.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS, SYSTEMS } from '../shared/galaxy.ts';
import { STORY } from '../shared/story.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v10-')));
export const assertCondition = (condition: unknown, message: string) => {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('ok -', message);
};
let ipAddress = 1;
export function fake(name: string, game3 = game) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  legacySocket2.out = [];
  legacySocket2.send = (message: string) =>
    legacySocket2.out.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game3.connect(legacySocket2, '11.0.0.' + ipAddress++);
  const session = [...game3.sessions.values()].pop();
  const captain = {
    sock: legacySocket2,
    s: session,
    send: (message: Record<string, unknown>) =>
      legacySocket2.emit('message', JSON.stringify(message)),
    last: (messageType: string) =>
      [...legacySocket2.out].reverse().find((message) => message.t === messageType),
    all: (messageType2: string) =>
      legacySocket2.out.filter((message) => message.t === messageType2),
  };
  captain.send({ t: 'hello', name, pass: 'secret' });
  return captain;
}
const land = (captain: ReturnType<typeof fake>, sessionId: string) => {
  const playerData = requiredFixtureValue(captain.s).data,
    player = STELLARS[sessionId];
  if (requiredFixtureValue(captain.s).ent) {
    const space = game.spaces[playerData.sys];
    space.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent));
    space.players--;
    requiredFixtureValue(captain.s).ent = null;
  }
  playerData.sys = player.system;
  playerData.stellar = sessionId;
  game.landed(requiredFixtureValue(captain.s));
  game.features.story.storyOnLand(requiredFixtureValue(captain.s), player);
};
const toSpace = (captain: ReturnType<typeof fake>, starSystem: string) => {
  const playerData = requiredFixtureValue(captain.s).data;
  if (requiredFixtureValue(captain.s).ent) {
    const message = game.spaces[playerData.sys];
    message.remove(requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent));
    message.players--;
    requiredFixtureValue(captain.s).ent = null;
  }
  playerData.sys = starSystem;
  playerData.stellar = null;
  game.spawnPlayer(requiredFixtureValue(captain.s), 0, 0, 0, 0);
  return requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent);
};
const firstEntry = fake('Lightbearer'),
  playerData = requiredFixtureValue(firstEntry.s).data;
playerData.credits = 1e6;
playerData.ship.hull = 736;
// the Deep is locked until the Que'vari charts
const deep = SYSTEMS.find(
    (starSystem) =>
      starSystem.faction === 'deep' &&
      starSystem.links.some((linkedSystemId) => systemsById[linkedSystemId].faction !== 'deep'),
  ),
  edge =
    systemsById[
      requiredFixtureValue(
        requiredFixtureValue(deep).links.find(
          (linkedSystemId2) => systemsById[linkedSystemId2].faction !== 'deep',
        ),
      )
    ];
const shipEntity = toSpace(firstEntry, edge.id);
requiredFixtureValue(shipEntity).x = 3000;
requiredFixtureValue(shipEntity).y = 3000;
firstEntry.send({ t: 'jump', to: requiredFixtureValue(deep).id });
assertCondition(
  requiredFixtureValue(shipEntity).state === 'fly' &&
    firstEntry
      .all('toast')
      .some((toastMessage: { msg: string }) => /Deep is uncharted/.test(toastMessage.msg)),
  'the Deep is locked until the story opens it',
);
assertCondition(
  STORY.length === 13 &&
    STORY.slice(0, 5).length === 5 &&
    STORY.every((session) => STELLARS[session.at]),
  'five original story missions and eight continuation missions, all offered at real worlds',
);
land(firstEntry, 'threshold');
const legacyPacket = firstEntry.last('story');
assertCondition(
  legacyPacket && legacyPacket.id === 'qv1' && /Sel'ani/.test(legacyPacket.text),
  'landing at the Threshold Spire offers the first story mission in a pop-up',
);
assertCondition(
  requiredFixtureValue(firstEntry.last('landed')).story &&
    requiredFixtureValue(firstEntry.last('landed')).story.id === 'qv1',
  'and it shows as a golden card on the job board',
);
firstEntry.send({ t: 'storyacc', id: 'qv1' });
assertCondition(
  playerData.story.active && playerData.story.active.id === 'qv1',
  "accepted: carry Sel'ani to Ina Lumen",
);
const credits = playerData.credits;
land(firstEntry, 'inalumen');
assertCondition(
  playerData.story.done.includes('qv1') &&
    playerData.credits === credits + STORY[0].pay &&
    firstEntry.all('story').some((message) => message.id === 'qv1' && message.done),
  'delivered: paid, with the story conclusion pop-up',
);
const legacyPacket2 = firstEntry
  .all('story')
  .filter((message: { id: string }) => message.id === 'qv2')
  .pop();
assertCondition(legacyPacket2 && !legacyPacket2.done, 'and the next mission is offered right away');
firstEntry.send({ t: 'storyacc', id: 'qv2' });
const shipEntity2 = toSpace(firstEntry, 'dimmer'),
  message = game.spaces.dimmer;
const sloops = [...message.ships.values()].filter((shipEntity3) => shipEntity3.storyBoard);
assertCondition(
  sloops.length === 3 && sloops.every((shipEntity3) => shipEntity3.disabled),
  'three becalmed sloops wait in Dimmer Reach',
);
for (const entity of sloops) {
  requiredFixtureValue(shipEntity2).x = entity.x + 20;
  requiredFixtureValue(shipEntity2).y = entity.y;
  requiredFixtureValue(shipEntity2).vx = entity.vx;
  requiredFixtureValue(shipEntity2).vy = entity.vy;
  firstEntry.send({ t: 'board', id: entity.id, act: 'rescue' });
}
assertCondition(
  requiredFixtureValue(playerData.story.active).ready,
  'boarded and rescued all three',
);
land(firstEntry, 'inalumen');
assertCondition(playerData.story.done.includes('qv2'), 'Becalmed complete');
playerData.rep.quevari = 10;
const length2 = firstEntry.all('story').length;
land(firstEntry, 'inalumen');
assertCondition(
  firstEntry.all('story').length === length2 &&
    /standing/.test(requiredFixtureValue(firstEntry.last('landed')).story.locked || ''),
  'the elders want more standing before the next mission',
);
playerData.rep.quevari = 30;
land(firstEntry, 'inalumen');
firstEntry.send({ t: 'storyacc', id: 'qv3' });
toSpace(firstEntry, 'shoalight');
const hunters = [...game.spaces.shoalight.ships.values()].filter(
  (shipEntity3) => shipEntity3.storyKill,
);
assertCondition(hunters.length === 4, 'four Umbral hunters close in at Shoalight');
for (const shipEntity3 of hunters)
  game.spaces.shoalight.kill(shipEntity3, requiredFixtureValue(firstEntry.s).ent);
assertCondition(requiredFixtureValue(playerData.story.active).ready, 'all four destroyed');
land(firstEntry, 'inalumen');
assertCondition(
  playerData.story.done.includes('qv3') &&
    !game.features.story.deepLocked(playerData, requiredFixtureValue(deep).id),
  'Shades on the Wind complete, and the Deep is open',
);
playerData.rep.quevari = 60;
land(firstEntry, 'inalumen');
firstEntry.send({ t: 'storyacc', id: 'qv4' });
const shipEntity3 = toSpace(firstEntry, 'umbra'),
  message2 = game.spaces.umbra;
const anchor = [...message2.ships.values()].find((shipEntity4) => shipEntity4.storyKill),
  allies = [...message2.ships.values()].filter((shipEntity4) => shipEntity4.storyAlly);
assertCondition(
  anchor &&
    anchor.hull === 764 &&
    allies.length === 4 &&
    allies.every(
      (shipEntity4) => !message2.isHostile(shipEntity4, requiredFixtureValue(shipEntity3)),
    ),
  "the Night Anchor waits in Umbra, and four Que'vari choirs fight beside you",
);
requiredFixtureValue(anchor).shield = 0;
requiredFixtureValue(anchor).armor = 1;
message2.damage(requiredFixtureValue(anchor), 10, 10, shipEntity3);
assertCondition(
  requiredFixtureValue(playerData.story.active).ready,
  'the Night Anchor is destroyed',
);
land(firstEntry, 'inalumen');
assertCondition(playerData.story.done.includes('qv4'), 'The Night Anchor complete');
const _old = playerData.ship.hull;
land(firstEntry, 'inalumen');
firstEntry.send({ t: 'storyacc', id: 'qv5' });
assertCondition(
  playerData.ship.hull === 744 &&
    playerData.story.done.includes('qv5') &&
    playerData.story.step === 5,
  'the final reward is yours',
);
assertCondition(
  !game.features.story.storyOffer(playerData, STELLARS.inalumen),
  'the story is complete',
);
console.log('ok - (story section done)');
// --- solo mode
const sdir = tempDataDir('rift-v10solo-'),
  soloDatabase = new Database(sdir),
  solo = new Game(assets, soloDatabase);
solo.solo = true;
const captainFixture = fake('Lone Wolf', solo);
assertCondition(
  captainFixture.last('welcome') && !captainFixture.last('error'),
  'solo mode: no password needed',
);
assertCondition(
  solo.slots().some((entry) => entry.name === 'Lone Wolf'),
  'the new captain appears as a save slot',
);
const captainFixture2 = fake('Lone Wolf', solo);
assertCondition(captainFixture2.last('welcome'), 'and loads again without a password');
captainFixture2.send({ t: 'pause' });
assertCondition(
  solo.paused && requiredFixtureValue(captainFixture2.last('paused')).on,
  'P pauses the solo game',
);
const tickN2 = solo.tickN;
solo.tick();
assertCondition(solo.tickN === tickN2, 'nothing moves while paused');
captainFixture2.send({ t: 'pause' });
assertCondition(!solo.paused, 'and P resumes');
const save = JSON.parse(JSON.stringify(solo.db.get('Lone Wolf')));
delete save.salt;
delete save.hash;
save.name = 'Second Wolf';
save.credits = 123456;
assertCondition(
  solo.importSave(save) === 'Second Wolf' &&
    requiredFixtureValue(solo.db.get('Second Wolf')).credits === 123456,
  'a save file loads as a new slot',
);
let threw = false;
try {
  solo.importSave(Object.assign(mockPlayerData({}), { hello: 1 }));
} catch {
  threw = true;
}
assertCondition(threw, 'junk files are refused');
soloDatabase.dirty = true;
soloDatabase.flush();
soloDatabase.backup();
assertCondition(
  filesystem.readdirSync(sdir + '/backups').length >= 1 &&
    filesystem.existsSync(
      sdir + '/backups/' + filesystem.readdirSync(sdir + '/backups')[0] + '/players.json',
    ),
  'rolling backups are written to data/backups',
);
const captainFixture3 = fake('Online Only');
captainFixture3.send({ t: 'pause' });
assertCondition(!game.paused, 'pause only works in solo mode');
// --- career guide
const { TUTORIAL } = await import('../shared/tutorial.ts');
assertCondition(TUTORIAL.length === 23, 'the career guide has twenty-three goals (2.5)');
const captainFixture4 = fake('Rookie'),
  playerData2 = requiredFixtureValue(captainFixture4.s).data;
assertCondition(playerData2.tut === 0, 'new captains start the career at goal 1');
playerData2.tut = 5;
Object.assign(playerData2.station, { claimed: true, site: 'site-halcyon' });
game.idleCheck(requiredFixtureValue(captainFixture4.s));
assertCondition(playerData2.tut === 6, 'state goals complete on their own (claimed a hull)');
console.log('ALL 1.0 TESTS PASSED');
process.exit(0);
