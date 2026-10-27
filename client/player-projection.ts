import type { ClientGameState, PlayerPayload } from './main.ts';

/** Existing display fields updated by a captain payload; no authoritative account copy. */
export type PlayerProjectionState = Pick<
  ClientGameState,
  'you' | 'sys' | 'views' | 'view' | 'ammo' | 'landed' | 'ctab'
>;

/** Existing UI owners invoked in payload order, after updating the same display state. */
export interface PlayerProjectionEffects {
  /** Apply this captain's unlocked radio catalog. */
  unlockedStations: (stations: PlayerPayload['radioStations']) => void;
  /** Refresh co-op display through its current provider. */
  coopYou: () => void;
  /** Refresh landed content only when currently docked. */
  renderLanded: () => void;
  /** Refresh the companion panel from the new player payload. */
  refreshCompanion: () => void;
  /** Update available storage without granting access. */
  refreshStores: () => void;
  /** Restore the existing tab only for initial payload or loaded view preferences. */
  tab: (name: ClientGameState['ctab'], persist: boolean) => void;
  /** Render the existing tutorial presentation last. */
  tutorial: () => void;
}

/** Project a validated player payload; transport, DOM events and persistence stay outside. */
export function projectPlayer(
  state: PlayerProjectionState,
  player: PlayerPayload,
  effects: PlayerProjectionEffects,
): void {
  const first = !state.you;
  state.you = player;
  effects.unlockedStations(state.you.radioStations);
  const restoredViews = state.views.load();
  state.sys = player.sys;
  effects.coopYou();
  for (const [ammo, count] of Object.entries(player.ship.ammo || {}))
    if (!state.view) state.ammo[ammo] = count;
  if (state.landed) effects.renderLanded();
  effects.refreshCompanion();
  effects.refreshStores();
  if (first || restoredViews) effects.tab(state.ctab || 'missions', false);
  effects.tutorial();
}
