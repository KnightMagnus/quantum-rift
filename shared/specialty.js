// Quantum Rift 0.8 "Specialists": ten one-of-a-kind ships, each built for a single job (after STFC's specialty ships).
// The loop: the ship's activity drops its blueprints (flying anything) and its unique resource (flying the specialist).
// The station refines the resource into that ship's parts; parts upgrade five components; a full set unlocks a timed tier-up.

/**
 * @typedef {Object} SpecialistResource
 * @property {string} name - Resource item name.
 * @property {string} icon - Symbol icon representing the resource.
 * @property {string} color - Hex color code for UI and inventory display.
 */

/**
 * @typedef {Object} SpecialistShip
 * @property {number} id - Unique ship hull ID (805-814).
 * @property {string} key - String identifier key (e.g. 'lodestar', 'swarmbreaker').
 * @property {string} name - Ship hull name.
 * @property {string} sub - Subtitle / classification.
 * @property {string} role - Tactical role profile.
 * @property {string} res - Associated unique resource key.
 * @property {number} cost - Base credit purchase/build cost.
 * @property {number} cargo - Cargo hold capacity.
 * @property {number} shield - Maximum shield strength.
 * @property {number} shieldRe - Shield recharge rate.
 * @property {number} armor - Maximum armor plating.
 * @property {number} accel - Engine acceleration rating.
 * @property {number} speed - Top sublight speed.
 * @property {number} turn - Maneuverability / turn rate.
 * @property {number} fuel - Hyperdrive fuel tank capacity.
 * @property {number} space - Free outfit expansion space.
 * @property {number} guns - Fixed gun mount hardpoints.
 * @property {number} turrets - Turret hardpoints.
 * @property {number} mass - Ship hull displacement mass.
 * @property {number} strength - Combat strength rating.
 * @property {number} size - Visual sprite scale.
 * @property {Array<[number, number, number]>} weapons - Default weapon loadout tuples [weaponId, count, ammo].
 * @property {string} ability - Special innate ship capability description.
 * @property {string} loop - Gameplay gameplay loop description for collecting blueprints and resources.
 * @property {string} desc - Lore background and flavor text.
 * @property {string} cat - Category classification ('Specialist').
 * @property {string} faction - Faction identifier ('specialist').
 * @property {string} kind - Classification key ('specialist').
 * @property {number} buy - Purchase availability flag (0).
 * @property {number} ai - Default AI profile level.
 * @property {number} tech - Tech level rating.
 * @property {number} fuelRe - Passive fuel generation rate.
 * @property {number} armorRe - Passive armor repair rate.
 * @property {boolean} glow - Visual engine flare flag.
 * @property {number} crew - Crew complement requirement.
 */

/**
 * @typedef {Object} SpecialistComponent
 * @property {string} name - Component name.
 * @property {Object.<string, number>} bonus - Stat bonuses granted per component upgrade level.
 */

/**
 * @typedef {Object} SpecialistUpgradeState
 * @property {number} [tier] - Current specialist tier level (1 to 5).
 * @property {Object.<string, number>} [comp] - Mapping of component keys ('weapons', 'shields', etc.) to current upgrade levels.
 */

/**
 * Unique refined resources dropped by each specialist ship archetype.
 * @type {Object.<string, SpecialistResource>}
 */
export const SPEC_RES = {
  riftore: { name: 'Riftore', icon: '◆', color: '#ffb84a' },
  chitin: { name: 'Chitin Resonators', icon: '⬢', color: '#8ad84a' },
  umbra: { name: 'Umbral Shards', icon: '✦', color: '#b48aff' },
  seals: { name: 'Prize Seals', icon: '⚓', color: '#ff7a5a' },
  writs: { name: 'Command Writs', icon: '✶', color: '#ffd27a' },
  cores: { name: 'Salvage Cores', icon: '◎', color: '#5ad8ff' },
  samples: { name: 'Anomaly Samples', icon: '✺', color: '#e682fa' },
  insignia: { name: 'Raider Insignia', icon: '⛨', color: '#7ab0ff' },
  contacts: { name: 'Black-Market Contacts', icon: '☍', color: '#5ad0b0' },
  warrants: { name: 'Warrant Seals', icon: '⚖', color: '#ff9a3a' },
};

