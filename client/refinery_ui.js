import { refineryPanelHtml, initRefineryControls } from './refinery-controls.js';
import { RECIPES, REFINERY_RULES as R } from '/shared/refinery-rules.js';
import { STELLARS, COMMODITIES } from '/shared/galaxy.js';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const title = (cid) => COMMODITIES.find((c) => c.id === cid)?.name || cid;
export function refineryJobsHtml(G) {
  const data = G.you?.refinery;
  if (!data) return '';
  const batches = data.batches.filter(
      (b) =>
        !b.credited &&
        (b.status !== 'cancelled' || b.returns.some((i) => Object.values(i.lots).some(Boolean))),
    ),
    ready = data.ready.filter((b) => b.units > 0);
  return `<section class="refineryjobs"><div class="sect">REFINERY · YOUR JOBS AND GOODS</div><p class="dim small">Jobs keep running while you are away. Collect here when docked or within 500 units. Only you can collect your goods. Smaller amounts stay stored until they add up to a whole tonne.</p>${batches.map((b) => `<div class="mcard"><b>${esc(title(b.quote.output))} · ${esc(b.status.toUpperCase())}</b><div>${esc(STELLARS[b.port]?.name || b.port)} · ${(b.quote.units / 300).toFixed(3)}t · <span data-ref-time="${b.readyAt}" data-ref-start="${b.startAt}" data-ref-status="${b.status}">${b.status === 'queued' ? 'cancellable for 30s' : b.status === 'processing' ? 'processing' : 'cancelled — exact input returns only'}</span></div>${b.status === 'queued' ? `<button class="btn sm" data-refinery="cancel" data-id="${esc(b.id)}" data-port="${esc(b.port)}">CANCEL · ${b.quote.cancelFee}cr handling</button>` : ''}${b.status === 'cancelled' && b.returns.some((i) => Object.values(i.lots).some(Boolean)) ? `<button class="btn sm" data-refinery="returns" data-id="${esc(b.id)}" data-port="${esc(b.port)}">COLLECT RETURNED CARGO</button>` : ''}<button class="btn sm" data-plot="${esc(STELLARS[b.port]?.system)}">PLOT PORT</button></div>`).join('')}${ready.map((b) => `<div class="rrow"><span>${esc(title(b.cid))} · ${(b.units / 300).toFixed(3)}t at ${esc(STELLARS[b.port]?.name || b.port)}</span><button class="btn sm" data-refinery="claim" data-recipe="${RECIPES.find((r) => r.output === b.cid)?.id}" data-port="${esc(b.port)}" ${b.units < 300 ? 'disabled title="At least 1 tonne must be ready. Smaller amounts stay stored."' : ''}>COLLECT WHAT FITS</button></div>`).join('')}${data.orders.map((o) => `<div class="mcard"><b>DELIVERY ${o.qty}t ${esc(o.grade)} ${esc(title(o.cid))}</b><p>${esc(STELLARS[o.port]?.name || o.port)} · ${o.reward}cr · Bring this grade before ${new Date(o.deadline).toLocaleTimeString()}</p><button class="btn sm" data-refinery="deliver" data-order="1" data-id="${esc(o.id)}" data-port="${esc(o.port)}">DELIVER CARGO</button><button class="btn sm" data-refinery="cancelOrder" data-order="1" data-id="${esc(o.id)}" data-port="${esc(o.port)}">CANCEL ORDER</button></div>`).join('')}<div class="rrow"><span>Fuel Cells: ${G.you.cargo?.fuel_cells || 0}t · each adds ${R.fuelPerCell} fuel, uses the cell</span><button class="btn sm" data-refinery="fuelQuote" ${!G.you.cargo?.fuel_cells ? 'disabled' : ''}>USE 1 CELL → ${R.fuelPerCell} FUEL</button></div>${G.refineryFuelQuote ? `<div class="mcard"><b>USE A FUEL CELL?</b><p>${G.refineryFuelQuote.n} cell → ${G.refineryFuelQuote.gain} fuel · ${G.refineryFuelQuote.before} → ${G.refineryFuelQuote.before + G.refineryFuelQuote.gain} / ${G.refineryFuelQuote.capacity}. This uses one cell. Your ship must have room for the full amount of fuel.</p><button class="btn sm" data-refinery="fuel" data-id="${esc(G.refineryFuelQuote.id)}">USE CELL</button></div>` : ''}</section>`;
}
export function refineryHtml(G) {
  return refineryPanelHtml(G, refineryJobsHtml(G));
}
export function initRefineryUI(G, send, render) {
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-ref-time]')) {
      if (!['queued', 'processing'].includes(el.dataset.refStatus)) continue;
      const remaining = Math.max(0, Math.ceil((Number(el.dataset.refTime) - Date.now()) / 1000)),
        queue = Math.max(0, Math.ceil((Number(el.dataset.refStart) - Date.now()) / 1000));
      el.textContent = `${queue ? `Queue ${queue}s then processing · ` : 'Processing · '}ready in ${Math.floor(remaining / 60)}m ${remaining % 60}s`;
    }
  }, 1000);

  return initRefineryControls(G, send, render);
}
