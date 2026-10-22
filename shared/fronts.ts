export type InvasionBoss = {
  id: string;
  name: string;
  hull: number;
  faction: string;
  mult: number;
  pool: number;
  minions: number[];
};
export type InvasionConfig = { everyMin: number; lastMin: number; minShare: number };
export type SpaceAnomaly = {
  name: string;
  icon: string;
  color: string;
  desc: string;
  mods: Record<string, number>;
};
export type GoalTypeDef = {
  text: (arg0: number) => string;
  daily: [number, number];
  weekly: [number, number];
};
export type ServerEvent = {
  id: string;
  day?: number;
  name: string;
  desc: string;
  mods: Record<string, number>;
};
export type ScheduledEvent = Partial<ServerEvent> & { start: number; end: number };
export type FactionStoreTier = { rep: number; name: string };
export type FactionStoreItem = {
  id: string;
  name: string;
  tokens: number;
  credits: number;
  rep: number;
  give: Record<string, number | string | boolean>;
};
import { signedXorshift32 as randomGenerator } from './deterministic-random.ts';
import { EXALTED_STANDING } from './reputation.ts';
// Quantum Rift: data: invasions, anomalies, goals,
// server events and faction stores. Shared by server and client.

// Armada rules are defined in shared/coop.js.

/**
 * InvasionBoss fields:
 * id: - Unique boss encounter identifier.
 * name: - Display title of the world boss flagship.
 * hull: - Hull ID of the boss ship.
 * faction: - Faction allegiance of the boss.
 * mult: - Boss durability/shield scaling multiplier.
 * pool: - Total bounty credit pool distributed among attackers.
 * minions: - Array of escort minion hull IDs spawned alongside the boss.
 */

/**
 * InvasionConfig fields:
 * everyMin: - Interval in minutes between boss invasion spawns.
 * lastMin: - Active duration in minutes before unvanquished bosses retreat.
 * minShare: - Minimum share of boss damage required to qualify for bounty rewards.
 */

/**
 * SpaceAnomaly fields:
 * name: - Display name of the spatial anomaly.
 * icon: - Symbol icon representing the anomaly.
 * color: - Hex color code for UI and star map overlays.
 * desc: - Description explaining gameplay and tactical consequences.
 * mods: - Numerical modifiers applied within affected systems.
 */

/**
 * GoalTypeDef fields:
 * text: - Callback returning formatted goal objective description.
 * daily: - Minimum and maximum threshold range for daily assignments.
 * weekly: - Minimum and maximum threshold range for weekly assignments.
 */

/**
 * ServerEvent fields:
 * id: - Unique event identifier.
 * [day]: - Day of week (0=Sunday ... 6=Saturday) when this event takes place.
 * name: - Event title.
 * desc: - In-game description of event bonuses and global modifiers.
 * mods: - Active gameplay modifiers during the event window.
 */

/**
 * FactionStoreTier fields:
 * rep: - Minimum reputation required to reach this standing tier.
 * name: - Title designation of the reputation tier.
 */

/**
 * FactionStoreItem fields:
 * id: - Unique item identifier.
 * name: - Display name of the store listing.
 * tokens: - Faction token cost to purchase.
 * credits: - Credit cost component.
 * rep: - Minimum faction reputation prerequisite.
 * give: - Reward payload delivered to player upon purchase.
 */

// ------------------------------------------------------------------ invasions (server-wide bosses)
/**
 * Server-wide world boss fleet flagship definitions.
 */
export const BOSSES: InvasionBoss[] = [
  {
    id: 'leviathan',
    name: 'Umbral Leviathan',
    hull: 764,
    faction: 'umbral',
    mult: 9,
    pool: 2500000,
    minions: [761, 762],
  },
  {
    id: 'dreadfort',
    name: 'Hollow Dreadfort',
    hull: 717,
    faction: 'hollow',
    mult: 7,
    pool: 1500000,
    minions: [708, 711],
  },
];

/**
 * World boss invasion schedule and participation reward thresholds.
 */
