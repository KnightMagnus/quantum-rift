export type HazardDefinition = {
  period: number;
  on: number;
  warning: number;
  x: number;
  y: number;
  r: number;
  drain: number;
};
export type SceneDefinition = {
  kind: string;
  scale?: number;
  rotation?: number;
  hazard?: HazardDefinition;
  [entryKey: string]: unknown;
};
import type { OutfitAsset, WeaponAsset } from './rules.ts';

/** Faction organization attributes and diplomatic relationships. */
export type FactionDef = {
  /** Full display name of the faction. */
  name: string;

  /** Short colloquial moniker. */
  short: string;

  /** Hex color code representing this faction. */
  color: string;

  /** IDs of factions considered hostile. */
  hostile: string[];

  /** Whether this faction engages in piracy. */
  pirate?: boolean;

  /** Hostile by default to all standard factions. */
  alwaysHostile?: boolean;

  /** Marker indicating this is an unaligned territorial region. */
  region?: boolean;

  /** Marker indicating Farside sector alignment. */
  farside?: boolean;

  /** Whether this faction is excluded from standing reputation views. */
  hidden?: boolean;
};

/** Tradable market commodity specification. */
export type CommodityDef = {
  /** Unique commodity identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Standard baseline price in credits. */
  base: number;
  /** Whether this commodity is mined directly from asteroid fields or gas clouds. */
  mined?: boolean;
};
export type RawStellarBody = {
  /**
   * Whether this is a central hub station
   * True if this is the central hub station (Quantum Station).
   */
  hub?: number | boolean;
  land?: string | number;

  /** Destination stellar ID for wormhole transit. */
  exit?: string;
  gen?: boolean;

  /**
   * Whether this stellar body is a wormhole gate
   * Destination system ID for wormhole transit.
   * Gateway destination system.
   */
  wormhole?: string;

  /**
   * True if outlaw haven with no reputation restrictions.
   * Outlaw port access.
   */
  outlaw?: boolean;

  /**
   * Unique identifier for the stellar body
   * Stellar identifier.
   * Unique stellar identifier.
   */
  id: string;

  /**
   * Display name of the planet, station, or wormhole
   * Stellar display name.
   * Display name of the body.
   */
  name: string;

  /**
   * Category of body (e.g. 'planet', 'station', 'moon', 'field', 'site').
   * Type of stellar ('planet', 'station', 'site', 'wormhole').
   */
  kind: string;

  /** Display render hex color. */
  color?: string;

  /**
   * Radius in game units
   * Radius of body.
   * Collision and render radius.
   */
  r: number;

  /**
   * World X coordinate
   * Position X in system.
   * Relative system orbit coordinate X.
   */
  x: number;

  /**
   * World Y coordinate
   * Position Y in system.
   * Relative system orbit coordinate Y.
   */
  y: number;

  /**
   * Service flags (e.g. 'L' land, 'T' trade, 'Y' shipyard, 'O' outfit)
   * Service flags string ('L' for land, 'T' for trade, 'Y' for shipyard, 'O' for outfitter, 'B' for bar/bounty, etc.).
   * Port services available: L (land), T (trade), O (outfitter), Y (shipyard), B (bar), R (repair/refuel).
   */
  svc?: string;

  /**
   * Tech level available for purchase.
   * Outfitter tech level.
   */
  tech?: number;

  /**
   * Lore description
   * Lore description text.
   */
  desc?: string;

  /**
   * Custom commodity price overrides.
   * Market trading price offsets (-1 low, 0 standard, 1 high).
   */
  prices?: Record<string, number>;

  /**
   * Whether this is a special POI site
   * True if this is a derelict/claimable Personal Station site.
   * True if this stellar body is a claimable derelict station hull.
   */
  site?: boolean;

  /**
   * System ID where this stellar is located.
   * ID of parent star system.
   */
  system?: string;
};

/** Celestial body (planet, moon, station, asteroid field, or claimable site) orbiting within a star system. */
export type StellarBody = RawStellarBody & {
  /**
   * System ID where this stellar is located.
   * ID of parent star system.
   */
  system: string;
  /**
   * Service flags string ('L' for land, 'T' for trade, 'Y' for shipyard, 'O' for outfitter, 'B' for bar/bounty, etc.).
   * Port services available: L (land), T (trade), O (outfitter), Y (shipyard), B (bar), R (repair/refuel).
   */
  svc: string;
};

/** Star system record defining coordinates, hyperlane links, and celestial bodies. */
export type StarSystem = {
  gen?: boolean;
  sol?: boolean;

  /** True if anchor system for exploration. */
  anchor?: boolean;
  eventide?: boolean;
  scene?: SceneDefinition;

  /**
   * True if this is a combat arena system.
   * Isolated arena space.
   */
  arena?: boolean;

  /**
   * True if located on the far side of the Sol Gateway.
   * Gateway far-side system, without ambient newcomer truce.
   */
  farside?: boolean;

  /**
   * System identifier
   * Unique system ID (e.g. 'sol', 'meridian').
   * Unique system identifier.
   */
  id: string;

  /**
   * System display name
   * Display name of the system.
   * Display name.
   */
  name: string;

  /**
   * Controlling faction ID
   * System controlling faction ID.
   * Dominant faction ID.
   */
  faction: string;

  /**
   * Galactic coordinate X
   * Coordinate on galaxy map.
   * Map coordinate X.
   */
  x: number;

  /**
   * Galactic coordinate Y
   * Coordinate on galaxy map.
   * Map coordinate Y.
   */
  y: number;

  /**
   * Connected system IDs
   * Connected hyperlanes system IDs.
   * Hyperlane destination system IDs.
   */
  links: string[];

  /**
   * Stellar bodies located in this system
   * Planets, stations, sites, and wormholes in this system.
   * Orbiting planets, stations, and derelict sites.
   */
  stellars: RawStellarBody[];

  /**
   * Danger rating index
   * Danger level (0-5).
   * Threat level / security rating.
   */
  danger: number;

  /**
   * Wormhole destination system ID if present
   * True if system contains a wormhole or gateway.
   * Wormhole destination system if a gateway is present.
   */
  gate?: string;

  /**
   * Mining asteroid fields.
   * Asteroid or resource field locations.
   */
  fields?: Array<{
    id?: string;
    x: number;
    y: number;
    r: number;
    ore: string;
    rich: number;
    rocks: number;
    minor?: boolean;
    industrial?: boolean;
  }>;

  /** System lore notes. */
  desc?: string;
};

/** Station Ops upgrade milestone level definition. */
export type OpsLevelDef = {
  /** Ops tier index (1 through 5). */
  lv: number;

  /** Milestone level name. */
  title: string;

  /** Construction credit cost. */
  cost: number;

  /** Material crates required [matType, gradeIndex, quantity]. */
  mats: Array<[string, number, number]>;

  /** Feature unlock summary. */
  unlock: string;
};
import { fnv1a } from './deterministic-random.ts';
import { addEventide } from './eventide.ts';
import { expandGalaxy, frontierSites, addSolGateway, addMoonsAndFields } from './gen.ts';

