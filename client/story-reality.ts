/** The story changes presentation for the viewing captain, never shared physics. */
export type RealityEnding = 'long_dream' | 'table' | 'unsettling' | 'captains_watch';
export interface RealityFlags {
  /** The Core has woken and the captain has entered Act III. */
  breach_started?: boolean;
  /** The captain's final choice; absent until a choice is committed. */
  main_ending?: RealityEnding;
  /** The people sharing this captain's permanently unsettled reality. */
  unsettled_with?: string;
  /** The old keepers' vigil is available to this captain. */
  founding_vigil?: boolean;
  /** First safe crossing has revealed the far-side placeholder. */
  crossed_quantum_rift?: boolean;
}
export interface RealityShip {
  /** Live display entity identity. */
  id: number;
  /** Human-player marker is bit 16. */
  fl: number;
  /** Parent entity for escorts, fighters and drones. */
  owner?: number;
  /** Public ending only; never another captain's private decision history. */
  storyEnding?: RealityEnding;
  /** Snapshot faction id or compact faction catalog index. */
  fac?: string | number;
}
export interface RealityState<Ship extends RealityShip = RealityShip> {
  /** Local flying entity identity. */
  myId: number;
  /** Compact snapshot faction catalog. */
  FAC?: readonly string[];
  /** Solo has no remote humans. */
  solo?: boolean;
  /** All captains in a friend-hosted game share one reality. */
  friendGame?: boolean;
  /** Current player state supplied by the server. */
  you?: { story?: { flags?: RealityFlags; ending?: RealityEnding } } | null;
  /** Live entities permit bounded ownership resolution. */
  ents: ReadonlyMap<number, Ship>;
  /** Existing group membership policy, including wingmates. */
  isAlly?: (ship: Ship) => boolean;
  /** Client-only accessibility options. */
  opts?: { [preference: string]: unknown; reducedEffects?: unknown; reduceMotion?: unknown };
}
/** Return the human captain at the root of an ownership chain; cycles fail solid. */
export function realityCaptain<Ship extends RealityShip>(
  state: RealityState<Ship>,
  ship: Ship,
): Ship | null {
  const seen = new Set<number>();
  let current: Ship | undefined = ship;
  while (current && !seen.has(current.id)) {
    if (current.fl & 16) return current;
    seen.add(current.id);
    current = current.owner ? state.ents.get(current.owner) : undefined;
  }
  return null;
}
/** Reduced effects removes shimmer, violent transitions and light ending ghosts. */
export function reducedStoryEffects(state: Pick<RealityState, 'opts'>): boolean {
  return (
    state.opts?.reducedEffects === true ||
    state.opts?.reduceMotion === true ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}
/** Group/friend precedence is applied before either strong or light ghost effects. */
export function storyShipOpacity<Ship extends RealityShip>(
  state: RealityState<Ship>,
  ship: Ship,
  now: number,
): number {
  const captain = realityCaptain(state, ship);
  if (
    ship.id === state.myId ||
    captain?.id === state.myId ||
    (state.friendGame && captain) ||
    state.isAlly?.(ship) ||
    (captain && state.isAlly?.(captain))
  )
    return 1;
  const story = state.you?.story;
  const ending = story?.flags?.main_ending || story?.ending;
  const reduced = reducedStoryEffects(state);
  if (ending === 'unsettling') {
    const factionValue = captain?.fac ?? ship.fac;
    const faction = typeof factionValue === 'number' ? state.FAC?.[factionValue] : factionValue;
    if (story?.flags?.unsettled_with && faction === story.flags.unsettled_with) return 1;
    return reduced ? 0.5 : 0.4 + 0.1 * Math.sin(now / 1700 + (captain?.id ?? ship.id) * 0.37);
  }
  if (!captain || state.solo) return 1;
  if (!ending && story?.flags?.breach_started)
    return reduced ? 0.5 : 0.4 + 0.1 * Math.sin(now / 1700 + captain.id * 0.37);
  return !reduced && ending && captain.storyEnding && ending !== captain.storyEnding ? 0.75 : 1;
}
/** Pure visibility policy shared by scenery and browser regressions. */
export function storyScenery(flags?: RealityFlags) {
  return {
    dormantArk: flags?.main_ending !== 'table' && flags?.main_ending !== 'captains_watch',
    foundingVigil: flags?.founding_vigil === true,
    table: flags?.main_ending === 'table',
    breachSetpieces: flags?.breach_started === true && !flags.main_ending,
    core:
      flags?.main_ending === 'table'
        ? 'gone'
        : flags?.main_ending === 'unsettling'
          ? 'dark'
          : flags?.main_ending === 'captains_watch'
            ? 'watch'
            : flags?.main_ending === 'long_dream'
              ? 'asleep'
              : flags?.breach_started
                ? 'awake'
                : 'witness',
  } as const;
}
