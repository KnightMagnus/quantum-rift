import { RandomStream, fnv1a } from '../shared/deterministic-random.ts';

/** Stable identity of the living-economy stream; changing it reshuffles every economy seed. */
export const ECONOMY_STREAM_ID = 'living-economy';

/**
 * Derive the economy stream seed from a root seed and the stream identity, so other
 * streams derived from the same root never share a sequence with the economy.
 */
export function economyStreamSeed(rootSeed: number): number {
  return (fnv1a(ECONOMY_STREAM_ID) ^ Math.imul(rootSeed >>> 0, 0x9e3779b1)) >>> 0;
}

/**
 * Create the economy stream for one Living service.
 *
 * The simulation still uses the ambient `Math.random` stream. Without an explicit root
 * seed, creating the economy stream takes exactly one draw from that stream, whatever
 * the market roster. Every later system-state roll draws from the economy stream only,
 * so adding trade ports cannot advance or shift simulation randomness.
 *
 * The stream state is not saved. Active system states are saved in the world record;
 * a restarted Game takes a new root seed, as the previous ambient draws did.
 */
export function createEconomyRandom(
  rootSeed: number = Math.floor(Math.random() * 4294967296),
): RandomStream {
  return new RandomStream(economyStreamSeed(rootSeed), 'mulberry32');
}
