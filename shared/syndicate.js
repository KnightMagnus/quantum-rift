import { passengerSeats } from './passengers.js';
// 1.2 "Syndicate and Officers": the Syndicate crime path and black market, officer ranks and traits, lower-deck crew,
// the bank (after Endless Sky's mortgages), and passenger and rush jobs.

/**
 * @typedef {Object} SyndicateTierInfo
 * @property {number} i - Tier index (0-5).
 * @property {string} name - Tier title name.
 * @property {number} pts - Current standing points.
 * @property {number|null} next - Points required for the next tier, or null if maximum tier reached.
 */

/**
 * @typedef {Object} BlackMarketItem
 * @property {string} id - Unique item identifier.
 * @property {number} tier - Minimum Syndicate tier required to purchase.
 * @property {string} name - Display name of the item or bundle.
 * @property {number} price - Purchase cost in credits.
 * @property {string} desc - In-game description of item utility.
 * @property {Record<string, number | string | boolean>} give - Reward payload granted upon purchase (e.g. papers, shards, bp, parts, crate).
 */

/**
 * @typedef {Object} OfficerPromotionCost
 * @property {number} shards - Commendation shards required.
 * @property {number} credits - Credit cost for promotion.
 * @property {number} lv - Minimum officer level required.
 */

/**
 * @typedef {Object} OfficerTrait
 * @property {string} name - Trait display name.
 * @property {Object.<string, number>} bonus - Percentage or flat stat modifications granted by the trait.
 */

/**
 * @typedef {Object} LowerDeckRole
 * @property {string} name - Crew member title.
 * @property {number} cost - Hiring fee in credits.
 * @property {Object.<string, number>} bonus - Passive stat modifications granted by this crew member.
 * @property {string} desc - Summary description of granted bonuses.
 */

/**
 * @typedef {Object} BankConfig
 * @property {number} periodMin - Loan compounding and payment period in minutes.
 * @property {number} credit0 - Starting credit score baseline.
 * @property {number} creditMin - Minimum credit score floor.
 * @property {number} creditMax - Maximum credit score ceiling.
 * @property {number} minPay - Minimum periodic payment amount in credits.
 */

// ------------------------------------------------------------------ the Syndicate
// Standing earned through smuggling, plunder, capture and Syndicate contracts. Each tier opens more of the black market.
/**
 * Syndicate progression thresholds as [requiredPoints, tierTitle] pairs.
 * @type {Array<[number, string]>}
 */
export const SYN_TIERS = [
  [0, 'Unknown'],
  [40, 'Associate'],
  [150, 'Made'],
  [400, 'Lieutenant'],
  [900, 'Underboss'],
  [2000, 'Kingpin'],
];

/**
 * Computes the Syndicate tier, title, and progress toward next rank from standing points.
 * @param {number} pts - Total Syndicate reputation/standing points.
 * @returns {SyndicateTierInfo} Current tier details and points to next tier.
 */
export function synTier(pts) {
  let i = 0;
  for (let k = 0; k < SYN_TIERS.length; k++) if ((pts || 0) >= SYN_TIERS[k][0]) i = k;
  return {
    i,
    name: SYN_TIERS[i][1],
    pts: Math.round(pts || 0),
    next: SYN_TIERS[i + 1] ? SYN_TIERS[i + 1][0] : null,
  };
}

/**
 * Syndicate standing points awarded per unlawful action.
 * @type {Object.<string, number>}
 */
export const SYN_GAIN = { smuggle: 15, plunder: 4, capture: 10, contract: 25, hit: 30 };

// black market stock: tier needed, price, what you get
/**
 * Black market inventory, unlocking progressively with Syndicate tier.
 * @type {BlackMarketItem[]}
 */
