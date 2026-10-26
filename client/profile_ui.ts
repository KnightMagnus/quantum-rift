import { PLAYER_PORTRAITS, playerPortrait, portraitAsset } from '../shared/portraits.ts';
import { artworkUrl } from './artwork.ts';

interface ProfileState {
  /** Latest authoritative private player projection. */
  you: { name: string; portraitId: string } | null;
}
/** Captain-menu profile tab, with server-confirmed saves only. */
export function initProfile(state: ProfileState, send: (message: object) => void) {
  const panel = document.getElementById('captainprofile')!;
  const choices = document.getElementById('portraitchoices')!;
  const preview = document.getElementById('portraitpreview') as HTMLImageElement;
  const status = document.getElementById('portraitstatus')!;
  const save = document.getElementById('portraitsave') as HTMLButtonElement;
  let selected = '',
    requestSequence = 0,
    visible = false;
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
    // The source is assigned on open, once the server's artwork revision is known.
    image.dataset.portrait = portrait.id;
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
    if (!state.you || visible) return;
    visible = true;
    selected = playerPortrait(state.you.portraitId);
    showPreview();
    for (const image of choices.querySelectorAll<HTMLImageElement>('img[data-portrait]')) {
      const source = artworkUrl(portraitAsset(image.dataset.portrait));
      if (image.getAttribute('src') !== source) image.src = source;
    }
    document.getElementById('profilename')!.textContent = state.you.name;
    for (const radio of choices.querySelectorAll<HTMLInputElement>('input'))
      radio.checked = radio.value === selected;
    status.textContent = 'Choose a portrait for your public profile and player hails.';
    panel.classList.remove('hidden');
    choices.querySelector<HTMLInputElement>('input:checked')?.focus();
  }
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
    show: open,
    hide() {
      visible = false;
      panel.classList.add('hidden');
      clearPending();
    },
    reset() {
      clearPending();
      visible = false;
      panel.classList.add('hidden');
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
