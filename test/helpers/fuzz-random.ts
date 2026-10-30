/** Parse an unsigned packet seed without silently coercing invalid overrides. */
export function packetSeed(argument?: string, environment = process.env): number {
  const value =
    argument ?? environment.RIFT_FUZZ_PACKET_SEED ?? environment.RIFT_TEST_SEED ?? '123456789';
  const seed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('Packet seed must be an unsigned 32-bit integer');
  return seed;
}
/** Independent packet stream; simulation randomness remains owned by seed-random.ts. */
export function packetRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
