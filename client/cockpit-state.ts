// Browser-only, per-captain presentation preferences. Never stores actions or changes a save.
const fields = [
  'ctab',
  'ctabSub',
  'itab',
  'stab',
  'ysort',
  'ocat',
  'ofit',
  'codexCat',
  'codexQuery',
  'pinnedObjective',
  'jobType',
  'jobFeasible',
  'jobNearby',
  'missionType',
  'missionFeasible',
  'missionNearby',
] as const;
const tabs = ['radio', 'codex', 'missions', 'station', 'ops', 'captains', 'log'];
type CockpitState = Partial<Record<(typeof fields)[number], string | boolean>> & {
  you?: { name?: string } | null;
  ctab?: string;
  lastTab?: Record<string, string>;
  ltab?: string | null;
  _landedAt?: string | null;
  _mhtml?: string | null;
};
interface SavedCockpitState {
  version?: number;
  values?: Record<string, unknown>;
  lastTab?: Record<string, unknown>;
  scroll?: Record<string, unknown>;
}
export function initCockpitState(cockpitState: CockpitState) {
  let owner: string | null = null,
    entryKey: string | null = null,
    scroll: Record<string, number> = {},
    timer: ReturnType<typeof setTimeout> | undefined;
  const write = () => {
    if (!entryKey) return;
    const values = Object.fromEntries(
      fields
        .filter((factionId) => ['string', 'boolean'].includes(typeof cockpitState[factionId]))
        .map((factionId) => [factionId, cockpitState[factionId]]),
    );
    try {
      localStorage.setItem(
        entryKey,
        JSON.stringify({ version: 1, values, lastTab: cockpitState.lastTab || {}, scroll }),
      );
    } catch {}
  };
  function remember() {
    clearTimeout(timer);
    timer = setTimeout(write, 100);
  }
  function load() {
    const name = cockpitState.you?.name;
    if (!name || name === owner) return false;
    write();
    clearTimeout(timer);
    owner = name;
    entryKey = 'rift.cockpit.' + name.toLowerCase();
    for (const field of fields) delete cockpitState[field];
    cockpitState.ctab = 'missions';
    cockpitState.lastTab = {};
    cockpitState.ltab = null;
    cockpitState._landedAt = null;
    cockpitState._mhtml = null;
    scroll = {};
    for (const htmlElement of document.querySelectorAll<HTMLElement>('[data-view-key]')) {
      delete htmlElement.dataset.viewKey;
      htmlElement.scrollTop = 0;
    }
    try {
      const data: SavedCockpitState | null = JSON.parse(localStorage.getItem(entryKey)!);
      if (data?.version === 1) {
        for (const field of fields) {
          const value = data.values?.[field];
          if (typeof value === 'boolean' || (typeof value === 'string' && value.length <= 160))
            (cockpitState as Partial<Record<(typeof fields)[number], string | boolean>>)[field] =
              value;
        }
        if (!tabs.includes(cockpitState.ctab!)) cockpitState.ctab = 'missions';
        for (const [port, activeTab] of Object.entries(data.lastTab || {}).slice(-150))
          if (typeof activeTab === 'string' && activeTab.length < 40)
            cockpitState.lastTab[port] = activeTab;
        for (const [view, topOffset] of Object.entries(data.scroll || {}).slice(-150))
          if (Number.isFinite(topOffset) && (topOffset as number) >= 0)
            scroll[view] = Math.min(topOffset as number, 100000);
      }
    } catch {}
    return true;
  }
  function capture(htmlElement: HTMLElement | null) {
    if (htmlElement?.dataset.viewKey && htmlElement.clientHeight)
      scroll[htmlElement.dataset.viewKey] = htmlElement.scrollTop;
  }
  function replace(htmlElement: HTMLElement, html: string, view: string) {
    capture(htmlElement);
    const active = htmlElement.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const identifier = active?.id;
    const attributes = [
      'data-pin',
      'data-plot',
      'data-act',
      'data-h',
      'data-c',
      'data-id',
      'data-k',
      'data-abandon',
      'data-mission-filter',
    ];
    const selectors = active
      ? attributes
          .filter((firstValue) => active.hasAttribute(firstValue))
          .map((firstValue) => `[${firstValue}="${CSS.escape(active.getAttribute(firstValue)!)}"]`)
          .join('')
      : '';
    const selector = identifier ? '#' + CSS.escape(identifier) : selectors;
    htmlElement.innerHTML = html;
    htmlElement.dataset.viewKey = view;
    htmlElement.scrollTop = scroll[view] || 0;
    // Restore only a control that already owned focus; background updates never take flight focus.
    if (selector) htmlElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    remember();
  }
  document.addEventListener(
    'scroll',
    (event) => {
      if ((event.target as HTMLElement | null)?.dataset?.viewKey) {
        capture(event.target as HTMLElement);
        remember();
      }
    },
    true,
  );
  for (const type of ['click', 'change', 'input'])
    document.addEventListener(type, () => queueMicrotask(remember));
  window.addEventListener('pagehide', write);
  function reset() {
    write();
    clearTimeout(timer);
    owner = null;
    entryKey = null;
    scroll = {};
  }
  return { load, remember, capture, replace, reset };
}
