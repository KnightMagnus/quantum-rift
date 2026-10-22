import type { PlayerAccount, WorldData } from './db.ts';
import type { PlayerData } from './game.ts';
import type { GamePlatform } from './game-platform.ts';

/** Synchronous authority-owned account/world store, independent of filesystem layout. */
export interface GameStorage {
  /** Mutable account records keyed by normalized captain name. */
  players: Record<string, PlayerAccount>;
  /** Mutable shared galaxy state, committed with account changes. */
  world: WorldData;
  /** Blocks economic mutation after an uncertain durable commit. */
  economicFrozen: boolean;
  /** Whether in-memory changes await a durable checkpoint. */
  dirty: boolean;
  /** Normalize a captain name for lookup. */
  key(name: string): string;
  /** Find an existing account, or null. */
  get(name: string): PlayerAccount | null;
  /** Create an account using this host's identity policy. */
  create(name: string, pass: string, fresh: Partial<Omit<PlayerData, 'name'>>): PlayerAccount;
  /** Verify account credentials according to this host's identity policy. */
  check(account: PlayerAccount, pass: string): boolean;
  /** Mark mutable state as needing persistence. */
  touch(): void;
  /** Commit pending state; throw on failure or uncertain outcome. */
  flush(): void;
  /** True when rollback is unsafe: a committed journal exists or recovery is required. */
  hasPendingCheckpoint(): boolean;
  /** Optional default host adapter. Explicit constructor platform takes precedence. */
  gamePlatform?: () => GamePlatform;
}