export const BLACK_MARKET = [
  {
    id: 'papers',
    tier: 1,
    name: 'Forged papers',
    price: 25000,
    desc: "Wipes one power's grudge: your standing with the local power rises to -10 if it was lower.",
    give: { papers: 1 },
  },
  {
    id: 'shard',
    tier: 1,
    name: 'Officer commendation',
    price: 18000,
    desc: 'A stolen commendation. Officers need these to be promoted.',
    give: { shards: 1 },
  },
  {
    id: 'shard5',
    tier: 2,
    name: 'Bundle of 5 commendations',
    price: 80000,
    desc: 'Five commendations, no questions asked.',
    give: { shards: 5 },
  },
  {
    id: 'wraithbp',
    tier: 2,
    name: 'Wraith blueprints (5)',
    price: 120000,
    desc: 'Plans for the Wraith smuggler, five at a time.',
    give: { bp: [813, 5] },
  },
  {
    id: 'corsairbp',
    tier: 2,
    name: 'Corsair blueprints (5)',
    price: 140000,
    desc: 'Plans for the Corsair boarding ship, five at a time.',
    give: { bp: [808, 5] },
  },
  {
    id: 'wraithpt',
    tier: 3,
    name: 'Wraith parts (4)',
    price: 160000,
    desc: "Machined parts for the Wraith's components.",
    give: { parts: [813, 4] },
  },
  {
    id: 'corsairpt',
    tier: 3,
    name: 'Corsair parts (4)',
    price: 180000,
    desc: "Machined parts for the Corsair's components.",
    give: { parts: [808, 4] },
  },
  {
    id: 'crate4',
    tier: 4,
    name: 'Unmarked crate (grade IV)',
    price: 260000,
    desc: 'A random grade IV material crate.',
    give: { crate: 3 },
  },
  {
    id: 'crate5',
    tier: 5,
    name: 'Unmarked crate (grade V)',
    price: 650000,
    desc: 'A random grade V material crate. Kingpins only.',
    give: { crate: 4 },
  }, // 2.6: replaces the Eclipse Directive
];

// ------------------------------------------------------------------ officer ranks and traits
/**
 * Officer rank title designations in ascending hierarchy order.
 * @type {string[]}
 */
export const RANKS_OFF = ['Ensign', 'Lieutenant', 'Lt. Commander', 'Commander', 'Captain'];

/**
 * Requirements (shards, credits, officer level) needed to promote an officer to rank index i.
 * @type {Array<OfficerPromotionCost|null>}
 */
export const PROMOTE = [
  null,
  { shards: 3, credits: 20000, lv: 3 },
  { shards: 6, credits: 60000, lv: 5 },
  { shards: 12, credits: 150000, lv: 7 },
  { shards: 24, credits: 400000, lv: 9 },
]; // to reach rank i

/**
 * Calculates effectiveness multiplier based on officer rank index (0 through 4).
 * @param {number} rank - Officer rank index.
 * @returns {number} Multiplier value (e.g. 1.0 for Ensign, up to 1.48 for Captain).
 */
export const RANK_MULT = (rank) => 1 + 0.12 * (rank || 0);

// one trait is learned at every promotion
/**
 * Available officer traits and their corresponding passive stat buffs.
 * @type {Object.<string, OfficerTrait>}
 */
export const TRAITS = {
  sharpshooter: { name: 'Sharpshooter', bonus: { damagePct: 4 } },
  ironclad: { name: 'Ironclad', bonus: { armorPct: 5 } },
  shieldwright: { name: 'Shieldwright', bonus: { shieldRePct: 10 } },
  ace: { name: 'Ace Pilot', bonus: { turnPct: 6, accelPct: 5 } },
  hauler: { name: 'Hauler', bonus: { cargoPct: 7 } },
  scavenger: { name: 'Scavenger', bonus: { lootPct: 8 } },
  prospector: { name: 'Prospector', bonus: { miningPct: 12 } },
  tactician: { name: 'Tactician', bonus: { damagePct: 2, shieldPct: 3 } },
  frugal: { name: 'Frugal', bonus: { fuel: 70 } },
  haggler: { name: 'Haggler', bonus: { tradePct: 2 } },
  ghost: { name: 'Ghost', bonus: { scanPct: 30 } },
  inspiring: { name: 'Inspiring', bonus: { officerXp: 25 } },
};

