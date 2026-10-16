// Quantum Rift 0.7 "Frontier Life" data: planetary colonies, station defense, ship mastery, the arena, the player
// exchange and leaderboards. Shared by server and client.

/**
 * @typedef {Object} ColonyConfig
 * @property {number} max - Base maximum number of colonies allowed per captain.
 * @property {number} maxAtOps5 - Colony cap when Station Tier reaches level 5.
 * @property {number} cost - Founding cost in credits.
 * @property {Array<[string, number, number]>} mats - Required crafting materials as [materialKey, gradeIndex, quantity].
 * @property {number} storeHours - Storage buffer capacity in hours before colony warehouses fill up.
 */

/**
 * @typedef {Object} ColonyLevelInfo
 * @property {number} slots - Number of building plots available at this level.
 * @property {number} mult - Production rate multiplier.
 * @property {number} [cost] - Credit cost to upgrade to this level.
 * @property {Array<[string, number, number]>} [mats] - Required materials to upgrade.
 */

/**
 * @typedef {Object} ColonyBuilding
 * @property {string} name - Building display name.
 * @property {number} cost - Construction cost in credits.
 * @property {Object.<string, number>} [produce] - Commodity tons or credits produced per hour.
 * @property {Object.<string, number>} [buff] - Permanent player ship stat bonuses while owned.
 * @property {string} desc - In-game description of building output or benefits.
 */

/**
 * @typedef {Object} DefenseLevelInfo
 * @property {number} rating - Station defense rating score.
 * @property {number} [cost] - Credit upgrade cost.
 * @property {Array<[string, number, number]>} [mats] - Upgrade crafting materials.
 */

/**
 * @typedef {Object} DefenseConfig
 * @property {number} everyH - Interval in hours between automated station raid attempts.
 * @property {number} minOps - Minimum Station Tier required before station raids begin.
 * @property {DefenseLevelInfo[]} levels - Defense upgrades and defensive ratings.
 * @property {number} opsRating - Defense rating contributed per Station Tier.
 * @property {number} gridBonus - Defense rating bonus provided by Station Tier 5 Defense Grid research.
 * @property {number} waveMin - Live raid wave encounter duration in minutes.
 */

/**
 * @typedef {Object} MasteryConfig
 * @property {number[]} tiers - XP thresholds required to reach mastery tiers 1 through 5.
 * @property {Array<Object.<string, number>>} bonus - Cumulative stat buffs per mastery tier.
 * @property {Object.<string, number>} xp - XP granted per gameplay action.
 */

/**
 * @typedef {Object} ArenaConfig
 * @property {Object.<string, number>} modes - Team sizes supported per arena game mode.
 * @property {number} matchMin - Match time limit in minutes.
 * @property {number} k - Standard ELO rating K-factor.
 * @property {number} start - Default baseline starting rating.
 * @property {number} size - Combat arena combat boundary dimension in units.
 */

/**
 * @typedef {Object} ArenaSystem
 * @property {string} id - Unique system ID for the arena match instance.
 * @property {string} name - Display name of the arena system.
 * @property {string} faction - Faction controlling the instance.
 * @property {number} x - Galactic map X coordinate.
 * @property {number} y - Galactic map Y coordinate.
 * @property {string[]} links - Hyperspace jump route connections.
 * @property {number} danger - System danger rating.
 * @property {any[]} stellars - Celestial bodies and stations.
 * @property {any[]} fields - Asteroid or dust fields.
 * @property {boolean} arena - Flag indicating this system is an instanced arena combat zone.
 */

/**
 * @typedef {Object} ExchangeConfig
 * @property {number} fee - Player transaction fee fraction (e.g. 0.02 = 2%).
 * @property {number} maxOrders - Maximum active trade orders permitted per captain.
 * @property {number} maxPrice - Absolute maximum listing price in credits.
 */

/**
 * @typedef {Object} LeaderboardCategory
 * @property {string} name - Human-readable leaderboard title.
 */

// ------------------------------------------------------------------ planetary colonies (unsettled planets in Frontier and the Deep)
/**
 * Planetary colony foundation limits, costs, and warehouse limits.
 * @type {ColonyConfig}
 */
export const COLONY = {
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
 * @type {Array<ColonyLevelInfo|null>}
 */
export const COLONY_LEVELS = [
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
 * @type {Object.<string, ColonyBuilding>}
 */
export const BUILDINGS = {
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
    desc: 'Raw ore, ready for your station refinery.',
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
 * @type {Object.<string, number>}
 */
export const BUFF_CAP = { shieldPct: 9, armorPct: 9, damagePct: 6, speedPct: 6, fuel: 150 };

// ------------------------------------------------------------------ station defense: raids on Personal Stations
/**
 * Station security and defense parameters against periodic raider attacks.
 * @type {DefenseConfig}
 */
export const DEFENSE = {
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
 * @type {MasteryConfig}
 */
export const MASTERY = {
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
 * @param {number} xp - Accumulated hull mastery experience points.
 * @returns {number} Mastery tier level (1 to 5).
 */
export function masteryTier(xp) {
  let t = 1;
  for (let i = 1; i < MASTERY.tiers.length; i++) if (xp >= MASTERY.tiers[i]) t = i + 1;
  return t;
}

// ------------------------------------------------------------------ the arena: instanced, rated PvP away from the open galaxy
/**
 * Arena instanced combat rules and rating parameters.
 * @type {ArenaConfig}
 */
export const ARENA = {
  modes: { '1v1': 1, '2v2': 2, '4v4': 4 },
  matchMin: 5,
  k: 32,
  start: 1000,
  size: 1600,
};

/**
 * Instantiates a temporary star system structure to host an arena match.
 * @param {string} id - Unique match or session identifier.
 * @returns {ArenaSystem} Stand-in star system data for the arena combat instance.
 */
export function arenaSystem(id) {
  // a stand-in system for an arena instance (registered on demand on both server and client)
  return {
    id,
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
 * @param {number} ra - Rating of player A.
 * @param {number} rb - Rating of player B.
 * @param {boolean} aWon - True if player A won; false if player B won.
 * @param {number} [k=32] - Rating change sensitivity factor.
 * @returns {number} Net rating points gained or lost by player A.
 */
export function elo(ra, rb, aWon, k = ARENA.k) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  return Math.round(k * ((aWon ? 1 : 0) - ea));
}

// ------------------------------------------------------------------ the exchange (player market)
/**
 * Player-to-player trade exchange rules and transaction constraints.
 * @type {ExchangeConfig}
 */
export const EXCHANGE = { fee: 0.02, maxOrders: 12, maxPrice: 1e9 };

// ------------------------------------------------------------------ leaderboards
/**
 * Ranked leaderboard categories and display labels.
 * @type {Object.<string, LeaderboardCategory>}
 */
export const BOARDS = {
  earned: { name: 'Credits earned' },
  kills: { name: 'Ships destroyed' },
  mined: { name: 'Tons mined' },
  arena: { name: 'Arena rating' },
  station: { name: 'Station Tier' },
  colonies: { name: 'Colonies' },
  mastery: { name: 'Mastery' },
};
