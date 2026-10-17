// @ts-check
/**
 * Incremental contracts: these describe only Fleet Commands' boundary, not a
 * complete save schema, a wire validator, or all the fields on a live entity.
 *
 * @typedef {{cargo: Record<string, number>, cargoLots: import('../shared/cargo-contracts.js').CargoLedger, sys: string, ship?: import('../shared/rules.js').ShipLoadout, stats?: {combat?: number}}} CargoPlayer
 *
 * @typedef {object} CommandEntity
 * Live ship entity interacting with fleet commands and AI maneuvers.
 * @property {number} id Unique entity simulation ID.
 * @property {string} state Entity flight state ('fly', 'jumpout', 'landed').
 * @property {number} x Coordinate X in 2D space.
 * @property {number} y Coordinate Y in 2D space.
 * @property {number} vx Velocity vector X component.
 * @property {number} vy Velocity vector Y component.
 * @property {number} a Heading orientation angle in radians.
 * @property {string} [order] Active fleet order mode ('hold', 'holdfire', 'loot', 'gather', etc.).
 * @property {number} [orderSeq] Monotonic sequence counter for fleet order changes.
 * @property {import('./game.js').Session | null} [player] Session reference if this is a player-controlled ship.
 * @property {CommandEntity | null} [target] Current active combat or navigation target entity.
 * @property {Set<number>} aggro Set of hostile entity IDs that have engaged this ship.
 * @property {number} [distractT] Timestamp until which entity is distracted.
 * @property {{x: number, y: number}} [dest] Target destination waypoint coordinates.
 *
 * @typedef {{data: CargoPlayer, ent: CommandEntity | null}} CommandSession
 *
 * @typedef {{cargo: string, n: number, lots?: import('../shared/cargo-contracts.js').GradeLots}} CargoLoot
 *
 * @typedef {{id: number, x: number, y: number, vx: number, vy: number, it: CargoLoot, t: number, kind: number}} FloatingCargo
 *
 * @typedef {object} CommandSpace
 * System space simulation environment boundary for fleet command execution.
 * @property {FloatingCargo[]} loot Array of floating cargo canisters adrift in space.
 * @property {Map<number, CommandEntity>} ships Map of entity ID to active ship entities.
 * @property {number} t Current simulation timestamp.
 * @property {() => number} nextLootId Generates the next sequential unique loot canister ID.
 * @property {(entity: CommandEntity) => {faction: string}} root Resolves the faction of the fleet leader or commanding root entity.
 *
 * @typedef {object} ShipStats
 * Ship performance, defensive, and capacity statistics.
 * @property {number} cargo Maximum cargo hold capacity in tons.
 * @property {number} [armor] Maximum armor hit points.
 * @property {number} [shields] Maximum shield capacity.
 * @property {number} [speed] Maximum linear flight speed.
 * @property {number} [accel] Acceleration rating.
 * @property {number} [turn] Turn rate in radians per second.
 * @property {number} [mass] Total ship mass.
 * @property {number} [space] Available outfit space.
 * @property {number} [combat] Computed combat power rating.
 *
 * @typedef {object} FleetCommandsCapabilities
 * Service dependencies and capabilities injected into fleet command handlers.
 * @property {(session: CommandSession, text: string) => void} toast Displays an in-HUD toast notification to the player.
 * @property {(session: CommandSession, message: {t: 'order', o: string}) => void} send Transmits an order update message to the client.
 * @property {(session: CommandSession) => void} you Transmits updated player state telemetry to the client.
 * @property {(player: CargoPlayer) => import('../shared/rules.js').ComputedShipStats | ShipStats | null} stats Computes maximum cargo capacity statistics for the player.
 * @property {(player: CargoPlayer) => number} holdUsed Total hold usage including mission cargo.
 * @property {Record<string, CommandSpace>} spaces Active solar system space instances indexed by system ID.
 */
export {};
