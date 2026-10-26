// Offline replay of a player-exported diagnostic capture. Reads one local file; no network access.
import fileSystem from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DIAGNOSTIC_CAPTURE_LIMITS, parseDiagnosticCapture } from '../shared/diagnostic-capture.ts';
import { replayDiagnosticCapture } from '../shared/diagnostic-replay.ts';

/** Process exit status for each outcome. */
export const REPLAY_EXIT = Object.freeze({ matched: 0, mismatched: 1, rejected: 2 });

export function replayCaptureFile(filePath: string): {
  /** One of REPLAY_EXIT's matched, mismatched or rejected statuses. */
  status: number;
  /** Bounded replay summary or file rejection guidance. */
  lines: string[];
} {
  let size: number;
  try {
    const source = fileSystem.statSync(filePath);
    if (!source.isFile())
      return { status: REPLAY_EXIT.rejected, lines: [`Cannot read ${filePath}.`] };
    size = source.size;
  } catch {
    return { status: REPLAY_EXIT.rejected, lines: [`Cannot read ${filePath}.`] };
  }
  // Refuse large files before reading them into memory.
  if (size > DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes)
    return {
      status: REPLAY_EXIT.rejected,
      lines: [
        `Rejected (oversized): larger than ${DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes} bytes.`,
      ],
    };
  let text: string;
  try {
    text = fileSystem.readFileSync(filePath, 'utf8');
  } catch {
    return { status: REPLAY_EXIT.rejected, lines: [`Cannot read ${filePath}.`] };
  }
  const parsed = parseDiagnosticCapture(text);
  if (!parsed.ok)
    return {
      status: REPLAY_EXIT.rejected,
      lines: [`Rejected (${parsed.reason}): ${parsed.detail}.`],
    };
  const report = replayDiagnosticCapture(parsed.capture);
  const lines = [
    `Capture advertising game version ${report.recordedBuild}: ${report.matched} of ${report.entries} trade previews reproduced.`,
  ];
  for (const mismatch of report.mismatches)
    lines.push(
      `Entry ${mismatch.index}: recorded ${JSON.stringify(mismatch.recorded)}, replayed ${
        mismatch.replayed ? JSON.stringify(mismatch.replayed) : `error: ${mismatch.error}`
      }`,
    );
  return {
    status: report.mismatches.length ? REPLAY_EXIT.mismatched : REPLAY_EXIT.matched,
    lines,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node tools/replay-diagnostic-capture.ts <capture.json>');
    process.exit(REPLAY_EXIT.rejected);
  }
  const { status, lines } = replayCaptureFile(filePath);
  for (const line of lines) (status === REPLAY_EXIT.matched ? console.log : console.error)(line);
  process.exit(status);
}