export const INVASION: InvasionConfig = { everyMin: 120, lastMin: 45, minShare: 0.02 };

// ------------------------------------------------------------------ anomalies (rotate every 6 hours over 9 systems)
/**
 * System space anomalies altering flight, sensor, and combat parameters.
 */
export const ANOMALIES: Record<string, SpaceAnomaly> = {
  ion: {
    name: 'Ion Storm',
    icon: '⚡',
    color: '#8ad8ff',
    desc: 'Shields recharge 50% slower.',
    mods: { shieldRe: 0.5 },
  },
  nebula: {
    name: 'Dense Nebula',
    icon: '☁',
    color: '#b49aff',
    desc: 'Radar range halved. Raiders lurk.',
    mods: { radar: 0.5, raid: 1.5 },
  },
  solar: {
    name: 'Solar Maximum',
    icon: '☀',
    color: '#ffc04a',
    desc: 'Beam weapons deal 20% more damage.',
    mods: { beam: 1.2 },
  },
  shear: {
    name: 'Gravity Shear',
    icon: '◎',
    color: '#ff8a6a',
    desc: 'Jumping out costs double fuel.',
    mods: { jumpFuel: 2 },
  },
  veins: {
    name: 'Rich Veins',
    icon: '◆',
    color: '#7af0b0',
    desc: 'Mining yields double.',
    mods: { mining: 2 },
  },
  echo: {
    name: 'Quantum Echo',
    icon: '✦',
    color: '#e682fa',
    desc: 'Bounties pay 50% more.',
    mods: { bounty: 1.5 },
  },
};

/**
 * Anomaly rotation cycle length in hours and simultaneous system count.
 */
export const ANOMALY: { hours: number; count: number } = { hours: 6, count: 9 };

// ------------------------------------------------------------------ goals (daily resets 00:00 UTC, weekly on Monday)
/**
 * Daily and weekly goal archetype definitions and target quantity ranges.
 */
export const GOAL_TYPES: Record<string, GoalTypeDef> = {
  kills: {
    text: (count) => `Destroy ${count} pirate or hostile ships`,
    daily: [5, 10],
    weekly: [40, 60],
  },
  jumps: { text: (count) => `Make ${count} hyperspace jumps`, daily: [6, 12], weekly: [50, 80] },
  trade: {
    text: (count) => `Earn ${count.toLocaleString()} credits trading`,
    daily: [20000, 60000],
    weekly: [300000, 600000],
  },
  mined: {
    text: (count) => `Mine ${count} tons of ore, gas or shards`,
    daily: [20, 40],
    weekly: [150, 250],
  },
  shuttles: {
    text: (count) => `Bring home ${count} successful shuttle runs`,
    daily: [2, 3],
    weekly: [12, 18],
  },
  jobs: { text: (count) => `Complete ${count} jobs`, daily: [2, 4], weekly: [15, 25] },
  charted: { text: (count) => `Chart ${count} new systems`, daily: [2, 4], weekly: [10, 15] },
  boarded: { text: (count) => `Board ${count} disabled ships`, daily: [1, 2], weekly: [6, 10] },
};

/**
 * Reward credit and faction token packages granted for completing daily and weekly goals.
 */
export const GOAL_REWARD: Record<string, { credits: number; tokens: number }> = {
  daily: { credits: 15000, tokens: 2 },
  weekly: { credits: 150000, tokens: 12 },
};

// ------------------------------------------------------------------ server events (a weekly calendar, rotating every 2 days)
// a weekly rhythm (after STFC's event days), by UTC weekday, plus a monthly Gold Vein weekend
/**
 * Weekly calendar of repeating server-wide events and active modifiers.
 */
