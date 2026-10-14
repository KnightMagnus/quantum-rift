// Quantum Rift 0.7 "Frontier Life" data: planetary colonies, station defense, ship mastery, the arena, the player
// exchange and leaderboards. Shared by server and client.

// ------------------------------------------------------------------ planetary colonies (unsettled planets in Frontier and the Deep)
export const COLONY = { max: 2, maxAtOps5: 3, cost: 400000, mats: [['alloy', 1, 2], ['isotope', 0, 1]], storeHours: 24 };
export const COLONY_LEVELS = [   // level -> building slots, production multiplier, upgrade cost
  null,
  { slots: 2, mult: 1.0 },
  { slots: 3, mult: 1.25, cost: 350000, mats: [['alloy', 2, 1], ['crystal', 1, 1]] },
  { slots: 4, mult: 1.5, cost: 800000, mats: [['alloy', 3, 1], ['crystal', 2, 1]] },
  { slots: 5, mult: 1.8, cost: 1600000, mats: [['alloy', 3, 2], ['crystal', 3, 1], ['isotope', 2, 1]] },
  { slots: 6, mult: 2.2, cost: 3000000, mats: [['alloy', 4, 1], ['crystal', 3, 2], ['isotope', 3, 1]] },
];
// produce: commodity tons per hour (or credits per hour); buff: permanent ship bonus while you own the building (capped per stat)
export const BUILDINGS = {
  farm:     { name: 'Hydroponic Farms',  cost: 120000, produce: { food: 6 },        desc: 'Grows food for the frontier markets.' },
  mine:     { name: 'Deep Mine',         cost: 160000, produce: { ore: 5 },         desc: 'Raw ore, ready for your station refinery.' },
  gas:      { name: 'Gas Extractor',     cost: 160000, produce: { gas: 5 },         desc: 'Volatile gas from the planet\'s crust.' },
  crystal:  { name: 'Crystal Works',     cost: 220000, produce: { shards: 3 },      desc: 'Grows crystal shards in pressure vats.' },
  habitat:  { name: 'Habitat Dome',      cost: 200000, produce: { credits: 2500 },  desc: 'Settlers pay rent: credits every hour.' },
  foundry:  { name: 'Orbital Foundry',   cost: 300000, produce: { industrial: 4 },  desc: 'Industrial goods for export.' },
  shieldgen:{ name: 'Shield Array',      cost: 450000, buff: { shieldPct: 3 },      desc: 'Permanent +3% shields on every ship you fly.' },
  yards:    { name: 'Hull Yards',        cost: 450000, buff: { armorPct: 3 },       desc: 'Permanent +3% armor on every ship you fly.' },
  academy:  { name: 'Gunnery Range',     cost: 500000, buff: { damagePct: 2 },      desc: 'Permanent +2% weapon damage.' },
  beacon:   { name: 'Nav Beacon',        cost: 350000, buff: { speedPct: 2, fuel: 50 }, desc: 'Permanent +2% speed and +50 fuel.' },
};
export const BUFF_CAP = { shieldPct: 9, armorPct: 9, damagePct: 6, speedPct: 6, fuel: 150 };

// ------------------------------------------------------------------ station defense: raids on Personal Stations
export const DEFENSE = {
  everyH: 8, minOps: 2,
  levels: [   // defense level -> rating and upgrade cost
    { rating: 0 }, { rating: 180, cost: 80000, mats: [['alloy', 0, 2]] }, { rating: 380, cost: 220000, mats: [['alloy', 1, 2]] },
    { rating: 650, cost: 500000, mats: [['alloy', 2, 2], ['crystal', 1, 1]] }, { rating: 1000, cost: 1000000, mats: [['alloy', 3, 2], ['crystal', 2, 1]] },
    { rating: 1500, cost: 2000000, mats: [['alloy', 4, 1], ['crystal', 3, 1], ['isotope', 2, 1]] },
  ],
  opsRating: 120, gridBonus: 400,   // per Ops level, and the Ops 5 Defense Grid
  waveMin: 4,                        // live waves last up to four minutes
};

// ------------------------------------------------------------------ ship mastery (per hull)
export const MASTERY = {
  tiers: [0, 300, 1000, 2500, 6000],   // xp to reach tiers 1-5
  bonus: [{}, {}, { shieldPct: 5, armorPct: 5 }, { shieldPct: 5, armorPct: 5, damagePct: 5 }, { shieldPct: 5, armorPct: 5, damagePct: 5, speedPct: 5, turnPct: 5 },
          { shieldPct: 10, armorPct: 10, damagePct: 8, speedPct: 6, turnPct: 8 }],
  xp: { kill: 1 / 8, jump: 3, job: 15, mined: 0.3 },
};
export function masteryTier(xp) { let t = 1; for (let i = 1; i < MASTERY.tiers.length; i++) if (xp >= MASTERY.tiers[i]) t = i + 1; return t; }

// ------------------------------------------------------------------ the arena: instanced, rated PvP away from the open galaxy
export const ARENA = { modes: { '1v1': 1, '2v2': 2, '4v4': 4 }, matchMin: 5, k: 32, start: 1000, size: 1600 };
export function arenaSystem(id) {   // a stand-in system for an arena instance (registered on demand on both server and client)
  return { id, name: 'The Crucible', faction: 'quantum', x: 0, y: 0, links: [], danger: 9, stellars: [], fields: [], arena: true };
}
export function elo(ra, rb, aWon, k = ARENA.k) { const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400)); return Math.round(k * ((aWon ? 1 : 0) - ea)); }

// ------------------------------------------------------------------ the exchange (player market)
export const EXCHANGE = { fee: 0.02, maxOrders: 12, maxPrice: 1e9 };

// ------------------------------------------------------------------ leaderboards
export const BOARDS = {
  earned: { name: 'Credits earned' }, kills: { name: 'Ships destroyed' }, mined: { name: 'Tons mined' }, arena: { name: 'Arena rating' },
  station: { name: 'Station Ops' }, colonies: { name: 'Colonies' }, mastery: { name: 'Mastery' },
};
