import type { CargoLedger, CargoTotals, GradeLots } from './cargo-contracts.ts';
export type TradePreviewInput = {
  market: { id: string; price: number | null; sellCap?: number } | null;
  amount: number;
  cargo: CargoTotals;
  cargoLots: CargoLedger;
  credits: number;
  freeHold: number;
  tradePct?: number;
  sell?: number;
  site?: boolean;
  orders?: { cid: string; grade: string; qty: number }[];
};

// Exact current-port formulas, never a guarantee about a later transaction or another port.
import { purchaseUnit, saleValue } from './trade-pricing.ts';
import { planTake } from './cargo-lots.ts';
export function tradePreview({
  market,
  amount,
  cargo,
  cargoLots,
  credits,
  freeHold,
  tradePct = 0,
  sell = 1,
  site = false,
  orders = [],
}: TradePreviewInput) {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !market ||
    !Number.isFinite(market.price) ||
    market.price! <= 0
  )
    return { valid: false, buy: null, sale: null, warnings: [] };
  let purchaseCount = Math.max(0, Math.min(amount, Math.floor(freeHold)));
  while (
    purchaseCount > 0 &&
    purchaseCount * purchaseUnit(market.price!, purchaseCount, tradePct, site) > credits
  )
    purchaseCount = Math.min(
      purchaseCount - 1,
      Math.floor(credits / purchaseUnit(market.price!, purchaseCount, tradePct, site)),
    );
  const saleCount = Math.max(
    0,
    Math.min(amount, cargo[market.id] || 0, market.sellCap ?? Infinity),
  );
  const purchase = {
    tonnes: purchaseCount,
    total: purchaseCount * purchaseUnit(market.price!, purchaseCount, tradePct, site),
  };
  let sale = { tonnes: 0, total: 0, grades: { common: 0, rich: 0, pure: 0 } };
  if (saleCount) {
    const take = planTake(cargo, cargoLots, market.id, saleCount);
    sale = {
      tonnes: saleCount,
      total: saleValue(market.price!, take.grades, tradePct, site, sell),
      grades: take.grades,
    };
  }
  const warnings = [];
  if (sale.grades.rich || sale.grades.pure)
    warnings.push('This amount includes higher-grade cargo. Common cargo sells first.');
  const lots: Partial<GradeLots> = cargoLots.byCommodity[market.id] || {};
  if (
    (['common', 'rich', 'pure'] as const).some(
      (grade) =>
        sale.grades[grade] > 0 &&
        (lots[grade] || 0) - sale.grades[grade] <
          orders
            .filter((options) => options.cid === market.id && options.grade === grade)
            .reduce((count, options) => count + options.qty, 0),
    )
  )
    warnings.push(
      'Some of this cargo is still needed for a delivery. Selling it means replacing it later.',
    );
  return { valid: true, buy: purchase, sale, warnings };
}
