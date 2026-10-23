export type RawGrade = 'common' | 'rich' | 'pure';
export type GradeLots = { common: number; rich: number; pure: number };
export type CargoLedger = { version: 1; byCommodity: Record<string, GradeLots> };
export type CargoTotals = Record<string, number>;
export type LotTransfer = { cid: string; qty: number; grades: GradeLots };
export type CargoOwner = {
  cargo?: CargoTotals;
  storage?: CargoTotals;
  cargoLots?: CargoLedger;
  storageLots?: CargoLedger;
};
/**
 * Raw grades deliberately do not describe field richness or material-crate quality.

 */
