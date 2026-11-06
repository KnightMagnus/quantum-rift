import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import {
  COMMON_HULLS,
  FACTION_HULLS,
  SITES,
  STELLARS,
  SYS as systemsById,
  TRAFFIC,
} from '../shared/galaxy.ts';
import type { StellarBody } from '../shared/galaxy.ts';
import { milkyWayTraffic } from '../shared/part-two-ships.ts';
import type { GameAssets } from '../shared/rules.ts';
import { TYPE0_HULLS, TYPE0_IDS, TYPE0_OF, TYPE0_SPRITES } from '../shared/ships-type0.ts';
import { SPRITES } from '../shared/sprites26.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import { tempDataDir } from './helpers/temp-data.ts';

// Type 0 hulls: the pre-Rift patterns of the Concord common hulls, flown and sold only in the Milky Way.
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
process.env.SEEDS_FILE = '/nonexistent';
const game = new Game(assets, new Database(tempDataDir('rift-type0-')));
const isMilkyWay = (stellarBody: StellarBody) =>
  systemsById[stellarBody.system]?.region === 'milky-way';

// Catalog: one Type 0 for each Concord common hull, registered with sheets and yard pictures.
assert.equal(TYPE0_HULLS.length, 25);
assert.deepEqual(
  TYPE0_IDS,
  Array.from({ length: 25 }, (_, offset) => 1010 + offset),
);
assert.deepEqual(
  Object.keys(TYPE0_OF)
    .map(Number)
    .sort((left, right) => left - right),
  [...COMMON_HULLS].sort((left, right) => left - right),
  'every Concord common hull has exactly one Type 0',
);
const shipDirectory = new URL('../client/assets/ships/', import.meta.url);
for (const hull of TYPE0_HULLS) {
  const registered = game.A.ships[hull.id];
  assert.ok(registered && registered.role, `${hull.id} is registered with a class role`);
  assert.deepEqual(SPRITES[hull.id], TYPE0_SPRITES[hull.id], `${hull.id} sprite sheet config`);
  for (const suffix of ['.webp', '_glow.webp', '_yard.webp'])
    assert.ok(
      filesystem.existsSync(new URL(`${hull.id}${suffix}`, shipDirectory)),
      `${hull.id}${suffix}`,
    );
  assert.equal(registered.img, `ships/${hull.id}_yard.webp`);
  assert.ok(!registered.npcOnly, `${hull.id} can be bought`);

  // Older technology: slower and less shielded, but heavier armour, cheaper and one tech level lower (never below 1).
  const descendant = game.A.ships[hull.descendant];
  assert.ok(registered.speed < descendant.speed, `${hull.id} is slower than ${hull.descendant}`);
  assert.ok(registered.shield < descendant.shield, `${hull.id} has less shield`);
  assert.ok(registered.armor > descendant.armor, `${hull.id} has more armour`);
  assert.ok(registered.cost < descendant.cost, `${hull.id} is cheaper`);
  assert.equal(
    registered.tech,
    Math.max(1, descendant.tech! - 1),
    `${hull.id} is one tech lower (at least 1)`,
  );
  assert.equal(registered.size, descendant.size, `${hull.id} keeps its descendant's size`);
}

// Milky Way traffic and faction pools fly Type 0s, never Concord hulls.
for (const faction of ['freefolk', 'unsworn']) {
  assert.ok(
    FACTION_HULLS[faction].every((hullId) => TYPE0_IDS.includes(hullId)),
    faction,
  );
  for (const hullId of [...TRAFFIC[faction].traders, ...TRAFFIC[faction].war])
    assert.ok(TYPE0_IDS.includes(hullId), `${faction} traffic ${hullId}`);
}
for (const systemFaction of ['confederation', 'index'])
  for (let step = 0; step < 100; step++)
    for (const hullId of milkyWayTraffic(systemFaction, step / 100).pool)
      assert.ok(
        !COMMON_HULLS.includes(hullId),
        `${systemFaction} roll ${step} has no Concord hull`,
      );

