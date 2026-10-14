// Quantum Rift 0.5 "Hangar Deck" data: shuttles, officers, research trees, refining and the drydock.
// Shared by the server (rules) and the client (display).

// ------------------------------------------------------------------ shuttles
// Shuttles launch from your Personal Station on timed jobs that run in real time, even while you are offline.
export const SHUTTLES = {
  courier:    { name: 'Courier Shuttle',    hull: 703, cost: 40000,  mats: [['alloy', 0, 1]],                    ops: 2, speed: 1.35, armor: 1, desc: 'Fast and light. Best at delivery runs.' },
  survey:     { name: 'Survey Shuttle',     hull: 705, cost: 70000,  mats: [['crystal', 0, 1]],                  ops: 2, speed: 1.15, armor: 1, desc: 'Long-range sensors. Charts systems and finds rich fields and anomalies.' },
  salvage:    { name: 'Salvage Tender',     hull: 706, cost: 110000, mats: [['alloy', 1, 1]],                    ops: 3, speed: 0.9,  armor: 3, desc: 'Armored grapples. Strips battle sites and wrecks for crates.' },
  envoy:      { name: 'Envoy Yacht',        hull: 707, cost: 140000, mats: [['crystal', 1, 1]],                  ops: 3, speed: 1.0,  armor: 2, desc: 'Diplomatic transport. Earns standing with the powers it visits.' },
  prospector: { name: 'Prospector Hauler',  hull: 704, cost: 220000, mats: [['isotope', 1, 1], ['alloy', 2, 1]], ops: 4, speed: 0.85, armor: 2, desc: 'Deep-core rigs. Brings back rare high-grade material.' },
};
export const SHUTTLE_KINDS = Object.keys(SHUTTLES);
export const BAYS_BY_OPS = [0, 0, 1, 2, 3, 4];   // hangar bays per Ops level (research adds more)
// Job types posted on the hangar board. `fit` is the shuttle kind that does the job best.
export const SHUTTLE_JOBS = {
  delivery: { name: 'Delivery Run',    fit: 'courier',    verbs: ['Deliver medical stock to', 'Run spare parts out to', 'Carry sealed mail to', 'Rush a reactor coupling to'], base: 0.9 },
  survey:   { name: 'Survey',          fit: 'survey',     verbs: ['Chart the outer bodies of', 'Run a deep scan of', 'Map the lanes around', 'Sound the gravity wells of'], base: 0.85 },
  salvage:  { name: 'Salvage',         fit: 'salvage',    verbs: ['Strip the battle site at', 'Recover a lost freighter in', 'Tow wreckage out of', 'Pick over the debris field in'], base: 0.8 },
  envoy:    { name: 'Diplomatic Visit', fit: 'envoy',     verbs: ['Carry greetings to the governor of', 'Ferry trade delegates to', 'Present gifts at', 'Negotiate landing rights in'], base: 0.85 },
  prospect: { name: 'Prospecting',     fit: 'prospector', verbs: ['Core-sample the asteroids of', 'Drill the ice moons of', 'Sift the crystal beds of', 'Tap the gas pockets of'], base: 0.75 },
};
export const SHUTTLE_REPAIR = 0.25;   // repair costs this share of the shuttle's price
export const JOB_WINDOW_H = 3;        // the hangar board refreshes every 3 hours

// ------------------------------------------------------------------ officers
export const ROLES = {
  captain:      { name: 'Captain',      stats: ['damagePct', 'shieldPct', 'armorPct'], desc: 'Command presence: boosts the whole ship.' },
  engineer:     { name: 'Engineer',     stats: ['shieldRePct', 'armorPct', 'speedPct'] },
  gunner:       { name: 'Gunner',       stats: ['damagePct'] },
  navigator:    { name: 'Navigator',    stats: ['turnPct', 'accelPct', 'fuel'] },
  quartermaster:{ name: 'Quartermaster', stats: ['cargoPct', 'lootPct'] },
  scout:        { name: 'Scout',        stats: ['shuttlePct', 'miningPct'] },
};
// value of each stat at level 1 for a common officer; rarity multiplies, each level adds 10%
export const STAT_BASE = { damagePct: 4, shieldPct: 4, armorPct: 4, shieldRePct: 8, speedPct: 3, turnPct: 6, accelPct: 6, fuel: 60, cargoPct: 8, lootPct: 10, shuttlePct: 6, miningPct: 12 };
export const STAT_NAME = { damagePct: 'weapon damage', shieldPct: 'shields', armorPct: 'armor', shieldRePct: 'shield recharge', speedPct: 'top speed', turnPct: 'turn rate',
  accelPct: 'acceleration', fuel: 'fuel', cargoPct: 'cargo space', lootPct: 'salvage and bounty pay', shuttlePct: 'shuttle success', miningPct: 'mining yield' };
