import type { GradeLots } from '../shared/cargo-contracts.ts';
import { TRADE_IMPACT } from './living.ts';

export function purchaseUnit(price: number, quantity: number, tradePct: number, site: boolean) {
  const base = Math.max(1, Math.round(price * (1 - tradePct / 100)));
  return Math.round(
    base * (site ? 1 : 1 + Math.min(TRADE_IMPACT.max, quantity * TRADE_IMPACT.perTon) / 2),
  );
}

export function saleValue(
  price: number,
  grades: GradeLots,
  tradePct: number,
  site: boolean,
  sell: number,
) {
  const count = grades.common + grades.rich + grades.pure,
    weighted = grades.common + grades.rich * 1.3 + grades.pure * 1.6,
    depth = site ? 1 : 1 - Math.min(TRADE_IMPACT.max, count * TRADE_IMPACT.perTon) / 2;
  return Math.round(weighted * price * depth * sell * (1 + tradePct / 100));
}
