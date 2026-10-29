// The official SDK is an ambient script, not an importable module.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./nakama-runtime.d.ts" />
import { validateFeatureSnapshots } from './save-validation.ts';
import { utf8Bytes } from '../shared/health.ts';
import type { HealthMonitor } from '../shared/health.ts';
import type { GameStorage } from './game-storage.ts';
import type { PlayerAccount, WorldData } from './db.ts';
import type { PlayerData } from './game.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';
import {
  canonicalCaptain,
  NAKAMA_CHECKPOINT_KEY,
  NAKAMA_COLLECTION,
} from '../shared/nakama-contracts.ts';
/** Lossless legacy-shaped game state committed as one PostgreSQL storage row. */
export interface NakamaCheckpoint {
  schema: 1;
  revision: number;
  players: Record<string, PlayerAccount>;
  world: WorldData;
  migrationId?: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** Reject corruption rather than silently resetting a live economy. */
export function validateCheckpoint(value: unknown): asserts value is NakamaCheckpoint {
  if (
    !record(value) ||
    value.schema !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !record(value.players) ||
    !record(value.world) ||
    !record(value.world.sites)
  )
    throw new Error('Invalid Nakama checkpoint');
  for (const key of Object.keys(value.players)) {
    const account = value.players[key];
    if (
      canonicalCaptain(key) !== key ||
      !record(account) ||
      typeof account.name !== 'string' ||
      canonicalCaptain(account.name) !== key ||
      typeof account.created !== 'number' ||
      !Number.isFinite(account.created)
    )
      throw new Error('Invalid Nakama player checkpoint');
  }
  validateFeatureSnapshots(value.players, value.world);
}
/** Native API adapter: the zero UUID is system ownership, not a player principal. */
export function nakamaStorageBackend(
  nk: Pick<nkruntime.Nakama, 'storageRead' | 'storageWrite'>,
): StorageBackend {
  return {
    read(key) {
      const rows = nk.storageRead([
        { collection: NAKAMA_COLLECTION, key, userId: '00000000-0000-0000-0000-000000000000' },
      ]);
      if (!rows.length) return null;
      return { value: rows[0].value, version: rows[0].version };
    },
    write(key, value, version) {
      const rows = nk.storageWrite([
        {
          collection: NAKAMA_COLLECTION,
          key,
          userId: '00000000-0000-0000-0000-000000000000',
          value,
          version,
          permissionRead: 0,
          permissionWrite: 0,
        },
      ]);
      if (rows.length !== 1 || !rows[0].version)
        throw new Error('Missing checkpoint acknowledgement');
      return rows[0].version;
    },
  };
}
/** One Game in one match. A second writer loses CAS instead of merging economies. */
export class NakamaDatabase implements GameStorage {
  players: Record<string, PlayerAccount>;
  world: WorldData;
  economicFrozen = false;
  dirty = false;
  /** In-memory mutation sequence; isolates action effects from later simulation ticks. */
  mutationSequence = 0;
  private backend: StorageBackend;
  private version: string;
  private revision: number;
  private migrationId?: string;
  private authenticated: string | null = null;
  /** Optional host-owned diagnostics, excluded from checkpoints. */
  health?: HealthMonitor;
  constructor(backend: StorageBackend, health?: HealthMonitor) {
    this.health = health;
    this.backend = backend;
    const saved = backend.read(NAKAMA_CHECKPOINT_KEY);
    if (saved) {
      validateCheckpoint(saved.value);
      const checkpoint: NakamaCheckpoint = JSON.parse(JSON.stringify(saved.value));
      this.players = Object.assign(Object.create(null), checkpoint.players);
      this.world = checkpoint.world;
      this.version = saved.version;
      this.revision = checkpoint.revision;
      this.migrationId = checkpoint.migrationId;
    } else {
      this.players = Object.create(null);
      this.world = { sites: {}, armadas: {} } as WorldData;
      this.version = '*';
      this.revision = 0;
    }
  }
  key(name: string): string {
    return canonicalCaptain(name);
  }
  get(name: string): PlayerAccount | null {
    return this.players[this.key(name)] ?? null;
  }
  /** Only the transport's verified Nakama principal may establish this synchronous scope. */
  withAuthenticatedCaptain<T>(name: string, callback: () => T): T {
    if (this.authenticated !== null) throw new Error('Nested authentication scope');
    this.authenticated = this.key(name);
    try {
      return callback();
    } finally {
      this.authenticated = null;
    }
  }
  create(name: string, _pass: string, fresh: Partial<Omit<PlayerData, 'name'>>): PlayerAccount {
    const canonical = this.key(name);
    if (this.economicFrozen || this.authenticated !== canonical)
      throw new Error('Authenticated captain required');
    if (this.get(name)) throw new Error('Captain already exists');
    const account = {
      ...fresh,
      name: name.trim(),
      salt: '',
      hash: '',
      created: Date.now(),
    } as PlayerAccount;
    this.players[canonical] = account;
    this.touch();
    this.flush();
    return account;
  }
  check(account: PlayerAccount, _pass: string): boolean {
    return (
      !this.economicFrozen &&
      this.authenticated !== null &&
      this.authenticated === this.key(account.name) &&
      this.get(account.name) === account
    );
  }
  touch(): void {
    if (this.economicFrozen) throw new Error('Database frozen; restart required');
    this.mutationSequence++;
    this.dirty = true;
  }
  hasPendingCheckpoint(): boolean {
    return this.economicFrozen;
  }
  flush(): void {
    if (this.economicFrozen)
      throw new Error('Database frozen; checkpoint requires recovery by restart');
    if (!this.dirty) return;
    const started = this.health?.now() ?? 0;
    const checkpoint: NakamaCheckpoint = {
      schema: 1,
      revision: this.revision + 1,
      players: this.players,
      world: this.world,
      ...(this.migrationId ? { migrationId: this.migrationId } : {}),
    };
    validateCheckpoint(checkpoint);
    const serializeStarted = this.health?.now() ?? 0;
    const serialized = JSON.stringify(checkpoint);
    const detached: NakamaCheckpoint = JSON.parse(serialized);
    if (this.health) {
      this.health.observe('checkpointSerializeMs', this.health.now() - serializeStarted);
      this.health.observe('checkpointBytes', utf8Bytes(serialized));
    }
    // Write errors may follow a committed transaction with a lost acknowledgement.
    // No rollback or retry can safely run until a new VM reads the durable checkpoint.
    try {
      this.version = this.backend.write(NAKAMA_CHECKPOINT_KEY, detached, this.version);
    } catch (error) {
      this.economicFrozen = true;
      this.health?.observe('checkpointFreezes', 1);
      throw error;
    } finally {
      if (this.health) this.health.observe('checkpointMs', this.health.now() - started);
    }
    this.revision++;
    this.dirty = false;
  }
}
