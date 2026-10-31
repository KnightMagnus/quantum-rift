import type { StoryFlags } from '../server/save-contracts.ts';

/** Hidden places are never unlocked by a route request or another captain's ending. */
export function storySystemVisible(flags: StoryFlags | undefined, system: string): boolean {
  if (system === 'founding-vigil') return !!flags?.founding_vigil && flags.main_ending !== 'table';
  if (system === 'table' || system === 'quantum-rift') return flags?.main_ending === 'table';
  if (system === 'beyond-rift')
    return flags?.main_ending === 'table' && !!flags.crossed_quantum_rift;
  return true;
}

/** Endings are tested from saved choices, not client-supplied availability. */
export function mainEndings(flags: StoryFlags): string[] {
  const endings = ['unsettling'];
  if (flags.d1 === 'concord' || flags.index_ending === 'survey_complete')
    endings.push('long_dream');
  if (
    flags.index_ending === 'survey_complete' &&
    ['witness', 'seal'].includes(flags.nhal_ending || '')
  )
    endings.push('table');
  if (flags.nhal_ending === 'witness' && flags.d2 === 'quevari') endings.push('captains_watch');
  return endings;
}

/** Only the viewing captain's port copy changes; markets and world ownership stay shared. */
export function storyDescription(
  flags: StoryFlags | undefined,
  stellar: string,
  original: string,
): string {
  if (
    flags?.index_ending === 'concord_property' &&
    ['qstation', 'meridian-yards', 'halcyon-prime'].includes(stellar)
  )
    original +=
      ' In the Concord yard, ivory survey couplers carry fresh hazard stripes. The engineers have put the Kernel codes to work; the new equipment is for measurement, not conquest.';
  if (stellar === 'qstation') {
    original +=
      ' Concord notice: captains reporting different versions of the same event should file separate accounts. The Core is said to keep them from contradicting. Please do not amend another captain’s log.';
    if (flags?.main_ending === 'long_dream')
      return (
        original +
        ' At its heart the Core is quiet once more, dreaming while the dark settles below.'
      );
    if (flags?.main_ending === 'table')
      return original + ' The berth at its heart is empty. Its old witness has gone home.';
    if (flags?.main_ending === 'unsettling')
      return original + ' At its heart stands a cold, silent crystal. No one agrees on its colour.';
    if (flags?.main_ending === 'captains_watch')
      return original + ' Someone dreams at its heart. When it speaks, the voice is yours.';
    if (flags?.breach_started)
      return (
        original +
        ' The Core is awake. The dockmaster keeps two ledgers for ships that arrived only once.'
      );
  }
  if (
    flags?.main_ending === 'long_dream' &&
    ['glasswind', 'threshold', 'the-moonlet'].includes(stellar)
  )
    return (
      original + ' Beyond the border, the dark has settled. The distant song is quiet for now.'
    );
  if (flags?.main_ending !== 'unsettling') return original;
  const lenses: Record<string, string> = {
    quantum:
      'The account is disputed. The dock remains open; someone must still keep the arrivals book.',
    spacer:
      'A light on a long route. You can still get home from here, if home is the word you want.',
    vashari: 'The place has a thousand edges. From this angle, at last, they belong to one shape.',
    korrund: 'Its weight is honest. Whatever the sky says, the work beneath your boots holds.',
    ylith: 'One clear note hangs where a dozen answers used to sound. Listen before you name it.',
    sarn: 'A place is an agreement between its visitors. This one has renegotiated its terms.',
    thalassi: 'The current divides here. The other voices reach you as if through deep water.',
    quevari:
      'Light makes a door of it. Across the threshold the other sails are pale as old cloth.',
    lamp: 'The lamps mark a safe passage, though no keeper can say whose shore lies beyond.',
  };
  const keyPlaces = new Set([
    'qstation',
    'sol-gateway',
    'inalumen',
    'thrum',
    'slag',
    'facet',
    'spoke',
    'tide',
    'vigil-lamp',
    'northmark-station',
    'ninefold-prime',
    'glasswake-foundry',
    'coldharbor-gate',
    'concordia',
    'threshold',
  ]);
  return keyPlaces.has(stellar)
    ? original + ' ' + (lenses[flags.unsettled_with || 'quantum'] || lenses.quantum)
    : original;
}

/** Finale text varies with decisions without revealing the far side before crossing. */
export function endingText(flags: StoryFlags, serenAboard = false): string {
  switch (flags.main_ending) {
    case 'long_dream':
      return 'You sing the Core back to sleep. The Deep sinks below, for now. At Quantum Station the old rhythm returns. Life goes on. Down below, the ledger keeps filling. One day someone will have to face it again.';
    case 'table':
      return (
        'A star lights at the centre of the ten dark lamps. The Spacers carry everyone to it. The Sarn draw the terms; the Korrund hold the Table steady. The Vashari teach the guests to look at one thing together. The Hollow leave their seat empty until the very end, then take it. The Thalassi sing.' +
        (serenAboard ? ' Seren points to the last empty chair.' : ' One last chair stands empty.') +
        (flags.nhal_ending === 'witness'
          ? ' The Dreamer takes it.'
          : ' The Deep is quiet behind its rebuilt wall.') +
        (flags.lamps_relit
          ? ' The Lamplighters relight all ten lamps. The oldest doors in the Rift open again.'
          : ' The old lamps remain dark; the Spacers find another way.') +
        ' In Farside the vast hulk wakes: Gargantua Prime. It carries the Core through the Second Door. The guests no longer need a referee. The Index record one final word: Present.'
      );
    case 'captains_watch':
      return 'You take the empty place at the heart of the Rift. Part of you sleeps; the rest comes back to your ship. You have faced the lives you never lived. The Deep stops growing. Gargantua Prime wakes and carries its makers away. When Quantum Station speaks, it uses your voice.';
    default:
      return 'You let the agreement end. The Core goes dark. The old hulk stays a hulk. Every people keeps its own Rift, and you must choose whose sky to call home. The docks still work. Trade continues through half-seen hands. There are friends you should visit before their faces grow too faint.';
  }
}
