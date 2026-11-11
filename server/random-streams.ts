import { fnv1a } from '../shared/deterministic-random.ts';
import type { GameStorage } from './game-storage.ts';

/** Minimal random source; consumers cannot reset another subsystem's sequence. */
export interface GameplayRandom {
  /** Draw a float in [0, 1), advancing only this named stream. */
  next(this: void): number;
}

/** Initialize legacy worlds once; existing checkpoints retain all stream positions. */
export function initializeRandomStreams(storage: GameStorage, seed?: number): void {
  const saved = storage.world.randomStreams;
  if (saved !== undefined) {
    if (
      !saved ||
      typeof saved !== 'object' ||
      saved.version !== 1 ||
      !Number.isInteger(saved.rootSeed) ||
      saved.rootSeed < 0 ||
      saved.rootSeed > 0xffffffff ||
      !saved.states ||
      typeof saved.states !== 'object' ||
      Array.isArray(saved.states) ||
      Object.values(saved.states).some(
        (state) => !Number.isInteger(state) || state < 0 || state > 0xffffffff,
      )
    )
      throw new Error('Unsupported or invalid gameplay random state');
    return;
  }
  storage.world.randomStreams = {
    version: 1,
    rootSeed: (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0,
    states: {},
  };
  storage.touch();
}

/** A stable identity derives its own seed and advances only its checkpointed state. */
export function randomStream(storage: GameStorage, identity: string): GameplayRandom {
  initializeRandomStreams(storage);
  const saved = storage.world.randomStreams!;
  if (!Object.prototype.hasOwnProperty.call(saved.states, identity)) {
    saved.states[identity] = (fnv1a(identity) ^ Math.imul(saved.rootSeed, 0x9e3779b1)) >>> 0;
    storage.touch();
  }
  return {
    next() {
      // Simulation fixtures historically use LCG32; economy uses mulberry32.
      if (identity.startsWith('simulation:')) {
        const state = (saved.states[identity] =
          (Math.imul(saved.states[identity], 1664525) + 1013904223) >>> 0);
        storage.touch();
        return state / 4294967296;
      }
      const state = (saved.states[identity] = (saved.states[identity] + 0x6d2b79f5) >>> 0);
      let mixed = Math.imul(state ^ (state >>> 15), state | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      storage.touch();
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
  };
}
