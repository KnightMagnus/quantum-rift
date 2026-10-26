import type { DiagnosticCapture, TradePreviewCaptureResult } from './diagnostic-capture.ts';
import { tradePreview } from './economy-preview.ts';

/** One entry whose offline result differs from the recorded result. */
export interface DiagnosticReplayMismatch {
  /** Position of the entry in the capture. */
  index: number;
  /** Result recorded on the player's device. */
  recorded: TradePreviewCaptureResult;
  /** Result computed by this build, or null when the preview threw. */
  replayed: TradePreviewCaptureResult | null;
  /** Error text when the preview threw for the recorded input. */
  error?: string;
}
/** Summary of an offline replay. */
export interface DiagnosticReplayReport {
  /** Host-advertised game version retained in the capture. */
  recordedBuild: string;
  /** Entries replayed. */
  entries: number;
  /** Entries whose result matched exactly. */
  matched: number;
  /** Entries whose result differed or failed. */
  mismatches: DiagnosticReplayMismatch[];
}

/**
 * Recomputes every recorded trade preview with this build's shared formulas.
 * This reproduces one subsystem from its recorded inputs; it does not simulate
 * the server, other captains or later market changes.
 */
export function replayDiagnosticCapture(capture: DiagnosticCapture): DiagnosticReplayReport {
  const mismatches: DiagnosticReplayMismatch[] = [];
  capture.entries.forEach((entry, index) => {
    let replayed: TradePreviewCaptureResult;
    try {
      // Structured clones keep the parsed capture unchanged if the preview ever mutates input.
      replayed = structuredClone(tradePreview(structuredClone(entry.input)));
    } catch (error) {
      mismatches.push({
        index,
        recorded: entry.result,
        replayed: null,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (JSON.stringify(replayed) !== JSON.stringify(entry.result))
      mismatches.push({ index, recorded: entry.result, replayed });
  });
  return {
    recordedBuild: capture.build.game,
    entries: capture.entries.length,
    matched: capture.entries.length - mismatches.length,
    mismatches,
  };
}
