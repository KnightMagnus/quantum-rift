import { HealthMonitor } from '../../shared/health.ts';

/** Numeric packet counters cover the connection lifetime, not just retained packets. */
export class NativePacketCollector<Packet> {
  /** Recent decoded packets; undefined limit preserves existing fixture retention. */
  readonly packets: Packet[];
  /** Recent SDK errors, kept only in the private fixture. */
  readonly errors: unknown[];
  /** Lifetime received match packet count. */
  receivedPackets = 0;
  /** Lifetime received match data bytes, excluding transport framing. */
  receivedBytes = 0;
  /** Lifetime SDK error count. */
  errorCount = 0;
  /** Lifetime flying snapshot count. */
  snapshotCount = 0;
  /** Lifetime flying snapshot match data bytes. */
  snapshotBytes = 0;
  private readonly health = new HealthMonitor(512);
  private lastSnapshotAt?: number;
  private readonly statePackets = new Map<string, Packet>();
  private readonly limit?: number;
  private readonly now: () => number;
  constructor(packets: Packet[], errors: unknown[], limit?: number, now = () => performance.now()) {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 4096))
      throw new Error('Native fixture retainedLimit must be 1..4096');
    this.packets = packets;
    this.errors = errors;
    this.limit = limit;
    this.now = now;
  }
  receive(packet: Packet, bytes: number, type: unknown): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid native packet size');
    this.receivedPackets++;
    this.receivedBytes += bytes;
    this.retain(this.packets, packet);
    if (
      this.limit !== undefined &&
      typeof type === 'string' &&
      ['you', 'snap', 'scene'].includes(type)
    )
      this.statePackets.set(type, packet);
    if (type === 'snap') {
      this.snapshotCount++;
      this.snapshotBytes += bytes;
      const now = this.now();
      if (this.lastSnapshotAt !== undefined)
        this.health.observe('snapshotsMs', Math.max(0, now - this.lastSnapshotAt));
      this.lastSnapshotAt = now;
    }
  }
  error(error: unknown): void {
    this.errorCount++;
    this.retain(this.errors, error);
  }
  private retain<Value>(values: Value[], value: Value): void {
    values.push(value);
    if (this.limit !== undefined && values.length > this.limit) values.shift();
  }
  /** Three fixed state types survive eviction from the recent diagnostic window. */
  latestState(type: string): Packet | undefined {
    return this.statePackets.get(type);
  }
  /** Numeric-only receive summary; inter-arrival gaps are not round-trip latency. */
  report() {
    return {
      receivedPackets: this.receivedPackets,
      receivedBytes: this.receivedBytes,
      errorCount: this.errorCount,
      snapshotCount: this.snapshotCount,
      snapshotBytes: this.snapshotBytes,
      retainedPackets: this.packets.length,
      retainedStatePackets: this.statePackets.size,
      retainedPacketsTotal: this.packets.length + this.statePackets.size,
      retainedErrors: this.errors.length,
      snapshotGapMs: this.health.report().snapshotsMs ?? null,
    };
  }
}
