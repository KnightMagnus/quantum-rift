/** Structured game-state cloning for hosts without the browser/Node structuredClone API. */
export function cloneGameState<Value>(value: Value): Value {
  const seen = new Map<object, unknown>();
  function copy(input: unknown): unknown {
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'function' || typeof input === 'symbol')
        throw new TypeError('Uncloneable game state');
      return input;
    }
    if (seen.has(input)) return seen.get(input);
    if (input instanceof Date) return new Date(input.getTime());
    if (input instanceof Map) {
      const output = new Map<unknown, unknown>();
      seen.set(input, output);
      for (const [key, entry] of input) output.set(copy(key), copy(entry));
      return output;
    }
    if (input instanceof Set) {
      const output = new Set<unknown>();
      seen.set(input, output);
      for (const entry of input) output.add(copy(entry));
      return output;
    }
    if (
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null &&
      !Array.isArray(input)
    )
      throw new TypeError('Unsupported game state prototype');
    const output: Record<string, unknown> | unknown[] = Array.isArray(input) ? [] : {};
    seen.set(input, output);
    for (const key of Object.keys(input))
      Object.defineProperty(output, key, {
        value: copy(Reflect.get(input, key)),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return output;
  }
  // The recursive copier preserves the input's supported data shape, like structuredClone.
  return copy(value) as Value;
}

/** Install only on a sandbox missing the standard host API; never replace Node's implementation. */
export function installGameClone(): void {
  if (typeof globalThis.structuredClone === 'undefined')
    globalThis.structuredClone = cloneGameState;
}

// Module evaluation precedes Nakama global freezing; callbacks never add globals.
installGameClone();
