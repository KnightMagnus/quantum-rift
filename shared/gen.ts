type Point = { x: number; y: number };
import type { StarSystem as SpaceSystem, RawStellarBody as StellarBody } from './galaxy.ts';
import type { FactionDef } from './galaxy.ts';
import { signedXorshift32 as randomGenerator, fnv1a as hashId } from './deterministic-random.ts';

// Quantum Rift galaxy generator: grows the 30 hand-made anchor systems into a ~200-system galaxy.
// Fully deterministic (fixed seed), so the server and every browser build the same galaxy.
// Each faction's territory grows out from its anchors; unclaimed Frontier space fills the borders and the rim,
// and the Deep lies beyond Umbral space at the far south-west edge.

/**
 * Master random seed ensuring deterministic galaxy generation across server and clients.
 */
export const GEN_SEED: number = 0x51f7;

/**
 * Target count of systems in the main procedural galaxy generation pass.
 */
const TOTAL: number = 200;

// ------------------------------------------------------------------ names

/**
 * Procedural name prefixes, suffixes, and title fragments by faction cultural theme.
 */
const NAMES: Record<string, Array<string[]>> = {
  quantum: [
    [
      'Aur',
      'Cel',
      'Ver',
      'Lum',
      'Sol',
      'Nov',
      'Cor',
      'Val',
      'Tes',
      'Ast',
      'Prae',
      'Lyr',
      'Ser',
      'Cand',
    ],
    ['ion', 'ara', 'ita', 'eon', 'ora', 'is', 'ium', 'enna', 'idia', 'os', 'ene'],
    ['Gate', 'Point', 'Verge', 'Prime', 'Crossing', 'Watch', 'Concord'],
  ],
  spacer: [
    [
      'Long',
      'Far',
      'Salt',
      'Dust',
      'Iron',
      'Copper',
      'Tin',
      'Gull',
      'Kettle',
      'Drift',
      'Mile',
      'Rope',
      'Anchor',
      'Rivet',
    ],
    ['haul', 'water', 'reach', 'stop', 'yard', 'harbor', 'post', 'ford', 'run', 'well', 'bend'],
    ['Junction', 'Market', 'Lanes', 'Rest'],
  ],
  lamp: [
    [
      'Ember',
      'Wick',
      'Glim',
      'Candle',
      'Ash',
      'Tallow',
      'Flicker',
      'Hearth',
      'Vigil',
      'Sconce',
      'Taper',
    ],
    ['light', 'fall', 'glow', 'mere', 'wake', 'hold', 'burn', 'shade'],
    ['Vigil', 'Lantern', 'Watch'],
  ],
  hollow: [
    [
      'Rust',
      'Grave',
      'Murk',
      'Shiv',
      'Rot',
      'Scrap',
      'Gallows',
      'Knife',
      'Bilge',
      'Cinder',
      'Gutter',
      'Hook',
    ],
    ['hole', 'drift', 'wreck', 'maw', 'gut', 'den', 'verge', 'yard'],
    ['Run', 'Den', 'Pit'],
  ],
  quevari: [
    ['Ina', 'Sha', 'Lu', 'Vel', 'Qua', 'Ela', 'Oru', 'Ilu', 'Sei', 'Ama'],
    ['mira', 'var', 'lai', 'sene', 'thel', 'ora', 'luma', 'sai', 'rin'],
    ['Spire', 'Sail', 'Lumen'],
  ],
  umbral: [
    ['Dim', 'Nul', 'Vant', 'Sorrow', 'Hush', 'Blind', 'Shade', 'Vesper', 'Pall', 'Gloam'],
    ['reach', 'deep', 'mark', 'void', 'fold', 'ward', 'fall', 'hollow'],
    ['Silence', 'Night'],
  ],
  vashari: [
    ['Thr', 'Chit', 'Zz', 'Kss', 'Vrr', 'Brood', 'Hive', 'Skrr', 'Mandi', 'Ichor', 'Sil'],
    ['ix', 'hive', 'reach', 'mire', 'clutch', 'spire', 'kesh', 'ath', 'thrum'],
    ['Swarm', 'Clutch', 'Nest'],
  ],
  korrund: [
    ['Basalt', 'Slag', 'Grim', 'Anvil', 'Iron', 'Mag', 'Krag', 'Dun', 'Granite', 'Ore', 'Cairn'],
    ['hold', 'forge', 'deep', 'peak', 'helm', 'gard', 'crag', 'delve', 'stone'],
    ['Deep', 'Forge', 'Hold'],
  ],
  ylith: [
    ['Facet', 'Prism', 'Geo', 'Lumi', 'Quartz', 'Iri', 'Chime', 'Lattice', 'Spar', 'Opal'],
    ['fall', 'sene', 'ance', 'dell', 'ora', 'ith', 'hymn', 'ace', 'vane'],
    ['Choir', 'Facet', 'Chord'],
  ],
  sarn: [
    ['Spoke', 'Caravan', 'Axle', 'Dune', 'Brass', 'Wagon', 'Saddle', 'Tassel', 'Ochre', 'Camel'],
    ['road', 'serai', 'rest', 'way', 'gate', 'well', 'stop', 'ford', 'track'],
    ['Road', 'Wells', 'Market'],
  ],
  thalassi: [
    [
      'Tide',
      'Coral',
      'Abyss',
      'Brine',
      'Kelp',
      'Pearl',
      'Shoal',
      'Fathom',
      'Lagoon',
      'Ebb',
      'Surf',
    ],
    ['pool', 'wake', 'trench', 'reef', 'deep', 'bloom', 'drift', 'song', 'mere'],
    ['Reef', 'Deep', 'Current'],
  ],
  frontier: [
    [
      'New',
      'Lost',
      'Broken',
      'Outer',
      'Free',
      'Last',
      'Wild',
      'Stray',
      'Lone',
      'Far',
      'Cold',
      'Quiet',
      'Burnt',
      'Second',
    ],
    [
      'Hope',
      'Mile',
      'Reach',
      'Haven',
      'Claim',
      'Shelf',
      'Margin',
      'Signal',
      'Expanse',
      'Chance',
      'Harbor',
      'Light',
      'Landing',
    ],
  ],
  farside: [
    ['Cold', 'Mirror', 'Grey', 'Sable', 'Quiet', 'Ember', 'Low', 'Vesper', 'North', 'Nine'],
    ['harbor', 'fall', 'line', 'reach', 'tude', 'drift', 'tide', 'gate', 'mark', 'fold'],
  ],
  deep: [
    ['The'],
    [
      'Abyss',
      'Maw',
      'Silence',
      'Black Tide',
      'Unlight',
      'Teeth',
      'Pale Eye',
      'Last Shore',
      'Undertow',
      'Blind Star',
      'Drowned Sun',
      'Hunger',
      'Long Dark',
    ],
  ],
};
/**
 * Roman numeral suffixes for collision resolution in procedural naming.
 */
