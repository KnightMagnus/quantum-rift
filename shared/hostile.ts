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

// Quantum Rift: data: hostile levels and the "can I win?" scan, loot chests, Station Holdout
// waves, and the Umbral Eclipse.

/**
 * Player stat bonuses affecting ship combat power calculations.
 * HostileBonus fields:
 * [damagePct]: - Percentage bonus to weapon damage.
 * [shieldPct]: - Percentage bonus to shield capacity.
 * [armorPct]: - Percentage bonus to armor hit points.
 */

/**
 * Loot chest drop configuration for hostile faction types.
 * LootChestDef fields:
 * name: - Display name of the cache container.
 * color: - Hex color code for HUD and drop renders.
 * bp: - Blueprint family rewarded by the chest.
 * res: - Special resource yielded.
 * mats: - Material categories dropped.
 */

/**
 * Reward breakdown for clearing a Station Holdout wave.
 * HoldoutReward fields:
 * credits: - Credit payout for completing the wave.
 * grade: - Material grade rewarded (0 through 4).
 * insignia: - Faction insignia count rewarded.
 */

/**
 * Station Holdout wave definitions, timings, and platform scaling.
 * HoldoutConfig fields:
 * waves: - Total number of escalating waves.
 * cooldownH: - Cooldown duration in hours between holdouts.
 * waveGap: - Delay in seconds between consecutive waves.
 * timeoutMin: - Timeout limit in minutes per wave attempt.
 * wave: - Generates array of attacking hull IDs for wave n (1 to 10).
 * reward: - Computes rewards for completing wave n.
 * platforms: - Calculates active defense platform count from station defense level.
 */

/**
 * Umbral Eclipse event parameters and hull pools.
 * EclipseConfig fields:
 * hulls: - Hull IDs participating in Eclipse incursions.
 * chance: - Standard baseline spawn probability.
 * thursday: - Elevated spawn probability during Thursday events.
 */

// ------------------------------------------------------------------ levels: from a ship's effective strength

/**
 * Calculates a ship's combat level from its effective power rating.
 * @param power - Effective ship combat power.
 * @returns Combat level (minimum 1).
 */
export function levelOf(power: number): number {
  return Math.max(1, Math.round(4 * Math.log2(1 + Math.max(0, power) / 12)));
}

/**
 * Calculates the odds of winning a straight 1v1 fight between two combat powers.
 * @param mine - Attacker or player combat power.
 * @param theirs - Opponent or hostile combat power.
 * @returns Win probability value between 0.0 and 1.0.
 */
// odds of winning a straight fight between two effective strengths (a logistic on the level gap)
export function winOdds(mine: number, theirs: number): number {
  const distance = levelOf(mine) - levelOf(theirs);
  return 1 / (1 + Math.exp(-distance / 2.5));
}

/**
 * Computes a player's effective combat power based on hull, bonuses, and escort wingmates.
 * @param assets - Game assets collection containing ship hull definitions.
 * @param hull - Player's current ship hull ID.
 * @param bonus - Research and crew percentage bonuses.
 * @param escorts - Hull IDs of escort / wingmate ships.
 * @returns Total effective combat power rating.
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
 */
export const CHEST_CHANCE: number = 0.3; // per hostile kill (bosses and kingpins always drop one)

// ------------------------------------------------------------------ Station Holdout: ten escalating waves at your own station

/**
 * Station Holdout wave rules, enemy generators, and rewards.
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
 */
export const ECLIPSE: EclipseConfig = { hulls: [761, 762, 763], chance: 0.1, thursday: 0.25 };
