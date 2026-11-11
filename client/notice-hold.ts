/** Scheduler used to check again whether held notices may show. */
type NoticeScheduler = (callback: () => void, delayMs: number) => unknown;

/** How a notice hold decides when to wait and how it shows a notice. */
interface NoticeHoldOptions {
  /** Milliseconds notices must still wait; 0 when they may show now. */
  holdMs: () => number;
  /** Shows one notice immediately. */
  show: (message: string) => void;
  /** Timer used to check the hold again. Defaults to setTimeout. */
  schedule?: NoticeScheduler;
}

/**
 * Keeps notices off the screen while a presentation, such as the Rift crossing, plays.
 * Held notices show in their original order once the hold ends. Notices sent while
 * others are still held join the queue, so order never changes.
 * @param options Hold length, display and timer.
 * @returns notice() to show or hold a message, and clear() to drop held messages.
 */
export function createNoticeHold(options: NoticeHoldOptions) {
  const schedule: NoticeScheduler =
    options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const held: string[] = [];
  let generation = 0,
    waiting = false;
  const check = (delayMs: number) => {
    waiting = true;
    const scheduledGeneration = generation;
    schedule(
      () => {
        if (scheduledGeneration !== generation) return;
        const remaining = options.holdMs();
        if (remaining > 0) return check(remaining);
        waiting = false;
        for (const message of held.splice(0)) options.show(message);
      },
      Math.min(delayMs, 400),
    );
  };
  return {
    notice(message: string) {
      const holdMs = options.holdMs();
      if (holdMs <= 0 && !held.length) return options.show(message);
      held.push(message);
      if (!waiting) check(Math.max(holdMs, 0));
    },
    clear() {
      generation++;
      waiting = false;
      held.length = 0;
    },
  };
}
