// @ts-check

/** @template {object} T @typedef {{[K in keyof T]: OmitThisParameter<T[K]>}} BoundOperations */

/**
 * Bind a feature's operations to its explicit capability facade. This does not
 * install methods on Game, resolve names, or expose the coordinator to features.
 * @template {object} T
 * @param {T} operations
 * @param {object} capabilities
 * @returns {BoundOperations<T>}
 */
export function bindOperations(operations, capabilities) {
  const entries = Object.entries(operations);
  for (const [name, operation] of entries) {
    if (typeof operation !== 'function') throw new TypeError(`Feature operation ${name} must be a function`);
  }
  return /** @type {BoundOperations<T>} */ (Object.seal(Object.fromEntries(
    entries.map(([name, operation]) => [name, operation.bind(capabilities)])
  )));
}
