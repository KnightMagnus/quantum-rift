import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { ComputedShipStats } from '../shared/rules.ts';
import type { Session } from './game.ts';
export type CargoPlayer = import('./game.ts').PlayerData;

/**
 * Incremental contracts: these describe only Fleet Commands' boundary, not a
 * complete save schema, a wire validator, or all the fields on a live entity.
 * Live ship entity interacting with fleet commands and AI maneuvers.
 */
export type CommandEntity = import('./space.ts').Entity;
export type CommandSession = Session;
export type CargoLoot = {
  cargo: string;
  n: number;
  lots?: GradeLots;
  /** Purchase costs carried by recoverable cargo. */
  basis?: GradeLots;
  jettisonPickup?: { owner: string; sys: string; until: number };
};
export type FloatingCargo = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  it: CargoLoot;
  t: number;
  kind: number;
};

/** System space simulation environment boundary for fleet command execution. */
export type CommandSpace = import('./space.ts').Space;

/** Ship performance, defensive, and capacity statistics. */
export type ShipStats = {
  /** Maximum cargo hold capacity in tons. */
  cargo: number;

  /** Maximum armor hit points. */
  armor?: number;

  /** Maximum shield capacity. */
  shields?: number;

  /** Maximum linear flight speed. */
  speed?: number;

  /** Acceleration rating. */
  accel?: number;

  /** Turn rate in radians per second. */
  turn?: number;

  /** Total ship mass. */
  mass?: number;

  /** Available outfit space. */
  space?: number;

  /** Computed combat power rating. */
  combat?: number;
};

/** Service dependencies and capabilities injected into fleet command handlers. */
export type FleetCommandsCapabilities = {
  /** Displays an in-HUD toast notification to the player. */
  toast: (session: CommandSession, text: string) => void;

  /** Transmits an order update message to the client. */
  send: (session: CommandSession, message: { t: 'order'; o: string }) => void;

  /** Transmits updated player state telemetry to the client. */
  you: (session: CommandSession) => void;

  /** Computes maximum cargo capacity statistics for the player. */
  stats: (player: CargoPlayer) => ComputedShipStats | ShipStats | null;

  /** Total hold usage including mission cargo. */
  holdUsed: (player: CargoPlayer) => number;

  /** Active solar system space instances indexed by system ID. */
  spaces: Record<string, CommandSpace>;
};