export const EVENTS: ServerEvent[] = [
  {
    id: 'swarm',
    day: 0,
    name: 'Swarm Sunday',
    desc: 'Feral Swarm clusters everywhere they roam, and every swarm kill counts double for chitin and blueprints.',
    mods: { swarm: 3, swarmLoot: 2 },
  },
  {
    id: 'rush',
    day: 1,
    name: "Prospector's Rush",
    desc: 'Mining yields 50% more and rocks regrow twice as fast.',
    mods: { mining: 1.5, regrow: 2 },
  },
  {
    id: 'hangar',
    day: 2,
    name: 'Hangar Days',
    desc: 'Shuttle jobs finish 30% faster and pay 25% more.',
    mods: { shuttleSpeed: 1.3, shuttleYield: 1.25 },
  },
  {
    id: 'bounty',
    day: 3,
    name: 'Bounty Week',
    desc: 'Bounties pay double, and more raiders are out to earn them.',
    mods: { bounty: 2, raid: 1.5 },
  },
  {
    id: 'eclipse',
    day: 4,
    name: 'Umbral Eclipse',
    desc: 'Eclipse cells roam far from Umbral space. Their caches spill Umbral Shards.',
    mods: { eclipse: 2.5 },
  },
  {
    id: 'salvage',
    day: 5,
    name: 'Salvage Night',
    desc: 'Hostiles drop loot chests twice as often, and Armadas earn 50% more bounty together.',
    mods: { chest: 2, armadaBounty: 1.5 },
  }, // replaces Armada Night
  {
    id: 'sweep',
    day: 6,
    name: 'Clean Sweep',
    desc: 'Hostiles drop loot chests 50% more often, and festival markets buy at 15% over.',
    mods: { chest: 1.5, sell: 1.15 },
  },
];

/**
 * Monthly special Gold Vein event active during the first weekend of each month.
 */
export const GOLD_VEIN: ServerEvent = {
  id: 'gold',
  name: 'Gold Vein Weekend',
  desc: 'The first weekend of the month: rich veins everywhere. Mining doubles and Riftore drops twice as often.',
  mods: { mining: 2, riftore: 2 },
};

/**
 * Number of days each server event persists.
 */
export const EVENT_DAYS: number = 1;

// ------------------------------------------------------------------ faction stores (tokens earned from jobs and goals for a faction)
/**
 * Faction store access tiers governed by standing reputation points.
 */
export const STORE_TIERS: FactionStoreTier[] = [
  { rep: 10, name: 'Known' },
  { rep: 30, name: 'Friendly' },
  { rep: 60, name: 'Honored' },
  { rep: EXALTED_STANDING, name: 'Exalted' },
];

/**
 * Goods, contracts, and items available for purchase in faction stores.
 */
export const STORE_ITEMS: FactionStoreItem[] = [
  {
    id: 'crate2',
    name: 'Material crate (grade II)',
    tokens: 6,
    credits: 0,
    rep: 10,
    give: { crate: 1 },
  },
  {
    id: 'crate3',
    name: 'Material crate (grade III)',
    tokens: 14,
    credits: 20000,
    rep: 30,
    give: { crate: 2 },
  },
  {
    id: 'crate4',
    name: 'Material crate (grade IV)',
    tokens: 30,
    credits: 60000,
    rep: 60,
    give: { crate: 3 },
  },
  {
    id: 'rare',
    name: 'Rare officer contract',
    tokens: 25,
    credits: 50000,
    rep: 30,
    give: { officer: 2 },
  },
  {
    id: 'epic',
    name: 'Epic officer contract',
    tokens: 70,
    credits: 250000,
    rep: EXALTED_STANDING,
    give: { officer: 3 },
  },
  {
    id: 'xp',
    name: 'Bridge training manuals',
    tokens: 10,
    credits: 10000,
    rep: 10,
    give: { xp: 400 },
  },
  {
    id: 'writ',
    name: 'Free-passage writ (+10 standing)',
    tokens: 12,
    credits: 0,
    rep: 0,
    give: { rep: 10 },
  },
];

// which crate material each power favours in its store
/**
 * Mapping of faction ID to the preferred raw material type stocked in their stores.
 */
export const STORE_MAT: Record<string, string> = {
  quantum: 'alloy',
  spacer: 'alloy',
  lamp: 'isotope',
  hollow: 'alloy',
  quevari: 'crystal',
  vashari: 'alloy',
  korrund: 'alloy',
  ylith: 'crystal',
  sarn: 'isotope',
  thalassi: 'isotope',
};

