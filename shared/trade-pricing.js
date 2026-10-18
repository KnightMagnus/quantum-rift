// @ts-check
import { TRADE_IMPACT } from './living.js';
/** @param {number} price @param {number} quantity @param {number} tradePct @param {boolean} site */
export function purchaseUnit(price, quantity, tradePct, site) {
  const base = Math.max(1, Math.round(price * (1 - tradePct / 100)));
  return Math.round(
    base * (site ? 1 : 1 + Math.min(TRADE_IMPACT.max, quantity * TRADE_IMPACT.perTon) / 2),
  );
}
/** @param {number} price @param {import('../shared/cargo-contracts.js').GradeLots} grades @param {number} tradePct @param {boolean} site @param {number} sell */
export function saleValue(price, grades, tradePct, site, sell) {
  const n = grades.common + grades.rich + grades.pure,
    weighted = grades.common + grades.rich * 1.3 + grades.pure * 1.6,
    depth = site ? 1 : 1 - Math.min(TRADE_IMPACT.max, n * TRADE_IMPACT.perTon) / 2;
  return Math.round(weighted * price * depth * sell * (1 + tradePct / 100));
}
