import {
  DIAGNOSTIC_CAPTURE_LIMITS,
  DIAGNOSTIC_CAPTURE_VERSION,
  DiagnosticRecorder,
  serializeDiagnosticCapture,
} from '../shared/diagnostic-capture.ts';

/** Session-only recorder. It starts off on every launch and keeps entries in memory only. */
export const diagnostics = new DiagnosticRecorder(() => performance.now());

/** Updates the Options support controls to match the recorder. */
export function refreshDiagnosticControls(): void {
  const toggle = document.getElementById('opt-diagnostics') as HTMLInputElement | null;
  if (!toggle) return;
  const recording = diagnostics.recording,
    entries = diagnostics.size;
  toggle.checked = recording;
  (document.getElementById('diagexport') as HTMLButtonElement).disabled = entries === 0;
  (document.getElementById('diagclear') as HTMLButtonElement).disabled =
    entries === 0 && !recording;
  const kept = `${entries} of ${DIAGNOSTIC_CAPTURE_LIMITS.maxEntries} kept`;
  document.getElementById('diagstatus')!.textContent = recording
    ? `Recording trade estimates: ${kept}.`
    : entries
      ? `Stopped: ${kept}, ready to export.`
      : 'Off. Nothing is being recorded.';
}

function exportCapture(): void {
  if (!diagnostics.size) return;
  const file = new Blob([serializeDiagnosticCapture(diagnostics.exportCapture())], {
      type: 'application/json',
    }),
    link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = `quantum-rift-diagnostics-v${DIAGNOSTIC_CAPTURE_VERSION}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

const initialized = new WeakSet<Document>();
export function initDiagnosticControls(): void {
  if (initialized.has(document)) return;
  initialized.add(document);
  document.getElementById('opt-diagnostics')!.onchange = (event) => {
    if ((event.target as HTMLInputElement).checked) diagnostics.start();
    else diagnostics.stop();
    refreshDiagnosticControls();
  };
  document.getElementById('diagexport')!.onclick = exportCapture;
  document.getElementById('diagclear')!.onclick = () => {
    diagnostics.clear();
    refreshDiagnosticControls();
  };
  refreshDiagnosticControls();
}
