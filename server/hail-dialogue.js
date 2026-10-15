// Authored, factual traffic dialogue. No generated text or imaginary cargo/destinations.
import { SYS } from '../shared/galaxy.js';
import { RIVAL, HAIL_LINES, HAIL_SPECIAL, MOOD } from '../shared/rivals.js';
const openings = {
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
export function contextualHail(s, e, sp, rel = 0) {
  if (!s.hailLedger || s.hailLedger.space !== sp)
    s.hailLedger = { space: sp, used: new Set(), seq: 0 };
  const ledger = s.hailLedger;
  const name = e.name || `Traffic ${e.id}`;
  const task = e.disabled ? 'disabled' : e.target ? 'combat' : openings[e.ai] ? e.ai : 'trade';
  const status = e.disabled
    ? 'Maneuvering systems offline.'
    : e.armor < e.st.armor * 0.5
      ? 'Our armor is badly damaged.'
      : e.shield < e.st.shield * 0.35
        ? 'Our shields are low.'
        : 'Flight systems responding.';
  const context = `${name}, ${SYS[sp.id]?.name || sp.id}. ${status}${e.dest?.name ? ` Course set for ${e.dest.name}.` : ''}`;
  const R = e.rival && RIVAL[e.rival];
  const signature = R
    ? `${(HAIL_SPECIAL[R.name] || HAIL_LINES[R.kind])[MOOD(rel)]} ${voices[rivalIds.indexOf(String(e.rival)) % voices.length] || voices[0]}`
    : '';
  for (const opening of openings[task]) {
    const text = `${opening} ${context}${signature ? `\n\n${signature}` : ''}`;
    if (!ledger.used.has(text)) {
      ledger.used.add(text);
      return text;
    }
  }
  // Meaningful fallback identifies ship, task and local coordinates, never cosmetic punctuation.
  const text = `${context} ${task === 'trade' ? 'Local traffic' : task} reporting position ${Math.round(e.x)}, ${Math.round(e.y)}. ${signature}`;
  ledger.used.add(text);
  return text;
}
