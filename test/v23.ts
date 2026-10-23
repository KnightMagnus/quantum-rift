import type { StellarBody } from '../shared/galaxy.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import type { GameAssets } from '../shared/rules.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
// 2.3 tests: ten new common Quantum hulls, more moons and asteroid fields, busier traffic.
import filesystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYSTEMS, STELLARS, COMMON_HULLS, TRAFFIC, FACTION_HULLS } from '../shared/galaxy.ts';
import { SHIPS23 } from '../shared/ships23.ts';
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
const game = new Game(assets, new Database(tempDataDir('rift-v23-')));
Object.assign(game.features.fronts, { event: () => null });
game.features.fronts.anomalies = () => ({}); // 2.6: traffic counts must not depend on the weekday's event (Bounty Week brings 50% more raiders)
// new hulls
assertCondition(
  SHIPS23.length === 10 &&
    SHIPS23.every((ship23Hull) => game.A.ships[ship23Hull.id] && game.A.ships[ship23Hull.id].role),
  'ten new hulls are in the game, each with a class role',
);
const directory = decodeURIComponent(new URL('../client/assets/ships/', import.meta.url).pathname);
assertCondition(
  SHIPS23.every(
    (ship23Hull) =>
      ['', '_glow'].every((session) =>
        filesystem.existsSync(`${directory}${ship23Hull.id}${session}.webp`),
      ) && filesystem.existsSync(`${directory}${ship23Hull.id}_yard.png`),
  ),
  'each has its sprite sheet (2.6: WebP with banking), engine glow and shipyard picture',
);
assertCondition(
  SHIPS23.every(
    (ship23Hull) =>
      COMMON_HULLS.includes(ship23Hull.id) && FACTION_HULLS.quantum.includes(ship23Hull.id),
  ),
  'they are sold in Concord yards',
);
const yardP = Object.values(STELLARS).find(
  (player) =>
    player.svc.includes('Y') &&
    requiredFixtureValue(player.tech) >= 2 &&
    !player.hub &&
    !player.site &&
    requiredFixtureValue(SYSTEMS.find((starSystem) => starSystem.id === player.system)).faction ===
      'spacer',
);
assertCondition(
  yardP &&
    [820, 821].every((hull) =>
      requiredFixtureValue(game.yard(yardP, mockPlayerData(game.fresh()))).includes(hull),
    ),
  'the cheapest new hulls are sold in common yards everywhere',
);
assertCondition(
  [821, 824].every((hull2) => TRAFFIC.quantum.traders.includes(hull2)) &&
    [823, 829].every((hull3) => TRAFFIC.quantum.war.includes(hull3)),
  'and they fly in NPC traffic',
);
const hubPort = Object.values(STELLARS).find((stellarBody) => stellarBody.hub),
  playerData = mockPlayerData(game.fresh());
playerData.credits = 1e8;
assertCondition(
  requiredFixtureValue(game.yard(requiredFixtureValue(hubPort), playerData)).includes(829) ||
    requiredFixtureValue(game.A.ships[829].tech) >
      requiredFixtureValue(requiredFixtureValue(hubPort).tech),
  'the hub shipyard lists the new hulls up to its tech level',
);
// moons and fields
const moons = Object.values(STELLARS).filter((stellarBody) => /-m\d$/.test(stellarBody.id));
assertCondition(
  moons.length >= 40 &&
    moons.every(
      (stellarBody) =>
        stellarBody.kind === 'moon' &&
        stellarBody.svc === '' &&
        STELLARS[stellarBody.id.replace(/-m\d$/, '')],
    ),
  `${moons.length} new uninhabited moons, each circling a planet`,
);
assertCondition(
  Object.keys(STELLARS).length === new Set(Object.keys(STELLARS)).size,
  'every world id is unique',
);
for (const identifier of [
  'qstation',
  'concordia',
  'earth',
  'threshold',
  'site-qgate',
  'meridian-yards',
])
  assertCondition(
    STELLARS[identifier] && !/-m\d$/.test(identifier),
    `existing world ${identifier} is unchanged`,
  );
assertCondition(
  moons.every((stellarBody) => {
    const starSystem = SYSTEMS.find((starSystem2) => starSystem2.id === stellarBody.system);
    return requiredFixtureValue(starSystem).stellars.every(
      (options) =>
        options === stellarBody ||
        options.id === stellarBody.id ||
        Math.hypot(options.x - stellarBody.x, options.y - stellarBody.y) >
          (options.r || 60) + stellarBody.r + 100,
    );
  }),
  'new moons keep clear of other worlds',
);
assertCondition(
  SYSTEMS.reduce(
    (firstValue, starSystem) =>
      firstValue +
      (starSystem.fields || []).filter((feature) => requiredFixtureValue(feature.id).includes('-x'))
        .length,
    0,
  ) >= 60,
  'many systems gain an extra asteroid field or gas cloud',
);
// traffic
const space = game.spaces.halcyon;
space.players = 1;
for (let index = 0; index < 30 * 120; index++) space.tick();
assertCondition(
  space.ships.size >= 10,
  `systems are busier (${space.ships.size} ships in Halcyon after two minutes)`,
);
assertCondition(
  [...space.ships.values()]
    .filter((entity) => entity.ai === 'trade' && entity.dest && !entity.dest.out)
    .every(
      (shipEntity) =>
        (requiredFixtureValue(shipEntity.dest) as StellarBody).svc &&
        (requiredFixtureValue(shipEntity.dest) as StellarBody).svc.includes('L'),
    ),
  'traders only head for worlds they can land on',
);
const message = game.spaces.gloam;
message.players = 1;
for (let index = 0; index < 30 * 300; index++) message.tick();
const raids = [...message.ships.values()].filter(
  (shipEntity) => shipEntity.ai === 'raid' && !shipEntity.owner && !shipEntity.mission,
).length;
assertCondition(
  raids <= 3 + Math.floor(message.sys.danger / 2),
  `even pirate havens cap their raider packs (${raids})`,
);
console.log('ALL 2.3 TESTS PASSED');
process.exit(0);
