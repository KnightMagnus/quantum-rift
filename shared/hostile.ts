import { shipStats, weaponParams, K as physicsConstants } from './rules.ts';
import type { GameAssets, ShipStatsLoadout, ShipStatsBonus } from './rules.ts';

/** Player stat bonuses affecting ship combat power calculations. */
export type HostileBonus = {
  /** Percentage bonus to weapon damage. */
  damagePct?: number;
  /** Percentage bonus to shield capacity. */
  shieldPct?: number;
  /** Percentage bonus to armor hit points. */
  armorPct?: number;
};

/** Loot chest drop configuration for hostile faction types. */
export type LootChestDef = {
  /** Display name of the cache container. */
  name: string;
  /** Hex color code for HUD and drop renders. */
  color: string;
  /** Blueprint family rewarded by the chest. */
  bp: string;
  /** Special resource yielded. */
  res: string;
  /** Material categories dropped. */
  mats: string[];
};

/** Reward breakdown for clearing a Station Holdout wave. */
export type HoldoutReward = {
  /** Credit payout for completing the wave. */
  credits: number;
  /** Material grade rewarded (0 through 4). */
  grade: number;
  /** Faction insignia count rewarded. */
  insignia: number;
};

/** Station Holdout wave definitions, timings, and platform scaling. */
export type HoldoutConfig = {
  /** Total number of escalating waves. */
  waves: number;

  /** Cooldown duration in hours between holdouts. */
  cooldownH: number;

  /** Delay in seconds between consecutive waves. */
  waveGap: number;

  /** Timeout limit in minutes per wave attempt. */
  timeoutMin: number;

  /** Generates array of attacking hull IDs for wave n (1 to 10). */
  wave: (arg0: number) => number[];

  /** Computes rewards for completing wave n. */
  reward: (arg0: number) => HoldoutReward;

  /** Calculates active defense platform count from station defense level. */
  platforms: (arg0: number) => number;
};

/** Umbral Eclipse event parameters and hull pools. */
export type EclipseConfig = {
  /** Hull IDs participating in Eclipse incursions. */
  hulls: number[];
  /** Standard baseline spawn probability. */
  chance: number;
  /** Elevated spawn probability during Thursday events. */
  thursday: number;
};

// Quantum Rift: data: hostile levels and the "can I win?" scan, loot chests, Station Holdout
// waves, and the Umbral Eclipse.

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
/** Combat rating from fitted durability and sustained weapon output, not purchase price. */
export function shipCombatPower(
  assets: GameAssets,
  loadout: ShipStatsLoadout,
  bonus: ShipStatsBonus = {},
): number {
  const stats = shipStats(assets, loadout, bonus);
  if (!stats) return 10;
  let damage = 0;
  for (const [identifier, count] of Object.entries(stats.weapons)) {
    const asset = assets.weapons[identifier];
    if (!asset) continue;
    const weapon = weaponParams(asset);
    // Bays require a separate launch order; point defense is not offensive firepower.
    if (weapon.bay || weapon.pd) continue;
    const rate = weapon.continuous ? physicsConstants.beamDps : 1 / weapon.reload;
    const reach = Math.max(0.75, Math.min(1.25, Math.sqrt(weapon.range / 900)));
    damage += ((count * (weapon.dmgA + weapon.dmgS)) / 2) * rate * reach;
  }
  return Math.max(
    1,
    Math.round(
      Math.sqrt((stats.shield + stats.armor) * Math.max(1, damage * stats.damageMul)) / 1.5,
    ),
  );
}

/** Rating of a stock hull, using the same calculation as fitted ships. */
export function hullCombatPower(assets: GameAssets, hull: number | string): number {
  return shipCombatPower(assets, { hull: Number(hull) });
}

export function playerPower(
  assets: GameAssets,
  hull: number | string | ShipStatsLoadout,
  bonus: HostileBonus = {},
  escorts: Array<number | string> = [],
): number {
  return (
    shipCombatPower(assets, typeof hull === 'object' ? hull : { hull: Number(hull) }, bonus) +
    escorts.reduce<number>((total, escort) => total + hullCombatPower(assets, escort) * 0.6, 0)
  );
}

