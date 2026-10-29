/** Browser timer and monotonic clock seams for bounded connection probes. */
export interface LivenessClock {
  /** Monotonic milliseconds, unaffected by wall-clock changes. */
  now(): number;
  /** Schedule a single check. */
  schedule(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  /** Cancel the outstanding check. */
  cancel(timer: ReturnType<typeof setTimeout>): void;
}

/** Detect a silent game peer without relying on snapshots or browser WebSocket pings. */
export class ConnectionLiveness {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private heardAt: number;
  private checkedAt: number;
  private probeAt: number | undefined;
  private stopped = false;
  private interrupted = false;
  private readonly statusChanged: (interrupted: boolean) => void;
  private readonly probe: () => void;
  private readonly expired: () => void;
  private readonly clock: LivenessClock;

  constructor(
    probe: () => void,
    expired: () => void,
    clock: LivenessClock = {
      now: () => performance.now(),
      schedule: (callback, milliseconds) => {
        const timer = setTimeout(callback, milliseconds);
        // Node fixtures must not stay alive solely for a browser watchdog.
        if (typeof timer === 'object') timer.unref();
        return timer;
      },
      cancel: (timer) => clearTimeout(timer),
    },
    statusChanged: (interrupted: boolean) => void = () => {},
  ) {
    this.statusChanged = statusChanged;
    this.probe = probe;
    this.expired = expired;
    this.clock = clock;
    this.heardAt = this.checkedAt = clock.now();
    this.schedule();
  }

  /** Only accepted inbound game packets prove that the peer is responding. */
  received(): void {
    this.heardAt = this.clock.now();
    this.probeAt = undefined;
    if (this.interrupted) {
      this.interrupted = false;
      this.statusChanged(false);
    }
  }

  /** Teardown is idempotent; a canceled callback can never expire a later socket. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.clock.cancel(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.timer = this.clock.schedule(() => this.check(), 1000);
  }

  private check(): void {
    if (this.stopped) return;
    const now = this.clock.now();
    // A suspended/throttled page gets a fresh reply window after timers resume.
    // No browser watchdog can promise a wall-clock deadline while JS is suspended.
    if (now - this.checkedAt > 15000) this.probeAt = undefined;
    this.checkedAt = now;
    if (!this.interrupted && now - this.heardAt >= 5000) {
      this.interrupted = true;
      this.statusChanged(true);
    }
    if (this.probeAt !== undefined && now - this.probeAt >= 15000) {
      this.stop();
      this.expired();
      return;
    }
    if (this.probeAt === undefined && now - this.heardAt >= 10000) {
      this.probeAt = now;
      this.probe();
    }
    if (!this.stopped) this.schedule();
  }
}
