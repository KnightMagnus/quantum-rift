// Optional reproducible RNG for simulation suites; never imported by the game.
// Example: node --import ./test/seed-random.ts test/v203.ts
// Override RIFT_TEST_SEED to explore/reproduce another scenario.
let seed = Number(process.env.RIFT_TEST_SEED || 123456789) >>> 0;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