// ------------------------------------------------------------------ raid scaling and danger ratings

/**
 * Newcomer truce carry-over after Station Tier 3. Ambient hostiles keep overlooking the captain
 * until any one of these limits is reached.
 */
export const TIER3_TRUCE = {
  /** Hostile ships destroyed after building Station Tier 3. */
  kills: 5,
  /** Hyperspace jumps made after building Station Tier 3. */
  jumps: 30,
  /** Effective combat power (see playerPower) that ends the truce at once. */
  power: 150,
};

/** How ambient raid groups scale with the strongest captain present. */
export const RAID_BUDGET = {
  /** Budget multiplier on the captain's power in a danger 0 system. */
  base: 0.35,
  /** Extra budget multiplier per point of system danger. */
  perDanger: 0.15,
};

/**
 * Total hostile power an ambient raid group may bring against a captain.
 * @param power - Strongest captain's effective combat power in the system.
 * @param danger - System danger rating.
 * @returns Combined raider strength the group may not exceed (beyond its lead ship).
 */
export function raidBudget(power: number, danger: number): number {
  return power * (RAID_BUDGET.base + RAID_BUDGET.perDanger * Math.max(0, danger || 0));
}

/**
 * Trims a raid group to a power budget. The lead ship is swapped for the strongest pool hull
 * within budget (or the weakest pool hull when none fits), and escorts are kept only while
 * the group's combined strength stays within budget.
 * @param hulls - Hull IDs as rolled, lead first.
 * @param pool - Hull IDs the raid could draw from.
 * @param strengthOf - Looks up a hull's base strength.
 * @param budget - Maximum combined strength.
 * @returns Hull IDs to spawn, lead first; never empty when `hulls` is not empty.
 */
export function fitRaidToBudget(
  hulls: number[],
  pool: number[],
  strengthOf: (hull: number) => number,
  budget: number,
): number[] {
  if (!hulls.length) return hulls;
  let lead = hulls[0];
  if (strengthOf(lead) > budget) {
    const byStrength = [...pool].sort(
      (firstHull, secondHull) => strengthOf(firstHull) - strengthOf(secondHull),
    );
    const affordable = byStrength.filter((hull) => strengthOf(hull) <= budget);
    lead = affordable.length ? affordable[affordable.length - 1] : (byStrength[0] ?? lead);
  }
  const fitted = [lead];
  let total = strengthOf(lead);
  for (const escort of hulls.slice(1)) {
    if (total + strengthOf(escort) > budget) continue;
    fitted.push(escort);
    total += strengthOf(escort);
  }
  return fitted;
}

/** The lone raider sent at a captain on the "Clear a raider" career goal. */
export const PRACTICE_RAIDER = {
  /** Candidate hulls, weakest first: Gnat Skiff, Dory Hauler, Kestrel Scout. */
  hulls: [703, 704, 705],
  /** Share of the captain's power the raider may have (the weakest hull is the floor). */
  powerShare: 0.55,
};

/** Danger rating of a fight, from the hostile-to-captain power ratio. */
export type DangerTier = 'low' | 'moderate' | 'high' | 'deadly';

/** Upper hostile-to-captain power ratios for each danger tier below Deadly. */
export const DANGER_RATIOS = { low: 0.8, moderate: 1.6, high: 2.6 };

/**
 * Rates how dangerous a fight is for a captain.
 * @param power - Captain's effective combat power.
 * @param threat - Combined hostile power expected.
 * @returns Danger tier.
 */
export function dangerTier(power: number, threat: number): DangerTier {
  const ratio = threat / Math.max(1, power);
  if (ratio <= DANGER_RATIOS.low) return 'low';
  if (ratio <= DANGER_RATIOS.moderate) return 'moderate';
  if (ratio <= DANGER_RATIOS.high) return 'high';
  return 'deadly';
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
