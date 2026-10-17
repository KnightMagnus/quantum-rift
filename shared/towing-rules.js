// @ts-check
// Central provisional tuning. All grace/recovery uses the existing mining logical clock.
export const TOW = Object.freeze({
  rig: 9920,
  mass: 24,
  minCargo: 60,
  dredgeCap: 60,
  otherCap: 30,
  attachRange: 180,
  tether: 120,
  breakRange: 320,
  grace: 300,
  recovery: 900,
  offerSeconds: 15,
  receiptLimit: 64,
});
export const MOTHERLODE_ART = Object.freeze({
  ore: { base: 'rock0.webp', sides: 7, color: '#aa9574' },
  gas: { base: 'rock4.webp', sides: 8, color: '#77bca8' },
  shards: { base: 'rock8.webp', sides: 5, color: '#ba91d1' },
});
/** @param {number|string} hull */
export function towSpeed(hull) {
  return Number(hull) === 815 ? TOW.dredgeCap : TOW.otherCap;
}
