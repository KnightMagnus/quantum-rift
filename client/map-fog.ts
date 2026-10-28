// Client view of the captain's map knowledge (see shared/map-knowledge.ts).
import type { ClientGameState } from './main.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { storySystemVisible } from '../shared/story-world.ts';
import { knownRoute, mapKnowledge, type MapKnowledge } from '../shared/map-knowledge.ts';

/** Map knowledge for the signed-in captain, or null before login (the whole map shows). */
export function captainMap(clientGameState: ClientGameState): MapKnowledge | null {
  if (!clientGameState.you) return null;
  const knowledge = mapKnowledge(systemsById, clientGameState.you);
  // Story-authorized bearings remain selectable without revealing other unvisited space.
  // Availability comes only from this captain's saved flags, not another captain's ending.
  for (const system of Object.values(systemsById))
    if (
      !storySystemVisible(undefined, system.id) &&
      storySystemVisible(clientGameState.you.story?.flags, system.id)
    )
      knowledge.visible.add(system.id);
  return knowledge;
}

/** Route through known space only; the destination may be an unvisited neighbour. */
export function captainRoute(clientGameState: ClientGameState, destination: string): string[] {
  const knowledge = captainMap(clientGameState);
  if (!clientGameState.sys || !knowledge) return [];
  return knownRoute(systemsById, knowledge, clientGameState.sys, destination);
}
