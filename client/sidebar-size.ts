/** Discard retired manual map/menu heights; CSS owns automatic sidebar allocation. */
export function initSidebarSize() {
  try {
    localStorage.removeItem('rift.hudHeights');
  } catch {}
}