const ROMAN: string[] = ['', ' II', ' III', ' IV', ' V', ' VI'];

/**
 * Generates a unique star system name consistent with the faction's linguistic theme.
 * @param faction - Faction identifier.
 * @param radius - Random number generator returning [0, 1).
 * @param used - Set of names already in use to ensure uniqueness.
 * @returns Unique procedural name.
 */
function makeName(faction: string, radius: () => number, used: Set<string>): string {
  const names = NAMES[faction];
  for (let tries = 0; tries < 40; tries++) {
    let count;
    if (faction === 'frontier' || faction === 'deep')
      count =
        names[0][Math.floor(radius() * names[0].length)] +
        ' ' +
        names[1][Math.floor(radius() * names[1].length)];
    else {
      count =
        names[0][Math.floor(radius() * names[0].length)] +
        names[1][Math.floor(radius() * names[1].length)];
      count = count[0].toUpperCase() + count.slice(1);
      if (radius() < 0.25) count += ' ' + names[2][Math.floor(radius() * names[2].length)];
    }
    if (!used.has(count)) {
      used.add(count);
      return count;
    }
  }
  const base = names[1][Math.floor(radius() * names[1].length)];
  for (const rOMAN of ROMAN) {
    const count = base[0].toUpperCase() + base.slice(1) + rOMAN;
    if (!used.has(count)) {
      used.add(count);
      return count;
    }
  }
  return 'Uncharted ' + used.size;
}

/**
 * Converts a display name into a kebab-case identifier slug.
 * @param state - Input text.
 * @returns Clean URL/ID slug string.
 */
const slug = (state: string) =>
  state
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ------------------------------------------------------------------ worlds

/**
 * Color palettes for procedural planets and stations by faction.
 */
const PALETTE: Record<string, string[]> = {
  quantum: ['#4a7fc8', '#7ab878', '#889', '#6a8ab8', '#9ab'],
  spacer: ['#8a9', '#998', '#5aa0b8', '#a99', '#7a9a88'],
  lamp: ['#c96', '#c8843c', '#a8703a', '#d0a060'],
  hollow: ['#666', '#844', '#5a4a4a', '#704030'],
  quevari: ['#dde8f0', '#cfe4f8', '#b0d0e8'],
  umbral: ['#2a1a30', '#3a2a4a', '#201028'],
  vashari: ['#6e9a2e', '#5a6a30', '#7a8a3a', '#8aaa40'],
  korrund: ['#8a4a2a', '#555', '#6a5a4a', '#7a3a1a'],
  ylith: ['#b07ad0', '#c8a0e8', '#7a5a8a', '#d0b0f0'],
  sarn: ['#b08a50', '#c8a060', '#a0805a', '#d0b070'],
  thalassi: ['#2a8aa0', '#3aa0a0', '#103a50', '#40c0c8'],
  frontier: ['#7a7a80', '#8a7a6a', '#5a6a7a', '#6a6a5a'],
  farside: ['#a8a090', '#7a8a9a', '#c8b890', '#8a9a8a'],
  deep: ['#141018', '#201a2a', '#0a141a'],
};

/**
 * Naming suffixes for procedural celestial bodies by type.
 */
