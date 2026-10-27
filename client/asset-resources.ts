import { ByteBudgetCache } from './render-cache-budget.ts';

const MEBIBYTE = 1024 * 1024;
const shipImages = new ByteBudgetCache<HTMLImageElement>(256 * MEBIBYTE, 2000, 192);
const sceneryImages = new ByteBudgetCache<HTMLImageElement>(64 * MEBIBYTE, 2000, 128);
const failures = new Set<string>();

/** Report each failing resource once, retaining only a bounded set of diagnostic keys. */
export function assetFailure(path: string, reason: string): void {
  if (failures.has(path)) return;
  if (failures.size >= 128) failures.delete(failures.values().next().value!);
  failures.add(path);
  console.warn(`Asset unavailable: ${path} (${reason}); using fallback.`);
}

/** Cache decoded image ownership; removing an idle entry never clears a live image's src. */
export function assetImage(path: string): HTMLImageElement {
  const cache = path.startsWith('ships/') ? shipImages : sceneryImages;
  const now = performance.now();
  let image = cache.get(path, now);
  if (image) return image;
  image = new Image();
  const requested = image;
  requested.onload = () => {
    // An old request must not resurrect a resource that was evicted while loading.
    if (cache.get(path, performance.now()) !== requested) return;
    cache.set(
      path,
      requested,
      requested.naturalWidth * requested.naturalHeight * 4,
      performance.now(),
    );
  };
  requested.onerror = () => assetFailure(path, 'missing or corrupt image');
  cache.set(path, requested, 0, now);
  requested.src = `assets/${path}`;
  return requested;
}

/** Developer measurements of cache-owned decoded pixels, excluding GPU/browser overhead. */
export function imageResourceUsage() {
  const usage = (cache: ByteBudgetCache<HTMLImageElement>) => {
    cache.evict(performance.now());
    return { entries: cache.size, bytes: cache.bytes, budgetBytes: cache.budgetBytes };
  };
  return { ships: usage(shipImages), scenery: usage(sceneryImages) };
}

/** Replace measurement budgets; live images remain protected even above these limits. */
export function setImageResourceBudgets(shipBytes: number, sceneryBytes: number): void {
  shipImages.budgetBytes = shipBytes;
  sceneryImages.budgetBytes = sceneryBytes;
  imageResourceUsage();
}
