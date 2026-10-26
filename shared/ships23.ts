/** Hull specifications input for 2.3 Quantum ship definitions. */
export type Ship23Input = {
  /** Unique ship hull identifier. */
  id: number;

  /** Ship model name. */
  name: string;

  /** Subtitle / classification. */
  sub: string;

  /** Base purchase cost in credits. */
  cost: number;

  /** Tech tier required to purchase (1-6). */
  tech: number;

  /** Cargo capacity in tons. */
  cargo: number;

  /** Maximum shield capacity. */
  shield: number;

  /** Shield recharge rate. */
  shieldRe: number;

  /** Maximum armor hit points. */
  armor: number;

  /** Acceleration capability in EV units. */
  accel: number;

  /** Top flight speed in EV units. */
  speed: number;

  /** Maneuverability / turning speed in EV units. */
  turn: number;

  /** Maximum hyperdrive jump fuel. */
  fuel: number;

  /** Internal outfit expansion space. */
  space: number;

  /** Fixed gun hardpoint count. */
  guns: number;

  /** Turret mount count. */
  turrets: number;

  /** Unladen hull mass. */
  mass: number;

  /** Crew complement required. */
  crew: number;

  /** Overall combat power score. */
  strength: number;

  /** Target collision and sprite visual scale. */
  size: number;

  /** Default weapon loadout tuples [weaponId, count, ammo]. */
  weapons: Array<[number, number, number]>;

  /** Lore description displayed in shipyards. */
  desc: string;

  /** Whether this hull spools hyperdrive jumps in half time. */
  fastJump?: boolean;
};
export type Ship23Hull = Ship23Input & {
  cat: string;
  faction: string;
  kind: string;
  armorRe: number;
  fuelRe: number;
  buy: number;
  ai: number;
  fastJump: boolean;
  glow: boolean;
  pilot: string;
  img: string;
};
// Quantum Rift: ten common Quantum hulls for the Concord yards (art: tools/ships26/hulls22.py).
// Same units and fields as the mod's own ships.

/**
 * Complete Quantum ship hull record with default yard properties.

 */

/**
 * Factory helper generating common Quantum hull records with standardized defaults.
 * @param ship23Input - Raw hull attributes.
 * @returns Fully-specified hull object.
 */
const quantity = (ship23Input: Ship23Input) => ({
  cat: 'Quantum',
  faction: 'common',
  kind: 'hull',
  armorRe: 0,
  fuelRe: 0,
  buy: 50,
  ai: 3,
  fastJump: false,
  glow: true,
  pilot: '',
  ...ship23Input,
  img: `ships/${ship23Input.id}_yard.png`,
});

/**
 * Roster of ten common Quantum hulls introduced in 2.3.
 */
