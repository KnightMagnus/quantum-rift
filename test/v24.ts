import type { QuestRecord } from '../shared/quests.ts';
import { mockPlayerData, mockPlayerReference } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.4 tests: the living galaxy (system states, trade impact, supply jobs) and questlines (contacts, side stories, salvage).
import filesystem from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { CHAINS, SIDE_STORIES } from '../shared/quests.ts';
import { STATES } from '../shared/living.ts';

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
{
  const { execFileSync } = await import('node:child_process');
  const cdir = decodeURIComponent(new URL('../client/', import.meta.url).pathname);
  const parseFailures: string[] = [];
  for (const feature of filesystem
    .readdirSync(cdir)
    .filter((feature3) => feature3.endsWith('.ts'))) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: stripTypeScriptTypes(filesystem.readFileSync(cdir + feature, 'utf8')),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    } catch {
      parseFailures.push(feature);
    }
  }
  assertCondition(
    !parseFailures.length,
    `every client script parses${parseFailures.length ? ': BAD ' + parseFailures.join(', ') : ''}`,
  );
}
const game = new Game(assets, new Database(tempDataDir('rift-v24-')));
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  const output: LegacyPacket[] = [];
  legacySocket2.send = (message: string) =>
    output.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '7.7.8.' + name.length);
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
    stories: () => output.filter((message) => message.t === 'story'),
    you: () => requiredFixtureValue(output.filter((message) => message.t === 'you').pop()).d,
  };
}
const location = (captainFixture: ReturnType<typeof fake>, identifier: string) => {
  captainFixture.d.stellar = identifier;
  captainFixture.d.sys = STELLARS[identifier].system;
};

// ---- living galaxy
game.features.living.livingTick();
const shipStats = game.features.living.statesPayload(),
  quantity = Object.keys(shipStats).length;
assertCondition(
  quantity >= 3 && Object.values(shipStats).every((entry) => STATES[entry.k]),
  `${quantity} systems start in a state (famine, war, boom...)`,
);
const famSys = game.features.living
  .marketSystems()
  .find(
    (session) =>
      systemsById[session].stellars.some(
        (player) =>
          requiredFixtureValue(player.svc).includes('T') &&
          !player.site &&
          requiredFixtureValue(player.svc).includes('B'),
      ) && !shipStats[session],
  );
game.db.world.states[requiredFixtureValue(famSys)] = {
  kind: 'famine',
  start: Date.now(),
  until: Date.now() + 3e6,
  got: 0,
  need: 140,
};
const port =
  STELLARS[
    requiredFixtureValue(
      systemsById[requiredFixtureValue(famSys)].stellars.find(
        (stellarBody) =>
          requiredFixtureValue(stellarBody.svc).includes('T') &&
          !stellarBody.site &&
          requiredFixtureValue(stellarBody.svc).includes('B'),
      ),
    ).id
  ];
const captainFixture = fake('Famine Runner');
location(captainFixture, port.id);
captainFixture.d.credits = 1e6;
const food = () =>
  requiredFixtureValue(game.market(port)).find((marketItem) => marketItem.id === 'food');
const before = food();
assertCondition(
  before && requiredFixtureValue(before.price) > 0 && requiredFixtureValue(before.moved) >= 100,
  `food sells for double during the famine (+${before && before.moved}%)`,
);
captainFixture.d.ship.hull = 704;
captainFixture.d.cargo.food = 20;
game.trade(captainFixture.s, 'food', -20);
const after = food();
assertCondition(
  requiredFixtureValue(requiredFixtureValue(after).price) <
    requiredFixtureValue(requiredFixtureValue(before).price),
  `selling food lowers its local price (${requiredFixtureValue(before).price} -> ${requiredFixtureValue(after).price})`,
);
assertCondition(
  game.db.world.states[requiredFixtureValue(famSys)].got === 20,
  'and counts toward ending the famine',
);
const missions2 = game.offers(port, captainFixture.d);
assertCondition(
  missions2.some(
    (options) => options.type === 'supply' && 'state' in options && options.state === 'famine',
  ),
  'the famine posts supply jobs',
);