const KINDS: Record<string, string[]> = {
  planet: ['World', 'Prime', '', 'Major', 'Minor'],
  station: ['Station', 'Hub', 'Port', 'Anchorage', 'Yards', 'Exchange'],
  moon: ['Moon', 'Rock', 'Moonlet', 'Outpost'],
};
const DESC: Record<string, Record<string, string[]>> = {
  quantum: {
    planet: [
      'A tidy Concord colony under orbital mirrors.',
      'Terraced cities and patrol beacons: Concord order out to the horizon.',
    ],
    station: [
      'A Concord relay station with clean decks and polite customs officers.',
      'A Concord waypoint whose beacons guide traffic for a dozen systems.',
    ],
    moon: ['A Concord survey moon dotted with listening posts.'],
  },
  spacer: {
    planet: ['A frontier farm world where Spacer families put down roots between hauls.'],
    station: [
      'A busy Spacer trading post. Everything is negotiable.',
      'Freight cranes and noodle stalls, open all hours.',
    ],
    moon: ['A fuel moon where haulers top up and swap stories.'],
  },
  lamp: {
    planet: ['A dim world with a lamp burning on every ridge.'],
    station: ['A Lamplighter vigil station, warm light leaking from every seam.'],
    moon: ['A quiet moon where Lamplighter keepers tend their beacons.'],
  },
  hollow: {
    planet: ['A scorched world claimed by Hollow crews. Mind your cargo.'],
    station: [
      'A pirate den bolted together from stolen hulls.',
      'A black market where nobody uses their real name.',
    ],
    moon: ['A wreck-strewn moon where the Hollow strip their prizes.'],
  },
  quevari: {
    planet: ['A pale world beneath sails of blue light.'],
    station: ["A white Que'vari spire where sails are woven and mended."],
    moon: ['A silent moon where the People of Light keep their watch.'],
  },
  umbral: {
    planet: ['A world that seems to drink the light around it.'],
    station: ['Something built by the Umbral. Nobody docks here twice.'],
    moon: ['A dark moon. The scanners do not like it.'],
  },
  vashari: {
    planet: ['A humid hive world thrumming with wings.'],
    station: ['A grown Vashari spire, its walls warm to the touch.'],
    moon: ['A chitin-harvest moon littered with shed carapaces.'],
  },
  korrund: {
    planet: ['A volcanic forge world, rivers running orange.'],
    station: ['A Korrund mining anvil sunk deep into a captured asteroid.'],
    moon: ['A quarry moon ringing with the sound of hammers.'],
  },
  ylith: {
    planet: ['A crystal world that rings when the wind blows.'],
    station: ['A floating Ylith hall of frost-grown crystal.'],
    moon: ['A split moon showing a violet crystal heart.'],
  },
  sarn: {
    planet: ['A desert world of tents and brass towers.'],
    station: ['A Sarn caravan wheel where music never stops.'],
    moon: ['A repair moon full of wheelwrights and spare spokes.'],
  },
  thalassi: {
    planet: ['An ocean world where the Thalassi rise in bells of living water.'],
    station: ['A reef grown in orbit, glowing pink and blue.'],
    moon: ['An ice moon with a warm sea beneath it.'],
  },
  frontier: {
    planet: ['An unclaimed world settled by people who wanted to be left alone.'],
    station: [
      'A frontier outpost with no flag and a long memory.',
      'A salvage-built station. The law here is whoever has the bigger guns.',
    ],
    moon: ["A prospector's moon, staked and re-staked a hundred times."],
  },
  farside: {
    planet: [
      'A quiet world beyond the Gateway, settled by people who followed the light through.',
      'Grey seas and long twilights. The settlers here came through the Gateway three generations ago and never looked back.',
    ],
    station: [
      'A Farside waystation, patched together from ships that never went home.',
      "A settlers' trading ring. Everyone here came through the Gateway.",
    ],
    moon: ['A pale moon. Its craters are full of old, unreadable markers.'],
  },
  deep: {
    planet: ['A dead world at the edge of everything.'],
    station: ['A derelict listening post. Something still answers.'],
    moon: ['A shattered moon drifting in the dark.'],
  },
};
const TRADEABLE = [
  'food',
  'industrial',
  'medical',
  'luxury',
  'metal',
  'equipment',
  'crystal',
  'silk',
  'ore',
  'gas',
  'shards',
];
const FAVOUR: Record<string, string[][]> = {
  // what each faction tends to produce (-1) and want (+1)
  quantum: [
    ['equipment', 'medical'],
    ['food', 'metal'],
  ],
  spacer: [
    ['food', 'metal'],
    ['equipment', 'luxury'],
  ],
  lamp: [['luxury'], ['medical', 'metal']],
  hollow: [
    ['luxury', 'equipment'],
    ['food', 'medical'],
  ],
  quevari: [['luxury'], ['crystal', 'food']],
  umbral: [[], []],
  vashari: [['silk'], ['metal', 'equipment']],
  korrund: [
    ['metal', 'industrial', 'ore'],
    ['food', 'luxury'],
  ],
  ylith: [
    ['crystal', 'shards'],
    ['metal', 'industrial'],
  ],
  sarn: [
    ['luxury', 'food'],
    ['equipment', 'silk'],
  ],
  thalassi: [
    ['food', 'medical', 'gas'],
    ['metal', 'industrial'],
  ],
  frontier: [
    ['ore', 'gas'],
    ['food', 'medical', 'equipment'],
  ],
  farside: [
    ['ore', 'crystal'],
    ['medical', 'equipment', 'luxury'],
  ],
  deep: [['shards'], ['food']],
};
/**
 * Baseline danger tier per faction territory for system generation.
 */
const BASE_DANGER: Record<string, number> = {
  quantum: 0,
  spacer: 1,
  lamp: 1,
  hollow: 4,
  quevari: 1,
  umbral: 5,
  vashari: 1,
  korrund: 1,
  ylith: 1,
  sarn: 1,
  thalassi: 1,
  frontier: 2,
  deep: 6,
};

/**
 * Asteroid and harvestable field resource drop weights per faction region.
 */
const FIELD_ORE: Record<string, string[]> = {
  korrund: ['ore', 'ore', 'gas'],
  ylith: ['shards', 'shards', 'ore'],
  thalassi: ['gas', 'gas', 'ore'],
  vashari: ['ore', 'gas'],
  deep: ['shards', 'ore', 'gas'],
  frontier: ['ore', 'gas', 'shards'],
};

/**
 * Procedurally generates a celestial body (planet, station, or moon) within a star system.
 * @param starSystem - Parent star system object.
 * @param faction - System faction identifier.
 * @param radius2 - Random number generator returning [0, 1).
 * @param entryKey - Orbit index of this stellar body.
 * @param usedIds - Set of existing stellar IDs to avoid collisions.
 * @returns Complete stellar body definition.
 */
function makeStellar(
  starSystem: SpaceSystem,
  faction: string,
  radius2: () => number,
  entryKey: number,
  usedIds: Set<string>,
): StellarBody {
  const roll = radius2(),
    kind = roll < 0.45 ? 'planet' : roll < 0.8 ? 'station' : 'moon';
  const kinds = KINDS[kind][Math.floor(radius2() * KINDS[kind].length)];
  const name2 =
    entryKey === 0 && kind === 'planet' && !kinds
      ? starSystem.name
      : starSystem.name.split(' ')[0] +
        (kinds ? ' ' + kinds : ' ' + ['Alpha', 'Beta', 'Gamma'][entryKey]);
  let slug2 = slug(name2);
  while (usedIds.has(slug2)) slug2 += '-' + entryKey;
  usedIds.add(slug2);
  const palette = PALETTE[faction],
    technology =
      faction === 'umbral' || faction === 'deep'
        ? 0
        : Math.max(
            1,
            Math.min(
              7,
              Math.round(
                2 +
                  radius2() * 4 +
                  (faction === 'quantum' ? 1 : 0) -
                  (faction === 'frontier' ? 1 : 0),
              ),
            ),
          );
  let service = 'LTB';
  if (technology >= 3) service += 'O';
  if (technology >= 4 && radius2() < 0.45) service += 'Y';
  if (faction === 'umbral' || faction === 'deep')
    service = radius2() < 0.35 && faction === 'deep' ? 'LT' : '';
  const prices: Record<string, number> = {};
  const [production, want] = FAVOUR[faction] || [[], []];
  for (const production2 of production) if (radius2() < 0.75) prices[production2] = -1;
  for (const want2 of want) if (radius2() < 0.75) prices[want2] = 1;
  while (Object.keys(prices).length < 4) {
    const tradeable = TRADEABLE[Math.floor(radius2() * TRADEABLE.length)];
    if (!(tradeable in prices)) prices[tradeable] = Math.floor(radius2() * 3) - 1;
  }
  const radius =
    kind === 'planet'
      ? 110 + Math.floor(radius2() * 60)
      : kind === 'station'
        ? 55 + Math.floor(radius2() * 30)
        : 65 + Math.floor(radius2() * 30);
  const angle = radius2() * Math.PI * 2,
    distance = 300 + radius2() * 700 + entryKey * 350;
  const desc2 = DESC[faction][kind];
  const desc22 = desc2[Math.floor(radius2() * desc2.length)];
  const rawStellarBody: StellarBody = {
    id: slug2,
    name: name2,
    kind,
    color: palette[Math.floor(radius2() * palette.length)],
    r: radius,
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance),
    svc: service,
    tech: technology,
    prices,
    desc: desc22,
    gen: true,
  };
  if (faction === 'hollow' || faction === 'frontier' || faction === 'deep')
    rawStellarBody.outlaw = true; // (Farside worlds keep their own law)
  if (!service) delete rawStellarBody.prices;
  return rawStellarBody;
}

