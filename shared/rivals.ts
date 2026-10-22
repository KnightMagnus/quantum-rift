import type { GameAssets, ShipHullAsset } from './rules.ts';
export type RivalDefinition = {
  id: string;
  name: string;
  kind: string;
  fac: string;
  ship: string;
  temper: number;
  luck: number;
  special?: boolean;
};
export type CombatRankInfo = { i: number; name: string; next: number | null; score: number };

import { linearRandom32 } from './deterministic-random.ts';
// Living Rift: rival captains. Thirty named AI captains with careers of their own: they trade, hunt, mine and
// raid across the Rift, buy better ships, show up in the systems you visit, and remember how you treated them.
import { FACTION_HULLS } from './galaxy.ts';

const FIRST = [
  'Anya',
  'Bram',
  'Cassia',
  'Dorian',
  'Esme',
  'Fenn',
  'Greta',
  'Hale',
  'Ines',
  'Jory',
  'Kaito',
  'Lysa',
  'Mags',
  'Nico',
  'Oona',
  'Pell',
  'Quint',
  'Rhea',
  'Soren',
  'Tamsin',
  'Ulric',
  'Vera',
  'Wade',
  'Xan',
  'Yara',
  'Zed',
  'Corwin',
  'Delphine',
  'Ezra',
  'Juno',
];
const LAST = [
  'Calloway',
  'Vance',
  'Okafor',
  'Reyes',
  'Thorne',
  'Marsh',
  'Kestrel',
  'Abara',
  'Lindqvist',
  'Hollow-Eye',
  'Sato',
  'Brannigan',
  'Voss',
  'Achterberg',
  'Moreau',
  'Quill',
  'Ironside',
  'Drummond',
  'Ashgrove',
  'Petrov',
  'Nakamura',
  'Fairweather',
  'Okonkwo',
  'Strand',
  'Galloway',
  'Rourke',
  'Vashti',
  'Kell',
  'Duskwater',
  'Marlowe',
];
const SHIPNAMES = [
  'Long Odds',
  'Second Wind',
  'Gilded Shrike',
  'Far Thunder',
  'Patient Knife',
  'Copper Saint',
  'Nine Lives',
  'Red Ledger',
  'Dawn Chorus',
  'Old Grudge',
  'Quiet Margin',
  'Bright Debt',
  'Salt Crown',
  'Last Laugh',
  'Grey Mercy',
  'Wandering Star',
  'Iron Psalm',
  'Lucky Thirteen',
  'Night Heron',
  'Hard Bargain',
  'Cold Comfort',
  'Ember Queen',
  'Vagabond',
  'Slow Burn',
  'Kingfisher',
  'Rust Dancer',
  'Sunward',
  'Winter Coin',
  'Black Lantern',
  'Tall Tale',
];

// careers: what they do, which powers they fly for, and how they earn
export const KINDS: Record<
  string,
  { label: string; facs: string[]; ai: string; earn: number; temper: number }
> = {
  trader: {
    label: 'Trader',
    facs: ['spacer', 'quantum', 'lamp', 'korrund', 'sarn', 'thalassi'],
    ai: 'trade',
    earn: 9000,
    temper: 0.15,
  },
  hunter: {
    label: 'Bounty Hunter',
    facs: ['quantum', 'spacer', 'vashari', 'ylith'],
    ai: 'patrol',
    earn: 12000,
    temper: 0.55,
  },
  miner: {
    label: 'Prospector',
    facs: ['spacer', 'korrund', 'farside', 'lamp'],
    ai: 'trade',
    earn: 7000,
    temper: 0.2,
  },
  explorer: {
    label: 'Explorer',
    facs: ['quantum', 'thalassi', 'ylith', 'spacer'],
    ai: 'trade',
    earn: 6000,
    temper: 0.25,
  },
  pirate: { label: 'Pirate', facs: ['hollow'], ai: 'raid', earn: 14000, temper: 0.9 },
};
const KIND_LIST = [
  'trader',
  'trader',
  'trader',
  'trader',
  'trader',
  'trader',
  'trader',
  'hunter',
  'hunter',
  'hunter',
  'hunter',
  'hunter',
  'hunter',
  'miner',
  'miner',
  'miner',
  'miner',
  'explorer',
  'explorer',
  'explorer',
  'explorer',
  'pirate',
  'pirate',
  'pirate',
  'pirate',
  'pirate',
  'hunter',
  'trader',
  'miner',
  'pirate',
];

// Rival generation historically replaces a zero seed before starting its LCG.
const seeded = (seed: number) => linearRandom32(seed >>> 0 || 1);

