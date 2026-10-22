// Faction standing only; named-rival relationships use their own scale.
export const STANDING_MIN = -100;
export const STANDING_MAX = 300;
export const EXALTED_STANDING = 200;

/**
 * Bound faction standing without changing the size of an award or penalty.
 * @param value Faction standing after a gain or loss.
 * @returns Standing within the persistent faction range.
 */
export function clampStanding(value: number): number {
  return Math.max(STANDING_MIN, Math.min(STANDING_MAX, value));
}
