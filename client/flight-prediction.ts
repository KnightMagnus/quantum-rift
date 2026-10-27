import { step } from '../shared/rules.ts';
import type { FlightEntity, FlightInput, ComputedShipStats } from '../shared/rules.ts';

/** Mutable display ship; never an authoritative account or server entity. */
export interface PredictionView extends FlightEntity {
  /** Authoritative own-ship identifier. */
  id: number;
  /** Smoothed drawing coordinates. */
  rx: number;
  ry: number;
  /** Last authoritative defenses and flags. */
  shield: number;
  armor: number;
  fl: number;
  /** Last presentation timestamp, when supplied by the caller. */
  t?: number;
  /** Reconciliation offsets decayed by the existing presentation loop. */
  ox: number;
  oy: number;
}

/** Only fields needed to reconcile the player's own display ship. */
export interface PredictionSnapshot {
  /** Own-ship identity and highest acknowledged input sequence. */
  id: number;
  acknowledgement: number;
  /** Authoritative position, velocity and heading. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  /** Authoritative defenses, fuel and current display flags. */
  shield: number;
  armor: number;
  fuel: number;
  fl: number;
}

/** Owns input sequence/history, replay and display correction, with no clock or transport. */
export class FlightPrediction {
  private sequence = 0;
  private history: Array<{ seq: number; inp: FlightInput }> = [];

  /** Neutral release packets advance the sequence without entering prediction history. */
  nextSequence(): number {
    return ++this.sequence;
  }

  /** Landing and travel clear replay history but preserve the transport's sequence. */
  clearPending(): void {
    this.history = [];
  }

  /** A new native presence or logout starts a new sequence epoch. */
  reset(): void {
    this.sequence = 0;
    this.clearPending();
  }

  /** Called after sending, preserving the original 90-input history and physics order. */
  record(
    sequence: number,
    input: FlightInput,
    view: PredictionView,
    stats: ComputedShipStats | null | undefined,
    enabled: boolean,
  ): void {
    this.history.push({ seq: sequence, inp: input });
    if (this.history.length > 90) this.history.shift();
    if (enabled) step(view, stats!, input);
    view.fl = (input.thrust ? 1 : 0) | (input.ab ? 2 : 0);
  }

  /** The caller resolves live stats and jump/combat/formation policy for each snapshot. */
  reconcile(
    view: PredictionView | null,
    snapshot: PredictionSnapshot,
    stats: ComputedShipStats | null | undefined,
    enabled: boolean,
  ): PredictionView {
    const result =
      view || ({ id: snapshot.id, rx: snapshot.x, ry: snapshot.y, ox: 0, oy: 0 } as PredictionView);
    const previousX = view ? view.x : snapshot.x;
    const previousY = view ? view.y : snapshot.y;
    const { acknowledgement, ...state } = snapshot;
    Object.assign(result, state);
    this.history = this.history.filter((entry) => entry.seq > acknowledgement);
    if (stats && enabled) for (const entry of this.history) step(result, stats, entry.inp);
    if (view) {
      result.ox += previousX - result.x;
      result.oy += previousY - result.y;
      if (Math.hypot(result.ox, result.oy) > 300) result.ox = result.oy = 0;
    }
    return result;
  }
}
