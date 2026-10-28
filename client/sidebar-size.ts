// Device-level menu height preference; the minimap always follows the sidebar width.
export function initSidebarSize(resized: () => void) {
  const sidebar = document.getElementById('hud')!;
  const radar = document.getElementById('radarwrap')!;
  const menu = document.getElementById('cpanel')!;
  const grip = document.getElementById('menuheightgrip')!;
  let preferredMenu: number | undefined;
  try {
    const saved = JSON.parse(localStorage.getItem('rift.hudHeights') || 'null');
    if (Number.isFinite(saved?.menu) && saved.menu > 0) preferredMenu = saved.menu;
    // Discard retired map heights without changing the player's menu preference.
    if (saved && Object.hasOwn(saved, 'radar')) save();
  } catch {}
  const scale = () => sidebar.getBoundingClientRect().height / sidebar.offsetHeight || 1;
  function available() {
    const style = getComputedStyle(sidebar);
    const siblings = [...sidebar.children].filter((child) => {
      const childStyle = getComputedStyle(child);
      return (
        child !== radar &&
        child !== menu &&
        childStyle.position !== 'absolute' &&
        childStyle.display !== 'none'
      );
    });
    const fixed = siblings.reduce(
      (height, child) => height + (child as HTMLElement).offsetHeight,
      0,
    );
    return (
      sidebar.clientHeight -
      fixed -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom) -
      parseFloat(style.rowGap) * (siblings.length + 1)
    );
  }
  const minimum = 180;
  const limit = () => Math.max(minimum, available() - radar.offsetHeight);
  function apply() {
    // Short viewports scroll the sidebar instead of flattening or narrowing the map.
    const radarHeight = radar.offsetHeight;
    const room = available();
    const menuMinimum = preferredMenu === undefined ? 200 : minimum;
    const menuHeight = Math.max(
      menuMinimum,
      Math.min(room - radarHeight, preferredMenu ?? Infinity),
    );
    grip.style.marginTop = Math.max(0, room - radarHeight - menuHeight) + 'px';
    menu.style.minHeight = menuMinimum + 'px';
    menu.style.height = menuHeight + 'px';
    menu.classList.toggle('custom-height', preferredMenu !== undefined);
    grip.setAttribute('aria-valuemin', String(minimum));
    grip.setAttribute('aria-valuemax', String(Math.floor(Math.max(limit(), menu.offsetHeight))));
    grip.setAttribute('aria-valuenow', String(Math.round(menu.offsetHeight)));
    grip.setAttribute(
      'aria-valuetext',
      preferredMenu === undefined ? 'Automatic height' : Math.round(menu.offsetHeight) + ' pixels',
    );
    resized();
  }
  function save() {
    try {
      if (preferredMenu === undefined) localStorage.removeItem('rift.hudHeights');
      else localStorage.setItem('rift.hudHeights', JSON.stringify({ menu: preferredMenu }));
    } catch {}
  }
  const reset = () => {
    preferredMenu = undefined;
    apply();
    save();
  };
  grip.addEventListener('dblclick', reset);
  grip.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter') return reset();
    const next =
      event.key === 'Home'
        ? minimum
        : event.key === 'End'
          ? limit()
          : menu.offsetHeight + (event.key === 'ArrowUp' ? 16 : -16);
    preferredMenu = Math.max(minimum, Math.min(limit(), next));
    apply();
    save();
  });
  let endDrag: (() => void) | undefined;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    endDrag?.();
    event.preventDefault();
    event.stopPropagation();
    const start = event.clientY,
      height = menu.offsetHeight,
      zoom = scale();
    const pointer = event.pointerId;
    grip.setPointerCapture(pointer);
    grip.classList.add('drag');
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) return;
      preferredMenu = Math.max(
        minimum,
        Math.min(limit(), height - (moveEvent.clientY - start) / zoom),
      );
      apply();
    };
    const finish = (finishEvent?: Event) => {
      if (finishEvent instanceof PointerEvent && finishEvent.pointerId !== pointer) return;
      endDrag = undefined;
      grip.classList.remove('drag');
      grip.removeEventListener('pointermove', move);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        grip.removeEventListener(name, finish);
      if (grip.hasPointerCapture(pointer)) grip.releasePointerCapture(pointer);
      save();
    };
    endDrag = finish;
    grip.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      grip.addEventListener(name, finish);
  });
  const layoutObserver = new ResizeObserver(apply);
  layoutObserver.observe(sidebar);
  layoutObserver.observe(radar);
  for (const child of sidebar.children)
    if (child !== radar && child !== menu) layoutObserver.observe(child);
  window.addEventListener('resize', apply);
  apply();
}
