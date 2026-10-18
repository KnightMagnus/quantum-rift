// One live history, projected from its existing console. Sending and channel routes stay unchanged.
export function initChatProjection(G) {
  const byId = (id) => document.getElementById(id);
  const consoleChat = byId('consolechat');
  const home = byId('chat');
  const log = byId('chatlog');
  const panel = byId('chatprojection');
  const toggle = byId('chatexpand');
  const parked = document.createElement('div');
  parked.className = 'chat-projector-status';
  parked.innerHTML = '<span aria-hidden="true">◇</span> HISTORY PROJECTED ABOVE';
  let open = false;

  function blocked() {
    return (
      !G.you ||
      [...document.querySelectorAll('.overlay:not(.hidden)')].some((el) => el.id !== 'land')
    );
  }
  function position() {
    if (!open) return;
    const atBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 4;
    const anchor = consoleChat.getBoundingClientRect();
    const cockpit = byId('cockpit').getBoundingClientRect();
    const right = Math.min(innerWidth - 12, cockpit.right - 8);
    const left = Math.max(12, Math.min(anchor.left, right - 160));
    const width = Math.max(0, Math.min(anchor.width, right - left));
    const bottom = Math.min(innerHeight - 90, anchor.top + 6);
    const height = Math.max(0, Math.min(420, bottom - Math.max(12, innerHeight * 0.38)));
    // A heavily scrolled/shrunken console must never strand an offscreen projection.
    if (
      width < 140 ||
      height < 100 ||
      anchor.right <= cockpit.left ||
      anchor.left >= cockpit.right
    ) {
      setOpen(false);
      return;
    }
    panel.style.left = left + 'px';
    panel.style.top = bottom - height + 'px';
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function setOpen(value, restoreFocus = false) {
    if (value && blocked()) return;
    const atBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 4;
    const scroll = log.scrollTop;
    const hadFocus = log.contains(document.activeElement);
    open = value;
    if (open) {
      home.append(parked);
      panel.insertBefore(log, panel.querySelector('.projection-footer'));
    } else {
      home.append(log);
      parked.remove();
    }
    panel.classList.toggle('hidden', !open);
    consoleChat.classList.toggle('chat-projected', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Collapse chat history' : 'Expand chat history');
    toggle.title = open
      ? 'Collapse chat history (Escape)'
      : 'Project chat history above the console';
    toggle.querySelector('[aria-hidden]').textContent = open ? '⌄' : '⌃';
    toggle.querySelector('.chat-toggle-label').textContent = open ? 'COLLAPSE' : 'EXPAND';
    if (open) position();
    log.scrollTop = atBottom ? log.scrollHeight : scroll;
    if (restoreFocus) toggle.focus({ preventScroll: true });
    else if (hadFocus) log.focus({ preventScroll: true });
  }
  toggle.onclick = () => setOpen(!open);
  // Keep button activation and history navigation out of the flight shortcuts.
  panel.addEventListener('keydown', (e) => {
    if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key))
      e.stopPropagation();
  });
  const observer = new ResizeObserver(position);
  observer.observe(consoleChat);
  observer.observe(byId('cockpit'));
  byId('cockpit').addEventListener('scroll', position, { passive: true });
  window.addEventListener('resize', position);
  return {
    isOpen: () => open,
    collapse: () => setOpen(false, true),
    refresh() {
      if (!open) return;
      if (blocked()) setOpen(false);
      else position();
    },
  };
}
