import type { ShipHullAsset } from './rules.ts';

/** Five configurations are distributed across a bounded, neutral survey group. */
export const INDEX_FLEET_TYPES = [912, 916, 919, 921, 923] as const;
/** Hard encounter bounds include every parent, blade and drone. */
export const INDEX_FLEET_LIMITS = {
  live: 32,
  drones: 12,
  replacements: 36,
  radius: 1100,
  reboot: 6,
} as const;
/** Forms share maximum health; changing posture never grants a fresh hull. */
export const INDEX_FLEET_HULLS: ShipHullAsset[] = [
  [912, 'Mutable', 320, 2600, 2600, 145, 190, 2],
  [913, 'Mutable · siege', 320, 2600, 2600, 25, 190, 6],
  [916, 'Trident', 180, 1050, 1050, 230, 110, 3],
  [918, 'Trident blade', 70, 350, 350, 340, 35, 1],
  [919, 'Loom · folded', 120, 1000, 1600, 220, 100, 0],
  [920, 'Loom · deployed', 260, 1000, 1600, 20, 100, 0],
  [921, 'Talon · closed', 220, 1600, 2000, 190, 140, 2],
  [922, 'Talon · open', 220, 1600, 2000, 70, 140, 2],
  [923, 'Hive · sealed', 260, 1800, 2400, 140, 170, 1],
  [924, 'Hive · open', 260, 1800, 2400, 55, 170, 1],
].map(([id, name, size, shield, armor, speed, strength, guns]) => ({
  id: Number(id),
  name: String(name),
  size: Number(size),
  shield: Number(shield),
  armor: Number(armor),
  speed: Number(speed),
  strength: Number(strength),
  cost: 0,
  mass: Number(size) * 3,
  accel: 200,
  turn: 1,
  space: 0,
  cargo: 0,
  fuel: 0,
  shieldRe: 0,
  armorRe: 0,
  fuelRe: 0,
  weapons: Number(guns) ? [[128, Number(guns)]] : [],
  guns: 0,
  turrets: Number(guns),
  npcOnly: true,
  faction: 'index',
  kind: 'hull',
  img: `ships/${id}_yard.png`,
  desc: 'An Index survey machine. Its work is neutral until deliberately disturbed.',
}));
