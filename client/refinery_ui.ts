import { legacyHtml } from './eta-runtime.ts';
import {
  renderRefineryUiRefineryJobsHtmlFragment001,
  renderRefineryUiRefineryJobsHtmlFragment002,
  renderRefineryUiRefineryJobsHtmlFragment003,
  renderRefineryUiRefineryJobsHtmlFragment004,
  renderRefineryUiRefineryJobsHtmlFragment005,
  renderRefineryUiRefineryJobsHtmlFragment006,
  renderRefineryUiRefineryJobsHtmlFragment007,
} from './eta-templates.ts';
import type { RefineryClientState } from './refinery-controls.ts';

import { refineryPanelHtml, initRefineryControls } from './refinery-controls.ts';
import { RECIPES, REFINERY_RULES as refineryRules } from '../shared/refinery-rules.ts';
import { STELLARS, COMMODITIES } from '../shared/galaxy.ts';

const title = (captainId: string) =>
  COMMODITIES.find((commodityDef) => commodityDef.id === captainId)?.name || captainId;
export function refineryJobsHtml(refineryClientState: RefineryClientState) {
  const data = refineryClientState.you?.refinery;
  if (!data) return '';
  const batches = data.batches.filter(
      (refineryBatch) =>
        !refineryBatch.credited &&
        (refineryBatch.status !== 'cancelled' ||
          refineryBatch.returns.some((refineryInput) =>
            Object.values(refineryInput.lots).some(Boolean),
          )),
    ),
    ready = data.ready.filter((refineryReady) => refineryReady.units > 0);
  return renderRefineryUiRefineryJobsHtmlFragment001({
    batchesMap: legacyHtml(
      batches
        .map((refineryBatch) =>
          renderRefineryUiRefineryJobsHtmlFragment002({
            title: title(refineryBatch.quote.output),
            refineryBatchStatusToUpperCase: refineryBatch.status.toUpperCase(),
            STELLARS: STELLARS[refineryBatch.port]?.name || refineryBatch.port,
            refineryBatchQuoteUnits: legacyHtml((refineryBatch.quote.units / 300).toFixed(3)),
            refineryBatchReadyAt: legacyHtml(refineryBatch.readyAt),
            refineryBatchStartAt: legacyHtml(refineryBatch.startAt),
            refineryBatchStatus: legacyHtml(refineryBatch.status),
            refineryBatchStatus2: legacyHtml(
              refineryBatch.status === 'queued'
                ? 'cancellable for 30s'
                : refineryBatch.status === 'processing'
                  ? 'processing'
                  : 'cancelled — exact input returns only',
            ),
            refineryBatchStatus3: legacyHtml(
              refineryBatch.status === 'queued'
                ? renderRefineryUiRefineryJobsHtmlFragment003({
                    refineryBatchId: refineryBatch.id,
                    refineryBatchPort: refineryBatch.port,
                    refineryBatchQuoteCancelFee: legacyHtml(refineryBatch.quote.cancelFee),
                  })
                : '',
            ),
            refineryBatchStatus4: legacyHtml(
              refineryBatch.status === 'cancelled' &&
                refineryBatch.returns.some((refineryInput) =>
                  Object.values(refineryInput.lots).some(Boolean),
                )
                ? renderRefineryUiRefineryJobsHtmlFragment004({
                    refineryBatchId: refineryBatch.id,
                    refineryBatchPort: refineryBatch.port,
                  })
                : '',
            ),
            STELLARS2: STELLARS[refineryBatch.port]?.system,
          }),
        )
        .join(''),
    ),
    readyMap: legacyHtml(
      ready
        .map((refineryReady) =>
          renderRefineryUiRefineryJobsHtmlFragment005({
            title: title(refineryReady.cid),
            refineryReadyUnits: legacyHtml((refineryReady.units / 300).toFixed(3)),
            STELLARS: STELLARS[refineryReady.port]?.name || refineryReady.port,
            RECIPESFind: legacyHtml(
              RECIPES.find((recipe) => recipe.output === refineryReady.cid)?.id,
            ),
            refineryReadyPort: refineryReady.port,
            refineryReadyUnits2: legacyHtml(
              refineryReady.units < 300
                ? 'disabled title="At least 1 tonne must be ready. Smaller amounts stay stored."'
                : '',
            ),
          }),
        )
        .join(''),
    ),
    dataOrdersMap: legacyHtml(
      data.orders
        .map((miningOrder) =>
          renderRefineryUiRefineryJobsHtmlFragment006({
            miningOrderQty: legacyHtml(miningOrder.qty),
            miningOrderGrade: miningOrder.grade,
            title: title(miningOrder.cid),
            STELLARS: STELLARS[miningOrder.port]?.name || miningOrder.port,
            miningOrderReward: legacyHtml(miningOrder.reward),
            Date: legacyHtml(new Date(miningOrder.deadline).toLocaleTimeString()),
            miningOrderId: miningOrder.id,
            miningOrderPort: miningOrder.port,
            miningOrderId2: miningOrder.id,
            miningOrderPort2: miningOrder.port,
          }),
        )
        .join(''),
    ),
    refineryClientStateYou: legacyHtml(refineryClientState.you!.cargo?.fuel_cells || 0),
    refineryRulesFuelPerCell: legacyHtml(refineryRules.fuelPerCell),
    refineryClientStateYou2: legacyHtml(
      !refineryClientState.you!.cargo?.fuel_cells ? 'disabled' : '',
    ),
    refineryRulesFuelPerCell2: legacyHtml(refineryRules.fuelPerCell),
    refineryClientStateRefineryFuelQuote: legacyHtml(
      refineryClientState.refineryFuelQuote
        ? renderRefineryUiRefineryJobsHtmlFragment007({
            refineryClientStateRefineryFuelQuoteN: legacyHtml(
              refineryClientState.refineryFuelQuote.n,
            ),
            refineryClientStateRefineryFuelQuoteGain: legacyHtml(
              refineryClientState.refineryFuelQuote.gain,
            ),
            refineryClientStateRefineryFuelQuoteBefore: legacyHtml(
              refineryClientState.refineryFuelQuote.before,
            ),
            refineryClientStateRefineryFuelQuoteBefore2: legacyHtml(
              refineryClientState.refineryFuelQuote.before +
                refineryClientState.refineryFuelQuote.gain,
            ),
            refineryClientStateRefineryFuelQuoteCapacity: legacyHtml(
              refineryClientState.refineryFuelQuote.capacity,
            ),
            refineryClientStateRefineryFuelQuoteId: refineryClientState.refineryFuelQuote.id,
          })
        : '',
    ),
  });
}
export function refineryHtml(refineryClientState: RefineryClientState) {
  return refineryPanelHtml(refineryClientState, refineryJobsHtml(refineryClientState));
}
export function initRefineryUI(
  refineryClientState: RefineryClientState,
  send: (message: object) => void,
  render: () => void,
) {
  setInterval(() => {
    for (const htmlElement of document.querySelectorAll<HTMLElement>('[data-ref-time]')) {
      if (!['queued', 'processing'].includes(htmlElement.dataset.refStatus || '')) continue;
      const remaining = Math.max(
          0,
          Math.ceil((Number(htmlElement.dataset.refTime) - Date.now()) / 1000),
        ),
        queue = Math.max(0, Math.ceil((Number(htmlElement.dataset.refStart) - Date.now()) / 1000));
      htmlElement.textContent = `${queue ? `Queue ${queue}s then processing · ` : 'Processing · '}ready in ${Math.floor(remaining / 60)}m ${remaining % 60}s`;
    }
  }, 1000);

  return initRefineryControls(refineryClientState, send, render);
}
