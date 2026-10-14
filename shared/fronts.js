// Quantum Rift 0.6 "Fleets and Fronts" data: fleets, territory and Dreadnoughts, invasions, anomalies, goals,
// server events and faction stores. Shared by server and client.

// ------------------------------------------------------------------ fleets
export const FLEET = { createCost: 50000, maxMembers: 30, tagRe: /^[A-Z0-9]{2,4}$/, nameRe: /^[A-Za-z0-9 '\-]{3,24}$/, shareBounty: 0.25 };

// ------------------------------------------------------------------ territory: fleets anchor a Dreadnought in a Frontier system
export const DREADNOUGHTS = [
  { hull: 750, name: 'Bastion Dreadnought', cost: 6000000 },
  { hull: 774, name: 'Mountain Dreadnought', cost: 9000000 },
  { hull: 789, name: 'Stagback Dreadnought', cost: 9000000 },
  { hull: 795, name: 'Spire Dreadnought', cost: 11000000 },
];
export const DREAD_MULT = 6;           // shield and armor multiplier for an anchored Dreadnought
export const CLAIM = { maxPerFleet: 3, taxPct: 5, buff: { damagePct: 8, shieldPct: 8 }, repairPerHour: 0.08, cooldownH: 12 };
// Dreadnoughts can only be damaged during the daily front window (UTC hours). FRONT_HOURS=start-end overrides it.
export const FRONT_HOURS = [19, 21];

// ------------------------------------------------------------------ invasions (server-wide bosses)
export const BOSSES = [
  { id: 'leviathan', name: 'Umbral Leviathan', hull: 764, faction: 'umbral', mult: 9, pool: 2500000, minions: [761, 762] },
  { id: 'dreadfort', name: 'Hollow Dreadfort', hull: 717, faction: 'hollow', mult: 7, pool: 1500000, minions: [708, 711] },
];
export const INVASION = { everyMin: 120, lastMin: 45, minShare: 0.02 };

// ------------------------------------------------------------------ anomalies (rotate every 6 hours over 9 systems)
export const ANOMALIES = {
  ion:     { name: 'Ion Storm',       icon: '⚡', color: '#8ad8ff', desc: 'Shields recharge 50% slower.', mods: { shieldRe: 0.5 } },
  nebula:  { name: 'Dense Nebula',    icon: '☁', color: '#b49aff', desc: 'Radar range halved. Raiders lurk.', mods: { radar: 0.5, raid: 1.5 } },
  solar:   { name: 'Solar Maximum',   icon: '☀', color: '#ffc04a', desc: 'Beam weapons deal 20% more damage.', mods: { beam: 1.2 } },
  shear:   { name: 'Gravity Shear',   icon: '◎', color: '#ff8a6a', desc: 'Jumping out costs double fuel.', mods: { jumpFuel: 2 } },
  veins:   { name: 'Rich Veins',      icon: '◆', color: '#7af0b0', desc: 'Mining yields double.', mods: { mining: 2 } },
  echo:    { name: 'Quantum Echo',    icon: '✦', color: '#e682fa', desc: 'Bounties pay 50% more.', mods: { bounty: 1.5 } },
};
export const ANOMALY = { hours: 6, count: 9 };

// ------------------------------------------------------------------ goals (daily resets 00:00 UTC, weekly on Monday)
export const GOAL_TYPES = {
  kills:    { text: (n) => `Destroy ${n} pirate or hostile ships`, daily: [5, 10], weekly: [40, 60] },
  jumps:    { text: (n) => `Make ${n} hyperspace jumps`, daily: [6, 12], weekly: [50, 80] },
  trade:    { text: (n) => `Earn ${n.toLocaleString()} credits trading`, daily: [20000, 60000], weekly: [300000, 600000] },
  mined:    { text: (n) => `Mine ${n} tons of ore, gas or shards`, daily: [20, 40], weekly: [150, 250] },
  shuttles: { text: (n) => `Bring home ${n} successful shuttle runs`, daily: [2, 3], weekly: [12, 18] },
  jobs:     { text: (n) => `Complete ${n} jobs`, daily: [2, 4], weekly: [15, 25] },
  charted:  { text: (n) => `Chart ${n} new systems`, daily: [2, 4], weekly: [10, 15] },
  boarded:  { text: (n) => `Board ${n} disabled ships`, daily: [1, 2], weekly: [6, 10] },
};
export const GOAL_REWARD = { daily: { credits: 15000, tokens: 2 }, weekly: { credits: 150000, tokens: 12 } };

// ------------------------------------------------------------------ server events (a weekly calendar, rotating every 2 days)
// 0.9: a weekly rhythm (after STFC's event days), by UTC weekday, plus a monthly Gold Vein weekend
export const EVENTS = [
  { id: 'swarm', day: 0, name: 'Swarm Sunday', desc: 'Feral Swarm clusters everywhere they roam, and every swarm kill counts double for chitin and blueprints.', mods: { swarm: 3, swarmLoot: 2 } },
  { id: 'rush', day: 1, name: "Prospector's Rush", desc: 'Mining yields 50% more and rocks regrow twice as fast.', mods: { mining: 1.5, regrow: 2 } },
  { id: 'hangar', day: 2, name: 'Hangar Days', desc: 'Shuttle jobs finish 30% faster and pay 25% more.', mods: { shuttleSpeed: 1.3, shuttleYield: 1.25 } },
  { id: 'bounty', day: 3, name: 'Bounty Week', desc: 'Bounties pay double, and more raiders are out to earn them.', mods: { bounty: 2, raid: 1.5 } },
  { id: 'eclipse', day: 4, name: 'Umbral Eclipse', desc: 'Eclipse cells roam far from Umbral space. Their caches spill Umbral Shards and directives.', mods: { eclipse: 2.5 } },
  { id: 'armada', day: 5, name: 'Armada Night', desc: 'Directives drop twice as often, and armadas pay 50% more.', mods: { directive: 2, armada: 1.5 } },
  { id: 'sweep', day: 6, name: 'Clean Sweep', desc: 'Hostiles drop loot chests 50% more often, and festival markets buy at 15% over.', mods: { chest: 1.5, sell: 1.15 } },
];
export const GOLD_VEIN = { id: 'gold', name: 'Gold Vein Weekend', desc: 'The first weekend of the month: rich veins everywhere. Mining doubles and Riftore drops twice as often.', mods: { mining: 2, riftore: 2 } };
export const EVENT_DAYS = 1;

// ------------------------------------------------------------------ faction stores (tokens earned from jobs and goals for a faction)
export const STORE_TIERS = [{ rep: 10, name: 'Known' }, { rep: 30, name: 'Friendly' }, { rep: 60, name: 'Honored' }, { rep: 90, name: 'Exalted' }];
export const STORE_ITEMS = [
  { id: 'crate2', name: 'Material crate (grade II)', tokens: 6, credits: 0, rep: 10, give: { crate: 1 } },
  { id: 'crate3', name: 'Material crate (grade III)', tokens: 14, credits: 20000, rep: 30, give: { crate: 2 } },
  { id: 'crate4', name: 'Material crate (grade IV)', tokens: 30, credits: 60000, rep: 60, give: { crate: 3 } },
  { id: 'rare', name: 'Rare officer contract', tokens: 25, credits: 50000, rep: 30, give: { officer: 2 } },
  { id: 'epic', name: 'Epic officer contract', tokens: 70, credits: 250000, rep: 90, give: { officer: 3 } },
  { id: 'xp', name: 'Bridge training manuals', tokens: 10, credits: 10000, rep: 10, give: { xp: 400 } },
  { id: 'writ', name: 'Free-passage writ (+10 standing)', tokens: 12, credits: 0, rep: 0, give: { rep: 10 } },
  { id: 'dir1', name: 'Hollow Directive (summons a tier 1 armada)', tokens: 15, credits: 20000, rep: 30, give: { directive: 1 } },
  { id: 'dir2', name: 'Umbral Directive (summons a tier 2 armada)', tokens: 35, credits: 80000, rep: 60, give: { directive: 2 } },
];
// which crate material each power favours in its store
export const STORE_MAT = { quantum: 'alloy', spacer: 'alloy', lamp: 'isotope', hollow: 'alloy', quevari: 'crystal', vashari: 'alloy', korrund: 'alloy', ylith: 'crystal', sarn: 'isotope', thalassi: 'isotope' };

// ------------------------------------------------------------------ expanded jobs
export const JOB_KINDS = ['cargo', 'bounty', 'patrol', 'convoy', 'smuggle', 'rescue', 'survey', 'assassinate'];
export const CHAIN_STEPS = 3;   // faction job chains: three steps, each pays more
export const SCAN = { range: 320, chance: 0.35, fine: 0.25, cooldown: 25 };   // patrol scans of smugglers in lawful space

// ------------------------------------------------------------------ helpers (deterministic, shared)
export function frontWindowOpen(now = Date.now(), hours = FRONT_HOURS) {
  const h = new Date(now).getUTCHours(); return hours[0] <= hours[1] ? h >= hours[0] && h < hours[1] : h >= hours[0] || h < hours[1];
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
// anomalies for the current 6-hour window, deterministic from the time: { systemId: anomalyId }
export function anomaliesAt(systems, now = Date.now()) {
  const win = Math.floor(now / (ANOMALY.hours * 3600000)), r = rng(0xA11 + win * 7919), out = {};
  const pool = systems.filter(s => s.faction !== 'quantum' && s.id !== 'qgate' && !s.farside), kinds = Object.keys(ANOMALIES);
  for (let i = 0; i < ANOMALY.count && pool.length; i++) { const s = pool.splice(Math.floor(r() * pool.length), 1)[0]; out[s.id] = kinds[Math.floor(r() * kinds.length)]; }
  return out;
}
export function eventAt(now = Date.now()) {
  const d = new Date(now), wd = d.getUTCDay(), md = d.getUTCDate();
  if ((wd === 6 && md <= 7) || (wd === 0 && md <= 8 && md >= 2)) return GOLD_VEIN;   // the first full weekend of the month
  return EVENTS.find(e => e.day === wd);
}
export function eventCalendar(now = Date.now(), n = 7) {
  const out = [], day0 = Math.floor(now / 86400000);
  for (let i = 0; i < n; i++) { const t = (day0 + i) * 86400000; out.push({ ...eventAt(t + 3600000), start: t, end: t + 86400000 }); }
  return out;
}
export function dayKey(now = Date.now()) { return Math.floor(now / 86400000); }
export function weekKey(now = Date.now()) { return Math.floor((now / 86400000 + 3) / 7); }   // weeks start Monday 00:00 UTC
