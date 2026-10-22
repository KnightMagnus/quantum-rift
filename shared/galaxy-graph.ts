export interface LinkedSystem {
  readonly links: readonly string[];
}

export interface JumpTraversal {
  /** Stops after visiting this many ordinary links, inclusive. */
  readonly maxDepth?: number;
  /** Restricts entered neighbors, not the supplied origin. */
  readonly allowed?: ReadonlySet<string>;
  /** Applies caller-owned admission policy without filtering the origin. */
  readonly canEnter?: (systemId: string) => boolean;
  readonly neighborOrder?: 'authored' | 'sorted';
}

/**
 * Ordinary-link jump topology, independent of port, faction and mission policy.
 * Link order is significant: equal-distance candidates keep authored order.
 * Weighted navigation and special gates remain the route planner's concern.
 */
export class GalaxyGraph {
  readonly #systems: Readonly<Record<string, LinkedSystem>>;

  constructor(systems: Readonly<Record<string, LinkedSystem>>) {
    this.#systems = systems;
  }

  /**
   * Visits each reachable system once in breadth-first order. The topology is
   * read when expanded; a caller may stop without scanning later systems.
   */
  *walk(origin: string, options: JumpTraversal = {}): Generator<[string, number]> {
    const found = new Map<string, number>([[origin, 0]]);
    const maxDepth = options.maxDepth ?? Infinity;
    for (const [systemId, depth] of found) {
      yield [systemId, depth];
      if (depth >= maxDepth) continue;
      const links = this.#systems[systemId].links;
      const neighbors = options.neighborOrder === 'sorted' ? [...links].sort() : links;
      for (const neighbor of neighbors) {
        if (options.allowed && !options.allowed.has(neighbor)) continue;
        if (options.canEnter && !options.canEnter(neighbor)) continue;
        if (!found.has(neighbor)) found.set(neighbor, depth + 1);
      }
    }
  }

  /** Produces a fresh distance record; callers own any cache and its lifetime. */
  distances(origin: string, options: JumpTraversal = {}): Record<string, number> {
    return Object.fromEntries(this.walk(origin, options));
  }
}
