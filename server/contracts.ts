import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { ComputedShipStats } from '../shared/rules.ts';
import type { Session } from './game.ts';
export type CargoPlayer = import('./game.ts').PlayerData;
export type CommandEntity = import('./space.ts').Entity;
export type CommandSession = Session;
export type CargoLoot = {
  cargo: string;
  n: number;
  lots?: GradeLots;
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
export type CommandSpace = import('./space.ts').Space;
export type ShipStats = {
  cargo: number;
  armor?: number;
  shields?: number;
  speed?: number;
  accel?: number;
  turn?: number;
  mass?: number;
  space?: number;
  combat?: number;
};
export type FleetCommandsCapabilities = {
  toast: (session: CommandSession, text: string) => void;
  send: (session: CommandSession, message: { t: 'order'; o: string }) => void;
  you: (session: CommandSession) => void;
  stats: (player: CargoPlayer) => ComputedShipStats | ShipStats | null;
  holdUsed: (player: CargoPlayer) => number;
  spaces: Record<string, CommandSpace>;
};
/**
 * Incremental contracts: these describe only Fleet Commands' boundary, not a
 * complete save schema, a wire validator, or all the fields on a live entity.

 * CommandEntity fields:
 * Live ship entity interacting with fleet commands and AI maneuvers.
 * id: Unique entity simulation ID.
 * state: Entity flight state ('fly', 'jumpout', 'landed').
 * x: Coordinate X in 2D space.
 * y: Coordinate Y in 2D space.
 * vx: Velocity vector X component.
 * vy: Velocity vector Y component.
 * a: Heading orientation angle in radians.
 * [order]: Active fleet order mode ('hold', 'holdfire', 'loot', 'gather', etc.).
 * [orderSeq]: Monotonic sequence counter for fleet order changes.
 * [player]: Session reference if this is a player-controlled ship.
 * [target]: Current active combat or navigation target entity.
 * aggro: Set of hostile entity IDs that have engaged this ship.
 * [distractT]: Timestamp until which entity is distracted.
 * [dest]: Target destination waypoint coordinates.

 * CommandSpace fields:
 * System space simulation environment boundary for fleet command execution.
 * loot: Array of floating cargo canisters adrift in space.
 * ships: Map of entity ID to active ship entities.
 * t: Current simulation timestamp.
 * nextLootId: Generates the next sequential unique loot canister ID.
 * root: Resolves the faction of the fleet leader or commanding root entity.
 * ShipStats fields:
 * Ship performance, defensive, and capacity statistics.
 * cargo: Maximum cargo hold capacity in tons.
 * [armor]: Maximum armor hit points.
 * [shields]: Maximum shield capacity.
 * [speed]: Maximum linear flight speed.
 * [accel]: Acceleration rating.
 * [turn]: Turn rate in radians per second.
 * [mass]: Total ship mass.
 * [space]: Available outfit space.
 * [combat]: Computed combat power rating.
 * FleetCommandsCapabilities fields:
 * Service dependencies and capabilities injected into fleet command handlers.
 * toast: Displays an in-HUD toast notification to the player.
 * send: Transmits an order update message to the client.
 * you: Transmits updated player state telemetry to the client.
 * stats: Computes maximum cargo capacity statistics for the player.
 * holdUsed: Total hold usage including mission cargo.
 * spaces: Active solar system space instances indexed by system ID.
 */
