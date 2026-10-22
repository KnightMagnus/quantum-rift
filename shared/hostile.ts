import type { GameAssets } from './rules.ts';
export type HostileBonus = { damagePct?: number; shieldPct?: number; armorPct?: number };
export type LootChestDef = { name: string; color: string; bp: string; res: string; mats: string[] };
export type HoldoutReward = { credits: number; grade: number; insignia: number };
export type HoldoutConfig = {
  waves: number;
  cooldownH: number;
  waveGap: number;
  timeoutMin: number;
  wave: (arg0: number) => number[];
  reward: (arg0: number) => HoldoutReward;
  platforms: (arg0: number) => number;
};
export type EclipseConfig = { hulls: number[]; chance: number; thursday: number };
/** @import { GameAssets } from './rules.ts' */

// Quantum Rift: data: hostile levels and the "can I win?" scan, loot chests, Station Holdout
// waves, and the Umbral Eclipse.

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
 * @property {(arg0: number) => number[]} wave - Generates array of attacking hull IDs for wave n (1 to 10).
 * @property {(arg0: number) => HoldoutReward} reward - Computes rewards for completing wave n.
 * @property {(arg0: number) => number} platforms - Calculates active defense platform count from station defense level.
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
export function levelOf(power: number): number {
  return Math.max(1, Math.round(4 * Math.log2(1 + Math.max(0, power) / 12)));
}

/**
 * Calculates the odds of winning a straight 1v1 fight between two combat powers.
 * @param {number} mine - Attacker or player combat power.
 * @param {number} theirs - Opponent or hostile combat power.
 * @returns {number} Win probability value between 0.0 and 1.0.
 */
// odds of winning a straight fight between two effective strengths (a logistic on the level gap)
export function winOdds(mine: number, theirs: number): number {
  const distance = levelOf(mine) - levelOf(theirs);
  return 1 / (1 + Math.exp(-distance / 2.5));
}

/**
 * Computes a player's effective combat power based on hull, bonuses, and escort wingmates.
 * @param {GameAssets} assets - Game assets collection containing ship hull definitions.
 * @param {number|string} hull - Player's current ship hull ID.
 * @param {HostileBonus} [bonus={}] - Research and crew percentage bonuses.
 * @param {Array<number|string>} [escorts=[]] - Hull IDs of escort / wingmate ships.
 * @returns {number} Total effective combat power rating.
 */
// a player's effective strength: hull strength scaled by their bonuses, plus a share of their escorts
export function playerPower(
  assets: GameAssets,
  hull: number | string,
  bonus: HostileBonus = {},
  escorts: Array<number | string> = [],
): number {
  const shipHullAsset = assets.ships[hull];
  if (!shipHullAsset) return 10;
  const secondValue =
    1 + ((bonus.damagePct || 0) + (bonus.shieldPct || 0) + (bonus.armorPct || 0)) / 300;
  return (
    (shipHullAsset.strength || 10) * secondValue +
    escorts.reduce<number>(
      (time, height) => time + ((assets.ships[height] || {}).strength || 0) * 0.6,
      0,
    )
  );
}

// ------------------------------------------------------------------ loot chests: each hostile type drops its own

/**
 * Loot chest drop tables and metadata by hostile faction.
 * @type {Record<string, LootChestDef>}
 */
export const CHESTS: Record<string, LootChestDef> = {
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
export const CHEST_CHANCE: number = 0.3; // per hostile kill (bosses and kingpins always drop one)

// ------------------------------------------------------------------ Station Holdout: ten escalating waves at your own station

/**
 * Station Holdout wave rules, enemy generators, and rewards.
 * @type {HoldoutConfig}
 */
export const HOLDOUT: HoldoutConfig = {
  waves: 10,
  cooldownH: 2,
  waveGap: 6,
  timeoutMin: 3,
  wave(count) {
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
    const pool = pools[count - 1];
    const result = [];
    for (let index = 0; index < 2 + Math.ceil(count / 2); index++)
      result.push(pool[index % pool.length]);
    if (count === 10) result[0] = 764;
    return result;
  },
  reward(count) {
    return {
      credits: 8000 * count * count,
      grade: Math.min(4, Math.floor(count / 3)),
      insignia: count,
    };
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
export const ECLIPSE: EclipseConfig = { hulls: [761, 762, 763], chance: 0.1, thursday: 0.25 };
