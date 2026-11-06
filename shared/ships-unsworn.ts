// Quantum Rift Part II: Unsworn (1050-1055) hulls (art: tools/freefolk/hulls_freefolk.py, shared with the Freefolk hulls).
// Covert, low tech, very fast. Commonhold (1055) is their floating command centre: NPC only, never sold.
import type { Ship23Hull } from './ships23.ts';
import type { SpriteSheetConfig } from './sprites26.ts';

type HullInput = Omit<
  Ship23Hull,
  | 'cat'
  | 'faction'
  | 'kind'
  | 'armorRe'
  | 'fuelRe'
  | 'buy'
  | 'ai'
  | 'fastJump'
  | 'glow'
  | 'pilot'
  | 'img'
> & {
  faction: 'unsworn';

  /** Hides the hull from shipyards, the codex and the save generator; set only on Commonhold. */
  npcOnly?: boolean;
};

const hull = (input: HullInput) => ({
  cat: 'Unsworn',
  kind: 'hull',
  armorRe: 0,
  fuelRe: 0,
  buy: 50,
  ai: 2,
  fastJump: true,
  glow: true,
  pilot: '',
  ...input,
  img: `ships/${input.id}_yard.webp`,
});

export const UNSWORN_HULLS = [
  hull({
    id: 1050,
    name: 'Needle',
    sub: 'Courier',
    faction: 'unsworn',
    cargo: 4,
    fuel: 780,
    space: 16,
    guns: 1,
    turrets: 0,
    crew: 2,
    size: 40,
    weapons: [],
    strength: 18,
    tech: 1,
    shield: 34,
    shieldRe: 8,
    armor: 41,
    speed: 680,
    accel: 892,
    turn: 65,
    mass: 9,
    cost: 90000,
    desc: 'A capsule on one huge bell and two drop tanks. It carries papers and one passenger, and nothing in the Confederation catches it.',
  }),
  hull({
    id: 1051,
    name: 'Hush',
    sub: 'Dark Runner',
    faction: 'unsworn',
    cargo: 10,
    fuel: 390,
    space: 18,
    guns: 4,
    turrets: 0,
    crew: 1,
    size: 52,
    weapons: [],
    strength: 72,
    tech: 2,
    shield: 46,
    shieldRe: 10,
    armor: 62,
    speed: 706,
    accel: 1148,
    turn: 86,
    mass: 15,
    cost: 248000,
    desc: 'A flat soot-black hull with shrouded bells and heat louvres. It crosses picket lines cold and lights its drive only when it has to.',
  }),
  hull({
    id: 1052,
    name: 'Shrike',
    sub: 'Escort',
    faction: 'unsworn',
    cargo: 8,
    fuel: 390,
    space: 14,
    guns: 2,
    turrets: 0,
    crew: 1,
    size: 48,
    weapons: [[128, 2, 0]],
    strength: 11,
    tech: 1,
    shield: 23,
    shieldRe: 6,
    armor: 34,
    speed: 592,
    accel: 1020,
    turn: 82,
    mass: 8,
    cost: 24000,
    desc: 'A needle hull with one gun and two outrigger drives. It does not fight; it makes pursuers think twice.',
  }),
  hull({
    id: 1053,
    name: 'Sparrow',
    sub: 'Passage Boat',
    faction: 'unsworn',
    cargo: 10,
    fuel: 780,
    space: 16,
    guns: 1,
    turrets: 0,
    crew: 14,
    size: 70,
    weapons: [],
    strength: 18,
    tech: 1,
    shield: 34,
    shieldRe: 8,
    armor: 41,
    speed: 680,
    accel: 892,
    turn: 65,
    mass: 9,
    cost: 90000,
    desc: 'A long can for twelve passengers on a cluster of four bells. Most of the Unsworn left the Confederation in one.',
  }),
  hull({
    id: 1054,
    name: 'Smokejack',
    sub: 'Smuggling Runner',
    faction: 'unsworn',
    cargo: 70,
    fuel: 585,
    space: 18,
    guns: 1,
    turrets: 1,
    crew: 4,
    size: 86,
    weapons: [],
    strength: 7,
    tech: 1,
    shield: 25,
    shieldRe: 6,
    armor: 62,
    speed: 315,
    accel: 332,
    turn: 30,
    mass: 60,
    cost: 37000,
    desc: 'Cargo cans on a quick-release spine and a drive bigger than the ship. If it is boarded, the cans are already drifting.',
  }),
  hull({
    id: 1055,
    name: 'Commonhold',
    sub: 'Command Centre',
    npcOnly: true,
    faction: 'unsworn',
    cargo: 400,
    fuel: 1040,
    space: 140,
    guns: 0,
    turrets: 0,
    crew: 300,
    size: 260,
    weapons: [],
    strength: 810,
    tech: 6,
    shield: 980,
    shieldRe: 56,
    armor: 2415,
    speed: 54,
    accel: 51,
    turn: 7,
    mass: 3542,
    cost: 9000000,
    desc: 'A hollowed ore rock with habitat cans dug in, antenna masts and docking booms full of runners. From outside it looks like dead mining spoil. This is where the Unsworn decide things.',
  }),
];

export const UNSWORN_IDS: number[] = UNSWORN_HULLS.map((h) => h.id);
export const UNSWORN_SOLD_IDS: number[] = UNSWORN_HULLS.filter((h) => h.id !== 1055).map(
  (h) => h.id,
);
export const UNSWORN_COMMAND_ID = 1055;

/** Sprite sheets rendered by tools/freefolk/rift_ff_sheets.py. Merge into SPRITES in shared/sprites26.ts. */
export const UNSWORN_SPRITES: Record<number, SpriteSheetConfig> = {
  1050: { fs: 80, cols: 12, banks: true, glow: true, packed: true },
  1051: { fs: 104, cols: 12, banks: true, glow: true, packed: true },
  1052: { fs: 96, cols: 12, banks: true, glow: true, packed: true },
  1053: { fs: 140, cols: 12, banks: true, glow: true, packed: true },
  1054: { fs: 172, cols: 12, banks: true, glow: true, packed: true },
  1055: { fs: 260, cols: 12, banks: true, glow: true, packed: true },
};
