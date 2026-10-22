export type BoundOperations<ValueType extends object> = {
  [KeyType in keyof ValueType]: OmitThisParameter<ValueType[KeyType]>;
};
/**
 * Bind a feature's operations to its explicit capability facade. This does not
 * install methods on Game, resolve names, or expose the coordinator to features.
 * @template {object} T
 * @param {T} operations
 * @param {ThisParameterType<T[keyof T]>} capabilities
 * @returns {BoundOperations<T>}
 */
export function bindOperations<ValueType extends object>(
  operations: ValueType,
  capabilities: ThisParameterType<ValueType[keyof ValueType]>,
): BoundOperations<ValueType> {
  const entries = Object.entries(operations);
  for (const [name, operation] of entries) {
    if (typeof operation !== 'function')
      throw new TypeError(`Feature operation ${name} must be a function`);
  }
  return Object.seal(
    Object.fromEntries(entries.map(([name, operation]) => [name, operation.bind(capabilities)])),
  ) as BoundOperations<ValueType>;
}
