import type { AutopilotShip, FlightStats, LandingPort } from './landing_autopilot.ts';
// Gateways are transit apertures, not landing volumes. Aim at the center and fly through.
import { DT, wrap } from '../shared/rules.ts';

/** @import { StellarBody } from '../server/game.js' */
/** @import { ComputedShipStats } from '../shared/rules.ts' */
/** @import { RenderEntity } from './render.js' */

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
  const da = wrap(Math.atan2(gate.x - ship.x, -(gate.y - ship.y)) - ship.a);
  input.turn = Math.abs(da) <= stats.turn * DT ? da / (stats.turn * DT) : Math.sign(da);
  input.thrust = Math.abs(da) < 0.5 ? 1 : 0;
  input.rev = input.ab = 0;
}
