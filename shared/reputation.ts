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

/** Standing at or below which a lawful port refuses landing clearance. */
export const LANDING_REFUSAL_STANDING = -30;

/** What docking control weighs when a captain asks to land. */
export type LandingClearanceRequest = {
  /** Captain's standing with the faction that runs the port's system. */
  standing: number;
  /** Outlaw havens ignore faction standing. */
  outlawPort: boolean;
  /** The port is the captain's own Personal Station. */
  ownStation: boolean;
  /** Expiry time (ms) of a bought landing pass for this port, or 0 without one. */
  passExpires: number;
  /** Current time (ms). */
  now: number;
};

/**
 * Decide whether docking control turns a captain away. A captain's own Personal
 * Station always lets them in, whatever their record in that system.
 * @param request Standing, port and pass details for the landing attempt.
 * @returns True when landing clearance is refused.
 */
export function landingRefused(request: LandingClearanceRequest): boolean {
  if (request.ownStation || request.outlawPort) return false;
  return request.standing <= LANDING_REFUSAL_STANDING && request.passExpires <= request.now;
}
