export type RandomAlgorithm = 'signed-xorshift32' | 'xorshift32' | 'mulberry32' | 'lcg32';

/**
 * A deterministic stream owns its state and algorithm. Algorithms are explicit:
 * changing one would change generated worlds, jobs or finite mining rewards.
 */
export class RandomStream {
  #state: number;
  readonly #algorithm: RandomAlgorithm;

  constructor(seed: number, algorithm: RandomAlgorithm) {
    this.#algorithm = algorithm;
    this.#state = algorithm === 'mulberry32' ? seed : seed >>> 0;
    // Historical signed-shift generators replace zero; the other streams do not.
    if (algorithm === 'signed-xorshift32') this.#state ||= 1;
  }

  next(): number {
    let state = this.#state;
    switch (this.#algorithm) {
      case 'signed-xorshift32':
      case 'xorshift32':
        state ^= state << 13;
        state ^= this.#algorithm === 'signed-xorshift32' ? state >> 17 : state >>> 17;
        state ^= state << 5;
        this.#state = state >>> 0;
        return this.#state / 4294967296;
      case 'mulberry32': {
        this.#state = (state + 0x6d2b79f5) >>> 0;
        let mixed = this.#state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
      }
      case 'lcg32':
        this.#state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return this.#state / 4294967296;
    }
  }
}

/** Preserve existing callback consumers without exposing or sharing stream state. */
function callback(seed: number, algorithm: RandomAlgorithm): () => number {
  const stream = new RandomStream(seed, algorithm);
  return () => stream.next();
}

export function signedXorshift32(seed: number): () => number {
  return callback(seed, 'signed-xorshift32');
}

export function xorshift32(seed: number): () => number {
  return callback(seed, 'xorshift32');
}

export function mulberry32(seed: number): () => number {
  return callback(seed, 'mulberry32');
}

export function linearRandom32(seed: number): () => number {
  return callback(seed, 'lcg32');
}

/**
 * Historical FNV-1a seed contract: one first UTF-16 unit per string iterator
 * character, including astral characters. Do not change to UTF-8/code points.
 */
export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
