import type { ShipHullAsset } from './rules.ts';

// Hull sizes and roles follow the delivered roster. Civilian courier/freighter/yacht hulls are unarmed.
const roster: [number, string, number, 'scout' | 'fighter' | 'hauler' | 'escort' | 'capital'][] = [
  [950, 'Flint', 68, 'fighter'],
  [951, 'Rivet', 96, 'fighter'],
  [952, 'Writ', 96, 'scout'],
  [953, 'Gauge', 120, 'scout'],
  [954, 'Hatchet', 124, 'fighter'],
  [955, 'Hound', 140, 'escort'],
  [956, 'Ox', 184, 'hauler'],
  [957, 'Ingot', 192, 'hauler'],
  [958, 'Homeward', 140, 'scout'],
  [959, 'Pennant', 184, 'escort'],
  [960, 'Rampart', 200, 'capital'],
  [961, 'Rampart · siege', 200, 'capital'],
  [962, 'Picket', 116, 'escort'],
  [963, 'Sickle', 232, 'capital'],
  [964, 'Bulwark', 232, 'capital'],
  [965, 'Anvil', 256, 'capital'],
  [966, 'Spearhead', 256, 'capital'],
  [967, 'Dominion', 310, 'capital'],
  [968, 'Citadel', 380, 'capital'],
  [970, 'Warden', 232, 'capital'],
  [971, 'Wasp', 68, 'fighter'],
  [972, 'Splinter · joined', 184, 'escort'],
  [973, 'Splinter · split', 96, 'fighter'],
  [974, 'Courier', 120, 'scout'],
  [975, 'Quietus', 200, 'escort'],
  [976, 'Reclaimer', 256, 'hauler'],
  [977, 'Rocketeer', 140, 'escort'],
  [978, 'Ledger', 310, 'capital'],
];
export const PART_TWO_HULLS: ShipHullAsset[] = roster.map(([id, name, size, role]) => {
  const index = id >= 970;
  const civilian = [952, 956, 957, 958, 974].includes(id);
  const tier = role === 'capital' ? 4 : role === 'escort' || role === 'hauler' ? 2 : 1;
  const guns = civilian ? 0 : role === 'capital' ? 4 : role === 'escort' ? 2 : 1;
  return {
    id,
    name,
    size,
    sub: civilian ? 'Civilian vessel' : role === 'capital' ? 'Warship' : 'Patrol vessel',
    faction: index ? 'index' : 'confederation',
    kind: 'hull',
    npcOnly: index || id === 961,
    cost: 40000 * tier * tier,
    mass: size * 1.5,
    shield: 160 * tier,
    armor: 200 * tier,
    accel: role === 'capital' ? 180 : 500,
    speed: role === 'capital' ? 260 : civilian ? 380 : 470,
    turn: role === 'capital' ? 14 : 55,
    space: 30 * tier,
    cargo: civilian ? 80 * tier : 15 * tier,
    fuel: 500,
    shieldRe: 8 * tier,
    armorRe: 0,
    fuelRe: 0,
    guns,
    turrets: 0,
    weapons: guns ? [[128, guns]] : [],
    strength: 25 * tier,
    img: `ships/${id}_yard.webp`,
    tech: tier,
    desc: index
      ? 'A vessel of the independent Index war network.'
      : 'A Confederation of Sol vessel, descended from pre-Rift Earth shipbuilding.',
  };
});

export type RegionalTraffic = { kind: 'trade' | 'patrol'; faction: string; pool: number[] };
/** Civilian communities are never drafted into Index patrols. Legacy hulls represent shared pre-Rift designs. */
export function milkyWayTraffic(systemFaction: string, roll: number): RegionalTraffic {
  if (systemFaction === 'index') {
    if (roll < 0.32) return { kind: 'trade', faction: 'freefolk', pool: [703, 704, 706, 712, 714] };
    if (roll < 0.55) return { kind: 'trade', faction: 'index', pool: [974, 976] };
    return { kind: 'patrol', faction: 'index', pool: [970, 971, 972, 973, 975, 977] };
  }
  if (roll < 0.12) return { kind: 'trade', faction: 'unsworn', pool: [703, 704, 706, 712] };
  if (roll < 0.25) return { kind: 'trade', faction: 'freefolk', pool: [703, 704, 706, 712, 714] };
  if (roll < 0.65) return { kind: 'trade', faction: 'confederation', pool: [952, 956, 957, 958] };
  return { kind: 'patrol', faction: 'confederation', pool: [950, 951, 954, 955, 959, 962, 963] };
}
