/** @import { GradeLots } from './cargo-contracts.js' */

// @ts-check
export { fnv1a as seedOf, linearRandom32 as randomOf } from './deterministic-random.ts';
// Provisional tuning, not measured balance. Time is eligible server simulation seconds.
export const MINING = Object.freeze({
  version: 1,
  heatRate: 20,
  cooling: 10,
  acquire: 0.6,
  cleanWork: 1.5,
  cleanLow: 60,
  cleanHigh: 80,
  overheat: 100,
  grace: 0.15,
  cooldown: 10,
  reveal: 6,
  radius: 1500,
  parcelTTL: 150,
  idleRenewal: 300, // Abandoned damaged/staged deposits renew after five simulation minutes.
  seamWidth: 1.15,
});

/** @param {number} radius */
export function stageCount(radius) {
  return radius < 26 ? 1 : radius < 38 ? 2 : 3;
}
/** @param {number} quantity @param {boolean} clean @param {()=>number} random @returns {GradeLots} */
export function rollGrades(quantity, clean, random) {
  const lots = { common: 0, rich: 0, pure: 0 };
  for (let i = 0; i < quantity; i++) {
    const n = random();
    if (n < (clean ? 0.65 : 0.9)) lots.common++;
    else if (n < (clean ? 0.93 : 0.99)) lots.rich++;
    else lots.pure++;
  }
  return lots;
}
/** Union contact seconds: multiple mounts/captains never duplicate elapsed time.
 * @param {{from:number,to:number,seam:boolean}[]} spans @param {number} from @param {number} to @returns {{seconds:number,seamSeconds:number}} */
export function contactTime(spans, from, to) {
  const points = [from, to];
  for (const s of spans) {
    if (s.to > from && s.from < to) points.push(Math.max(from, s.from), Math.min(to, s.to));
  }
  points.sort((a, b) => a - b);
  let seconds = 0,
    seamSeconds = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (b <= a) continue;
    const active = spans.filter((s) => s.from < b && s.to > a);
    if (active.length) {
      seconds += b - a;
      if (active.some((s) => s.seam)) seamSeconds += b - a;
    }
  }
  return { seconds, seamSeconds };
}
