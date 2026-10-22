import type { StorageBackend } from '../shared/nakama-contracts.ts';
export const WORLD_LEASE = 'world_match_v1';
export interface WorldLease {
  matchId: string | null;
  leaseId: string;
  created: number;
}
export interface WorldMatchHost {
  exists(matchId: string): boolean;
  create(leaseId: string): string;
  retire(matchId: string, leaseId: string): void;
  uuid(): string;
  now(): number;
}
function isLease(value: unknown): value is WorldLease {
  return (
    value !== null &&
    typeof value === 'object' &&
    'matchId' in value &&
    (value.matchId === null || typeof value.matchId === 'string') &&
    'leaseId' in value &&
    typeof value.leaseId === 'string' &&
    value.leaseId.length > 0 &&
    'created' in value &&
    typeof value.created === 'number' &&
    Number.isFinite(value.created)
  );
}
export function readWorldLease(
  backend: StorageBackend,
): { value: WorldLease; version: string } | null {
  const row = backend.read(WORLD_LEASE);
  if (!row) return null;
  if (!isLease(row.value)) throw new Error('Invalid world lease');
  return { value: row.value, version: row.version };
}
/** A reservation is not permission to advance or accept players before its match is published. */
export function worldAuthority(
  backend: StorageBackend,
  leaseId: string,
  matchId: string,
): 'pending' | 'ready' | 'lost' {
  const row = readWorldLease(backend);
  if (!row || row.value.leaseId !== leaseId) return 'lost';
  return row.value.matchId === null ? 'pending' : row.value.matchId === matchId ? 'ready' : 'lost';
}
export function findOrCreateWorld(backend: StorageBackend, host: WorldMatchHost): string {
  const existing = readWorldLease(backend);
  const current = existing?.value;
  if (current?.matchId && host.exists(current.matchId)) return current.matchId;
  if (current?.matchId === null && host.now() - current.created < 5000)
    throw new Error('World is starting; reconnect shortly');
  const reservation: WorldLease = { matchId: null, leaseId: host.uuid(), created: host.now() };
  const version = backend.write(WORLD_LEASE, reservation, existing?.version ?? '*');
  const matchId = host.create(reservation.leaseId);
  try {
    backend.write(WORLD_LEASE, { ...reservation, matchId }, version);
  } catch (error) {
    // Resolve a lost publish acknowledgement; never retire the world that actually won.
    try {
      if (worldAuthority(backend, reservation.leaseId, matchId) === 'ready') return matchId;
    } catch {}
    try {
      host.retire(matchId, reservation.leaseId);
    } catch {}
    throw error;
  }
  return matchId;
}
