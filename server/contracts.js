// @ts-check
/**
 * Incremental contracts: these describe only Fleet Commands' boundary, not a
 * complete save schema, a wire validator, or all the fields on a live entity.
 * @typedef {{cargo: Record<string, number>, sys: string, stats?: {combat?: number}}} CargoPlayer
 * @typedef {object} CommandEntity
 * @property {number} id
 * @property {string} state
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} a
 * @property {string} [order]
 * @property {number} [orderSeq]
 * @property {unknown} [player]
 * @property {CommandEntity | null} [target]
 * @property {Set<number>} aggro
 * @property {number} [distractT]
 * @property {{x: number, y: number}} [dest]
 * @typedef {{data: CargoPlayer, ent: CommandEntity | null}} CommandSession
 * @typedef {{cargo: string, n: number}} CargoLoot
 * @typedef {{id: number, x: number, y: number, vx: number, vy: number, it: CargoLoot, t: number, kind: number}} FloatingCargo
 * @typedef {object} CommandSpace
 * @property {FloatingCargo[]} loot
 * @property {Map<number, CommandEntity>} ships
 * @property {number} t
 * @property {() => number} nextLootId
 * @property {(entity: CommandEntity) => {faction: string}} root
 * @typedef {object} FleetCommandsCapabilities
 * @property {(session: CommandSession, text: string) => void} toast
 * @property {(session: CommandSession, message: {t: 'order', o: string}) => void} send
 * @property {(session: CommandSession) => void} you
 * @property {(player: CargoPlayer) => {cargo: number} | null} stats
 * @property {Record<string, CommandSpace>} spaces
 */
export {};
