import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { FACTION_HULLS, STELLARS, SYSTEMS, TRAFFIC } from '../shared/galaxy.ts';
import { milkyWayTraffic } from '../shared/part-two-ships.ts';
import type { GameAssets } from '../shared/rules.ts';
import { FREEFOLK_HULLS, FREEFOLK_IDS } from '../shared/ships-freefolk.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import { tempDataDir } from './helpers/temp-data.ts';

// Freefolk hulls (1040-1048): civilian ships of the humans living in Index stations.
// They replace the stand-in common hulls in Freefolk traffic and stock the Index station shipyards.
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
process.env.SEEDS_FILE = '/nonexistent';
const game = new Game(assets, new Database(tempDataDir('rift-freefolk-')));
const shipDirectory = new URL('../client/assets/ships/', import.meta.url);

assert.deepEqual(FREEFOLK_IDS, [1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048]);
for (const hull of FREEFOLK_HULLS) {
  const loaded = game.A.ships[hull.id];
  assert.ok(loaded, `${hull.name} is in the game catalog`);
  assert.equal(loaded.faction, 'freefolk');
  assert.deepEqual(loaded.weapons, [], `${hull.name} is unarmed`);
  assert.equal(loaded.guns, 0);
  assert.equal(loaded.turrets, 0);
  assert.ok(loaded.role, `${hull.name} has a class role`);
  assert.ok(loaded.spr?.banks, `${hull.name} uses its banking sprite sheet`);
  assert.ok(loaded.tech! <= 3, `${hull.name} can be sold at tech 3 Index yards`);
  for (const file of [`${hull.id}.webp`, `${hull.id}_glow.webp`, `${hull.id}_yard.webp`])
    assert.ok(filesystem.existsSync(new URL(file, shipDirectory)), `${file} exists`);
}

// Traffic: every Freefolk trade group flies only Freefolk hulls, in Index space and in Confederation space.
for (const systemFaction of ['index', 'confederation'])
  for (let roll = 0; roll < 1; roll += 0.01) {
    const traffic = milkyWayTraffic(systemFaction, roll);
    if (traffic.faction !== 'freefolk') continue;
    assert.equal(traffic.kind, 'trade');
    assert.deepEqual(traffic.pool, FREEFOLK_IDS);
  }
assert.deepEqual(TRAFFIC.freefolk, { traders: FREEFOLK_IDS, war: [] });
assert.deepEqual(FACTION_HULLS.freefolk, FREEFOLK_IDS);

// Shipyards: all three Index stations sell every Freefolk hull, including the tech 3 Steading.
const indexYards = Object.values(STELLARS).filter(
  (port) =>
    port.svc.includes('Y') &&
    !port.site &&
    SYSTEMS.find((system) => system.id === port.system)?.faction === 'index',
);
assert.deepEqual(indexYards.map((port) => port.system).sort(), [
  'mw-ledger-nine',
  'mw-pale-meridian',
  'mw-sirius-bastion',
]);
for (const port of indexYards) {
  const yard = game.yard(port, mockPlayerData(game.fresh())) || [];
  for (const hullId of FREEFOLK_IDS)
    assert.ok(yard.includes(hullId), `${port.name} sells ${game.A.ships[hullId].name}`);
  assert.ok(
    yard.every((hullId) => !(hullId >= 970 && hullId <= 977)),
    `${port.name} sells no Index warships`,
  );
}

// Confederation yards keep their own catalog.
const confederationYard = Object.values(STELLARS).find(
  (port) =>
    port.svc.includes('Y') &&
    !port.site &&
    SYSTEMS.find((system) => system.id === port.system)?.faction === 'confederation' &&
    port.system.startsWith('mw-'),
);
assert.ok(confederationYard);
const confederationHulls = game.yard(confederationYard, mockPlayerData(game.fresh())) || [];
assert.ok(confederationHulls.every((hullId) => !FREEFOLK_IDS.includes(hullId)));

// Live traffic: an Index system spawns Freefolk trade groups made of Freefolk hulls.
let seed = 0x5eed;
const seededRandom = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const originalRandom = Math.random;
Math.random = seededRandom;
const space = game.spaces['mw-ledger-nine'];
try {
  for (let index = 0; index < 40; index++) space.spawnTraffic(false);
} finally {
  Math.random = originalRandom;
}
const freefolkShips = [...space.ships.values()].filter((entity) => entity.faction === 'freefolk');
assert.ok(freefolkShips.length > 0, 'Ledger Nine traffic includes Freefolk ships');
for (const entity of freefolkShips)
  assert.ok(FREEFOLK_IDS.includes(Number(entity.hull)), `Freefolk ship flies hull ${entity.hull}`);

console.log(
  `Freefolk hulls: catalog, art, traffic pools, ${indexYards.length} Index yards and ${freefolkShips.length} live Freefolk ships passed`,
);
process.exit(0);
