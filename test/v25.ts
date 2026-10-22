import { mockPlayerData, mockSession } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { seedCargo } from './helpers/cargo-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.5 tests: the rendered art set is complete and wired up, plus the polish pass (career steps, market depth, dialogs).
import filesystem from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS, SYS as systemsById, EXTRA_OUTFITS } from '../shared/galaxy.ts';
import { TUTORIAL, tutMigrate } from '../shared/tutorial.ts';
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
  assetDirectory = clientDirectory + 'assets/';
const read = (feature: string) =>
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
// planets
const parse2: Record<string, { type: string; rings: boolean; tw: number; bk: number; r: number }> =
  JSON.parse(filesystem.readFileSync(assetDirectory + 'planets/planets.json', 'utf8'));
assertCondition(
  Object.keys(parse2).length >= 50 &&
    Object.keys(parse2).every((identifier) =>
      filesystem.existsSync(assetDirectory + `planets/${identifier}.webp`),
    ),
  `${Object.keys(parse2).length} pre-rendered planets, every one on disk`,
);
const types = new Set(Object.values(parse2).map((message) => message.type));
for (const messageType of [
  'earth',
  'terran',
  'ocean',
  'desert',
  'ice',
  'lava',
  'barren',
  'gas',
  'toxic',
  'crystal',
  'city',
  'jungle',
])
  assertCondition(types.has(messageType), `planet type ${messageType} has renders`);
assertCondition(
  Object.entries(parse2).every(
    ([identifier, message]) =>
      ['_tex', '_aux', '_back'].every((entry) =>
        filesystem.existsSync(assetDirectory + `planets/${identifier}${entry}.webp`),
      ) &&
      (!message.rings ||
        filesystem.existsSync(assetDirectory + `planets/${identifier}_front.webp`)) &&
      message.tw > 0 &&
      message.bk >= 0,
  ),
  'every planet has surface maps to turn (2.5.1), and ringed ones a front ring layer',
);
assertCondition(
  /function renderRendered/.test(read('planets.js')) &&
    /position\.off \+ time \* position\.spin/.test(read('planets.js')),
  'the client turns the rendered planets',
);
assertCondition(
  Object.values(parse2).some((message) => message.rings) &&
    Object.values(parse2).every((message) => message.r > 0.3 && message.r < 0.9),
  'ringed giants are included and every render records its sphere size',
);
// stations
const designs = [
  ...read('render.js').matchAll(
    /'(ring|spindle|cross|rock|twin|yard|disc|hive|crystal|reef|forge|junk)'/g,
  ),
].map((message) => message[1]);
const distance = [...new Set(designs)];
assertCondition(
  distance.length === 12 &&
    distance.every(
      (playerData) =>
        filesystem.existsSync(assetDirectory + `stations/s_${playerData}.webp`) &&
        filesystem.existsSync(assetDirectory + `land/l_st_${playerData}.jpg`),
    ),
  'twelve station designs, each with a space sprite and a landing picture',
);
// landing pictures
const requiredFixtureValue2 = requiredFixtureValue(
    stripTypeScriptTypes(read('ui.js')).match(/const LAND_SCENES\s*= (\{[\s\S]*?\});/),
  )[1],
  scenes = [...requiredFixtureValue2.matchAll(/'([a-z_0-9]+)'/g)]
    .map((message) => message[1])
    .filter(
      (entry) =>
        !/^(terran|city|ocean|desert|ice|lava|barren|gas|toxic|crystal)$/.test(entry) ||
        filesystem.existsSync(assetDirectory + `land/l_${entry}.jpg`),
    );
assertCondition(
  scenes.length >= 20 &&
    scenes.every((entry) => filesystem.existsSync(assetDirectory + `land/l_${entry}.jpg`)),
  `${scenes.length} landing scenes referenced by the client all exist`,
);
for (const entry of [
  'earth',
  'inalumen',
  'threshold',
  'moon2',
  'lava2',
  'desert2',
  'jungle1',
  'jungle2',
])
  assertCondition(
    filesystem.existsSync(assetDirectory + `land/l_${entry}.jpg`),
    `landing picture l_${entry}`,
  );
