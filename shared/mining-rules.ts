import type { GradeLots } from './cargo-contracts.ts';
/** @import { GradeLots } from './cargo-contracts.ts' */

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
export function stageCount(radius: number) {
  return radius < 26 ? 1 : radius < 38 ? 2 : 3;
}
/** @param {number} quantity @param {boolean} clean @param {()=>number} random @returns {GradeLots} */
export function rollGrades(quantity: number, clean: boolean, random: () => number): GradeLots {
  const lots = { common: 0, rich: 0, pure: 0 };
  for (let index = 0; index < quantity; index++) {
    const count = random();
    if (count < (clean ? 0.65 : 0.9)) lots.common++;
    else if (count < (clean ? 0.93 : 0.99)) lots.rich++;
    else lots.pure++;
  }
  return lots;
}
/** Union contact seconds: multiple mounts/captains never duplicate elapsed time.
 * @param {{from:number,to:number,seam:boolean}[]} spans @param {number} from @param {number} destination @returns {{seconds:number,seamSeconds:number}} */
export function contactTime(
  spans: { from: number; to: number; seam: boolean }[],
  from: number,
  destination: number,
): { seconds: number; seamSeconds: number } {
  const points = [from, destination];
  for (const span of spans) {
    if (span.to > from && span.from < destination)
      points.push(Math.max(from, span.from), Math.min(destination, span.to));
  }
  points.sort((firstValue, secondValue) => firstValue - secondValue);
  let seconds = 0,
    seamSeconds = 0;
  for (let index = 1; index < points.length; index++) {
    const point = points[index - 1],
      point2 = points[index];
    if (point2 <= point) continue;
    const active = spans.filter((state) => state.from < point2 && state.to > point);
    if (active.length) {
      seconds += point2 - point;
      if (active.some((state) => state.seam)) seamSeconds += point2 - point;
    }
  }
  return { seconds, seamSeconds };
}
