// @ts-check
/** Raw grades deliberately do not describe field richness or material-crate quality.
 * @typedef {'common'|'rich'|'pure'} RawGrade
 * @typedef {{common:number, rich:number, pure:number}} GradeLots
 * @typedef {{version:1, byCommodity:Record<string, GradeLots>}} CargoLedger
 * @typedef {Record<string, number>} CargoTotals
 * @typedef {{cid:string, qty:number, grades:GradeLots}} LotTransfer
 * @typedef {{cargo?:CargoTotals, storage?:CargoTotals, cargoLots?:CargoLedger, storageLots?:CargoLedger}} CargoOwner
 */
export {};
