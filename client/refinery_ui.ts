import type { RefineryClientState } from './refinery-controls.ts';

import { escapeHtml as escapeHtml2 } from './html.ts';
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
  return `<section class="refineryjobs"><div class="sect">REFINERY · YOUR JOBS AND GOODS</div><p class="dim small">Jobs keep running while you are away. Collect here when docked or within 500 units. Only you can collect your goods. Smaller amounts stay stored until they add up to a whole tonne.</p>${batches.map((refineryBatch) => `<div class="mcard"><b>${escapeHtml2(title(refineryBatch.quote.output))} · ${escapeHtml2(refineryBatch.status.toUpperCase())}</b><div>${escapeHtml2(STELLARS[refineryBatch.port]?.name || refineryBatch.port)} · ${(refineryBatch.quote.units / 300).toFixed(3)}t · <span data-ref-time="${refineryBatch.readyAt}" data-ref-start="${refineryBatch.startAt}" data-ref-status="${refineryBatch.status}">${refineryBatch.status === 'queued' ? 'cancellable for 30s' : refineryBatch.status === 'processing' ? 'processing' : 'cancelled — exact input returns only'}</span></div>${refineryBatch.status === 'queued' ? `<button class="btn sm" data-refinery="cancel" data-id="${escapeHtml2(refineryBatch.id)}" data-port="${escapeHtml2(refineryBatch.port)}">CANCEL · ${refineryBatch.quote.cancelFee}cr handling</button>` : ''}${refineryBatch.status === 'cancelled' && refineryBatch.returns.some((refineryInput) => Object.values(refineryInput.lots).some(Boolean)) ? `<button class="btn sm" data-refinery="returns" data-id="${escapeHtml2(refineryBatch.id)}" data-port="${escapeHtml2(refineryBatch.port)}">COLLECT RETURNED CARGO</button>` : ''}<button class="btn sm" data-plot="${escapeHtml2(STELLARS[refineryBatch.port]?.system)}">PLOT PORT</button></div>`).join('')}${ready.map((refineryReady) => `<div class="rrow"><span>${escapeHtml2(title(refineryReady.cid))} · ${(refineryReady.units / 300).toFixed(3)}t at ${escapeHtml2(STELLARS[refineryReady.port]?.name || refineryReady.port)}</span><button class="btn sm" data-refinery="claim" data-recipe="${RECIPES.find((recipe) => recipe.output === refineryReady.cid)?.id}" data-port="${escapeHtml2(refineryReady.port)}" ${refineryReady.units < 300 ? 'disabled title="At least 1 tonne must be ready. Smaller amounts stay stored."' : ''}>COLLECT WHAT FITS</button></div>`).join('')}${data.orders.map((miningOrder) => `<div class="mcard"><b>DELIVERY ${miningOrder.qty}t ${escapeHtml2(miningOrder.grade)} ${escapeHtml2(title(miningOrder.cid))}</b><p>${escapeHtml2(STELLARS[miningOrder.port]?.name || miningOrder.port)} · ${miningOrder.reward}cr · Bring this grade before ${new Date(miningOrder.deadline).toLocaleTimeString()}</p><button class="btn sm" data-refinery="deliver" data-order="1" data-id="${escapeHtml2(miningOrder.id)}" data-port="${escapeHtml2(miningOrder.port)}">DELIVER CARGO</button><button class="btn sm" data-refinery="cancelOrder" data-order="1" data-id="${escapeHtml2(miningOrder.id)}" data-port="${escapeHtml2(miningOrder.port)}">CANCEL ORDER</button></div>`).join('')}<div class="rrow"><span>Fuel Cells: ${refineryClientState.you!.cargo?.fuel_cells || 0}t · each adds ${refineryRules.fuelPerCell} fuel, uses the cell</span><button class="btn sm" data-refinery="fuelQuote" ${!refineryClientState.you!.cargo?.fuel_cells ? 'disabled' : ''}>USE 1 CELL → ${refineryRules.fuelPerCell} FUEL</button></div>${refineryClientState.refineryFuelQuote ? `<div class="mcard"><b>USE A FUEL CELL?</b><p>${refineryClientState.refineryFuelQuote.n} cell → ${refineryClientState.refineryFuelQuote.gain} fuel · ${refineryClientState.refineryFuelQuote.before} → ${refineryClientState.refineryFuelQuote.before + refineryClientState.refineryFuelQuote.gain} / ${refineryClientState.refineryFuelQuote.capacity}. This uses one cell. Your ship must have room for the full amount of fuel.</p><button class="btn sm" data-refinery="fuel" data-id="${escapeHtml2(refineryClientState.refineryFuelQuote.id)}">USE CELL</button></div>` : ''}</section>`;
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
