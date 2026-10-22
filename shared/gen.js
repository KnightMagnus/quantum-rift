import { signedXorshift32 as rng, fnv1a as hashId } from './deterministic-random.ts';
/** @import { SpaceSystem, StellarBody } from '../server/game.js' */
/** @import { FactionDef } from './galaxy.js' */

// Quantum Rift galaxy generator: grows the 30 hand-made anchor systems into a ~200-system galaxy.
// Fully deterministic (fixed seed), so the server and every browser build the same galaxy.
// Each faction's territory grows out from its anchors; unclaimed Frontier space fills the borders and the rim,
// and the Deep lies beyond Umbral space at the far south-west edge.

/**
 * Master random seed ensuring deterministic galaxy generation across server and clients.
 * @type {number}
 */
export const GEN_SEED = 0x51f7;

/**
 * Target count of systems in the main procedural galaxy generation pass.
 * @type {number}
 */
const TOTAL = 200;

// ------------------------------------------------------------------ names

/**
 * Procedural name prefixes, suffixes, and title fragments by faction cultural theme.
 * @type {Record<string, Array<string[]>>}
 */
const NAMES = {
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
 * @type {string[]}
 */
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI'];

/**
 * Generates a unique star system name consistent with the faction's linguistic theme.
 * @param {string} fac - Faction identifier.
 * @param {function(): number} r - Random number generator returning [0, 1).
 * @param {Set<string>} used - Set of names already in use to ensure uniqueness.
 * @returns {string} Unique procedural name.
 */
function makeName(fac, r, used) {
  const N = NAMES[fac];
  for (let tries = 0; tries < 40; tries++) {
    let n;
    if (fac === 'frontier' || fac === 'deep')
      n = N[0][Math.floor(r() * N[0].length)] + ' ' + N[1][Math.floor(r() * N[1].length)];
    else {
      n = N[0][Math.floor(r() * N[0].length)] + N[1][Math.floor(r() * N[1].length)];
      n = n[0].toUpperCase() + n.slice(1);
      if (r() < 0.25) n += ' ' + N[2][Math.floor(r() * N[2].length)];
    }
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  const base = N[1][Math.floor(r() * N[1].length)];
  for (const s of ROMAN) {
    const n = base[0].toUpperCase() + base.slice(1) + s;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return 'Uncharted ' + used.size;
}

/**
 * Converts a display name into a kebab-case identifier slug.
 * @param {string} s - Input text.
 * @returns {string} Clean URL/ID slug string.
 */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ------------------------------------------------------------------ worlds

/**
 * Color palettes for procedural planets and stations by faction.
 * @type {Record<string, string[]>}
 */
const PALETTE = {
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
 * @type {Record<string, string[]>}
 */
const KINDS = {
  planet: ['World', 'Prime', '', 'Major', 'Minor'],
  station: ['Station', 'Hub', 'Port', 'Anchorage', 'Yards', 'Exchange'],
  moon: ['Moon', 'Rock', 'Moonlet', 'Outpost'],
};
const DESC = {
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
      'Grey seas and long twilights. The settlers here do not talk about how they arrived.',
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
const FAVOUR = {
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
 * @type {Record<string, number>}
 */
const BASE_DANGER = {
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
 * @type {Record<string, string[]>}
 */
const FIELD_ORE = {
  korrund: ['ore', 'ore', 'gas'],
  ylith: ['shards', 'shards', 'ore'],
  thalassi: ['gas', 'gas', 'ore'],
  vashari: ['ore', 'gas'],
  deep: ['shards', 'ore', 'gas'],
  frontier: ['ore', 'gas', 'shards'],
};

/**
 * Procedurally generates a celestial body (planet, station, or moon) within a star system.
 * @param {SpaceSystem} sys - Parent star system object.
 * @param {string} fac - System faction identifier.
 * @param {function(): number} r - Random number generator returning [0, 1).
 * @param {number} k - Orbit index of this stellar body.
 * @param {Set<string>} usedIds - Set of existing stellar IDs to avoid collisions.
 * @returns {StellarBody} Complete stellar body definition.
 */
function makeStellar(sys, fac, r, k, usedIds) {
  const roll = r(),
    kind = roll < 0.45 ? 'planet' : roll < 0.8 ? 'station' : 'moon';
  const suff = KINDS[kind][Math.floor(r() * KINDS[kind].length)];
  const nm =
    k === 0 && kind === 'planet' && !suff
      ? sys.name
      : sys.name.split(' ')[0] + (suff ? ' ' + suff : ' ' + ['Alpha', 'Beta', 'Gamma'][k]);
  let id = slug(nm);
  while (usedIds.has(id)) id += '-' + k;
  usedIds.add(id);
  const pal = PALETTE[fac],
    tech =
      fac === 'umbral' || fac === 'deep'
        ? 0
        : Math.max(
            1,
            Math.min(
              7,
              Math.round(2 + r() * 4 + (fac === 'quantum' ? 1 : 0) - (fac === 'frontier' ? 1 : 0)),
            ),
          );
  let svc = 'LTB';
  if (tech >= 3) svc += 'O';
  if (tech >= 4 && r() < 0.45) svc += 'Y';
  if (fac === 'umbral' || fac === 'deep') svc = r() < 0.35 && fac === 'deep' ? 'LT' : '';
  const prices = {};
  const [prod, want] = FAVOUR[fac] || [[], []];
  for (const c of prod) if (r() < 0.75) prices[c] = -1;
  for (const c of want) if (r() < 0.75) prices[c] = 1;
  while (Object.keys(prices).length < 4) {
    const c = TRADEABLE[Math.floor(r() * TRADEABLE.length)];
    if (!(c in prices)) prices[c] = Math.floor(r() * 3) - 1;
  }
  const radius =
    kind === 'planet'
      ? 110 + Math.floor(r() * 60)
      : kind === 'station'
        ? 55 + Math.floor(r() * 30)
        : 65 + Math.floor(r() * 30);
  const ang = r() * Math.PI * 2,
    dist = 300 + r() * 700 + k * 350;
  const D = DESC[fac][kind];
  const desc = D[Math.floor(r() * D.length)];
  const st = {
    id,
    name: nm,
    kind,
    color: pal[Math.floor(r() * pal.length)],
    r: radius,
    x: Math.round(Math.cos(ang) * dist),
    y: Math.round(Math.sin(ang) * dist),
    svc,
    tech,
    prices,
    desc,
    gen: true,
  };
  if (fac === 'hollow' || fac === 'frontier' || fac === 'deep') st.outlaw = true; // (Farside worlds keep their own law)
  if (!svc) delete st.prices;
  return st;
}

// ------------------------------------------------------------------ geometry

/**
 * Determines whether two 2D line segments properly intersect (excluding shared endpoints).
 * @param {{ x: number, y: number }} a - First endpoint of segment 1.
 * @param {{ x: number, y: number }} b - Second endpoint of segment 1.
 * @param {{ x: number, y: number }} c - First endpoint of segment 2.
 * @param {{ x: number, y: number }} d - Second endpoint of segment 2.
 * @returns {boolean} True if segments properly cross.
 */
function segCross(a, b, c, d) {
  // proper intersection of segments ab and cd (shared endpoints don't count)
  if (a === c || a === d || b === c || b === d) return false;
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/**
 * Calculates the shortest Euclidean distance from a point to a 2D line segment.
 * @param {{ x: number, y: number }} p - Target point coordinates.
 * @param {{ x: number, y: number }} a - Segment start coordinates.
 * @param {{ x: number, y: number }} b - Segment end coordinates.
 * @returns {number} Shortest distance.
 */
function segDist(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = dx * dx + dy * dy || 1,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ------------------------------------------------------------------ main

/**
 * Procedurally expands the hand-made anchor star systems into a full ~200-system galaxy.
 * Places systems deterministically, establishes hyperlane routes, assigns territories and worlds.
 * @param {SpaceSystem[]} SYSTEMS - Base anchor systems array, modified and expanded in place.
 * @param {Record<string, FactionDef>} _FACTIONS - Galaxy factions registry.
 * @returns {SpaceSystem[]} Array of all newly generated star systems.
 */
export function expandGalaxy(SYSTEMS, _FACTIONS) {
  const r = rng(GEN_SEED);
  const CX = 495,
    CY = 370,
    SCALE = 1.7;
  for (const system of SYSTEMS) {
    system.x = Math.round(CX + (system.x - CX) * SCALE);
    system.y = Math.round(CY + (system.y - CY) * SCALE);
    system.anchor = true;
  }
  const anchors = SYSTEMS.slice(),
    byId = Object.fromEntries(SYSTEMS.map((system) => [system.id, system]));
  const anchorEdges = [];
  for (const system of anchors)
    for (const l of system.links) if (l > system.id) anchorEdges.push([system, byId[l]]);
  const RX = 1080,
    RY = 900,
    umbra = byId.umbra;
  const deepDir = Math.atan2(umbra.y - CY, umbra.x - CX);
  // Mitchell's best-candidate sampling: even spacing, no clumps
  const pts = anchors.map((system) => ({ x: system.x, y: system.y }));
  const want = TOTAL - anchors.length,
    out = [];
  while (out.length < want) {
    let best = null,
      bd = -1;
    for (let c = 0; c < 30; c++) {
      const a = r() * Math.PI * 2,
        rr = Math.sqrt(r()),
        p = { x: CX + Math.cos(a) * RX * rr, y: CY + Math.sin(a) * RY * rr };
      let d = Infinity;
      for (const q of pts) {
        const e = Math.hypot(p.x - q.x, p.y - q.y);
        if (e < d) d = e;
      }
      let clear = Infinity;
      for (const [u, v] of anchorEdges) clear = Math.min(clear, segDist(p, u, v));
      if (clear < 28) continue;
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) continue;
    pts.push(best);
    out.push(best);
  }
  // territories
  const used = new Set(SYSTEMS.map((system) => system.name)),
    usedIds = new Set(
      SYSTEMS.flatMap((system) => [
        system.id,
        ...system.stellars.map((stellarBody) => stellarBody.id),
      ]),
    );
  const added = [];
  // territory: each power claims the free points nearest its anchors until it reaches its target size (exact quotas,
  // compact territories). Whatever is left between the powers and around the rim is Frontier; the Deep is carved first.
  const TARGET = {
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
  const cnt = {};
  for (const system of anchors) cnt[system.faction] = (cnt[system.faction] || 0) + 1;
  const cls = out.map((p) => {
    const rim = Math.hypot((p.x - CX) / RX, (p.y - CY) / RY);
    const ang = Math.atan2(p.y - CY, p.x - CX),
      da = Math.abs(Math.atan2(Math.sin(ang - deepDir), Math.cos(ang - deepDir)));
    return { rim, fac: rim > 0.78 && da < 0.55 ? 'deep' : rim > 0.97 ? 'frontier' : null };
  });
  // round-robin: every power under quota claims the free point closest to its territory so far (anchors + claimed points),
  // so boxed-in core powers grow outward instead of being starved by their neighbours
  const terr = {};
  for (const system of anchors) (terr[system.faction] = terr[system.faction] || []).push(system);
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
    let any = false;
    for (const f of ORDER) {
      if ((cnt[f] || 0) >= TARGET[f]) continue;
      let best = -1,
        bd = f === 'quevari' ? 260 : round > 14 ? 480 : 330;
      out.forEach((p, i) => {
        if (cls[i].fac) return;
        for (const q of terr[f]) {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      });
      if (best < 0) continue;
      cls[best].fac = f;
      cnt[f] = (cnt[f] || 0) + 1;
      terr[f].push(out[best]);
      any = true;
    }
    if (!any && round > 14) break;
  }
  for (const c of cls) if (!c.fac) c.fac = 'frontier';
  for (let i = 0; i < out.length; i++) {
    const p = out[i],
      { fac, rim } = cls[i];
    const name = makeName(fac, r, used);
    let id = slug(name);
    while (usedIds.has(id) || byId[id]) id += '-x';
    usedIds.add(id);
    const danger = Math.max(
      0,
      Math.min(
        7,
        BASE_DANGER[fac] +
          Math.floor(rim * 1.7) +
          (r() < 0.25 ? 1 : 0) -
          (fac === 'quantum' ? 1 : 0),
      ),
    );
    const sys = {
      id,
      name,
      faction: fac,
      x: Math.round(p.x),
      y: Math.round(p.y),
      links: [],
      danger,
      stellars: [],
      gen: true,
    };
    let n = r() < 0.12 ? 0 : r() < 0.78 ? 1 : 2;
    if (fac === 'frontier' && r() < 0.35) n = 0;
    if (fac === 'deep') n = r() < 0.3 ? 1 : 0;
    if (fac === 'umbral') n = r() < 0.4 ? 1 : 0;
    for (let k = 0; k < n; k++) sys.stellars.push(makeStellar(sys, fac, r, k, usedIds));
    SYSTEMS.push(sys);
    byId[id] = sys;
    added.push(sys);
  }
  // hyperspace routes: keep the anchor routes, then add the shortest non-crossing routes until everything is connected
  const edges = anchorEdges.map(([a, b]) => [a, b]);
  const deg = new Map(SYSTEMS.map((system) => [system, system.links.length]));
  const parent = new Map(SYSTEMS.map((system) => [system, system]));
  const find = (s) => {
    while (parent.get(s) !== s) {
      parent.set(s, parent.get(parent.get(s)));
      s = parent.get(s);
    }
    return s;
  };
  for (const [a, b] of edges) parent.set(find(a), find(b));
  const cand = [];
  for (let i = 0; i < SYSTEMS.length; i++) {
    const leftSystem = SYSTEMS[i];
    const near = SYSTEMS.map((rightSystem) => [
      Math.hypot(leftSystem.x - rightSystem.x, leftSystem.y - rightSystem.y),
      rightSystem,
    ])
      .filter(([d, b]) => b !== leftSystem && d < 230)
      .sort((x, y) => x[0] - y[0])
      .slice(0, 6);
    for (const [d, b] of near) if (leftSystem.id < b.id) cand.push([d, leftSystem, b]);
  }
  cand.sort((x, y) => x[0] - y[0]);
  const link = (a, b) => {
    a.links.push(b.id);
    b.links.push(a.id);
    edges.push([a, b]);
    deg.set(a, deg.get(a) + 1);
    deg.set(b, deg.get(b) + 1);
    parent.set(find(a), find(b));
  };
  for (const pass of [0, 1]) {
    for (const [d, a, b] of cand) {
      if (a.links.includes(b.id)) continue;
      if (a.anchor && b.anchor) continue; // anchor-to-anchor routes are hand-made
      const joins = find(a) !== find(b);
      const maxDeg = (s) => (s.anchor ? 6 : 4);
      if (deg.get(a) >= maxDeg(a) || deg.get(b) >= maxDeg(b)) {
        if (!joins || pass === 0) continue;
      }
      if (!joins && (pass === 1 || r() > 0.6 || d > 170)) continue;
      if (edges.some(([u, v]) => segCross(a, b, u, v))) continue;
      link(a, b);
    }
  }
  // anything still cut off gets its shortest route, crossing or not
  for (let guard = 0; guard < 50; guard++) {
    const root = find(byId.qgate),
      lone = SYSTEMS.filter((system) => find(system) !== root);
    if (!lone.length) break;
    let best = null;
    for (const leftSystem of lone)
      for (const rightSystem of SYSTEMS)
        if (find(rightSystem) === root) {
          const d = Math.hypot(leftSystem.x - rightSystem.x, leftSystem.y - rightSystem.y);
          if (!best || d < best[0]) best = [d, leftSystem, rightSystem];
        }
    link(best[1], best[2]);
  }
  // asteroid fields and gas clouds (mining nodes)
  for (const system of SYSTEMS) {
    const kinds = FIELD_ORE[system.faction] || ['ore', 'gas'];
    let n = system.faction === 'quantum' ? (r() < 0.3 ? 1 : 0) : r() < 0.55 ? 1 : 0;
    if (system.faction === 'korrund' || system.faction === 'frontier' || system.faction === 'deep')
      n += r() < 0.6 ? 1 : 0;
    if (!system.stellars.length) n = Math.max(1, n);
    system.fields = [];
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2,
        d = 900 + r() * 900;
      system.fields.push({
        id: `${system.id}-f${k}`,
        x: Math.round(Math.cos(a) * d),
        y: Math.round(Math.sin(a) * d),
        r: 260 + Math.round(r() * 200),
        ore: kinds[Math.floor(r() * kinds.length)],
        rich: Math.min(3, 1 + Math.floor((system.danger + r() * 3) / 3)),
        rocks: 7 + Math.floor(r() * 7),
      });
    }
  }
  return added;
}

/**
 * Selects candidate derelict station hull locations in generated Frontier space.
 * @param {SpaceSystem[]} SYSTEMS - Generated star systems array.
 * @param {number} [n=10] - Number of sites to select.
 * @returns {Array<[string, string, number, number]>} Array of site tuples [siteId, systemId, x, y].
 */
// additional claimable station hulls in Frontier space (chosen deterministically from the generated systems)
export function frontierSites(SYSTEMS, n = 10) {
  const r = rng(GEN_SEED ^ 0xbeef);
  const pool = SYSTEMS.filter(
    (system) => system.gen && system.faction === 'frontier' && system.stellars.length <= 1,
  );
  const out = [];
  while (out.length < n && pool.length) {
    const s = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (
      out.some((o) => {
        const system = SYSTEMS.find((x) => x.id === o[1]);
        return Math.hypot(system.x - s.x, system.y - s.y) < 260;
      })
    )
      continue;
    const a = r() * Math.PI * 2;
    out.push([`site-${s.id}`, s.id, Math.round(Math.cos(a) * 800), Math.round(Math.sin(a) * 800)]);
  }
  return out;
}

// ------------------------------------------------------------------ Sol and the Gateway region

/**
 * Specifications for the ten Farside systems accessible via the Sol Gateway wormhole.
 * Array of tuples [systemId, systemName, xOffset, yOffset, dangerLevel].
 * @type {Array<[string, string, number, number, number]>}
 */
// Added after generation so none of the 200 generated systems (or their ids) change. Sol sits near the centre of the map;
// its wormhole leads to ten Farside systems off the north-west edge, reachable only through the Gateway.
export const FARSIDE = [
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
 * @type {Array<[string, string]>}
 */
const FARSIDE_LINKS = [
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
 * @param {SpaceSystem[]} SYSTEMS - Systems collection augmented in place.
 * @returns {void}
 */
export function addSolGateway(SYSTEMS) {
  const r = rng(GEN_SEED ^ 0x5011),
    byId = Object.fromEntries(SYSTEMS.map((system) => [system.id, system]));
  const used = new Set(SYSTEMS.map((system) => system.name)),
    usedIds = new Set(
      SYSTEMS.flatMap((system) => [
        system.id,
        ...system.stellars.map((stellarBody) => stellarBody.id),
      ]),
    );
  const edges = [];
  for (const system of SYSTEMS)
    for (const l of system.links) if (l > system.id) edges.push([system, byId[l]]);
  // Sol: the clear spot nearest the centre of the galaxy
  const xs = SYSTEMS.map((system) => system.x),
    ys = SYSTEMS.map((system) => system.y),
    CX = (Math.min(...xs) + Math.max(...xs)) / 2,
    CY = (Math.min(...ys) + Math.max(...ys)) / 2;
  let best = null;
  for (let rad = 0; rad < 400 && !best; rad += 6)
    for (let a = 0; a < 6.283 && !best; a += 0.21) {
      const p = { x: CX + Math.cos(a) * rad, y: CY + Math.sin(a) * rad };
      if (
        SYSTEMS.every((system) => Math.hypot(system.x - p.x, system.y - p.y) > 48) &&
        edges.every(([u, v]) => segDist(p, u, v) > 20)
      )
        best = p;
    }
  const sol = {
    id: 'sol',
    name: 'Sol',
    faction: 'quantum',
    x: Math.round(best.x),
    y: Math.round(best.y),
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
        desc: 'The old lunar shipyards, now a customs station watching over the Gateway.',
      },
      {
        id: 'sol-gateway',
        name: 'The Sol Gateway',
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
  const near = SYSTEMS.map((system) => [
    Math.hypot(system.x - sol.x, system.y - sol.y),
    system,
  ]).sort((a, b) => a[0] - b[0]);
  let n = 0;
  for (const [, s] of near) {
    if (n >= 3) break;
    if (n >= 2 && edges.some(([u, v]) => segCross(sol, s, u, v))) continue;
    if (
      edges.some(([u, v]) => segCross(sol, s, u, v)) &&
      n < 2 &&
      near.indexOf(near.find((x) => x[1] === s)) > 4
    )
      continue;
    sol.links.push(s.id);
    s.links.push('sol');
    n++;
  }
  SYSTEMS.push(sol);
  // Farside: off the north-west edge
  const ox = Math.min(...xs) - 250,
    oy = Math.min(...ys) - 30;
  const added = [];
  for (const [id, name, dx, dy, danger] of FARSIDE) {
    const sys = {
      id,
      name,
      faction: 'farside',
      x: Math.round(ox + dx),
      y: Math.round(oy + dy),
      links: [],
      danger,
      stellars: [],
      farside: true,
    };
    const k = id === 'coldharbor' ? 2 : r() < 0.25 ? 0 : r() < 0.7 ? 1 : 2;
    for (let i = 0; i < k; i++) sys.stellars.push(makeStellar(sys, 'farside', r, i, usedIds));
    if (id === 'coldharbor') {
      if (!sys.stellars.some((p) => p.svc.includes('Y'))) sys.stellars[0].svc = 'LTOYB';
      sys.gate = 'sol';
      sys.stellars.push({
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
    for (const p of sys.stellars) p.outlaw = false;
    const a = r() * 6.283,
      d = 900 + r() * 700;
    sys.fields =
      r() < 0.6
        ? [
            {
              id: `${id}-f0`,
              x: Math.round(Math.cos(a) * d),
              y: Math.round(Math.sin(a) * d),
              r: 300,
              ore: ['ore', 'shards', 'gas'][Math.floor(r() * 3)],
              rich: 1 + Math.floor(danger / 2),
              rocks: 9,
            },
          ]
        : [];
    SYSTEMS.push(sys);
    added.push(sys);
    used.add(name);
  }
  const by = Object.fromEntries(added.map((s) => [s.id, s]));
  for (const [a, b] of FARSIDE_LINKS) {
    by[a].links.push(b);
    by[b].links.push(a);
  }
  return { sol, farside: added };
}

// ------------------------------------------------------------------ more moons and more asteroid fields
// A separate pass after the galaxy is built, seeded per system, so no existing world, field or id changes.

/**
 * Surface color palette for procedural uninhabited moons.
 * @type {string[]}
 */
const MOON_COLORS = ['#9a948c', '#b8b2a8', '#7d7871', '#a89c88', '#c9d4dc', '#8e8a9a', '#a7a08f'];

/**
 * Atmospheric and terrain flavor descriptions for uninhabited moons.
 * @type {string[]}
 */
const MOON_DESC = [
  'An airless moon, cratered and quiet.',
  'A small ice moon, its surface cracked into plates.',
  'A grey moon of dust and old impact basins.',
  'A captured asteroid, too small to be round.',
  'A dark moon streaked with frozen gas.',
  'A tidally locked moon, one face forever toward its planet.',
];

/**
 * Roman numerals for procedural moon naming.
 * @type {string[]}
 */
const MOON_NUM = ['I', 'II', 'III'];

/**
 * Secondary procedural pass adding additional unpopulated moons and resource asteroid fields to systems.
 * Seeded per-system based on system ID hash and master seed to preserve determinism.
 * @param {SpaceSystem[]} SYSTEMS - Star systems array, modified in place.
 * @returns {void}
 */
export function addMoonsAndFields(SYSTEMS) {
  for (const system of SYSTEMS) {
    if (system.arena) continue;
    const r = rng(hashId('moons:' + system.id) ^ GEN_SEED),
      free = (x, y, rad, pad) =>
        system.stellars.every(
          (stellarBody) =>
            Math.hypot(stellarBody.x - x, stellarBody.y - y) > (stellarBody.r || 60) + rad + pad,
        );
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const p of [...system.stellars]) {
      if (p.kind !== 'planet' || p.hub || p.site || p.wormhole) continue;
      const n = r() < 0.62 ? (r() < 0.3 ? 2 : 1) : 0,
        have = system.stellars.filter((stellarBody) =>
          stellarBody.id.startsWith(p.id + '-m'),
        ).length;
      for (let k = 0; k < n; k++) {
        const rad = 30 + Math.round(r() * 24);
        for (let tries = 0; tries < 12; tries++) {
          const a = r() * Math.PI * 2,
            d = (p.r || 120) + 170 + r() * 160 + k * 90,
            x = Math.round(p.x + Math.cos(a) * d),
            y = Math.round(p.y + Math.sin(a) * d);
          if (!free(x, y, rad, 130) || Math.hypot(x, y) > 3300) continue;
          system.stellars.push({
            id: `${p.id}-m${have + k + 1}`,
            name: /\s([IVX]+|\d+|Prime|Alpha|Beta|Gamma|Major|Minor)$/.test(p.name)
              ? `${p.name}-${'abc'[have + k] || have + k + 1}`
              : `${p.name} ${MOON_NUM[have + k] || have + k + 1}`,
            kind: 'moon',
            color: MOON_COLORS[Math.floor(r() * MOON_COLORS.length)],
            r: rad,
            x,
            y,
            svc: '',
            tech: 0,
            desc:
              MOON_DESC[Math.floor(r() * MOON_DESC.length)] +
              ` It circles ${p.name}. Nobody lives there.`,
          });
          break;
        }
      }
    }
    // a few more rocks in the existing fields, and sometimes a whole new field
    for (const f of system.fields || []) f.rocks = Math.round(f.rocks * 1.35);
    const kinds = FIELD_ORE[system.faction] || ['ore', 'gas', 'shards'];
    const extra = system.farside ? (r() < 0.5 ? 1 : 0) : r() < 0.5 ? 1 : 0;
    for (let k = 0; k < extra; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const a = r() * Math.PI * 2,
          d = 1100 + r() * 1500,
          x = Math.round(Math.cos(a) * d),
          y = Math.round(Math.sin(a) * d);
        if (
          !free(x, y, 320, 200) ||
          (system.fields || []).some((f) => Math.hypot(f.x - x, f.y - y) < 900)
        )
          continue;
        (system.fields = system.fields || []).push({
          id: `${system.id}-x${k}`,
          x,
          y,
          r: 280 + Math.round(r() * 200),
          ore: kinds[Math.floor(r() * kinds.length)],
          rich: Math.min(3, 1 + Math.floor(((system.danger || 0) + r() * 3) / 3)),
          rocks: 10 + Math.floor(r() * 8),
        });
        break;
      }
    }
  }
}