/**
 * Human-readable display labels for specialized trait stat bonuses.
 * @type {Object.<string, string>}
 */
export const STAT_NAME_EXTRA = {
  tradePct: 'better trade prices',
  scanPct: 'patrol scan evasion',
  officerXp: 'officer experience',
};

// ------------------------------------------------------------------ lower decks: two crew slots with small passive bonuses
/**
 * Lower deck specialist crew roles that can be hired for passive boosts.
 * @type {Object.<string, LowerDeckRole>}
 */
export const LOWER_DECK = {
  medic: { name: "Ship's Medic", cost: 6000, bonus: { armorPct: 3 }, desc: '+3% armor' },
  mechanic: {
    name: 'Mechanic',
    cost: 6000,
    bonus: { shieldRePct: 6 },
    desc: '+6% shield recharge',
  },
  rigger: { name: 'Cargo Rigger', cost: 5000, bonus: { cargoPct: 5 }, desc: '+5% cargo space' },
  cook: {
    name: 'Galley Cook',
    cost: 4000,
    bonus: { officerXp: 15 },
    desc: '+15% officer experience',
  },
  lookout: {
    name: 'Lookout',
    cost: 5000,
    bonus: { lootPct: 5 },
    desc: '+5% salvage and bounty pay',
  },
  fueler: { name: 'Fuel Tech', cost: 5000, bonus: { fuel: 50 }, desc: '+50 fuel (half a jump)' },
  gunmate: {
    name: "Gunner's Mate",
    cost: 7000,
    bonus: { damagePct: 2 },
    desc: '+2% weapon damage',
  },
  fixer: {
    name: 'Fixer',
    cost: 9000,
    bonus: { tradePct: 1, scanPct: 15 },
    desc: '+1% trade prices, harder to scan',
  },
};

/**
 * Number of lower deck crew slots available on player ships.
 * @type {number}
 */
export const LOWER_SLOTS = 2;

// ------------------------------------------------------------------ the bank
/**
 * Global banking parameters, interest period, credit limits and minimum payments.
 * @type {BankConfig}
 */
export const BANK = { periodMin: 15, credit0: 600, creditMin: 300, creditMax: 850, minPay: 1000 };

/**
 * Calculates interest rate per bank period as a function of credit rating.
 * @param {number} credit - Player credit score (typically 300 to 850).
 * @returns {number} Periodic interest rate (0.006 to 0.022).
 */
export const loanRate = (credit) => Math.round((2.2 - (1.6 * (credit - 300)) / 550) * 100) / 10000; // per period: 2.2% at 300 down to 0.6% at 850

/**
 * Computes the maximum loan amount available based on credit score and lifetime earnings.
 * @param {number} credit - Player credit score.
 * @param {number} [earned] - Total lifetime earned credits.
 * @returns {number} Maximum borrowable amount rounded to the nearest thousand.
 */
export const maxLoan = (credit, earned) =>
  Math.round(((50000 + (earned || 0) * 0.3) * (credit / 600)) / 1000) * 1000;

/**
 * Calculates required periodic loan installment payment.
 * @param {number} bal - Current outstanding loan principal balance.
 * @param {number} credit - Player credit score.
 * @returns {number} Payment amount due for the current period.
 */
export const loanPayment = (bal, credit) =>
  bal <= 0
    ? 0
    : Math.min(
        Math.ceil(bal * (1 + loanRate(credit))),
        Math.max(BANK.minPay, Math.ceil(bal * 0.06 + bal * loanRate(credit))),
      );

// ------------------------------------------------------------------ passengers (bunks) and rush jobs
/**
 * Calculates passenger bunk capacity for a given ship hull or loadout.
 * @param {Object} H - Ship hull configuration object.
 * @param {Object} [loadout] - Fitted ship loadout.
 * @returns {number} Available passenger seats/bunks.
 */
// Keep the historical helper name for existing mission and save integrations.
export function bunks(H, loadout) {
  return passengerSeats(H, loadout);
}

/**
 * Payout multiplier applied to timed rush delivery jobs.
 * @type {number}
 */
export const RUSH_BONUS = 1.8;
