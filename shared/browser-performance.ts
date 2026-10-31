/** Fixed workload labels; free text could accidentally disclose a captain or destination. */
export const PERFORMANCE_SCENARIOS = ['general', 'flight', 'combat', 'mining', 'docked'] as const;
/** Player-selected activity, not an inferred gameplay location. */
export type PerformanceScenario = (typeof PERFORMANCE_SCENARIOS)[number];
export const PERFORMANCE_LIMITS = { durationMs: 300000, frames: 18000 } as const;

/** Foreground game-update intervals, not GPU execution or presentation measurements. */
export class FrameCapture {
  /** Selected activity for this capture. */
  scenario: PerformanceScenario = 'general';
  /** Whether new frame intervals are accepted. */
  recording = false;
  /** Bounded interval samples in milliseconds. */
  readonly samples: number[] = [];
  /** Monotonic capture start timestamp. */
  started = 0;
  /** Monotonic capture end timestamp. */
  ended = 0;
  /** Number of visibility interruptions excluded from frame intervals. */
  interruptions = 0;
  /** Why the capture ended, or null while recording. */
  stopReason: 'manual' | 'duration-limit' | 'frame-limit' | null = null;
  private previous: number | null = null;

  start(scenario: PerformanceScenario, now: number): void {
    this.clear();
    this.scenario = PERFORMANCE_SCENARIOS.includes(scenario) ? scenario : 'general';
    this.started = now;
    this.recording = true;
  }
  clear(): void {
    this.recording = false;
    this.samples.length = 0;
    this.previous = null;
    this.started = this.ended = this.interruptions = 0;
    this.stopReason = null;
  }
  interrupt(): void {
    if (!this.recording) return;
    this.previous = null;
    this.interruptions++;
  }
  stop(now: number, reason: FrameCapture['stopReason'] = 'manual'): void {
    if (!this.recording) return;
    this.ended = now;
    this.recording = false;
    this.previous = null;
    this.stopReason = reason;
  }
  frame(now: number, visible: boolean): void {
    if (!this.recording) return;
    if (now - this.started >= PERFORMANCE_LIMITS.durationMs) {
      this.stop(now, 'duration-limit');
      return;
    }
    if (!visible) {
      this.previous = null;
      return;
    }
    if (this.previous !== null && now > this.previous) this.samples.push(now - this.previous);
    this.previous = now;
    if (this.samples.length >= PERFORMANCE_LIMITS.frames) this.stop(now, 'frame-limit');
  }
  summary(now: number) {
    const sorted = [...this.samples].sort((left, right) => left - right);
    const total = sorted.reduce((sum, duration) => sum + duration, 0);
    const percentile = (fraction: number) =>
      sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
    return {
      scenario: this.scenario,
      recording: this.recording,
      stopReason: this.stopReason,
      elapsedMs: (this.recording ? now : this.ended) - this.started,
      visibilityInterruptions: this.interruptions,
      frames: sorted.length,
      sampledMs: total,
      meanMs: sorted.length ? total / sorted.length : null,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: sorted.at(-1) ?? null,
      over33_3Ms: sorted.filter((duration) => duration > 1000 / 30).length,
      over50Ms: sorted.filter((duration) => duration > 50).length,
      over100Ms: sorted.filter((duration) => duration > 100).length,
    };
  }
}
