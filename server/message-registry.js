// @ts-check
/**
 * The registry only selects a fixed route. Authentication, flood limiting and
 * activity accounting remain ahead of it; individual routes retain validation.
 * Legacy routes accept decoded objects; this is NOT runtime payload validation.
 *
 * @typedef {(session: any, message: any) => void} MessageHandler
 * Handler callback invoked when a registered message type is received.
 *
 * @typedef {object} MessageRegistry
 * Immutable message router providing registered type listing and dispatch capabilities.
 * @property {readonly string[]} types Immutable list of registered message types.
 * @property {(type: unknown, session: any, message: any) => void} dispatch Dispatches a message to its registered handler.
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
     * @param {unknown} type Message type identifier.
     * @param {any} session Active player network session.
     * @param {any} message Decoded payload object.
     * @returns {void}
     */
    dispatch(type, session, message) {
      if (typeof type === 'string') handlers.get(type)?.(session, message);
    },
  });
}
