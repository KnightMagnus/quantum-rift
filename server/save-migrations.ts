import { migrateCargoLots } from '../shared/cargo-lots.ts';
import type { PlayerAccount } from './db.ts';
import { tutMigrate, TUT_VERSION } from '../shared/tutorial.ts';

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

/** Version of this inventory/report format, not a global saved-game schema. */
export const SAVE_MIGRATION_CATALOG_VERSION = 1;

/** Explicit rehearsal order; live Game lifecycle ordering remains unchanged. */
export const SAVE_REHEARSAL_PLAN = Object.freeze(['cargo-ledger-v1', 'tutorial-v2'] as const);

/** Inventory of compatibility owners; the rehearsal plan names the executable subset. */
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

/** Validate only tutorial marker/progress fields before invoking their existing owner. */
export function validateTutorialSave(account: PlayerAccount): void {
  const version = account.tutV;
  if (version != null && ![0, 1, TUT_VERSION].includes(version))
    throw new Error('Tutorial save: unsupported version');
  // Completed-guide sentinels above the current list length remain valid. The old
  // owner adds at most three; reject overflow instead of losing integer precision.
  const maximum =
    (version || 1) < TUT_VERSION ? Number.MAX_SAFE_INTEGER - 3 : Number.MAX_SAFE_INTEGER;
  if (
    account.tut != null &&
    (!Number.isSafeInteger(account.tut) || account.tut < 0 || account.tut > maximum)
  )
    throw new Error('Tutorial save: invalid progression');
}

const REHEARSAL_OWNERS = Object.freeze({
  'cargo-ledger-v1': migrateCargoLots,
  'tutorial-v2': tutMigrate,
});

/** Rehearse the supported owner subset on detached accounts, never a live store. */
export function previewSaveMigrations(players: Record<string, PlayerAccount>) {
  // Check the whole batch before any owner executes, including a late rejection.
  for (const account of Object.values(players)) validateTutorialSave(account);
  const migrated = structuredClone(players);
  for (const id of SAVE_REHEARSAL_PLAN)
    for (const account of Object.values(migrated)) REHEARSAL_OWNERS[id](account);
  let changedAccounts = 0;
  for (const [key, account] of Object.entries(migrated)) {
    validateTutorialSave(account);
    if (JSON.stringify(account) !== JSON.stringify(players[key])) changedAccounts++;
  }
  return { players: migrated, changedAccounts };
}