// ------------------------------------------------------------------ geometry

/**
 * Determines whether two 2D line segments properly intersect (excluding shared endpoints).
 * @param firstValue - First endpoint of segment 1.
 * @param secondValue - Second endpoint of segment 1.
 * @param component - First endpoint of segment 2.
 * @param distance - Second endpoint of segment 2.
 * @returns True if segments properly cross.
 */
function segCross(
  firstValue: { x: number; y: number },
  secondValue: { x: number; y: number },
  component: { x: number; y: number },
  distance: { x: number; y: number },
): boolean {
  // proper intersection of segments ab and cd (shared endpoints don't count)
  if (
    firstValue === component ||
    firstValue === distance ||
    secondValue === component ||
    secondValue === distance
  )
    return false;
  const options = (point: Point, point2: Point, point3: Point) =>
    Math.sign(
      (point2.x - point.x) * (point3.y - point.y) - (point2.y - point.y) * (point3.x - point.x),
    );
  return (
    options(firstValue, secondValue, component) !== options(firstValue, secondValue, distance) &&
    options(component, distance, firstValue) !== options(component, distance, secondValue)
  );
}

/**
 * Calculates the shortest Euclidean distance from a point to a 2D line segment.
 * @param position - Target point coordinates.
 * @param firstValue - Segment start coordinates.
 * @param secondValue - Segment end coordinates.
 * @returns Shortest distance.
 */
function segDist(
  position: { x: number; y: number },
  firstValue: { x: number; y: number },
  secondValue: { x: number; y: number },
): number {
  const deltaX = secondValue.x - firstValue.x,
    deltaY = secondValue.y - firstValue.y,
    length = deltaX * deltaX + deltaY * deltaY || 1,
    time = Math.max(
      0,
      Math.min(
        1,
        ((position.x - firstValue.x) * deltaX + (position.y - firstValue.y) * deltaY) / length,
      ),
    );
  return Math.hypot(
    position.x - (firstValue.x + time * deltaX),
    position.y - (firstValue.y + time * deltaY),
  );
}

// ------------------------------------------------------------------ main

/**
 * Procedurally expands the hand-made anchor star systems into a full ~200-system galaxy.
 * Places systems deterministically, establishes hyperlane routes, assigns territories and worlds.
 * @param SYSTEMS - Base anchor systems array, modified and expanded in place.
 * @param _FACTIONS - Galaxy factions registry.
 * @returns Array of all newly generated star systems.
 */
