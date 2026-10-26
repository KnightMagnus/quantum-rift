import type { StellarBody } from '../server/game.ts';
export type ColonyConfig = {
  /** Base maximum number of colonies allowed per captain. */
  max: number;

  /** Colony cap when Station Tier reaches level 5. */
  maxAtOps5: number;

  /** Founding cost in credits. */
  cost: number;

  /** Required crafting materials as [materialKey, gradeIndex, quantity]. */
  mats: Array<[string, number, number]>;

  /** Storage buffer capacity in hours before colony warehouses fill up. */
  storeHours: number;
};
export type ColonyLevelInfo = {
  /** Number of building plots available at this level. */
  slots: number;

  /** Production rate multiplier. */
  mult: number;

  /** Credit cost to upgrade to this level. */
  cost?: number;

  /** Required materials to upgrade. */
  mats?: Array<[string, number, number]>;
};
export type ColonyBuilding = {
  /** Building display name. */
  name: string;

  /** Construction cost in credits. */
  cost: number;

  /** Commodity tons or credits produced per hour. */
  produce?: Record<string, number>;

  /** Permanent player ship stat bonuses while owned. */
  buff?: Record<string, number>;

  /** In-game description of building output or benefits. */
  desc: string;
};
export type DefenseLevelInfo = {
  /** Station defense rating score. */
  rating: number;

  /** Credit upgrade cost. */
  cost?: number;

  /** Upgrade crafting materials. */
  mats?: Array<[string, number, number]>;
};
export type DefenseConfig = {
  /** Interval in hours between automated station raid attempts. */
  everyH: number;

  /** Minimum Station Tier required before station raids begin. */
  minOps: number;

  /** Defense upgrades and defensive ratings. */
  levels: DefenseLevelInfo[];

  /** Defense rating contributed per Station Tier. */
  opsRating: number;

  /** Defense rating bonus provided by Station Tier 5 Defense Grid research. */
  gridBonus: number;

  /** Live raid wave encounter duration in minutes. */
  waveMin: number;
};
export type MasteryConfig = {
  /** XP thresholds required to reach mastery tiers 1 through 5. */
  tiers: number[];

  /** Cumulative stat buffs per mastery tier. */
  bonus: Array<Record<string, number>>;

  /** XP granted per gameplay action. */
  xp: Record<string, number>;
};
export type ArenaConfig = {
  /** Team sizes supported per arena game mode. */
  modes: Record<string, number>;

  /** Match time limit in minutes. */
  matchMin: number;

  /** Standard ELO rating K-factor. */
  k: number;

  /** Default baseline starting rating. */
  start: number;

  /** Combat arena combat boundary dimension in units. */
  size: number;
};
export type ArenaSystem = {
  /** Unique system ID for the arena match instance. */
  id: string;

  /** Display name of the arena system. */
  name: string;

  /** Faction controlling the instance. */
  faction: string;

  /** Galactic map X coordinate. */
  x: number;

  /** Galactic map Y coordinate. */
  y: number;

  /** Hyperspace jump route connections. */
  links: string[];

  /** System danger rating. */
  danger: number;

  /** Celestial bodies and stations. */
  stellars: StellarBody[];

  /** Asteroid or dust fields. */
  fields: Array<{ x: number; y: number; r: number; ore: string; rich: number; rocks: number }>;

  /** Flag indicating this system is an instanced arena combat zone. */
  arena: boolean;
};
export type ExchangeConfig = {
  /** Player transaction fee fraction (e.g. 0.02 = 2%). */
  fee: number;
  /** Maximum active trade orders permitted per captain. */
  maxOrders: number;
  /** Absolute maximum listing price in credits. */
  maxPrice: number;
};
export type LeaderboardCategory = {
  /** Human-readable leaderboard title. */
  name: string;
};

// Quantum Rift: data: planetary colonies, station defense, ship mastery, the arena, the player
// exchange and leaderboards. Shared by server and client.

// ------------------------------------------------------------------ planetary colonies (unsettled planets in Frontier and the Deep)
/**
 * Planetary colony foundation limits, costs, and warehouse limits.
 */
