// @ts-check
// All new fees, capacity and timing numbers are provisional, not measured balance.
export const REFINERY_RULES = Object.freeze({
  homeFeePerTon: 5,
  publicFeePerTon: 15,
  outlawFeePerTon: 20,
  storedFeeFactor: 0.8,
  orderPremium: 1.15,
  orderBase: 500,
  orderExpiryMs: 1800000,
  orderWindowMs: 3600000,
  receiptLimit: 256,
  settledLimit: 64,
  maxQuotes: 8,
  version: 1,
  units: 300,
  quoteMs: 30000,
  queueMs: 30000,
  instantCap: 30,
  storedCap: 300,
  dailyInput: 3000,
  compositeDaily: 30,
  ordersDaily: 160,
  payoutDaily: 200000,
  activeBatches: 32,
  fuelPerCell: 100,
  cancelFee: 10,
  collectionRadius: 500,
});
/** @typedef {{id:string,name:string,inputs:string[],output:string,base:number,pure:boolean}} Recipe */
/** @type {readonly Recipe[]} */
export const RECIPES = Object.freeze([
  {
    id: 'alloy',
    name: 'Alloy Ingots',
    inputs: ['ore'],
    output: 'alloy_ingots',
    base: 360,
    pure: false,
  },
  {
    id: 'cells',
    name: 'Fuel Cells',
    inputs: ['gas'],
    output: 'fuel_cells',
    base: 560,
    pure: false,
  },
  {
    id: 'cut',
    name: 'Cut Crystal',
    inputs: ['shards'],
    output: 'cut_crystal',
    base: 920,
    pure: false,
  },
  {
    id: 'plating',
    name: 'Composite Plating',
    inputs: ['ore', 'gas', 'shards'],
    output: 'composite_plating',
    base: 2400,
    pure: true,
  },
]);
/** @param {string} faction @param {boolean} home @param {Recipe} recipe */
export function recovery(faction, home, recipe) {
  if (home) return 100;
  if (faction === 'quantum') return 85;
  const specialty = { korrund: 'ore', ylith: 'shards', thalassi: 'gas' }[faction];
  if (specialty) return !recipe.pure && recipe.inputs[0] === specialty ? 95 : 80;
  return ['outlaw', 'umbral', 'hollow'].includes(faction) ? 75 : 80;
}
/** @param {number} input @param {number} percent @param {boolean} composite */
export function outputUnits(input, percent, composite) {
  return composite ? (input * percent) / 3 : input * percent;
}
/** @param {number} input */
export function storedDuration(input) {
  return Math.round(300000 + (1500000 * input) / 300);
}
/** Locked-quote floor; liability must include pooled fractions, acquisition a conservative lower bound.
 * @param {number} bid @param {number} ask @param {number} service */
export function refineryFee(bid, ask, service) {
  return Math.max(1, Math.ceil(service), Math.ceil(bid - ask + 1));
}
