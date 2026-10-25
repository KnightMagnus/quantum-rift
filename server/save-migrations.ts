import { migrateCargoLots } from '../shared/cargo-lots.ts';
import type { PlayerAccount } from './db.ts';

/** Existing owner and marker; catalog order does not schedule live migrations. */
export interface SaveMigrationEntry {
  /** Stable catalog identifier, independent of the application release. */
  id: string;
  /** Existing implementation, not a second migration owner. */
  owner: string;
  /** Persisted marker or condition examined by the owner. */
  source: string;
  /** Result recognized by the existing owner. */
  target: string;
  /** Existing lifecycle boundary; no new startup ordering is implied. */
  boundary: string;
}

/** Inventory of compatibility owners; only cargo-ledger-v1 is rehearsed by this tool. */
export const SAVE_MIGRATION_CATALOG: readonly SaveMigrationEntry[] = Object.freeze([
  {
    id: 'cargo-ledger-v1',
    owner: 'shared/cargo-lots.ts#migrateCargoLots',
    source: 'absent cargoLots/storageLots',
    target: 'ledger version 1',
    boundary: 'Solo import and account login',
  },
  {
    id: 'tutorial-v2',
    owner: 'shared/tutorial.ts#tutMigrate',
    source: 'tutV absent or below 2',
    target: 'tutV 2',
    boundary: 'account login',
  },
  {
    id: 'hangar-defaults',
    owner: 'server/hangar.ts#hangarInit',
    source: 'absent hangar/officer/bridge/dock fields',
    target: 'owner defaults; existing hulls retained',
    boundary: 'login and hull operations',
  },
  {
    id: 'coop-world-legacy',
    owner: 'server/coop.ts#coopInit',
    source: 'legacy fleets/claims/cooldown',
    target: 'armadas; retired fields removed',
    boundary: 'Game construction',
  },
  {
    id: 'coop-player-v26',
    owner: 'server/coop.ts#coopMigrate',
    source: 'v26 absent',
    target: 'v26 true; existing refunds',
    boundary: 'account login',
  },
  {
    id: 'docks-defaults',
    owner: 'server/docks.ts#docksInit',
    source: 'legacy dock/bridge assignments',
    target: 'owner-normalized docks',
    boundary: 'login and dock operations',
  },
  {
    id: 'hostile-defaults',
    owner: 'server/hostile.ts#hostInit',
    source: 'absent hostile progression fields',
    target: 'owner defaults',
    boundary: 'account login',
  },
  {
    id: 'story-defaults',
    owner: 'server/story.ts#storyInit',
    source: 'absent story fields',
    target: 'owner defaults',
    boundary: 'account login',
  },
  {
    id: 'syndicate-defaults',
    owner: 'server/syndicate.ts#synInit',
    source: 'absent syndicate fields',
    target: 'owner defaults',
    boundary: 'account login',
  },
  {
    id: 'arcs-defaults',
    owner: 'server/arcs.ts#arcsInit',
    source: 'absent arc fields',
    target: 'owner defaults',
    boundary: 'account login',
  },
  {
    id: 'mining-v1',
    owner: 'server/mining.ts#MiningOperations.init',
    source: 'absent/version 1 mining state; reviewed append-only fields',
    target: 'validated version 1; stable generations',
    boundary: 'Game construction and system wake',
  },
  {
    id: 'refinery-v1',
    owner: 'server/refinery.ts#RefineryOperations.init',
    source: 'absent/version 1 refinery state',
    target: 'validated version 1',
    boundary: 'Game construction',
  },
  {
    id: 'industrial-v1',
    owner: 'server/industrial.ts#IndustrialOperations.init',
    source: 'absent/version 1 world and stored-hull state',
    target: 'validated version 1',
    boundary: 'Game construction and hull operations',
  },
  {
    id: 'towing-v1',
    owner: 'server/towing.ts#TowingOperations.init',
    source: 'absent/version 1 towing state',
    target: 'validated version 1',
    boundary: 'Game construction',
  },
]);

/** Detach the whole player set before invoking the existing atomic cargo owner. */
export function previewCargoMigration(players: Record<string, PlayerAccount>) {
  const migrated = structuredClone(players);
  let changedAccounts = 0;
  for (const account of Object.values(migrated))
    if (migrateCargoLots(account).changed) changedAccounts++;
  return { players: migrated, changedAccounts };
}
