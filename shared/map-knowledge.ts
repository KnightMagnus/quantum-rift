// What a captain knows of the galaxy map. Systems you have visited (or bought a chart for)
// are known in full; their direct neighbours appear by name only; everything else is hidden.
// The Gateway is not an ordinary neighbour: its far mouth and the long dashed lane appear
// only once you have been through it.
import { route } from './rules.ts';

/** The parts of a system the map and route planner need. */
export interface MapSystem {
  id: string;
  x: number;
  y: number;
  danger: number;
  links: string[];
  /** Gateway partner, joined by the long dashed lane. */
  gate?: string;
  faction: string;
}

/** Captain map records, as saved and sent in the player payload. */
export interface MapRecords {
  /** Systems the captain has flown to. */
  explored?: readonly string[];
  /** Systems revealed by a purchased faction star chart. */
  charted?: readonly string[];
}

/** Derived map visibility for one captain. */
export interface MapKnowledge {
  /** Visited or charted: shown in full, with lanes and economy details. */
  known: Set<string>;
  /** Known systems plus neighbours of visited systems: drawn and named on the map. */
  visible: Set<string>;
}

/** Work out what the captain can see. A missing record (no account yet) knows nothing. */
export function mapKnowledge(
  systems: Record<string, Pick<MapSystem, 'links' | 'gate'>>,
  records: MapRecords | null | undefined,
): MapKnowledge {
  const known = new Set([...(records?.explored || []), ...(records?.charted || [])]);
  const visible = new Set(known);
  for (const id of records?.explored || [])
    for (const link of systems[id]?.links || []) visible.add(link);
  return { known, visible };
}

/** A lane is drawn when one end has been visited, or both ends are on a chart. */
export function laneKnown(
  knowledge: MapKnowledge,
  records: MapRecords | null | undefined,
  first: string,
  second: string,
): boolean {
  const explored = records?.explored || [];
  return (
    explored.includes(first) ||
    explored.includes(second) ||
    (knowledge.known.has(first) && knowledge.known.has(second))
  );
}

/**
 * Plot only through known space. The destination itself may be an unvisited neighbour,
 * so the next system out is one jump away, but autopilot never crosses unknown systems.
 * @returns The jump list, or [] when no known path reaches the destination.
 */
export function knownRoute(
  systems: Record<string, MapSystem>,
  knowledge: MapKnowledge,
  from: string,
  destination: string,
): string[] {
  if (!knowledge.visible.has(destination) && destination !== from) return [];
  const allowed = (id: string) => id === destination || id === from || knowledge.known.has(id);
  const restricted: Record<string, MapSystem> = {};
  for (const [id, system] of Object.entries(systems)) {
    if (!allowed(id)) continue;
    restricted[id] = {
      ...system,
      links: system.links.filter(allowed),
      gate: system.gate && allowed(system.gate) ? system.gate : undefined,
    };
  }
  return route(restricted, from, destination);
}

/** Systems a faction's star chart reveals: every system that faction owns. */
export function chartSystems(systems: Record<string, MapSystem>, faction: string): string[] {
  return Object.values(systems)
    .filter((system) => system.faction === faction)
    .map((system) => system.id)
    .sort();
}

/** Credit price of a faction's star chart, scaled by how much space it covers. */
export function starChartCredits(systemCount: number): number {
  return 2000 + 600 * systemCount;
}
