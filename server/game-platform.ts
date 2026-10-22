import type { SeedDefinition } from './game.ts';

/** Host services used by the shared authoritative game. No host globals are read here. */
export interface GamePlatform {
  /** Startup accounts; an empty list disables showcase/developer seeding. */
  seedDefinitions: readonly SeedDefinition[];
  /** False when the host calls Game.tick from its authoritative match loop. */
  automaticClock: boolean;
  /** Start the repeating game clock. Required only with automaticClock enabled. */
  startClock?: (callback: () => void, intervalMs: number) => void;
  /** Queue a callback on the host's serialized execution loop, after the delay. */
  defer: (callback: () => void, delayMs: number) => void;
  /** Cryptographically secure UUID supplied by the host (for example nk.uuidv4). */
  randomUUID: () => string;
  /** Optional developer-only invasion destination; absent in online matches. */
  invasionNow?: string;
}

/** Minimal transport consumed by the game, implemented by Solo sockets or native match presences. */
export interface GameConnection {
  /** Whether targeted game messages can still be delivered. */
  open: boolean;
  /** Pending transport output bytes, if exposed by the host. */
  readonly backlog: number;
  /** Subscribe to decoded text messages or one terminal close notification. */
  on(event: 'message', listener: (message: string) => void): void;
  on(event: 'close', listener: () => void): void;
  /** Send server-owned game state to this connection only. */
  send(data: string | object): void;
  /** Close only this connection. */
  close(): void;
}
