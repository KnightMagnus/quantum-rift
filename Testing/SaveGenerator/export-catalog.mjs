// Refresh the standalone editor's catalog from this checkout's authoritative game data.
import fs from 'node:fs';
import { Game } from '../../server/game.js';
import { augmentAssets, makeLoadout } from '../../shared/rules.js';
import { SYSTEMS, SYS, SITES, RESEARCH, START } from '../../shared/galaxy.js';
import { TUTORIAL } from '../../shared/tutorial.js';
import { RADIO_STATIONS } from '../../shared/radio-stations.js';
const assets = JSON.parse(fs.readFileSync('shared/assets.json'));
augmentAssets(assets);
const template = Game.prototype.fresh.call({ A: assets });
template.station.refT = 0;
const catalog = {
  version: JSON.parse(fs.readFileSync('package.json')).version,
  template,
  ships: Object.values(assets.ships).map((hull) => ({
    id: hull.id,
    name: hull.name,
    loadout: makeLoadout(assets, hull.id, hull.name),
  })),
  locations: SYSTEMS.flatMap((system) =>
    system.stellars
      .filter((port) => port.svc.includes('L') && !port.site)
      .map((port) => ({ id: port.id, system: system.id, label: `${system.name} / ${port.name}` })),
  ),
  sites: SITES.map((site) => ({
    id: site.id,
    system: site.system,
    label: `${SYS[site.system].name} / ${site.name}`,
  })),
  research: RESEARCH.map((research) => ({ id: research.id, ops: research.ops })),
  tutorialEnd: TUTORIAL.length,
  radio: RADIO_STATIONS.map((station) => station.id),
  start: START,
};
fs.writeFileSync('Testing/SaveGenerator/catalog.json', JSON.stringify(catalog));
console.log(
  `${catalog.ships.length} ships, ${catalog.sites.length} station sites, ${catalog.locations.length} landing locations`,
);
process.exit(0);
