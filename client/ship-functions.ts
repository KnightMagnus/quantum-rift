interface ShipFunctionState {
  you?: {
    name: string;
    shipless?: boolean;
    ship?: { hull: number | string };
    shipStats?: { weapons?: Record<string, number> } | null;
    docks?: { list: Array<{ wings: unknown[] }>; active: number };
  } | null;
  view?: unknown;
  landed?: unknown;
  A?: { weapons: Record<string, { type: string }> } | null;
  order?: string;
  paused?: boolean;
  towing?: { rig?: unknown; attached?: unknown; offers?: unknown[] } | null;
  sys?: string | null;
  myId: number;
  combat?: { on?: boolean } | null;
}
interface FunctionEntry {
  button: HTMLButtonElement;
  panel: HTMLElement;
  available: () => unknown;
  existing: boolean;
  setOpen: (open: boolean) => void;
}
interface FunctionRegistration {
  id: string;
  name: string;
  panel: HTMLElement;
  available: () => unknown;
  existing?: boolean;
  icon?: string;
}
// Presentation only: actions keep their existing authoritative message/input routes.
export function initShipFunctions(
  shipFunctionState: ShipFunctionState,
  send: (message: object) => void,
) {
  const stack = document.getElementById('functionstack')!;
  document.getElementById('chatlog')!.addEventListener('keydown', (keyboardEvent) => {
    if (
      ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(keyboardEvent.key)
    )
      keyboardEvent.stopPropagation();
  });
  const entries: FunctionEntry[] = [];
  const dock = document.getElementById('functiondock')!;
  const consoleChat = document.getElementById('consolechat')!;
  consoleChat.append(document.getElementById('chat')!, document.getElementById('cbar')!);
  document
    .getElementById('consoleutilities')!
    .append(document.querySelector<HTMLElement>('.cbtns')!);
  for (const [identifier, name] of [
    ['optbtn', 'SETTINGS'],
    ['cbhelp', 'HELP'],
  ]) {
    const button = document.getElementById(identifier)!;
    if (!button.querySelector<HTMLElement>('.utility-label')) {
      const label = document.createElement('span');
      label.className = 'utility-label';
      label.textContent = name;
      button.append(label);
    }
  }
  let identity: string | null | undefined, sector: string | null | undefined;
  let droneUntil = 0;
  const flying = () =>
    !!shipFunctionState.you &&
    !!shipFunctionState.view &&
    !shipFunctionState.landed &&
    !shipFunctionState.you!.shipless;
  const hasDrones = () =>
    Object.keys(shipFunctionState.you?.shipStats?.weapons || {}).some(
      (width) => shipFunctionState.A?.weapons[width]?.type === 'bay',
    );
  const hasFleet = () =>
    shipFunctionState.you?.docks?.list[shipFunctionState.you!.docks.active]?.wings.some(Boolean) ||
    hasDrones() ||
    (shipFunctionState.order && shipFunctionState.order !== 'gather');
  function register({
    id: identifier,
    name,
    panel,
    available,
    existing = false,
    icon = identifier,
  }: FunctionRegistration) {
    const htmlDivElement = document.createElement('div');
    htmlDivElement.className = 'function-entry';
    const button = existing
      ? (document.getElementById(identifier + 'indicator')! as HTMLButtonElement)
      : document.createElement('button');
    button.id = identifier + 'indicator';
    button.classList.add('function-icon');
    button.setAttribute('aria-label', name + ' controls');
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    if (!existing) {
      button.innerHTML = '<img src="assets/hud/' + icon + '.svg" alt="" aria-hidden="true">';
      const header = document.createElement('header');
      const title = document.createElement('strong');
      title.textContent = name === 'Combat' ? 'Combat assist' : name;
      const close = document.createElement('button');
      close.className = 'btn sm';
      close.textContent = 'Close';
      close.setAttribute('aria-label', 'Close ' + name.toLowerCase() + ' controls');
      header.append(title, close);
      panel.prepend(header);
      button.onclick = () => {
        setOpen(button.getAttribute('aria-expanded') !== 'true');
        if (button.getAttribute('aria-expanded') === 'true') close.focus();
      };
      close.onclick = () => {
        setOpen(false);
        button.focus();
      };
      panel.addEventListener('keydown', (keyboardEvent) => {
        if (keyboardEvent.key === 'Escape') {
          keyboardEvent.stopPropagation();
          close.click();
        }
      });
    }
    function setOpen(open: boolean) {
      panel.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', String(open));
    }
    panel.classList.add('function-panel');
    const body = document.createElement('div');
    body.className = 'function-body';
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const child of [...panel.childNodes]) if (child.nodeName !== 'HEADER') body.append(child);
    panel.append(body);
    button.title = name;
    const label = document.createElement('span');
    label.className = 'function-label';
    label.textContent =
      (
        { 'Fleet / Formation': 'Fleet', Processing: 'Process', Towing: 'Tow' } as Record<
          string,
          string
        >
      )[name] || name;
    button.append(label);
    dock.append(button);
    htmlDivElement.append(panel);
    stack.append(htmlDivElement);
    entries.push({ button, panel, available, existing, setOpen });
  }
  register({
    id: 'combat',
    name: 'Combat',
    panel: document.getElementById('combatcontrols')!,
    available: flying,
  });
  register({
    id: 'mining',
    name: 'Mining',
    panel: document.getElementById('miningcontrols')!,
    available: flying,
    existing: true,
  });
  register({
    id: 'towing',
    name: 'Towing',
    panel: document.getElementById('towcontrols')!,
    available: () =>
      flying() &&
      !!(
        shipFunctionState.towing?.rig ||
        shipFunctionState.towing?.attached ||
        shipFunctionState.towing?.offers?.length
      ),
  });
  register({
    id: 'industrial',
    name: 'Processing',
    icon: 'processing',
    panel: document.getElementById('industrialcontrols')!,
    available: () => flying() && shipFunctionState.you!.ship?.hull === 815,
  });
  const fleet = document.createElement('div');
  fleet.id = 'fleetcontrols';
  for (const [options, label] of [
    ['attack', 'Attack target'],
    ['gather', 'Form up'],
    ['hold', 'Hold position'],
    ['holdfire', 'Hold fire'],
    ['loot', 'Collect loot'],
  ]) {
    const htmlButtonElement = document.createElement('button');
    htmlButtonElement.className = 'btn sm';
    htmlButtonElement.textContent = label;
    htmlButtonElement.dataset.order = options;
    htmlButtonElement.onclick = () => {
      if (flying() && !shipFunctionState.paused && hasFleet()) send({ t: 'order', o: options });
    };
    fleet.append(htmlButtonElement);
  }
  register({
    id: 'fleet',
    name: 'Fleet / Formation',
    panel: fleet,
    available: () => flying() && hasFleet(),
  });
  const drones = document.createElement('div');
  drones.id = 'dronecontrols';
  const launch = document.createElement('button');
  launch.id = 'dronetoggle';
  launch.className = 'btn sm';
  launch.textContent = 'Launch / recall drones';
  launch.onclick = () => {
    if (flying() && !shipFunctionState.paused && hasDrones()) droneUntil = performance.now() + 150;
  };
  const note = document.createElement('p');
  note.textContent =
    'Uses secondary fire, just like the bound flight key. Other fitted secondary weapons also fire.';
  drones.append(launch, note);
  register({
    id: 'drones',
    name: 'Drones',
    panel: drones,
    available: () => flying() && hasDrones(),
  });
  for (const [identifier, label] of [
    ['hailindicator', 'Hail'],
    ['cbmap', 'Map'],
  ]) {
    const button = document.getElementById(identifier)!;
    button.classList.add('function-icon');
    if (identifier === 'cbmap')
      button.innerHTML =
        '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 6l8-3 10 3 8-3v23l-8 3-10-3-8 3zM11 3v23M21 6v23" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    const text = document.createElement('span');
    text.className = 'function-label';
    text.textContent = label;
    button.append(text);
    dock.append(button);
  }
  for (const identifier of [
    'combatindicator',
    'miningindicator',
    'towingindicator',
    'fleetindicator',
    'dronesindicator',
    'industrialindicator',
    'hailindicator',
    'cbmap',
  ])
    dock.append(document.getElementById(identifier)!);
  dock.addEventListener('keydown', (keyboardEvent) => {
    if (['Enter', ' '].includes(keyboardEvent.key)) keyboardEvent.stopPropagation();
  });
  stack.addEventListener('keydown', (keyboardEvent) => {
    if (
      ['Enter', ' '].includes(keyboardEvent.key) &&
      ['BUTTON', 'SUMMARY', 'INPUT', 'SELECT'].includes(
        (keyboardEvent.target as HTMLElement).tagName,
      )
    )
      keyboardEvent.stopPropagation();
  });
  return {
    secondary: () =>
      performance.now() < droneUntil && flying() && !shipFunctionState.paused && hasDrones(),
    refresh() {
      if (sector !== shipFunctionState.sys) {
        sector = shipFunctionState.sys;
        document.getElementById('commssector')!.textContent =
          'COMMS / ' +
          (shipFunctionState.sys || 'SHIP NETWORK').toUpperCase() +
          (shipFunctionState.sys ? ' SECTOR' : '');
      }
      const logged =
        !!shipFunctionState.you && document.getElementById('login')!.classList.contains('hidden');
      const next = shipFunctionState.you
        ? shipFunctionState.you!.name +
          ':' +
          shipFunctionState.you!.ship?.hull +
          ':' +
          shipFunctionState.myId
        : null;
      for (const functionEntry of entries) {
        if (functionEntry.existing) continue;
        const available = logged && functionEntry.available();
        functionEntry.button.classList.toggle('hidden', !logged);
        functionEntry.button.disabled = !available;
        functionEntry.button.setAttribute('aria-disabled', String(!available));
        functionEntry.button.title = available
          ? functionEntry.button.getAttribute('aria-label')!
          : functionEntry.button.getAttribute('aria-label') + ' — unavailable';
        if (!available || identity !== next) functionEntry.setOpen(false);
        functionEntry.panel.hidden = false; // The registry owns panel visibility.
      }
      document
        .getElementById('combatindicator')!
        .classList.toggle('active', !!shipFunctionState.combat?.on);
      if (identity !== next || !flying()) droneUntil = 0;
      identity = next;
    },
  };
}
