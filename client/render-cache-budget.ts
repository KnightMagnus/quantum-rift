/** One cached value with its estimated retained size and most recent use. */
interface BudgetedEntry<Value> {
  /** The cached resource. */
  value: Value;

  /** Estimated bytes the resource keeps alive, from {@link retainedBytes}. */
  bytes: number;

  /** Clock reading, in milliseconds, of the latest `get` or `set`. */
  usedAt: number;
}

/**
 * Least-recently-used cache bounded by estimated retained bytes rather than entry count.
 * Entries used within `liveMs` are never evicted, so resources drawn in the current or
 * previous frame stay valid even when they alone exceed the budget. Evicted values are
 * simply dropped: callers rebuild them on the next request.
 */
export class ByteBudgetCache<Value> {
  /** Retained bytes above which idle entries are evicted. */
  budgetBytes: number;

  /** Entries used more recently than this many milliseconds are treated as live. */
  readonly liveMs: number;

  private entries = new Map<string, BudgetedEntry<Value>>();
  private totalBytes = 0;

  constructor(budgetBytes: number, liveMs: number) {
    this.budgetBytes = budgetBytes;
    this.liveMs = liveMs;
  }

  /** Number of cached entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Estimated bytes retained by all cached entries. */
  get bytes(): number {
    return this.totalBytes;
  }

  /**
   * Returns a cached value and marks it as most recently used.
   * @param key Cache key.
   * @param now Current clock reading in milliseconds.
   */
  get(key: string, now: number): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.usedAt = now;
    // Re-insert so iteration order stays least-recently-used first.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * Stores a value, then evicts idle entries until the cache fits its budget.
   * @param key Cache key.
   * @param value Resource to cache.
   * @param bytes Estimated retained bytes of `value`.
   * @param now Current clock reading in milliseconds.
   * @returns Keys evicted to make room.
   */
  set(key: string, value: Value, bytes: number, now: number): string[] {
    this.delete(key);
    this.entries.set(key, { value, bytes, usedAt: now });
    this.totalBytes += bytes;
    return this.evict(now);
  }

  /**
   * Removes one entry.
   * @param key Cache key.
   * @returns Whether an entry was removed.
   */
  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
    return true;
  }

  /** Iterates cached keys and values, least recently used first, without touching them. */
  *[Symbol.iterator](): IterableIterator<[string, Value]> {
    for (const [key, entry] of this.entries) yield [key, entry.value];
  }

  /**
   * Evicts least-recently-used idle entries while the cache is over budget.
   * @param now Current clock reading in milliseconds.
   * @returns Evicted keys, oldest first.
   */
  evict(now: number): string[] {
    const evicted: string[] = [];
    for (const [key, entry] of this.entries) {
      if (this.totalBytes <= this.budgetBytes) break;
      // Iteration is least-recently-used first, so every later entry is live too.
      if (now - entry.usedAt < this.liveMs) break;
      this.delete(key);
      evicted.push(key);
    }
    return evicted;
  }
}

/**
 * Estimates the bytes a cached render resource keeps alive by inspecting each part's own
 * fields: typed arrays count their buffers once, canvases and image data count four bytes
 * per pixel. Nested objects, images and contexts are not followed, so shared resources are
 * excluded unless they are passed as parts.
 * @param parts Objects whose direct fields hold the resource's buffers.
 * @returns Estimated retained bytes.
 */
export function retainedBytes(...parts: object[]): number {
  const buffers = new Set<ArrayBufferLike>();
  let bytes = 0;
  for (const part of parts)
    for (const field of Object.values(part)) {
      if (ArrayBuffer.isView(field)) {
        if (!buffers.has(field.buffer)) {
          buffers.add(field.buffer);
          bytes += field.buffer.byteLength;
        }
      } else if (isCanvas(field)) bytes += field.width * field.height * 4;
      else if (isImageData(field) && !buffers.has(field.data.buffer)) {
        buffers.add(field.data.buffer);
        bytes += field.data.buffer.byteLength;
      }
    }
  return bytes;
}

function isCanvas(value: unknown): value is { width: number; height: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getContext?: unknown }).getContext === 'function' &&
    typeof (value as { width?: unknown }).width === 'number'
  );
}

function isImageData(value: unknown): value is { data: Uint8ClampedArray } {
  return typeof ImageData !== 'undefined' && value instanceof ImageData;
}
