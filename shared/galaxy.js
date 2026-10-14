import { expandGalaxy, frontierSites, addSolGateway } from './gen.js';
// Quantum Rift: the galaxy. 30 hand-made anchor systems, grown to ~200 by shared/gen.js (deterministic).
// Shared by the server (authoritative) and the browser client (map, landing screens).

export const FACTIONS = {
  quantum:  { name: 'Quantum Concord',  short: 'Concord',   color: '#7fb8ff', hostile: ['umbral', 'hollow'] },
  spacer:   { name: 'Free Spacers',     short: 'Spacer',    color: '#78be8c', hostile: ['hollow', 'umbral'] },
  lamp:     { name: 'Lamplighters',     short: 'Lamplighter', color: '#e6aa3c', hostile: ['hollow', 'umbral'] },
  hollow:   { name: 'The Hollow',       short: 'Hollow',    color: '#b04040', hostile: ['quantum', 'spacer', 'lamp', 'sarn', 'thalassi'], pirate: true },
  quevari:  { name: "Que'vari",         short: "Que'vari",  color: '#bee1ff', hostile: ['umbral'] },
  umbral:   { name: 'The Umbral',       short: 'Umbral',    color: '#8a3a9a', alwaysHostile: true, hostile: ['quantum', 'spacer', 'lamp', 'quevari', 'vashari', 'korrund', 'ylith', 'sarn', 'thalassi'], pirate: true },
  vashari:  { name: 'The Vashari',      short: 'Vashari',   color: '#96dc46', hostile: ['umbral'] },
  korrund:  { name: 'The Korrund',      short: 'Korrund',   color: '#e66e28', hostile: ['umbral', 'hollow'] },
  ylith:    { name: 'The Ylith',        short: 'Ylith',     color: '#e682fa', hostile: ['umbral'] },
  sarn:     { name: 'The Sarn',         short: 'Sarn',      color: '#d2a050', hostile: ['umbral', 'hollow'] },
  thalassi: { name: 'The Thalassi',     short: 'Thalassi',  color: '#3cc8d2', hostile: ['umbral', 'hollow'] },
  // regions, not powers: no ships fly under these flags (traffic there is drawn from the neighbours, raiders and scavengers)
  frontier: { name: 'Unclaimed Frontier', short: 'Frontier', color: '#9a9aa6', hostile: [], region: true },
  farside:  { name: 'Farside Settlers', short: 'Farside', color: '#d8c890', hostile: ['hollow'], farside: true },
  deep:     { name: 'The Deep',         short: 'Deep',      color: '#4a5a9a', hostile: [], region: true },
  // 0.8: the Feral Swarm: wild Vashari drone clusters, hostile to everyone (not a power: no territory, no store, no standing)
  swarm:    { name: 'Feral Swarm', short: 'Swarm', color: '#a8c840', hostile: ['quantum', 'spacer', 'lamp', 'quevari', 'vashari', 'korrund', 'ylith', 'sarn', 'thalassi', 'hollow'], alwaysHostile: true, hidden: true, region: true },
  // 0.9: the Umbral Eclipse: violet-lit Umbral cells that roam far from home (hostile to all; no territory, store or standing)
  eclipse:  { name: 'Umbral Eclipse', short: 'Eclipse', color: '#e682fa', hostile: ['quantum', 'spacer', 'lamp', 'quevari', 'vashari', 'korrund', 'ylith', 'sarn', 'thalassi'], alwaysHostile: true, hidden: true, region: true },
};

export const COMMODITIES = [
  { id: 'food', name: 'Food', base: 120 }, { id: 'industrial', name: 'Industrial Goods', base: 260 },
  { id: 'medical', name: 'Medical Supplies', base: 420 }, { id: 'luxury', name: 'Luxury Goods', base: 650 },
  { id: 'metal', name: 'Metal', base: 200 }, { id: 'equipment', name: 'Equipment', base: 520 },
  { id: 'crystal', name: 'Resonant Crystal', base: 900 }, { id: 'silk', name: 'Vashari Silk', base: 780 },
  // mined from asteroid fields and gas clouds
  { id: 'ore', name: 'Raw Ore', base: 90, mined: true }, { id: 'gas', name: 'Volatile Gas', base: 140, mined: true }, { id: 'shards', name: 'Crystal Shards', base: 230, mined: true },
];
// Quantum Station materials (kept in the materials hold, not cargo). Grades I-V.
export const MATERIALS = ['alloy', 'crystal', 'isotope'];
export const GRADES = ['I', 'II', 'III', 'IV', 'V'];

