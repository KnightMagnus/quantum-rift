// Faction standing only; named-rival relationships use their own scale.
export const STANDING_MIN = -100;
export const STANDING_MAX = 300;
export const EXALTED_STANDING = 200;

/**
 * Bound faction standing without changing the size of an award or penalty.
 * @param {number} value Faction standing after a gain or loss.
 * @returns {number} Standing within the persistent faction range.
 */
export function clampStanding(value) {
  return Math.max(STANDING_MIN, Math.min(STANDING_MAX, value));
}
