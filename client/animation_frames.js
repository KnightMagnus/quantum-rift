// Periodic frame interpolation includes the last-to-first transition.
export function loopFrames(now, count, frameMs) {
  const phase = (((now / frameMs) % count) + count) % count;
  const first = Math.floor(phase);
  return { first, second: (first + 1) % count, mix: phase - first };
}