// Quantum Rift: the galaxy. 30 hand-made anchor systems, grown to ~200 by shared/gen.js (deterministic).
// Shared by the server (authoritative) and the browser client (map, landing screens).

/**
 * Master catalog of all galactic factions and territorial powers.
 */
export const FACTIONS: Record<string, FactionDef> = {
  quantum: {
    name: 'Quantum Concord',
    short: 'Concord',
    color: '#7fb8ff',
    hostile: ['umbral', 'hollow'],
  },
  spacer: {
    name: 'Free Spacers',
    short: 'Spacer',
    color: '#78be8c',
    hostile: ['hollow', 'umbral'],
  },
  lamp: {
    name: 'Lamplighters',
    short: 'Lamplighter',
    color: '#e6aa3c',
    hostile: ['hollow', 'umbral'],
  },
  hollow: {
    name: 'The Hollow',
    short: 'Hollow',
    color: '#b04040',
    hostile: ['quantum', 'spacer', 'lamp', 'sarn', 'thalassi'],
    pirate: true,
  },
  quevari: { name: "Que'vari", short: "Que'vari", color: '#bee1ff', hostile: ['umbral'] },
  umbral: {
    name: 'The Umbral',
    short: 'Umbral',
    color: '#8a3a9a',
    alwaysHostile: true,
    hostile: [
      'quantum',
      'spacer',
      'lamp',
      'quevari',
      'vashari',
      'korrund',
      'ylith',
      'sarn',
      'thalassi',
    ],
    pirate: true,
  },
  vashari: { name: 'The Vashari', short: 'Vashari', color: '#96dc46', hostile: ['umbral'] },
  korrund: {
    name: 'The Korrund',
    short: 'Korrund',
    color: '#e66e28',
    hostile: ['umbral', 'hollow'],
  },
  ylith: { name: 'The Ylith', short: 'Ylith', color: '#e682fa', hostile: ['umbral'] },
  sarn: { name: 'The Sarn', short: 'Sarn', color: '#d2a050', hostile: ['umbral', 'hollow'] },
  thalassi: {
    name: 'The Thalassi',
    short: 'Thalassi',
    color: '#3cc8d2',
    hostile: ['umbral', 'hollow'],
  },
  // regions, not powers: no ships fly under these flags (traffic there is drawn from the neighbours, raiders and scavengers)
  frontier: {
    name: 'Unclaimed Frontier',
    short: 'Frontier',
    color: '#9a9aa6',
    hostile: [],
    region: true,
  },
  farside: {
    name: 'Farside Settlers',
    short: 'Farside',
    color: '#d8c890',
    hostile: ['hollow'],
    farside: true,
  },
  deep: { name: 'The Deep', short: 'Deep', color: '#4a5a9a', hostile: [], region: true },
  // the Feral Swarm: wild Vashari drone clusters, hostile to everyone (not a power: no territory, no store, no standing)
  swarm: {
    name: 'Feral Swarm',
    short: 'Swarm',
    color: '#a8c840',
    hostile: [
      'quantum',
      'spacer',
      'lamp',
      'quevari',
      'vashari',
      'korrund',
      'ylith',
      'sarn',
      'thalassi',
      'hollow',
    ],
    alwaysHostile: true,
    hidden: true,
    region: true,
  },
  // the Umbral Eclipse: violet-lit Umbral cells that roam far from home (hostile to all; no territory, store or standing)
  eclipse: {
    name: 'Umbral Eclipse',
    short: 'Eclipse',
    color: '#e682fa',
    hostile: [
      'quantum',
      'spacer',
      'lamp',
      'quevari',
      'vashari',
      'korrund',
      'ylith',
      'sarn',
      'thalassi',
    ],
    alwaysHostile: true,
    hidden: true,
    region: true,
  },
};

/**
 * List of commodities traded across markets and harvested from asteroids.
 */
export const COMMODITIES: CommodityDef[] = [
  { id: 'plasma', name: 'Stellar Plasma', base: 500 },
  { id: 'quantum_fuel', name: 'Quantum Fuel', base: 1200 },
  { id: 'exotic_matter', name: 'Exotic Matter', base: 1800 },
  { id: 'alloy_ingots', name: 'Alloy Ingots', base: 360 },
  { id: 'fuel_cells', name: 'Fuel Cells', base: 560 },
  { id: 'cut_crystal', name: 'Cut Crystal', base: 920 },
  { id: 'composite_plating', name: 'Composite Plating', base: 2400 },
  { id: 'food', name: 'Food', base: 120 },
  { id: 'industrial', name: 'Industrial Goods', base: 260 },
  { id: 'medical', name: 'Medical Supplies', base: 420 },
  { id: 'luxury', name: 'Luxury Goods', base: 650 },
  { id: 'metal', name: 'Metal', base: 200 },
  { id: 'equipment', name: 'Equipment', base: 520 },
  { id: 'crystal', name: 'Resonant Crystal', base: 900 },
  { id: 'silk', name: 'Vashari Silk', base: 780 },
  // mined from asteroid fields and gas clouds
  { id: 'ore', name: 'Raw Ore', base: 90, mined: true },
  { id: 'gas', name: 'Volatile Gas', base: 140, mined: true },
  { id: 'shards', name: 'Crystal Shards', base: 230, mined: true },
];

/**
 * Station crafting material types stored in the materials hold.
 */
// Quantum Station materials (kept in the materials hold, not cargo). Grades I-V.
export const MATERIALS: string[] = ['alloy', 'crystal', 'isotope'];

/**
 * Material grade designation roman numerals (Grades I through V).
 */
export const GRADES: string[] = ['I', 'II', 'III', 'IV', 'V'];

/**
 * Helper function normalizing price level definitions for stellar bodies.
 * @param options - Map of commodity ID to price tier (-1, 0, 1).
 * @returns Normalized price map.
 */
// price levels per stellar: -1 low (they produce it), 0 normal, 1 high (they want it). Unlisted = not traded.
const position = (options: Record<string, number>) => options;

/**
 * Roster of core anchor systems in the galaxy, expanded programmatically to ~200 systems by expandGalaxy.
 */
