import type { ShipHullAsset } from './rules.ts';

/** NPC-only anchored Personal Station defense hull. */
export const STATION_DEFENSE_HULL = 940;
/** Station-centered protection radius, in world units. */
export const STATION_DEFENSE_RADIUS = 1100;
/** Destroyed platforms rebuild after two simulation minutes. */
export const STATION_DEFENSE_REBUILD = 120;

/** Retain the former Holdout platform count at each turret upgrade level. */
export function stationPlatformCount(defense: number = 0): number {
  return 1 + Math.max(0, Math.min(5, Math.floor(Number.isFinite(defense) ? defense : 0)));
}

/** The platform uses existing turret weapons and cannot be bought or flown. */
export function stationDefenseHull(base: ShipHullAsset): ShipHullAsset {
  return {
    ...base,
    id: STATION_DEFENSE_HULL,
    name: 'Triad Sentinel',
    sub: 'Station Defense Platform',
    npcOnly: true,
    size: 64,
    cargo: 0,
    crew: 0,
    guns: 0,
    turrets: 3,
    weapons: [[131, 3, 0]],
    glow: false,
    img: `ships/${STATION_DEFENSE_HULL}_yard.png`,
    desc: 'Three armored turret pods surround a silver station core. This anchored platform protects a Personal Station and its nearby ships.',
  };
}