// price levels per stellar: -1 low (they produce it), 0 normal, 1 high (they want it). Unlisted = not traded.
const P = (o) => o;

// services: L land, T trade, O outfitter, Y shipyard, B bar (mission board), R refuel/repair (always with L)
export const SYSTEMS = [
  // ---- Quantum Concord: the heart of the Rift, home of Quantum Station
  { id: 'qgate', name: 'Quantum Gate', faction: 'quantum', x: 500, y: 350, links: ['meridian', 'halcyon', 'waystation', 'longhaul', 'brightwater'], danger: 0,
    stellars: [{ id: 'qstation', name: 'Quantum Station', kind: 'hub', color: '#9ab', r: 330, x: 1100, y: -800, svc: 'LTOYB', tech: 6, hub: true, land: 10955,
                 prices: P({ore: 0, gas: 0, shards: 0,  food: 1, medical: 0, equipment: -1, metal: 1, luxury: 0 }), desc: 'Quantum Station: the Concord\'s colossal ring station at the heart of the Rift, turning slowly around its quantum core. Every captain passes through its docks. Its notice boards list every Personal Station claimed across the galaxy.' },
               { id: 'concordia', name: 'Concordia', kind: 'planet', color: '#4a7fc8', r: 150, x: -900, y: 600, svc: 'LTOYB', tech: 5,
                 prices: P({ food: -1, industrial: 0, luxury: 1, equipment: 0, medical: 0 }), desc: 'A blue ocean world under a dome of orbital mirrors. The Concord\'s capital, busy and bright.' }] },
  { id: 'meridian', name: 'Meridian', faction: 'quantum', x: 435, y: 295, links: ['qgate', 'hesper', 'slagforge', 'thrumhive'], danger: 1,
    stellars: [{ id: 'meridian-yards', name: 'Meridian Yards', kind: 'station', color: '#889', r: 60, x: 500, y: 300, svc: 'LTOYB', tech: 7,
                 prices: P({ore: 1, gas: 0,  metal: 1, industrial: -1, equipment: -1 }), desc: 'The Concord\'s shipyards: ten kilometres of slipways and the smell of hot metal.' }] },
  { id: 'halcyon', name: 'Halcyon', faction: 'quantum', x: 565, y: 300, links: ['qgate', 'facetfall', 'spokeroad', 'slagforge'], danger: 1,
    stellars: [{ id: 'halcyon-prime', name: 'Halcyon Prime', kind: 'planet', color: '#7ab878', r: 130, x: -600, y: -400, svc: 'LTOB', tech: 4,
                 prices: P({ food: -1, luxury: 0, medical: 1, crystal: 1 }), desc: 'Garden terraces and quiet harbors. Rich captains retire here.' }] },
  // ---- Free Spacers: the trade lanes
  { id: 'waystation', name: 'Waystation', faction: 'spacer', x: 420, y: 395, links: ['qgate', 'emberlight', 'brightwater', 'gloam'], danger: 1,
    stellars: [{ id: 'waystation-hub', name: 'Waystation Hub', kind: 'station', color: '#8a9', r: 55, x: -300, y: 300, svc: 'LTOYB', tech: 3,
                 prices: P({ore: 0, gas: 0, shards: 0,  food: 0, industrial: 0, medical: 0, luxury: 0, metal: 0, equipment: 0 }), desc: 'A crossroads market where every lane in the Rift meets. Everything is for sale, for a price.' }] },
  { id: 'longhaul', name: 'Longhaul', faction: 'spacer', x: 590, y: 400, links: ['qgate', 'brightwater', 'wheelwright', 'tidepool'], danger: 1,
    stellars: [{ id: 'longhaul-depot', name: 'Longhaul Depot', kind: 'station', color: '#998', r: 55, x: 400, y: -250, svc: 'LTYB', tech: 3,
                 prices: P({ metal: -1, food: 1, industrial: 0, silk: 1 }), desc: 'Fuel, food and freight contracts. The Spacer families keep their records here.' },
               { id: 'cartwheel', name: 'Cartwheel', kind: 'moon', color: '#a99', r: 70, x: -700, y: 500, svc: 'LTB', tech: 1, prices: P({ food: -1, equipment: 1 }),
                 desc: 'A frozen moon with a single dome and a very good bar.' }] },
  { id: 'brightwater', name: 'Brightwater', faction: 'spacer', x: 505, y: 445, links: ['qgate', 'waystation', 'longhaul', 'farmouth'], danger: 1,
    stellars: [{ id: 'brightwater-iv', name: 'Brightwater IV', kind: 'planet', color: '#5aa0b8', r: 140, x: 600, y: 500, svc: 'LTOB', tech: 3,
                 prices: P({ food: -1, medical: -1, luxury: 1, equipment: 1 }), desc: 'A water world of floating towns. Free Spacers come here to marry, trade and mend their ships.' }] },
  // ---- Lamplighters
  { id: 'hesper', name: 'Hesper', faction: 'lamp', x: 335, y: 315, links: ['meridian', 'emberlight', 'thrumhive'], danger: 1,
    stellars: [{ id: 'lanternfall', name: 'Lanternfall', kind: 'station', color: '#c96', r: 75, x: -200, y: -300, svc: 'LTOYB', tech: 5, land: 10950,
                 prices: P({ luxury: -1, medical: 1, metal: 1 }), desc: 'A ring of dark metal kilometres across, warm light leaking through every seam. The Lamplighters have lived here longer than anyone remembers.' }] },
  { id: 'emberlight', name: 'Emberlight', faction: 'lamp', x: 300, y: 385, links: ['hesper', 'waystation', 'gloam'], danger: 2,
    stellars: [{ id: 'vigil-lamp', name: 'Keeper\'s Vigil', kind: 'planet', color: '#c8843c', r: 120, x: 500, y: 200, svc: 'LTB', tech: 2,
                 prices: P({ food: 1, industrial: -1 }), desc: 'An amber desert world with a lamp burning on every hilltop.' }] },
  // ---- The Hollow (pirates)
  { id: 'gloam', name: 'Gloam', faction: 'hollow', x: 255, y: 465, links: ['emberlight', 'waystation', 'cinderverge', 'dimmer'], danger: 4,
    stellars: [{ id: 'gloam-remnant', name: 'Gloam Remnant', kind: 'moon', color: '#666', r: 90, x: 300, y: -400, svc: 'LTB', tech: 2, outlaw: true,
                 prices: P({ luxury: -1, equipment: -1, medical: 1, food: 1 }), desc: 'A shattered moon in a cloud of wreckage. Nobody here asks where your cargo came from.' }] },
  { id: 'cinderverge', name: 'Cinder Verge', faction: 'hollow', x: 195, y: 530, links: ['gloam', 'umbra'], danger: 5,
    stellars: [{ id: 'cinder-hold', name: 'Cinder Hold', kind: 'station', color: '#844', r: 70, x: -300, y: 200, svc: 'LTOYB', tech: 4, outlaw: true,
                 prices: P({ore: 0, shards: 1,  equipment: -1, metal: -1, luxury: 1 }), desc: 'A gutted battleship grown over with salvage scaffolds: the Hollow\'s fortress and black market.' }] },
  // ---- Vashari: the hive worlds of the north-west
  { id: 'thrumhive', name: 'Thrumhive', faction: 'vashari', x: 300, y: 205, links: ['meridian', 'hesper', 'chitinreach', 'broodhollow'], danger: 1,
    stellars: [{ id: 'thrum', name: 'Thrum', kind: 'planet', color: '#6e9a2e', r: 160, x: 400, y: 300, svc: 'LTOYB', tech: 6,
                 prices: P({ silk: -1, food: 0, metal: 1, equipment: 1 }), desc: 'A jungle world humming with the wings of a billion Vashari. The hive-spires are grown, not built.' }] },
  { id: 'chitinreach', name: 'Chitin Reach', faction: 'vashari', x: 235, y: 150, links: ['thrumhive', 'broodhollow'], danger: 2,
    stellars: [{ id: 'molt', name: 'Moltfield', kind: 'moon', color: '#5a6a30', r: 80, x: -400, y: -200, svc: 'LTB', tech: 2, prices: P({ silk: -1, industrial: 1 }),
                 desc: 'A moon carpeted in shed carapaces, where the Vashari harvest chitin for their hulls.' }] },
  { id: 'broodhollow', name: 'Broodhollow', faction: 'vashari', x: 345, y: 120, links: ['thrumhive', 'chitinreach', 'mountainhold'], danger: 2,
    stellars: [{ id: 'brood', name: 'The Brood Spire', kind: 'station', color: '#7a8a3a', r: 85, x: 200, y: 400, svc: 'LTOYB', tech: 7,
                 prices: P({ silk: -1, medical: 1, crystal: 1 }), desc: 'A living spire where Brood Queens are raised. Outsiders are welcome, and watched by ten thousand eyes.' }] },
  // ---- Korrund: the forge worlds of the north
  { id: 'slagforge', name: 'Slagforge', faction: 'korrund', x: 485, y: 175, links: ['meridian', 'halcyon', 'basaltdeep', 'mountainhold'], danger: 1,
    stellars: [{ id: 'slag', name: 'Slag', kind: 'planet', color: '#8a4a2a', r: 150, x: -300, y: 400, svc: 'LTOYB', tech: 6,
                 prices: P({ore: 1, gas: 1,  metal: -1, industrial: -1, food: 1, luxury: 1 }), desc: 'A volcanic world crusted in black glass, its rivers running orange. The Korrund forges never cool.' }] },
  { id: 'basaltdeep', name: 'Basalt Deep', faction: 'korrund', x: 555, y: 110, links: ['slagforge', 'mountainhold', 'facetfall'], danger: 2,
    stellars: [{ id: 'deepmine', name: 'Deepmine Anvil', kind: 'station', color: '#555', r: 70, x: 400, y: -300, svc: 'LTB', tech: 3, prices: P({ore: 1, gas: 1,  metal: -1, equipment: 1 }),
                 desc: 'A mining anvil sunk into an asteroid the size of a moon.' }] },
  { id: 'mountainhold', name: 'Mountainhold', faction: 'korrund', x: 455, y: 75, links: ['slagforge', 'basaltdeep', 'broodhollow'], danger: 2,
    stellars: [{ id: 'hold', name: 'The Hold', kind: 'planet', color: '#6a5a4a', r: 140, x: 300, y: 300, svc: 'LTOYB', tech: 7, prices: P({ metal: -1, medical: 1, food: 1 }),
                 desc: 'A world that is mostly mountain. The Korrund mountain-lords hold court inside its peaks.' }] },
  // ---- Ylith: the crystal reaches of the north-east
  { id: 'facetfall', name: 'Facetfall', faction: 'ylith', x: 680, y: 185, links: ['halcyon', 'basaltdeep', 'resonance', 'geodesy'], danger: 1,
    stellars: [{ id: 'facet', name: 'Facet', kind: 'planet', color: '#b07ad0', r: 140, x: 400, y: -300, svc: 'LTOYB', tech: 6, prices: P({shards: 1,  crystal: -1, luxury: -1, metal: 1 }),
                 desc: 'A world of crystal plains that ring when the wind blows. The Ylith tune their cities like instruments.' }] },
  { id: 'resonance', name: 'Resonance', faction: 'ylith', x: 745, y: 125, links: ['facetfall', 'geodesy'], danger: 2,
    stellars: [{ id: 'choirhall', name: 'The Choirhall', kind: 'station', color: '#c8a0e8', r: 80, x: -300, y: 300, svc: 'LTOYB', tech: 7, prices: P({shards: 1,  crystal: -1, food: 1 }),
                 desc: 'A floating hall of crystal where the great Ylith carriers are grown like frost.' }] },
  { id: 'geodesy', name: 'Geodesy', faction: 'ylith', x: 795, y: 215, links: ['facetfall', 'resonance', 'caravanserai'], danger: 2,
    stellars: [{ id: 'geode', name: 'Hollow Geode', kind: 'moon', color: '#7a5a8a', r: 90, x: 300, y: 300, svc: 'LTB', tech: 3, prices: P({ crystal: -1, industrial: 1 }),
                 desc: 'A moon split open to show a heart of violet crystal. Ylith freighters load here.' }] },
  // ---- Sarn: the caravan roads of the east
  { id: 'spokeroad', name: 'Spokeroad', faction: 'sarn', x: 700, y: 330, links: ['halcyon', 'caravanserai', 'wheelwright'], danger: 1,
    stellars: [{ id: 'spoke', name: 'The Spoke', kind: 'station', color: '#b08a50', r: 70, x: 300, y: -200, svc: 'LTOYB', tech: 5,
                 prices: P({ food: 0, luxury: -1, equipment: 1, silk: 1, crystal: 1 }), desc: 'A great wheel of a station where Sarn caravans gather. There is always music.' }] },
  { id: 'caravanserai', name: 'Caravanserai', faction: 'sarn', x: 785, y: 375, links: ['spokeroad', 'wheelwright', 'geodesy'], danger: 2,
    stellars: [{ id: 'serai', name: 'Serai', kind: 'planet', color: '#c8a060', r: 130, x: -400, y: 300, svc: 'LTOYB', tech: 7,
                 prices: P({ luxury: -1, food: -1, metal: 1, medical: 1 }), desc: 'A desert world of tents and brass towers where the Grand Caravans winter.' }] },
  { id: 'wheelwright', name: 'Wheelwright\'s Rest', faction: 'sarn', x: 715, y: 440, links: ['spokeroad', 'caravanserai', 'longhaul', 'tidepool'], danger: 2,
    stellars: [{ id: 'rest', name: 'The Rest', kind: 'moon', color: '#a0805a', r: 80, x: 300, y: 300, svc: 'LTB', tech: 2, prices: P({ equipment: -1, industrial: 1 }),
                 desc: 'A repair moon where Sarn wheelwrights straighten bent spokes and patch canvas.' }] },
  // ---- Thalassi: the ocean worlds of the south-east
  { id: 'tidepool', name: 'Tidepool', faction: 'thalassi', x: 640, y: 520, links: ['longhaul', 'wheelwright', 'coralwake', 'abyssal'], danger: 1,
    stellars: [{ id: 'tide', name: 'Tide', kind: 'planet', color: '#2a8aa0', r: 160, x: 400, y: 300, svc: 'LTOYB', tech: 6,
                 prices: P({gas: 1,  food: -1, medical: -1, metal: 1, industrial: 1 }), desc: 'A world of one endless ocean. The Thalassi rise to meet visitors in shining bells of living water.' }] },
  { id: 'coralwake', name: 'Coralwake', faction: 'thalassi', x: 725, y: 565, links: ['tidepool', 'abyssal'], danger: 2,
    stellars: [{ id: 'reef', name: 'The Reef', kind: 'station', color: '#3aa0a0', r: 80, x: -300, y: -300, svc: 'LTB', tech: 3, prices: P({ food: -1, luxury: 1 }),
                 desc: 'A coral reef grown in orbit, glowing pink and blue. Polyp Darts spawn here in clouds.' }] },
  { id: 'abyssal', name: 'Abyssal Trench', faction: 'thalassi', x: 650, y: 620, links: ['tidepool', 'coralwake', 'shoalight'], danger: 3,
    stellars: [{ id: 'deep', name: 'The Deep', kind: 'planet', color: '#103a50', r: 150, x: 300, y: 400, svc: 'LTOYB', tech: 7, prices: P({ medical: -1, crystal: 1, equipment: 1 }),
                 desc: 'A dark ocean world lit only by its creatures. The Abyssal Carriers are born here.' }] },
  // ---- Que'vari: the People of Light, to the south
  { id: 'farmouth', name: 'Far Mouth', faction: 'quevari', x: 505, y: 540, links: ['brightwater', 'quevar', 'shoalight', 'dimmer'], danger: 2,
    stellars: [{ id: 'threshold', name: 'Threshold Spire', kind: 'station', color: '#dde8f0', r: 70, x: -300, y: 200, svc: 'LTB', tech: 3, land: 10958,
                 prices: P({ luxury: 0, medical: 1, crystal: 1 }), desc: 'A white spire at the edge of Que\'vari space, where the People of Light greet strangers.' }] },
  { id: 'quevar', name: 'Que\'var', faction: 'quevari', x: 455, y: 610, links: ['farmouth', 'shoalight', 'dimmer'], danger: 1,
    stellars: [{ id: 'inalumen', name: 'Ina Lumen', kind: 'planet', color: '#cfe4f8', r: 160, x: 300, y: -300, svc: 'LTOYB', tech: 7, land: 10957,
                 prices: P({ luxury: -1, crystal: 1, food: 1 }), desc: 'The Que\'vari homeworld: white cities under sails of light-blue energy fabric.' }] },
  { id: 'shoalight', name: 'Shoalight', faction: 'quevari', x: 555, y: 630, links: ['farmouth', 'quevar', 'abyssal'], danger: 2,
    stellars: [{ id: 'glasswind', name: 'Glasswind Station', kind: 'station', color: '#b0d0e8', r: 65, x: 300, y: 300, svc: 'LTOB', tech: 5,
                 prices: P({ crystal: -1, industrial: 1 }), desc: 'A Que\'vari sail-yard where electro-sails are woven and mended.' }] },
  // ---- The Umbral (hostile)
  { id: 'dimmer', name: 'Dimmer Reach', faction: 'umbral', x: 380, y: 620, links: ['farmouth', 'quevar', 'gloam', 'umbra'], danger: 5, stellars: [] },
  { id: 'umbra', name: 'Umbra', faction: 'umbral', x: 315, y: 665, links: ['dimmer', 'cinderverge'], danger: 6,
    stellars: [{ id: 'umbra-heart', name: 'The Dark Heart', kind: 'planet', color: '#2a1a30', r: 170, x: 0, y: 0, svc: '', tech: 0, desc: 'A world that drinks light.' }] },
];
expandGalaxy(SYSTEMS, FACTIONS);
// Derelict station hulls scattered across the galaxy: each can be claimed by one captain and built up through Ops 1-5.
export const SITES = [
  ['site-qgate', 'qgate', -600, -1000], ['site-meridian', 'meridian', -900, -500], ['site-halcyon', 'halcyon', 700, 600], ['site-waystation', 'waystation', 900, -600], ['site-longhaul', 'longhaul', -300, -900],
  ['site-brightwater', 'brightwater', -800, -300], ['site-emberlight', 'emberlight', -700, -500], ['site-gloam', 'gloam', -900, 600], ['site-thrumhive', 'thrumhive', -800, -600],
  ['site-slagforge', 'slagforge', 800, -500], ['site-facetfall', 'facetfall', -700, 500], ['site-spokeroad', 'spokeroad', -800, 600], ['site-tidepool', 'tidepool', -700, -600],
  ['site-farmouth', 'farmouth', 600, -700], ['site-chitinreach', 'chitinreach', 700, 500], ['site-basaltdeep', 'basaltdeep', -600, 600], ['site-geodesy', 'geodesy', -700, -500],
  ...frontierSites(SYSTEMS, 10),
].map(([id, system, x, y]) => ({ id, system, x, y, name: 'Derelict Station Hull', kind: 'site', color: '#887', r: 60, svc: 'L', tech: 0, site: true,
  desc: 'A gutted Concord station hull, adrift but sound. Claim it and it becomes your Personal Station: dock, refinery, lab and shipyard.' }));