// services: L land, T trade, O outfitter, Y shipyard, B bar (mission board), R refuel/repair (always with L)
export const SYSTEMS: StarSystem[] = [
  // ---- Quantum Concord: the heart of the Rift, home of Quantum Station
  {
    id: 'qgate',
    name: 'Concordia',
    faction: 'quantum',
    x: 500,
    y: 350,
    links: ['meridian', 'halcyon', 'waystation', 'longhaul', 'brightwater'],
    danger: 0,
    stellars: [
      {
        id: 'qstation',
        name: 'Quantum Station',
        kind: 'hub',
        color: '#9ab',
        r: 330,
        x: 1100,
        y: -800,
        svc: 'LTOYB',
        tech: 6,
        hub: true,
        land: 10955,
        prices: position({
          ore: 0,
          gas: 0,
          shards: 0,
          food: 1,
          medical: 0,
          equipment: -1,
          metal: 1,
          luxury: 0,
        }),
        desc: "Quantum Station: the Concord's colossal ring station at the heart of the Rift, turning slowly around its quantum core. Every captain passes through its docks. Its notice boards list every Personal Station claimed across the galaxy.",
      },
      {
        id: 'concordia',
        name: 'Concordia',
        kind: 'planet',
        color: '#4a7fc8',
        r: 150,
        x: -900,
        y: 600,
        svc: 'LTOYB',
        tech: 5,
        prices: position({ food: -1, industrial: 0, luxury: 1, equipment: 0, medical: 0 }),
        desc: "A blue ocean world under a dome of orbital mirrors. The Concord's capital, busy and bright.",
      },
    ],
  },
  {
    id: 'meridian',
    name: 'Meridian',
    faction: 'quantum',
    x: 435,
    y: 295,
    links: ['qgate', 'hesper', 'slagforge', 'thrumhive'],
    danger: 1,
    stellars: [
      {
        id: 'meridian-yards',
        name: 'Meridian Yards',
        kind: 'station',
        color: '#889',
        r: 60,
        x: 500,
        y: 300,
        svc: 'LTOYB',
        tech: 7,
        prices: position({ ore: 1, gas: 0, metal: 1, industrial: -1, equipment: -1 }),
        desc: "The Concord's shipyards: ten kilometres of slipways and the smell of hot metal.",
      },
    ],
  },
  {
    id: 'halcyon',
    name: 'Halcyon',
    faction: 'quantum',
    x: 565,
    y: 300,
    links: ['qgate', 'facetfall', 'spokeroad', 'slagforge'],
    danger: 1,
    stellars: [
      {
        id: 'halcyon-prime',
        name: 'Halcyon Prime',
        kind: 'planet',
        color: '#7ab878',
        r: 130,
        x: -600,
        y: -400,
        svc: 'LTOB',
        tech: 4,
        prices: position({ food: -1, luxury: 0, medical: 1, crystal: 1 }),
        desc: 'Garden terraces and quiet harbors. Rich captains retire here.',
      },
    ],
  },
  // ---- Free Spacers: the trade lanes
  {
    id: 'waystation',
    name: 'Waystation',
    faction: 'spacer',
    x: 420,
    y: 395,
    links: ['qgate', 'emberlight', 'brightwater', 'gloam'],
    danger: 1,
    stellars: [
      {
        id: 'waystation-hub',
        name: 'Waystation Hub',
        kind: 'station',
        color: '#8a9',
        r: 55,
        x: -300,
        y: 300,
        svc: 'LTOYB',
        tech: 3,
        prices: position({
          ore: 0,
          gas: 0,
          shards: 0,
          food: 0,
          industrial: 0,
          medical: 0,
          luxury: 0,
          metal: 0,
          equipment: 0,
        }),
        desc: 'A crossroads market where every lane in the Rift meets. Everything is for sale, for a price.',
      },
    ],
  },
  {
    id: 'longhaul',
    name: 'Longhaul',
    faction: 'spacer',
    x: 590,
    y: 400,
    links: ['qgate', 'brightwater', 'wheelwright', 'tidepool'],
    danger: 1,
    stellars: [
      {
        id: 'longhaul-depot',
        name: 'Longhaul Depot',
        kind: 'station',
        color: '#998',
        r: 55,
        x: 400,
        y: -250,
        svc: 'LTYB',
        tech: 3,
        prices: position({ metal: -1, food: 1, industrial: 0, silk: 1 }),
        desc: 'Fuel, food and freight contracts. The Spacer families keep their records here.',
      },
      {
        id: 'cartwheel',
        name: 'Cartwheel',
        kind: 'moon',
        color: '#a99',
        r: 70,
        x: -700,
        y: 500,
        svc: 'LTB',
        tech: 1,
        prices: position({ food: -1, equipment: 1 }),
        desc: 'A frozen moon with a single dome and a very good bar.',
      },
    ],
  },
  {
    id: 'brightwater',
    name: 'Brightwater',
    faction: 'spacer',
    x: 505,
    y: 445,
    links: ['qgate', 'waystation', 'longhaul', 'farmouth'],
    danger: 1,
    stellars: [
      {
        id: 'brightwater-iv',
        name: 'Brightwater IV',
        kind: 'planet',
        color: '#5aa0b8',
        r: 140,
        x: 600,
        y: 500,
        svc: 'LTOB',
        tech: 3,
        prices: position({ food: -1, medical: -1, luxury: 1, equipment: 1 }),
        desc: 'A water world of floating towns. Free Spacers come here to marry, trade and mend their ships.',
      },
    ],
  },
  // ---- Lamplighters
  {
    id: 'hesper',
    name: 'Hesper',
    faction: 'lamp',
    x: 335,
    y: 315,
    links: ['meridian', 'emberlight', 'thrumhive'],
    danger: 1,
    stellars: [
      {
        id: 'lanternfall',
        name: 'Lanternfall',
        kind: 'station',
        color: '#c96',
        r: 75,
        x: -200,
        y: -300,
        svc: 'LTOYB',
        tech: 5,
        land: 10950,
        prices: position({ luxury: -1, medical: 1, metal: 1 }),
        desc: 'A ring of dark metal kilometres across, warm light leaking through every seam. The Lamplighters have lived here longer than anyone remembers.',
      },
    ],
  },
  {
    id: 'emberlight',
    name: 'Emberlight',
    faction: 'lamp',
    x: 300,
    y: 385,
    links: ['hesper', 'waystation', 'gloam'],
    danger: 2,
    stellars: [
      {
        id: 'vigil-lamp',
        name: "Keeper's Vigil",
        kind: 'planet',
        color: '#c8843c',
        r: 120,
        x: 500,
        y: 200,
        svc: 'LTB',
        tech: 2,
        prices: position({ food: 1, industrial: -1 }),
        desc: 'An amber desert world with a lamp burning on every hilltop.',
      },
    ],
  },
  // ---- The Hollow (pirates)
  {
    id: 'gloam',
    name: 'Gloam',
    faction: 'hollow',
    x: 255,
    y: 465,
    links: ['emberlight', 'waystation', 'cinderverge', 'dimmer'],
    danger: 4,
    stellars: [
      {
        id: 'gloam-remnant',
        name: 'Gloam Remnant',
        kind: 'moon',
        color: '#666',
        r: 90,
        x: 300,
        y: -400,
        svc: 'LTB',
        tech: 2,
        outlaw: true,
        prices: position({ luxury: -1, equipment: -1, medical: 1, food: 1 }),
        desc: 'A shattered moon in a cloud of wreckage. Nobody here asks where your cargo came from.',
      },
    ],
  },
  {
    id: 'cinderverge',
    name: 'Cinder Verge',
    faction: 'hollow',
    x: 195,
    y: 530,
    links: ['gloam', 'umbra'],
    danger: 5,
    stellars: [
      {
        id: 'cinder-hold',
        name: 'Cinder Hold',
        kind: 'station',
        color: '#844',
        r: 70,
        x: -300,
        y: 200,
        svc: 'LTOYB',
        tech: 4,
        outlaw: true,
        prices: position({ ore: 0, shards: 1, equipment: -1, metal: -1, luxury: 1 }),
        desc: "A gutted battleship grown over with salvage scaffolds: the Hollow's fortress and black market.",
      },
    ],
  },
  // ---- Vashari: the hive worlds of the north-west
  {
    id: 'thrumhive',
    name: 'Thrumhive',
    faction: 'vashari',
    x: 300,
    y: 205,
    links: ['meridian', 'hesper', 'chitinreach', 'broodhollow'],
    danger: 1,
    stellars: [
      {
        id: 'thrum',
        name: 'Thrum',
        kind: 'planet',
        color: '#6e9a2e',
        r: 160,
        x: 400,
        y: 300,
        svc: 'LTOYB',
        tech: 6,
        prices: position({ silk: -1, food: 0, metal: 1, equipment: 1 }),
        desc: 'A jungle world humming with the wings of a billion Vashari. The hive-spires are grown, not built.',
      },
    ],
  },
  {
    id: 'chitinreach',
    name: 'Chitin Reach',
    faction: 'vashari',
    x: 235,
    y: 150,
    links: ['thrumhive', 'broodhollow'],
    danger: 2,
    stellars: [
      {
        id: 'molt',
        name: 'Moltfield',
        kind: 'moon',
        color: '#5a6a30',
        r: 80,
        x: -400,
        y: -200,
        svc: 'LTB',
        tech: 2,
        prices: position({ silk: -1, industrial: 1 }),
        desc: 'A moon carpeted in shed carapaces, where the Vashari harvest chitin for their hulls.',
      },
    ],
  },
  {
    id: 'broodhollow',
    name: 'Broodhollow',
    faction: 'vashari',
    x: 345,
    y: 120,
    links: ['thrumhive', 'chitinreach', 'mountainhold'],
    danger: 2,
    stellars: [
      {
        id: 'brood',
        name: 'The Brood Spire',
        kind: 'station',
        color: '#7a8a3a',
        r: 85,
        x: 200,
        y: 400,
        svc: 'LTOYB',
        tech: 7,
        prices: position({ silk: -1, medical: 1, crystal: 1 }),
        desc: 'A living spire where Brood Queens are raised. Outsiders are welcome, and watched by ten thousand eyes.',
      },
    ],
  },
  // ---- Korrund: the forge worlds of the north
  {
    id: 'slagforge',
    name: 'Slagforge',
    faction: 'korrund',
    x: 485,
    y: 175,
    links: ['meridian', 'halcyon', 'basaltdeep', 'mountainhold'],
    danger: 1,
    stellars: [
      {
        id: 'slag',
        name: 'Slag',
        kind: 'planet',
        color: '#8a4a2a',
        r: 150,
        x: -300,
        y: 400,
        svc: 'LTOYB',
        tech: 6,
        prices: position({ ore: 1, gas: 1, metal: -1, industrial: -1, food: 1, luxury: 1 }),
        desc: 'A volcanic world crusted in black glass, its rivers running orange. The Korrund forges never cool.',
      },
    ],
  },
  {
    id: 'basaltdeep',
    name: 'Basalt Deep',
    faction: 'korrund',
    x: 555,
    y: 110,
    links: ['slagforge', 'mountainhold', 'facetfall'],
    danger: 2,
    stellars: [
      {
        id: 'deepmine',
        name: 'Deepmine Anvil',
        kind: 'station',
        color: '#555',
        r: 70,
        x: 400,
        y: -300,
        svc: 'LTB',
        tech: 3,
        prices: position({ ore: 1, gas: 1, metal: -1, equipment: 1 }),
        desc: 'A mining anvil sunk into an asteroid the size of a moon.',
      },
    ],
  },
  {
    id: 'mountainhold',
    name: 'Mountainhold',
    faction: 'korrund',
    x: 455,
    y: 75,
    links: ['slagforge', 'basaltdeep', 'broodhollow'],
    danger: 2,
    stellars: [
      {
        id: 'hold',
        name: 'The Hold',
        kind: 'planet',
        color: '#6a5a4a',
        r: 140,
        x: 300,
        y: 300,
        svc: 'LTOYB',
        tech: 7,
        prices: position({ metal: -1, medical: 1, food: 1 }),
        desc: 'A world that is mostly mountain. The Korrund mountain-lords hold court inside its peaks.',
      },
    ],
  },
  // ---- Ylith: the crystal reaches of the north-east
  {
    id: 'facetfall',
    name: 'Facetfall',
    faction: 'ylith',
    x: 680,
    y: 185,
    links: ['halcyon', 'basaltdeep', 'resonance', 'geodesy'],
    danger: 1,
    stellars: [
      {
        id: 'facet',
        name: 'Facet',
        kind: 'planet',
        color: '#b07ad0',
        r: 140,
        x: 400,
        y: -300,
        svc: 'LTOYB',
        tech: 6,
        prices: position({ shards: 1, crystal: -1, luxury: -1, metal: 1 }),
        desc: 'A world of crystal plains that ring when the wind blows. The Ylith tune their cities like instruments.',
      },
    ],
  },
  {
    id: 'resonance',
    name: 'Resonance',
    faction: 'ylith',
    x: 745,
    y: 125,
    links: ['facetfall', 'geodesy'],
    danger: 2,
    stellars: [
      {
        id: 'choirhall',
        name: 'The Choirhall',
        kind: 'station',
        color: '#c8a0e8',
        r: 80,
        x: -300,
        y: 300,
        svc: 'LTOYB',
        tech: 7,
        prices: position({ shards: 1, crystal: -1, food: 1 }),
        desc: 'A floating hall of crystal where the great Ylith carriers are grown like frost.',
      },
    ],
  },
  {
    id: 'geodesy',
    name: 'Geodesy',
    faction: 'ylith',
    x: 795,
    y: 215,
    links: ['facetfall', 'resonance', 'caravanserai'],
    danger: 2,
    stellars: [
      {
        id: 'geode',
        name: 'Hollow Geode',
        kind: 'moon',
        color: '#7a5a8a',
        r: 90,
        x: 300,
        y: 300,
        svc: 'LTB',
        tech: 3,
        prices: position({ crystal: -1, industrial: 1 }),
        desc: 'A moon split open to show a heart of violet crystal. Ylith freighters load here.',
      },
    ],
  },
  // ---- Sarn: the caravan roads of the east
  {
    id: 'spokeroad',
    name: 'Spokeroad',
    faction: 'sarn',
    x: 700,
    y: 330,
    links: ['halcyon', 'caravanserai', 'wheelwright'],
    danger: 1,
    stellars: [
      {
        id: 'spoke',
        name: 'The Spoke',
        kind: 'station',
        color: '#b08a50',
        r: 70,
        x: 300,
        y: -200,
        svc: 'LTOYB',
        tech: 5,
        prices: position({ food: 0, luxury: -1, equipment: 1, silk: 1, crystal: 1 }),
        desc: 'A great wheel of a station where Sarn caravans gather. There is always music.',
      },
    ],
  },
  {
    id: 'caravanserai',
    name: 'Caravanserai',
    faction: 'sarn',
    x: 785,
    y: 375,
    links: ['spokeroad', 'wheelwright', 'geodesy'],
    danger: 2,
    stellars: [
      {
        id: 'serai',
        name: 'Serai',
        kind: 'planet',
        color: '#c8a060',
        r: 130,
        x: -400,
        y: 300,
        svc: 'LTOYB',
        tech: 7,
        prices: position({ luxury: -1, food: -1, metal: 1, medical: 1 }),
        desc: 'A desert world of tents and brass towers where the Grand Caravans winter.',
      },
    ],
  },
  {
    id: 'wheelwright',
    name: "Wheelwright's Rest",
    faction: 'sarn',
    x: 715,
    y: 440,
    links: ['spokeroad', 'caravanserai', 'longhaul', 'tidepool'],
    danger: 2,
    stellars: [
      {
        id: 'rest',
        name: 'The Rest',
        kind: 'moon',
        color: '#a0805a',
        r: 80,
        x: 300,
        y: 300,
        svc: 'LTB',
        tech: 2,
        prices: position({ equipment: -1, industrial: 1 }),
        desc: 'A repair moon where Sarn wheelwrights straighten bent spokes and patch canvas.',
      },
    ],
  },
  // ---- Thalassi: the ocean worlds of the south-east
  {
    id: 'tidepool',
    name: 'Tidepool',
    faction: 'thalassi',
    x: 640,
    y: 520,
    links: ['longhaul', 'wheelwright', 'coralwake', 'abyssal'],
    danger: 1,
    stellars: [
      {
        id: 'tide',
        name: 'Tide',
        kind: 'planet',
        color: '#2a8aa0',
        r: 160,
        x: 400,
        y: 300,
        svc: 'LTOYB',
        tech: 6,
        prices: position({ gas: 1, food: -1, medical: -1, metal: 1, industrial: 1 }),
        desc: 'A world of one endless ocean. The Thalassi rise to meet visitors in shining bells of living water.',
      },
    ],
  },
  {
    id: 'coralwake',
    name: 'Coralwake',
    faction: 'thalassi',
    x: 725,
    y: 565,
    links: ['tidepool', 'abyssal'],
    danger: 2,
    stellars: [
      {
        id: 'reef',
        name: 'The Reef',
        kind: 'station',
        color: '#3aa0a0',
        r: 80,
        x: -300,
        y: -300,
        svc: 'LTB',
        tech: 3,
        prices: position({ food: -1, luxury: 1 }),
        desc: 'A coral reef grown in orbit, glowing pink and blue. Polyp Darts spawn here in clouds.',
      },
    ],
  },
  {
    id: 'abyssal',
    name: 'Abyssal Trench',
    faction: 'thalassi',
    x: 650,
    y: 620,
    links: ['tidepool', 'coralwake', 'shoalight'],
    danger: 3,
    stellars: [
      {
        id: 'deep',
        name: 'The Deep',
        kind: 'planet',
        color: '#103a50',
        r: 150,
        x: 300,
        y: 400,
        svc: 'LTOYB',
        tech: 7,
        prices: position({ medical: -1, crystal: 1, equipment: 1 }),
        desc: 'A dark ocean world lit only by its creatures. The Abyssal Carriers are born here.',
      },
    ],
  },
  // ---- Que'vari: the People of Light, to the south
  {
    id: 'farmouth',
    name: 'Far Mouth',
    faction: 'quevari',
    x: 505,
    y: 540,
    links: ['brightwater', 'quevar', 'shoalight', 'dimmer'],
    danger: 2,
    stellars: [
      {
        id: 'threshold',
        name: 'Threshold Spire',
        kind: 'station',
        color: '#dde8f0',
        r: 70,
        x: -300,
        y: 200,
        svc: 'LTB',
        tech: 3,
        land: 10958,
        prices: position({ luxury: 0, medical: 1, crystal: 1 }),
        desc: "A white spire at the edge of Que'vari space, where the People of Light greet strangers.",
      },
    ],
  },
  {
    id: 'quevar',
    name: "Que'var",
    faction: 'quevari',
    x: 455,
    y: 610,
    links: ['farmouth', 'shoalight', 'dimmer'],
    danger: 1,
    stellars: [
      {
        id: 'inalumen',
        name: 'Ina Lumen',
        kind: 'planet',
        color: '#cfe4f8',
        r: 160,
        x: 300,
        y: -300,
        svc: 'LTOYB',
        tech: 7,
        land: 10957,
        prices: position({ luxury: -1, crystal: 1, food: 1 }),
        desc: "The Que'vari homeworld: white cities under sails of light-blue energy fabric.",
      },
    ],
  },
  {
    id: 'shoalight',
    name: 'Shoalight',
    faction: 'quevari',
    x: 555,
    y: 630,
    links: ['farmouth', 'quevar', 'abyssal'],
    danger: 2,
    stellars: [
      {
        id: 'glasswind',
        name: 'Glasswind Station',
        kind: 'station',
        color: '#b0d0e8',
        r: 65,
        x: 300,
        y: 300,
        svc: 'LTOB',
        tech: 5,
        prices: position({ crystal: -1, industrial: 1 }),
        desc: "A Que'vari sail-yard where electro-sails are woven and mended.",
      },
    ],
  },
  // ---- The Umbral (hostile)
  {
    id: 'dimmer',
    name: 'Dimmer Reach',
    faction: 'umbral',
    x: 380,
    y: 620,
    links: ['farmouth', 'quevar', 'gloam', 'umbra'],
    danger: 5,
    stellars: [],
  },
  {
    id: 'umbra',
    name: 'Umbra',
    faction: 'umbral',
    x: 315,
    y: 665,
    links: ['dimmer', 'cinderverge'],
    danger: 6,
    stellars: [
      {
        id: 'umbra-heart',
        name: 'The Dark Heart',
        kind: 'planet',
        color: '#2a1a30',
        r: 170,
        x: 0,
        y: 0,
        svc: '',
        tech: 0,
        desc: 'A world that drinks light.',
      },
    ],
  },
];
expandGalaxy(SYSTEMS, FACTIONS);

