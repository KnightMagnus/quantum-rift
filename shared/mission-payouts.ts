// One contract pool, divided exactly. Existing accepted missions keep their saved reward.
export function contractShares(pool: number, names: readonly string[]) {
  if (!Number.isSafeInteger(pool) || pool < 0 || !names.length) return [];
  const roster = [...new Set(names)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const base = Math.floor(pool / roster.length),
    remainder = pool % roster.length;
  return roster.map((name, index) => ({ name, share: base + (index < remainder ? 1 : 0) }));
}
