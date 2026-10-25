import type { IndexFleetWorld } from './index-fleet.ts';
import type { NhalPopulation } from './nhal.ts';
import type { IndexWorld } from './index-worksite.ts';
import { HealthMonitor } from '../shared/health.ts';
import type { SeedDefinition } from './game.ts';
import type { GamePlatform } from './game-platform.ts';
import type { GameStorage } from './game-storage.ts';
import type { FeatureWorldState } from './world-contracts.ts';

import type { PlayerData } from './game.ts';
import type { IndustrialWorld } from './industrial-contracts.ts';
import type { SavedMiningWorld } from './mining-contracts.ts';
import type { SavedMiningPressure } from './mining-pressure-contracts.ts';
import type { SavedRefinery } from './refinery-contracts.ts';
import type { TowWorld } from './towing-contracts.ts';

/** Persisted player account record and save file state. */
export type AccountCredentials = {
  /** Captain display name. */
  name: string;

  /** Cryptographic salt in hexadecimal. */
  salt: string;

  /** Scrypt password hash in hexadecimal. */
  hash: string;

  /** Account creation timestamp in milliseconds. */
  created: number;

  /** Associated player save state data. */
  data?: PlayerData;
};
export type PlayerAccount = PlayerData & AccountCredentials;
export interface ArmadaState {
  id: string;
  name: string;
  leader: string;
  members: string[];
  invites: Record<string, number>;
  t: number;
  emptyT: number;
}

/** Persisted galaxy world state data. */
export type WorldData = FeatureWorldState & {
  armadas: Record<string, ArmadaState>;
  towing?: TowWorld;
  industrial?: IndustrialWorld;

  /** World sites and player claim data. */
  sites: Record<string, string>;
  /** Neutral Index worksite timers and finite replacements. */
  indexWorksite?: IndexWorld;
  /** Native Deep finite population budgets. */
  nhal?: Record<string, NhalPopulation>;
  /** One finite neutral workgroup per Farside system. */
  indexFleets?: Record<string, IndexFleetWorld>;
  mining?: SavedMiningWorld;
  refinery?: SavedRefinery;
  miningPressure?: SavedMiningPressure;
};

