// Refresh the standalone editor's catalog from this checkout's authoritative game data.
import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
import type { GameAssets } from '../../shared/rules.ts';
import { augmentAssets, makeLoadout } from '../../shared/rules.ts';
import { SYSTEMS, SYS as systemsById, SITES, RESEARCH, START } from '../../shared/galaxy.ts';
import { TUTORIAL } from '../../shared/tutorial.ts';
import { RADIO_STATIONS } from '../../shared/radio-stations.ts';
const assets = JSON.parse(fileSystem.readFileSync('shared/assets.json', 'utf8')) as GameAssets;
augmentAssets(assets);
const template = Game.prototype.fresh.call({ A: assets });
template.station.refT = 0;
const catalog = {
  version: JSON.parse(fileSystem.readFileSync('package.json', 'utf8')).version,
  template,
  ships: Object.values(assets.ships)
    .filter((hull) => !hull.npcOnly)
    .map((hull) => ({
      id: hull.id,
      name: hull.name,
      loadout: makeLoadout(assets, hull.id, hull.name),
    })),
  locations: SYSTEMS.flatMap((system) =>
    system.stellars
      .filter((port) => port.svc!.includes('L') && !port.site)
      .map((port) => ({ id: port.id, system: system.id, label: `${system.name} / ${port.name}` })),
  ),
  sites: SITES.map((site) => ({
    id: site.id,
    system: site.system,
    label: `${systemsById[site.system].name} / ${site.name}`,
  })),
  research: RESEARCH.map((research) => ({ id: research.id, ops: research.ops })),
  tutorialEnd: TUTORIAL.length,
  radio: RADIO_STATIONS.map((station) => station.id),
  start: START,
};
fileSystem.writeFileSync('test/Save Generator/catalog.json', JSON.stringify(catalog));
console.log(
  `${catalog.ships.length} ships, ${catalog.sites.length} station sites, ${catalog.locations.length} landing locations`,
);
process.exit(0);