// Base hull stats in asset-space units.
const S = (o) => ({
  cat: 'Specialist',
  faction: 'specialist',
  kind: 'specialist',
  buy: 0,
  ai: 3,
  tech: 5,
  fuelRe: 0,
  armorRe: 0,
  glow: true,
  crew: 40,
  ...o,
  cost: Math.round((o.cost * 0.7) / 10000) * 10000,
}); // 1.0 balance: blueprints already gate these, so credits are 70%

/**
 * Roster of the ten distinct specialist ship hulls and their baseline attributes.
 * @type {SpecialistShip[]}
 */
export const SPECIALISTS = [
  S({
    id: 805,
    key: 'lodestar',
    name: 'Lodestar',
    sub: 'Mining Specialist',
    role: 'survey',
    res: 'riftore',
    cost: 1400000,
    cargo: 260,
    shield: 700,
    shieldRe: 60,
    armor: 900,
    accel: 220,
    speed: 230,
    turn: 24,
    fuel: 700,
    space: 120,
    guns: 2,
    turrets: 4,
    mass: 420,
    strength: 160,
    size: 136,
    weapons: [
      [9102, 2, 0],
      [130, 2, 0],
    ],
    ability:
      'Triple mining yield, and a protected hold: your cargo survives if she is destroyed. Rich veins give up Riftore.',
    loop: 'Mine rich asteroid veins (richness 2+).',
    desc: 'A Concord mining barge refitted by Korrund engineers: two ore-cutter arms that can split a mountain, four armored hoppers, and a hold sealed so tight the insurers call it unlosable.',
  }),
  S({
    id: 806,
    key: 'swarmbreaker',
    name: 'Swarmbreaker',
    sub: 'Swarm Hunter',
    role: 'explorer',
    res: 'chitin',
    cost: 1700000,
    cargo: 40,
    shield: 1100,
    shieldRe: 90,
    armor: 800,
    accel: 380,
    speed: 420,
    turn: 42,
    fuel: 900,
    space: 90,
    guns: 3,
    turrets: 2,
    mass: 260,
    strength: 280,
    size: 122,
    weapons: [
      [346, 1, 0],
      [146, 2, 0],
      [347, 1, 0],
    ],
    ability:
      'Her resonance dish shatters chitin: +60% damage to the Feral Swarm, and her flak shreds swarmlings.',
    loop: 'Destroy Feral Swarm clusters (Vashari and Frontier space).',
    desc: 'A white hunter built around a forward resonance dish tuned to the frequency that cracks Vashari swarm chitin. The swarms hear her coming, and scatter.',
  }),
  S({
    id: 807,
    key: 'nightglass',
    name: 'Nightglass',
    sub: 'Umbral Hunter',
    role: 'interceptor',
    res: 'umbra',
    cost: 2200000,
    cargo: 10,
    shield: 900,
    shieldRe: 110,
    armor: 600,
    accel: 560,
    speed: 620,
    turn: 70,
    fuel: 800,
    space: 70,
    guns: 4,
    turrets: 0,
    mass: 140,
    strength: 320,
    size: 92,
    weapons: [
      [343, 2, 0],
      [339, 2, 0],
    ],
    ability:
      '+50% damage to the Umbral and to invasion bosses. Umbral wrecks shed their shards for her.',
    loop: 'Destroy Umbral ships.',
    desc: 'A dart of black glass edged in violet light. Her hull is grown from the same lightless lattice the Umbral use, which is why their sensors read her as one of their own until it is too late.',
  }),
  S({
    id: 808,
    key: 'corsair',
    name: 'Corsair',
    sub: 'Boarding Specialist',
    role: 'battleship',
    res: 'seals',
    cost: 2600000,
    cargo: 120,
    shield: 1600,
    shieldRe: 80,
    armor: 2200,
    accel: 220,
    speed: 300,
    turn: 24,
    fuel: 800,
    space: 140,
    guns: 2,
    turrets: 6,
    mass: 720,
    strength: 520,
    size: 164,
    weapons: [
      [131, 4, 0],
      [161, 2, 0],
    ],
    ability:
      'Boarding clamps and a prize crew: plunder pays double and capture odds are 25% better.',
    loop: 'Board disabled ships.',
    desc: 'A heavy prize-taker with hooked clamps at the bow and a docking collar amidships. Every Corsair captain swears they only board pirates.',
  }),
  S({
    id: 809,
    key: 'herald',
    name: 'Herald',
    sub: 'Squadron Command',
    role: 'explorer',
    res: 'writs',
    cost: 2400000,
    cargo: 40,
    shield: 1400,
    shieldRe: 100,
    armor: 900,
    accel: 340,
    speed: 380,
    turn: 36,
    fuel: 1000,
    space: 110,
    guns: 2,
    turrets: 2,
    mass: 300,
    strength: 300,
    size: 128,
    weapons: [
      [334, 1, 0],
      [341, 2, 0],
    ],
    ability:
      'Your wingmates fight 25% harder with 25% more shields, and her dock holds a third wingmate.',
    loop: 'Win fights alongside your wingmates.',
    desc: 'A command yacht under a golden halo, its signal spire coordinating every ship in her wing. Wingmates fly tighter and braver when the Herald calls the turns.',
  }),
  S({
    id: 810,
    key: 'tidecaller',
    name: 'Tidecaller',
    sub: 'Salvage Specialist',
    role: 'explorer',
    res: 'cores',
    cost: 2000000,
    cargo: 140,
    shield: 1300,
    shieldRe: 130,
    armor: 900,
    accel: 280,
    speed: 340,
    turn: 30,
    fuel: 900,
    space: 110,
    guns: 4,
    turrets: 2,
    mass: 360,
    strength: 260,
    size: 140,
    weapons: [
      [337, 2, 0],
      [146, 2, 0],
    ],
    ability:
      'Tractor tentacles pull in salvage from four times as far; wrecks drop crates 50% more often; your wingmates regenerate shields faster.',
    loop: 'Collect salvage from destroyed ships.',
    desc: 'A living ray grown by the Thalassi, her trailing tentacles strong enough to tow a freighter. She hums to the wreckage, and the wreckage comes.',
  }),
  S({
    id: 811,
    key: 'pathfinder',
    name: 'Pathfinder',
    sub: 'Deep Explorer',
    role: 'explorer',
    res: 'samples',
    cost: 1900000,
    cargo: 60,
    shield: 1000,
    shieldRe: 90,
    armor: 700,
    accel: 420,
    speed: 460,
    turn: 44,
    fuel: 2400,
    space: 100,
    guns: 2,
    turrets: 1,
    mass: 220,
    strength: 220,
    size: 136,
    weapons: [
      [156, 2, 0],
      [341, 1, 0],
    ],
    ability:
      'Her oversized drive ring jumps two systems at once along your route, and she harvests samples while flying through anomalies.',
    loop: 'Fly through anomaly systems; chart new systems.',
    desc: 'A slim long-range scout pushed by a jump-drive ring three times the size it should be. She has seen more of the Rift than any chart.',
  }),
  S({
    id: 812,
    key: 'bulwark',
    name: 'Bulwark',
    sub: 'Station Defender',
    role: 'battleship',
    res: 'insignia',
    cost: 3000000,
    cargo: 60,
    shield: 3200,
    shieldRe: 120,
    armor: 3000,
    accel: 160,
    speed: 220,
    turn: 16,
    fuel: 700,
    space: 180,
    guns: 2,
    turrets: 6,
    mass: 1100,
    strength: 760,
    size: 172,
    weapons: [
      [132, 4, 0],
      [197, 2, 0],
      [347, 2, 0],
    ],
    ability:
      "In your Personal Station's system she fights 50% harder with 50% more shields, and raids pay double.",
    loop: 'Defeat raids on your station.',
    desc: 'A fortress block ringed with shield pylons. She was designed to never leave home, and to make sure nobody else ever arrives uninvited.',
  }),
  S({
    id: 813,
    key: 'wraith',
    name: 'Wraith',
    sub: 'Smuggler',
    role: 'interceptor',
    res: 'contacts',
    cost: 1800000,
    cargo: 90,
    shield: 800,
    shieldRe: 100,
    armor: 500,
    accel: 520,
    speed: 580,
    turn: 64,
    fuel: 1000,
    space: 80,
    guns: 3,
    turrets: 0,
    mass: 160,
    strength: 200,
    size: 96,
    weapons: [
      [129, 2, 0],
      [332, 1, 12],
    ],
    ability:
      'Faceted stealth hull: patrols cannot scan her hold, and hostiles notice her only at a third of the usual range.',
    loop: 'Complete smuggling jobs.',
    desc: 'A faceted stealth flyer in matte charcoal, with only the faintest teal seams. Customs officers in six systems have her description on file. None of them have seen her.',
  }),
  S({
    id: 814,
    key: 'vanguard',
    name: 'Vanguard',
    sub: 'Bounty Hunter',
    role: 'battleship',
    res: 'warrants',
    cost: 2800000,
    cargo: 50,
    shield: 1800,
    shieldRe: 90,
    armor: 2000,
    accel: 250,
    speed: 330,
    turn: 26,
    fuel: 900,
    space: 150,
    guns: 3,
    turrets: 3,
    mass: 640,
    strength: 560,
    size: 162,
    weapons: [
      [158, 1, 0],
      [143, 2, 0],
      [131, 3, 0],
    ],
    ability: '+40% damage to pirates, the Umbral and wanted targets, and bounties pay 50% more.',
    loop: 'Collect bounties and take down wanted kingpins.',
    desc: "A bounty hunter's gunship: a long spinal cannon between two heavy engine pods. The Concord pays her captains by the head, and she has paid for herself many times over.",
  }),
];
/**
 * Specialist ship configurations keyed by numeric hull ID.
 * @type {Object.<number, SpecialistShip>}
 */