// Player accounts and saves: one JSON file, written atomically. Passwords are scrypt-hashed.
import fileSystem from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Missing files are fresh state; unreadable or corrupt existing files are not. */
function readSavedJson(filename: string): unknown {
  let serialized: string;
  try {
    serialized = fileSystem.readFileSync(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return JSON.parse(serialized);
}

function savedRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Only envelope shape is checked here; feature owners retain their validators. */
function validateLocalSnapshots(players: unknown, world: unknown): void {
  if (!savedRecord(players) || Object.values(players).some((account) => !savedRecord(account)))
    throw new Error('Invalid local player snapshot');
  if (!savedRecord(world) || !savedRecord(world.sites))
    throw new Error('Invalid local world snapshot');
}

/**
 * Player account and world state persistence engine managing JSON files, atomic writes,
 * and rolling backups. Passwords are scrypt-hashed with unique salts.
 */
export class DB implements GameStorage {
  declare journal: string;

  declare dir: string;
  declare file: string;
  declare players: Record<string, PlayerAccount>;
  declare wfile: string;
  declare world: WorldData;
  declare economicFrozen: boolean;
  declare dirty: boolean;

  /**
   * Initializes the database in the target directory and loads existing data from disk.
   * @param direction Storage directory path for player and world database files.
   */
  constructor(direction: string) {
    this.dir = direction;
    fileSystem.mkdirSync(direction, { recursive: true });

    this.file = path.join(direction, 'players.json');
    this.wfile = path.join(direction, 'world.json');
    this.journal = path.join(direction, 'checkpoint.json');
    // Complete a committed checkpoint before exposing either half to Game.
    const saved = readSavedJson(this.journal);
    if (saved !== undefined) {
      if (
        !savedRecord(saved) ||
        saved.version !== 1 ||
        typeof saved.players !== 'string' ||
        typeof saved.world !== 'string'
      )
        throw new Error('Invalid committed database checkpoint');
      validateLocalSnapshots(JSON.parse(saved.players), JSON.parse(saved.world));
      this.writeDurable(this.file + '.tmp', saved.players);
      fileSystem.renameSync(this.file + '.tmp', this.file);
      this.writeDurable(this.wfile + '.tmp', saved.world);
      fileSystem.renameSync(this.wfile + '.tmp', this.wfile);
      this.syncDirectory();
      fileSystem.unlinkSync(this.journal);
      this.syncDirectory();
    }

    const savedPlayers = readSavedJson(this.file);
    const savedWorld = readSavedJson(this.wfile);
    const players = savedPlayers === undefined ? {} : savedPlayers;
    const world = savedWorld === undefined ? { sites: {} } : savedWorld;
    validateLocalSnapshots(players, world);
    // No prototype, so saved names cannot reach object internals.
    this.players = Object.assign(Object.create(null), players);
    this.world = world as WorldData;

    this.economicFrozen = false;
    this.dirty = false;
    setInterval(() => {
      if (!this.economicFrozen) this.flush();
    }, 15000).unref();
    setInterval(() => this.backup(), 30 * 60000).unref();
    setTimeout(() => this.backup(), 60000).unref();
  }

  /** Node-only startup services. Portable hosts pass their platform directly to Game. */
  gamePlatform(): GamePlatform {
    let seedDefinitions: SeedDefinition[] = [];
    try {
      seedDefinitions = JSON.parse(
        fileSystem.readFileSync(
          process.env.SEEDS_FILE || new URL('./seeds.json', import.meta.url),
          'utf8',
        ),
      );
    } catch {
      /* Missing optional local seed file leaves the account store unchanged. */
    }
    return {
      health: process.env.RIFT_HEALTH === '1' ? new HealthMonitor() : undefined,
      seedDefinitions,
      automaticClock: true,
      startClock: (callback, intervalMs) => {
        setInterval(callback, intervalMs);
      },
      defer: (callback, delayMs) => {
        setTimeout(callback, delayMs);
      },
      randomUUID: () => crypto.randomUUID(),
      invasionNow: process.env.INVASION_NOW,
    };
  }

  /** An installed journal or an uncertain commit must not be rolled back in memory. */
  hasPendingCheckpoint(): boolean {
    return this.economicFrozen || fileSystem.existsSync(this.journal);
  }

  /**
   * Generates rolling timestamped backups of player and world database files, retaining the 12 most recent.
   * Backups are saved under data/backups/<timestamp>/players.json + world.json.
   */
  backup(): void {
    try {
      if (!fileSystem.existsSync(this.file) || fileSystem.existsSync(this.journal)) return;
      const root = path.join(this.dir, 'backups'),
        stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
        join2 = path.join(root, stamp);
      fileSystem.mkdirSync(join2, { recursive: true });
      fileSystem.copyFileSync(this.file, path.join(join2, 'players.json'));
      if (fileSystem.existsSync(this.wfile))
        fileSystem.copyFileSync(this.wfile, path.join(join2, 'world.json'));
      const sort2 = fileSystem.readdirSync(root).sort();
      for (const slice2 of sort2.slice(0, Math.max(0, sort2.length - 12)))
        fileSystem.rmSync(path.join(root, slice2), { recursive: true, force: true });
    } catch (event) {
      console.error('backup failed', (event as Error).message);
    }
  }

  /**
   * Normalizes a captain name into a trimmed, lowercase account lookup key.
   * @param name Captain name.
   * @returns Lowercase normalized lookup key.
   */
  key(name: string): string {
    return String(name).trim().toLowerCase();
  }

  /**
   * Retrieves an existing player account by captain name.
   * @param name Captain name.
   * @returns Player account record or null if not found.
   */
  get(name: string): PlayerAccount | null {
    const entryKey = this.key(name);
    return Object.prototype.hasOwnProperty.call(this.players, entryKey)
      ? this.players[entryKey]
      : null;
  }

  /**
   * Creates, persists, and returns a new player account with a hashed password and initial save data.
   * @param name Captain name.
   * @param pass Plaintext password.
   * @param fresh Initial player state and save properties.
   * @returns Newly created player account record.
   */
  create(name: string, pass: string, fresh: Partial<Omit<PlayerData, 'name'>>): PlayerAccount {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
    const playerAccount = {
      name: String(name).trim(),
      salt,
      hash,
      created: Date.now(),
      ...fresh,
    } as PlayerAccount;
    this.players[this.key(name)] = playerAccount;
    this.dirty = true;
    this.flush();
    return playerAccount;
  }

  /**
   * Verifies a plaintext password against a player's stored scrypt hash using timing-safe comparison.
   * @param playerAccount Stored player account record.
   * @param pass Plaintext password to verify.
   * @returns True if the password matches the stored hash, false otherwise.
   */
  check(playerAccount: PlayerAccount, pass: string): boolean {
    const nonSharedBuffer = crypto.scryptSync(pass, playerAccount.salt, 32);
    return crypto.timingSafeEqual(nonSharedBuffer, Buffer.from(playerAccount.hash, 'hex'));
  }

  /**
   * Marks the database as dirty to ensure changes are flushed on the next sync interval.
   */
  touch(): void {
    this.dirty = true;
  }

  /**
   * Atomically flushes dirty in-memory player and world state to disk via temporary files.
   */

  writeDurable(file: string, text: string) {
    const openSync2 = fileSystem.openSync(file, 'w');
    try {
      fileSystem.writeFileSync(openSync2, text);
      fileSystem.fsyncSync(openSync2);
    } finally {
      fileSystem.closeSync(openSync2);
    }
  }
  syncDirectory() {
    // Windows cannot fsync a directory handle opened by Node's fs.openSync.
    // Keep regular-file fsyncs and journal recovery; only POSIX directory syncing
    // is unavailable here (so Windows has no extra directory-metadata barrier).
    if (process.platform === 'win32') return;
    const openSync2 = fileSystem.openSync(this.dir, 'r');
    try {
      fileSystem.fsyncSync(openSync2);
    } finally {
      fileSystem.closeSync(openSync2);
    }
  }
  flush() {
    if (this.economicFrozen)
      throw new Error('Database frozen; checkpoint requires recovery by restart');
    if (!this.dirty) return;
    // Journal commit point precedes both renames. Recovery rolls both halves forward.
    // Never overwrite a committed journal after a failed flush: require restart/recovery.
    if (fileSystem.existsSync(this.journal))
      throw new Error('Pending database checkpoint requires recovery');
    const players = JSON.stringify(this.players),
      world = JSON.stringify(this.world);
    this.writeDurable(this.journal + '.tmp', JSON.stringify({ version: 1, players, world }));
    // Once journal installation is attempted its outcome may be uncertain, even
    // if an error arrives after unlink. Never roll memory back or autosave over it.
    try {
      fileSystem.renameSync(this.journal + '.tmp', this.journal);
      this.syncDirectory();
      this.writeDurable(this.file + '.tmp', players);
      fileSystem.renameSync(this.file + '.tmp', this.file);
      this.writeDurable(this.wfile + '.tmp', world);
      fileSystem.renameSync(this.wfile + '.tmp', this.wfile);
      this.syncDirectory();
      fileSystem.unlinkSync(this.journal);
      this.syncDirectory();
    } catch (error) {
      this.economicFrozen = true;
      throw error;
    }
    this.dirty = false;
  }
}
