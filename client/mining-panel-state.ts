export interface MiningPanelState {
  you?: {
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
export function miningPanelState(G: MiningPanelState) {
  const y = G.you!,
    st = y?.shipStats;
  const capacity = Math.max(0, st?.cargo || 0);
  const active = !!(
    G.towing?.attached ||
    G.towing?.offers?.length ||
    G.industrial?.sweep ||
    G.industrial?.harvest ||
    G.industrial?.smelter
  );
  // Survey is the existing miners/haulers role; a fitted tow rig is an explicit
  // industrial capability. Do not confuse a full hold with no cargo capacity.
  const eligible =
    capacity > 0 && (G.A?.ships[y?.ship?.hull as string | number]?.role === 'survey' || st?.towRig);
  return {
    visible: !!y && !y.shipless && !G.landed && !!G.view && (eligible || active),
    capacity,
    free: new ShipCapacity(capacity, y?.cargoUsed || 0, y?.jobCargo || 0).available,
    active,
  };
}
