// @ts-check
/**
 * The registry only selects a fixed route. Authentication, flood limiting and
 * activity accounting remain ahead of it; individual routes retain validation.
 * Legacy routes accept decoded objects; this is NOT runtime payload validation.
 * @typedef {(session: object, message: object) => void} MessageHandler
 */

/** @param {ReadonlyArray<readonly [string, MessageHandler]>} entries */
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
    /** @param {unknown} type @param {object} session @param {object} message */
    dispatch(type, session, message) {
      if (typeof type === 'string') handlers.get(type)?.(session, message);
    },
  });
}
