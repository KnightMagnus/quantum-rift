import { legacyHtml } from './eta-runtime.ts';
import { renderRefineryControlsRefineryPanelHtmlAttribute001 } from './eta-templates.ts';
import {
  renderRefineryControlsRefineryPanelHtmlFragment001,
  renderRefineryControlsRefineryPanelHtmlFragment002,
  renderRefineryControlsRefineryPanelHtmlFragment003,
  renderRefineryControlsRefineryPanelHtmlFragment004,
  renderRefineryControlsRefineryPanelHtmlFragment005,
  renderRefineryControlsRefineryPanelHtmlFragment006,
  renderRefineryControlsRefineryPanelHtmlFragment007,
  renderRefineryControlsRefineryPanelHtmlFragment008,
  renderRefineryControlsRefineryPanelHtmlFragment009,
  renderRefineryControlsRefineryPanelHtmlFragment010,
  renderRefineryControlsRefineryPanelHtmlFragment011,
  renderRefineryControlsRefineryPanelHtmlFragment012,
  renderRefineryControlsRefineryPanelHtmlFragment013,
  renderRefineryControlsRefineryPanelHtmlFragment014,
  renderRefineryControlsRefineryPanelHtmlFragment015,
  renderRefineryControlsRefineryPanelHtmlFragment016,
} from './eta-templates.ts';
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
  if (!data) return renderRefineryControlsRefineryPanelHtmlFragment001();
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
    .map((captainId) =>
      renderRefineryControlsRefineryPanelHtmlFragment002({
        NumberIsFinite: legacyHtml(Number.isFinite(choice2.n) ? choice2.n : '?'),
        choice2Grade: choice2.grade,
        title: title(captainId),
        have: legacyHtml(have(captainId)),
      }),
    )
    .join(' + ');
  return renderRefineryControlsRefineryPanelHtmlFragment003({
    dataHome: legacyHtml(data.home ? ' · YOUR STATION' : ''),
    RECIPESMap: legacyHtml(
      RECIPES.map((recipe2) =>
        renderRefineryControlsRefineryPanelHtmlFragment004({
          recipe2Id: legacyHtml(recipe2.id),
          recipe2Id2: legacyHtml(recipe2.id === draft.recipe ? ' selected' : ''),
          recipe2Name: recipe2.name,
        }),
      ).join(''),
    ),
    recipePure: legacyHtml(recipe.pure || recipe.inputs[0] === 'plasma' ? ' disabled' : ''),
    common: legacyHtml(
      ['common', 'rich', 'pure']
        .map((game) =>
          renderRefineryControlsRefineryPanelHtmlFragment005({
            game: legacyHtml(game === choice2.grade ? ' selected' : ''),
            game2: legacyHtml(game),
          }),
        )
        .join(''),
    ),
    recipeInputsLength: legacyHtml(recipe.inputs.length > 1 ? 'Tonnes of each material' : 'Tonnes'),
    recipePure2: legacyHtml(recipe.pure ? 3 : 1),
    MathFloor: legacyHtml(
      Math.floor(
        (choice2.mode === 'instant' ? refineryRules.instantCap : refineryRules.storedCap) /
          recipe.inputs.length,
      ),
    ),
    recipePure3: legacyHtml(recipe.pure ? 3 : 1),
    draftN: draft.n,
    choice2Mode: legacyHtml(choice2.mode === 'stored' ? ' selected' : ''),
    choice2Mode2: legacyHtml(choice2.mode === 'instant' ? ' selected' : ''),
    inputs: legacyHtml(inputs),
    recipePure4: legacyHtml(
      recipe.pure ? renderRefineryControlsRefineryPanelHtmlFragment006() : '',
    ),
    premium: legacyHtml(premium ? renderRefineryControlsRefineryPanelHtmlFragment007() : ''),
    reserved: legacyHtml(reserved ? renderRefineryControlsRefineryPanelHtmlFragment008() : ''),
    valid: legacyHtml(
      !valid(choice2)
        ? renderRefineryControlsRefineryPanelHtmlFragment009()
        : !enough
          ? renderRefineryControlsRefineryPanelHtmlFragment010()
          : '',
    ),
    refineryQuote2: legacyHtml(
      refineryQuote2
        ? renderRefineryControlsRefineryPanelHtmlFragment011({
            refineryQuote2Units: legacyHtml(
              (refineryQuote2.units / refineryRules.units).toFixed(3),
            ),
            title: title(refineryQuote2.output),
            refineryQuote2Mode: legacyHtml(
              refineryQuote2.mode === 'instant'
                ? 'ready to collect now'
                : `ready in about ${Math.ceil((refineryQuote2.duration + refineryRules.queueMs) / 60000)} min`,
            ),
            refineryQuote2FeeToLocaleString: legacyHtml(refineryQuote2.fee.toLocaleString()),
            refineryClientStateYou: legacyHtml(
              refineryClientState.you!.credits < refineryQuote2.fee ? ' · not enough credits' : '',
            ),
            refineryQuote2Recovery: legacyHtml(refineryQuote2.recovery),
            refineryQuote2Mode2: legacyHtml(
              refineryQuote2.mode === 'stored'
                ? ` You can cancel during the first 30 seconds for ${refineryQuote2.cancelFee} credits.`
                : '',
            ),
          })
        : renderRefineryControlsRefineryPanelHtmlFragment012({
            refineryClientStateRefineryCostError: legacyHtml(
              refineryClientState.refineryCostError
                ? 'Could not load the current cost. Try again when connected.'
                : 'Checking the current cost…',
            ),
          }),
    ),
    refineryClientStatePaused: legacyHtml(
      refineryClientState.paused ? renderRefineryControlsRefineryPanelHtmlFragment013() : '',
    ),
    refineryQuote22: legacyHtml(
      refineryQuote2
        ? renderRefineryControlsRefineryPanelHtmlAttribute001({
            refineryQuote2Id: refineryQuote2.id,
          })
        : '',
    ),
    ready: legacyHtml(ready ? '' : ' disabled'),
    refineryClientStateRefineryBusy: legacyHtml(
      refineryClientState.refineryBusy
        ? 'STARTING…'
        : refineryQuote2
          ? `START REFINING · ${refineryQuote2.fee.toLocaleString()} CR`
          : 'START REFINING',
    ),
    refineryClientStateRefineryCostError: legacyHtml(
      refineryClientState.refineryCostError
        ? renderRefineryControlsRefineryPanelHtmlFragment014()
        : '',
    ),
    dataOffersMap: legacyHtml(
      data.offers
        .map((miningOrder) =>
          renderRefineryControlsRefineryPanelHtmlFragment015({
            miningOrderQty: legacyHtml(miningOrder.qty),
            miningOrderGrade: miningOrder.grade,
            title: title(miningOrder.cid),
            miningOrderRewardToLocaleString: legacyHtml(miningOrder.reward.toLocaleString()),
            miningOrderId: miningOrder.id,
            miningOrderPort: miningOrder.port,
          }),
        )
        .join('') || renderRefineryControlsRefineryPanelHtmlFragment016(),
    ),
    jobs: legacyHtml(jobs),
  });
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