export const RARITY = [
  { name: 'Common', mult: 1, color: '#b8bcc6', cost: 8000 },
  { name: 'Uncommon', mult: 1.4, color: '#7ad07a', cost: 25000 },
  { name: 'Rare', mult: 1.9, color: '#6ab0ff', cost: 70000 },
  { name: 'Epic', mult: 2.6, color: '#d88aff', cost: 200000 },
];
// each race favours certain roles and gives a race synergy when two or more of them share a bridge
export const RACE_ROLES = {
  quantum: ['captain', 'engineer', 'navigator'], spacer: ['quartermaster', 'navigator', 'engineer'], lamp: ['scout', 'engineer'], hollow: ['gunner', 'quartermaster'],
  quevari: ['navigator', 'scout'], vashari: ['gunner', 'scout'], korrund: ['engineer', 'gunner'], ylith: ['scout', 'captain'], sarn: ['quartermaster', 'navigator'], thalassi: ['engineer', 'captain'],
};
export const SYNERGY = {   // two or more of the same race on the bridge
  quantum: { shieldPct: 5 }, spacer: { cargoPct: 10 }, lamp: { fuel: 100 }, hollow: { lootPct: 15 }, quevari: { turnPct: 8 }, vashari: { damagePct: 5 },
  korrund: { armorPct: 6 }, ylith: { shuttlePct: 8 }, sarn: { lootPct: 10 }, thalassi: { shieldRePct: 12 },
};
export const OFFICER_NAMES = {
  quantum: [['Ada', 'Mira', 'Tomas', 'Iris', 'Corin', 'Selene', 'Hal', 'Juno', 'Rhea', 'Dorian'], ['Vance', 'Okafor', 'Lindqvist', 'Marlow', 'Ishikawa', 'Reyes', 'Castell', 'Petrov', 'Adeyemi', 'Wren']],
  spacer: [['Mags', 'Tully', 'Bram', 'Nell', 'Ozzie', 'Fen', 'Rosa', 'Kit', 'Abe', 'Dot'], ['Haulway', 'Rivet', 'Longstride', 'Copperfield', 'Gale', 'Barrow', 'Saltmarsh', 'Kettle']],
  lamp: [['Wick', 'Ember', 'Taper', 'Lux', 'Solenne', 'Vigil', 'Ash', 'Glim'], ['Brightwater', 'Hearthkeep', 'Candlemas', 'Lanternholm', 'Dawnward']],
  hollow: [['Rook', 'Shiv', 'Vex', 'Cutter', 'Maw', 'Jinx', 'Scab', 'Hex'], ['Gallows', 'Blackbilge', 'Rustjaw', 'Nine-Fingers', 'Graves', 'the Knife']],
  quevari: [['Ila', 'Shae', 'Oru', 'Velin', 'Amae', 'Seithe'], ['of the Pale Sail', 'of First Light', 'Lumenward', 'of the Shoal']],
  vashari: [['Kss', 'Thrix', 'Zzerel', 'Chitka', 'Vrrin', 'Ixa'], ['of Broodhollow', 'Wingsworn', 'Thrumm', 'Clutchborn']],
  korrund: [['Brakka', 'Dunmor', 'Grisk', 'Holda', 'Krag', 'Morrow'], ['Anvilhand', 'Slagborn', 'Deepdelve', 'Ironcairn', 'Basaltson']],
  ylith: [['Prism', 'Chime', 'Opaline', 'Facet', 'Lyre', 'Spar'], ['of the Seventh Chord', 'Resonant', 'Quartzsong', 'of Facetfall']],
  sarn: [['Tassel', 'Oke', 'Darrow', 'Saffa', 'Bel', 'Yusri'], ['Spokewright', 'of the Long Road', 'Dunecaller', 'Brassbell']],
  thalassi: [['Coralie', 'Ebb', 'Nerys', 'Pelagia', 'Tethys', 'Marin'], ['Deepcurrent', 'of the Reef', 'Brinesong', 'Tidewarden']],
};
export const BRIDGE_SLOTS = ['captain', 'bridge1', 'bridge2'];
export const ROSTER_MAX = 24;   // 2.1: room for wingmate captains and crews
export const XP_LEVEL = (lv) => 100 * lv * lv;   // xp needed to reach the next level
export const MAX_LEVEL = 10;