export function expandGalaxy(
  SYSTEMS: SpaceSystem[],
  _FACTIONS: Record<string, FactionDef>,
): SpaceSystem[] {
  const radius = randomGenerator(GEN_SEED);
  const centerX = 495,
    centerY = 370,
    SCALE = 1.7;
  for (const system of SYSTEMS) {
    system.x = Math.round(centerX + (system.x - centerX) * SCALE);
    system.y = Math.round(centerY + (system.y - centerY) * SCALE);
    system.anchor = true;
  }
  const anchors = SYSTEMS.slice(),
    fromEntries2 = Object.fromEntries(SYSTEMS.map((system) => [system.id, system]));
  const anchorEdges: [SpaceSystem, SpaceSystem][] = [];
  for (const system of anchors)
    for (const link of system.links)
      if (link > system.id) anchorEdges.push([system, fromEntries2[link]]);
  const relativeX = 1080,
    relativeY = 900,
    umbra = fromEntries2.umbra;
  const deepDir = Math.atan2(umbra.y - centerY, umbra.x - centerX);
  // Mitchell's best-candidate sampling: even spacing, no clumps
  const points = anchors.map((system) => ({ x: system.x, y: system.y }));
  const want = TOTAL - anchors.length,
    result: { x: number; y: number }[] = [];
  while (result.length < want) {
    let best = null,
      body = -1;
    for (let component = 0; component < 30; component++) {
      const firstValue = radius() * Math.PI * 2,
        sqrt2 = Math.sqrt(radius()),
        position = {
          x: centerX + Math.cos(firstValue) * relativeX * sqrt2,
          y: centerY + Math.sin(firstValue) * relativeY * sqrt2,
        };
      let infinity = Infinity;
      for (const point of points) {
        const event = Math.hypot(position.x - point.x, position.y - point.y);
        if (event < infinity) infinity = event;
      }
      let clear = Infinity;
      for (const [starSystem, starSystem2] of anchorEdges)
        clear = Math.min(clear, segDist(position, starSystem, starSystem2));
      if (clear < 28) continue;
      if (infinity > body) {
        body = infinity;
        best = position;
      }
    }
    if (!best) continue;
    points.push(best);
    result.push(best);
  }
  // territories
  const used = new Set(SYSTEMS.map((system) => system.name)),
    usedIds = new Set(
      SYSTEMS.flatMap((system) => [
        system.id,
        ...system.stellars.map((stellarBody) => stellarBody.id),
      ]),
    );
  const added: SpaceSystem[] = [];
  // territory: each power claims the free points nearest its anchors until it reaches its target size (exact quotas,
  // compact territories). Whatever is left between the powers and around the rim is Frontier; the Deep is carved first.
  const TARGET: Record<string, number> = {
    quantum: 14,
    spacer: 14,
    lamp: 13,
    hollow: 12,
    quevari: 6,
    umbral: 9,
    vashari: 14,
    korrund: 14,
    ylith: 14,
    sarn: 14,
    thalassi: 14,
  };
  const count: Record<string, number> = {};
  for (const system of anchors) count[system.faction] = (count[system.faction] || 0) + 1;
  const className = result.map((position) => {
    const rimLighting = Math.hypot(
      (position.x - centerX) / relativeX,
      (position.y - centerY) / relativeY,
    );
    const atan = Math.atan2(position.y - centerY, position.x - centerX),
      angleDelta = Math.abs(Math.atan2(Math.sin(atan - deepDir), Math.cos(atan - deepDir)));
    return {
      rim: rimLighting,
      fac:
        rimLighting > 0.78 && angleDelta < 0.55 ? 'deep' : rimLighting > 0.97 ? 'frontier' : null,
    };
  });
  // round-robin: every power under quota claims the free point closest to its territory so far (anchors + claimed points),
  // so boxed-in core powers grow outward instead of being starved by their neighbours
  const terrain: Record<string, { x: number; y: number }[]> = {};
  for (const system of anchors)
    (terrain[system.faction] = terrain[system.faction] || []).push(system);
  const ORDER = [
    'quantum',
    'spacer',
    'lamp',
    'sarn',
    'thalassi',
    'vashari',
    'korrund',
    'ylith',
    'hollow',
    'umbral',
    'quevari',
  ];
  for (let round = 0; round < 60; round++) {
    let hasAnyMatch = false;
    for (const oRDER of ORDER) {
      if ((count[oRDER] || 0) >= TARGET[oRDER]) continue;
      let best = -1,
        body = oRDER === 'quevari' ? 260 : round > 14 ? 480 : 330;
      result.forEach((position, index) => {
        if (className[index].fac) return;
        for (const terrain2 of terrain[oRDER]) {
          const distance = Math.hypot(position.x - terrain2.x, position.y - terrain2.y);
          if (distance < body) {
            body = distance;
            best = index;
          }
        }
      });
      if (best < 0) continue;
      className[best].fac = oRDER;
      count[oRDER] = (count[oRDER] || 0) + 1;
      terrain[oRDER].push(result[best]);
      hasAnyMatch = true;
    }
    if (!hasAnyMatch && round > 14) break;
  }
  for (const className2 of className) if (!className2.fac) className2.fac = 'frontier';
  for (let index = 0; index < result.length; index++) {
    const result2 = result[index],
      { fac: faction2, rim: rimLighting } = className[index];
    const name = makeName(faction2!, radius, used);
    let slug2 = slug(name);
    while (usedIds.has(slug2) || fromEntries2[slug2]) slug2 += '-x';
    usedIds.add(slug2);
    const danger = Math.max(
      0,
      Math.min(
        7,
        BASE_DANGER[faction2!] +
          Math.floor(rimLighting * 1.7) +
          (radius() < 0.25 ? 1 : 0) -
          (faction2 === 'quantum' ? 1 : 0),
      ),
    );
    const starSystem: SpaceSystem = {
      id: slug2,
      name,
      faction: faction2!,
      x: Math.round(result2.x),
      y: Math.round(result2.y),
      links: [],
      danger,
      stellars: [],
      gen: true,
    };
    let count = radius() < 0.12 ? 0 : radius() < 0.78 ? 1 : 2;
    if (faction2 === 'frontier' && radius() < 0.35) count = 0;
    if (faction2 === 'deep') count = radius() < 0.3 ? 1 : 0;
    if (faction2 === 'umbral') count = radius() < 0.4 ? 1 : 0;
    for (let entryKey = 0; entryKey < count; entryKey++)
      starSystem.stellars.push(makeStellar(starSystem, faction2!, radius, entryKey, usedIds));
    SYSTEMS.push(starSystem);
    fromEntries2[slug2] = starSystem;
    added.push(starSystem);
  }
  // hyperspace routes: keep the anchor routes, then add the shortest non-crossing routes until everything is connected
  const edges: [SpaceSystem, SpaceSystem][] = anchorEdges.map(([starSystem, starSystem5]) => [
    starSystem,
    starSystem5,
  ]);
  const degrees = new Map(SYSTEMS.map((system) => [system, system.links.length]));
  const parent = new Map(SYSTEMS.map((system) => [system, system]));
  const find = (starSystem: SpaceSystem): SpaceSystem => {
    while (parent.get(starSystem) !== starSystem) {
      parent.set(starSystem, parent.get(parent.get(starSystem)!)!);
      starSystem = parent.get(starSystem)!;
    }
    return starSystem;
  };
  for (const [starSystem, starSystem5] of edges) parent.set(find(starSystem), find(starSystem5));
  const candidate: [number, SpaceSystem, SpaceSystem][] = [];
  for (let index = 0; index < SYSTEMS.length; index++) {
    const leftSystem = SYSTEMS[index];
    const near = SYSTEMS.map((rightSystem): [number, SpaceSystem] => [
      Math.hypot(leftSystem.x - rightSystem.x, leftSystem.y - rightSystem.y),
      rightSystem,
    ])
      .filter(([distance, starSystem]) => starSystem !== leftSystem && distance < 230)
      .sort((positionX, positionY) => positionX[0] - positionY[0])
      .slice(0, 6);
    for (const [distance, starSystem] of near)
      if (leftSystem.id < starSystem.id) candidate.push([distance, leftSystem, starSystem]);
  }
  candidate.sort((positionX, positionY) => positionX[0] - positionY[0]);
  const link = (starSystem: SpaceSystem, starSystem8: SpaceSystem) => {
    starSystem.links.push(starSystem8.id);
    starSystem8.links.push(starSystem.id);
    edges.push([starSystem, starSystem8]);
    degrees.set(starSystem, degrees.get(starSystem)! + 1);
    degrees.set(starSystem8, degrees.get(starSystem8)! + 1);
    parent.set(find(starSystem), find(starSystem8));
  };
  for (const pass of [0, 1]) {
    for (const [distance, starSystem, starSystem8] of candidate) {
      if (starSystem.links.includes(starSystem8.id)) continue;
      if (starSystem.anchor && starSystem8.anchor) continue; // anchor-to-anchor routes are hand-made
      const joins = find(starSystem) !== find(starSystem8);
      const maxDeg = (starSystem9: SpaceSystem) => (starSystem9.anchor ? 6 : 4);
      if (
        degrees.get(starSystem)! >= maxDeg(starSystem) ||
        degrees.get(starSystem8)! >= maxDeg(starSystem8)
      ) {
        if (!joins || pass === 0) continue;
      }
      if (!joins && (pass === 1 || radius() > 0.6 || distance > 170)) continue;
      if (
        edges.some(([starSystem9, starSystem10]) =>
          segCross(starSystem, starSystem8, starSystem9, starSystem10),
        )
      )
        continue;
      link(starSystem, starSystem8);
    }
  }
  // anything still cut off gets its shortest route, crossing or not
  for (let guard = 0; guard < 50; guard++) {
    const root = find(fromEntries2.qgate),
      lone = SYSTEMS.filter((system) => find(system) !== root);
    if (!lone.length) break;
    let best: [number, SpaceSystem, SpaceSystem] | null = null;
    for (const leftSystem of lone)
      for (const rightSystem of SYSTEMS)
        if (find(rightSystem) === root) {
          const distance = Math.hypot(leftSystem.x - rightSystem.x, leftSystem.y - rightSystem.y);
          if (!best || distance < best[0]) best = [distance, leftSystem, rightSystem];
        }
    link(best![1], best![2]);
  }
  // asteroid fields and gas clouds (mining nodes)
  for (const system of SYSTEMS) {
    const kinds = FIELD_ORE[system.faction] || ['ore', 'gas'];
    let count = system.faction === 'quantum' ? (radius() < 0.3 ? 1 : 0) : radius() < 0.55 ? 1 : 0;
    if (system.faction === 'korrund' || system.faction === 'frontier' || system.faction === 'deep')
      count += radius() < 0.6 ? 1 : 0;
    if (!system.stellars.length) count = Math.max(1, count);
    system.fields = [];
    for (let entryKey = 0; entryKey < count; entryKey++) {
      const firstValue = radius() * Math.PI * 2,
        distance = 900 + radius() * 900;
      system.fields.push({
        id: `${system.id}-f${entryKey}`,
        x: Math.round(Math.cos(firstValue) * distance),
        y: Math.round(Math.sin(firstValue) * distance),
        r: 260 + Math.round(radius() * 200),
        ore: kinds[Math.floor(radius() * kinds.length)],
        rich: Math.min(3, 1 + Math.floor((system.danger + radius() * 3) / 3)),
        rocks: 7 + Math.floor(radius() * 7),
      });
    }
  }
  return added;
}