export const COLONY: ColonyConfig = {
  max: 2,
  maxAtOps5: 3,
  cost: 400000,
  mats: [
    ['alloy', 1, 2],
    ['isotope', 0, 1],
  ],
  storeHours: 24,
};

/**
 * Colony progression tiers detailing building slots, multipliers, and upgrade requirements.
 */
export const COLONY_LEVELS: Array<ColonyLevelInfo | null> = [
  // level -> building slots, production multiplier, upgrade cost
  null,
  { slots: 2, mult: 1.0 },
  {
    slots: 3,
    mult: 1.25,
    cost: 350000,
    mats: [
      ['alloy', 2, 1],
      ['crystal', 1, 1],
    ],
  },
  {
    slots: 4,
    mult: 1.5,
    cost: 800000,
    mats: [
      ['alloy', 3, 1],
      ['crystal', 2, 1],
    ],
  },
  {
    slots: 5,
    mult: 1.8,
    cost: 1600000,
    mats: [
      ['alloy', 3, 2],
      ['crystal', 3, 1],
      ['isotope', 2, 1],
    ],
  },
  {
    slots: 6,
    mult: 2.2,
    cost: 3000000,
    mats: [
      ['alloy', 4, 1],
      ['crystal', 3, 2],
      ['isotope', 3, 1],
    ],
  },
];

// produce: commodity tons per hour (or credits per hour); buff: permanent ship bonus while you own the building (capped per stat)
/**
 * Constructible colony infrastructure buildings, outputs, and passive player bonuses.
 */
export const BUILDINGS: Record<string, ColonyBuilding> = {
  farm: {
    name: 'Hydroponic Farms',
    cost: 120000,
    produce: { food: 6 },
    desc: 'Grows food for the frontier markets.',
  },
  mine: {
    name: 'Deep Mine',
    cost: 160000,
    produce: { ore: 5 },
    desc: 'Raw ore, ready for your station Workshop.',
  },
  gas: {
    name: 'Gas Extractor',
    cost: 160000,
    produce: { gas: 5 },
    desc: "Volatile gas from the planet's crust.",
  },
  crystal: {
    name: 'Crystal Works',
    cost: 220000,
    produce: { shards: 3 },
    desc: 'Grows crystal shards in pressure vats.',
  },
  habitat: {
    name: 'Habitat Dome',
    cost: 200000,
    produce: { credits: 2500 },
    desc: 'Settlers pay rent: credits every hour.',
  },
  foundry: {
    name: 'Orbital Foundry',
    cost: 300000,
    produce: { industrial: 4 },
    desc: 'Industrial goods for export.',
  },
  shieldgen: {
    name: 'Shield Array',
    cost: 450000,
    buff: { shieldPct: 3 },
    desc: 'Permanent +3% shields on every ship you fly.',
  },
  yards: {
    name: 'Hull Yards',
    cost: 450000,
    buff: { armorPct: 3 },
    desc: 'Permanent +3% armor on every ship you fly.',
  },
  academy: {
    name: 'Gunnery Range',
    cost: 500000,
    buff: { damagePct: 2 },
    desc: 'Permanent +2% weapon damage.',
  },
  beacon: {
    name: 'Nav Beacon',
    cost: 350000,
    buff: { speedPct: 2, fuel: 50 },
    desc: 'Permanent +2% speed and +50 fuel.',
  },
};

/**
 * Maximum cumulative stat bonuses attainable from colony structures.
 */
export const BUFF_CAP: Record<string, number> = {
  shieldPct: 9,
  armorPct: 9,
  damagePct: 6,
  speedPct: 6,
  fuel: 150,
};

// ------------------------------------------------------------------ station defense: raids on Personal Stations
/**
 * Station security and defense parameters against periodic raider attacks.
 */