// ---- contacts and generated stories
const bars = Object.values(STELLARS).filter(
  (stellarBody) =>
    stellarBody.svc.includes('B') && !stellarBody.site && !systemsById[stellarBody.system].arena,
);
const contactAt2 = game.features.quests.contactAt(bars[0]),
  contactAt3 = game.features.quests.contactAt(bars[0]);
assertCondition(
  contactAt2 && contactAt2.name === requiredFixtureValue(contactAt3).name && contactAt2.title,
  `every bar has a contact who stays the same (${requiredFixtureValue(contactAt2).name}, ${requiredFixtureValue(contactAt2).title})`,
);
assertCondition(
  new Set(
    bars
      .slice(0, 40)
      .map((stellarBody) => requiredFixtureValue(game.features.quests.contactAt(stellarBody)).name),
  ).size >= 25,
  'contacts are different people from bar to bar',
);
let built = 0,
  parseFailures2: string[] = [];
for (const stellarBody of bars) {
  const playerData = mockPlayerData(game.fresh());
  playerData.name = 'Plan ' + stellarBody.id;
  const contactAt4 = game.features.quests.contactAt(stellarBody),
    contactStory2 = game.features.quests.contactStory(
      stellarBody,
      playerData,
      requiredFixtureValue(contactAt4),
    );
  if (!contactStory2) continue;
  const questRecord = {
    qid: 'test',
    plan: contactStory2.plan,
    steps: contactStory2.X.steps,
    started: 1,
    name: contactStory2.X.name,
  } as QuestRecord;
  contactStory2.X.steps.forEach((questChainStep, index) => {
    const mission = game.features.quests.questStepJob(playerData, questRecord, index);
    built++;
    if (
      !systemsById[mission.sys] ||
      (mission.dest && !STELLARS[mission.dest]) ||
      !(mission.reward > 0) ||
      /\{\w+\}/.test(mission.title + mission.text) ||
      (mission.hull && !game.A.ships[mission.hull])
    )
      parseFailures2.push(`${stellarBody.id}:${contactStory2.X.id}:${index}`);
  });
}
assertCondition(
  built > 300 && !parseFailures2.length,
  `${built} generated story steps across every bar are valid jobs${parseFailures2.length ? ' BAD ' + parseFailures2.slice(0, 5) : ''}`,
);
assertCondition(
  CHAINS.every((questChain) => questChain.steps.length >= 3) &&
    new Set(CHAINS.map((questChain) => questChain.kind)).size >= 3,
  `${CHAINS.length} story templates for lawful, shady and frontier contacts`,
);

const captainFixture2 = fake('Quest Taker');
const playerData = captainFixture2.d;
location(captainFixture2, 'concordia');
const board = game.offers(STELLARS.concordia, playerData),
  mission2 = board.find((mission) => mission.type === 'quest' && mission.story);
assertCondition(
  mission2 && board[0].type === 'quest',
  `the contact's story leads the board: "${mission2 && mission2.title}"`,
);
captainFixture2.send({ t: 'accept', id: requiredFixtureValue(mission2).id });
const questId = Object.keys(playerData.quests.active)[0],
  questRecord2 = playerData.quests.active[questId];
assertCondition(
  questRecord2 &&
    playerData.missions.some(
      (mission) => mission.quest && mission.quest.qid === questId && mission.quest.step === 0,
    ),
  'accepting starts the story with step 1 as a job',
);
assertCondition(
  !game
    .offers(STELLARS.concordia, playerData)
    .some((mission) => mission.type === 'quest' && mission.story),
  'the contact has nothing more while their story is under way',
);
// play it through
let guard = 0;
while (playerData.quests.active[questId] && guard++ < 10) {
  const message = playerData.missions.find(
    (mission) => mission.quest && mission.quest.qid === questId,
  );
  const stellarBody = requiredFixtureValue(message).dest
    ? STELLARS[requiredFixtureValue(requiredFixtureValue(message).dest)]
    : STELLARS.concordia;
  if (requiredFixtureValue(message).type === 'supply')
    playerData.cargo[requiredFixtureValue(requiredFixtureValue(message).cid)] =
      requiredFixtureValue(requiredFixtureValue(message).qty);
  requiredFixtureValue(message).done = true;
  location(captainFixture2, stellarBody.id);
  game.completeOnLanding(captainFixture2.s, stellarBody);
}
assertCondition(
  !playerData.quests.active[questId] &&
    playerData.quests.done.some((message) => message.id === questId),
  `the story plays through all ${questRecord2.steps.length} steps`,
);
assertCondition(
  captainFixture2.stories().length === questRecord2.steps.length &&
    requiredFixtureValue(captainFixture2.stories().pop()).tag.includes('COMPLETE'),
  'each step ends with a story beat, and the finale with its rewards',
);
assertCondition(
  playerData.quests.contacts['c:concordia'].n === 1 &&
    requiredFixtureValue(playerData.quests.contacts['c:concordia'].cool) > Date.now(),
  'the contact remembers you and needs a while before the next story',
);

