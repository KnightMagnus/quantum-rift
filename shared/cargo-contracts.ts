export type RawGrade = 'common' | 'rich' | 'pure';
export type GradeLots = { common: number; rich: number; pure: number };
export type CargoLedger = {
  version: 1;
  byCommodity: Record<string, GradeLots>;
  /** Remaining integer purchase costs by commodity and grade. Missing costs mean acquired cargo. */
  basis?: Record<string, GradeLots>;
};
export type CargoTotals = Record<string, number>;
export type LotTransfer = {
  cid: string;
  qty: number;
  grades: GradeLots;
  /** Purchase costs carried with these tonnes. */
  basis?: GradeLots;
};
export type CargoOwner = {
  /** Legacy average purchase estimate, used only to initialize held cargo costs. */
  paid?: Record<string, number>;
  cargo?: CargoTotals;
  storage?: CargoTotals;
  cargoLots?: CargoLedger;
  storageLots?: CargoLedger;
};
/**
 * Raw grades deliberately do not describe field richness or material-crate quality.

 */
