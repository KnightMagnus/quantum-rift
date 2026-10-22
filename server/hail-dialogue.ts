import type { Session, Entity } from './game.ts';
import type { Space } from './space.ts';

// Authored, factual traffic dialogue. No generated text or imaginary cargo/destinations.
import { SYS as systemsById } from '../shared/galaxy.ts';
import { RIVAL, HAIL_LINES, HAIL_SPECIAL, MOOD } from '../shared/rivals.ts';
const openings: Record<string, string[]> = {
  trade: [
    'Channel open.',
    'Receiving you.',
    'Traffic channel clear.',
    'Good to hear a voice.',
    'We have a moment.',
    'Signal received.',
    'Keeping the lane clear.',
    'Another ship on the frequency.',
  ],
  patrol: [
    'Patrol channel open.',
    'Keep the channel clear of interference.',
    'Identification received.',
    'Security traffic here.',
    'Your transponder is readable.',
    'Monitoring local traffic.',
    'Maintain a safe separation.',
    'Local watch, receiving.',
  ],
  flee: [
    'Keep it brief—we are getting clear.',
    'No time to linger.',
    'We are making our exit.',
    'This is not a good moment.',
    'Trying to put distance behind us.',
    'We need room to maneuver.',
    'Our departure takes priority.',
    'Clear our flight path.',
  ],
  escort: [
    'Holding formation.',
    'Keeping station with our lead.',
    'Guard channel open.',
    'Formation traffic, receiving.',
    'Watching our lead ship.',
    'We are on escort duty.',
    'Keeping the group together.',
    'Our lead has the route.',
  ],
  combat: [
    'Weapons hot. Keep it short.',
    'We have a live target.',
    'Busy with a hostile contact.',
    'Combat channel—make it quick.',
    'We are maneuvering under fire.',
    'Contact engaged.',
    'Stay clear of our firing arc.',
    'This channel is not quiet today.',
  ],
  disabled: [
    'Emergency channel open.',
    'Our ship is disabled.',
    'Distress beacon transmitting.',
    'We cannot maneuver.',
    'Emergency transmission.',
    'We need help out here.',
    'A disabled ship is still listening.',
    'Our drive is not responding.',
  ],
};
// One stable verbal signature for each captain, indexed by the existing catalog order.
const voices = [
  'Keep the ledger balanced.',
  'Another day, another crossing.',
  'Precision keeps us alive.',
  'I prefer a direct course.',
  'There is always another horizon.',
  'Let the instruments settle.',
  'I have survived worse weather.',
  'Nothing gets past a careful watch.',
  'Quiet skies suit me.',
  'No promises beyond this channel.',
  'We make our own luck.',
  'A good route pays twice.',
  'Every scar has a story.',
  'Leave room for the unexpected.',
  'Patience is useful out here.',
  'Put it on the record.',
  'Steel first, speeches later.',
  'Follow the brighter stars.',
  'I trust a steady hand.',
  'Everything has its price.',
  'Stay sharp on the approach.',
  'A friendly voice travels far.',
  'Keep something in reserve.',
  'No need to hurry the stars.',
  'Watch the quiet contacts.',
  'Still flying, still counting.',
  'The long view matters.',
  'Keep your signal clean.',
  'Dark space rewards attention.',
  'There is a tale in every jump.',
];
const rivalIds = Object.keys(RIVAL);
export function contextualHail(session: Session, entity: Entity, space2: Space, relative = 0) {
  if (!session.hailLedger || session.hailLedger.space !== space2)
    session.hailLedger = { space: space2, used: new Set(), seq: 0 };
  const ledger = session.hailLedger;
  const name = entity.name || `Traffic ${entity.id}`;
  const task = entity.disabled
    ? 'disabled'
    : entity.target
      ? 'combat'
      : entity.ai && openings[entity.ai]
        ? entity.ai
        : 'trade';
  const status = entity.disabled
    ? 'Maneuvering systems offline.'
    : entity.armor < entity.st.armor * 0.5
      ? 'Our armor is badly damaged.'
      : entity.shield < entity.st.shield * 0.35
        ? 'Our shields are low.'
        : 'Flight systems responding.';
  const context = `${name}, ${systemsById[space2.id]?.name || space2.id}. ${status}${entity.dest?.name ? ` Course set for ${entity.dest.name}.` : ''}`;
  const radius = entity.rival && RIVAL[entity.rival];
  const signature = radius
    ? `${(HAIL_SPECIAL[radius.name] || HAIL_LINES[radius.kind])[MOOD(relative)]} ${voices[rivalIds.indexOf(String(entity.rival)) % voices.length] || voices[0]}`
    : '';
  for (const opening of openings[task!]) {
    const text = `${opening} ${context}${signature ? `\n\n${signature}` : ''}`;
    if (!ledger.used.has(text)) {
      ledger.used.add(text);
      return text;
    }
  }
  // Meaningful fallback identifies ship, task and local coordinates, never cosmetic punctuation.
  const text = `${context} ${task === 'trade' ? 'Local traffic' : task} reporting position ${Math.round(entity.x)}, ${Math.round(entity.y)}. ${signature}`;
  ledger.used.add(text);
  return text;
}
