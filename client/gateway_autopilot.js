// Gateways are transit apertures, not landing volumes. Aim at the center and fly through.
import { DT, wrap } from '../shared/rules.js';

/**
 * Direct center-seeking flight, with no arrival braking or retrograde phase.
 * @param {import("./render.js").RenderEntity} ship Current predicted ship.
 * @param {import('../shared/rules.js').ComputedShipStats} stats Normal flight stats.
 * @param {import('../server/game.js').StellarBody} gate Gateway center.
 * @param {Record<string, number>} input Controls modified in place.
 * @returns {void}
 */
export function gatewayGuidance(ship, stats, gate, input) {
  const da = wrap(Math.atan2(gate.x - ship.x, -(gate.y - ship.y)) - ship.a);
  input.turn = Math.abs(da) <= stats.turn * DT ? da / (stats.turn * DT) : Math.sign(da);
  input.thrust = Math.abs(da) < 0.5 ? 1 : 0;
  input.rev = input.ab = 0;
}
