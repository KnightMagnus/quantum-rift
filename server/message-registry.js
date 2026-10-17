// @ts-check
/**
 * The registry only selects a fixed route. Authentication, flood limiting and
 * activity accounting remain ahead of it; individual routes retain validation.
 * Legacy routes accept decoded objects; this is NOT runtime payload validation.
 *
 * @typedef {object} NetworkMessage
 * Incoming or outgoing network packet payload.
 * @property {string} [t] Message type identifier.
 * @property {string} [id] Target entity or item identifier.
 * @property {string} [fac] Faction identifier.
 * @property {number} [n] Quantity or numeric count.
 * @property {string} [name] Player or character name.
 * @property {string} [pass] Secret password string.
 * @property {string} [text] Chat or broadcast text content.
 * @property {string} [msg] Message body string.
 * @property {string} [from] Message sender name.
 * @property {string} [to] Message recipient name.
 * @property {string} [o] Fleet order string or mode.
 * @property {string} [dest] Navigation destination identifier.
 * @property {string} [target] Targeted entity identifier.
 * @property {string} [slot] Assigned ship or equipment slot identifier.
 * @property {number} [hull] Ship chassis or hull identifier.
 * @property {string} [uid] Entity unique instance identifier.
 * @property {number} [val] Credit valuation or amount.
 * @property {number} [share] Reward share payout.
 * @property {boolean} [ok] Confirmation boolean status.
 * @property {Record<string, string | number | boolean | null>} [data] Message data fields.
 *
 * @typedef {(session: import('./contracts.js').CommandSession, message: NetworkMessage) => void} MessageHandler
 * Handler callback invoked when a registered message type is received.
 *
 * @typedef {object} MessageRegistry
 * Immutable message router providing registered type listing and dispatch capabilities.
 * @property {readonly string[]} types Immutable list of registered message types.
 * @property {(type: string, session: import('./contracts.js').CommandSession, message: NetworkMessage) => void} dispatch Dispatches a message to its registered handler.
 */

/**
 * Creates an immutable message registry for dispatching typed network messages to their respective handlers.
 * @param {ReadonlyArray<readonly [string, MessageHandler]>} entries Array of message type to handler mappings.
 * @returns {MessageRegistry} Frozen message registry instance with dispatch capability.
 * @throws {TypeError} If a route type is invalid or a handler is not a function.
 * @throws {Error} If duplicate message route types are provided.
 */
export function createMessageRegistry(entries) {
  const handlers = new Map();
  for (const [type, handler] of entries) {
    if (!type || typeof type !== 'string' || typeof handler !== 'function')
      throw new TypeError('Invalid message route');
    if (handlers.has(type)) throw new Error(`Duplicate message route: ${type}`);
    handlers.set(type, handler);
  }
  return Object.freeze({
    types: Object.freeze([...handlers.keys()]),
    /**
     * Dispatches an incoming message to its registered handler if recognized.
     * @param {string} type Message type identifier.
     * @param {import('./contracts.js').CommandSession} session Active player network session.
     * @param {NetworkMessage} message Decoded payload object.
     * @returns {void}
     */
    dispatch(type, session, message) {
      if (typeof type === 'string') handlers.get(type)?.(session, message);
    },
  });
}
