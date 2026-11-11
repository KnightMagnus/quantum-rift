import { credits } from './rules.ts';

/** Hulls listed at or above this price pay docking upkeep. Cheaper hulls dock free. */
export const DOCKING_UPKEEP_MIN_HULL_COST = 10_000_000;
/** Share of the hull's list price charged each time it docks. */
export const DOCKING_UPKEEP_RATE = 0.002;
/** Upkeep never takes more than this share of the captain's credits. */
export const DOCKING_UPKEEP_CREDIT_CAP = 0.1;

/**
 * Upkeep for one docking at the hull's list price, before the credit cap. 0 for hulls below
 * the threshold, so the shipyard can show the rate a buyer will pay.
 */
export function dockingUpkeepRate(hullCost: number): number {
  if (!Number.isFinite(hullCost) || hullCost < DOCKING_UPKEEP_MIN_HULL_COST) return 0;
  return Math.round(hullCost * DOCKING_UPKEEP_RATE);
}

/** Upkeep actually charged for one docking: the rate, capped at a share of current credits. */
export function dockingUpkeepFee(hullCost: number, captainCredits: number): number {
  const rate = dockingUpkeepRate(hullCost);
  if (!rate) return 0;
  const creditCap = Math.floor(Math.max(0, captainCredits || 0) * DOCKING_UPKEEP_CREDIT_CAP);
  return Math.min(rate, creditCap);
}

/** Player-facing notice for a charged upkeep. */
export function dockingUpkeepNotice(fee: number, hullName: string): string {
  return `Docking upkeep for the ${hullName}: ${credits(fee)} credits.`;
}