export const DEFENSE: DefenseConfig = {
  everyH: 8,
  minOps: 2,
  levels: [
    // defense level -> rating and upgrade cost
    { rating: 0 },
    { rating: 180, cost: 80000, mats: [['alloy', 0, 2]] },
    { rating: 380, cost: 220000, mats: [['alloy', 1, 2]] },
    {
      rating: 650,
      cost: 500000,
      mats: [
        ['alloy', 2, 2],
        ['crystal', 1, 1],
      ],
    },
    {
      rating: 1000,
      cost: 1000000,
      mats: [
        ['alloy', 3, 2],
        ['crystal', 2, 1],
      ],
    },
    {
      rating: 1500,
      cost: 2000000,
      mats: [
        ['alloy', 4, 1],
        ['crystal', 3, 1],
        ['isotope', 2, 1],
      ],
    },
  ],
  opsRating: 120,
  gridBonus: 400, // per Station Tier, and the Station Tier 5 Defense Grid
  waveMin: 4, // live waves last up to four minutes
};

// ------------------------------------------------------------------ ship mastery (per hull)
/**
 * Ship mastery configuration, tier XP thresholds, bonuses, and XP sources.
 */
export const MASTERY: MasteryConfig = {
  tiers: [0, 300, 1000, 2500, 6000], // xp to reach tiers 1-5
  bonus: [
    {},
    {},
    { shieldPct: 5, armorPct: 5 },
    { shieldPct: 5, armorPct: 5, damagePct: 5 },
    { shieldPct: 5, armorPct: 5, damagePct: 5, speedPct: 5, turnPct: 5 },
    { shieldPct: 10, armorPct: 10, damagePct: 8, speedPct: 6, turnPct: 8 },
  ],
  xp: { kill: 1 / 8, jump: 3, job: 15, mined: 0.3 },
};

/**
 * Calculates current ship mastery tier (1-5) achieved based on earned XP.
 * @param experience - Accumulated hull mastery experience points.
 * @returns Mastery tier level (1 to 5).
 */
export function masteryTier(experience: number): number {
  let time = 1;
  for (let index = 1; index < MASTERY.tiers.length; index++)
    if (experience >= MASTERY.tiers[index]) time = index + 1;
  return time;
}

// ------------------------------------------------------------------ the arena: instanced, rated PvP away from the open galaxy
/**
 * Arena instanced combat rules and rating parameters.
 */
export const ARENA: ArenaConfig = {
  modes: { '1v1': 1, '2v2': 2, '4v4': 4 },
  matchMin: 5,
  k: 32,
  start: 1000,
  size: 1600,
};

/**
 * Instantiates a temporary star system structure to host an arena match.
 * @param identifier - Unique match or session identifier.
 * @returns Stand-in star system data for the arena combat instance.
 */
export function arenaSystem(identifier: string): ArenaSystem {
  // a stand-in system for an arena instance (registered on demand on both server and client)
  return {
    id: identifier,
    name: 'The Crucible',
    faction: 'quantum',
    x: 0,
    y: 0,
    links: [],
    danger: 9,
    stellars: [],
    fields: [],
    arena: true,
  };
}

/**
 * Calculates standard Elo rating point change following a match outcome.
 * @param reputationAmount - Rating of player A.
 * @param rightBoundary - Rating of player B.
 * @param firstWon - True if player A won; false if player B won.
 * @param entryKey - Rating change sensitivity factor.
 * @returns Net rating points gained or lost by player A.
 */
export function elo(
  playerRating: number,
  opponentRating: number,
  playerWon: boolean,
  ratingSensitivity: number = ARENA.k,
): number {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(ratingSensitivity * ((playerWon ? 1 : 0) - expectedScore));
}

// ------------------------------------------------------------------ the exchange (player market)
/**
 * Player-to-player trade exchange rules and transaction constraints.
 */
export const EXCHANGE: ExchangeConfig = { fee: 0.02, maxOrders: 12, maxPrice: 1e9 };

// ------------------------------------------------------------------ leaderboards
/**
 * Ranked leaderboard categories and display labels.
 */
export const BOARDS: Record<string, LeaderboardCategory> = {
  earned: { name: 'Credits earned' },
  kills: { name: 'Ships destroyed' },
  mined: { name: 'Tons mined' },
  arena: { name: 'Arena rating' },
  station: { name: 'Station Tier' },
  colonies: { name: 'Colonies' },
  mastery: { name: 'Mastery' },
};
