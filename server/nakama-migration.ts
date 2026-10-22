import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { PlayerAccount, WorldData } from './db.ts';
import type { CaptainCredential, StorageBackend } from '../shared/nakama-contracts.ts';
import {
  NAKAMA_COLLECTION,
  nakamaUtf8,
  canonicalCaptain,
  credentialKey,
  NAKAMA_CHECKPOINT_KEY,
} from '../shared/nakama-contracts.ts';
import { nakamaStorageBackend, validateCheckpoint } from './nakama-storage.ts';
import type { NakamaCheckpoint } from './nakama-storage.ts';

/** Offline input only. A committed journal supersedes both legacy files. */
export interface LegacyBundle {
  players: string;
  world: string;
  journal?: { version: number; players: string; world: string };
}
export interface MigrationPreview {
  migrationId: string;
  count: number;
  hash: string;
  checkpoint: NakamaCheckpoint;
  credentials: Record<string, CaptainCredential>;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
/** Read-only deterministic validation/preview. Does not write storage or expose secrets in summary. */
export function previewLegacyMigration(
  bundle: LegacyBundle,
  migrationId: string,
): MigrationPreview {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(migrationId)) throw new Error('Invalid migration id');
  if (
    bundle.journal &&
    (bundle.journal.version !== 1 ||
      typeof bundle.journal.players !== 'string' ||
      typeof bundle.journal.world !== 'string')
  )
    throw new Error('Invalid legacy checkpoint journal');
  const source = bundle.journal ?? bundle;
  const players = JSON.parse(source.players) as Record<string, PlayerAccount>;
  const world = JSON.parse(source.world) as WorldData;
  const checkpoint: NakamaCheckpoint = { schema: 1, revision: 0, players, world, migrationId };
  validateCheckpoint(checkpoint);
  const credentials: Record<string, CaptainCredential> = Object.create(null);
  for (const [key, account] of Object.entries(players)) {
    if (
      canonicalCaptain(key) !== key ||
      !/^[a-f0-9]{32}$/i.test(account.salt) ||
      !/^[a-f0-9]{64}$/i.test(account.hash)
    )
      throw new Error('Invalid legacy credential');
    credentials[key] = {
      schema: 1,
      canonical: key,
      displayName: account.name,
      created: account.created,
      password: { kind: 'legacy-scrypt', salt: account.salt, hash: account.hash },
      migrationId,
    };
    // Preserve legacy export fields, but remove secret copies from online gameplay storage.
    account.salt = '';
    account.hash = '';
  }
  const hash = bytesToHex(sha256(nakamaUtf8(stable({ checkpoint, credentials }))));
  return { migrationId, count: Object.keys(players).length, hash, checkpoint, credentials };
}

/** Restricted port: credentials and checkpoint must install in ONE native storageWrite transaction. */
export interface MigrationBackend extends StorageBackend {
  writeBatch(rows: Array<{ key: string; value: object; version: string }>): void;
  /** Atomic CAS-guarded removal supported only by the offline migration host. */
  revertBatch?(rows: Array<{ key: string; version: string }>): void;
}
/** Explicit offline apply. Existing worlds must match this exact untouched import. */
export function applyLegacyMigration(
  backend: MigrationBackend,
  preview: MigrationPreview,
): 'applied' | 'already-applied' {
  validateCheckpoint(preview.checkpoint);
  if (
    preview.hash !==
    bytesToHex(
      sha256(
        nakamaUtf8(stable({ checkpoint: preview.checkpoint, credentials: preview.credentials })),
      ),
    )
  ) {
    throw new Error('Migration preview changed');
  }
  const current = backend.read(NAKAMA_CHECKPOINT_KEY);
  const markerKey = 'migration:' + preview.migrationId;
  const marker = backend.read(markerKey);
  if (marker) {
    const saved = marker.value as { hash?: string };
    if (
      saved.hash !== preview.hash ||
      !current ||
      stable(current.value) !== stable(preview.checkpoint)
    ) {
      throw new Error('Migration already changed; refusing overwrite');
    }
    return 'already-applied';
  }
  if (current) throw new Error('Live checkpoint exists; refusing overwrite');
  const rows: Array<{ key: string; value: object; version: string }> = Object.entries(
    preview.credentials,
  ).map(([name, value]) => ({ key: credentialKey(name), value, version: '*' }));
  rows.push({ key: NAKAMA_CHECKPOINT_KEY, value: preview.checkpoint, version: '*' });
  rows.push({ key: markerKey, value: { hash: preview.hash }, version: '*' });
  backend.writeBatch(rows);
  return 'applied';
}

/** Never revert an import after a gameplay save or password upgrade. */
export function rollbackLegacyMigration(
  backend: MigrationBackend,
  preview: MigrationPreview,
): void {
  if (!backend.revertBatch) throw new Error('Atomic rollback unavailable');
  const checkpoint = backend.read(NAKAMA_CHECKPOINT_KEY);
  const markerKey = 'migration:' + preview.migrationId;
  const marker = backend.read(markerKey);
  if (
    !checkpoint ||
    !marker ||
    stable(checkpoint.value) !== stable(preview.checkpoint) ||
    (marker.value as { hash?: string }).hash !== preview.hash
  )
    throw new Error('Migration changed; rollback refused');
  const rows = [
    { key: NAKAMA_CHECKPOINT_KEY, version: checkpoint.version },
    { key: markerKey, version: marker.version },
  ];
  for (const [name, expected] of Object.entries(preview.credentials)) {
    const key = credentialKey(name);
    const current = backend.read(key);
    if (!current || stable(current.value) !== stable(expected))
      throw new Error('Credential changed; rollback refused');
    rows.push({ key, version: current.version });
  }
  backend.revertBatch(rows);
}

/** Offline-only native migration port; callers must never expose it as a player RPC. */
export function nakamaMigrationBackend(
  nk: Pick<nkruntime.Nakama, 'storageRead' | 'storageWrite' | 'storageDelete'>,
): MigrationBackend {
  const ordinary = nakamaStorageBackend(nk);
  return {
    ...ordinary,
    writeBatch(rows) {
      const acknowledgements = nk.storageWrite(
        rows.map((row) => ({
          collection: NAKAMA_COLLECTION,
          key: row.key,
          userId: '00000000-0000-0000-0000-000000000000',
          value: row.value,
          version: row.version,
          permissionRead: 0,
          permissionWrite: 0,
        })),
      );
      if (acknowledgements.length !== rows.length)
        throw new Error('Uncertain migration acknowledgement; inspect durable state');
    },
    revertBatch(rows) {
      nk.storageDelete(
        rows.map((row) => ({
          collection: NAKAMA_COLLECTION,
          key: row.key,
          userId: '00000000-0000-0000-0000-000000000000',
          version: row.version,
        })),
      );
    },
  };
}
