export type SystemStateNeed = { cid?: string; kills?: string; qty: number };
export type SystemState = {
  name: string;
  icon: string;
  color: string;
  prices: Record<string, number>;
  need?: SystemStateNeed;
  traders?: number;
  passengers?: number;
  raidCap?: number;
  bounty?: number;
  weight: number;
  desc: string;
  end: string;
};
export type TradeImpactConfig = { perTon: number; max: number; halfLifeMin: number };
// Quantum Rift: systems pass through states (famine, war, a boom...) that come and go over time and
// that captains can end early. A state moves prices, changes the traffic, posts its own jobs and makes the news.
// `need` is what ends a state early: tons of a good sold at the system's markets, or kills of a kind of ship there.

/**
 * @typedef {Object} SystemStateNeed
 * @property {string} [cid] - Commodity ID needed to resolve the state early (e.g. 'food', 'medical', 'ore').
 * @property {string} [kills] - Faction or ship category required to destroy (e.g. 'enemy', 'pirate').
 * @property {number} qty - Target quantity of commodity sales or ship kills needed to end the state.
 */

/**
 * @typedef {Object} SystemState
 * @property {string} name - Display name of the system state.
 * @property {string} icon - Emoji or symbol icon representing the state.
 * @property {string} color - Hex color string for UI and galactic map highlights.
 * @property {Object.<string, number>} prices - Map of commodity ID to market price multiplier.
 * @property {SystemStateNeed} [need] - Objective that ends the state early when met.
 * @property {number} [traders] - Multiplier applied to NPC trading vessel traffic.
 * @property {number} [passengers] - Multiplier applied to station passenger board volume.
 * @property {number} [raidCap] - Maximum concurrent raid encounters permitted.
 * @property {number} [bounty] - Multiplier on bounty payouts awarded for kills.
 * @property {number} weight - Relative selection weight for periodic random state rolls.
 * @property {string} desc - In-game description detailing market and security effects.
 * @property {string} end - Announcement text broadcast when the state concludes.
 */

/**
 * @typedef {Object} TradeImpactConfig
 * @property {number} perTon - Price variance induced per metric ton traded.
 * @property {number} max - Maximum allowable price fluctuation cap.
 * @property {number} halfLifeMin - Minutes required for local price impacts to decay by half.
 */

/**
 * Dynamic star system event state definitions.
 * @type {Object.<string, SystemState>}
 */
export const STATES: Record<string, SystemState> = {
  famine: {
    name: 'Famine',
    icon: '🌾',
    color: '#e0a040',
    prices: { food: 2.1, medical: 1.2 },
    need: { cid: 'food', qty: 140 },
    weight: 3,
    desc: 'Harvests have failed. Food sells for double, and relief deliveries end the famine.',
    end: 'The famine in {sys} is over: relief convoys got through.',
  },
  plague: {
    name: 'Plague',
    icon: '☣',
    color: '#9ad050',
    prices: { medical: 2.3, luxury: 0.7 },
    need: { cid: 'medical', qty: 100 },
    weight: 2,
    desc: 'A fever is spreading. Medical supplies are worth a fortune, and enough of them will stop it.',
    end: 'The fever in {sys} is broken. Medical crews thank every captain who flew in supplies.',
  },
  boom: {
    name: 'Boom',
    icon: '📈',
    color: '#5ad08a',
    prices: { luxury: 1.5, equipment: 1.35, industrial: 1.25, metal: 1.2 },
    traders: 1.6,
    weight: 3,
    desc: 'Money is flowing. Luxuries and equipment fetch high prices, and the lanes are busy.',
    end: 'The boom in {sys} has cooled.',
  },
  war: {
    name: 'Border War',
    icon: '⚔',
    color: '#ff6a50',
    prices: { metal: 1.5, equipment: 1.6, medical: 1.4, food: 1.2 },
    need: { kills: 'enemy', qty: 10 },
    weight: 2,
    desc: 'Two powers are fighting over this system. War materiel sells high, and every enemy ship destroyed here helps end it.',
    end: 'The fighting in {sys} has ended. The {fac} hold the system.',
  },
  pirates: {
    name: 'Pirate Scourge',
    icon: '☠',
    color: '#ff4a6a',
    prices: { food: 1.15, equipment: 1.2 },
    need: { kills: 'pirate', qty: 8 },
    raidCap: 2,
    bounty: 1.5,
    weight: 3,
    desc: 'Raiders have the lanes. Bounties pay half again as much, and clearing them out lifts the scourge.',
    end: 'The pirate scourge in {sys} is broken. The lanes are safe again.',
  },
  festival: {
    name: 'Festival',
    icon: '🎆',
    color: '#d080ff',
    prices: { luxury: 1.8, food: 1.3, silk: 1.4 },
    traders: 1.4,
    passengers: 2,
    weight: 2,
    desc: 'A festival fills the spaceports. Luxuries and fine food sell well, and travellers want passage.',
    end: 'The festival in {sys} has ended. The crowds have gone home.',
  },
  rush: {
    name: 'Mining Rush',
    icon: '⛏',
    color: '#ffb84a',
    prices: { equipment: 1.1 },
    need: { cid: 'ore', qty: 160 },
    weight: 2,
    desc: 'Finite refinery sourcing orders and faster field recovery last until shared demand is met.',
    end: 'The mining rush in {sys} has run its course.',
  },
  refugees: {
    name: 'Refugees',
    icon: '⛺',
    color: '#7ab0ff',
    prices: { food: 1.45, medical: 1.35, industrial: 1.2 },
    passengers: 3,
    need: { cid: 'food', qty: 100 },
    weight: 2,
    desc: 'Refugees crowd the stations. Food and medicine are short, and many need passage elsewhere.',
    end: 'The refugees in {sys} has been resettled.',
  },
};

/**
 * Target fraction of market systems that should simultaneously undergo a state event.
 * @type {number}
 */
export const STATE_SHARE: number = 0.16; // about this share of systems with markets is in some state at a time

/**
 * Minimum and maximum duration range in real-time minutes for an active system state [min, max].
 * @type {number[]}
 */
export const STATE_MIN: number[] = [25, 60]; // a state lasts this many minutes (real time) unless it is ended early

// player trading moves prices: each ton sold lowers the local price, each ton bought raises it, and the effect fades
/**
 * Dynamic market elasticity coefficients for player trade impact.
 * @type {TradeImpactConfig}
 */
export const TRADE_IMPACT: TradeImpactConfig = { perTon: 0.0022, max: 0.4, halfLifeMin: 12 };
