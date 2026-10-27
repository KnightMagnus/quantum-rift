// Byte-budgeted LRU eviction used by the planet render caches.
import assert from 'node:assert/strict';
import { ByteBudgetCache, retainedBytes } from '../client/render-cache-budget.ts';

const LIVE_MS = 2000;

// Count limits also bound zero-byte failures/pending entries; clearing never mutates consumers.
{
  const cache = new ByteBudgetCache<{ alive: boolean }>(1000, LIVE_MS, 2);
  const consumer = { alive: true };
  cache.set('old', consumer, 0, 0);
  cache.set('second', { alive: true }, 0, 1);
  assert.deepEqual(cache.set('live', { alive: true }, 0, 3000), ['old']);
  assert.equal(consumer.alive, true);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
  assert.equal(consumer.alive, true);
}

// Idle entries are evicted least recently used first until the cache fits.
{
  const cache = new ByteBudgetCache<string>(300, LIVE_MS);
  cache.set('first', 'a', 100, 0);
  cache.set('second', 'b', 100, 10);
  cache.set('third', 'c', 100, 20);
  assert.equal(cache.bytes, 300);
  // Touching the oldest entry makes 'second' the eviction candidate.
  assert.equal(cache.get('first', 5000), 'a');
  assert.deepEqual(cache.set('fourth', 'd', 100, 5000), ['second']);
  assert.deepEqual(
    [...cache].map(([key]) => key),
    ['third', 'first', 'fourth'],
  );
  assert.equal(cache.bytes, 300);
  assert.equal(cache.get('second', 5000), undefined);
}

// Live entries are never evicted, even when they alone exceed the budget.
{
  const cache = new ByteBudgetCache<string>(150, LIVE_MS);
  cache.set('idle', 'a', 100, 0);
  assert.deepEqual(cache.set('visible', 'b', 100, 3000), ['idle']);
  assert.deepEqual(cache.set('also-visible', 'c', 100, 3500), []);
  assert.equal(cache.bytes, 200, 'Two live entries stay cached over budget');
  assert.equal(cache.get('visible', 3600), 'b');
  assert.equal(cache.get('also-visible', 3600), 'c');
  // Once they go idle the next eviction pass brings the cache back under budget.
  assert.deepEqual(cache.evict(3600 + LIVE_MS), ['visible']);
  assert.equal(cache.bytes, 100);
}

// Replacing and deleting keep the byte total exact.
{
  const cache = new ByteBudgetCache<string>(1000, LIVE_MS);
  cache.set('world', 'old', 400, 0);
  cache.set('world', 'new', 250, 1);
  assert.equal(cache.size, 1);
  assert.equal(cache.bytes, 250);
  assert.equal(cache.delete('world'), true);
  assert.equal(cache.delete('world'), false);
  assert.equal(cache.bytes, 0);
}

// Lowering the budget evicts idle entries on the next pass.
{
  const cache = new ByteBudgetCache<string>(Infinity, LIVE_MS);
  for (let index = 0; index < 5; index++) cache.set(`world-${index}`, 'x', 100, index);
  cache.budgetBytes = 250;
  assert.deepEqual(cache.evict(10000), ['world-0', 'world-1', 'world-2']);
  assert.equal(cache.bytes, 200);
}

// Retained size counts typed-array buffers once and canvases at four bytes per pixel,
// without following nested objects such as shared textures.
{
  const shared = new Float32Array(16);
  const canvas = { width: 10, height: 5, getContext: () => null };
  const entry = {
    first: shared,
    view: new Uint8Array(shared.buffer, 0, 8),
    own: new Int16Array(8),
    canvas,
    shared: { texture: new Uint8Array(1024) },
    label: 'not counted',
  };
  assert.equal(retainedBytes(entry), 64 + 16 + 200);
  assert.equal(retainedBytes(entry, entry.shared), 64 + 16 + 200 + 1024);
}

console.log('Render cache budget: LRU byte eviction, live protection and size accounting passed.');
