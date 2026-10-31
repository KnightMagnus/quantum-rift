import type { ArenaMatch, RaidWave } from './world-contracts.ts';

/** Transient encounter state belongs to one Frontier service, never to a save. */
export interface FrontierState {
  arenaQ: Record<string, number[]>;
  matches: Record<string, ArenaMatch>;
  nextMatch: number;
  waves: Record<string, RaidWave>;
}

export function createFrontierState(): FrontierState {
  return {
    arenaQ: { '1v1': [], '2v2': [], '4v4': [] },
    matches: {},
    nextMatch: 1,
    waves: {},
  };
}
