/** A delayed game callback, executed only when the owning authority advances. */
interface ScheduledCallback {
  due: number;
  callback: () => void;
}
/** Keeps one queue identity across drains; callbacks never create another clock. */
export class AuthorityCallbacks {
  private pending: ScheduledCallback[] = [];
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }
  schedule(callback: () => void, delayMs: number): void {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error('Invalid callback delay');
    this.pending.push({ callback, due: this.now() + delayMs });
  }
  advance(now = this.now()): void {
    const ready = this.pending.filter((entry) => entry.due <= now);
    for (const entry of ready) {
      const index = this.pending.indexOf(entry);
      if (index >= 0) this.pending.splice(index, 1);
    }
    // Remove all due entries before invoking user code. Newly scheduled calls wait for another tick.
    for (const entry of ready) entry.callback();
  }
}
