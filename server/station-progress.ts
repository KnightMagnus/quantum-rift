import type { PlayerData } from './game.ts';
import { REFINERY, RESEARCH } from '../shared/galaxy.ts';
import { researchBonus } from '../shared/rules.ts';

/** Existing hangar and logging operations needed by station timer advancement. */
export interface StationProgressCapabilities {
  /** Initialize legacy hangar and station queue fields on the same captain record. */
  hangarInit: (playerData: PlayerData) => void;
  /** Let the current hangar owner start and settle the next queued research project. */
  startQueued: (playerData: PlayerData) => void;
  /** Append completion text through the current captain log owner. */
  log: (playerData: PlayerData, text: string) => void;
}

/** Personal Station timer advancement on existing authoritative player state. */
export interface StationProgress {
  /** Accrue refinery units and complete research before attempting the next queued project. */
  advance: (playerData: PlayerData) => void;
}

/** Uses wall time and owner callbacks; it does not schedule ticks or persist accounts. */
export function createStationProgress(capabilities: StationProgressCapabilities): StationProgress {
  return {
    advance(playerData) {
      const stationState = playerData.station;
      if (!stationState.claimed) return;
      capabilities.hangarInit(playerData);
      const researchBonus2 = researchBonus(stationState),
        currentTime = Date.now(),
        perUnit =
          (REFINERY.minutes[stationState.ops] * 60000) /
          (1 + (researchBonus2.refineSpeed || 0) / 100),
        capacity = REFINERY.silo + (researchBonus2.silo || 0);
      if (stationState.ops >= 1 && perUnit > 0) {
        while (stationState.refUnits < capacity && currentTime - stationState.refT >= perUnit) {
          stationState.refUnits++;
          stationState.refT += perUnit;
        }
        if (stationState.refUnits >= capacity) stationState.refT = currentTime;
      }
      if (stationState.active && currentTime >= stationState.active.ends) {
        stationState.done.push(stationState.active.id);
        capabilities.log(
          playerData,
          `Research complete: ${RESEARCH.find((researchNode) => researchNode.id === stationState.active!.id)!.name}.`,
        );
        stationState.active = null;
      }
      capabilities.startQueued(playerData);
    },
  };
}
