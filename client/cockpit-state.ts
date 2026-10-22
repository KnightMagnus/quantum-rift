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
export function initCockpitState(G: CockpitState) {
  let owner: string | null = null,
    key: string | null = null,
    scroll: Record<string, number> = {},
    timer: ReturnType<typeof setTimeout> | undefined;
  const write = () => {
    if (!key) return;
    const values = Object.fromEntries(
      fields.filter((f) => ['string', 'boolean'].includes(typeof G[f])).map((f) => [f, G[f]]),
    );
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, values, lastTab: G.lastTab || {}, scroll }),
      );
    } catch {}
  };
  function remember() {
    clearTimeout(timer);
    timer = setTimeout(write, 100);
  }
  function load() {
    const name = G.you?.name;
    if (!name || name === owner) return false;
    write();
    clearTimeout(timer);
    owner = name;
    key = 'rift.cockpit.' + name.toLowerCase();
    for (const f of fields) delete G[f];
    G.ctab = 'missions';
    G.lastTab = {};
    G.ltab = null;
    G._landedAt = null;
    G._mhtml = null;
    scroll = {};
    for (const el of document.querySelectorAll<HTMLElement>('[data-view-key]')) {
      delete el.dataset.viewKey;
      el.scrollTop = 0;
    }
    try {
      const data: SavedCockpitState | null = JSON.parse(localStorage.getItem(key)!);
      if (data?.version === 1) {
        for (const f of fields) {
          const value = data.values?.[f];
          if (typeof value === 'boolean' || (typeof value === 'string' && value.length <= 160))
            (G as Partial<Record<(typeof fields)[number], string | boolean>>)[f] = value;
        }
        if (!tabs.includes(G.ctab!)) G.ctab = 'missions';
        for (const [port, tab] of Object.entries(data.lastTab || {}).slice(-150))
          if (typeof tab === 'string' && tab.length < 40) G.lastTab[port] = tab;
        for (const [view, top] of Object.entries(data.scroll || {}).slice(-150))
          if (Number.isFinite(top) && (top as number) >= 0)
            scroll[view] = Math.min(top as number, 100000);
      }
    } catch {}
    return true;
  }
  function capture(el: HTMLElement | null) {
    if (el?.dataset.viewKey && el.clientHeight) scroll[el.dataset.viewKey] = el.scrollTop;
  }
  function replace(el: HTMLElement, html: string, view: string) {
    capture(el);
    const active = el.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const id = active?.id;
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
          .filter((a) => active.hasAttribute(a))
          .map((a) => `[${a}="${CSS.escape(active.getAttribute(a)!)}"]`)
          .join('')
      : '';
    const selector = id ? '#' + CSS.escape(id) : selectors;
    el.innerHTML = html;
    el.dataset.viewKey = view;
    el.scrollTop = scroll[view] || 0;
    // Restore only a control that already owned focus; background updates never take flight focus.
    if (selector) el.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
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
    key = null;
    scroll = {};
  }
  return { load, remember, capture, replace, reset };
}
