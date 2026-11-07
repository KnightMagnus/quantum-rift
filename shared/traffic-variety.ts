/** Number of recent ambient picks a system remembers when spreading hull choices. */
export const RECENT_TRAFFIC_HULLS = 12;

/**
 * Counts how many traffic pools list each hull.
 * @param pools Every faction's trader and warship pools.
 * @returns Pool count per hull ID.
 */
export function hullUbiquity(pools: Iterable<readonly number[]>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const pool of pools)
    for (const hull of new Set(pool)) counts.set(hull, (counts.get(hull) || 0) + 1);
  return counts;
}

/**
 * Picks an ambient traffic hull, favouring hulls the system has not shown lately.
 *
 * Starter hulls appear in many faction pools, so a uniform pick made them the most common
 * ships everywhere. Hulls shared by many pools are scaled down by the square root of that
 * count, and hulls already flying or picked recently by the square of their repeats. Every
 * hull in a pool stays possible, and the weighting adapts as pools gain or lose hulls.
 * @param pool Candidate hull IDs; an ID listed twice keeps double weight.
 * @param seen How many times a hull is already flying here or was picked recently.
 * @param roll Uniform random number in [0, 1).
 * @param ubiquity Number of traffic pools that list each hull (see hullUbiquity).
 * @returns The chosen hull, or undefined for an empty pool.
 */
export function pickVariedHull(
  pool: readonly number[],
  seen: (hull: number) => number,
  roll: number = Math.random(),
  ubiquity?: ReadonlyMap<number, number>,
): number | undefined {
  if (!pool.length) return undefined;
  const weights = new Map<number, number>();
  for (const hull of pool) weights.set(hull, (weights.get(hull) || 0) + 1);
  let total = 0;
  for (const [hull, listed] of weights) {
    const shared = Math.sqrt(Math.max(1, ubiquity?.get(hull) || 1));
    const weight = listed / shared / (1 + seen(hull)) ** 2;
    weights.set(hull, weight);
    total += weight;
  }
  let remaining = roll * total;
  for (const [hull, weight] of weights) {
    remaining -= weight;
    if (remaining < 0) return hull;
  }
  return pool[pool.length - 1];
}