export const SPEC = Object.fromEntries(SPECIALISTS.map((s) => [s.id, s]));

/**
 * Specialist ship configurations keyed by string identifier key.
 * @type {Object.<string, SpecialistShip>}
 */
export const SPEC_BY_KEY = Object.fromEntries(SPECIALISTS.map((s) => [s.key, s]));

/**
 * Blueprint fragments required to construct a specialist ship.
 * @type {number}
 */
export const BP_NEED = 40; // blueprints to build a specialist

/**
 * Station facility level and material requirements to construct specialist hulls.
 * @type {{ ops: number, mats: Array<[string, number, number]> }}
 */
export const BUILD = {
  ops: 3,
  mats: [
    ['alloy', 2, 2],
    ['crystal', 2, 1],
    ['isotope', 1, 1],
  ],
};

/**
 * Ratio of raw specialist resource units consumed per refined component part.
 * @type {number}
 */
export const PART_RATE = 5; // unique resource units per part at the station refinery

/**
 * Specialist component upgrade categories and their respective stat enhancements.
 * @type {Object.<string, SpecialistComponent>}
 */
export const COMPONENTS = {
  weapons: { name: 'Weapons', bonus: { damagePct: 4 } },
  shields: { name: 'Shields', bonus: { shieldPct: 5, shieldRePct: 5 } },
  hull: { name: 'Hull', bonus: { armorPct: 5 } },
  drive: { name: 'Drive', bonus: { speedPct: 3, turnPct: 4 } },
  special: { name: 'Specialty', bonus: { ability: 10 } }, // +10% to the ship's specialty per upgrade
};

/**
 * Maximum specialist upgrade tier limit.
 * @type {number}
 */
export const TIER_MAX = 5;

/**
 * Calculates component upgrade part and credit costs for a given tier.
 * @param {number} tier - Current tier level of the specialist.
 * @returns {{ parts: number, credits: number }} Required refined parts and credits.
 */
export const COMP_COST = (tier) => ({ parts: 4 + tier * 4, credits: 40000 * tier * tier });

/**
 * Drydock upgrade duration in minutes required to advance from tier t to t+1.
 * @type {number[]}
 */
export const TIER_UP_MIN = [0, 10, 20, 40, 80]; // minutes in drydock to go from tier t to t+1

// the specialty strength multiplier (1.0 at tier 1 with no special upgrades)
/**
 * Calculates effective specialist ability bonus multiplier based on tier and component upgrades.
 * @param {SpecialistUpgradeState|null|undefined} st - Specialist component and tier upgrade state.
 * @returns {number} Effectiveness multiplier (1.0 baseline).
 */
export function specPower(st) {
  if (!st) return 1;
  return 1 + 0.1 * (st.comp && st.comp.special ? st.comp.special : 0) + 0.05 * ((st.tier || 1) - 1);
}
