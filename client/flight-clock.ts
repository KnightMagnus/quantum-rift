/** Consume the existing DT accumulator from one variable-rate engine update. */
export function advanceFlightClock(
  remainder: number,
  elapsed: number,
  tick: number,
  update: () => void,
): number {
  remainder += Math.min(0.1, Math.max(0, elapsed));
  while (remainder >= tick) {
    update();
    remainder -= tick;
  }
  return remainder;
}
