import type { GradeLots } from '../shared/cargo-contracts.ts';
// @ts-check
import { TRADE_IMPACT } from './living.ts';

/** @import { GradeLots } from '../shared/cargo-contracts.ts' */
/** @param {number} price @param {number} quantity @param {number} tradePct @param {boolean} site */
export function purchaseUnit(price: number, quantity: number, tradePct: number, site: boolean) {
  const base = Math.max(1, Math.round(price * (1 - tradePct / 100)));
  return Math.round(
    base * (site ? 1 : 1 + Math.min(TRADE_IMPACT.max, quantity * TRADE_IMPACT.perTon) / 2),
  );
}
/** @param {number} price @param {GradeLots} grades @param {number} tradePct @param {boolean} site @param {number} sell */
export function saleValue(
  price: number,
  grades: GradeLots,
  tradePct: number,
  site: boolean,
  sell: number,
) {
  const n = grades.common + grades.rich + grades.pure,
    weighted = grades.common + grades.rich * 1.3 + grades.pure * 1.6,
    depth = site ? 1 : 1 - Math.min(TRADE_IMPACT.max, n * TRADE_IMPACT.perTon) / 2;
  return Math.round(weighted * price * depth * sell * (1 + tradePct / 100));
}
