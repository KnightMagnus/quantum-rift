// Quantum Rift: ship roles and the class triangle (after STFC). Interceptors beat Battleships, Battleships beat
// Explorers, Explorers beat Interceptors. Survey ships are the miners and haulers; Carriers launch fighters.

/**
 * Valid ship combat and utility roles.
 * @typedef {'interceptor' | 'explorer' | 'battleship' | 'survey' | 'carrier'} RoleId
 */

/**
 * Display metadata and combat description for a ship role.
 * @typedef {Object} RoleInfo
 * @property {string} name - Display name of the role.
 * @property {string} short - Short 3-letter abbreviation.
 * @property {string} color - Hex color code representing this role.
 * @property {string} icon - Unicode icon symbol for UI badges.
 * @property {string} desc - Description of tactical strengths and weaknesses.
 */

/**
 * Minimal ship hull interface required for role resolution.
 * @typedef {Object} ShipHullRef
 * @property {number} [id] - Hull identifier.
 * @property {RoleId|string} [role] - Explicit role if already assigned.
 * @property {Array<[number|string, number, number?]>} [weapons] - Ship weapon slots tuple [id, count, ammo].
 * @property {number} [shield] - Base shield strength.
 * @property {number} [armor] - Base armor hit points.
 * @property {number} [cargo] - Cargo capacity in tons.
 * @property {number} [strength] - Combat rating / strength score.
 * @property {number} [speed] - Maximum flight speed in EV units.
 */

/**
 * Weapon definition metadata for carrier detection.
 * @typedef {Object} WeaponRef
 * @property {string} [type] - Weapon mount type (e.g. 'bay', 'beam', 'turret').
 */

/**
 * Information and UI presentation definitions for all ship roles.
 * @type {Record<RoleId, RoleInfo>}
 */
export const ROLES_INFO = {
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
 * @type {Record<string, RoleId>}
 */
export const BEATS = { interceptor: 'battleship', battleship: 'explorer', explorer: 'interceptor' };

/**
 * Multipliers for role advantage and disadvantage.
 * @type {{ dmg: number, taken: number, survey: number, surveyMining: number }}
 */
export const COUNTER = { dmg: 1.15, taken: 0.9, survey: 0.8, surveyMining: 50 };

/**
 * Hardcoded role overrides for specific legacy hull IDs.
 * @type {Record<number, RoleId>}
 */
const OVERRIDE = { 735: 'explorer', 716: 'battleship' }; // the Halo Surveyor is a scout, the Tempest a destroyer

/**
 * Determines the role of a ship hull from its attributes or hardcoded overrides.
 * @param {ShipHullRef|null|undefined} H - Ship hull definition or ship instance.
 * @param {Record<string|number, WeaponRef>|null|undefined} [W] - Weapon definitions map keyed by weapon ID.
 * @returns {RoleId|string} The resolved ship role.
 */
export function roleOf(H, W) {
  if (!H) return 'explorer';
  if (H.role) return H.role;
  if (OVERRIDE[H.id]) return OVERRIDE[H.id];
  if (W && (H.weapons || []).some(([w]) => W[w] && W[w].type === 'bay')) return 'carrier';
  const dur = (H.shield || 0) + (H.armor || 0);
  if ((H.cargo || 0) >= 45 && H.cargo >= (H.strength || 0) * 0.9) return 'survey';
  if ((H.speed || 0) >= 450) return 'interceptor';
  if (dur >= 1900 && (H.speed || 0) <= 430) return 'battleship';
  return 'explorer';
}

/**
 * Calculates the damage multiplier for an attacker of role `a` hitting a target of role `t`.
 * @param {RoleId|string|null|undefined} a - Attacker role.
 * @param {RoleId|string|null|undefined} t - Target role.
 * @returns {number} Damage multiplier.
 */
// damage multiplier for an attacker of role a hitting a target of role t
export function roleMult(a, t) {
  if (!a || !t) return 1;
  let m = 1;
  if (BEATS[a] === t) m *= COUNTER.dmg;
  if (BEATS[t] === a) m *= COUNTER.taken;
  if (a === 'survey') m *= COUNTER.survey;
  return m;
}
