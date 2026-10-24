import entries from './portrait-catalog.json' with { type: 'json' };

/** Trusted portrait metadata; neither callers nor saved URLs choose image paths. */
export const PORTRAITS = Object.freeze(entries);
const genericByEntity = new WeakMap<object, string>();
const byId = new Map(entries.map((entry) => [entry.id, entry]));
export const PLAYER_PORTRAITS = Object.freeze(entries.filter((entry) => entry.playerSelectable));
/** Only generic catalog identities are selectable by captains. */
export function isPlayerPortrait(value: unknown): value is string {
  return typeof value === 'string' && byId.get(value)?.playerSelectable === true;
}
/** Return a safe catalog identity for a legacy, unknown or malicious saved value. */
export function playerPortrait(value: unknown): string {
  return isPlayerPortrait(value) ? value : PLAYER_PORTRAITS[0].id;
}
/** Stable individual identity within a faction pool, independent of array ordering. */
export function genericPortrait(identity: string, faction: string): string {
  const pool = entries
    .filter((entry) => entry.poolEligible && entry.faction === faction)
    .sort((left, right) => left.id.localeCompare(right.id));
  const safePool = pool.length
    ? pool
    : [...PLAYER_PORTRAITS].sort((left, right) => left.id.localeCompare(right.id));
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return safePool[(hash >>> 0) % safePool.length].id;
}
/** Resolve named rivals explicitly; generic captains use their transponder identity. */
export function npcPortrait(
  entity: { rival?: string; name?: string | null; faction: string; hull: number | string },
  system: string,
): string {
  const named = entity.rival && byId.get(`npc-${entity.rival}`);
  if (named) return named.id;
  const captured = genericByEntity.get(entity);
  if (captured) return captured;
  // Named generic captains retain their face across travel and hull changes.
  // Unnamed traffic uses a reproducible spawn class, captured for that entity's life.
  const identity = entity.name
    ? `captain:${entity.name}`
    : `${system}:${entity.faction}:unnamed:${entity.hull}`;
  const selected = genericPortrait(identity, entity.faction);
  genericByEntity.set(entity, selected);
  return selected;
}
/** Never interpolate an untrusted path into an image URL. */
export function portraitAsset(value: unknown): string {
  const id = typeof value === 'string' && byId.has(value) ? value : playerPortrait(undefined);
  return `portraits/${id}.png`;
}