/**
 * Claimable derelict station hull sites across the galaxy.
 */
// Derelict station hulls scattered across the galaxy: each can be claimed by one captain and built up through Ops 1-5.
export const SITES: StellarBody[] = (
  [
    ['site-qgate', 'qgate', -600, -1000],
    ['site-meridian', 'meridian', -900, -500],
    ['site-halcyon', 'halcyon', 700, 600],
    ['site-waystation', 'waystation', 900, -600],
    ['site-longhaul', 'longhaul', -300, -900],
    ['site-brightwater', 'brightwater', -800, -300],
    ['site-emberlight', 'emberlight', -700, -500],
    ['site-gloam', 'gloam', -900, 600],
    ['site-thrumhive', 'thrumhive', -800, -600],
    ['site-slagforge', 'slagforge', 800, -500],
    ['site-facetfall', 'facetfall', -700, 500],
    ['site-spokeroad', 'spokeroad', -800, 600],
    ['site-tidepool', 'tidepool', -700, -600],
    ['site-farmouth', 'farmouth', 600, -700],
    ['site-chitinreach', 'chitinreach', 700, 500],
    ['site-basaltdeep', 'basaltdeep', -600, 600],
    ['site-geodesy', 'geodesy', -700, -500],
    ...frontierSites(SYSTEMS, 10),
  ] as [string, string, number, number][]
).map(([identifier, system, positionX, positionY]) => ({
  id: identifier,
  system,
  x: positionX,
  y: positionY,
  name: 'Derelict Station Hull',
  kind: 'site',
  color: '#887',
  r: 60,
  svc: 'L',
  tech: 0,
  site: true,
  desc: 'A gutted Concord station hull, adrift but sound. Claim it and it becomes your Personal Station: dock, refinery, lab and shipyard.',
}));
for (const stellarBody of SITES)
  SYSTEMS.find((starSystem) => starSystem.id === stellarBody.system)!.stellars.push(stellarBody);