// failing and retrying
playerData.quests.contacts['c:concordia'].cool = 0;
location(captainFixture2, 'concordia');
const mission3 = game
  .offers(STELLARS.concordia, playerData)
  .find((mission) => mission.type === 'quest' && mission.story);
assertCondition(
  mission3 &&
    mission3.standing === 'Acquaintance' &&
    mission3.story !== requiredFixtureValue(mission2).story,
  `the next story is a different one, and you are now an ${mission3 && mission3.standing}`,
);
captainFixture2.send({ t: 'accept', id: requiredFixtureValue(mission3).id });
const qid2 = Object.keys(playerData.quests.active)[0];
playerData.missions = playerData.missions.filter(
  (mission) => !(mission.quest && mission.quest.qid === qid2),
);
game.features.quests.questSweep(captainFixture2.s);
assertCondition(
  playerData.quests.active[qid2] &&
    playerData.missions.some((mission) => mission.quest && mission.quest.qid === qid2),
  'a step lost with your ship gets a second chance',
);
playerData.missions = playerData.missions.filter(
  (mission) => !(mission.quest && mission.quest.qid === qid2),
);
game.features.quests.questSweep(captainFixture2.s);
assertCondition(!playerData.quests.active[qid2], 'losing it twice ends the story');
playerData.quests.contacts['c:concordia'].cool = 0;
const mission4 = game
  .offers(STELLARS.concordia, playerData)
  .find((mission) => mission.type === 'quest' && mission.story);
captainFixture2.send({ t: 'accept', id: requiredFixtureValue(mission4).id });
const mission5 = playerData.missions.find((mission) => mission.quest);
captainFixture2.send({ t: 'abandon', id: requiredFixtureValue(mission5).id });
assertCondition(
  !Object.keys(playerData.quests.active).length &&
    !playerData.missions.some((mission) => mission.quest),
  'abandoning a step ends its story',
);

// ---- side stories
const legacySideStories = SIDE_STORIES.filter((story) =>
  [
    'lantern',
    'saltiron',
    'caravan',
    'hollowwar',
    'archive',
    'farlight',
    'sideways-apology',
  ].includes(story.id),
);
assertCondition(
  legacySideStories.length === 7 &&
    legacySideStories.every(
      (sideStory) =>
        STELLARS[sideStory.at] &&
        STELLARS[sideStory.at].svc.includes('B') &&
        sideStory.steps.every(
          (sideStoryStep) => systemsById[requiredFixtureValue(sideStoryStep.sys)],
        ),
    ),
  'seven side stories, each starting at a world with a bar',
);
assertCondition(
  !legacySideStories.some((sideStory) =>
    ['threshold', 'inalumen', 'dimmer'].some(
      (propertyKey) =>
        sideStory.at.includes(propertyKey) ||
        sideStory.steps.some((sideStoryStep) =>
          requiredFixtureValue(sideStoryStep.sys).includes(propertyKey),
        ),
    ),
  ),
  "side stories stay clear of the main story's worlds",
);
const captainFixture3 = fake('Side Walker'),
  playerData5 = captainFixture3.d;
location(captainFixture3, 'earth');
const mission6 = game
  .offers(STELLARS.earth, playerData5)
  .find((mission) => mission.side === 'farlight');
