// Additive migration: explicit null means unbound; never rebuild saved options.
export const RESERVED_KEYS = new Set([
  'KeyO',
  'Escape',
  'Enter',
  'F1',
  'Slash',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftRight',
]);
export function binding(keys, actions, action) {
  if (Object.hasOwn(keys, action))
    return typeof keys[action] === 'string' && keys[action] ? keys[action] : null;
  return actions.find((a) => a[0] === action)?.[2] || null;
}
export function migrateBindings(opts, actions) {
  const keys = opts.keys && typeof opts.keys === 'object' ? opts.keys : (opts.keys = {});
  if (!Object.hasOwn(keys, 'surveyPulse')) {
    const used = new Set(
      actions.filter((a) => a[0] !== 'surveyPulse').map((a) => binding(keys, actions, a[0])),
    );
    const scan = (value) => {
      if (typeof value === 'string' && value.startsWith('Key')) used.add(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(scan);
    };
    scan(opts);
    keys.surveyPulse = !used.has('KeyV') && !RESERVED_KEYS.has('KeyV') ? 'KeyV' : null;
  }
  // Older clients inserted all four nulls automatically. Upgrade that exact
  // untouched legacy bundle once; preserve custom and individually unbound keys.
  const legacy = ['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter', 'towToggle'];
  if (!opts.miningKeysVersion && legacy.every((a) => Object.hasOwn(keys, a) && keys[a] === null))
    for (const a of legacy) delete keys[a];
  const mining = [
    'miningPanel',
    ...legacy,
    'towDeliver',
    'towOffer',
    'towAccept',
    'miningGroup',
    'dredgeInput',
    'dredgeOff',
  ];
  const used = new Set(
    actions.filter((a) => !mining.includes(a[0])).map((a) => binding(keys, actions, a[0])),
  );
  for (const [a, value] of Object.entries(keys))
    if (!mining.includes(a) && typeof value === 'string') used.add(value);
  for (const a of mining) if (Object.hasOwn(keys, a) && keys[a]) used.add(keys[a]);
  for (const a of mining) {
    if (Object.hasOwn(keys, a)) continue;
    const candidate = actions.find((row) => row[0] === a)?.[2];
    keys[a] = candidate && !used.has(candidate) && !RESERVED_KEYS.has(candidate) ? candidate : null;
    if (keys[a]) used.add(keys[a]);
  }
  opts.miningKeysVersion = 1;
  return opts;
}
