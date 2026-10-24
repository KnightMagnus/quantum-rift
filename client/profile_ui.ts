import { PLAYER_PORTRAITS, playerPortrait, portraitAsset } from '../shared/portraits.ts';
import { artworkUrl } from './artwork.ts';

interface ProfileState {
  /** Latest authoritative private player projection. */
  you: { name: string; portraitId: string } | null;
}
/** Personal profile chooser uses a native modal, with server-confirmed saves only. */
export function initProfile(state: ProfileState, send: (message: object) => void) {
  const dialog = document.getElementById('profiledialog') as HTMLDialogElement;
  const choices = document.getElementById('portraitchoices')!;
  const preview = document.getElementById('portraitpreview') as HTMLImageElement;
  const status = document.getElementById('portraitstatus')!;
  const save = document.getElementById('portraitsave') as HTMLButtonElement;
  let selected = '',
    requestSequence = 0,
    previousFocus: HTMLElement | null = null;
  let pending: { requestId: string; timer: ReturnType<typeof setTimeout> } | null = null;
  const clearPending = () => {
    if (pending) clearTimeout(pending.timer);
    pending = null;
    save.disabled = false;
  };
  const showPreview = () => {
    preview.src = artworkUrl(portraitAsset(selected));
  };
  for (const portrait of PLAYER_PORTRAITS) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'portrait';
    radio.value = portrait.id;
    const image = document.createElement('img');
    image.src = artworkUrl(portraitAsset(portrait.id));
    image.alt = '';
    image.width = image.height = 80;
    image.loading = 'lazy';
    radio.onchange = () => {
      selected = portrait.id;
      showPreview();
      status.textContent = 'Preview — not saved.';
    };
    label.append(radio, image, document.createTextNode(portrait.label));
    choices.append(label);
  }
  function open() {
    if (!state.you || dialog.open) return;
    previousFocus = document.activeElement as HTMLElement | null;
    selected = playerPortrait(state.you.portraitId);
    showPreview();
    document.getElementById('profilename')!.textContent = state.you.name;
    for (const radio of choices.querySelectorAll<HTMLInputElement>('input'))
      radio.checked = radio.value === selected;
    status.textContent = 'Choose a portrait for your public profile and player hails.';
    dialog.showModal();
    choices.querySelector<HTMLInputElement>('input:checked')?.focus();
  }
  for (const id of ['profilebtn', 'landprofilebtn']) document.getElementById(id)!.onclick = open;
  document.getElementById('portraitclose')!.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    clearPending();
    previousFocus?.focus();
  });
  // The native top layer owns keys even when an ordinary game overlay remains underneath.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!dialog.open) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        dialog.close();
      }
    },
    true,
  );
  save.onclick = () => {
    if (!state.you || pending) return;
    const requestId = String(++requestSequence);
    pending = {
      requestId,
      timer: setTimeout(() => {
        clearPending();
        status.textContent = 'No confirmation received. Check your selection and try again.';
      }, 10000),
    };
    save.disabled = true;
    status.textContent = 'Saving…';
    send({ t: 'portrait', portraitId: selected, portraitRequestId: requestId });
  };
  return {
    reset() {
      clearPending();
      dialog.close();
      preview.removeAttribute('src');
      status.textContent = '';
    },
    onMessage(message: {
      t?: string;
      ok?: boolean;
      portraitId?: unknown;
      portraitRequestId?: unknown;
    }) {
      if (message.t !== 'portrait') return false;
      if (!pending || message.portraitRequestId !== pending.requestId) return true;
      clearPending();
      status.textContent = message.ok
        ? message.portraitId === selected
          ? 'Saved.'
          : 'Previous selection saved. Current preview is not saved.'
        : 'Portrait was not saved. Choose an available portrait.';
      return true;
    },
  };
}
