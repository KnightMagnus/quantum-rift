import type { ShipHullAsset } from './rules.ts';

/** Fixed initial site. Other Farside systems remain free of Index workgroups. */
export const INDEX_SITE = { sys: 'glasswake', x: 1300, y: 600, radius: 850 } as const;

/** NPC-only hulls used by the first survey workgroup. */
export const INDEX_HULLS: ShipHullAsset[] = [
  [909, 'Kernel', 150, 450, 350, 140, 40],
  [910, 'Quarry', 320, 1200, 2000, 75, 150],
  [911, 'Archive', 320, 1400, 1400, 90, 130],
  [914, 'Sampler', 34, 25, 30, 220, 4],
  [915, 'Picket', 38, 45, 40, 270, 8],
].map(([id, name, size, shield, armor, speed, strength]) => ({
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
  turn: 6,
  space: 0,
  cargo: 0,
  fuel: 0,
  shieldRe: 0,
  armorRe: 0,
  fuelRe: 0,
  weapons: id === 914 ? [] : [[128, id === 915 ? 1 : 2]],
  guns: 0,
  turrets: 2,
  npcOnly: true,
  faction: 'index',
  kind: 'hull',
  img: `ships/${id}_yard.png`,
  desc: 'An Index survey machine. It defends its work, not a border.',
}));
