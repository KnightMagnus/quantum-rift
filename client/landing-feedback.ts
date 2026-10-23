/** Landing-only notification state. A changed situation or explicit cancel rearms it. */
export class LandingFeedback {
  private context: string | null = null;
  private messages = new Set<string>();

  /** Select a semantic situation, not continuously changing position or elapsed time. */
  situation(context: string): void {
    if (context === this.context) return;
    this.context = context;
    this.messages.clear();
  }

  /** Whether this situation has not yet displayed the given landing notification. */
  notice(message: string): boolean {
    if (this.messages.has(message)) return false;
    this.messages.add(message);
    return true;
  }

  /** Explicit cancellation, completion and session changes allow a fresh attempt. */
  reset(): void {
    this.context = null;
    this.messages.clear();
  }
}

/** These are authoritative landing refusals, not a global toast deduplicator. */
export function landingRefusal(message: string): boolean {
  return /^(Too far from |Slow down to land|.* refuses you permission to land|Your ship is disabled|Deliver or detach the motherlode before landing\.|.* has nowhere to land\.)/.test(
    message,
  );
}