addSolGateway(SYSTEMS); // Sol (with Earth and the Gateway wormhole) and the ten Farside systems
addMoonsAndFields(SYSTEMS); // more moons and asteroid fields (a separate seeded pass: no existing ids change)
// more markets buy what captains mine. Worlds near asteroid fields, and mining and alien peoples, take ore, gas and
// crystal shards (a deterministic pass over the generated markets; existing prices are untouched).
{
  const MINERS = new Set([
    'korrund',
    'ylith',
    'deep',
    'frontier',
    'farside',
    'thalassi',
    'vashari',
  ]);
  for (const starSystem of SYSTEMS)
    for (const stellarBody of starSystem.stellars) {
      if (
        !stellarBody.prices ||
        !(stellarBody.svc || '').includes('T') ||
        stellarBody.site ||
        stellarBody.hub
      )
        continue;
      const fnv1a2 = fnv1a(stellarBody.id + ':mine');
      const near = (starSystem.fields || []).length > 0,
        entityKind = MINERS.has(starSystem.faction),
        roll = (fnv1a2 % 1000) / 1000;
      if (!('shards' in stellarBody.prices) && (near || entityKind) && roll < 0.42)
        stellarBody.prices.shards = 1;
      if (!('ore' in stellarBody.prices) && near && roll > 0.7) stellarBody.prices.ore = 0;
      if (!('gas' in stellarBody.prices) && near && roll > 0.55 && roll < 0.75)
        stellarBody.prices.gas = 0;
    }
}
addEventide(SYSTEMS); // Append authored v2.9 content without consuming legacy generation RNG.
// Move only the authored mouth AFTER generation so collision rejection and RNG stay stable.
{
  const gate = SYSTEMS.find((starSystem) => starSystem.id === 'coldharbor')!.stellars.find(
    (stellarBody) => stellarBody.id === 'coldharbor-gate',
  )!;
  gate.x = 2200;
  gate.y = 2200;
}

