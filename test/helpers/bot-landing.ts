import {
  landingGuidance,
  type AutopilotState,
  type LandingPort,
} from '../../client/landing_autopilot.ts';
import { step, type ComputedShipStats, type FlightEntity } from '../../shared/rules.ts';

/** Prediction and approach phase retained between network snapshots. */
export interface BotLandingState extends AutopilotState {
  /** Last authoritative snapshot, compared by identity to detect a fresh packet. */
  snapshot?: number[];
  /** Ship prediction advanced once per bot input tick. */
  predicted?: FlightEntity;
}

/**
 * Drive production guidance with per-tick prediction between network snapshots.
 * @param state Retained prediction and approach phase.
 * @param snapshot Latest authoritative ship fields.
 * @param stats Current hull and outfit flight stats.
 * @param port Destination landing volume.
 * @returns Quantized controls for the existing input wire route.
 */
export function botLandingInput(
  state: BotLandingState,
  snapshot: number[],
  stats: ComputedShipStats,
  port: LandingPort,
) {
  if (state.snapshot !== snapshot || !state.predicted) {
    state.snapshot = snapshot;
    state.predicted = {
      x: snapshot[2],
      y: snapshot[3],
      vx: snapshot[4],
      vy: snapshot[5],
      a: snapshot[6],
      fuel: stats.fuel,
    };
  }
  const controls: Record<string, number> = {};
  landingGuidance(state, state.predicted, stats, port, controls);
  const packet = { th: controls.thrust, tu: Math.sign(controls.turn), rv: controls.rev, nav: true };
  step(state.predicted, stats, {
    thrust: packet.th,
    turn: packet.tu,
    rev: packet.rv,
    navigation: packet.nav,
  });
  return packet;
}
