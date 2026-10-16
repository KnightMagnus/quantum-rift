// @ts-check
/**
 * Incremental contracts: these describe only Fleet Commands' boundary, not a
 * complete save schema, a wire validator, or all the fields on a live entity.
 *
 * @typedef {{cargo: Record<string, number>, sys: string, stats?: {combat?: number}}} CargoPlayer
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
 * @property {unknown} [player] Session reference if this is a player-controlled ship.
 * @property {CommandEntity | null} [target] Current active combat or navigation target entity.
 * @property {Set<number>} aggro Set of hostile entity IDs that have engaged this ship.
 * @property {number} [distractT] Timestamp until which entity is distracted.
 * @property {{x: number, y: number}} [dest] Target destination waypoint coordinates.
 *
 * @typedef {{data: CargoPlayer, ent: CommandEntity | null}} CommandSession
 *
 * @typedef {{cargo: string, n: number}} CargoLoot
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
 * @typedef {object} FleetCommandsCapabilities
 * Service dependencies and capabilities injected into fleet command handlers.
 * @property {(session: CommandSession, text: string) => void} toast Displays an in-HUD toast notification to the player.
 * @property {(session: CommandSession, message: {t: 'order', o: string}) => void} send Transmits an order update message to the client.
 * @property {(session: CommandSession) => void} you Transmits updated player state telemetry to the client.
 * @property {(player: CargoPlayer) => ({cargo: number, [key: string]: any} | any)} stats Computes maximum cargo capacity statistics for the player.
 * @property {Record<string, CommandSpace>} spaces Active solar system space instances indexed by system ID.
 */
export {};