assertCondition(mission6, 'a side story is offered where it begins');
captainFixture3.send({ t: 'accept', id: requiredFixtureValue(mission6).id });
let mission7 = playerData5.missions.find((mission) => mission.quest);
requiredFixtureValue(mission7).done = true;
location(captainFixture3, 'earth');
game.completeOnLanding(captainFixture3.s, STELLARS.earth);
mission7 = playerData5.missions.find((mission) => mission.quest);
assertCondition(
  mission7 && mission7.type === 'salvage' && mission7.point,
  'step 2 is a salvage job with a marked point',
);
// fly there and pick it up
location(captainFixture3, 'coldharbor');
captainFixture3.send({ t: 'depart' });
const space = game.spaces.coldharbor,
  entity = requiredFixtureValue(captainFixture3.s).ent;
assertCondition(entity, 'launched in Coldharbor');
requiredFixtureValue(entity).x =
  requiredFixtureValue(requiredFixtureValue(mission7).point)[0] + 400;
requiredFixtureValue(entity).y = requiredFixtureValue(requiredFixtureValue(mission7).point)[1];
game.features.quests.questSalvageIdle(captainFixture3.s);
const crate = space.loot.find(
  (linkedSystemId) => linkedSystemId.it.salvage === requiredFixtureValue(mission7).id,
);
assertCondition(crate, 'coming close puts the salvage crate on the scanner');
const other = fake('Claim Jumper');
assertCondition(
  game.onLoot(mockPlayerReference({ s: other.s }), requiredFixtureValue(crate).it) === false,
  'nobody else can scoop up your salvage',
);
requiredFixtureValue(entity).x = requiredFixtureValue(crate).x;
requiredFixtureValue(entity).y = requiredFixtureValue(crate).y;
for (let index = 0; index < 10 && !requiredFixtureValue(mission7).done; index++) space.tick();
assertCondition(requiredFixtureValue(mission7).done, 'flying over it recovers the salvage');
space.players = 0;
const credits = playerData5.credits;
game.completeOnLanding(captainFixture3.s, STELLARS.coldharbor);
mission7 = playerData5.missions.find((mission) => mission.quest);
requiredFixtureValue(mission7).done = true;
game.completeOnLanding(captainFixture3.s, STELLARS.earth);
assertCondition(
  playerData5.quests.sides.farlight &&
    playerData5.credits > credits + 85000 &&
    !game.offers(STELLARS.earth, playerData5).some((mission) => mission.side === 'farlight'),
  'finishing the side story pays its reward, and it is not offered again',
);
const playerData6 = captainFixture3.you();
assertCondition(
  playerData6.quests && playerData6.quests.done.length === 1 && playerData6.quests.done[0].side,
  'the client gets the story journal',
);
// ---- combat AI
{
  const message = game.spaces.halcyon;
  message.players = 1;
  const shipEntity = message.makeShip({
      hull: 705,
      faction: 'hollow',
      x: 0,
      y: 0,
      ai: 'raid',
      pers: 'cautious',
    }),
    shipEntity2 = message.makeShip({ hull: 705, faction: 'hollow', x: 600, y: 0, ai: 'raid' }),
    value = message.makeShip({ hull: 708, faction: 'quantum', x: -300, y: 0, ai: 'patrol' });
  assertCondition(
    ['cautious', 'steady', 'reckless'].includes(requiredFixtureValue(shipEntity2.pers)),
    `NPC captains have a personality (${shipEntity2.pers})`,
  );
  message.damage(shipEntity, 1, 1, value);
  assertCondition(shipEntity2.target === value, 'a ship under attack calls nearby friends to help');
  shipEntity.shield = 0;
  shipEntity.armor = shipEntity.st.armor * 0.3;
  shipEntity.think = 0;
  message.ai(shipEntity);
  assertCondition(
    shipEntity.ai === 'flee' && !shipEntity.target,
    'a cautious captain who is badly hurt runs for it',
  );
  const boss = message.makeShip({
    hull: 705,
    faction: 'hollow',
    x: 0,
    y: 0,
    ai: 'raid',
    pers: 'cautious',
    mission: { id: 'x', owner: 0 },
  });
  boss.target = value;
  boss.shield = 0;
  boss.armor = boss.st.armor * 0.2;
  boss.think = 0;
  message.ai(boss);
  assertCondition(boss.ai === 'raid', 'bounty targets fight to the end');
  message.players = 0;
}
console.log('ALL 2.4 TESTS PASSED');
process.exit(0);
