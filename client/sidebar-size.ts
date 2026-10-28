// Device-level layout preferences, like the existing sidebar width preference.
// The minimap starts square until the player explicitly resizes its height.
export function initSidebarSize(resized: () => void) {
  const sidebar = document.getElementById('hud')!;
  let preferences: Record<string, number> = {};
  try {
    const saved = JSON.parse(localStorage.getItem('rift.hudHeights') || 'null');
    for (const name of ['radar', 'menu'])
      if (Number.isFinite(saved?.[name]) && saved[name] > 0) preferences[name] = saved[name];
  } catch {}
  let allocation = preferences.menu === undefined ? 'radar' : 'menu';
  const radar = document.getElementById('radarwrap')!;
  const menu = document.getElementById('cpanel')!;
  const parts = [
    {
      name: 'radar',
      target: radar,
      grip: document.getElementById('radarheightgrip')!,
      min: 96,
      direction: 1,
    },
    {
      name: 'menu',
      target: menu,
      grip: document.getElementById('menuheightgrip')!,
      min: 180,
      direction: -1,
    },
  ];
  const scale = () => sidebar.getBoundingClientRect().height / sidebar.offsetHeight || 1;
  // Reserve actual chrome, including wrapping tabs, instead of allowing two
  // independently clamped panels to exceed the available sidebar height.
  function available() {
    const style = getComputedStyle(sidebar);
    const siblings = [...sidebar.children].filter(
      (child) =>
        child !== radar && child !== menu && getComputedStyle(child).position !== 'absolute',
    );
    const fixed = siblings.reduce(
      (height, child) => height + (child as HTMLElement).offsetHeight,
      0,
    );
    return Math.max(
      96 + (preferences.menu === undefined ? 200 : 180),
      sidebar.clientHeight -
        fixed -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom) -
        parseFloat(style.rowGap) * (siblings.length + 1),
    );
  }
  const minimum = (part: (typeof parts)[number]) => part.min;
  const limit = (part: (typeof parts)[number]) =>
    Math.max(
      part.min,
      available() - (part.name === 'menu' ? 96 : preferences.menu === undefined ? 200 : 180),
    );
  function apply() {
    const room = available();
    const menuMinimum = preferences.menu === undefined ? 200 : 180;
    const sidebarStyle = getComputedStyle(sidebar);
    const frameWidth =
      sidebar.clientWidth -
      parseFloat(sidebarStyle.paddingLeft) -
      parseFloat(sidebarStyle.paddingRight);
    const desiredRadar = preferences.radar ?? frameWidth;
    const desiredMenu = preferences.menu;
    // Keep the automatic map square and reserve a usable menu on short screens.
    // Explicit height preferences survive temporary viewport limits.
    const allocatedRadarHeight =
      desiredMenu === undefined || allocation === 'radar'
        ? Math.max(96, Math.min(room - menuMinimum, desiredRadar))
        : Math.max(96, Math.min(room - menuMinimum, room - Math.max(menuMinimum, desiredMenu)));
    const radarHeight =
      preferences.radar === undefined
        ? Math.min(frameWidth, allocatedRadarHeight)
        : allocatedRadarHeight;
    const menuHeight =
      preferences.radar === undefined && desiredMenu !== undefined && allocation === 'menu'
        ? Math.max(menuMinimum, Math.min(room - radarHeight, desiredMenu))
        : Math.max(menuMinimum, room - radarHeight);
    document.getElementById('menuheightgrip')!.style.marginTop =
      Math.max(0, room - radarHeight - menuHeight) + 'px';
    radar.style.height = radarHeight + 'px';
    if (preferences.radar === undefined) {
      radar.style.width = Math.min(frameWidth, radarHeight) + 'px';
      radar.style.alignSelf = 'center';
    } else {
      radar.style.removeProperty('width');
      radar.style.removeProperty('align-self');
    }
    radar.classList.toggle(
      'custom-height',
      preferences.radar !== undefined || desiredMenu !== undefined || radarHeight < desiredRadar,
    );
    menu.style.minHeight = menuMinimum + 'px';
    menu.style.height = menuHeight + 'px';
    menu.classList.toggle('custom-height', desiredMenu !== undefined);
    for (const part of parts) {
      part.grip.setAttribute('aria-valuemin', String(minimum(part)));
      part.grip.setAttribute('aria-valuemax', String(Math.floor(limit(part))));
      part.grip.setAttribute('aria-valuenow', String(Math.round(part.target.offsetHeight)));
      part.grip.setAttribute(
        'aria-valuetext',
        preferences[part.name] === undefined
          ? 'Automatic height'
          : Math.round(part.target.offsetHeight) + ' pixels',
      );
    }
    resized();
  }
  function save() {
    try {
      localStorage.setItem('rift.hudHeights', JSON.stringify(preferences));
    } catch {}
  }
  for (const part of parts) {
    const reset = () => {
      delete preferences[part.name];
      allocation = preferences.menu === undefined ? 'radar' : 'menu';
      apply();
      save();
    };
    part.grip.addEventListener('dblclick', reset);
    part.grip.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter') return reset();
      const next =
        event.key === 'Home'
          ? minimum(part)
          : event.key === 'End'
            ? limit(part)
            : part.target.offsetHeight + (event.key === 'ArrowUp' ? -16 : 16) * part.direction;
      allocation = part.name;
      preferences[part.name] = Math.max(minimum(part), Math.min(limit(part), next));
      apply();
      save();
    });
    let endDrag: (() => void) | undefined;
    part.grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      endDrag?.();
      event.preventDefault();
      event.stopPropagation();
      const start = event.clientY,
        height = part.target.offsetHeight,
        zoom = scale();
      const pointer = event.pointerId;
      part.grip.setPointerCapture(pointer);
      part.grip.classList.add('drag');
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointer) return;
        allocation = part.name;
        preferences[part.name] = Math.max(
          minimum(part),
          Math.min(limit(part), height + (part.direction * (moveEvent.clientY - start)) / zoom),
        );
        apply();
      };
      const finish = (finishEvent?: Event) => {
        if (finishEvent instanceof PointerEvent && finishEvent.pointerId !== pointer) return;
        endDrag = undefined;
        part.grip.classList.remove('drag');
        part.grip.removeEventListener('pointermove', move);
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
          part.grip.removeEventListener(name, finish);
        if (part.grip.hasPointerCapture(pointer)) part.grip.releasePointerCapture(pointer);
        save();
      };
      endDrag = finish;
      part.grip.addEventListener('pointermove', move);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        part.grip.addEventListener(name, finish);
    });
  }
  const layoutObserver = new ResizeObserver(apply);
  layoutObserver.observe(sidebar);
  for (const child of sidebar.children)
    if (child !== radar && child !== menu) layoutObserver.observe(child);
  window.addEventListener('resize', apply);
  apply();
}
