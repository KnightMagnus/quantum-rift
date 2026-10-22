import type { RefineryQuote, RefineryWire, FuelQuote } from '../server/refinery-contracts.ts';
import type { CargoLedger, RawGrade } from '../shared/cargo-contracts.ts';
import type { Recipe } from '../shared/refinery-rules.ts';
export interface RefineryDraft {
  recipe: string;
  grade: string;
  n: string;
  mode: string;
}
export interface RefineryClientState {
  /** Current player save data. */
  you?: {
    name: string;
    refinery?: RefineryWire;
    cargoLots?: CargoLedger;
    cargo: Record<string, number>;
    credits: number;
  } | null;

  /** Currently docked stellar body or null if flying. */
  landed?: { stellar: string; refinery?: RefineryWire } | null;

  /**
   * Active landed tab.
   * Currently active tab
   */
  ltab?: string | null;
  refineryDraft?: RefineryDraft | null;
  refineryQuote?: RefineryQuote | null;
  refineryFuelQuote?: FuelQuote | null;
  refineryBusy?: boolean;
  refineryChecking?: boolean;
  refineryCostError?: boolean;
  paused?: boolean;
}

import { escapeHtml as escapeHtml2 } from './html.ts';
import { RECIPES, REFINERY_RULES as refineryRules } from '../shared/refinery-rules.ts';
import { COMMODITIES } from '../shared/galaxy.ts';

const title = (captainId: string) =>
  COMMODITIES.find((commodityDef) => commodityDef.id === captainId)?.name || captainId;