/**
 * Fast lookup map of star systems keyed by system ID.
 */
const fromEntries2: Record<string, StarSystem> = Object.fromEntries(
  SYSTEMS.map((starSystem) => [starSystem.id, starSystem]),
);
export { fromEntries2 as SYS };

/**
 * Fast lookup map of all celestial bodies keyed by stellar ID.
 */
export const STELLARS = Object.fromEntries(
  SYSTEMS.flatMap((starSystem) =>
    starSystem.stellars.map((stellarBody) => [
      stellarBody.id,
      { ...stellarBody, system: starSystem.id },
    ]),
  ),
) as Record<string, StellarBody>;

/**
 * Baseline commodity price levels at an established Personal Station (Ops 1+).
 */
// prices at a built Personal Station (Ops 1+)
export const SITE_PRICES: Record<string, number> = {
  food: 0,
  industrial: 0,
  medical: 0,
  equipment: 0,
  metal: 0,
  luxury: 0,
  ore: 0,
  gas: 0,
  shards: 0,
};

/**
 * Initial starting player state parameters upon beginning a new game.
 */
export const START: { system: string; stellar: string; credits: number; ship: number } = {
  system: 'qgate',
  stellar: 'qstation',
  credits: 30000,
  ship: 703,
};

/**
 * Ship hull IDs universally available across Concord and general human yards.
 */
// Hull IDs each faction builds and flies.
export const COMMON_HULLS: number[] = [
  703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 820, 821, 822, 823,
  824, 825, 826, 827, 828, 829,
]; // ten new hulls (shared/ships23.js)

/**
 * Hull catalog available to each faction in shipyards and defense fleets.
 */
export const FACTION_HULLS: Record<string, number[]> = {
  quantum: COMMON_HULLS,
  spacer: [703, 704, 706, 707, 709, 710, 712, 714],
  lamp: [705, 706, 707, 711, 713, 715],
  hollow: [705, 708, 711, 716],
  quevari: [738, 739, 740, 741, 742, 743],
  umbral: [760, 761, 762, 763, 764],
  vashari: [765, 766, 767, 788, 768, 769, 789],
  korrund: [790, 770, 771, 772, 791, 773, 792, 774],
  ylith: [775, 793, 794, 776, 777, 778, 779, 795],
  sarn: [780, 796, 781, 782, 797, 783, 784],
  thalassi: [798, 799, 800, 801, 802, 803, 804],
  farside: COMMON_HULLS, // beyond the Sol Gateway: common hulls only, no racial designs
};

/**
 * NPC traffic generation pools per faction, separating civilian traders from warships.
 */
// NPC roles per faction: trader ships and warships (for traffic generation)
export const TRAFFIC: Record<string, { traders: number[]; war: number[] }> = {
  quantum: {
    traders: [704, 706, 712, 714, 703, 821, 824, 824, 822, 827],
    war: [708, 711, 713, 716, 717, 823, 825, 828, 829],
  },
  spacer: {
    traders: [703, 704, 706, 710, 712, 714, 709, 821, 822, 824],
    war: [705, 708, 711, 820, 823],
  },
  lamp: { traders: [706, 707], war: [711, 713, 715] },
  hollow: { traders: [], war: [705, 708, 711, 716] },
  quevari: { traders: [738, 739], war: [740, 741, 742, 743] },
  umbral: { traders: [], war: [760, 761, 762, 763, 764] },
  vashari: { traders: [766, 765], war: [767, 788, 768, 769, 789] },
  korrund: { traders: [770, 772], war: [771, 791, 773, 792, 774] },
  ylith: { traders: [794, 776, 775], war: [793, 777, 778, 779, 795] },
  sarn: { traders: [780, 781, 783, 784], war: [796, 782, 797] },
  thalassi: { traders: [799, 800], war: [801, 802, 803, 804] },
  frontier: { traders: [703, 704, 706, 710, 712, 780, 770, 822, 824], war: [705, 708, 711, 820] },
  deep: { traders: [], war: [760, 761, 762, 763, 764] },
  farside: {
    traders: [703, 704, 706, 707, 712, 714, 826, 824],
    war: [705, 708, 709, 710, 711, 713, 823, 825],
  },
  swarm: { traders: [], war: [765, 718] },
  eclipse: { traders: [], war: [761, 762, 763] },
};

/**
 * Faction-exclusive outfit catalogs offered at cultural outfitters.
 */
