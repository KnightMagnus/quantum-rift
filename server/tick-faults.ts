import type { HealthMonitor } from '../shared/health.ts';

/** Fixed operations only: never use captain names, backend messages or packet fields. */
export type TickOperation =
  | 'deferred'
  | 'checkpoint'
  | 'simulation'
  | 'space'
  | 'snapshot'
  | 'refinery'
  | 'idle'
  | 'mission-idle'
  | 'deadlines'
  | 'quest-sweep'
  | 'quest-salvage'
  | 'bank'
  | 'raid'
  | 'specialist'
  | 'holdout'
  | 'world';
/** Sanitized diagnostics do not retain the thrown value or its stack/message. */
export class TickFaults {
  /** Active synchronous operation in the owning tick. */
  operation: TickOperation = 'simulation';
  /** Last failing operation; does not identify a captain or system. */
  lastOperation: TickOperation = 'simulation';
  /** Built-in exception category, never the error name supplied by a backend. */
  lastKind: 'type' | 'range' | 'other' = 'other';
  /** Lifetime fault count used for log suppression. */
  count = 0;
  /** Optional bounded numeric samples. */
  private health?: HealthMonitor;
  constructor(health?: HealthMonitor) {
    this.health = health;
  }
  record(error: unknown): void {
    this.count++;
    this.lastOperation = this.operation;
    this.lastKind =
      error instanceof TypeError ? 'type' : error instanceof RangeError ? 'range' : 'other';
    const phase =
      this.operation === 'deferred'
        ? 'faultDeferred'
        : this.operation === 'checkpoint'
          ? 'faultCheckpoint'
          : this.operation === 'simulation' || this.operation === 'space'
            ? 'faultSimulation'
            : this.operation === 'snapshot'
              ? 'faultSnapshot'
              : 'faultMaintenance';
    this.health?.observe(phase, 1);
    this.health?.observe(
      this.lastKind === 'type'
        ? 'faultType'
        : this.lastKind === 'range'
          ? 'faultRange'
          : 'faultOther',
      1,
    );
  }
  /** First 19 faults, then one in 500; counters continue during log suppression. */
  shouldLog(): boolean {
    return this.count < 20 || this.count % 500 === 0;
  }
}
