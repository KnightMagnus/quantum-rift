// Client view of the captain's map knowledge (see shared/map-knowledge.ts).
import type { ClientGameState } from './main.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { knownRoute, mapKnowledge, type MapKnowledge } from '../shared/map-knowledge.ts';

/** Map knowledge for the signed-in captain, or null before login (the whole map shows). */
export function captainMap(clientGameState: ClientGameState): MapKnowledge | null {
  return clientGameState.you ? mapKnowledge(systemsById, clientGameState.you) : null;
}

/** Route through known space only; the destination may be an unvisited neighbour. */
export function captainRoute(clientGameState: ClientGameState, destination: string): string[] {
  const knowledge = captainMap(clientGameState);
  if (!clientGameState.sys || !knowledge) return [];
  return knownRoute(systemsById, knowledge, clientGameState.sys, destination);
}
