import type { ClientGameState } from './main.ts';
import type { TradePreviewInput } from '../shared/economy-preview.ts';

import { escapeHtml as escapeHtml2 } from './html.ts';
import { diagnostics } from './diagnostics.ts';
import { tradePreview } from '../shared/economy-preview.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { ShipCapacity, reservedCargoTonnes } from '../shared/ship-capacity.ts';

const credits2 = (count: number) => Math.round(count).toLocaleString() + ' cr';
export function tradeEstimateHtml(
  clientGameState: ClientGameState,
  market: TradePreviewInput['market'],
  rawAmount: string | number,
  recordDiagnostics = false,
) {
  const playerPayload = clientGameState.you!,
    hold = new ShipCapacity(
      playerPayload.shipStats!.cargo,
      playerPayload.cargoUsed,
      reservedCargoTonnes(playerPayload.missions),
    );
  let position;
  try {
    const previewInput: TradePreviewInput = {
      market,
      amount: Number(rawAmount),
      cargo: playerPayload.cargo,
      cargoLots: playerPayload.cargoLots,
      credits: playerPayload.credits,
      freeHold: hold.remaining,
      ...clientGameState.landed!.tradeTerms,
      orders: playerPayload.refinery?.orders || [],
    };
    const started = performance.now();
    position = tradePreview(previewInput);
    // Only amounts the player types are recorded; market re-renders would crowd them out.
    if (recordDiagnostics)
      diagnostics.recordTradePreview(previewInput, position, performance.now() - started);
  } catch {
    return '<span class="dim small">Cargo changed. Wait for the latest hold information.</span>';
  }
  if (!position.valid)
    return '<span class="dim small">Enter a whole number to see the cost.</span>';
  return `<span>Buy ${position.buy!.tonnes} t: <b>${credits2(position.buy!.total)}</b>${(playerPayload.cargo[market!.id] || 0) > 0 ? ` · Sell ${position.sale!.tonnes} t: <b>${credits2(position.sale!.total)}</b>` : ''}</span>${position.buy!.tonnes < Number(rawAmount) ? '<span class="dim small">Purchase is limited by your credits or free hold.</span>' : ''}${(playerPayload.cargo[market!.id] || 0) > 0 && position.sale!.tonnes < Number(rawAmount) ? '<span class="dim small">Sale is limited by cargo aboard or what this port will buy.</span>' : ''}${position.warnings.map((width) => `<span class="jwarn">${escapeHtml2(width)}</span>`).join('')}`;
}
export function receiptHtml(clientGameState: ClientGameState) {
  const economyReceipt2 = clientGameState.you?.economyReceipt;
  if (!economyReceipt2) return '';
  const place = (identifier: string | null) =>
    escapeHtml2(STELLARS[identifier!]?.name || identifier || 'In flight');
  const label =
    economyReceipt2.departedAt === null
      ? 'This stop'
      : `${place(economyReceipt2.from)} → ${place(economyReceipt2.to)}`;
  return `<details class="trip-receipt"${clientGameState.economyReceiptOpen ? ' open' : ''}><summary>Recent trip · ${economyReceipt2.net >= 0 ? '+' : ''}${credits2(economyReceipt2.net)} <span class="dim small">goods and refining only</span></summary><div class="small">${label}</div><div class="kv"><span>Sold goods</span><span>${credits2(economyReceipt2.sales)}</span></div><div class="kv"><span>Bought goods</span><span>−${credits2(economyReceipt2.purchases)}</span></div><div class="kv"><span>Refining costs</span><span>−${credits2(economyReceipt2.serviceFees)}</span></div>${economyReceipt2.refunds ? `<div class="kv"><span>Service refunds</span><span>+${credits2(economyReceipt2.refunds)}</span></div>` : ''}<p class="dim small">Supplies bought before departure and sales at your latest stop. New purchases belong to your next trip. This is not your full profit: other rewards, fuel, repairs and ship costs are not included.</p></details>`;
}
const initialized = new WeakSet();
export function initEconomyUI(clientGameState: ClientGameState) {
  if (initialized.has(clientGameState)) return;
  initialized.add(clientGameState);
  document.addEventListener(
    'toggle',
    (event) => {
      if ((event.target as HTMLInputElement).matches('.trip-receipt'))
        clientGameState.economyReceiptOpen = (event.target as HTMLDetailsElement).open;
    },
    true,
  );
  document.addEventListener('input', (event) => {
    if (!(event.target as HTMLInputElement).matches('.trade-amount')) return;
    const captainId = (event.target as HTMLInputElement).dataset.c!,
      target = [...document.querySelectorAll<HTMLElement>('[data-trade-estimate]')].find(
        (htmlElement) => htmlElement.dataset.tradeEstimate === captainId,
      );
    const market = clientGameState.landed?.market?.find(
      (marketItem) => marketItem.id === captainId,
    );
    if (target && market)
      target.innerHTML = tradeEstimateHtml(
        clientGameState,
        market,
        (event.target as HTMLInputElement).value,
        true,
      );
  });
}
