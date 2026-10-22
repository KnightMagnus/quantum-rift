import { mockPlayerReference } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.5.2 tests: the bug-fix and quality-of-life pass (story needs, supply warnings, mining hints, markets for mined goods,
// war fleets and newcomers, map station marker, broken-ring art).
import filesystem from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { needsOf } from '../server/quests.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { CHAINS } from '../shared/quests.ts';
import { price, makeLoadout } from '../shared/rules.ts';
import { TUTORIAL } from '../shared/tutorial.ts';
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
const clientDirectory = decodeURIComponent(new URL('../client/', import.meta.url).pathname),
  read = (feature: string) =>
    filesystem.readFileSync(clientDirectory + feature.replace(/\.js$/, '.ts'), 'utf8');
{
  const parseFailures: string[] = [];
  for (const feature of filesystem
    .readdirSync(clientDirectory)
    .filter((feature4) => feature4.endsWith('.ts'))) {
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
// markets for mined goods
const stellarBodys = Object.values(STELLARS).filter(
    (stellarBody) => stellarBody.svc.includes('T') && !stellarBody.site,
  ),
  quantity = (captain: string) =>
    stellarBodys.filter((stellarBody) => price(stellarBody, captain) !== null).length;
assertCondition(
  quantity('shards') >= 60 && quantity('ore') >= 80 && quantity('gas') >= 70,
  `more markets buy mined goods (ore ${quantity('ore')}, gas ${quantity('gas')}, shards ${quantity('shards')} of ${stellarBodys.length})`,
);
// stories say what they need
const questChain = CHAINS.find((entry) => entry.id === 'medicine');
assertCondition(
  needsOf(requiredFixtureValue(questChain).steps).hold === 12 &&
    needsOf(requiredFixtureValue(questChain).steps).pax === 1,
  'a story reports the most hold space and bunks its steps ask for',
);
const game = new Game(assets, new Database(tempDataDir('rift-v252-')));
function fake(name: string) {
  const legacySocket2 = legacySocket();
  legacySocket2.open = true;
  legacySocket2.backlog = 0;
  const output: LegacyPacket[] = [];
  legacySocket2.send = (message: string) =>
    output.push(typeof message === 'string' ? JSON.parse(message) : message);
  legacySocket2.close = () => {};
  game.connect(legacySocket2, '7.7.9.' + name.length);
  legacySocket2.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' }));
  const session = requiredFixtureValue([...game.sessions.values()].pop());
  return {
    s: session,
    d: requiredFixtureValue(session).data,
    out: output,
    toasts: () => output.filter((message) => message.t === 'toast').map((message) => message.msg),
  };
}
const fake2 = fake('Need Checker');
fake2.d.stellar = 'concordia';
fake2.d.sys = STELLARS.concordia.system;
const missions = game
  .offers(STELLARS.concordia, fake2.d)
  .filter((options) => options.type === 'quest');
assertCondition(
  missions.length &&
    missions.every((mission) => mission.needs && 'hold' in mission.needs && 'pax' in mission.needs),
  'story offers carry their needs to the job board',
);
assertCondition(
  /questNeeds\(mission\)/.test(read('ui.js')) &&
    /switch ships for this step/.test(read('missions.js')),
  'the job card warns and a stuck step says to switch ships',
);
assertCondition(
  /mission\.type === 'supply' &&\s*!playerPayload\.shipless/.test(read('ui.js')),
  'supply jobs warn when the hold is too small',
);
assertCondition(
  /Cargo Compression outfit first/.test(
    requiredFixtureValue(TUTORIAL.find((messageType) => messageType.title === 'Mine 10 tons')).text,
  ),
  'the mining career step explains ships with no hold',
);
// mining hints
const fake3 = fake('Dart Miner');
fake3.d.ship = makeLoadout(assets, 790, 'Dart');
fake3.d.sys = 'qgate';
game.onLoot(mockPlayerReference({ s: fake3.s }), { ore: 'ore', n: 3 });
assertCondition(
  fake3.toasts().some((messageType2: string) => /no cargo hold/.test(messageType2)),
  'mining in a ship with no hold explains why and what to fit',
);
const fake4 = fake('Full Miner');
fake4.d.ship = makeLoadout(assets, 704, 'Dory');
fake4.d.sys = 'qgate';
seedCargo(fake4.d, { food: 70 });
game.onLoot(mockPlayerReference({ s: fake4.s }), { ore: 'ore', n: 3 });
assertCondition(
  fake4
    .toasts()
    .some((messageType3: string) => /Cargo hold full\. Raw Ore sells at .+/.test(messageType3)),
  `a full hold names the nearest buyer (${fake4.toasts().pop()})`,
);
assertCondition(
  game.nearestBuyer('qgate', 'shards') &&
    requiredFixtureValue(game.nearestBuyer('qgate', 'shards')).j <= 5,
  'the nearest buyer of crystal shards is a few jumps at most',
);
// war fleets and newcomers
{
  const space = game.spaces.halcyon;
  space.players = 1;
  const fake5 = fake('Fresh Captain');
  fake5.d.sys = 'halcyon';
  fake5.d.stellar = null;
  const entity = space.makeShip({
    hull: 703,
    faction: 'quantum',
    x: 0,
    y: 0,
    player: mockPlayerReference({
      s: fake5.s,
      id: requiredFixtureValue(fake5.s).id,
      name: 'Fresh Captain',
    }),
  });
  entity.graceT = -1;
  const weapon = space.makeShip({ hull: 708, faction: 'korrund', x: 300, y: 0, ai: 'patrol' });
  weapon.warFleet = true;
  assertCondition(
    space.inner() ? space.spared(weapon, entity) : true,
    'war fleets leave newcomers alone in inner space, like pirates',
  );
  space.players = 0;
}
// map, cargo panel, shipyard
assertCondition(
  /myStSys === starSystem\.id/.test(read('render.js')) &&
    /your station/.test(read('render.js')) &&
    /id="ghome"/.test(read('index.html')),
  'the galaxy map marks your station, lists it in the legend and has a HOME button',
);
assertCondition(
  /export function bestSale/.test(read('info_ui.js')),
  'the cargo panel shows the best nearby buyer for each good',
);
assertCondition(
  /NO CARGO HOLD/.test(read('ui.js')) &&
    /yardSorted/.test(read('ui.js')) &&
    /only what fits/.test(read('ui.js')),
  'the shipyard tags ships with no hold and sorts; the outfitter can show only what fits',
);
// art
for (const feature of ['ruin_0', 'ruin_1', 'arc_0', 'arc_1'])
  assertCondition(
    filesystem.statSync(clientDirectory + `assets/decor/${feature}.webp`).size > 20000,
    `the ${feature} scenery is the detailed 2.5.2 render`,
  );
assertCondition(
  /size: 900 \+ currentRandomGenerator\(\) \* 700/.test(read('render.js')),
  'megastructure arcs are drawn smaller',
);
console.log('ALL 2.5.2 TESTS PASSED');
process.exit(0);
