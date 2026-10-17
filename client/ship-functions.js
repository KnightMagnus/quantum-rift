// Presentation only: actions keep their existing authoritative message/input routes.
export function initShipFunctions(G, send) {
  const stack = document.getElementById('functionstack');
  document.getElementById('chatlog').addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(e.key))
      e.stopPropagation();
  });
  const entries = [];
  const dock = document.getElementById('functiondock');
  const consoleChat = document.getElementById('consolechat');
  consoleChat.append(document.getElementById('chat'), document.getElementById('cbar'));
  document.getElementById('consoleutilities').append(document.querySelector('.cbtns'));
  let identity;
  let droneUntil = 0;
  const flying = () => !!G.you && !!G.view && !G.landed && !G.you.shipless;
  const hasDrones = () =>
    Object.keys(G.you?.shipStats?.weapons || {}).some((w) => G.A?.weapons[w]?.type === 'bay');
  const hasFleet = () =>
    G.you?.docks?.list[G.you.docks.active]?.wings.some(Boolean) ||
    hasDrones() ||
    (G.order && G.order !== 'gather');
  function register({ id, name, panel, available, existing = false, icon = id }) {
    const row = document.createElement('div');
    row.className = 'function-entry';
    const button = existing
      ? document.getElementById(id + 'indicator')
      : document.createElement('button');
    button.id = id + 'indicator';
    button.classList.add('function-icon');
    button.setAttribute('aria-label', name + ' controls');
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    if (!existing) {
      button.innerHTML = '<img src="assets/hud/' + icon + '.svg" alt="" aria-hidden="true">';
      const header = document.createElement('header');
      const title = document.createElement('strong');
      title.textContent = name;
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
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close.click();
        }
      });
    }
    function setOpen(open) {
      panel.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', String(open));
    }
    panel.classList.add('function-panel');
    button.title = name;
    const label = document.createElement('span');
    label.className = 'function-label';
    label.textContent =
      { 'Fleet / Formation': 'Fleet', Processing: 'Process', Towing: 'Tow' }[name] || name;
    button.append(label);
    dock.append(button);
    row.append(panel);
    stack.append(row);
    entries.push({ button, panel, available, existing, setOpen });
  }
  register({
    id: 'combat',
    name: 'Combat',
    panel: document.getElementById('combatcontrols'),
    available: flying,
  });
  register({
    id: 'mining',
    name: 'Mining',
    panel: document.getElementById('miningcontrols'),
    available: flying,
    existing: true,
  });
  register({
    id: 'towing',
    name: 'Towing',
    panel: document.getElementById('towcontrols'),
    available: () =>
      flying() && !!(G.towing?.rig || G.towing?.attached || G.towing?.offers?.length),
  });
  register({
    id: 'industrial',
    name: 'Processing',
    icon: 'processing',
    panel: document.getElementById('industrialcontrols'),
    available: () => flying() && G.you.ship?.hull === 815,
  });
  const fleet = document.createElement('div');
  fleet.id = 'fleetcontrols';
  for (const [o, label] of [
    ['attack', 'Attack target'],
    ['gather', 'Form up'],
    ['hold', 'Hold position'],
    ['holdfire', 'Hold fire'],
    ['loot', 'Collect loot'],
  ]) {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = label;
    b.dataset.order = o;
    b.onclick = () => {
      if (flying() && !G.paused && hasFleet()) send({ t: 'order', o });
    };
    fleet.append(b);
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
    if (flying() && !G.paused && hasDrones()) droneUntil = performance.now() + 150;
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
  for (const [id, label] of [
    ['hailindicator', 'Hail'],
    ['cbmap', 'Map'],
  ]) {
    const button = document.getElementById(id);
    button.classList.add('function-icon');
    if (id === 'cbmap')
      button.innerHTML =
        '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 6l8-3 10 3 8-3v23l-8 3-10-3-8 3zM11 3v23M21 6v23" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    const text = document.createElement('span');
    text.className = 'function-label';
    text.textContent = label;
    button.append(text);
    dock.append(button);
  }
  dock.addEventListener('keydown', (e) => {
    if (['Enter', ' '].includes(e.key)) e.stopPropagation();
  });
  stack.addEventListener('keydown', (e) => {
    if (
      ['Enter', ' '].includes(e.key) &&
      ['BUTTON', 'SUMMARY', 'INPUT', 'SELECT'].includes(e.target.tagName)
    )
      e.stopPropagation();
  });
  return {
    secondary: () => performance.now() < droneUntil && flying() && !G.paused && hasDrones(),
    refresh() {
      const logged = !!G.you && document.getElementById('login').classList.contains('hidden');
      const next = G.you ? G.you.name + ':' + G.you.ship?.hull + ':' + G.myId : null;
      for (const e of entries) {
        if (e.existing) continue;
        const available = logged && e.available();
        e.button.classList.toggle('hidden', !logged);
        e.button.disabled = !available;
        e.button.setAttribute('aria-disabled', String(!available));
        e.button.title = available
          ? e.button.getAttribute('aria-label')
          : e.button.getAttribute('aria-label') + ' — unavailable';
        if (!available || identity !== next) e.setOpen(false);
        e.panel.hidden = false; // Visibility belongs to the registry, not former nested hosts.
      }
      document.getElementById('combatindicator').classList.toggle('active', !!G.combat?.on);
      if (identity !== next || !flying()) droneUntil = 0;
      identity = next;
    },
  };
}
