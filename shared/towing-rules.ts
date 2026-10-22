// Central provisional tuning. All grace/recovery uses the existing mining logical clock.
const freeze2 = Object.freeze({
  rig: 9920,
  mass: 24,
  minCargo: 60,
  dredgeCap: 60,
  otherCap: 30,
  attachRange: 180,
  tether: 120,
  deliveryApron: 180,
  breakRange: 320,
  grace: 300,
  recovery: 900,
  offerSeconds: 15,
  receiptLimit: 64,
});
export { freeze2 as TOW };
export const MOTHERLODE_ART = Object.freeze({
  ore: { base: 'motherlode-ore.webp', sides: 7, color: '#d8ac66', kind: 'ore' },
  gas: { base: 'motherlode-gas.webp', sides: 8, color: '#77ddc2', kind: 'gas' },
  shards: { base: 'motherlode-shards.webp', sides: 5, color: '#d5a0ff', kind: 'shards' },
});
// Unscanned/unknown deposits share a neutral silhouette, independent of attachment.
export const UNKNOWN_MOTHERLODE_ART = Object.freeze({
  base: null,
  sides: 9,
  color: '#929aa5',
  kind: 'unknown',
});

export function motherlodeArt(object: { ore?: string; revealed?: boolean }) {
  if (!object.revealed || !Object.hasOwn(MOTHERLODE_ART, object.ore || ''))
    return UNKNOWN_MOTHERLODE_ART;
  return MOTHERLODE_ART[object.ore as keyof typeof MOTHERLODE_ART];
}

export function towSpeed(hull: number | string) {
  return Number(hull) === 815 ? freeze2.dredgeCap : freeze2.otherCap;
}