/**
 * Selects candidate derelict station hull locations in generated Frontier space.
 * @param SYSTEMS - Generated star systems array.
 * @param count - Number of sites to select.
 * @returns Array of site tuples [siteId, systemId, x, y].
 */
// additional claimable station hulls in Frontier space (chosen deterministically from the generated systems)
export function frontierSites(
  SYSTEMS: SpaceSystem[],
  count: number = 10,
): Array<[string, string, number, number]> {
  const radius = randomGenerator(GEN_SEED ^ 0xbeef);
  const pool = SYSTEMS.filter(
    (system) => system.gen && system.faction === 'frontier' && system.stellars.length <= 1,
  );
  const result: [string, string, number, number][] = [];
  while (result.length < count && pool.length) {
    const starSystem = pool.splice(Math.floor(radius() * pool.length), 1)[0];
    if (
      result.some((options) => {
        const system = SYSTEMS.find((starSystem) => starSystem.id === options[1]);
        return Math.hypot(system!.x - starSystem.x, system!.y - starSystem.y) < 260;
      })
    )
      continue;
    const firstValue = radius() * Math.PI * 2;
    result.push([
      `site-${starSystem.id}`,
      starSystem.id,
      Math.round(Math.cos(firstValue) * 800),
      Math.round(Math.sin(firstValue) * 800),
    ]);
  }
  return result;
}

// ------------------------------------------------------------------ Sol and the Gateway region

/**
 * Specifications for the ten Farside systems accessible via the Sol Gateway wormhole.
 * Array of tuples [systemId, systemName, xOffset, yOffset, dangerLevel].
 */
// Added after generation so none of the 200 generated systems (or their ids) change. Sol sits near the centre of the map;
// its wormhole leads to ten Farside systems off the north-west edge, reachable only through the Gateway.
export const FARSIDE: Array<[string, string, number, number, number]> = [
  // [id, name, x offset, y offset, danger]
  ['coldharbor', 'Coldharbor', 0, 0, 1],
  ['mirrorfall', 'Mirrorfall', -95, -40, 1],
  ['greyline', 'Greyline', 70, -70, 2],
  ['sable-reach', 'Sable Reach', -60, -125, 2],
  ['quietude', 'Quietude', 20, -160, 2],
  ['ember-drift', 'Ember Drift', 130, -150, 3],
  ['lowtide', 'Lowtide', -160, -110, 3],
  ['vesper-gate', 'Vesper Gate', -120, -210, 3],
  ['northmark', 'Northmark', 60, -245, 4],
  ['ninefold', 'Ninefold', -30, -290, 4],
];

/**
 * Hyperlane connection pairs between Farside systems.
 */
const FARSIDE_LINKS: Array<[string, string]> = [
  ['coldharbor', 'mirrorfall'],
  ['coldharbor', 'greyline'],
  ['mirrorfall', 'sable-reach'],
  ['greyline', 'quietude'],
  ['sable-reach', 'quietude'],
  ['greyline', 'ember-drift'],
  ['mirrorfall', 'lowtide'],
  ['lowtide', 'vesper-gate'],
  ['sable-reach', 'vesper-gate'],
  ['quietude', 'northmark'],
  ['ember-drift', 'northmark'],
  ['vesper-gate', 'ninefold'],
  ['northmark', 'ninefold'],
];

