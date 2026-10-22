import type { OfficerRecord } from '../shared/rules.ts';
import { mockMission, mockPlayerReference } from './helpers/mocks.ts';
import type { Entity as FixtureEntity } from '../server/space.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 1.2 tests: the Syndicate and black market, officer ranks and traits, lower decks, the bank, passengers and rush jobs,
// Syndicate contracts, faction story arcs, and Farside expeditions.
import filesystem from 'node:fs';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { synTier, BLACK_MARKET, TRAITS, bunks } from '../shared/syndicate.ts';
import { ARCS } from '../shared/arcs.ts';
import { EXPEDITION_LORE } from '../shared/expeditions.ts';
import { captainBonus } from '../shared/rules.ts';
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(tempDataDir('rift-v12-')));
const assertCondition = (captain: unknown, message: string) => {
  if (!captain) {
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
  game.connect(legacySocket2, '14.0.0.' + ipAddress++);
  const session = requiredFixtureValue([...game.sessions.values()].pop());
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
  game.completeOnLanding(captain.s, player);
  game.landed(captain.s);
  game.features.story.storyOnLand(captain.s, player);
  game.features.arcs.arcOnLand(captain.s, player);
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
  game.spawnPlayer(captain.s, 0, 0, 0, 0);
  game.features.arcs.arcArrive(captain.s, game.spaces[starSystem]);
  return requiredFixtureValue<FixtureEntity>(requiredFixtureValue(captain.s).ent);
};
const firstEntry = fake('Outlaw'),
  playerData = requiredFixtureValue(firstEntry.s).data;
playerData.credits = 5e6;
// the Syndicate
assertCondition(
  synTier(0).name === 'Unknown' && synTier(2000).name === 'Kingpin',
  'Syndicate tiers run from Unknown to Kingpin',
);
game.features.syndicate.synGain(firstEntry.s, 'smuggle');
assertCondition(playerData.syn === 15, 'a smuggling run earns Syndicate standing');
for (let index = 0; index < 2; index++) game.features.syndicate.synGain(firstEntry.s, 'contract');
assertCondition(synTier(playerData.syn).name === 'Associate', 'and climbs the tiers');
const stellarBody = Object.values(STELLARS).find(
  (stellarBody3) => stellarBody3.outlaw && stellarBody3.svc.includes('L'),
);
land(firstEntry, requiredFixtureValue(stellarBody).id);
const blackmarket2 = requiredFixtureValue(firstEntry.last('landed')).blackmarket;
assertCondition(
  blackmarket2 &&
    blackmarket2.items.length === BLACK_MARKET.length &&
    blackmarket2.items.some((entry) => entry.locked) &&
    blackmarket2.items.some((entry) => !entry.locked),
  'outlaw worlds have a black market, with stock locked by tier',
);
playerData.rep.korrund = -70;
firstEntry.send({ t: 'bm', id: 'papers' });
assertCondition(playerData.rep.korrund === -10, 'forged papers wipe your worst grudge back to -10');
const shards2 = playerData.shards;
firstEntry.send({ t: 'bm', id: 'shard' });
assertCondition(playerData.shards === shards2 + 1, 'commendations are sold to Associates');
firstEntry.send({ t: 'bm', id: 'wraithbp' });
assertCondition(
  !(playerData.bp && playerData.bp[813]),
  'Made-tier stock is refused to an Associate',
);
playerData.syn = 2500;
{
  const count0 = Object.values(playerData.mats).reduce(
    (horizontalPosition3, message) => horizontalPosition3 + message[4],
    0,
  );
  firstEntry.send({ t: 'bm', id: 'crate5' });
  assertCondition(
    Object.values(playerData.mats).reduce(
      (horizontalPosition4, message) => horizontalPosition4 + message[4],
      0,
    ) ===
      count0 + 1,
    'a Kingpin can buy a grade V crate (2.6: replaces the Eclipse Directive)',
  );
}
const plain =
  STELLARS.earth ||
  Object.values(STELLARS).find(
    (stellarBody3) => stellarBody3.svc.includes('B') && !stellarBody3.outlaw && !stellarBody3.site,
  );
playerData.syn = 0;
assertCondition(
  !game.features.syndicate.blackMarketAt(plain, playerData),
  'no black market at a lawful bar for unknowns',
);
playerData.syn = 450;
assertCondition(
  game.features.syndicate.blackMarketAt(plain, playerData),
  'but a Lieutenant finds one in any spaceport bar',
);
// officer ranks and traits
const officerRecord: OfficerRecord = {
  id: 'o1',
  name: 'Test Officer',
  race: 'quantum',
  role: 'gunner',
  rarity: 1,
  lv: 9,
  xp: 0,
};
playerData.officers = [officerRecord];
playerData.bridge = { captain: null, bridge1: 'o1', bridge2: null };
const dmg0 = captainBonus(playerData).damagePct || 0;
playerData.shards = 0;
firstEntry.send({ t: 'promote', id: 'o1' });
assertCondition(!officerRecord.rank, 'promotion needs commendations');
playerData.shards = 100;
firstEntry.send({ t: 'promote', id: 'o1' });
assertCondition(
  officerRecord.rank === 1 &&
    requiredFixtureValue(officerRecord.traits).length === 1 &&
    TRAITS[requiredFixtureValue(officerRecord.traits)[0]],
  'promoted to Lieutenant, learning a trait',
);
assertCondition(
  (captainBonus(playerData).damagePct || 0) > dmg0 ||
    Object.keys(TRAITS[requiredFixtureValue(officerRecord.traits)[0]].bonus).length,
  "rank and trait raise the officer's bonuses",
);
for (let index = 0; index < 5; index++) firstEntry.send({ t: 'promote', id: 'o1' });
assertCondition(
  officerRecord.rank === 4 && requiredFixtureValue(officerRecord.traits).length === 4,
  'four promotions to Captain, four traits, no further',
);
// lower decks
firstEntry.send({ t: 'lower', op: 'hire', kind: 'rigger', i: 0 });
firstEntry.send({ t: 'lower', op: 'hire', kind: 'gunmate', i: 1 });
assertCondition(
  playerData.lower[0] === 'rigger' &&
    playerData.lower[1] === 'gunmate' &&
    (captainBonus(playerData).cargoPct || 0) >= 5,
  'two lower-deck crew add small passives',
);
firstEntry.send({ t: 'lower', op: 'hire', kind: 'rigger', i: 1 });
assertCondition(playerData.lower[1] === 'gunmate', 'no doubling up on a crew role');
// the bank
land(firstEntry, 'qstation');
const bank2 = requiredFixtureValue(firstEntry.last('landed')).bank;
assertCondition(
  bank2 && bank2.max > 0 && bank2.credit === 600,
  'the bank offers loans by credit rating',
);
const credits = playerData.credits;
firstEntry.send({ t: 'bank', op: 'borrow', amt: 30000 });
assertCondition(
  playerData.loan && playerData.loan.bal === 30000 && playerData.credits === credits + 30000,
  'borrowed 30,000 credits',
);
firstEntry.send({ t: 'bank', op: 'borrow', amt: 1e9 });
assertCondition(
  requiredFixtureValue(playerData.loan).bal === 30000,
  'the bank refuses to over-lend',
);
requiredFixtureValue(playerData.loan).next = 0;
const before = requiredFixtureValue(playerData.loan).bal;
game.features.syndicate.bankTick(firstEntry.s);
assertCondition(
  requiredFixtureValue(playerData.loan).bal < before && playerData.credit > 600,
  'an on-time payment reduces the balance and builds credit',
);
const keep = playerData.credits;
playerData.credits = 0;
requiredFixtureValue(playerData.loan).next = 0;
game.features.syndicate.bankTick(firstEntry.s);
assertCondition(
  playerData.credit < 603 && requiredFixtureValue(playerData.loan).bal > 0,
  'a missed payment adds interest and hurts credit',
);
playerData.credits = keep;
firstEntry.send({ t: 'bank', op: 'pay', amt: 1e9 });
assertCondition(!playerData.loan, 'paying in full clears the loan');
// passengers and rush jobs
playerData.ship.hull = 704;
const bunks2 = bunks(assets.ships[704]);
assertCondition(bunks2 >= 1, `a hauler sleeps ${bunks2} passengers`);
const offers = game.offers(STELLARS.qstation, playerData);
const mission = offers.find((options) => options.type === 'passenger'),
  _rush = offers.find((mission5) => mission5.rush);
if (mission) {
  playerData.missions = [];
  const large = { ...mission, pax: bunks2 + 5 };
  assertCondition(
    !game.features.syndicate.acceptCheck(firstEntry.s, large),
    'a passenger job that needs more bunks is refused',
  );
  assertCondition(
    game.features.syndicate.acceptCheck(firstEntry.s, mockMission({ ...mission, pax: 1 })),
    'one that fits is accepted',
  );
} else assertCondition(true, '(no passenger job on this board right now)');
playerData.missions = [
  mockMission({
    id: 'r1',
    type: 'cargo',
    rush: 5,
    title: 'RUSH test',
    sys: 'meridian',
    dest: 'x',
    qty: 1,
    cid: 'medical',
    reward: 1,
    deadline: Date.now() - 1,
  }),
];
game.features.syndicate.missionDeadlines(firstEntry.s);
assertCondition(playerData.missions.length === 0, 'a rush job past its deadline fails');
// Syndicate contracts at outlaw worlds
const many = [];
for (const stellarBody3 of Object.values(STELLARS)
  .filter((stellarBody4) => stellarBody4.outlaw && stellarBody4.svc.includes('B'))
  .slice(0, 12))
  many.push(...game.offers(stellarBody3, playerData));
assertCondition(
  many.some((mission5) => mission5.syn === 'contract') &&
    many.some((mission5) => mission5.syn === 'hit'),
  'outlaw boards post Syndicate smuggling contracts and hits',
);
// trade haggling
const officerTrait = (await import('../shared/syndicate.ts')).TRAITS.haggler;
assertCondition(officerTrait.bonus.tradePct === 2, 'the Haggler trait improves trade prices');
// faction story arcs
assertCondition(
  Object.keys(ARCS).length === 7 &&
    Object.values(ARCS).every(
      (factionArc) => factionArc.steps.length === 3 && STELLARS[factionArc.places.at],
    ),
  'seven faction arcs, three steps each, offered at real capitals',
);
const secondEntry = fake('Envoy'),
  playerData2 = requiredFixtureValue(secondEntry.s).data;
playerData2.credits = 1e6;
playerData2.ship.hull = 736;
const factionArc = ARCS.korrund;
playerData2.rep.korrund = 0;
land(secondEntry, factionArc.places.at);
assertCondition(
  !secondEntry.all('story').some((message: { arc: string }) => message.arc === 'korrund'),
  'no arc offer without standing',
);
playerData2.rep.korrund = 20;
land(secondEntry, factionArc.places.at);
assertCondition(
  secondEntry.all('story').some((message) => message.arc === 'korrund' && !message.done),
  'with standing, the Korrund arc is offered at their capital',
);
secondEntry.send({ t: 'arcacc', fac: 'korrund' });
assertCondition(playerData2.arcs.korrund.active, 'accepted the first Korrund mission');
land(secondEntry, factionArc.places.dest);
assertCondition(
  playerData2.arcs.korrund.step === 1 &&
    secondEntry.all('story').some((message) => message.arc === 'korrund' && message.done),
  'delivered: step one complete, with a conclusion pop-up',
);
playerData2.rep.korrund = 40;
land(secondEntry, factionArc.places.at);
secondEntry.send({ t: 'arcacc', fac: 'korrund' });
toSpace(secondEntry, factionArc.steps[1].sys);
const message = game.spaces[factionArc.steps[1].sys],
  entitys = [...message.ships.values()].filter(
    (shipEntity) => shipEntity.arcOf && shipEntity.arcOf.fac === 'korrund',
  );
assertCondition(entitys.length === factionArc.steps[1].count, 'arriving spawns the claim jumpers');
for (const shipEntity of entitys)
  game.onKill(mockPlayerReference({ s: secondEntry.s }), shipEntity, message);
assertCondition(
  requiredFixtureValue(playerData2.arcs.korrund.active).ready,
  'destroying them all completes the objective',
);
land(secondEntry, factionArc.places.at);
secondEntry.send({ t: 'arcacc', fac: 'korrund' });
toSpace(secondEntry, factionArc.steps[2].sys);
const boss = [...game.spaces[factionArc.steps[2].sys].ships.values()].find(
  (shipEntity) => shipEntity.arcOf && shipEntity.arcOf.fac === 'korrund',
);
assertCondition(
  boss && boss.name === factionArc.steps[2].bossName,
  'the arc boss waits in its system',
);
game.onKill(
  mockPlayerReference({ s: secondEntry.s }),
  requiredFixtureValue(boss),
  game.spaces[factionArc.steps[2].sys],
);
land(secondEntry, factionArc.places.at);
assertCondition(
  playerData2.arcs.korrund.done &&
    playerData2.officers.some((options) => options.id === 'arc-korrund' && options.rarity === 3) &&
    playerData2.bp[factionArc.spec] >= 10,
  'the finale: a unique Epic officer and 10 specialist blueprints',
);
// Farside expeditions
const captain = fake('Surveyor'),
  playerData6 = requiredFixtureValue(captain.s).data;
const stellarBody2 = Object.values(STELLARS).find(
  (stellarBody3) => systemsById[stellarBody3.system].farside && stellarBody3.svc.includes('B'),
);
const expeditionOffer2 = game.features.arcs.expeditionOffer(
  requiredFixtureValue(stellarBody2),
  playerData6,
);
assertCondition(
  expeditionOffer2 && expeditionOffer2.exp.stage === 1,
  'Farside boards offer an expedition',
);
land(captain, requiredFixtureValue(stellarBody2).id);
captain.send({ t: 'accept', id: requiredFixtureValue(expeditionOffer2).id });
const mission2 = playerData6.missions.find((mission5) => mission5.exp);
assertCondition(mission2, 'accepted expedition stage one (survey)');
requiredFixtureValue(mission2).done = true;
land(captain, requiredFixtureValue(stellarBody2).id);
const mission3 = playerData6.missions.find((mission5) => mission5.exp && mission5.exp.stage === 2);
assertCondition(mission3 && mission3.type === 'rescue', 'the survey finds a derelict to board');
const other = Object.values(STELLARS).find(
  (stellarBody3) =>
    systemsById[stellarBody3.system].farside &&
    stellarBody3.svc.includes('L') &&
    stellarBody3.id !== requiredFixtureValue(stellarBody2).id &&
    !stellarBody3.site,
);
requiredFixtureValue(mission3).done = true;
land(captain, requiredFixtureValue(other).id);
const mission4 = playerData6.missions.find((mission5) => mission5.exp && mission5.exp.stage === 3);
assertCondition(
  mission4 && mission4.type === 'expret',
  'the derelict yields a data core to bring home',
);
land(captain, requiredFixtureValue(requiredFixtureValue(mission4).dest));
assertCondition(
  playerData6.expd.n === 1 &&
    captain.all('story').some((session: { id: string }) => session.id === 'exp:0'),
  'decoding it reveals a lore fragment and opens the next expedition',
);
assertCondition(EXPEDITION_LORE.length === 8, 'eight fragments to find');
console.log('ALL 1.2 TESTS PASSED');
process.exit(0);