export function refineryDraft(refineryClientState: RefineryClientState) {
  return (refineryClientState.refineryDraft ||= {
    recipe: 'alloy',
    grade: 'common',
    n: '3',
    mode: 'stored',
  });
}
function choice(refineryClientState: RefineryClientState) {
  const draft = refineryDraft(refineryClientState),
    recipe = RECIPES.find((recipe2) => recipe2.id === draft.recipe),
    count = Number(draft.n);
  const grade = recipe?.pure ? 'pure' : recipe?.inputs[0] === 'plasma' ? 'common' : draft.grade;
  return { ...draft, grade, recipe, n: count };
}
function valid(
  component: ReturnType<typeof choice>,
): component is ReturnType<typeof choice> & { recipe: Recipe } {
  return (component.recipe &&
    Number.isSafeInteger(component.n) &&
    component.n > 0 &&
    ['common', 'rich', 'pure'].includes(component.grade) &&
    ['stored', 'instant'].includes(component.mode) &&
    component.n * component.recipe.inputs.length <=
      (component.mode === 'instant' ? refineryRules.instantCap : refineryRules.storedCap) &&
    (!component.recipe.pure || component.n % 3 === 0)) as boolean;
}
export function matchingRefineryCost(
  refineryClientState: RefineryClientState,
  refineryQuote: RefineryQuote | null | undefined,
): refineryQuote is RefineryQuote {
  const choice2 = choice(refineryClientState);
  return (
    !!refineryQuote &&
    valid(choice2) &&
    refineryQuote.port === refineryClientState.landed?.stellar &&
    refineryQuote.recipe === choice2.recipe.id &&
    refineryQuote.mode === choice2.mode &&
    refineryQuote.expires > Date.now() &&
    refineryQuote.inputs.length === choice2.recipe.inputs.length &&
    refineryQuote.inputs.every(
      (refineryInput, count) =>
        refineryInput.cid === choice2.recipe.inputs[count] &&
        Object.entries(refineryInput.lots).every(
          ([game, value]) => value === (game === choice2.grade ? choice2.n : 0),
        ),
    )
  );
}
export function refineryPanelHtml(refineryClientState: RefineryClientState, jobs: string) {
  const data = refineryClientState.you?.refinery || refineryClientState.landed?.refinery;
  if (!data) return '<p>Refinery unavailable.</p>';
  const draft = refineryDraft(refineryClientState),
    choice2 = choice(refineryClientState),
    recipe = choice2.recipe || RECIPES[0];
  const refineryQuote2 = matchingRefineryCost(
    refineryClientState,
    refineryClientState.refineryQuote,
  )
    ? refineryClientState.refineryQuote
    : null;
  const have = (captainId: string) =>
    refineryClientState.you?.cargoLots?.byCommodity?.[captainId]?.[choice2.grade as RawGrade] || 0;
  const enough = valid(choice2) && recipe.inputs.every((captainId) => have(captainId) >= choice2.n);
  const reserved = recipe.inputs.some((captainId) => {
    const promised = (data.orders || [])
      .filter((miningOrder) => miningOrder.cid === captainId && miningOrder.grade === choice2.grade)
      .reduce((count, miningOrder) => count + miningOrder.qty, 0);
    return promised > 0 && have(captainId) - choice2.n < promised;
  });
  const premium = choice2.grade !== 'common' && !recipe.pure;
  const ready =
    refineryQuote2 &&
    enough &&
    (refineryClientState.you?.credits as number) >= refineryQuote2.fee &&
    !refineryClientState.refineryBusy &&
    !refineryClientState.paused;
  const inputs = recipe.inputs
    .map(
      (captainId) =>
        `${Number.isFinite(choice2.n) ? choice2.n : '?'} t ${escapeHtml2(choice2.grade)} ${escapeHtml2(title(captainId))} <span class="dim small">(${have(captainId)} t aboard)</span>`,
    )
    .join(' + ');
  return `<div class="sect">REFINERY${data.home ? ' · YOUR STATION' : ''}</div>
    <p class="dim">Turn raw cargo into trade goods. Choose what to make; the cost and result appear below. Construction crates use your station's separate workshop.</p>
    <div class="rrow refinery-form">
      <label>Make <select id="refrecipe">${RECIPES.map((recipe2) => `<option value="${recipe2.id}"${recipe2.id === draft.recipe ? ' selected' : ''}>${escapeHtml2(recipe2.name)}</option>`).join('')}</select></label>
      <label>Use grade <select id="refgrade"${recipe.pure || recipe.inputs[0] === 'plasma' ? ' disabled' : ''}>${['common', 'rich', 'pure'].map((game) => `<option${game === choice2.grade ? ' selected' : ''}>${game}</option>`).join('')}</select></label>
      <label>${recipe.inputs.length > 1 ? 'Tonnes of each material' : 'Tonnes'} <input id="refquantity" type="number" required min="${recipe.pure ? 3 : 1}" max="${Math.floor((choice2.mode === 'instant' ? refineryRules.instantCap : refineryRules.storedCap) / recipe.inputs.length)}" step="${recipe.pure ? 3 : 1}" value="${escapeHtml2(draft.n)}" inputmode="numeric"></label>
      <label>Speed <select id="refmode"><option value="stored"${choice2.mode === 'stored' ? ' selected' : ''}>Standard · ready later</option><option value="instant"${choice2.mode === 'instant' ? ' selected' : ''}>Express · ready now</option></select></label>
    </div>
    <div class="mcard" id="refquote" aria-live="polite">
      <b>YOU USE</b><p>${inputs}</p>
      ${recipe.pure ? '<p class="dim small">Composite Plating needs equal amounts of pure ore, gas and shards, in groups of 3 tonnes each.</p>' : ''}
      ${premium ? '<p class="jwarn">Rich and pure cargo sell for more, but give no extra output here. Common cargo is usually the better choice.</p>' : ''}
      ${reserved ? '<p class="jwarn">This uses cargo you still need for a delivery. You may refine it, but you will need to replace it to finish that job.</p>' : ''}
      ${!valid(choice2) ? '<p class="jwarn">Choose a whole amount within the limits above.</p>' : !enough ? '<p class="jwarn">Not enough of the selected cargo grade aboard. <button class="btn sm" data-act="ltab" data-t="trade">CHECK TRADE CARGO</button></p>' : ''}
      ${refineryQuote2 ? `<b>YOU GET</b><p>${(refineryQuote2.units / refineryRules.units).toFixed(3)} t ${escapeHtml2(title(refineryQuote2.output))} · ${refineryQuote2.mode === 'instant' ? 'ready to collect now' : `ready in about ${Math.ceil((refineryQuote2.duration + refineryRules.queueMs) / 60000)} min`}</p><p><b>Total cost: ${refineryQuote2.fee.toLocaleString()} credits</b>${refineryClientState.you!.credits < refineryQuote2.fee ? ' · not enough credits' : ''}</p><p class="dim small">${refineryQuote2.recovery}% of the usable material is recovered. Collect whole tonnes here; smaller amounts stay safely stored.${refineryQuote2.mode === 'stored' ? ` You can cancel during the first 30 seconds for ${refineryQuote2.cancelFee} credits.` : ''}</p>` : `<p class="dim">${refineryClientState.refineryCostError ? 'Could not load the current cost. Try again when connected.' : 'Checking the current cost…'}</p>`}
      ${refineryClientState.paused ? '<p class="jwarn">Solo is paused. Resume before starting a job.</p>' : ''}
      <button class="btn" data-refinery="submit"${refineryQuote2 ? ` data-id="${escapeHtml2(refineryQuote2.id)}"` : ''}${ready ? '' : ' disabled'}>${refineryClientState.refineryBusy ? 'STARTING…' : refineryQuote2 ? `START REFINING · ${refineryQuote2.fee.toLocaleString()} CR` : 'START REFINING'}</button>
      ${refineryClientState.refineryCostError ? '<button class="btn sm" data-refinery="retry">UPDATE COST</button>' : ''}
    </div>
    <div class="sect">DELIVERIES WANTED</div>${data.offers.map((miningOrder) => `<div class="rrow"><span>${miningOrder.qty} t ${escapeHtml2(miningOrder.grade)} ${escapeHtml2(title(miningOrder.cid))} · pays ${miningOrder.reward.toLocaleString()} credits</span><button class="btn sm" data-refinery="accept" data-order="1" data-id="${escapeHtml2(miningOrder.id)}" data-port="${escapeHtml2(miningOrder.port)}">ACCEPT DELIVERY</button></div>`).join('') || '<p class="dim">No deliveries wanted here right now.</p>'}${jobs}`;
}
export function initRefineryControls(
  refineryClientState: RefineryClientState,
  send: (message: object) => void,
  render: () => void,
) {
  let entryKey2: string | null = null,
    waiting = false,
    requestedAt = 0,
    notBefore = 0,
    owner: string | undefined | null = null,
    submittedAt = 0;
  const active = () =>
    refineryClientState.you &&
    refineryClientState.landed &&
    refineryClientState.ltab === 'refinery' &&
    document.getElementById('refrecipe');
  function requestKey() {
    const choice2 = choice(refineryClientState);
    return JSON.stringify([
      refineryClientState.you?.name,
      refineryClientState.landed?.stellar,
      choice2.recipe?.id,
      choice2.grade,
      choice2.n,
      choice2.mode,
    ]);
  }
  function changed() {
    entryKey2 = null;
    waiting = false;
    refineryClientState.refineryQuote = null;
    refineryClientState.refineryCostError = false;
    notBefore = Date.now() + 250;
    const button = document.querySelector<HTMLButtonElement>('[data-refinery="submit"]');
    if (button) button.disabled = true;
  }
  document.addEventListener('input', (event) => {
    if ((event.target as HTMLInputElement).id !== 'refquantity') return;
    refineryDraft(refineryClientState).n = (event.target as HTMLInputElement).value;
    changed();
  });
  document.addEventListener('change', (event) => {
    const fields: Record<string, keyof RefineryDraft> = {
      refrecipe: 'recipe',
      refgrade: 'grade',
      refmode: 'mode',
    };
    const field = fields[(event.target as HTMLInputElement).id];
    if (!field) return;
    refineryDraft(refineryClientState)[field] = (event.target as HTMLInputElement).value;
    changed();
    render();
  });
  document.addEventListener('click', (event) => {
    const htmlButtonElement = (event.target as HTMLInputElement).closest<HTMLButtonElement>(
      '[data-refinery]',
    );
    if (!htmlButtonElement || htmlButtonElement.disabled || refineryClientState.paused) return;
    event.preventDefault();
    const refinery2 = htmlButtonElement.dataset.refinery;
    if (refinery2 === 'retry') {
      changed();
      return;
    }
    if (refinery2 === 'submit') {
      if (
        refineryClientState.refineryBusy ||
        !matchingRefineryCost(refineryClientState, refineryClientState.refineryQuote) ||
        htmlButtonElement.dataset.id !== refineryClientState.refineryQuote!.id
      ) {
        changed();
        render();
        return;
      }
      refineryClientState.refineryBusy = true;
      refineryClientState.refineryChecking = false;
      submittedAt = Date.now();
      htmlButtonElement.disabled = true;
      htmlButtonElement.textContent = 'STARTING…';
    }
    const message: {
      t: string;
      op?: string;
      id?: string;
      port?: string;
      recipe?: string;
      n?: number;
    } = {
      t: htmlButtonElement.dataset.order ? 'miningOrder' : 'refinery',
      op: refinery2,
    };
    for (const entryKey of ['id', 'port', 'recipe'])
      if (htmlButtonElement.dataset[entryKey])
        message[entryKey as 'id' | 'port' | 'recipe'] = htmlButtonElement.dataset[entryKey];
    if (['cancel', 'submit'].includes(refinery2!)) delete message.port;
    if (refinery2 === 'fuelQuote') message.n = 1;
    if (refinery2 === 'fuel') refineryClientState.refineryFuelQuote = null;
    send(message);
  });
  return {
    receiveQuote(refineryQuote2: RefineryQuote) {
      if (
        !active() ||
        !matchingRefineryCost(refineryClientState, refineryQuote2) ||
        entryKey2 !== requestKey()
      )
        return false;
      waiting = false;
      refineryClientState.refineryQuote = refineryQuote2;
      refineryClientState.refineryCostError = false;
      return true;
    },
    connected() {
      refineryClientState.refineryChecking = false;
    },
    settled(operation: string) {
      if (
        refineryClientState.refineryBusy &&
        !['submit', 'list'].includes(operation) &&
        !refineryClientState.you?.refinery?.batches?.some(
          (refineryBatch) => refineryBatch.quote.id === refineryClientState.refineryQuote?.id,
        )
      )
        return;
      refineryClientState.refineryBusy = false;
      refineryClientState.refineryChecking = false;
      changed();
    },
    failed(operation: string) {
      if (!['preview', 'quote', 'submit'].includes(operation)) return;
      waiting = false;
      refineryClientState.refineryBusy = false;
      refineryClientState.refineryQuote = null;
      if (operation === 'submit') {
        changed();
        return;
      }
      refineryClientState.refineryCostError = true;
    },
    refresh() {
      if (owner !== refineryClientState.you?.name) {
        owner = refineryClientState.you?.name;
        entryKey2 = null;
        waiting = false;
        refineryClientState.refineryDraft = null;
        refineryClientState.refineryQuote = null;
        refineryClientState.refineryBusy = false;
        refineryClientState.refineryCostError = false;
      }
      if (!active()) {
        entryKey2 = null;
        waiting = false;
        return;
      }
      if (refineryClientState.paused) return;
      if (refineryClientState.refineryBusy) {
        // Query authoritative state after a delayed response; never auto-submit again.
        if (!refineryClientState.refineryChecking && Date.now() - submittedAt > 5000) {
          refineryClientState.refineryChecking = true;
          send({ t: 'refinery', op: 'list' });
          render();
        }
        return;
      }
      if (refineryClientState.refineryCostError || Date.now() < notBefore) return;
      if (waiting) {
        if (Date.now() - requestedAt > 5000) {
          waiting = false;
          refineryClientState.refineryCostError = true;
          render();
        }
        return;
      }
      const choice2 = choice(refineryClientState),
        next = requestKey();
      if (!valid(choice2)) {
        if (entryKey2 !== next) {
          entryKey2 = next;
          render();
        }
        return;
      }
      if (
        entryKey2 === next &&
        matchingRefineryCost(refineryClientState, refineryClientState.refineryQuote) &&
        refineryClientState.refineryQuote.expires - Date.now() > 3000
      )
        return;
      entryKey2 = next;
      requestedAt = Date.now();
      waiting = true;
      refineryClientState.refineryQuote = null;
      send({
        t: 'refinery',
        op: 'preview',
        recipe: choice2.recipe.id,
        grade: choice2.grade,
        mode: choice2.mode,
        n: choice2.n,
      });
      render();
    },
  };
}
