import { K as physicsConstants } from './rules.ts';

/** A body that blocks hyperjumps inside its jump-clear radius. */
export interface JumpObstacle {
  x: number;
  y: number;
}

/** Usual arrival distance from the system centre. */
const BASE_ARRIVAL_RADIUS = 2200;
/** Arrival is never placed further out than this, even in crowded systems. */
const MAX_ARRIVAL_RADIUS = 5200;
/**
 * Extra clearance beyond jumpClear. An arriving ship drifts inward at full speed for
 * the 1.5s before chained autopilot fires the next jump, so it must still be clear then.
 */
const ARRIVAL_DRIFT_MARGIN = 700;

/** Distance from a point to the nearest obstacle. */
function nearestObstacleDistance(obstacles: readonly JumpObstacle[], x: number, y: number) {
  let nearest = Infinity;
  for (const obstacle of obstacles)
    nearest = Math.min(nearest, Math.hypot(x - obstacle.x, y - obstacle.y));
  return nearest;
}

/**
 * Radius along the arrival bearing where a ship lands clear enough to jump again at once.
 * @param system System whose stellar bodies block jumps.
 * @param bearing Arrival bearing from the centre (0 = up, clockwise, matching ship angles).
 */
export function hyperspaceArrivalRadius(
  system: { stellars: readonly JumpObstacle[] },
  bearing: number,
): number {
  const needed = physicsConstants.jumpClear + ARRIVAL_DRIFT_MARGIN;
  for (let radius = BASE_ARRIVAL_RADIUS; radius <= MAX_ARRIVAL_RADIUS; radius += 100) {
    const x = Math.sin(bearing) * radius,
      y = -Math.cos(bearing) * radius;
    if (nearestObstacleDistance(system.stellars, x, y) >= needed) return radius;
  }
  return MAX_ARRIVAL_RADIUS;
}

/**
 * Heading for a ship that must fly clear of planets before jumping. It keeps the
 * course toward the next system when that already leads away from the nearest blocking
 * body; otherwise it turns straight away from that body instead of crossing the system.
 * @param system System whose stellar bodies block jumps.
 * @param x Ship position.
 * @param y Ship position.
 * @param routeBearing Bearing toward the next system on the route.
 */
export function jumpClearHeading(
  system: { stellars: readonly JumpObstacle[] },
  x: number,
  y: number,
  routeBearing: number,
): number {
  let blocker: JumpObstacle | undefined;
  let nearest = Infinity;
  for (const obstacle of system.stellars) {
    const distance = Math.hypot(x - obstacle.x, y - obstacle.y);
    if (distance < physicsConstants.jumpClear && distance < nearest) {
      nearest = distance;
      blocker = obstacle;
    }
  }
  if (!blocker) return routeBearing;
  const awayX = x - blocker.x,
    awayY = y - blocker.y;
  const routeX = Math.sin(routeBearing),
    routeY = -Math.cos(routeBearing);
  // Keep the route bearing if it already increases distance from the blocker.
  if (routeX * awayX + routeY * awayY > 0) return routeBearing;
  return Math.atan2(awayX, -awayY);
}
