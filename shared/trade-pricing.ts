import type { GradeLots } from './cargo-contracts.ts';
import { TRADE_IMPACT } from './living.ts';

/** Integrate the current shared market curve, including either saturation plateau. */
function marketValue(
  price: number,
  quantity: number,
  site: boolean,
  impact: number,
  buying: boolean,
) {
  if (site || quantity <= 0) return price * Math.max(0, quantity);
  const direction = buying ? -1 : 1;
  const start = Math.max(-TRADE_IMPACT.max, Math.min(TRADE_IMPACT.max, impact));
  const boundary = buying ? -TRADE_IMPACT.max : TRADE_IMPACT.max;
  const moving = Math.min(
    quantity,
    Math.max(0, (boundary - start) / (direction * TRADE_IMPACT.perTon)),
  );
  const end = start + direction * moving * TRADE_IMPACT.perTon;
  return price * (moving * (1 - (start + end) / 2) + (quantity - moving) * (1 - boundary));
}

function spread(tradePct: number) {
  // Skill narrows both sides, but even extreme bonuses retain a positive spread.
  return Math.max(0.005, 0.05 - Math.max(0, tradePct) / 100);
}

/** Total integer debit. price is the neutral reference, not the impacted display price. */
export function purchaseValue(
  price: number,
  quantity: number,
  tradePct: number,
  site: boolean,
  sell = 1,
  impact = 0,
) {
  return Math.ceil(
    marketValue(price * Math.max(1, sell), quantity, site, impact, true) *
      (1 + spread(tradePct) / 2),
  );
}

/** Conservative one-unit ask retained for refinery quote liabilities. */
export function purchaseUnit(
  price: number,
  quantity: number,
  tradePct: number,
  site: boolean,
  sell = 1,
  impact = 0,
) {
  return Math.ceil(
    purchaseValue(price, quantity, tradePct, site, sell, impact) / Math.max(1, quantity),
  );
}

export function saleValue(
  price: number,
  grades: GradeLots,
  tradePct: number,
  site: boolean,
  sell: number,
  impact = 0,
) {
  const count = grades.common + grades.rich + grades.pure;
  if (!count) return 0;
  const weighted = grades.common + grades.rich * 1.3 + grades.pure * 1.6;
  return Math.floor(
    marketValue(price * Math.max(1, sell), count, site, impact, false) *
      (weighted / count) *
      Math.min(1, sell) *
      (1 - spread(tradePct) / 2),
  );
}

/** Advance trading's income high-water mark without rewriting past earnings. */
export function realizedTradeProfit(
  account: { tradeLoss?: number },
  proceeds: number,
  cost: number,
) {
  const margin = proceeds - cost;
  const unrecovered = account.tradeLoss ?? 0;
  const profit = Math.max(0, margin - unrecovered);
  // Only realized sale losses enter this carryover, never destroyed or consumed cargo.
  account.tradeLoss = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, unrecovered - margin));
  return profit;
}
