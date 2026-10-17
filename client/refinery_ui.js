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
  return `<section class="refineryjobs"><div class="sect">REFINERY · STORED PROPERTY</div><p class="dim small">Jobs mature offline. Collection stays owner-only within 500 units of the port even if landing/trade permission changes. Fractional output remains stored.</p>${batches.map((b) => `<div class="mcard"><b>${esc(title(b.quote.output))} · ${esc(b.status.toUpperCase())}</b><div>${esc(STELLARS[b.port]?.name || b.port)} · ${(b.quote.units / 300).toFixed(3)}t · <span data-ref-time="${b.readyAt}" data-ref-start="${b.startAt}" data-ref-status="${b.status}">${b.status === 'queued' ? 'cancellable for 30s' : b.status === 'processing' ? 'processing' : 'cancelled — exact input returns only'}</span></div>${b.status === 'queued' ? `<button class="btn sm" data-refinery="cancel" data-id="${esc(b.id)}" data-port="${esc(b.port)}">CANCEL · ${b.quote.cancelFee}cr handling</button>` : ''}${b.status === 'cancelled' && b.returns.some((i) => Object.values(i.lots).some(Boolean)) ? `<button class="btn sm" data-refinery="returns" data-id="${esc(b.id)}" data-port="${esc(b.port)}">COLLECT EXACT INPUT RETURNS</button>` : ''}<button class="btn sm" data-plot="${esc(STELLARS[b.port]?.system)}">PLOT PORT</button></div>`).join('')}${ready.map((b) => `<div class="rrow"><span>${esc(title(b.cid))} · ${(b.units / 300).toFixed(3)}t at ${esc(STELLARS[b.port]?.name || b.port)}</span><button class="btn sm" data-refinery="claim" data-recipe="${RECIPES.find((r) => r.output === b.cid)?.id}" data-port="${esc(b.port)}" ${b.units < 300 ? 'disabled' : ''}>COLLECT UP TO HOLD ROOM</button></div>`).join('')}${data.orders.map((o) => `<div class="mcard"><b>SOURCE ${o.qty}t ${esc(o.grade)} ${esc(o.cid)}</b><p>${esc(STELLARS[o.port]?.name || o.port)} · ${o.reward}cr · exact-grade delivery before ${new Date(o.deadline).toLocaleTimeString()}</p><button class="btn sm" data-refinery="deliver" data-order="1" data-id="${esc(o.id)}" data-port="${esc(o.port)}">DELIVER EXACT LOTS</button><button class="btn sm" data-refinery="cancelOrder" data-order="1" data-id="${esc(o.id)}" data-port="${esc(o.port)}">CANCEL ORDER</button></div>`).join('')}<div class="rrow"><span>Fuel Cells: ${G.you.cargo?.fuel_cells || 0}t · each adds ${R.fuelPerCell} fuel, no reverse conversion</span><button class="btn sm" data-refinery="fuelQuote" ${!G.you.cargo?.fuel_cells ? 'disabled' : ''}>QUOTE 1 CELL → ${R.fuelPerCell} FUEL</button></div>${G.refineryFuelQuote ? `<div class="mcard"><b>FUEL QUOTE ${esc(G.refineryFuelQuote.id)}</b><p>${G.refineryFuelQuote.n} cell → ${G.refineryFuelQuote.gain} fuel · ${G.refineryFuelQuote.before} → ${G.refineryFuelQuote.before + G.refineryFuelQuote.gain} / ${G.refineryFuelQuote.capacity}. No capacity clipping; expires ${new Date(G.refineryFuelQuote.expires).toLocaleTimeString()}.</p><button class="btn sm" data-refinery="fuel" data-id="${esc(G.refineryFuelQuote.id)}">CONFIRM FUEL CELL CONSUMPTION</button></div>` : ''}</section>`;
}
export function refineryHtml(G) {
  const data = G.you?.refinery || G.landed?.refinery;
  if (!data) return '<p>Refinery unavailable.</p>';
  const q = G.refineryQuote;
  return `<div class="sect">REFINERY · ${data.home ? 'HOME 100% RECOVERY · LOWER NEW-RECIPE FEES' : 'PUBLIC RECOVERY / SERVICE FEES'}</div><p class="dim">Trade goods, not construction crates. Standard recipes default to common input; premium grades do not increase output mass. Composite uses 3 pure tonnes EACH of ore/gas/shards.</p><div class="rrow"><label>Recipe <select id="refrecipe">${RECIPES.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label><label>Grade <select id="refgrade"><option>common</option><option>rich</option><option>pure</option></select></label><label>Tonnes per input <input id="refquantity" type="number" min="1" max="300" value="3" style="width:6em"></label><label>Service <select id="refmode"><option value="stored">Stored 5–30min · 30s cancellation queue</option><option value="instant">Premium instant · up to 30t</option></select></label><button class="btn" data-refinery="quote">GET BINDING QUOTE</button></div>${q ? `<div class="mcard" id="refquote"><b>CONFIRM EXACT QUOTE ${esc(q.id)}</b><p>${q.inputs.map((i) => `${Object.values(i.lots).reduce((a, b) => a + b, 0)}t ${esc(Object.entries(i.lots).find(([, n]) => n)?.[0])} ${esc(i.cid)}`).join(' + ')} → ${(q.units / 300).toFixed(3)}t ${esc(title(q.output))} (${q.recovery}% recovery).</p><p>Fee ${q.fee}cr · ${q.mode === 'stored' ? `${Math.round(q.duration / 60000)}min processing after 30s queue` : 'instant ready balance'} · expires ${new Date(q.expires).toLocaleTimeString()}.</p><p class="dim">Stored base service is 20% less; the no-locked-arbitrage floor may constrain this discount. Fractional entitlement is retained; only whole tonnes enter cargo. Selected premium inputs are consumed exactly.</p><button class="btn" data-refinery="submit" data-id="${esc(q.id)}">CONFIRM · PAY ${q.fee}cr</button></div>` : ''}<div class="sect">FINITE SOURCING ORDERS</div>${data.offers.map((o) => `<div class="rrow"><span>${o.qty}t ${esc(o.grade)} ${esc(o.cid)} · ${o.reward}cr</span><button class="btn sm" data-refinery="accept" data-order="1" data-id="${esc(o.id)}" data-port="${esc(o.port)}">ACCEPT RESERVED ORDER</button></div>`).join('') || '<p class="dim">No demand remains in this window.</p>'}${refineryJobsHtml(G)}`;
}
export function initRefineryUI(G, send) {
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-ref-time]')) {
      if (!['queued', 'processing'].includes(el.dataset.refStatus)) continue;
      const remaining = Math.max(0, Math.ceil((Number(el.dataset.refTime) - Date.now()) / 1000)),
        queue = Math.max(0, Math.ceil((Number(el.dataset.refStart) - Date.now()) / 1000));
      el.textContent = `${queue ? `Queue ${queue}s then processing · ` : 'Processing · '}ready in ${Math.floor(remaining / 60)}m ${remaining % 60}s`;
    }
  }, 1000);

  document.addEventListener('click', (event) => {
    const b = event.target.closest('[data-refinery]');
    if (!b || b.disabled) return;
    event.preventDefault();
    if (G.paused) return;
    const m = { t: b.dataset.order ? 'miningOrder' : 'refinery', op: b.dataset.refinery };
    for (const k of ['id', 'port', 'recipe']) if (b.dataset[k]) m[k] = b.dataset[k];
    if (m.op === 'quote')
      Object.assign(m, {
        recipe: document.getElementById('refrecipe').value,
        grade: document.getElementById('refgrade').value,
        n: Number(document.getElementById('refquantity').value),
        mode: document.getElementById('refmode').value,
      });
    if (['cancel', 'submit'].includes(m.op)) delete m.port;
    if (m.op === 'fuelQuote') m.n = 1;
    if (m.op === 'fuel') G.refineryFuelQuote = null;
    send(m);
  });
}
