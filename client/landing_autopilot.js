// Landing-only guidance. Manual flight and server landing limits are unchanged.
import { DT, wrap } from '../shared/rules.js';

/** @import { StellarBody } from '../server/game.js' */
/** @import { ComputedShipStats } from '../shared/rules.js' */
/** @import { RenderEntity } from './render.js' */

/**
 * Steer toward a landing volume, then commit to a retrograde braking pass.
 * Retain the phase instead of repeatedly alternating approach and brake headings.
 * @param {{mode?: string, t?: number, vx?: number, vy?: number, dest?: {x: number, y: number}}} state Autopilot state retained across ticks.
 * @param {RenderEntity} ship Predicted player ship.
 * @param {ComputedShipStats} stats Computed hull/outfit flight stats.
 * @param {StellarBody} port Target landable body.
 * @param {Record<string, number>} input Controls modified in place.
 * @returns {void}
 */
export function landingGuidance(state, ship, stats, port, input) {
  input.thrust = input.turn = input.rev = input.ab = 0;
  const dx = port.x - ship.x,
    dy = port.y - ship.y,
    distance = Math.hypot(dx, dy),
    speed = Math.hypot(ship.vx, ship.vy),
    pulse = stats.accel * DT,
    stopped = Math.max(2, pulse * 0.55);
  if (state.phase === 'brake' && speed <= stopped && distance > port.r + 25)
    state.phase = 'approach'; // An initial outward drift may stop outside the landing volume.
  if (distance <= port.r + 10) state.phase = 'brake';
  if (state.phase === 'brake') {
    if (speed <= stopped) return;
    // The existing retrograde control rotates by at most turn*DT and aligns exactly.
    // Stop before a discrete thrust pulse reverses the residual velocity.
    const da = wrap(Math.atan2(-ship.vx, ship.vy) - ship.a);
    input.rev = 1;
    input.thrust = Math.abs(da) <= stats.turn * DT + 0.02 ? 1 : 0;
    return;
  }
  state.phase = 'approach';
  const remaining = Math.max(0, distance - port.r * 0.4),
    speedLimit = Math.min(
      stats.maxSpeed * 0.9,
      Math.sqrt(2 * stats.accel * remaining) * 0.65,
      remaining / (Math.PI / stats.turn + 0.6),
    ),
    ex = (dx / (distance || 1)) * speedLimit - ship.vx,
    ey = (dy / (distance || 1)) * speedLimit - ship.vy;
  const deadband = Math.max(3, pulse * 0.6),
    lateral = (ship.vx * dy - ship.vy * dx) / (distance || 1),
    // Cruise orientation is a policy, not the direction of a near-zero velocity
    // error. At the speed ceiling that error can point sideways or backwards.
    // Keep real lateral correction and the existing turn-time/stopping envelope.
    cruise =
      speedLimit === stats.maxSpeed * 0.9 &&
      Math.abs(lateral) < deadband &&
      ship.vx * dx + ship.vy * dy >= 0,
    correcting = Math.hypot(ex, ey) >= deadband,
    heading = cruise ? Math.atan2(dx, -dy) : Math.atan2(ex, -ey),
    da = wrap(heading - ship.a);
  if (!cruise && !correcting) return;
  input.turn = Math.abs(da) < stats.turn * DT ? 0 : Math.sign(da);
  input.thrust =
    Math.abs(da) < 0.15 && (cruise ? speed < speedLimit - deadband : correcting) ? 1 : 0;
}

/**
 * Require a settled prediction AND a recent authoritative snapshot well inside
 * the server's radius/speed limits before sending the one landing request.
 * @param {{mode?: string, t?: number, vx?: number, vy?: number, dest?: {x: number, y: number}}} state Retained autopilot state.
 * @param {RenderEntity} ship Predicted ship.
 * @param {RenderEntity} authority Last server ship snapshot.
 * @param {ComputedShipStats} stats Computed flight stats.
 * @param {StellarBody} port Landing target.
 * @param {number} now Monotonic browser time in milliseconds.
 * @returns {boolean} Whether to send the landing request this tick.
 */
export function landingReady(state, ship, authority, stats, port, now) {
  const maxSpeed = Math.max(2, stats.accel * DT * 0.55),
    inside = (s) =>
      s &&
      Math.hypot(s.x - port.x, s.y - port.y) <= port.r + 25 &&
      Math.hypot(s.vx, s.vy) <= maxSpeed + 1;
  if (state.phase !== 'brake' || !inside(ship) || !inside(authority) || now - authority.t > 300) {
    state.settled = 0;
    return false;
  }
  state.settled = (state.settled || 0) + 1;
  if (state.settled < 6 || state.sent) return false;
  state.sent = now;
  return true;
}
