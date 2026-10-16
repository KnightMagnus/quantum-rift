// Quantum Rift 0.9 "Hostile Space" data: hostile levels and the "can I win?" scan, loot chests, Station Holdout
// waves, and the Umbral Eclipse. (2.6: directives and solo armadas were removed.)

/**
 * Player stat bonuses affecting ship combat power calculations.
 * @typedef {Object} HostileBonus
 * @property {number} [damagePct] - Percentage bonus to weapon damage.
 * @property {number} [shieldPct] - Percentage bonus to shield capacity.
 * @property {number} [armorPct] - Percentage bonus to armor hit points.
 */

/**
 * Loot chest drop configuration for hostile faction types.
 * @typedef {Object} LootChestDef
 * @property {string} name - Display name of the cache container.
 * @property {string} color - Hex color code for HUD and drop renders.
 * @property {string} bp - Blueprint family rewarded by the chest.
 * @property {string} res - Special resource yielded.
 * @property {string[]} mats - Material categories dropped.
 */

/**
 * Reward breakdown for clearing a Station Holdout wave.
 * @typedef {Object} HoldoutReward
 * @property {number} credits - Credit payout for completing the wave.
 * @property {number} grade - Material grade rewarded (0 through 4).
 * @property {number} insignia - Faction insignia count rewarded.
 */

/**
 * Station Holdout wave definitions, timings, and platform scaling.
 * @typedef {Object} HoldoutConfig
 * @property {number} waves - Total number of escalating waves.
 * @property {number} cooldownH - Cooldown duration in hours between holdouts.
 * @property {number} waveGap - Delay in seconds between consecutive waves.
 * @property {number} timeoutMin - Timeout limit in minutes per wave attempt.
 * @property {function(number): number[]} wave - Generates array of attacking hull IDs for wave n (1 to 10).
 * @property {function(number): HoldoutReward} reward - Computes rewards for completing wave n.
 * @property {function(number): number} platforms - Calculates active defense platform count from station defense level.
 */

/**
 * Umbral Eclipse event parameters and hull pools.
 * @typedef {Object} EclipseConfig
 * @property {number[]} hulls - Hull IDs participating in Eclipse incursions.
 * @property {number} chance - Standard baseline spawn probability.
 * @property {number} thursday - Elevated spawn probability during Thursday events.
 */

// ------------------------------------------------------------------ levels: from a ship's effective strength

/**
 * Calculates a ship's combat level from its effective power rating.
 * @param {number} power - Effective ship combat power.
 * @returns {number} Combat level (minimum 1).
 */
export function levelOf(power) {
  return Math.max(1, Math.round(4 * Math.log2(1 + Math.max(0, power) / 12)));
}

/**
 * Calculates the odds of winning a straight 1v1 fight between two combat powers.
 * @param {number} mine - Attacker or player combat power.
 * @param {number} theirs - Opponent or hostile combat power.
 * @returns {number} Win probability value between 0.0 and 1.0.
 */
// odds of winning a straight fight between two effective strengths (a logistic on the level gap)
export function winOdds(mine, theirs) {
  const d = levelOf(mine) - levelOf(theirs);
  return 1 / (1 + Math.exp(-d / 2.5));
}

/**
 * Computes a player's effective combat power based on hull, bonuses, and escort wingmates.
 * @param {any} A - Game assets collection containing ship hull definitions.
 * @param {number|string} hull - Player's current ship hull ID.
 * @param {HostileBonus} [bonus={}] - Research and crew percentage bonuses.
 * @param {Array<number|string>} [escorts=[]] - Hull IDs of escort / wingmate ships.
 * @returns {number} Total effective combat power rating.
 */
// a player's effective strength: hull strength scaled by their bonuses, plus a share of their escorts
export function playerPower(A, hull, bonus = {}, escorts = []) {
  const H = A.ships[hull];
  if (!H) return 10;
  const b = 1 + ((bonus.damagePct || 0) + (bonus.shieldPct || 0) + (bonus.armorPct || 0)) / 300;
  return (
    (H.strength || 10) * b +
    escorts.reduce((t, h) => t + ((A.ships[h] || {}).strength || 0) * 0.6, 0)
  );
}

// ------------------------------------------------------------------ loot chests: each hostile type drops its own

/**
 * Loot chest drop tables and metadata by hostile faction.
 * @type {Record<string, LootChestDef>}
 */
export const CHESTS = {
  hollow: {
    name: 'Hollow Cache',
    color: '#ff7a5a',
    bp: 'vanguard',
    res: 'warrants',
    mats: ['alloy'],
  },
  umbral: {
    name: 'Umbral Reliquary',
    color: '#b48aff',
    bp: 'nightglass',
    res: 'umbra',
    mats: ['crystal', 'isotope'],
  },
  swarm: {
    name: 'Swarm Nodule',
    color: '#a8c840',
    bp: 'swarmbreaker',
    res: 'chitin',
    mats: ['isotope'],
  },
  eclipse: {
    name: 'Eclipse Shard Cache',
    color: '#e682fa',
    bp: 'nightglass',
    res: 'umbra',
    mats: ['crystal'],
  },
};

/**
 * Probability of an ordinary hostile kill dropping a loot chest (0.3 = 30%).
 * @type {number}
 */
export const CHEST_CHANCE = 0.3; // per hostile kill (bosses and kingpins always drop one)

// ------------------------------------------------------------------ Station Holdout: ten escalating waves at your own station

/**
 * Station Holdout wave rules, enemy generators, and rewards.
 * @type {HoldoutConfig}
 */
export const HOLDOUT = {
  waves: 10,
  cooldownH: 2,
  waveGap: 6,
  timeoutMin: 3,
  wave(n) {
    // wave n (1-10): which hulls attack
    const pools = [
      [705, 705, 708],
      [708, 708, 711],
      [708, 711, 711],
      [711, 711, 716],
      [711, 716, 761],
      [716, 716, 762],
      [716, 762, 762],
      [762, 762, 763],
      [762, 763, 763],
      [764, 763, 763, 762],
    ];
    const p = pools[n - 1];
    const out = [];
    for (let i = 0; i < 2 + Math.ceil(n / 2); i++) out.push(p[i % p.length]);
    if (n === 10) out[0] = 764;
    return out;
  },
  reward(n) {
    return { credits: 8000 * n * n, grade: Math.min(4, Math.floor(n / 3)), insignia: n };
  },
  platforms(defense) {
    return 1 + Math.min(5, defense || 0);
  },
};

// ------------------------------------------------------------------ the Umbral Eclipse: violet-lit Umbral cells that roam the dark

/**
 * Configuration for the roaming Umbral Eclipse event.
 * @type {EclipseConfig}
 */
export const ECLIPSE = { hulls: [761, 762, 763], chance: 0.1, thursday: 0.25 };