export const RIVALS = (() => {
  const randomGenerator = seeded(0x51f00d),
    rivalDefinitions: RivalDefinition[] = [],
    usedFirstNames = new Set<number>(),
    usedLastNames = new Set<number>();
  const take = (entries: readonly string[], used: Set<number>) => {
    let index;
    do {
      index = Math.floor(randomGenerator() * entries.length);
    } while (used.has(index));
    used.add(index);
    return entries[index];
  };
  for (let index = 0; index < 30; index++) {
    const kind = KIND_LIST[index],
      kinds = KINDS[kind],
      faction = kinds.facs[Math.floor(randomGenerator() * kinds.facs.length)];
    rivalDefinitions.push({
      id: 'r' + index,
      name: `${take(FIRST, usedFirstNames)} ${take(LAST, usedLastNames)}`,
      kind,
      fac: faction,
      ship: SHIPNAMES[index],
      temper: Math.min(1, kinds.temper + (randomGenerator() - 0.5) * 0.3),
      luck: 0.7 + randomGenerator() * 0.6,
    });
  }
  // Additional named captains
  const named = [
    ['pirate', 'Madcow Soul', 'Stampede'],
    ['hunter', 'Six Flash', 'Quickdraw'],
  ];
  for (const [kind, name, ship] of named) {
    const rivalDefinition = rivalDefinitions.find(
      (rivalDefinition) => rivalDefinition.kind === kind && !rivalDefinition.special,
    )!;
    rivalDefinition.name = name;
    rivalDefinition.ship = ship;
    rivalDefinition.special = true;
    rivalDefinition.luck = Math.max(rivalDefinition.luck, 1.15);
  }
  return rivalDefinitions;
})();
export const RIVAL = Object.fromEntries(
  RIVALS.map((rivalDefinition) => [rivalDefinition.id, rivalDefinition]),
);

// the hull a rival flies: the best their flag's yard sells that their wealth affords (pirates fly Hollow raiders)
const ROLE_FIT: Record<string, (ship: ShipHullAsset) => boolean> = {
  hunter: (shipHullAsset) => shipHullAsset.role !== 'survey',
  pirate: (shipHullAsset) => shipHullAsset.role !== 'survey',
  trader: (shipHullAsset) => shipHullAsset.role === 'survey' || shipHullAsset.cargo >= 40,
  miner: (shipHullAsset) => shipHullAsset.role === 'survey' || shipHullAsset.cargo >= 40,
  explorer: (shipHullAsset) =>
    shipHullAsset.role === 'explorer' || shipHullAsset.role === 'interceptor',
};

/**
 * Determines the best ship hull a rival captain can afford and fly according to their career and wealth.
 * @param {Object} gameAssets - Game assets database containing ship hull definitions.
 * @param {string} faction - Faction allegiance.
 * @param {number} wealth - Total net worth / credits available to the rival.
 * @param {string} [kind] - Rival career kind (e.g. 'hunter', 'trader', 'miner').
 * @returns {number} Hull ID of the chosen ship.
 */
export function rivalHull(
  gameAssets: GameAssets,
  faction: string,
  wealth: number,
  kind?: string,
): number {
  const shipHullAssets = (FACTION_HULLS[faction] || FACTION_HULLS.spacer)
    .map((height) => gameAssets.ships[height])
    .filter(
      (shipHullAsset) =>
        shipHullAsset && shipHullAsset.cost > 0 && shipHullAsset.kind !== 'specialist',
    );
  const shipHullAssets2 =
      kind && ROLE_FIT[kind] ? shipHullAssets.filter(ROLE_FIT[kind]) : shipHullAssets,
    pool = (shipHullAssets2.length ? shipHullAssets2 : shipHullAssets).sort(
      (shipHullAsset, shipHullAsset2) => shipHullAsset.cost - shipHullAsset2.cost,
    );
  let best = pool[0];
  for (const shipHullAsset of pool) if (shipHullAsset.cost <= wealth * 0.6) best = shipHullAsset;
  return best ? best.id : 703;
}

/**
 * Evaluates rival captain disposition mood based on player relationship standing.
 * @param {number} relative - Relationship standing score between player and rival (-100 to +100).
 * @returns {RivalMood} Disposition mood classification.
 */
export const MOOD = (relative: number) =>
  relative <= -60
    ? 'nemesis'
    : relative <= -30
      ? 'rival'
      : relative >= 60
        ? 'ally'
        : relative >= 25
          ? 'friendly'
          : 'neutral';

/**
 * Display names corresponding to rival relationship mood states.
 * @type {Object.<string, string>}
 */
export const MOOD_LABEL: Record<string, string> = {
  nemesis: 'Nemesis',
  rival: 'Rival',
  neutral: 'Neutral',
  friendly: 'Friendly',
  ally: 'Ally',
};

// what they say when hailed, by career and mood
/**
 * Dynamic hailing dialogue responses categorized by career path and mood disposition.
 * @type {Object.<string, Object.<string, string>>}
 */