/**
 * Integrates the Sol system (with Earth and Gateway wormhole) and the 10 Farside systems into the galaxy.
 * @param SYSTEMS - Systems collection augmented in place.
 */
export function addSolGateway(SYSTEMS: SpaceSystem[]): {
  sol: SpaceSystem;
  farside: SpaceSystem[];
} {
  const radius = randomGenerator(GEN_SEED ^ 0x5011),
    fromEntries2 = Object.fromEntries(SYSTEMS.map((system) => [system.id, system]));
  const used = new Set(SYSTEMS.map((system) => system.name)),
    usedIds = new Set(
      SYSTEMS.flatMap((system) => [
        system.id,
        ...system.stellars.map((stellarBody) => stellarBody.id),
      ]),
    );
  const edges: [SpaceSystem, SpaceSystem][] = [];
  for (const system of SYSTEMS)
    for (const link of system.links) if (link > system.id) edges.push([system, fromEntries2[link]]);
  // Sol: the clear spot nearest the centre of the galaxy
  const xScale = SYSTEMS.map((system) => system.x),
    yScale = SYSTEMS.map((system) => system.y),
    centerX = (Math.min(...xScale) + Math.max(...xScale)) / 2,
    centerY = (Math.min(...yScale) + Math.max(...yScale)) / 2;
  let best = null;
  for (let radius = 0; radius < 400 && !best; radius += 6)
    for (let firstValue = 0; firstValue < 6.283 && !best; firstValue += 0.21) {
      const position = {
        x: centerX + Math.cos(firstValue) * radius,
        y: centerY + Math.sin(firstValue) * radius,
      };
      if (
        SYSTEMS.every((system) => Math.hypot(system.x - position.x, system.y - position.y) > 48) &&
        edges.every(([starSystem, starSystem2]) => segDist(position, starSystem, starSystem2) > 20)
      )
        best = position;
    }
  const starSystem: SpaceSystem = {
    id: 'sol',
    name: 'Sol Minor',
    faction: 'quantum',
    x: Math.round(best!.x),
    y: Math.round(best!.y),
    links: [],
    danger: 0,
    gate: 'coldharbor',
    sol: true,
    stellars: [
      {
        id: 'earth',
        name: 'Terra',
        kind: 'planet',
        color: '#3a7ad0',
        r: 165,
        x: 380,
        y: 260,
        svc: 'LTOYB',
        tech: 7,
        land: 'earth',
        prices: { food: -1, medical: -1, luxury: 1, crystal: 1 },
        desc: 'Terra. Cradle of the Concord and still its beating heart: blue oceans, shining arcologies, and the old orbital rings. Every captain comes home eventually.',
      },
      {
        id: 'luna',
        name: 'Luna Station',
        kind: 'station',
        color: '#aab',
        r: 70,
        x: 720,
        y: -60,
        svc: 'LTOB',
        tech: 6,
        prices: { equipment: -1, industrial: -1, food: 1 },
        desc: 'The old lunar shipyards, still turning out hulls for the Concord.',
      },
      {
        id: 'sol-gateway',
        name: 'The Sol Minor Gateway',
        kind: 'wormhole',
        color: '#9ac8ff',
        r: 110,
        x: -700,
        y: -520,
        svc: '',
        tech: 0,
        wormhole: 'coldharbor',
        exit: 'coldharbor-gate',
        desc: 'A stable wormhole that opened beyond the orbit of Neptune. The far side is somewhere off the edge of every chart.',
      },
    ],
    fields: [],
  };
  // link Sol to its three nearest systems (non-crossing where possible)
  const near = SYSTEMS.map((system): [number, SpaceSystem] => [
    Math.hypot(system.x - starSystem.x, system.y - starSystem.y),
    system,
  ]).sort((firstValue, secondValue) => firstValue[0] - secondValue[0]);
  let count = 0;
  for (const [, starSystem2] of near) {
    if (count >= 3) break;
    if (
      count >= 2 &&
      edges.some(([starSystem3, starSystem4]) =>
        segCross(starSystem, starSystem2, starSystem3, starSystem4),
      )
    )
      continue;
    if (
      edges.some(([starSystem3, starSystem4]) =>
        segCross(starSystem, starSystem2, starSystem3, starSystem4),
      ) &&
      count < 2 &&
      near.indexOf(near.find((positionX) => positionX[1] === starSystem2)!) > 4
    )
      continue;
    starSystem.links.push(starSystem2.id);
    starSystem2.links.push('sol');
    count++;
  }
  SYSTEMS.push(starSystem);
  // Farside: off the north-west edge
  const offsetX = Math.min(...xScale) - 250,
    offsetY = Math.min(...yScale) - 30;
  const added: SpaceSystem[] = [];
  for (const [identifier, name, deltaX, deltaY, danger] of FARSIDE) {
    const starSystem: SpaceSystem = {
      id: identifier,
      name,
      faction: 'farside',
      x: Math.round(offsetX + deltaX),
      y: Math.round(offsetY + deltaY),
      links: [],
      danger,
      stellars: [],
      farside: true,
    };
    const entryKey = identifier === 'coldharbor' ? 2 : radius() < 0.25 ? 0 : radius() < 0.7 ? 1 : 2;
    for (let index = 0; index < entryKey; index++)
      starSystem.stellars.push(makeStellar(starSystem, 'farside', radius, index, usedIds));
    if (identifier === 'coldharbor') {
      if (!starSystem.stellars.some((rawStellarBody) => rawStellarBody.svc!.includes('Y')))
        starSystem.stellars[0].svc = 'LTOYB';
      starSystem.gate = 'sol';
      starSystem.stellars.push({
        id: 'coldharbor-gate',
        name: 'The Far Gateway',
        kind: 'wormhole',
        color: '#9ac8ff',
        r: 110,
        x: 600,
        y: 600,
        svc: '',
        tech: 0,
        wormhole: 'sol',
        exit: 'sol-gateway',
        desc: 'The far mouth of the Sol Gateway. Through it, faintly, the light of home.',
      });
    }
    for (const rawStellarBody of starSystem.stellars) rawStellarBody.outlaw = false;
    const firstValue = radius() * 6.283,
      distance = 900 + radius() * 700;
    starSystem.fields =
      radius() < 0.6
        ? [
            {
              id: `${identifier}-f0`,
              x: Math.round(Math.cos(firstValue) * distance),
              y: Math.round(Math.sin(firstValue) * distance),
              r: 300,
              ore: ['ore', 'shards', 'gas'][Math.floor(radius() * 3)],
              rich: 1 + Math.floor(danger / 2),
              rocks: 9,
            },
          ]
        : [];
    SYSTEMS.push(starSystem);
    added.push(starSystem);
    used.add(name);
  }
  const fromEntries3 = Object.fromEntries(added.map((starSystem) => [starSystem.id, starSystem]));
  for (const [firstValue, secondValue] of FARSIDE_LINKS) {
    fromEntries3[firstValue].links.push(secondValue);
    fromEntries3[secondValue].links.push(firstValue);
  }
  return { sol: starSystem, farside: added };
}

