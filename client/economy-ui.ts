import { legacyHtml } from './eta-runtime.ts';
import {
  renderEconomyUiTradeEstimateHtmlFragment001,
  renderEconomyUiTradeEstimateHtmlFragment002,
  renderEconomyUiTradeEstimateHtmlFragment003,
  renderEconomyUiTradeEstimateHtmlFragment004,
  renderEconomyUiTradeEstimateHtmlFragment005,
  renderEconomyUiTradeEstimateHtmlFragment006,
  renderEconomyUiTradeEstimateHtmlFragment007,
  renderEconomyUiReceiptHtmlFragment008,
  renderEconomyUiReceiptHtmlFragment009,
} from './eta-templates.ts';
import type { ClientGameState } from './main.ts';
import type { TradePreviewInput } from '../shared/economy-preview.ts';

import { escapeHtml as escapeHtml2 } from './html.ts';
import { tradePreview } from '../shared/economy-preview.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { ShipCapacity, reservedCargoTonnes } from '../shared/ship-capacity.ts';

const credits2 = (count: number) => Math.round(count).toLocaleString() + ' cr';
export function tradeEstimateHtml(
  clientGameState: ClientGameState,
  market: TradePreviewInput['market'],
  rawAmount: string | number,
) {
  const playerPayload = clientGameState.you!,
    hold = new ShipCapacity(
      playerPayload.shipStats!.cargo,
      playerPayload.cargoUsed,
      reservedCargoTonnes(playerPayload.missions),
    );
  let position;
  try {
    position = tradePreview({
      market,
      amount: Number(rawAmount),
      cargo: playerPayload.cargo,
      cargoLots: playerPayload.cargoLots,
      credits: playerPayload.credits,
      freeHold: hold.remaining,
      ...clientGameState.landed!.tradeTerms,
      orders: playerPayload.refinery?.orders || [],
    });
  } catch {
    return renderEconomyUiTradeEstimateHtmlFragment001();
  }
  if (!position.valid) return renderEconomyUiTradeEstimateHtmlFragment002();
  return renderEconomyUiTradeEstimateHtmlFragment003({
    positionBuy: legacyHtml(position.buy!.tonnes),
    credits2: legacyHtml(credits2(position.buy!.total)),
    playerPayloadCargo: legacyHtml(
      (playerPayload.cargo[market!.id] || 0) > 0
        ? renderEconomyUiTradeEstimateHtmlFragment004({
            positionSale: legacyHtml(position.sale!.tonnes),
            credits2: legacyHtml(credits2(position.sale!.total)),
          })
        : '',
    ),
    positionBuy2: legacyHtml(
      position.buy!.tonnes < Number(rawAmount) ? renderEconomyUiTradeEstimateHtmlFragment005() : '',
    ),
    playerPayloadCargo2: legacyHtml(
      (playerPayload.cargo[market!.id] || 0) > 0 && position.sale!.tonnes < Number(rawAmount)
        ? renderEconomyUiTradeEstimateHtmlFragment006()
        : '',
    ),
    positionWarningsMap: legacyHtml(
      position.warnings
        .map((width) => renderEconomyUiTradeEstimateHtmlFragment007({ width: width }))
        .join(''),
    ),
  });
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
  return renderEconomyUiReceiptHtmlFragment008({
    clientGameStateEconomyReceiptOpen: legacyHtml(
      clientGameState.economyReceiptOpen ? ' open' : '',
    ),
    economyReceipt2Net: legacyHtml(economyReceipt2.net >= 0 ? '+' : ''),
    credits2: legacyHtml(credits2(economyReceipt2.net)),
    label: legacyHtml(label),
    credits22: legacyHtml(credits2(economyReceipt2.sales)),
    credits23: legacyHtml(credits2(economyReceipt2.purchases)),
    credits24: legacyHtml(credits2(economyReceipt2.serviceFees)),
    economyReceipt2Refunds: legacyHtml(
      economyReceipt2.refunds
        ? renderEconomyUiReceiptHtmlFragment009({
            credits2: legacyHtml(credits2(economyReceipt2.refunds)),
          })
        : '',
    ),
  });
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
      );
  });
}
