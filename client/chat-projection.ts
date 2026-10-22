import { renderChatProjectionInitChatProjectionFragment001 } from './eta-templates.ts';
// One live history, projected from its existing console. Sending and channel routes stay unchanged.
export function initChatProjection(game: { you?: unknown }) {
  const byIdentifier = (identifier: string) => document.getElementById(identifier)!;
  const consoleChat = byIdentifier('consolechat');
  const home = byIdentifier('chat');
  const htmlElement2 = byIdentifier('chatlog');
  const panel = byIdentifier('chatprojection');
  const toggle = byIdentifier('chatexpand');
  const parked = document.createElement('div');
  parked.className = 'chat-projector-status';
  parked.innerHTML = renderChatProjectionInitChatProjectionFragment001();
  let open = false;

  function blocked() {
    return (
      !game.you ||
      [...document.querySelectorAll<HTMLElement>('.overlay:not(.hidden)')].some(
        (htmlElement) => htmlElement.id !== 'land',
      )
    );
  }
  function position() {
    if (!open) return;
    const atBottom =
      htmlElement2.scrollHeight - htmlElement2.clientHeight - htmlElement2.scrollTop < 4;
    const anchor = consoleChat.getBoundingClientRect();
    const cockpit = byIdentifier('cockpit').getBoundingClientRect();
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
    if (atBottom) htmlElement2.scrollTop = htmlElement2.scrollHeight;
  }
  function setOpen(value: boolean, restoreFocus = false) {
    if (value && blocked()) return;
    const atBottom =
      htmlElement2.scrollHeight - htmlElement2.clientHeight - htmlElement2.scrollTop < 4;
    const scroll = htmlElement2.scrollTop;
    const hadFocus = htmlElement2.contains(document.activeElement);
    open = value;
    if (open) {
      home.append(parked);
      panel.insertBefore(htmlElement2, panel.querySelector<HTMLElement>('.projection-footer'));
    } else {
      home.append(htmlElement2);
      parked.remove();
    }
    panel.classList.toggle('hidden', !open);
    consoleChat.classList.toggle('chat-projected', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Collapse chat history' : 'Expand chat history');
    toggle.title = open
      ? 'Collapse chat history (Escape)'
      : 'Project chat history above the console';
    toggle.querySelector<HTMLElement>('[aria-hidden]')!.textContent = open ? '⌄' : '⌃';
    toggle.querySelector<HTMLElement>('.chat-toggle-label')!.textContent = open
      ? 'COLLAPSE'
      : 'EXPAND';
    if (open) position();
    htmlElement2.scrollTop = atBottom ? htmlElement2.scrollHeight : scroll;
    if (restoreFocus) toggle.focus({ preventScroll: true });
    else if (hadFocus) htmlElement2.focus({ preventScroll: true });
  }
  toggle.onclick = () => setOpen(!open);
  // Keep button activation and history navigation out of the flight shortcuts.
  panel.addEventListener('keydown', (keyboardEvent) => {
    if (
      ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(
        keyboardEvent.key,
      )
    )
      keyboardEvent.stopPropagation();
  });
  const observer = new ResizeObserver(position);
  observer.observe(consoleChat);
  observer.observe(byIdentifier('cockpit'));
  byIdentifier('cockpit').addEventListener('scroll', position, { passive: true });
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
