/** Fixed names prevent user input from creating unbounded metric cardinality. */
export type HealthMetric =
  | 'tickMs'
  | 'featuresMs'
  | 'spacesMs'
  | 'snapshotsMs'
  | 'snapshotBuildMs'
  | 'snapshotSerializeMs'
  | 'snapshotBytes'
  | 'systems'
  | 'entities'
  | 'shots'
  | 'returningLogins'
  | 'tickFailures'
  | 'spaceFailures'
  | 'frozenTicks'
  | 'connections'
  | 'disconnects'
  | 'checkpointMs'
  | 'checkpointSerializeMs'
  | 'checkpointBytes'
  | 'checkpointFreezes'
  | 'browserUpdateMs'
  | 'browserDrawMs';
/** One bounded window, plus lifetime aggregates; values never contain game payloads. */
export interface HealthSummary {
  /** Number of accepted observations since construction. */
  count: number;
  /** Sum over all accepted observations. */
  total: number;
  /** Largest observation since construction. */
  max: number;
  /** Most recent observation. */
  last: number;
  /** Median of the retained window, not the entire process lifetime. */
  p50: number;
  /** 95th percentile of the retained window. */
  p95: number;
  /** Number of retained observations, at most capacity. */
  retained: number;
}
/** Opt-in numeric instrumentation. No identifiers, errors, packets or saves are retained. */
export class HealthMonitor {
  private records = new Map<
    HealthMetric,
    { count: number; total: number; max: number; last: number; values: number[] }
  >();
  /** Maximum retained observations per metric. */
  readonly capacity: number;
  /** Host-supplied millisecond clock; callers read it only while enabled. */
  readonly now: () => number;
  constructor(capacity = 512, now: () => number = () => Date.now()) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096)
      throw new Error('Health capacity must be 1..4096');
    this.capacity = capacity;
    this.now = now;
  }
  observe(metric: HealthMetric, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    let record = this.records.get(metric);
    if (!record) {
      record = { count: 0, total: 0, max: 0, last: 0, values: [] };
      this.records.set(metric, record);
    }
    record.values[record.count % this.capacity] = value;
    record.count++;
    record.total += value;
    record.max = Math.max(record.max, value);
    record.last = value;
  }
  report(): Partial<Record<HealthMetric, HealthSummary>> {
    const report: Partial<Record<HealthMetric, HealthSummary>> = {};
    for (const [name, record] of this.records) {
      const ordered = [...record.values].sort((first, second) => first - second);
      report[name] = {
        count: record.count,
        total: record.total,
        max: record.max,
        last: record.last,
        p50: ordered[Math.ceil(ordered.length * 0.5) - 1],
        p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
        retained: ordered.length,
      };
    }
    return report;
  }
}
/** UTF-8 wire bytes without depending on Node or browser-only APIs (Nakama-compatible). */
export function utf8Bytes(text: string): number {
  // Most snapshot characters are ASCII. Let the host regexp engine skip those
  // runs instead of interpreting a JavaScript loop for every serialized byte.
  const nonAscii = /[\u0080-\uffff]/g;
  let bytes = text.length;
  let match: RegExpExecArray | null;
  while ((match = nonAscii.exec(text))) {
    const code = match[0].charCodeAt(0);
    if (code < 2048) bytes++;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      text.charCodeAt(nonAscii.lastIndex) >= 0xdc00 &&
      text.charCodeAt(nonAscii.lastIndex) <= 0xdfff
    ) {
      bytes += 2;
      nonAscii.lastIndex++;
    } else bytes += 2;
  }
  return bytes;
}