for (const st of SITES) SYSTEMS.find(s => s.id === st.system).stellars.push(st);
addSolGateway(SYSTEMS);   // 0.8: Sol (with Earth and the Gateway wormhole) and the ten Farside systems
export const SYS = Object.fromEntries(SYSTEMS.map(s => [s.id, s]));
export const STELLARS = Object.fromEntries(SYSTEMS.flatMap(s => s.stellars.map(p => [p.id, { ...p, system: s.id }])));
// prices at a built Personal Station (Ops 1+)
export const SITE_PRICES = { food: 0, industrial: 0, medical: 0, equipment: 0, metal: 0, luxury: 0, ore: 0, gas: 0, shards: 0 };
export const START = { system: 'qgate', stellar: 'qstation', credits: 30000, ship: 703 };

// Which hulls each faction builds and flies (ship IDs from the EV Quantum roster)
export const COMMON_HULLS = [703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717];
export const FACTION_HULLS = {
  quantum: COMMON_HULLS, spacer: [703, 704, 706, 707, 709, 710, 712, 714], lamp: [705, 706, 707, 711, 713, 715],
  hollow: [705, 708, 711, 716], quevari: [738, 739, 740, 741, 742, 743], umbral: [760, 761, 762, 763, 764],
  vashari: [765, 766, 767, 788, 768, 769, 789], korrund: [790, 770, 771, 772, 791, 773, 792, 774],
  ylith: [775, 793, 794, 776, 777, 778, 779, 795], sarn: [780, 796, 781, 782, 797, 783, 784], thalassi: [798, 799, 800, 801, 802, 803, 804],
  farside: COMMON_HULLS,   // beyond the Sol Gateway: common hulls only, no racial designs
};
// NPC roles per faction: trader ships and warships (for traffic generation)
export const TRAFFIC = {
  quantum: { traders: [704, 706, 712, 714, 703], war: [708, 711, 713, 716, 717] },
  spacer: { traders: [703, 704, 706, 710, 712, 714, 709], war: [705, 708, 711] },
  lamp: { traders: [706, 707], war: [711, 713, 715] },
  hollow: { traders: [], war: [705, 708, 711, 716] },
  quevari: { traders: [738, 739], war: [740, 741, 742, 743] },
  umbral: { traders: [], war: [760, 761, 762, 763, 764] },
  vashari: { traders: [766, 765], war: [767, 788, 768, 769, 789] },
  korrund: { traders: [770, 772], war: [771, 791, 773, 792, 774] },
  ylith: { traders: [794, 776, 775], war: [793, 777, 778, 779, 795] },
  sarn: { traders: [780, 781, 783, 784], war: [796, 782, 797] },
  thalassi: { traders: [799, 800], war: [801, 802, 803, 804] },
  frontier: { traders: [703, 704, 706, 710, 712, 780, 770], war: [705, 708, 711] },
  deep: { traders: [], war: [760, 761, 762, 763, 764] },
  farside: { traders: [703, 704, 706, 707, 712, 714], war: [705, 708, 709, 710, 711, 713] },
  swarm: { traders: [], war: [765, 718] },
  eclipse: { traders: [], war: [761, 762, 763] },
};
// weapons each faction's outfitters sell, on top of the generic ones
export const FACTION_OUTFITS = {
  quevari: [444, 445, 446, 447, 448, 449, 450, 451, 452, 453],
  lamp: [604], quantum: [605, 606, 608, 609, 610, 611, 612],
};
// Generic Rift weapon outfits for the classic weapons the hulls carry (the mod used Nova's own outfits for these)
export const EXTRA_OUTFITS = [
  { id: 9001, name: 'Light Blaster', eff: { weapon: 128 }, cost: 12000, mass: 2, max: 8, tech: 1, gun: true, desc: 'A cheap, reliable energy blaster.' },
  { id: 9002, name: 'Medium Blaster', eff: { weapon: 129 }, cost: 30000, mass: 3, max: 8, tech: 2, gun: true, desc: 'A heavier blaster with a satisfying thump.' },
  { id: 9003, name: 'Light Blaster Turret', eff: { weapon: 130 }, cost: 30000, mass: 4, max: 4, tech: 2, turret: true, desc: 'A swivelling light blaster.' },
  { id: 9004, name: 'Medium Blaster Turret', eff: { weapon: 131 }, cost: 70000, mass: 6, max: 4, tech: 3, turret: true, desc: 'A swivelling medium blaster.' },
  { id: 9005, name: 'Heavy Blaster Turret', eff: { weapon: 132 }, cost: 180000, mass: 12, max: 4, tech: 5, turret: true, desc: 'Big, slow, and devastating.' },
  { id: 9006, name: 'Pulse Laser', eff: { weapon: 146 }, cost: 90000, mass: 4, max: 6, tech: 3, gun: true, desc: 'Fires short bursts of laser light.' },
  { id: 9007, name: 'Railgun (100mm)', eff: { weapon: 156 }, cost: 80000, mass: 6, max: 4, tech: 3, gun: true, desc: 'A magnetic slug thrower with long reach.' },
  { id: 9008, name: 'Railgun (200mm)', eff: { weapon: 158 }, cost: 220000, mass: 12, max: 4, tech: 5, gun: true, desc: 'A heavy slug thrower that hits like a falling moon.' },
  { id: 9009, name: 'IR Missile Launcher', eff: { weapon: 134 }, cost: 60000, mass: 5, max: 4, tech: 2, gun: true, desc: 'Fires heat-seeking missiles.' },
  { id: 9010, name: 'IR Missile', eff: { ammo: 134 }, cost: 500, mass: 0, max: 60, tech: 2, desc: 'Ammunition for the IR Missile Launcher.' },
  { id: 9011, name: 'Venom Spitter', eff: { weapon: 344 }, cost: 120000, mass: 5, max: 6, tech: 4, gun: true, faction: 'vashari', desc: 'A Vashari bio-cannon that spits corrosive globs.' },
  { id: 9012, name: 'Magma Cannon', eff: { weapon: 345 }, cost: 240000, mass: 14, max: 4, tech: 5, turret: true, faction: 'korrund', desc: 'A Korrund turret that hurls molten slag.' },
  { id: 9013, name: 'Resonance Beam', eff: { weapon: 346 }, cost: 280000, mass: 8, max: 4, tech: 5, turret: true, faction: 'ylith', desc: 'A Ylith crystal beam that sings as it cuts.' },
  { id: 9014, name: 'Scrap Flak Turret', eff: { weapon: 347 }, cost: 70000, mass: 6, max: 4, tech: 3, turret: true, faction: 'sarn', desc: 'A Sarn turret that throws a cloud of scrap.' },
  { id: 9015, name: 'Stinger Beam', eff: { weapon: 355 }, cost: 260000, mass: 7, max: 4, tech: 5, turret: true, faction: 'thalassi', desc: 'A Thalassi stinger that leaves systems twitching.' },
  { id: 9016, name: 'Storm Chaingun', eff: { weapon: 161 }, cost: 110000, mass: 6, max: 2, tech: 4, turret: true, desc: 'Point defense: shreds missiles and fighters.' },
  // mining (0.4): mining weapons crack asteroids six times faster than combat weapons
  { id: 9017, name: 'Mining Blaster', eff: { weapon: 181 }, cost: 9000, mass: 2, max: 4, tech: 1, gun: true, desc: 'A low-power blaster tuned to crack rock. Six times as effective on asteroids as a combat gun.' },
  { id: 9018, name: 'Mining Laser', eff: { weapon: 9101 }, cost: 45000, mass: 4, max: 4, tech: 2, gun: true, desc: 'A continuous cutting beam for asteroid work. Weak against shields.' },
  { id: 9019, name: 'Heavy Mining Laser', eff: { weapon: 9102 }, cost: 160000, mass: 9, max: 2, tech: 4, turret: true, desc: 'A turret-mounted industrial cutter. Strips a rock in seconds.' },
];
// weapons added by Quantum Rift (merged into the asset weapons by augmentAssets)
export const EXTRA_WEAPONS = [
  { id: 9101, name: 'Mining Laser', type: 'beam', dmgA: 3, dmgS: 1, reload: 0, speed: 0, duration: 0, inacc: 0, sound: 0, blast: 0, beamLen: 300, color: '#ffe27a', ion: 0, burst: 0, ammo: -1, mining: true },
  { id: 9102, name: 'Heavy Mining Laser', type: 'turretbeam', dmgA: 6, dmgS: 2, reload: 0, speed: 0, duration: 0, inacc: 0, sound: 0, blast: 0, beamLen: 380, color: '#ffb84a', ion: 0, burst: 0, ammo: -1, mining: true },
];
export const MINING_WEAPONS = [181, 9101, 9102];
// ore processing at your Personal Station (Ops 1+): 12 units make one material crate; better stations refine higher grades
export const ORE_PROCESS = { per: 12, cost: 1500, to: { ore: 'alloy', gas: 'isotope', shards: 'crystal' }, grade: [0, 0, 0, 1, 1, 2] };
// Quantum Station: Ops levels, research, refinery
export const OPS = [
  { lv: 1, title: 'Restore Docking', cost: 10000, mats: [['alloy', 0, 1]], unlock: 'Refinery and the station market' },
  { lv: 2, title: 'Market & Refinery', cost: 60000, mats: [['alloy', 1, 1], ['crystal', 0, 1]], unlock: 'Research lab, faster refinery' },
  { lv: 3, title: 'Shipyard, Lab & Warp Core', cost: 180000, mats: [['alloy', 2, 1], ['crystal', 1, 1], ['isotope', 0, 1]], unlock: 'Mk II refits, Halo Surveyor' },
  { lv: 4, title: 'Academy & Refinery Mk II', cost: 400000, mats: [['alloy', 3, 1], ['crystal', 2, 1], ['isotope', 1, 1]], unlock: 'Wingmates, refinery Mk II' },
  { lv: 5, title: 'Defense Grid', cost: 900000, mats: [['alloy', 4, 1], ['crystal', 3, 1], ['isotope', 2, 1]], unlock: 'Mk III rebuilds, Armada, Exotics, Constitution' },
];
export { RESEARCH2 as RESEARCH } from './hangar.js';   // 0.5: four research trees (see shared/hangar.js)
export const REFINERY = { minutes: [0, 20, 15, 15, 10, 8], silo: 3 };   // minutes per unit by Ops level
// Ships the station sells by Ops level (Halo Surveyor, Mk II refits at 3; wingmates at 4; armada, Mk III, Exotics, Constitution at 5)
export const STATION_SHIPS = { 3: [735], 5: [736, 785, 786, 787] };
export const MK2_OF = { 703: 720, 705: 721, 704: 722, 708: 723, 706: 724, 707: 725, 709: 726, 710: 727, 711: 728, 712: 729, 713: 730, 714: 731, 715: 732, 716: 733, 717: 734 };
export const MK3_OF = { 723: 745, 730: 746, 728: 747, 732: 748, 733: 749, 734: 750 };
export const WINGMATES = [751, 752, 753, 754, 755, 756];
export const ARMADA = [757, 758, 759];
