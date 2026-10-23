// Fixture-only PRNG: make procedural NPC positions/loadouts repeatable in CI.
let state = 0x30c1;
Math.random = () => {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return state / 0x100000000;
};