// weapons each faction's outfitters sell, on top of the generic ones
export const FACTION_OUTFITS: Record<string, number[]> = {
  quevari: [444, 445, 446, 447, 448, 449, 450, 451, 452, 453],
  lamp: [604],
  quantum: [605, 606, 608, 609, 610, 611, 612],
};
/**
 * Custom outfit definitions complementing standard outfits.
 */
// Generic weapon outfits. Stable weapon IDs keep existing ship loadouts and saves compatible.
export const EXTRA_OUTFITS: Array<OutfitAsset> = [
  {
    id: 9920,
    name: 'Tow Rig',
    cost: 45000,
    mass: 4,
    max: 1,
    tech: 1,
    icon: 'icons/9020.png',
    eff: { towRig: 1 },
    desc: 'Finite motherlode tether. Requires a hull with at least 60t cargo. Hard tow speed 30 (stock Star Dredge 60). No jump/Gateway while attached.',
  },
  {
    id: 9001,
    name: 'Mica Dart',
    eff: { weapon: 128 },
    cost: 12000,
    mass: 2,
    max: 8,
    tech: 1,
    gun: true,
    desc: 'A compact charge-spool throws needlelike plasma darts; efficient against small shields.',
  },
  {
    id: 9002,
    name: 'Cinder Driver',
    eff: { weapon: 129 },
    cost: 30000,
    mass: 3,
    max: 8,
    tech: 2,
    gun: true,
    desc: 'A staggered discharge chamber launches dense cinders for general-purpose ship combat.',
  },
  {
    id: 9003,
    name: 'Mica Sentinel',
    eff: { weapon: 130 },
    cost: 30000,
    mass: 4,
    max: 4,
    tech: 2,
    turret: true,
    desc: 'A tracking charge-spool mount protects freighters without a large power budget.',
  },
  {
    id: 9004,
    name: 'Cinder Sentinel',
    eff: { weapon: 131 },
    cost: 70000,
    mass: 6,
    max: 4,
    tech: 3,
    turret: true,
    desc: 'A stabilized cinder mount keeps steady pressure on fast shielded attackers.',
  },
  {
    id: 9005,
    name: 'Kiln Bastion',
    eff: { weapon: 132 },
    cost: 180000,
    mass: 12,
    max: 4,
    tech: 5,
    turret: true,
    desc: 'A capital mount compresses a furnace charge into a slow, shield-breaking volley.',
  },
  {
    id: 9006,
    name: 'Prism Stitch',
    eff: { weapon: 146 },
    cost: 90000,
    mass: 4,
    max: 6,
    tech: 3,
    gun: true,
    desc: 'A gated optical array stitches across shields at short range, with a mild systems shock.',
  },
  {
    id: 9007,
    name: 'Kestrel Needle',
    eff: { weapon: 156 },
    cost: 80000,
    mass: 6,
    max: 4,
    tech: 3,
    gun: true,
    desc: 'A narrow-tracking induction cradle accelerates a light penetrator over long distances.',
  },
  {
    id: 9008,
    name: 'Osprey Needle',
    eff: { weapon: 158 },
    cost: 220000,
    mass: 12,
    max: 4,
    tech: 5,
    gun: true,
    desc: 'A heavy induction cradle launches deliberate, hard-hitting penetrators from the bow.',
  },
  {
    id: 9009,
    name: 'Skein Pursuer Launcher',
    eff: { weapon: 134 },
    cost: 60000,
    mass: 5,
    max: 4,
    tech: 2,
    gun: true,
    desc: 'Launches Skein Pursuers, expendable microdrones guided by an exhaust-wake tracker.',
  },
  {
    id: 9010,
    name: 'Skein Pursuer',
    eff: { ammo: 134 },
    cost: 500,
    mass: 0,
    max: 60,
    tech: 2,
    desc: 'A pursuing microdrone follows an exhaust wake and detonates a shaped ceramic charge.',
  },
  {
    id: 9011,
    name: 'Venom Spitter',
    eff: { weapon: 344 },
    cost: 120000,
    mass: 5,
    max: 6,
    tech: 4,
    gun: true,
    faction: 'vashari',
    desc: 'A Vashari bio-cannon that spits corrosive globs.',
  },
  {
    id: 9012,
    name: 'Magma Cannon',
    eff: { weapon: 345 },
    cost: 240000,
    mass: 14,
    max: 4,
    tech: 5,
    turret: true,
    faction: 'korrund',
    desc: 'A Korrund turret that hurls molten slag.',
  },
  {
    id: 9013,
    name: 'Resonance Beam',
    eff: { weapon: 346 },
    cost: 280000,
    mass: 8,
    max: 4,
    tech: 5,
    turret: true,
    faction: 'ylith',
    desc: 'A Ylith crystal beam that sings as it cuts.',
  },
  {
    id: 9014,
    name: 'Scrap Flak Turret',
    eff: { weapon: 347 },
    cost: 70000,
    mass: 6,
    max: 4,
    tech: 3,
    turret: true,
    faction: 'sarn',
    desc: 'A Sarn turret that throws a cloud of scrap.',
  },
  {
    id: 9015,
    name: 'Stinger Beam',
    eff: { weapon: 355 },
    cost: 260000,
    mass: 7,
    max: 4,
    tech: 5,
    turret: true,
    faction: 'thalassi',
    desc: 'A Thalassi stinger that leaves systems twitching.',
  },
  {
    id: 9016,
    name: 'Chaffguard',
    eff: { weapon: 161 },
    cost: 110000,
    mass: 6,
    max: 2,
    tech: 4,
    turret: true,
    desc: 'A rapid tracking mount sprays sacrificial flechettes through incoming missile paths.',
  },
  // mining (0.4): mining weapons crack asteroids six times faster than combat weapons
  {
    id: 9017,
    name: 'Seam Tapper',
    eff: { weapon: 181 },
    cost: 9000,
    mass: 2,
    max: 4,
    tech: 1,
    gun: true,
    desc: 'A tuned stress pulse opens mineral seams; its focusing lattice is poor against shields.',
  },
  {
    id: 9018,
    name: 'Mining Laser',
    eff: { weapon: 9101 },
    cost: 45000,
    mass: 4,
    max: 4,
    tech: 2,
    gun: true,
    desc: 'A continuous cutting beam for asteroid work. Weak against shields.',
  },
  {
    id: 9019,
    name: 'Heavy Mining Laser',
    eff: { weapon: 9102 },
    cost: 160000,
    mass: 9,
    max: 2,
    tech: 4,
    turret: true,
    desc: 'A turret-mounted industrial cutter. Strips a rock in seconds.',
  },
  {
    id: 9020,
    name: 'Passenger Seating Pack',
    eff: { passengerSeats: 5 },
    cost: 15000,
    mass: 3,
    max: 20,
    tech: 1,
    desc: 'Five dedicated passenger seats with restraint and life-support fittings. Uses three tons of outfit space; bridge officers and working crew do not occupy passenger seats.',
  },
];
for (const outfit of EXTRA_OUTFITS) outfit.icon = outfit.icon || `icons/${outfit.id}.png`; // rendered outfitter pictures (tools/rift_icons.py)