// ------------------------------------------------------------------ expanded jobs
/**
 * Supported freelance job archetype classifications.
 */
export const JOB_KINDS: string[] = [
  'cargo',
  'bounty',
  'patrol',
  'convoy',
  'smuggle',
  'rescue',
  'survey',
  'assassinate',
];

/**
 * Maximum steps in multi-stage progressive faction job chains.
 */
export const CHAIN_STEPS: number = 3; // faction job chains: three steps, each pays more

/**
 * Security patrol scanner configuration parameters for contraband interception.
 */
export const SCAN: { range: number; chance: number; fine: number; cooldown: number } = {
  range: 320,
  chance: 0.35,
  fine: 0.25,
  cooldown: 25,
}; // patrol scans of smugglers in lawful space

// ------------------------------------------------------------------ helpers (deterministic, shared)

// anomalies for the current 6-hour window, deterministic from the time: { systemId: anomalyId }
/**
 * Calculates deterministic system anomaly placements for the active 6-hour time window.
 * @param systems - Star systems array.
 * @param currentTime - Current epoch timestamp in milliseconds.
 * @returns Mapping of system ID to anomaly ID.
 */
export function anomaliesAt(
  systems: Array<{ id: string; faction?: string; farside?: boolean }>,
  currentTime: number = Date.now(),
): Record<string, string> {
  const window = Math.floor(currentTime / (ANOMALY.hours * 3600000)),
    radius = randomGenerator(0xa11 + window * 7919),
    result: Record<string, string> = {};
  const pool = systems.filter(
      (state) => state.faction !== 'quantum' && state.id !== 'qgate' && !state.farside,
    ),
    kinds = Object.keys(ANOMALIES);
  for (let index = 0; index < ANOMALY.count && pool.length; index++) {
    const splice2 = pool.splice(Math.floor(radius() * pool.length), 1)[0];
    result[splice2.id] = kinds[Math.floor(radius() * kinds.length)];
  }
  return result;
}

/**
 * Resolves the active server event corresponding to a given timestamp.
 * @param currentTime - Epoch timestamp in milliseconds.
 * @returns Active server event or monthly Gold Vein event.
 */
export function eventAt(currentTime: number = Date.now()): ServerEvent | undefined {
  const date = new Date(currentTime),
    utcDay = date.getUTCDay(),
    utcDate = date.getUTCDate();
  if ((utcDay === 6 && utcDate <= 7) || (utcDay === 0 && utcDate <= 8 && utcDate >= 2))
    return GOLD_VEIN; // the first full weekend of the month
  return EVENTS.find((serverEvent) => serverEvent.day === utcDay);
}

/**
 * Computes scheduled server events spanning n consecutive days from a starting timestamp.
 * @param currentTime - Epoch timestamp in milliseconds.
 * @param count - Number of days to include in the schedule.
 * @returns Array of scheduled event windows with start and end timestamps.
 */
export function eventCalendar(
  currentTime: number = Date.now(),
  count: number = 7,
): ScheduledEvent[] {
  const result = [],
    day0 = Math.floor(currentTime / 86400000);
  for (let index = 0; index < count; index++) {
    const time = (day0 + index) * 86400000;
    result.push({ ...eventAt(time + 3600000), start: time, end: time + 86400000 });
  }
  return result;
}

/**
 * Computes the epoch day index for UTC day boundaries.
 * @param currentTime - Epoch timestamp in milliseconds.
 * @returns Day index number.
 */
export function dayKey(currentTime: number = Date.now()): number {
  return Math.floor(currentTime / 86400000);
}

/**
 * Computes the epoch week index (starting Monday 00:00 UTC).
 * @param currentTime - Epoch timestamp in milliseconds.
 * @returns Week index number.
 */
export function weekKey(currentTime: number = Date.now()): number {
  return Math.floor((currentTime / 86400000 + 3) / 7);
} // weeks start Monday 00:00 UTC