// ------------------------------------------------------------------ more moons and more asteroid fields
// A separate pass after the galaxy is built, seeded per system, so no existing world, field or id changes.

/**
 * Surface color palette for procedural uninhabited moons.
 */
const MOON_COLORS: string[] = [
  '#9a948c',
  '#b8b2a8',
  '#7d7871',
  '#a89c88',
  '#c9d4dc',
  '#8e8a9a',
  '#a7a08f',
];

/**
 * Atmospheric and terrain flavor descriptions for uninhabited moons.
 */
const MOON_DESC: string[] = [
  'An airless moon, cratered and quiet.',
  'A small ice moon, its surface cracked into plates.',
  'A grey moon of dust and old impact basins.',
  'A captured asteroid, too small to be round.',
  'A dark moon streaked with frozen gas.',
  'A tidally locked moon, one face forever toward its planet.',
];

/**
 * Roman numerals for procedural moon naming.
 */
const MOON_NUM: string[] = ['I', 'II', 'III'];

/**
 * Secondary procedural pass adding additional unpopulated moons and resource asteroid fields to systems.
 * Seeded per-system based on system ID hash and master seed to preserve determinism.
 * @param SYSTEMS - Star systems array, modified in place.
 */
export function addMoonsAndFields(SYSTEMS: SpaceSystem[]): void {
  for (const system of SYSTEMS) {
    if (system.arena) continue;
    const radius = randomGenerator(hashId('moons:' + system.id) ^ GEN_SEED),
      free = (positionX: number, positionY: number, radius: number, padding: number) =>
        system.stellars.every(
          (stellarBody) =>
            Math.hypot(stellarBody.x - positionX, stellarBody.y - positionY) >
            (stellarBody.r || 60) + radius + padding,
        );
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const rawStellarBody of [...system.stellars]) {
      if (
        rawStellarBody.kind !== 'planet' ||
        rawStellarBody.hub ||
        rawStellarBody.site ||
        rawStellarBody.wormhole
      )
        continue;
      const count = radius() < 0.62 ? (radius() < 0.3 ? 2 : 1) : 0,
        have = system.stellars.filter((stellarBody) =>
          stellarBody.id.startsWith(rawStellarBody.id + '-m'),
        ).length;
      for (let entryKey = 0; entryKey < count; entryKey++) {
        const radius2 = 30 + Math.round(radius() * 24);
        for (let tries = 0; tries < 12; tries++) {
          const firstValue = radius() * Math.PI * 2,
            distance = (rawStellarBody.r || 120) + 170 + radius() * 160 + entryKey * 90,
            positionX = Math.round(rawStellarBody.x + Math.cos(firstValue) * distance),
            positionY = Math.round(rawStellarBody.y + Math.sin(firstValue) * distance);
          if (!free(positionX, positionY, radius2, 130) || Math.hypot(positionX, positionY) > 3300)
            continue;
          system.stellars.push({
            id: `${rawStellarBody.id}-m${have + entryKey + 1}`,
            name: /\s([IVX]+|\d+|Prime|Alpha|Beta|Gamma|Major|Minor)$/.test(rawStellarBody.name)
              ? `${rawStellarBody.name}-${'abc'[have + entryKey] || have + entryKey + 1}`
              : `${rawStellarBody.name} ${MOON_NUM[have + entryKey] || have + entryKey + 1}`,
            kind: 'moon',
            color: MOON_COLORS[Math.floor(radius() * MOON_COLORS.length)],
            r: radius2,
            x: positionX,
            y: positionY,
            svc: '',
            tech: 0,
            desc:
              MOON_DESC[Math.floor(radius() * MOON_DESC.length)] +
              ` It circles ${rawStellarBody.name}. Nobody lives there.`,
          });
          break;
        }
      }
    }
    // a few more rocks in the existing fields, and sometimes a whole new field
    for (const factionId of system.fields || [])
      factionId.rocks = Math.round(factionId.rocks * 1.35);
    const kinds = FIELD_ORE[system.faction] || ['ore', 'gas', 'shards'];
    const extra = system.farside ? (radius() < 0.5 ? 1 : 0) : radius() < 0.5 ? 1 : 0;
    for (let entryKey = 0; entryKey < extra; entryKey++) {
      for (let tries = 0; tries < 12; tries++) {
        const firstValue = radius() * Math.PI * 2,
          distance = 1100 + radius() * 1500,
          positionX = Math.round(Math.cos(firstValue) * distance),
          positionY = Math.round(Math.sin(firstValue) * distance);
        if (
          !free(positionX, positionY, 320, 200) ||
          (system.fields || []).some(
            (factionId) => Math.hypot(factionId.x - positionX, factionId.y - positionY) < 900,
          )
        )
          continue;
        (system.fields = system.fields || []).push({
          id: `${system.id}-x${entryKey}`,
          x: positionX,
          y: positionY,
          r: 280 + Math.round(radius() * 200),
          ore: kinds[Math.floor(radius() * kinds.length)],
          rich: Math.min(3, 1 + Math.floor(((system.danger || 0) + radius() * 3) / 3)),
          rocks: 10 + Math.floor(radius() * 8),
        });
        break;
      }
    }
  }
}
