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
export type ActionBinding = readonly [string, string, string | null, ...unknown[]];
export interface BindingOptions {
  keys?: Record<string, string | null>;
  miningKeysVersion?: number;
  [preference: string]: unknown;
}
export function binding(
  keys: Record<string, string | null>,
  actions: readonly ActionBinding[],
  action: string,
): string | null {
  if (Object.hasOwn(keys, action))
    return typeof keys[action] === 'string' && keys[action] ? keys[action] : null;
  return actions.find((actionBinding) => actionBinding[0] === action)?.[2] || null;
}
export function migrateBindings<ValueType extends BindingOptions>(
  options: ValueType,
  actions: readonly ActionBinding[],
): ValueType {
  const keys =
    options.keys && typeof options.keys === 'object' ? options.keys : (options.keys = {});
  if (!Object.hasOwn(keys, 'surveyPulse')) {
    const used = new Set(
      actions
        .filter((actionBinding) => actionBinding[0] !== 'surveyPulse')
        .map((actionBinding) => binding(keys, actions, actionBinding[0])),
    );
    const scan = (value: unknown): void => {
      if (typeof value === 'string' && value.startsWith('Key')) used.add(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(scan);
    };
    scan(options);
    keys.surveyPulse = !used.has('KeyV') && !RESERVED_KEYS.has('KeyV') ? 'KeyV' : null;
  }
  // Older clients inserted all four nulls automatically. Upgrade that exact
  // untouched legacy bundle once; preserve custom and individually unbound keys.
  const legacy = ['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter', 'towToggle'];
  if (
    !options.miningKeysVersion &&
    legacy.every((firstValue) => Object.hasOwn(keys, firstValue) && keys[firstValue] === null)
  )
    for (const legacy2 of legacy) delete keys[legacy2];
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
    actions
      .filter((actionBinding) => !mining.includes(actionBinding[0]))
      .map((actionBinding) => binding(keys, actions, actionBinding[0])),
  );
  for (const [firstValue, value] of Object.entries(keys))
    if (!mining.includes(firstValue) && typeof value === 'string') used.add(value);
  for (const mining2 of mining)
    if (Object.hasOwn(keys, mining2) && keys[mining2]) used.add(keys[mining2]);
  for (const mining3 of mining) {
    if (Object.hasOwn(keys, mining3)) continue;
    const candidate = actions.find((actionBinding) => actionBinding[0] === mining3)?.[2];
    keys[mining3] =
      candidate && !used.has(candidate) && !RESERVED_KEYS.has(candidate) ? candidate : null;
    if (keys[mining3]) used.add(keys[mining3]);
  }
  options.miningKeysVersion = 1;
  return options;
}
