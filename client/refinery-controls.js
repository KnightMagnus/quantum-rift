import { RECIPES, REFINERY_RULES as R } from '/shared/refinery-rules.js';
import { COMMODITIES } from '/shared/galaxy.js';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const title = (cid) => COMMODITIES.find((c) => c.id === cid)?.name || cid;
export function refineryDraft(G) {
  return (G.refineryDraft ||= { recipe: 'alloy', grade: 'common', n: '3', mode: 'stored' });
}
function choice(G) {
  const draft = refineryDraft(G),
    recipe = RECIPES.find((r) => r.id === draft.recipe),
    n = Number(draft.n);
  const grade = recipe?.pure ? 'pure' : recipe?.inputs[0] === 'plasma' ? 'common' : draft.grade;
  return { ...draft, grade, recipe, n };
}
function valid(c) {
  return (
    c.recipe &&
    Number.isSafeInteger(c.n) &&
    c.n > 0 &&
    ['common', 'rich', 'pure'].includes(c.grade) &&
    ['stored', 'instant'].includes(c.mode) &&
    c.n * c.recipe.inputs.length <= (c.mode === 'instant' ? R.instantCap : R.storedCap) &&
    (!c.recipe.pure || c.n % 3 === 0)
  );
}
export function matchingRefineryCost(G, q) {
  const c = choice(G);
  return (
    !!q &&
    valid(c) &&
    q.port === G.landed?.stellar &&
    q.recipe === c.recipe.id &&
    q.mode === c.mode &&
    q.expires > Date.now() &&
    q.inputs.length === c.recipe.inputs.length &&
    q.inputs.every(
      (i, n) =>
        i.cid === c.recipe.inputs[n] &&
        Object.entries(i.lots).every(([g, v]) => v === (g === c.grade ? c.n : 0)),
    )
  );
}
export function refineryPanelHtml(G, jobs) {
  const data = G.you?.refinery || G.landed?.refinery;
  if (!data) return '<p>Refinery unavailable.</p>';
  const draft = refineryDraft(G),
    c = choice(G),
    recipe = c.recipe || RECIPES[0];
  const q = matchingRefineryCost(G, G.refineryQuote) ? G.refineryQuote : null;
  const have = (cid) => G.you?.cargoLots?.byCommodity?.[cid]?.[c.grade] || 0;
  const enough = valid(c) && recipe.inputs.every((cid) => have(cid) >= c.n);
  const reserved = recipe.inputs.some((cid) => {
    const promised = (data.orders || [])
      .filter((o) => o.cid === cid && o.grade === c.grade)
      .reduce((n, o) => n + o.qty, 0);
    return promised > 0 && have(cid) - c.n < promised;
  });
  const premium = c.grade !== 'common' && !recipe.pure;
  const ready = q && enough && G.you?.credits >= q.fee && !G.refineryBusy && !G.paused;
  const inputs = recipe.inputs
    .map(
      (cid) =>
        `${Number.isFinite(c.n) ? c.n : '?'} t ${esc(c.grade)} ${esc(title(cid))} <span class="dim small">(${have(cid)} t aboard)</span>`,
    )
    .join(' + ');
  return `<div class="sect">REFINERY${data.home ? ' · YOUR STATION' : ''}</div>
    <p class="dim">Turn raw cargo into trade goods. Choose what to make; the cost and result appear below. Construction crates use your station's separate workshop.</p>
    <div class="rrow refinery-form">
      <label>Make <select id="refrecipe">${RECIPES.map((r) => `<option value="${r.id}"${r.id === draft.recipe ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label>Use grade <select id="refgrade"${recipe.pure || recipe.inputs[0] === 'plasma' ? ' disabled' : ''}>${['common', 'rich', 'pure'].map((g) => `<option${g === c.grade ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
      <label>${recipe.inputs.length > 1 ? 'Tonnes of each material' : 'Tonnes'} <input id="refquantity" type="number" required min="${recipe.pure ? 3 : 1}" max="${Math.floor((c.mode === 'instant' ? R.instantCap : R.storedCap) / recipe.inputs.length)}" step="${recipe.pure ? 3 : 1}" value="${esc(draft.n)}" inputmode="numeric"></label>
      <label>Speed <select id="refmode"><option value="stored"${c.mode === 'stored' ? ' selected' : ''}>Standard · ready later</option><option value="instant"${c.mode === 'instant' ? ' selected' : ''}>Express · ready now</option></select></label>
    </div>
    <div class="mcard" id="refquote" aria-live="polite">
      <b>YOU USE</b><p>${inputs}</p>
      ${recipe.pure ? '<p class="dim small">Composite Plating needs equal amounts of pure ore, gas and shards, in groups of 3 tonnes each.</p>' : ''}
      ${premium ? '<p class="jwarn">Rich and pure cargo sell for more, but give no extra output here. Common cargo is usually the better choice.</p>' : ''}
      ${reserved ? '<p class="jwarn">This uses cargo you still need for a delivery. You may refine it, but you will need to replace it to finish that job.</p>' : ''}
      ${!valid(c) ? '<p class="jwarn">Choose a whole amount within the limits above.</p>' : !enough ? '<p class="jwarn">Not enough of the selected cargo grade aboard.</p>' : ''}
      ${q ? `<b>YOU GET</b><p>${(q.units / R.units).toFixed(3)} t ${esc(title(q.output))} · ${q.mode === 'instant' ? 'ready to collect now' : `ready in about ${Math.ceil((q.duration + R.queueMs) / 60000)} min`}</p><p><b>Total cost: ${q.fee.toLocaleString()} credits</b>${G.you.credits < q.fee ? ' · not enough credits' : ''}</p><p class="dim small">${q.recovery}% of the usable material is recovered. Collect whole tonnes here; smaller amounts stay safely stored.${q.mode === 'stored' ? ` You can cancel during the first 30 seconds for ${q.cancelFee} credits.` : ''}</p>` : `<p class="dim">${G.refineryCostError ? 'Could not load the current cost. Try again when connected.' : 'Checking the current cost…'}</p>`}
      <button class="btn" data-refinery="submit"${q ? ` data-id="${esc(q.id)}"` : ''}${ready ? '' : ' disabled'}>${G.refineryBusy ? 'STARTING…' : q ? `START REFINING · ${q.fee.toLocaleString()} CR` : 'START REFINING'}</button>
      ${G.refineryCostError ? '<button class="btn sm" data-refinery="retry">UPDATE COST</button>' : ''}
    </div>
    <div class="sect">DELIVERIES WANTED</div>${data.offers.map((o) => `<div class="rrow"><span>${o.qty} t ${esc(o.grade)} ${esc(title(o.cid))} · pays ${o.reward.toLocaleString()} credits</span><button class="btn sm" data-refinery="accept" data-order="1" data-id="${esc(o.id)}" data-port="${esc(o.port)}">ACCEPT DELIVERY</button></div>`).join('') || '<p class="dim">No deliveries wanted here right now.</p>'}${jobs}`;
}
export function initRefineryControls(G, send, render) {
  let key = null,
    waiting = false,
    requestedAt = 0,
    notBefore = 0,
    owner = null,
    submittedAt = 0;
  const active = () =>
    G.you && G.landed && G.ltab === 'refinery' && document.getElementById('refrecipe');
  function requestKey() {
    const c = choice(G);
    return JSON.stringify([G.you?.name, G.landed?.stellar, c.recipe?.id, c.grade, c.n, c.mode]);
  }
  function changed() {
    key = null;
    waiting = false;
    G.refineryQuote = null;
    G.refineryCostError = false;
    notBefore = Date.now() + 250;
    const button = document.querySelector('[data-refinery="submit"]');
    if (button) button.disabled = true;
  }
  document.addEventListener('input', (event) => {
    if (event.target.id !== 'refquantity') return;
    refineryDraft(G).n = event.target.value;
    changed();
  });
  document.addEventListener('change', (event) => {
    const fields = { refrecipe: 'recipe', refgrade: 'grade', refmode: 'mode' };
    const field = fields[event.target.id];
    if (!field) return;
    refineryDraft(G)[field] = event.target.value;
    changed();
    render();
  });
  document.addEventListener('click', (event) => {
    const b = event.target.closest('[data-refinery]');
    if (!b || b.disabled || G.paused) return;
    event.preventDefault();
    const op = b.dataset.refinery;
    if (op === 'retry') {
      changed();
      return;
    }
    if (op === 'submit') {
      if (
        G.refineryBusy ||
        !matchingRefineryCost(G, G.refineryQuote) ||
        b.dataset.id !== G.refineryQuote.id
      ) {
        changed();
        render();
        return;
      }
      G.refineryBusy = true;
      G.refineryChecking = false;
      submittedAt = Date.now();
      b.disabled = true;
      b.textContent = 'STARTING…';
    }
    const m = { t: b.dataset.order ? 'miningOrder' : 'refinery', op };
    for (const k of ['id', 'port', 'recipe']) if (b.dataset[k]) m[k] = b.dataset[k];
    if (['cancel', 'submit'].includes(op)) delete m.port;
    if (op === 'fuelQuote') m.n = 1;
    if (op === 'fuel') G.refineryFuelQuote = null;
    send(m);
  });
  return {
    receiveQuote(q) {
      if (!active() || !matchingRefineryCost(G, q) || key !== requestKey()) return false;
      waiting = false;
      G.refineryQuote = q;
      G.refineryCostError = false;
      return true;
    },
    connected() {
      G.refineryChecking = false;
    },
    settled(op) {
      if (
        G.refineryBusy &&
        !['submit', 'list'].includes(op) &&
        !G.you?.refinery?.batches?.some((b) => b.quote.id === G.refineryQuote?.id)
      )
        return;
      G.refineryBusy = false;
      G.refineryChecking = false;
      changed();
    },
    failed(op) {
      if (!['preview', 'quote', 'submit'].includes(op)) return;
      waiting = false;
      G.refineryBusy = false;
      G.refineryQuote = null;
      if (op === 'submit') {
        changed();
        return;
      }
      G.refineryCostError = true;
    },
    refresh() {
      if (owner !== G.you?.name) {
        owner = G.you?.name;
        key = null;
        waiting = false;
        G.refineryDraft = null;
        G.refineryQuote = null;
        G.refineryBusy = false;
        G.refineryCostError = false;
      }
      if (!active()) {
        key = null;
        waiting = false;
        return;
      }
      if (G.paused) return;
      if (G.refineryBusy) {
        // Query authoritative state after a delayed response; never auto-submit again.
        if (!G.refineryChecking && Date.now() - submittedAt > 5000) {
          G.refineryChecking = true;
          send({ t: 'refinery', op: 'list' });
          render();
        }
        return;
      }
      if (G.refineryCostError || Date.now() < notBefore) return;
      if (waiting) {
        if (Date.now() - requestedAt > 5000) {
          waiting = false;
          G.refineryCostError = true;
          render();
        }
        return;
      }
      const c = choice(G),
        next = requestKey();
      if (!valid(c)) {
        if (key !== next) {
          key = next;
          render();
        }
        return;
      }
      if (
        key === next &&
        matchingRefineryCost(G, G.refineryQuote) &&
        G.refineryQuote.expires - Date.now() > 3000
      )
        return;
      key = next;
      requestedAt = Date.now();
      waiting = true;
      G.refineryQuote = null;
      send({
        t: 'refinery',
        op: 'preview',
        recipe: c.recipe.id,
        grade: c.grade,
        mode: c.mode,
        n: c.n,
      });
      render();
    },
  };
}