// ------------------------------------------------------------------ research trees (replaces the single 0.2 list)
// `needs` chains the nodes. Queueing a node queues its unfinished prerequisites first (STFC-style bulk research).
export const RESEARCH_TREES = ['Combat', 'Station', 'Galaxy', 'Shuttles'];
export const RESEARCH2 = [
  // Combat
  { id: 'shield1', tree: 'Combat', name: 'Shield Harmonics I', cost: 40000, mats: [['crystal', 0, 1]], minutes: 20, ops: 2, bonus: { shieldPct: 10 } },
  { id: 'shield2', tree: 'Combat', name: 'Shield Harmonics II', cost: 120000, mats: [['crystal', 2, 1]], minutes: 60, ops: 3, needs: 'shield1', bonus: { shieldPct: 10 } },
  { id: 'shield3', tree: 'Combat', name: 'Shield Harmonics III', cost: 380000, mats: [['crystal', 3, 1], ['isotope', 2, 1]], minutes: 150, ops: 5, needs: 'shield2', bonus: { shieldPct: 12, shieldRePct: 10 } },
  { id: 'hull1', tree: 'Combat', name: 'Hull Weave I', cost: 40000, mats: [['alloy', 0, 1]], minutes: 20, ops: 2, bonus: { armorPct: 10 } },
  { id: 'hull2', tree: 'Combat', name: 'Hull Weave II', cost: 120000, mats: [['alloy', 2, 1]], minutes: 60, ops: 3, needs: 'hull1', bonus: { armorPct: 10 } },
  { id: 'hull3', tree: 'Combat', name: 'Hull Weave III', cost: 380000, mats: [['alloy', 3, 1], ['isotope', 2, 1]], minutes: 150, ops: 5, needs: 'hull2', bonus: { armorPct: 12 } },
  { id: 'gunnery', tree: 'Combat', name: 'Gunnery Drills', cost: 150000, mats: [['isotope', 1, 1]], minutes: 60, ops: 4, bonus: { damagePct: 10 } },
  { id: 'gunnery2', tree: 'Combat', name: 'Fire Control Matrix', cost: 420000, mats: [['isotope', 3, 1], ['crystal', 2, 1]], minutes: 180, ops: 5, needs: 'gunnery', bonus: { damagePct: 10 } },
  { id: 'thrusters', tree: 'Combat', name: 'Vectored Thrusters', cost: 90000, mats: [['alloy', 1, 1]], minutes: 40, ops: 3, bonus: { turnPct: 10, accelPct: 10 } },
  // Station
  { id: 'silo', tree: 'Station', name: 'Silo Expansion', cost: 60000, mats: [['alloy', 1, 1]], minutes: 30, ops: 2, bonus: { silo: 3 } },
  { id: 'silo2', tree: 'Station', name: 'Deep Silos', cost: 200000, mats: [['alloy', 2, 1], ['crystal', 1, 1]], minutes: 90, ops: 4, needs: 'silo', bonus: { silo: 3 } },
  { id: 'refine1', tree: 'Station', name: 'Refinery Catalysts', cost: 90000, mats: [['isotope', 0, 1]], minutes: 40, ops: 2, bonus: { refineSpeed: 20 } },
  { id: 'refine2', tree: 'Station', name: 'Plasma Smelting', cost: 260000, mats: [['isotope', 2, 1]], minutes: 120, ops: 4, needs: 'refine1', bonus: { refineSpeed: 25, refineGrade: 1 } },
  { id: 'process', tree: 'Station', name: 'Ore Assay Lab', cost: 160000, mats: [['crystal', 1, 1]], minutes: 60, ops: 3, bonus: { processGrade: 1 } },
  { id: 'drydock', tree: 'Station', name: 'Drydock Annex', cost: 240000, mats: [['alloy', 3, 1]], minutes: 120, ops: 4, bonus: { dockSlots: 2 } },
  // Galaxy
  { id: 'drive', tree: 'Galaxy', name: 'Drive Efficiency', cost: 80000, mats: [['isotope', 0, 1]], minutes: 30, ops: 2, bonus: { speedPct: 5, fuel: 100 } },
  { id: 'scoop', tree: 'Galaxy', name: 'Fuel Scoops', cost: 140000, mats: [['isotope', 1, 1]], minutes: 60, ops: 3, needs: 'drive', bonus: { fuelRe: 1 } },
  { id: 'warpcal', tree: 'Galaxy', name: 'Warp Core Calibration', cost: 150000, mats: [['isotope', 1, 1]], minutes: 90, ops: 4, bonus: { jumpFast: 1 } },
  { id: 'holds', tree: 'Galaxy', name: 'Compressed Holds', cost: 110000, mats: [['alloy', 1, 1]], minutes: 45, ops: 3, bonus: { cargoPct: 15 } },
  { id: 'mining1', tree: 'Galaxy', name: 'Resonant Cutters', cost: 70000, mats: [['crystal', 0, 1]], minutes: 30, ops: 2, bonus: { miningPct: 25 } },
  { id: 'mining2', tree: 'Galaxy', name: 'Core Fracturing', cost: 230000, mats: [['crystal', 2, 1]], minutes: 100, ops: 4, needs: 'mining1', bonus: { miningPct: 35 } },
  { id: 'salvage', tree: 'Galaxy', name: 'Salvage Protocols', cost: 120000, mats: [['alloy', 1, 1]], minutes: 50, ops: 3, bonus: { lootPct: 20 } },
  // Shuttles
  { id: 'bay1', tree: 'Shuttles', name: 'Hangar Bay Extension', cost: 120000, mats: [['alloy', 1, 1]], minutes: 45, ops: 2, bonus: { bays: 1 } },
  { id: 'bay2', tree: 'Shuttles', name: 'Second Launch Deck', cost: 400000, mats: [['alloy', 3, 1], ['crystal', 2, 1]], minutes: 160, ops: 5, needs: 'bay1', bonus: { bays: 1 } },
  { id: 'sh_speed', tree: 'Shuttles', name: 'Shuttle Drive Tuning', cost: 80000, mats: [['isotope', 0, 1]], minutes: 30, ops: 2, bonus: { shuttleSpeed: 20 } },
  { id: 'sh_armor', tree: 'Shuttles', name: 'Shuttle Ablative Plating', cost: 110000, mats: [['alloy', 1, 1]], minutes: 45, ops: 3, needs: 'sh_speed', bonus: { shuttleSafe: 40 } },
  { id: 'sh_yield', tree: 'Shuttles', name: 'Cargo Grapples', cost: 180000, mats: [['crystal', 1, 1]], minutes: 70, ops: 3, bonus: { shuttleYield: 25 } },
  { id: 'sh_crew', tree: 'Shuttles', name: 'Crew Academy', cost: 220000, mats: [['crystal', 2, 1]], minutes: 90, ops: 4, needs: 'sh_yield', bonus: { shuttlePct: 8, officerXp: 50 } },
];
export const RESEARCH_QUEUE_MAX = 6;

// ------------------------------------------------------------------ refining (combine crates up a grade)
export const REFINE_UP = { need: 3, cost: [4000, 12000, 30000, 70000] };   // 3 crates of grade g + cost[g] -> 1 crate of grade g+1

// ------------------------------------------------------------------ drydock
export const DOCK_BY_OPS = [0, 0, 0, 2, 3, 4];   // stored ships per Ops level (research adds more)
export const CAPTURE_SELL = 0.25;                // a captured hull with no free berth is sold for this share
