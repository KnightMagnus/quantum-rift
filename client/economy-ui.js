import { escapeHtml as esc } from './html.ts';
import { tradePreview } from '/shared/economy-preview.js';
import { STELLARS } from '/shared/galaxy.js';
import { ShipCapacity, reservedCargoTonnes } from '../shared/ship-capacity.ts';

const cr = (n) => Math.round(n).toLocaleString() + ' cr';
export function tradeEstimateHtml(G, market, rawAmount) {
  const y = G.you,
    hold = new ShipCapacity(y.shipStats.cargo, y.cargoUsed, reservedCargoTonnes(y.missions));
  let p;
  try {
    p = tradePreview({
      market,
      amount: Number(rawAmount),
      cargo: y.cargo,
      cargoLots: y.cargoLots,
      credits: y.credits,
      freeHold: hold.remaining,
      ...G.landed.tradeTerms,
      orders: y.refinery?.orders || [],
    });
  } catch {
    return '<span class="dim small">Cargo changed. Wait for the latest hold information.</span>';
  }
  if (!p.valid) return '<span class="dim small">Enter a whole number to see the cost.</span>';
  return `<span>Buy ${p.buy.tonnes} t: <b>${cr(p.buy.total)}</b>${(y.cargo[market.id] || 0) > 0 ? ` · Sell ${p.sale.tonnes} t: <b>${cr(p.sale.total)}</b>` : ''}</span>${p.buy.tonnes < Number(rawAmount) ? '<span class="dim small">Purchase is limited by your credits or free hold.</span>' : ''}${(y.cargo[market.id] || 0) > 0 && p.sale.tonnes < Number(rawAmount) ? '<span class="dim small">Sale is limited by cargo aboard or what this port will buy.</span>' : ''}${p.warnings.map((w) => `<span class="jwarn">${esc(w)}</span>`).join('')}`;
}
export function receiptHtml(G) {
  const r = G.you?.economyReceipt;
  if (!r) return '';
  const place = (id) => esc(STELLARS[id]?.name || id || 'In flight');
  const label = r.departedAt === null ? 'This stop' : `${place(r.from)} → ${place(r.to)}`;
  return `<details class="trip-receipt"${G.economyReceiptOpen ? ' open' : ''}><summary>Recent trip · ${r.net >= 0 ? '+' : ''}${cr(r.net)} <span class="dim small">goods and refining only</span></summary><div class="small">${label}</div><div class="kv"><span>Sold goods</span><span>${cr(r.sales)}</span></div><div class="kv"><span>Bought goods</span><span>−${cr(r.purchases)}</span></div><div class="kv"><span>Refining costs</span><span>−${cr(r.serviceFees)}</span></div>${r.refunds ? `<div class="kv"><span>Service refunds</span><span>+${cr(r.refunds)}</span></div>` : ''}<p class="dim small">Supplies bought before departure and sales at your latest stop. New purchases belong to your next trip. This is not your full profit: other rewards, fuel, repairs and ship costs are not included.</p></details>`;
}
const initialized = new WeakSet();
export function initEconomyUI(G) {
  if (initialized.has(G)) return;
  initialized.add(G);
  document.addEventListener(
    'toggle',
    (event) => {
      if (event.target.matches('.trip-receipt')) G.economyReceiptOpen = event.target.open;
    },
    true,
  );
  document.addEventListener('input', (event) => {
    if (!event.target.matches('.trade-amount')) return;
    const cid = event.target.dataset.c,
      target = [...document.querySelectorAll('[data-trade-estimate]')].find(
        (el) => el.dataset.tradeEstimate === cid,
      );
    const market = G.landed?.market?.find((c) => c.id === cid);
    if (target && market) target.innerHTML = tradeEstimateHtml(G, market, event.target.value);
  });
}
