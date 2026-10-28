import type { GameAssets, ShipHullAsset } from './rules.ts';
export type RivalDefinition = {
  id: string;
  name: string;
  kind: string;
  fac: string;
  ship: string;
  temper: number;
  luck: number;
};
export type CombatRankInfo = { i: number; name: string; next: number | null; score: number };

import { linearRandom32 } from './deterministic-random.ts';
// Living Rift: rival captains. Thirty named AI captains with careers of their own: they trade, hunt, mine and
// raid across the Rift, buy better ships, show up in the systems you visit, and remember how you treated them.
import { FACTION_HULLS } from './galaxy.ts';

// Names and ships of the thirty captains, indexed by rival id (r0 to r29).
const ROSTER: readonly { name: string; ship: string }[] = [
  { name: 'Ottoline Wickmere', ship: "Leavitt's Candle" }, // r0
  { name: 'Corin Ashby', ship: 'Fair Wind' }, // r1
  { name: 'Nell Varga', ship: 'Second Helping' }, // r2
  { name: 'Ilsabet Vaun', ship: "Fuchs's Wager" }, // r3
  { name: 'Bettany "Bet" Crowe', ship: 'Sharp Practice' }, // r4
  { name: 'Odile Brass', ship: 'Closing Cadence' }, // r5
  { name: 'Ysolde Undertow', ship: "Doppler's Song" }, // r6
  { name: 'Twelve Glint', ship: 'Stinging Answer' }, // r7
  { name: 'Lior Of-The-Bell', ship: "Everett's Choir" }, // r8
  { name: 'Last Hum', ship: 'Long Memory' }, // r9
  { name: 'Idris Calder', ship: 'Due Process' }, // r10
  { name: 'Kit Delacroix', ship: "Halley's Return" }, // r11
  { name: 'Ambrose Kettle', ship: 'Writ of Salt' }, // r12
  { name: 'Garnet Deepdelve', ship: 'Chandrasekhar Limit' }, // r13
  { name: 'Silas Mabry', ship: 'Long Shot' }, // r14
  { name: 'Juniper Stroud', ship: 'Homestead' }, // r15
  { name: 'Cinder Vaultmaw', ship: 'Anvil Hymn' }, // r16
  { name: 'Theodora Lune', ship: "Herschel's Daughter" }, // r17
  { name: 'Rafe Oduya', ship: "Mermin's Moon" }, // r18
  { name: 'Tess Mallory', ship: 'Far Ledger' }, // r19
  { name: 'Ansa Of-The-Far-Note', ship: "Schack's Ledger" }, // r20
  { name: '"Brick" Mulgrew', ship: 'Mother of Wolves' }, // r21
  { name: 'Yasmin "Jinx" Torres', ship: 'Unpaid' }, // r22
  { name: 'Delia Ravensworth', ship: 'Slow Fuse' }, // r23
  { name: 'Cormac Drane', ship: 'Stolen Thunder' }, // r24
  { name: 'Teague Malloy', ship: "Schrödinger's Cat" }, // r25
  { name: 'Cael Of-The-Glass', ship: "Zwirn's Courtesy" }, // r26
  { name: 'Flint Coldhearth', ship: 'Tithe of Iron' }, // r27
  { name: 'Liesl Embersby', ship: 'Ninth Wick' }, // r28
  { name: 'Sal "Lucky" Abernathy', ship: "Dead Man's Credit" }, // r29
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
  // Names used to be drawn at random from 30-entry pools. The draws are kept so each captain's
  // faction, temper and luck stay the same now that names come from ROSTER.
  const skipLegacyNameDraw = (used: Set<number>) => {
    let index;
    do {
      index = Math.floor(randomGenerator() * ROSTER.length);
    } while (used.has(index));
    used.add(index);
  };
  for (let index = 0; index < 30; index++) {
    const kind = KIND_LIST[index],
      kinds = KINDS[kind],
      faction = kinds.facs[Math.floor(randomGenerator() * kinds.facs.length)];
    skipLegacyNameDraw(usedFirstNames);
    skipLegacyNameDraw(usedLastNames);
    rivalDefinitions.push({
      id: 'r' + index,
      name: ROSTER[index].name,
      kind,
      fac: faction,
      ship: ROSTER[index].ship,
      temper: Math.min(1, kinds.temper + (randomGenerator() - 0.5) * 0.3),
      luck: 0.7 + randomGenerator() * 0.6,
    });
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
 * @param gameAssets - Game assets database containing ship hull definitions.
 * @param faction - Faction allegiance.
 * @param wealth - Total net worth / credits available to the rival.
 * @param kind - Rival career kind (e.g. 'hunter', 'trader', 'miner').
 * @returns Hull ID of the chosen ship.
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
 * @param relative - Relationship standing score between player and rival (-100 to +100).
 * @returns Disposition mood classification.
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
 * @param score - Accumulated combat rating points.
 * @returns Rank information and target score.
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
 * Custom hailing dialogue for captains with their own voice, keyed by name.
 */
export const HAIL_SPECIAL: Record<string, Record<string, string>> = {
  '"Brick" Mulgrew': {
    nemesis: 'The Mother of Wolves remembers your scent, Captain. The pack is already running.',
    rival: 'Hear the howling? That is my pack. Get off our hunting ground.',
    neutral: 'Easy. The wolves are fed today. Today.',
    friendly: 'Ha! You have some wolf in you, Captain. I like that.',
    ally: 'Run with the pack, friend. Nobody touches my people.',
  },
  'Twelve Glint': {
    nemesis: 'Twelve shots. You will not see the first eleven.',
    rival: 'Ask slower questions, Captain. The Stinging Answer is faster.',
    neutral: 'Stinging Answer, out of Vashari space. Hunting, as always.',
    friendly: 'Not bad shooting. Not Twelve Glint shooting, but not bad.',
    ally: 'Call it in, partner. I will be there before you finish the sentence.',
  },
};
