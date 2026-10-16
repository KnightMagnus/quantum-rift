// Display-only changes: never alter star profiles, navigable worlds or ship sizes.
export function backgroundScale(kind, description = '') {
  if (kind === 'wreck') return 0.5;
  if (kind === 'world' && /gas giant/i.test(description)) return 0.6;
  return 1;
}
