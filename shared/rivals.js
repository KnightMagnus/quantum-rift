// 1.1 "Living Rift": rival captains. Thirty named AI captains with careers of their own: they trade, hunt, mine and
// raid across the Rift, buy better ships, show up in the systems you visit, and remember how you treated them.
import { FACTION_HULLS } from './galaxy.js';

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
export const KINDS = {
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

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const RIVALS = (() => {
  const r = seeded(0x51f00d),
    out = [],
    usedF = new Set(),
    usedL = new Set();
  const take = (arr, used) => {
    let i;
    do {
      i = Math.floor(r() * arr.length);
    } while (used.has(i));
    used.add(i);
    return arr[i];
  };
  for (let i = 0; i < 30; i++) {
    const kind = KIND_LIST[i],
      K = KINDS[kind],
      fac = K.facs[Math.floor(r() * K.facs.length)];
    out.push({
      id: 'r' + i,
      name: `${take(FIRST, usedF)} ${take(LAST, usedL)}`,
      kind,
      fac,
      ship: SHIPNAMES[i],
      temper: Math.min(1, K.temper + (r() - 0.5) * 0.3),
      luck: 0.7 + r() * 0.6,
    });
  }
  // two captains by special request
  const named = [
    ['pirate', 'Madcow Soul', 'Stampede'],
    ['hunter', 'Six Flash', 'Quickdraw'],
  ];
  for (const [kind, name, ship] of named) {
    const x = out.find((o) => o.kind === kind && !o.special);
    x.name = name;
    x.ship = ship;
    x.special = true;
    x.luck = Math.max(x.luck, 1.15);
  }
  return out;
})();
export const RIVAL = Object.fromEntries(RIVALS.map((x) => [x.id, x]));

// the hull a rival flies: the best their flag's yard sells that their wealth affords (pirates fly Hollow raiders)
const ROLE_FIT = {
  hunter: (s) => s.role !== 'survey',
  pirate: (s) => s.role !== 'survey',
  trader: (s) => s.role === 'survey' || s.cargo >= 40,
  miner: (s) => s.role === 'survey' || s.cargo >= 40,
  explorer: (s) => s.role === 'explorer' || s.role === 'interceptor',
};

/**
 * Determines the best ship hull a rival captain can afford and fly according to their career and wealth.
 * @param {Object} A - Game assets database containing ship hull definitions.
 * @param {string} fac - Faction allegiance.
 * @param {number} wealth - Total net worth / credits available to the rival.
 * @param {string} [kind] - Rival career kind (e.g. 'hunter', 'trader', 'miner').
 * @returns {number} Hull ID of the chosen ship.
 */
export function rivalHull(A, fac, wealth, kind) {
  const all = (FACTION_HULLS[fac] || FACTION_HULLS.spacer)
    .map((h) => A.ships[h])
    .filter((s) => s && s.cost > 0 && s.kind !== 'specialist');
  const fit = kind && ROLE_FIT[kind] ? all.filter(ROLE_FIT[kind]) : all,
    pool = (fit.length ? fit : all).sort((a, b) => a.cost - b.cost);
  let best = pool[0];
  for (const s of pool) if (s.cost <= wealth * 0.6) best = s;
  return best ? best.id : 703;
}

/**
 * Evaluates rival captain disposition mood based on player relationship standing.
 * @param {number} rel - Relationship standing score between player and rival (-100 to +100).
 * @returns {RivalMood} Disposition mood classification.
 */
export const MOOD = (rel) =>
  rel <= -60
    ? 'nemesis'
    : rel <= -30
      ? 'rival'
      : rel >= 60
        ? 'ally'
        : rel >= 25
          ? 'friendly'
          : 'neutral';

/**
 * Display names corresponding to rival relationship mood states.
 * @type {Object.<string, string>}
 */
export const MOOD_LABEL = {
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
export const HAIL_LINES = {
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
 * @type {Object.<string, function(...any): string>}
 */
export const NEWS_TEMPLATES = {
  upgrade: (n, ship, place) => `${n} was seen at ${place} taking delivery of a new ${ship}.`,
  bounty: (n, target) => `${n} collected the bounty on ${target}.`,
  haul: (n, place, cr) => `${n} made ${cr} credits on a single trade run into ${place}.`,
  lost: (n, by) =>
    `${n}'s ship was destroyed${by ? ` by ${by}` : ''}. Insurers are reported to be furious.`,
  strike: (n, place) => `${n} struck a rich vein near ${place}.`,
  chart: (n, place) => `${n} charted a new route out of ${place}.`,
  raid: (n, place) => `Hollow raider ${n} hit a convoy outside ${place}. Lanes there are on alert.`,
  grudge: (n, you) => `${n} has posted a bounty on Captain ${you}. Watch your back.`,
  allied: (n, you) => `${n} and Captain ${you} have been seen flying together.`,
};

// combat rating (Endless Sky style): earned from the strength of every ship you destroy; higher ranks unlock tougher,
// better-paid bounty contracts
/**
 * Combat rating progression thresholds as [requiredScore, rankTitle] pairs.
 * @type {Array<[number, string]>}
 */
export const RANKS = [
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
export function combatRank(score) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (score >= RANKS[k][0]) i = k;
  return {
    i,
    name: RANKS[i][1],
    next: RANKS[i + 1] ? RANKS[i + 1][0] : null,
    score: Math.round(score),
  };
}

// personal lines for the two named-by-request captains
/**
 * Custom hailing dialogue for specially-named captains.
 * @type {Object.<string, Object.<string, string>>}
 */
export const HAIL_SPECIAL = {
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