export const SHIPS23: Ship23Hull[] = [
  quantity({
    id: 820,
    name: 'Wasp Skirmisher',
    sub: 'Light Fighter',
    cost: 30000,
    tech: 1,
    cargo: 8,
    shield: 55,
    shieldRe: 10,
    armor: 50,
    accel: 800,
    speed: 470,
    turn: 75,
    fuel: 300,
    space: 14,
    guns: 2,
    turrets: 0,
    mass: 10,
    crew: 1,
    strength: 12,
    size: 34,
    weapons: [[128, 2, 0]],
    desc: 'A stubby, cheap fighter: one oversized engine, two cheek blasters and a coat of hazard yellow. Militia squadrons buy them by the dozen; new captains buy one and learn to dodge.',
  }),
  quantity({
    id: 821,
    name: 'Swift Courier',
    sub: 'Blockade Runner',
    cost: 110000,
    tech: 2,
    cargo: 35,
    shield: 80,
    shieldRe: 12,
    armor: 60,
    accel: 700,
    speed: 540,
    turn: 60,
    fuel: 600,
    space: 16,
    guns: 1,
    turrets: 0,
    mass: 12,
    crew: 2,
    strength: 20,
    size: 48,
    fastJump: true,
    weapons: [[128, 1, 0]],
    desc: 'A needle with a cargo pod slung under its belly and two long outrigger engines. It carries little, but it carries it fast, and its tuned drive spools a jump in half the time.',
  }),
  quantity({
    id: 822,
    name: 'Pelican Salvage Tug',
    sub: 'Salvage Tug',
    cost: 170000,
    tech: 2,
    cargo: 60,
    shield: 130,
    shieldRe: 12,
    armor: 240,
    accel: 300,
    speed: 240,
    turn: 35,
    fuel: 400,
    space: 30,
    guns: 1,
    turrets: 1,
    mass: 30,
    crew: 6,
    strength: 35,
    size: 60,
    weapons: [[130, 1, 0]],
    desc: 'A squat, scarred utility hull with a roomy hold and a reputation for surviving rough working conditions. Its simple machinery is easy to service at even the smallest port.',
  }),
  quantity({
    id: 823,
    name: 'Sabre Corvette',
    sub: 'Corvette',
    cost: 380000,
    tech: 3,
    cargo: 18,
    shield: 220,
    shieldRe: 22,
    armor: 200,
    accel: 650,
    speed: 430,
    turn: 55,
    fuel: 400,
    space: 30,
    guns: 3,
    turrets: 1,
    mass: 22,
    crew: 8,
    strength: 120,
    size: 62,
    weapons: [
      [129, 2, 0],
      [130, 1, 0],
    ],
    desc: "The Concord yards' all-rounder: a sleek wedge with a dorsal turret, swept fins and three engines. Fast enough to chase, tough enough to stay, and cheap enough to lose.",
  }),
  quantity({
    id: 824,
    name: 'Caravel Trader',
    sub: 'Armed Merchantman',
    cost: 430000,
    tech: 3,
    cargo: 160,
    shield: 220,
    shieldRe: 18,
    armor: 300,
    accel: 260,
    speed: 250,
    turn: 30,
    fuel: 500,
    space: 40,
    guns: 1,
    turrets: 2,
    mass: 40,
    crew: 14,
    strength: 70,
    size: 96,
    weapons: [
      [129, 1, 0],
      [130, 2, 0],
    ],
    desc: 'A long cargo spine racked with colourful containers, a bridge up front and a turret at each end. Free traders run them in pairs; raiders learn to leave them alone.',
  }),
  quantity({
    id: 825,
    name: 'Talon Strike Fighter',
    sub: 'Heavy Fighter',
    cost: 780000,
    tech: 4,
    cargo: 8,
    shield: 260,
    shieldRe: 30,
    armor: 220,
    accel: 850,
    speed: 540,
    turn: 70,
    fuel: 350,
    space: 34,
    guns: 4,
    turrets: 0,
    mass: 18,
    crew: 2,
    strength: 190,
    size: 58,
    weapons: [
      [129, 2, 0],
      [332, 2, 16],
    ],
    desc: 'Forward-swept wings carrying rocket pods, twin tails and a two-seat canopy. The Talon goes in fast, empties its pods and is gone before the flak finds it.',
  }),
  quantity({
    id: 826,
    name: 'Lighthouse Survey Cruiser',
    sub: 'Survey Cruiser',
    cost: 950000,
    tech: 4,
    cargo: 50,
    shield: 420,
    shieldRe: 40,
    armor: 320,
    accel: 400,
    speed: 400,
    turn: 40,
    fuel: 1400,
    space: 60,
    guns: 2,
    turrets: 2,
    mass: 34,
    crew: 20,
    strength: 140,
    size: 92,
    fastJump: true,
    weapons: [
      [129, 1, 0],
      [130, 2, 0],
    ],
    desc: 'A long survey hull behind a great sensor dome ringed by a glowing halo array. Built to go further than anything else in the yards, and to come back with the charts.',
  }),
  quantity({
    id: 827,
    name: 'Monarch Executive Yacht',
    sub: 'Executive Yacht',
    cost: 1900000,
    tech: 5,
    cargo: 30,
    shield: 480,
    shieldRe: 55,
    armor: 300,
    accel: 700,
    speed: 640,
    turn: 60,
    fuel: 800,
    space: 50,
    guns: 2,
    turrets: 1,
    mass: 26,
    crew: 12,
    strength: 160,
    size: 70,
    weapons: [
      [146, 2, 0],
      [130, 1, 0],
    ],
    desc: 'White hull, gold trim, an observation canopy the length of the ship and engines that make the Lacewing look slow. Bought by people who never ask what anything costs.',
  }),
  quantity({
    id: 828,
    name: 'Aegis Escort Cruiser',
    sub: 'Escort Cruiser',
    cost: 2200000,
    tech: 5,
    cargo: 50,
    shield: 800,
    shieldRe: 60,
    armor: 900,
    accel: 300,
    speed: 300,
    turn: 28,
    fuel: 600,
    space: 90,
    guns: 2,
    turrets: 6,
    mass: 60,
    crew: 70,
    strength: 420,
    size: 120,
    weapons: [
      [131, 2, 0],
      [330, 4, 0],
    ],
    desc: 'A shield-wall hull studded with flak turrets and armoured flank plates, built to sit beside a convoy and make every missile and fighter regret the trip.',
  }),
  quantity({
    id: 829,
    name: 'Vigil Heavy Cruiser',
    sub: 'Heavy Cruiser',
    cost: 5200000,
    tech: 6,
    cargo: 60,
    shield: 1150,
    shieldRe: 80,
    armor: 1200,
    accel: 260,
    speed: 280,
    turn: 24,
    fuel: 700,
    space: 120,
    guns: 4,
    turrets: 8,
    mass: 90,
    crew: 140,
    strength: 720,
    size: 160,
    weapons: [
      [143, 2, 0],
      [132, 4, 0],
      [332, 2, 30],
    ],
    desc: "A long armoured spear with a spinal fusion cannon and rows of broadside turrets: the Concord's answer to everything between a destroyer and a dreadnought.",
  }),
];