const landable = Object.values(STELLARS).filter(
  (player) => player.svc.includes('L') && !player.site,
);
assertCondition(
  landable.length > 150,
  `${landable.length} landable worlds now get a rendered picture instead of a colour blur`,
);
// effects, objects, icons, login
for (const feature of [
  'fx/boom_a.webp',
  'fx/boom_b.webp',
  'fx/boom_big.webp',
  'fx/shards.webp',
  'fx/flare.webp',
  'ui/login_bg.jpg',
  'objects/loot5.webp',
  'objects/rock9.webp',
  'objects/crys3.webp',
])
  assertCondition(filesystem.existsSync(assetDirectory + feature), `asset ${feature}`);
assertCondition(
  EXTRA_OUTFITS.every(
    (options) => options.icon && filesystem.existsSync(assetDirectory + options.icon),
  ),
  `all ${EXTRA_OUTFITS.length} web-game outfits have outfitter pictures`,
);
const allEntries = Object.values(assets.outfits).concat(EXTRA_OUTFITS);
assertCondition(
  allEntries.every((outfit) => outfit.icon),
  'no outfit is left without a picture',
);
const size = (playerData: string): number =>
  filesystem
    .readdirSync(playerData, { withFileTypes: true })
    .reduce(
      (firstValue, entity) =>
        firstValue +
        (entity.isDirectory()
          ? size(playerData + entity.name + '/')
          : filesystem.statSync(playerData + entity.name).size),
      0,
    );
{
  const ships = size(assetDirectory + 'ships/');
  const radio = filesystem.existsSync(assetDirectory + 'radio/')
    ? size(assetDirectory + 'radio/')
    : 0;
  assertCondition(
    size(assetDirectory) - ships - radio < 29e6,
    `client art besides separately packaged ships/radio stays small enough for one zip (${((size(assetDirectory) - ships - radio) / 1e6).toFixed(1)} MB; 2.6 ship sheets ${(ships / 1e6).toFixed(1)} MB ship as part 2)`,
  );
}
// polish
assertCondition(
  !/[^.\w]confirm\(/.test(read('ui.js') + read('main.js')),
  'native confirm() dialogs are gone (styled dialog instead)',
);
assertCondition(
  TUTORIAL.length === 23 &&
    TUTORIAL.some((messageType2) => messageType2.title === 'Meet a contact') &&
    TUTORIAL.some((messageType3) => messageType3.title === 'Finish a story'),
  'the career guide teaches contacts, troubled systems and stories',
);
{
  const distance5 = { tut: 12 },
    distance6 = { tut: 16 },
    distance7 = { tut: 20 },
    distance8 = { tut: 3 };
  [distance5, distance6, distance7, distance8].forEach((data) => tutMigrate(mockPlayerData(data)));
  assertCondition(
    distance5.tut === 14 &&
      distance6.tut === 19 &&
      distance7.tut === 23 &&
      distance8.tut === 3 &&
      TUTORIAL[14].title === 'Market and refinery (Station Tier 2)',
    'old saves keep their place in the longer career guide',
  );
}
const game = new Game(assets, new Database(tempDataDir('rift-v25-')));
const port = Object.values(STELLARS).find(
  (stellarBody) =>
    stellarBody.svc.includes('T') &&
    !stellarBody.site &&
    !stellarBody.outlaw &&
    systemsById[stellarBody.system].faction === 'quantum',
);
const sell = (quantity: number) => {
  const session = mockSession({
    id: 900 + quantity,
    data: mockPlayerData(game.fresh()),
    sock: { open: true, backlog: 0, send() {} },
  });
  session.data.name = 'Depth' + quantity;
  game.sessions.set(session.id, session);
  session.data.stellar = requiredFixtureValue(port).id;
  session.data.sys = requiredFixtureValue(port).system;
  seedCargo(session.data, { metal: quantity });
  game.db.world.tradeImpact = {};
  const credits = session.data.credits;
  game.trade(session, 'metal', -quantity);
  return (session.data.credits - credits) / quantity;
};
const small = sell(5),
  sell2 = sell(150);
assertCondition(
  sell2 < small * 0.9,
  `a big load sells for less per ton than a small one (${Math.round(sell2)} vs ${Math.round(small)})`,
);
console.log('ALL 2.5 TESTS PASSED');
process.exit(0);