export const HAIL_LINES: Record<string, Record<string, string>> = {
  trader: {
    nemesis: 'You cost me a fortune, and I keep my ledgers. Every line of them.',
    rival: 'Oh. You. Find your own buyers.',
    neutral: 'Prices are soft on the run in. Watch your margins, Captain.',
    friendly: 'Good to see a friendly hull. The Rift is lonelier than the brochures say.',
    ally: 'Partner! If anyone gives you trouble out here, they give it to both of us.',
  },
  hunter: {
    nemesis: 'There is a price on your head, and I intend to collect it.',
    rival: 'Stay out of my contracts and we will get along fine.',
    neutral: 'Hunting? Me too. Plenty of scum to go around.',
    friendly: 'Nice shooting last time. I owe you a drink.',
    ally: 'Point me at whoever is bothering you.',
  },
  miner: {
    nemesis: 'You jumped my claim. I do not forget a claim jumper.',
    rival: 'This field is spoken for.',
    neutral: 'Rich veins out past the third rock. Do not tell anyone I said so.',
    friendly: 'Want a tip? The gas pockets near the Frontier pay double this week.',
    ally: 'Fill your hold, friend. There is more than enough ore for two.',
  },
  explorer: {
    nemesis: 'I have charted a hundred systems and you are the worst thing in any of them.',
    rival: 'I was here first, for the record.',
    neutral: 'Every jump is a story. Some of them even end well.',
    friendly: 'Found a beautiful nebula two jumps out. Worth the fuel.',
    ally: 'If you ever want company beyond the charts, call me.',
  },
  pirate: {
    nemesis: 'You again. This time you will not be leaving.',
    rival: 'Cargo or coffin. Your call.',
    neutral: 'Easy now. Maybe we can come to an arrangement.',
    friendly: 'You are all right, for a lawful type.',
    ally: 'Fly with me a while. The Hollow takes care of its own.',
  },
};

/**
 * Formatting templates for galaxy newsfeed broadcasts about rival captain activities.
 * @type {Record<string, (...args: (string | number)[]) => string>}
 */
export const NEWS_TEMPLATES: Record<string, (...argumentsList: (string | number)[]) => string> = {
  upgrade: (count, ship, place) =>
    `${count} was seen at ${place} taking delivery of a new ${ship}.`,
  bounty: (count, target) => `${count} collected the bounty on ${target}.`,
  haul: (count, place, credits) =>
    `${count} made ${credits} credits on a single trade run into ${place}.`,
  lost: (count, source) =>
    `${count}'s ship was destroyed${source ? ` by ${source}` : ''}. Insurers are reported to be furious.`,
  strike: (count, place) => `${count} struck a rich vein near ${place}.`,
  chart: (count, place) => `${count} charted a new route out of ${place}.`,
  raid: (count, place) =>
    `Hollow raider ${count} hit a convoy outside ${place}. Lanes there are on alert.`,
  grudge: (count, playerPayload) =>
    `${count} has posted a bounty on Captain ${playerPayload}. Watch your back.`,
  allied: (count, playerPayload) =>
    `${count} and Captain ${playerPayload} have been seen flying together.`,
};

// combat rating (ranked by target strength): earned from the strength of every ship you destroy; higher ranks unlock tougher,
// better-paid bounty contracts
/**
 * Combat rating progression thresholds as [requiredScore, rankTitle] pairs.
 * @type {Array<[number, string]>}
 */
export const RANKS: Array<[number, string]> = [
  [0, 'Harmless'],
  [400, 'Mostly Harmless'],
  [1500, 'Novice'],
  [5000, 'Competent'],
  [14000, 'Experienced'],
  [35000, 'Dangerous'],
  [90000, 'Deadly'],
  [220000, 'Elite'],
];

/**
 * Computes current player combat rating rank and progress to next rank.
 * @param {number} score - Accumulated combat rating points.
 * @returns {CombatRankInfo} Rank information and target score.
 */
export function combatRank(score: number): CombatRankInfo {
  let index = 0;
  for (let entryKey = 0; entryKey < RANKS.length; entryKey++)
    if (score >= RANKS[entryKey][0]) index = entryKey;
  return {
    i: index,
    name: RANKS[index][1],
    next: RANKS[index + 1] ? RANKS[index + 1][0] : null,
    score: Math.round(score),
  };
}

// Captain-specific hail dialogue
/**
 * Custom hailing dialogue for specially-named captains.
 * @type {Object.<string, Object.<string, string>>}
 */
export const HAIL_SPECIAL: Record<string, Record<string, string>> = {
  'Madcow Soul': {
    nemesis: 'MOOOO-ve aside, Captain, or I go straight through you. The Stampede does not brake.',
    rival: 'You hear that rumble? That is the Stampede. Get off my range.',
    neutral: 'Easy now. The herd is grazing today. Today.',
    friendly: 'Ha! You got a little madcow in you, Captain. I like that.',
    ally: 'Ride with the herd, partner. Nobody touches my people.',
  },
  'Six Flash': {
    nemesis: 'Six shots. You will not see the first five.',
    rival: 'Draw slower, Captain. It is healthier.',
    neutral: 'Quickdraw, out of Vashari space. Hunting, as always.',
    friendly: 'Not bad shooting. Not Six Flash shooting, but not bad.',
    ally: 'Call it in, partner. I will be there before you finish the sentence.',
  },
};
