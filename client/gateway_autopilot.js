// Gateways are transit apertures, not landing volumes. Aim at the center and fly through.
import { DT, wrap } from '../shared/rules.js';

/**
 * Direct center-seeking flight, with no arrival braking or retrograde phase.
 * @param {any} ship Current predicted ship.
 * @param {any} stats Normal flight stats.
 * @param {any} gate Gateway center.
 * @param {any} input Controls modified in place.
 * @returns {void}
 */
export function gatewayGuidance(ship, stats, gate, input) {
  const da = wrap(Math.atan2(gate.x - ship.x, -(gate.y - ship.y)) - ship.a);
  input.turn = Math.abs(da) <= stats.turn * DT ? da / (stats.turn * DT) : Math.sign(da);
  input.thrust = Math.abs(da) < 0.5 ? 1 : 0;
  input.rev = input.ab = 0;
}
