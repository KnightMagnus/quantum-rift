// Device-level layout preferences, like the existing sidebar width preference.
export function initSidebarSize(resized) {
  const hud = document.getElementById('hud');
  let preferences = {};
  try {
    const saved = JSON.parse(localStorage.getItem('rift.hudHeights'));
    for (const name of ['radar', 'menu'])
      if (Number.isFinite(saved?.[name]) && saved[name] > 0) preferences[name] = saved[name];
  } catch {}
  const parts = [
    {
      name: 'radar',
      target: document.getElementById('radarwrap'),
      grip: document.getElementById('radarheightgrip'),
      min: 96,
    },
    {
      name: 'menu',
      target: document.getElementById('cpanel'),
      grip: document.getElementById('menuheightgrip'),
      min: 180,
    },
  ];
  const scale = () => hud.getBoundingClientRect().height / hud.offsetHeight || 1;
  const limit = (part) => Math.max(part.min, Math.floor((innerHeight / scale()) * 0.8));
  function apply() {
    for (const part of parts) {
      const height = preferences[part.name];
      const value = Number.isFinite(height)
        ? Math.max(part.min, Math.min(limit(part), height))
        : null;
      part.target.classList.toggle('custom-height', value !== null);
      if (value !== null) part.target.style.height = value + 'px';
      else part.target.style.removeProperty('height');
      part.grip.setAttribute('aria-valuemin', part.min);
      part.grip.setAttribute('aria-valuemax', limit(part));
      part.grip.setAttribute('aria-valuenow', Math.round(part.target.offsetHeight));
      part.grip.setAttribute(
        'aria-valuetext',
        value === null ? 'Automatic height' : Math.round(value) + ' pixels',
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
          ? part.min
          : event.key === 'End'
            ? limit(part)
            : part.target.offsetHeight + (event.key === 'ArrowUp' ? -16 : 16);
      preferences[part.name] = Math.max(part.min, Math.min(limit(part), next));
      apply();
      save();
    });
    part.grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const start = event.clientY,
        height = part.target.offsetHeight,
        zoom = scale();
      part.grip.setPointerCapture(event.pointerId);
      part.grip.classList.add('drag');
      const move = (moveEvent) => {
        preferences[part.name] = Math.max(
          part.min,
          Math.min(limit(part), height + (moveEvent.clientY - start) / zoom),
        );
        apply();
      };
      const end = () => {
        part.grip.classList.remove('drag');
        part.grip.removeEventListener('pointermove', move);
        part.grip.removeEventListener('pointerup', end);
        part.grip.removeEventListener('pointercancel', end);
        save();
      };
      part.grip.addEventListener('pointermove', move);
      part.grip.addEventListener('pointerup', end);
      part.grip.addEventListener('pointercancel', end);
    });
  }
  new ResizeObserver(apply).observe(hud);
  window.addEventListener('resize', apply);
  apply();
}
