export type RoleId = 'interceptor' | 'explorer' | 'battleship' | 'survey' | 'carrier';

/** Display metadata and combat description for a ship role. */
export type RoleInfo = {
  /** Display name of the role. */
  name: string;
  /** Short 3-letter abbreviation. */
  short: string;
  /** Hex color code representing this role. */
  color: string;
  /** Unicode icon symbol for UI badges. */
  icon: string;
  /** Description of tactical strengths and weaknesses. */
  desc: string;
};

/** Minimal ship hull interface required for role resolution. */
export type ShipHullRef = {
  /** Hull identifier. */
  id?: number;

  /** Explicit role if already assigned. */
  role?: string;

  /** Ship weapon slots tuple [id, count, ammo]. */
  weapons?: Array<[number | string, number, number?]>;

  /** Base shield strength. */
  shield?: number;

  /** Base armor hit points. */
  armor?: number;

  /** Cargo capacity in tons. */
  cargo?: number;

  /** Combat rating / strength score. */
  strength?: number;

  /** Maximum flight speed in EV units. */
  speed?: number;
};

/** Weapon definition metadata for carrier detection. */
export type WeaponRef = {
  /** Weapon mount type (e.g. 'bay', 'beam', 'turret'). */
  type?: string;
};
// Quantum Rift: ship roles and the class triangle (after STFC). Interceptors beat Battleships, Battleships beat
// Explorers, Explorers beat Interceptors. Survey ships are the miners and haulers; Carriers launch fighters.

/**
 * Valid ship combat and utility roles.

 */

/**
 * Information and UI presentation definitions for all ship roles.
 */
export const ROLES_INFO: Record<RoleId, RoleInfo> = {
  interceptor: {
    name: 'Interceptor',
    short: 'INT',
    color: '#ff8a5a',
    icon: '▲',
    desc: 'Fast and agile. Strong against Battleships, weak against Explorers.',
  },
  explorer: {
    name: 'Explorer',
    short: 'EXP',
    color: '#7ad0ff',
    icon: '◆',
    desc: 'Balanced and far-ranging. Strong against Interceptors, weak against Battleships.',
  },
  battleship: {
    name: 'Battleship',
    short: 'BAT',
    color: '#ff5a5a',
    icon: '■',
    desc: 'Heavy armor and firepower. Strong against Explorers, weak against Interceptors.',
  },
  survey: {
    name: 'Survey',
    short: 'SRV',
    color: '#ffd27a',
    icon: '●',
    desc: 'Miners and haulers: +50% mining yield, but they fight poorly (-20% damage).',
  },
  carrier: {
    name: 'Carrier',
    short: 'CAR',
    color: '#c8a0ff',
    icon: '✚',
    desc: 'Launch fighters. Outside the triangle.',
  },
};

/**
 * The combat advantage triangle mapping attacker role to the role it beats.
 */
export const BEATS: Record<string, RoleId> = {
  interceptor: 'battleship',
  battleship: 'explorer',
  explorer: 'interceptor',
};

/**
 * Multipliers for role advantage and disadvantage.
 */
export const COUNTER: { dmg: number; taken: number; survey: number; surveyMining: number } = {
  dmg: 1.15,
  taken: 0.9,
  survey: 0.8,
  surveyMining: 50,
};

/**
 * Hardcoded role overrides for specific legacy hull IDs.
 */
const OVERRIDE: Record<number, RoleId> = { 735: 'explorer', 716: 'battleship' }; // the Halo Surveyor is a scout, the Tempest a destroyer

/**
 * Determines the role of a ship hull from its attributes or hardcoded overrides.
 * @param shipHullRef - Ship hull definition or ship instance.
 * @param width - Weapon definitions map keyed by weapon ID.
 * @returns The resolved ship role.
 */
export function roleOf(
  shipHullRef: ShipHullRef | null | undefined,
  width?: Record<string | number, WeaponRef> | null,
): string {
  if (!shipHullRef) return 'explorer';
  if (shipHullRef.role) return shipHullRef.role;
  if (OVERRIDE[shipHullRef.id!]) return OVERRIDE[shipHullRef.id!];
  if (
    width &&
    (shipHullRef.weapons || []).some(([width2]) => width[width2] && width[width2].type === 'bay')
  )
    return 'carrier';
  const duration = (shipHullRef.shield || 0) + (shipHullRef.armor || 0);
  if ((shipHullRef.cargo || 0) >= 45 && shipHullRef.cargo! >= (shipHullRef.strength || 0) * 0.9)
    return 'survey';
  if ((shipHullRef.speed || 0) >= 450) return 'interceptor';
  if (duration >= 1900 && (shipHullRef.speed || 0) <= 430) return 'battleship';
  return 'explorer';
}

/**
 * Calculates the damage multiplier for an attacker of role `a` hitting a target of role `t`.
 * @param firstValue - Attacker role.
 * @param time - Target role.
 * @returns Damage multiplier.
 */
// damage multiplier for an attacker of role a hitting a target of role t
export function roleMult(
  firstValue: string | null | undefined,
  time: string | null | undefined,
): number {
  if (!firstValue || !time) return 1;
  let message = 1;
  if (BEATS[firstValue] === time) message *= COUNTER.dmg;
  if (BEATS[time] === firstValue) message *= COUNTER.taken;
  if (firstValue === 'survey') message *= COUNTER.survey;
  return message;
}
