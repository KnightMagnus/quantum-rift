// Periodic frame interpolation includes the last-to-first transition.
export function loopFrames(currentTime: number, count: number, frameMs: number) {
  const phase = (((currentTime / frameMs) % count) + count) % count;
  const first = Math.floor(phase);
  return { first, second: (first + 1) % count, mix: phase - first };
}
