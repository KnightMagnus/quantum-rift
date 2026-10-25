import { INDEX_HULLS } from './index.ts';
import { INDEX_FLEET_HULLS } from './index-fleet.ts';
import { NHAL_HULLS } from './nhal.ts';

/** Trusted non-human ship artwork; conversation fields never supply an image path. */
export const HAIL_MACHINE_HULLS = [...INDEX_HULLS, ...INDEX_FLEET_HULLS, ...NHAL_HULLS];
/** Capture the sender hull for both live and archived non-human transmissions. */
export function hailMachineHull(entity: {
  faction: string;
  hull: number | string;
  indexWorksite?: boolean;
}): number | undefined {
  return entity.indexWorksite || entity.faction === 'index' || entity.faction === 'nhal'
    ? Number(entity.hull)
    : undefined;
}
