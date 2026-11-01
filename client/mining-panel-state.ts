export interface MiningPanelState {
  you?: {
    transportCapacity?: { cargo: number };
    shipStats?: { cargo?: number; towRig?: boolean } | null;
    ship?: { hull: number | string };
    cargoUsed?: number;
    jobCargo?: number;
    shipless?: boolean;
  } | null;
  towing?: { attached?: unknown; offers?: unknown[] } | null;
  industrial?: { sweep?: unknown; harvest?: unknown; smelter?: unknown } | null;
  A?: { ships: Record<string | number, { role?: string }> } | null;
  landed?: unknown;
  view?: unknown;
}
// UI visibility only: mining/towing authority remains on the server.
import { ShipCapacity } from '../shared/ship-capacity.ts';
export function miningPanelState(miningPanelState2: MiningPanelState) {
  const positionY = miningPanelState2.you!,
    shipStats2 = positionY?.shipStats;
  const capacity = Math.max(0, positionY?.transportCapacity?.cargo ?? shipStats2?.cargo ?? 0);
  const active = !!(
    miningPanelState2.towing?.attached ||
    miningPanelState2.towing?.offers?.length ||
    miningPanelState2.industrial?.sweep ||
    miningPanelState2.industrial?.harvest ||
    miningPanelState2.industrial?.smelter
  );
  // Survey is the existing miners/haulers role; a fitted tow rig is an explicit
  // industrial capability. Do not confuse a full hold with no cargo capacity.
  const eligible =
    capacity > 0 &&
    (miningPanelState2.A?.ships[positionY?.ship?.hull as string | number]?.role === 'survey' ||
      shipStats2?.towRig);
  return {
    visible:
      !!positionY &&
      !positionY.shipless &&
      !miningPanelState2.landed &&
      !!miningPanelState2.view &&
      (eligible || active),
    capacity,
    free: new ShipCapacity(capacity, positionY?.cargoUsed || 0, positionY?.jobCargo || 0).available,
    active,
  };
}