// Milky Way shipyards sell Type 0s and no Concord hulls.
const playerData = mockPlayerData(game.fresh());
const milkyWayYards = Object.values(STELLARS).filter(
  (stellarBody) => isMilkyWay(stellarBody) && !stellarBody.site && stellarBody.svc.includes('Y'),
);
assert.ok(milkyWayYards.length, 'the Milky Way has shipyards');
const factionsWithYards = new Set<string>();
for (const port of milkyWayYards) {
  const hullIds = game.yard(port, playerData) || [];
  factionsWithYards.add(systemsById[port.system].faction);
  assert.ok(hullIds.length, `${port.id} sells ships`);
  assert.ok(
    !hullIds.some((hullId) => COMMON_HULLS.includes(hullId)),
    `${port.id} sells no Concord hull`,
  );
  for (const concordId of [703, 704, 820, 821, 822])
    if (game.A.ships[TYPE0_OF[concordId]].tech! <= port.tech!)
      assert.ok(
        hullIds.includes(TYPE0_OF[concordId]),
        `${port.id} sells the Type 0 of ${concordId}`,
      );
}
assert.ok(factionsWithYards.has('confederation') && factionsWithYards.has('index'));
// Confederation yards add civilian Type 0s that the shared common list does not cover.
const confederationYard = milkyWayYards.find(
  (port) => systemsById[port.system].faction === 'confederation',
)!;
const confederationHulls = game.yard(confederationYard, playerData) || [];
for (const hullId of [1019, 1021])
  if (game.A.ships[hullId].tech! <= confederationYard.tech!)
    assert.ok(confederationHulls.includes(hullId), `Confederation yard sells ${hullId}`);

// Rift shipyards keep the Concord hulls and sell no Type 0.
const riftYards = Object.values(STELLARS).filter(
  (stellarBody) => !isMilkyWay(stellarBody) && !stellarBody.site && stellarBody.svc.includes('Y'),
);
assert.ok(riftYards.length);
let riftConcordSold = false;
for (const port of riftYards) {
  const hullIds = game.yard(port, playerData) || [];
  assert.ok(!hullIds.some((hullId) => TYPE0_IDS.includes(hullId)), `${port.id} sells no Type 0`);
  if (hullIds.includes(703)) riftConcordSold = true;
}
assert.ok(riftConcordSold, 'Rift yards still sell Concord hulls');

// A Personal Station yard follows its region: Type 0s in the Milky Way, Concord hulls in the Rift.
const stationYard = (siteId: string) => {
  const stationPlayer = mockPlayerData(game.fresh());
  stationPlayer.station = { ...stationPlayer.station, claimed: true, ops: 3, site: siteId };
  return game.yard(STELLARS[siteId], stationPlayer) || [];
};
const milkyWaySite = SITES.find((site) => isMilkyWay(site))!;
const riftSite = SITES.find((site) => !isMilkyWay(site))!;
assert.ok(milkyWaySite && riftSite);
const milkyWayStation = stationYard(milkyWaySite.id);
assert.ok(
  milkyWayStation.includes(1010) &&
    !milkyWayStation.some((hullId) => COMMON_HULLS.includes(hullId)),
);
const riftStation = stationYard(riftSite.id);
assert.ok(riftStation.includes(703) && !riftStation.some((hullId) => TYPE0_IDS.includes(hullId)));
// A station yard below Station Tier 3 stays closed.
const closedPlayer = mockPlayerData(game.fresh());
closedPlayer.station = { ...closedPlayer.station, claimed: true, ops: 2, site: milkyWaySite.id };
assert.equal(game.yard(STELLARS[milkyWaySite.id], closedPlayer), null);

console.log(
  'Type 0 catalog, stat lineage, Milky Way traffic, Milky Way and Rift shipyards and Personal Station yards passed',
);
process.exit(0);
