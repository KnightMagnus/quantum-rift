import type { ShipHullAsset, WeaponAsset } from './rules.ts';

/** Persistent encounter limits apply to all broods in a system together. */
export const NHAL_LIMITS = {
  live: 20,
  spawned: 36,
  offspring: 24,
  perParent: 12,
  calls: 3,
  epoch: 600,
} as const;
/** Salvage uses existing cargo collection and markets, without a second inventory. */
export const NHAL_SALVAGE = [
  { id: 'nhal_bone', name: 'Nhal Bone', base: 680 },
  { id: 'nhal_ichor', name: 'Nhal Ichor', base: 920 },
  { id: 'nhal_eye', name: 'Nhal Eye', base: 1400 },
];
/** Slow, non-homing ichor remains visible and can be dodged. */
export const NHAL_WEAPONS: WeaponAsset[] = [
  {
    id: 9500,
    name: 'Nhal Spine',
    type: 'turret',
    dmgA: 12,
    dmgS: 10,
    reload: 35,
    speed: 1000,
    duration: 27,
    inacc: 2,
    color: '#a5d076',
  },
  {
    id: 9501,
    name: 'Ichor Spit',
    type: 'gun',
    dmgA: 16,
    dmgS: 12,
    reload: 65,
    speed: 650,
    duration: 45,
    inacc: 0,
    color: '#8cdb51',
  },
];
/** Living hulls are never sold, recruited or granted as captured ships. */
export const NHAL_HULLS: ShipHullAsset[] = [
  [900, 'Lamprey', 40, 110, 330, 15],
  [901, 'Watcher', 60, 210, 280, 24],
  [902, 'Bloat', 96, 950, 140, 65],
  [903, 'Ossuary', 100, 2200, 120, 110],
  [904, 'Flayer', 70, 440, 390, 45],
  [905, 'Spitter', 100, 850, 190, 75],
  [906, 'Kraken', 100, 2600, 180, 160],
  [907, 'Broodmother', 116, 3400, 130, 220],
  [908, 'The Dreamer', 150, 18000, 90, 800],
].map(([id, name, size, armor, speed, strength]) => ({
  id: Number(id),
  name: String(name),
  size: Number(size),
  armor: Number(armor),
  speed: Number(speed),
  strength: Number(strength),
  cost: 0,
  mass: Number(size) * 4,
  shield: 0,
  accel: 320,
  // Raw catalog turn is degrees per unit; shared physics applies its 3x scale.
  turn: (
    { 900: 60, 901: 45, 902: 18, 903: 14, 904: 70, 905: 24, 906: 14, 907: 10, 908: 9 } as Record<
      number,
      number
    >
  )[Number(id)],
  space: 0,
  cargo: 0,
  fuel: 0,
  shieldRe: 0,
  armorRe: 0,
  fuelRe: 0,
  weapons: [[Number(id) === 905 ? 9501 : 9500, Number(id) >= 906 ? 3 : 1]],
  guns: 1,
  turrets: 3,
  npcOnly: true,
  faction: 'nhal',
  kind: 'hull',
  img: `ships/${id}_yard.png`,
  desc: 'A living vessel of the Deep. It does not answer hails.',
}));
