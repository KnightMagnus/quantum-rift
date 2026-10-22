import type { AutopilotShip, FlightStats, LandingPort } from './landing_autopilot.ts';
// Gateways are transit apertures, not landing volumes. Aim at the center and fly through.
import { DT as tickDuration, wrap } from '../shared/rules.ts';

/**
 * Direct center-seeking flight, with no arrival braking or retrograde phase.
 * @param {RenderEntity} ship Current predicted ship.
 * @param {ComputedShipStats} stats Normal flight stats.
 * @param {StellarBody} gate Gateway center.
 * @param {Record<string, number>} input Controls modified in place.
 * @returns {void}
 */
export function gatewayGuidance(
  ship: AutopilotShip,
  stats: FlightStats,
  gate: LandingPort,
  input: Record<string, number>,
) {
  const wrap2 = wrap(Math.atan2(gate.x - ship.x, -(gate.y - ship.y)) - ship.a);
  input.turn =
    Math.abs(wrap2) <= stats.turn * tickDuration
      ? wrap2 / (stats.turn * tickDuration)
      : Math.sign(wrap2);
  input.thrust = Math.abs(wrap2) < 0.5 ? 1 : 0;
  input.rev = input.ab = 0;
}