// weapons added by Quantum Rift (merged into the asset weapons by augmentAssets)

/**
 * Custom weapon asset definitions added by Quantum Rift.
 */
export const EXTRA_WEAPONS: Array<WeaponAsset> = [
  {
    id: 9101,
    name: 'Mining Laser',
    type: 'beam',
    dmgA: 3,
    dmgS: 1,
    reload: 0,
    speed: 0,
    duration: 0,
    inacc: 0,
    sound: 0,
    blast: 0,
    beamLen: 300,
    color: '#ffe27a',
    ion: 0,
    burst: 0,
    ammo: -1,
    mining: true,
  },
  {
    id: 9102,
    name: 'Heavy Mining Laser',
    type: 'turretbeam',
    dmgA: 6,
    dmgS: 2,
    reload: 0,
    speed: 0,
    duration: 0,
    inacc: 0,
    sound: 0,
    blast: 0,
    beamLen: 380,
    color: '#ffb84a',
    ion: 0,
    burst: 0,
    ammo: -1,
    mining: true,
  },
];

/**
 * Weapon IDs with specialized high damage efficiency against asteroid rocks.
 */
export const MINING_WEAPONS: number[] = [181, 9101, 9102];

/**
 * Ore processing and refinery conversion rules at a Personal Station.
 */
// ore processing at your Personal Station (Ops 1+): 12 units make one material crate; better stations refine higher grades
export const ORE_PROCESS: {
  per: number;
  cost: number;
  to: Record<string, string>;
  grade: number[];
} = {
  per: 12,
  cost: 1500,
  to: { ore: 'alloy', gas: 'isotope', shards: 'crystal' },
  grade: [0, 0, 0, 1, 1, 2],
};

/**
 * Specifications, costs, and materials required for Personal Station Ops upgrade levels 1-5.
 */
// Quantum Station: Ops levels, research, refinery
const opsLevelDefs: OpsLevelDef[] = [
  {
    lv: 1,
    title: 'Restore Docking',
    cost: 10000,
    mats: [['alloy', 0, 1]],
    unlock: 'Refinery and the station market',
  },
  {
    lv: 2,
    title: 'Market & Refinery',
    cost: 60000,
    mats: [
      ['alloy', 1, 1],
      ['crystal', 0, 1],
    ],
    unlock: 'Research lab, faster refinery',
  },
  {
    lv: 3,
    title: 'Shipyard, Lab & Warp Core',
    cost: 180000,
    mats: [
      ['alloy', 2, 1],
      ['crystal', 1, 1],
      ['isotope', 0, 1],
    ],
    unlock: 'Halo Surveyor, drydock, specialist building',
  },
  {
    lv: 4,
    title: 'Academy & Refinery Mk II',
    cost: 400000,
    mats: [
      ['alloy', 3, 1],
      ['crystal', 2, 1],
      ['isotope', 1, 1],
    ],
    unlock: 'Wingmates, refinery Mk II',
  },
  {
    lv: 5,
    title: 'Defense Grid',
    cost: 900000,
    mats: [
      ['alloy', 4, 1],
      ['crystal', 3, 1],
      ['isotope', 2, 1],
    ],
    unlock: 'Exotics, Constitution',
  },
];
export { opsLevelDefs as OPS };

/**
 * Parameters and requirements for relocating a Personal Station to another derelict hull site.
 */
// warp your Personal Station to another unclaimed hull, keeping everything (Ops, research, refinery, docks, stored ships)
export const RELOCATE: {
  base: number;
  perOps: number;
  mats: Array<[string, number, number]>;
  cooldownH: number;
} = { base: 100000, perOps: 60000, mats: [['alloy', 1, 1]], cooldownH: 24 };

/**
 * Calculates credit cost to relocate a Personal Station based on current Ops level.
 * @param operations - Current station Ops level.
 * @returns Credit relocation cost.
 */
export const relocateCost = (operations?: number) =>
  RELOCATE.base + RELOCATE.perOps * (operations || 0);

export { RESEARCH2 as RESEARCH } from './hangar.ts'; // four research trees (see shared/hangar.js)

/**
 * Refinery processing speed in minutes per unit by Ops level, and silo batch size.
 */
export const REFINERY: { minutes: number[]; silo: number } = {
  minutes: [0, 20, 15, 15, 10, 8],
  silo: 3,
}; // minutes per unit by Ops level

/**
 * Special ship hulls unlocked for construction in the Personal Station shipyard by Ops level.
 */
// Ships the station sells by Ops level (Halo Surveyor at 3; wingmates at 4; Exotics and the Constitution at 5)
export const STATION_SHIPS: Record<number, number[]> = { 3: [735], 5: [736, 785, 786, 787] };

/**
 * Mapping of base hulls to their Mk II refit hull IDs.
 */
// the Mk II and Mk III refits are no longer available to captains. The hulls stay as enemy ships (kingpins' rogue
// refits in Armada contracts), and these tables map them back to their base hulls for old saves.
export const MK2_OF: Record<number, number> = {
  703: 720,
  705: 721,
  704: 722,
  708: 723,
  706: 724,
  707: 725,
  709: 726,
  710: 727,
  711: 728,
  712: 729,
  713: 730,
  714: 731,
  715: 732,
  716: 733,
  717: 734,
};

/**
 * Mapping of base or Mk II hulls to their Mk III refit hull IDs.
 */
export const MK3_OF: Record<number, number> = {
  723: 745,
  730: 746,
  728: 747,
  732: 748,
  733: 749,
  734: 750,
};

/**
 * Hull IDs designated as Personal Station escort wingmates.
 */
export const WINGMATES: number[] = [751, 752, 753, 754, 755, 756];

/**
 * Armada escort hull IDs (now enemy-only in 2.6).
 */
export const ARMADA_HULLS: number[] = [757, 758, 759]; // the old station Armada escorts, now enemy-only

// Deterministic refinery/processed-good markets; ordinary nonservice pads unchanged.
for (const stellarBody of Object.values(STELLARS))
  if (!stellarBody.site && stellarBody.svc!.includes('T') && stellarBody.svc!.includes('O'))
    for (const identifier of [
      'alloy_ingots',
      'fuel_cells',
      'cut_crystal',
      'composite_plating',
      'plasma',
      'quantum_fuel',
      'exotic_matter',
    ])
      stellarBody.prices![identifier] = 0;
for (const identifier of [
  'alloy_ingots',
  'fuel_cells',
  'cut_crystal',
  'composite_plating',
  'plasma',
  'quantum_fuel',
  'exotic_matter',
])
  SITE_PRICES[identifier] = 0;

// Authored finite minor pockets support industrial bulk without changing existing fields.
for (const [starSystem, oreCommodity] of [
  ['meridian', 'ore'],
  ['halcyon', 'gas'],
])
  fromEntries2[starSystem].fields!.push({
    id: `${starSystem}-industrial-minor`,
    x: 4200,
    y: -4000,
    r: 700,
    ore: oreCommodity,
    rich: 2,
    rocks: 20,
    minor: true,
    industrial: true,
  });
