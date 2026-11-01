import authoredAllocation from '../shared/scenery-allocation.json' with { type: 'json' };
/** Authored visual choices; these do not change a body's gameplay properties. */
export interface BodyAllocation {
  /** Planet-manifest key or irregular moon image key. */
  art: string;
  /** Irregular moons use a rotating sprite instead of a sphere. */
  shape?: string;
  /** Landing image basename, when a dedicated image exists. */
  landing?: string;
}
/** Visual overrides for one system. */
export interface SceneryAllocation {
  /** Body choices keyed by stable body id. */
  bodies: Record<string, BodyAllocation>;
  /** Station architecture and landing-image choices. */
  stations: Record<string, { design: string; landing: string }>;
  /** Distant, non-interactive worlds. */
  background: { art: string; large: boolean }[];
  /** Nebulae, galaxies and optional far-sky sprite. */
  sky: { nebulae: string[]; galaxies: string[]; far?: string; sun: string };
  /** Decorative wrecks, faction props and minable-rock image pools. */
  clutter: {
    massive_wreck?: string;
    small_wrecks: string[];
    props: string[];
    rocks: string[];
    shards: string[];
  };
}
const allocations: Record<string, SceneryAllocation> = authoredAllocation;
const revision = 1;
/** Changes when authored scenery becomes available; renderer caches must refresh. */
export function sceneryRevision(): number {
  return revision;
}
/** Returns no override for unknown or dynamically created systems. */
export function allocationFor(systemId: string): SceneryAllocation | undefined {
  return allocations[systemId];
}
/** Finds body art without requiring callers to know the body's parent system. */
export function bodyAllocationFor(bodyId: string, systemId?: string): BodyAllocation | undefined {
  if (systemId) return allocations[systemId]?.bodies[bodyId];
  for (const allocation of Object.values(allocations)) {
    if (allocation.bodies[bodyId]) return allocation.bodies[bodyId];
  }
  return undefined;
}
/** Uses the same deterministic pool selection for foreground and distant rocks. */
export function asteroidArtFor(systemId: string, ore: string, id: number): string {
  const clutter = allocationFor(systemId)?.clutter;
  const pool = ore === 'shards' ? clutter?.shards : clutter?.rocks;
  return pool?.length
    ? pool[Math.abs(id) % pool.length]
    : ore === 'shards'
      ? 'crys' + (Math.abs(id) % 4)
      : 'rock' + (Math.abs(id) % 10);
}
